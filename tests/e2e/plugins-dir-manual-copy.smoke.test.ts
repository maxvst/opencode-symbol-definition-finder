import * as path from "path";
import { JsonEvent, parseJsonOutput, runOpenCode, TIMEOUT_MS } from "./helpers/opencode";
import { ConsumerProject, makeConsumerProject } from "./helpers/consumer";

const PLUGIN_SOURCE = path.resolve(__dirname, "../../dist/semantic-lsp-plugin.js");

function assistantText(events: JsonEvent[]): string {
  return events
    .filter((e) => e.type === "text" && e.part?.type === "text" && e.part.text)
    .map((e) => e.part!.text!)
    .join(" ");
}

// Single manual-copy smoke: preserves coverage for the dev-time loose-file path
// (`{plugin,plugins}/*.{ts,js}` auto-scan) — the ONLY e2e that copies a raw `.js`.
describe("E2E smoke: loose-file plugin in .opencode/plugins is autodiscovered", () => {
  let project: ConsumerProject | undefined;

  beforeAll(() => {
    project = makeConsumerProject({
      skipPluginSpec: true,
      files: [{ source: PLUGIN_SOURCE, target: ".opencode/plugins/semantic-lsp-plugin.js" }],
    });
  });

  afterAll(() => {
    project?.cleanup();
  });

  it(
    "should list lsp parameters (fragment, symbol) after loose-file copy",
    async () => {
      if (!project) {
        throw new Error("consumer project was not initialized");
      }

      const prompt = [
        "Is there a tool named 'lsp' available to you?",
        "If yes, list all its parameter names exactly as they appear in the tool definition.",
      ].join("\\n");

      const stdout = await runOpenCode(
        ["run", "--format", "json", "--dir", project.dir, `"${prompt}"`],
        { OPENCODE_EXPERIMENTAL_LSP_TOOL: "true" },
      );

      const fullText = assistantText(parseJsonOutput(stdout)).toLowerCase();

      expect(fullText).toContain("fragment");
      expect(fullText).toContain("symbol");
    },
    TIMEOUT_MS,
  );
});
