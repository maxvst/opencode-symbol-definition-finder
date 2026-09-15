import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { JsonEvent, parseJsonOutput, runOpenCode, TIMEOUT_MS } from "./helpers/opencode";
import { ConsumerProject, makeConsumerProject } from "./helpers/consumer";
import { packagePluginDir } from "./helpers/paths";

const CPP_FIXTURE_DIR = path.resolve(__dirname, "fixtures/cpp-project");

const CLANGD_BIN = process.env["E2E_CLANGD_BIN"] || "";

function firstLine(text: string): string {
  const index = text.indexOf("\n");
  return (index === -1 ? text : text.slice(0, index)).trim();
}

function generateCompileCommands(tempDir: string): string {
  const cDir = path.resolve(tempDir, "C").replace(/'/g, "'\\''");
  return JSON.stringify(
    [
      {
        directory: tempDir,
        command: `g++ -std=c++17 -I${cDir} -c ${path.join(tempDir, "B", "b.cpp")} -o ${path.join(tempDir, "B", "b.o")}`,
        file: path.join(tempDir, "B", "b.cpp"),
      },
      {
        directory: tempDir,
        command: `g++ -std=c++17 -I${cDir} -c ${path.join(tempDir, "C", "c.cpp")} -o ${path.join(tempDir, "C", "c.o")}`,
        file: path.join(tempDir, "C", "c.cpp"),
      },
    ],
    null,
    2,
  );
}

function probeClangd(clangdBin: string): string {
  const result = spawnSync(clangdBin, ["--version"], { encoding: "utf8", timeout: 15_000 });
  if (result.error || result.status !== 0) {
    const reason = result.error ? result.error.message : `exit code ${result.status}`;
    throw new Error(
      `clangd binary is not runnable (${clangdBin}): ${reason}. ` +
        "Re-run with a valid clangd path: npm run test:e2e -- --clangd <path to clangd>",
    );
  }

  const versionLine = firstLine(result.stdout || "");
  if (!/clangd/i.test(versionLine)) {
    throw new Error(
      `E2E_CLANGD_BIN does not point to clangd (${clangdBin}): "${versionLine || "empty --version output"}". ` +
        "Re-run with a valid clangd path: npm run test:e2e -- --clangd <path to clangd>",
    );
  }
  return versionLine;
}

function assistantText(events: JsonEvent[]): string {
  return events
    .filter((e) => e.type === "text" && e.part?.type === "text" && e.part.text)
    .map((e) => e.part!.text!)
    .join(" ");
}

const describeSuite = CLANGD_BIN ? describe : describe.skip;

describeSuite("E2E: Semantic LSP plugin with clangd", () => {
  let project: ConsumerProject | undefined;

  beforeAll(() => {
    console.log(`[e2e] clangd version: ${probeClangd(CLANGD_BIN)}`);

    project = makeConsumerProject({
      trees: [{ from: CPP_FIXTURE_DIR, exclude: [".opencode"] }],
      finalize: (dir: string) => {
        fs.writeFileSync(path.join(dir, "compile_commands.json"), generateCompileCommands(dir));
        const rootConfig = {
          $schema: "https://opencode.ai/config.json",
          plugin: [packagePluginDir()],
          lsp: {
            clangd: {
              command: [CLANGD_BIN, `--compile-commands-dir=${dir}`],
            },
          },
          permission: {
            lsp: "allow",
          },
        };
        fs.writeFileSync(path.join(dir, "opencode.json"), JSON.stringify(rootConfig, null, 2) + "\n");
      },
    });
  }, TIMEOUT_MS);

  afterAll(() => {
    project?.cleanup();
  });

  it(
    "should find getUltimateAnswer() and return 42",
    async () => {
      if (!project) {
        throw new Error("consumer project was not initialized");
      }

      const prompt = [
        "Find out what the function getUltimateAnswer() does.",
        "It is called in B/b.cpp.",
        "Use the lsp tool with operation goToDefinition to locate its definition and report the result.",
        "Report the numeric value that getUltimateAnswer() returns.",
      ].join("\\n");

      const stdout = await runOpenCode(
        ["run", "--format", "json", "--dir", project.dir, `"${prompt}"`],
        { OPENCODE_EXPERIMENTAL_LSP_TOOL: "true" },
      );

      const events = parseJsonOutput(stdout);

      const lspEvents = events.filter(
        (e) => e.type === "tool_use" && e.part?.tool === "lsp" && e.part?.state,
      );
      expect(lspEvents.length).toBeGreaterThanOrEqual(1);

      const goToDefEvents = lspEvents.filter((e) => {
        const input = e.part!.state!.input;
        return input && input["operation"] === "goToDefinition";
      });
      expect(goToDefEvents.length).toBeGreaterThanOrEqual(1);

      const completedGoToDef = goToDefEvents.filter((e) => e.part!.state!.status === "completed");
      expect(completedGoToDef.length).toBeGreaterThanOrEqual(1);

      for (const ev of completedGoToDef) {
        const output = ev.part!.state!.output || "";
        expect(output).toContain("c.");
      }

      expect(assistantText(events)).toContain("42");
    },
    TIMEOUT_MS,
  );
});
