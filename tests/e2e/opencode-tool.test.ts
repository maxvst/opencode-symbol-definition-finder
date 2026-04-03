import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const FIXTURE_DIR = path.resolve(__dirname, "fixtures/sample-project");
const TOOL_SOURCE = path.resolve(__dirname, "../../dist/symbol-finder.js");
const TOOLS_DIR = path.join(FIXTURE_DIR, ".opencode/tools");
const TOOL_DEST = path.join(TOOLS_DIR, "symbol-finder.js");
const OPENCODE_BIN = process.env["OPENCODE_BIN"] || "opencode";

const TIMEOUT_MS = 300_000;

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

function runOpenCode(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const cmd = `script -q -c '${OPENCODE_BIN} ${args.join(" ")}' /dev/null`;
    const proc = spawn("bash", ["-c", cmd], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
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

describe("E2E: symbol-finder custom tool in OpenCode", () => {
  beforeAll(() => {
    fs.mkdirSync(TOOLS_DIR, { recursive: true });
    fs.copyFileSync(TOOL_SOURCE, TOOL_DEST);
  });

  it(
    "should find the symbol 'add' at line 9, column 16 via the symbol-finder tool",
    async () => {
      const prompt = [
        "You MUST use the symbol-finder tool with the following exact parameters:",
        "- file: src/calculator.ts",
        "- symbol: add",
        "- fragment: add(2, 3)",
        "",
        "Call symbol-finder with these parameters exactly as given.",
        "Output the raw tool result verbatim without any interpretation or modification.",
      ].join("\\n");

      const stdout = await runOpenCode([
        "run",
        "--format",
        "json",
        "--dir",
        FIXTURE_DIR,
        `"${prompt}"`,
      ]);

      const events = parseJsonOutput(stdout);

      const toolEvents = events.filter(
        (e) =>
          e.type === "tool_use" &&
          e.part?.tool === "symbol-finder" &&
          e.part?.state?.status === "completed"
      );

      expect(toolEvents.length).toBeGreaterThanOrEqual(1);

      const toolOutput = toolEvents[0]!.part!.state!.output!;
      const toolInput = toolEvents[0]!.part!.state!.input!;

      expect(toolInput["file"]).toBe("src/calculator.ts");
      expect(toolInput["symbol"]).toBe("add");
      expect(toolInput["fragment"]).toBe("add(2, 3)");

      expect(toolOutput).toContain("STATUS: FOUND");
      expect(toolOutput).toContain("SYMBOL: add");
      expect(toolOutput).toMatch(/LINE:\s*9/);
      expect(toolOutput).toMatch(/COLUMN:\s*16/);
    },
    TIMEOUT_MS
  );
});
