import * as path from "path";
import { parseJsonOutput, runOpenCode, TIMEOUT_MS } from "./helpers/opencode";
import { ConsumerProject, makeConsumerProject, SEARCH_TOOLS } from "./helpers/consumer";

const LSP_FIXTURE_DIR = path.resolve(__dirname, "fixtures/lsp-project");
const TOOL_SOURCE = path.resolve(__dirname, "../../dist/symbol-finder.js");
const SKILL_SOURCE = path.resolve(__dirname, "../../dist/skills/go-to-definition/SKILL.md");

const FORBIDDEN_TOOLS = SEARCH_TOOLS;

const WARMUP_MS = 120_000;

function warmUpLsp(dir: string): Promise<void> {
  const prompt =
    "Call the lsp tool with operation documentSymbol, filePath src/main.ts, " +
    "symbol calculateSum, fragment const total = calculateSum(5, 10). Then stop.";
  const warmup = runOpenCode(
    ["run", "--format", "json", "--dir", dir, `"${prompt}"`],
    { OPENCODE_EXPERIMENTAL_LSP_TOOL: "true" },
    WARMUP_MS - 5_000,
  ).then(
    () => undefined,
    () => undefined,
  );
  return Promise.race([
    warmup,
    new Promise<void>((resolve) => setTimeout(() => resolve(), WARMUP_MS)),
  ]);
}

describe("E2E: go-to-definition skill with symbol-finder and LSP", () => {
  let project: ConsumerProject | undefined;

  beforeAll(async () => {
    project = makeConsumerProject({
      trees: [{ from: LSP_FIXTURE_DIR, exclude: [".opencode", "opencode.json"] }],
      files: [
        { source: TOOL_SOURCE, target: ".opencode/tools/symbol-finder.js" },
        { source: SKILL_SOURCE, target: ".opencode/skills/go-to-definition/SKILL.md" },
      ],
    });
    await warmUpLsp(project.dir);
  }, TIMEOUT_MS);

  afterAll(() => {
    project?.cleanup();
  });

  it(
    "should find calculateSum definition using symbol-finder + lsp, without grep or other search tools",
    async () => {
      if (!project) {
        throw new Error("consumer project was not initialized");
      }

      const prompt = [
        "Use the 'go-to-definition' skill to find where the function 'calculateSum' is defined.",
        "The function is used in src/main.ts.",
        "Report the file path and line number where calculateSum is defined.",
      ].join("\\n");

      const stdout = await runOpenCode(
        ["run", "--format", "json", "--dir", project.dir, `"${prompt}"`],
        { OPENCODE_EXPERIMENTAL_LSP_TOOL: "true" },
      );

      const events = parseJsonOutput(stdout);

      const allToolEvents = events.filter(
        (e) => e.type === "tool_use" && e.part?.state?.status === "completed",
      );
      const toolNames = new Set(allToolEvents.map((e) => e.part!.tool!));

      const symbolFinderEvents = allToolEvents.filter((e) => e.part?.tool === "symbol-finder");
      expect(symbolFinderEvents.length).toBeGreaterThanOrEqual(1);

      const sfInput = symbolFinderEvents[0]!.part!.state!.input!;
      expect(sfInput["file"]).toBe("src/main.ts");
      expect(sfInput["symbol"]).toBe("calculateSum");

      const sfOutput = symbolFinderEvents[0]!.part!.state!.output!;
      expect(sfOutput).toContain("STATUS: FOUND");

      const lspEvents = allToolEvents.filter((e) => e.part?.tool === "lsp");
      expect(lspEvents.length).toBeGreaterThanOrEqual(1);

      const goToDefEvents = lspEvents.filter((e) => {
        const input = e.part!.state!.input;
        return input && input["operation"] === "goToDefinition";
      });
      expect(goToDefEvents.length).toBeGreaterThanOrEqual(1);

      const gtdInput = goToDefEvents[0]!.part!.state!.input!;
      expect(gtdInput["filePath"]).toBe("src/main.ts");
      expect(typeof gtdInput["line"]).toBe("number");
      expect(typeof gtdInput["character"]).toBe("number");

      const gtdOutput = goToDefEvents[0]!.part!.state!.output!;
      expect(gtdOutput).toContain("math.ts");

      const usedForbidden = FORBIDDEN_TOOLS.filter((tool) => toolNames.has(tool));
      expect(usedForbidden).toEqual([]);

      const textEvents = events.filter(
        (e) => e.type === "text" && e.part?.type === "text" && e.part.text,
      );
      const fullText = textEvents.map((e) => e.part!.text!).join(" ");
      if (!fullText) {
        throw new Error(
          `the model finished without an assistant text message (tools used: ${[...toolNames].join(", ") || "none"}); ` +
            "this looks like a provider/model flake, re-run the suite",
        );
      }
      expect(fullText.toLowerCase()).toContain("math.ts");
    },
    TIMEOUT_MS,
  );
});
