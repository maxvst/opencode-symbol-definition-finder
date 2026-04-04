import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const FIXTURE_DIR = path.resolve(__dirname, "fixtures/lsp-project");
const TOOL_SOURCE = path.resolve(__dirname, "../../dist/symbol-finder.js");
const SKILL_SOURCE = path.resolve(__dirname, "../../dist/skills/go-to-definition/SKILL.md");
const OPENCODE_DIR = path.join(FIXTURE_DIR, ".opencode");
const TOOLS_DIR = path.join(OPENCODE_DIR, "tools");
const TOOL_DEST = path.join(TOOLS_DIR, "symbol-finder.js");
const SKILLS_DIR = path.join(OPENCODE_DIR, "skills", "go-to-definition");
const SKILL_DEST = path.join(SKILLS_DIR, "SKILL.md");
const OPENCODE_BIN = process.env["OPENCODE_BIN"] || "opencode";

const TIMEOUT_MS = 300_000;

const FORBIDDEN_TOOLS = ["grep", "glob", "read", "bash", "edit", "write", "list", "webfetch", "websearch", "codesearch"];

interface JsonEvent {
  type: string;
  timestamp: number;
  sessionID: string;
  part?: {
    type?: string;
    tool?: string;
    state?: {
      status?: string;
      input?: Record<string, unknown>;
      output?: string;
      error?: string;
    };
    text?: string;
  };
  error?: {
    name: string;
    data?: { message?: string };
  };
}

function parseJsonOutput(raw: string): JsonEvent[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"));
  return lines.map((line) => JSON.parse(line));
}

function runOpenCode(args: string[], env: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const cmd = `script -q -c '${OPENCODE_BIN} ${args.join(" ")}' /dev/null`;
    const proc = spawn("bash", ["-c", cmd], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d: Buffer) => {
      stdout += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`Timeout after ${TIMEOUT_MS}ms. stderr: ${stderr.slice(0, 500)}`));
    }, TIMEOUT_MS);

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (code !== 0 && !stdout) {
        reject(new Error(`Exit code ${code}. stderr: ${stderr.slice(0, 500)}`));
        return;
      }
      resolve(stdout);
    });

    proc.on("error", (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function installOpencodeDeps(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(path.join(OPENCODE_DIR, "node_modules"))) {
      resolve();
      return;
    }
    const proc = spawn("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: OPENCODE_DIR,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("npm install timeout"));
    }, 120_000);
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`npm install failed: ${stderr}`));
        return;
      }
      resolve();
    });
    proc.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

function warmUpLsp(): Promise<void> {
  const cmd = `script -q -c '${OPENCODE_BIN} run --format json --dir ${FIXTURE_DIR} "Call the lsp tool with operation documentSymbol, filePath src/main.ts, line 1, character 1. Then stop."' /dev/null`;
  const proc = spawn("bash", ["-c", cmd], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, OPENCODE_EXPERIMENTAL_LSP_TOOL: "true" },
  });

  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve();
    }, 120_000);

    proc.on("close", () => {
      clearTimeout(timer);
      resolve();
    });

    proc.on("error", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

describe("E2E: go-to-definition skill with symbol-finder and LSP", () => {
  beforeAll(async () => {
    fs.mkdirSync(TOOLS_DIR, { recursive: true });
    fs.copyFileSync(TOOL_SOURCE, TOOL_DEST);
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
    fs.copyFileSync(SKILL_SOURCE, SKILL_DEST);
    await installOpencodeDeps();
    await warmUpLsp();
  }, 300_000);

  it(
    "should find calculateSum definition using symbol-finder + lsp, without grep or other search tools",
    async () => {
      const prompt = [
        "Use the 'go-to-definition' skill to find where the function 'calculateSum' is defined.",
        "The function is used in src/main.ts.",
        "Report the file path and line number where calculateSum is defined.",
      ].join("\\n");

      const stdout = await runOpenCode(
        ["run", "--format", "json", "--dir", FIXTURE_DIR, `"${prompt}"`],
        { OPENCODE_EXPERIMENTAL_LSP_TOOL: "true" },
      );

      const events = parseJsonOutput(stdout);

      const allToolEvents = events.filter(
        (e) => e.type === "tool_use" && e.part?.state?.status === "completed",
      );

      const toolNames = new Set(allToolEvents.map((e) => e.part!.tool!));

      const symbolFinderEvents = allToolEvents.filter(
        (e) => e.part?.tool === "symbol-finder",
      );
      expect(symbolFinderEvents.length).toBeGreaterThanOrEqual(1);

      const sfInput = symbolFinderEvents[0]!.part!.state!.input!;
      expect(sfInput["file"]).toBe("src/main.ts");
      expect(sfInput["symbol"]).toBe("calculateSum");

      const sfOutput = symbolFinderEvents[0]!.part!.state!.output!;
      expect(sfOutput).toContain("STATUS: FOUND");

      const lspEvents = allToolEvents.filter(
        (e) => e.part?.tool === "lsp",
      );
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

      for (const forbidden of FORBIDDEN_TOOLS) {
        expect(toolNames.has(forbidden)).toBe(false);
      }

      const textEvents = events.filter(
        (e) => e.type === "text" && e.part?.type === "text" && e.part.text,
      );
      const fullText = textEvents.map((e) => e.part!.text!).join(" ");
      expect(fullText.toLowerCase()).toContain("math.ts");
    },
    TIMEOUT_MS,
  );
});
