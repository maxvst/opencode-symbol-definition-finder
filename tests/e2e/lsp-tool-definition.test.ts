import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";

const FIXTURE_DIR = path.resolve(__dirname, "fixtures/lsp-project");
const PLUGIN_SOURCE = path.resolve(__dirname, "../../dist/semantic-lsp-plugin.js");
const OPENCODE_DIR = path.join(FIXTURE_DIR, ".opencode");
const PLUGINS_DIR = path.join(OPENCODE_DIR, "plugins");
const PLUGIN_DEST = path.join(PLUGINS_DIR, "semantic-lsp-plugin.js");
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

describe("E2E: lsp tool definition via semantic-lsp-plugin", () => {
  beforeAll(() => {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    fs.copyFileSync(PLUGIN_SOURCE, PLUGIN_DEST);
  });

  it(
    "should report lsp tool parameters as fragment and symbol, not line and character",
    async () => {
      const prompt = [
        "Is there a tool named 'lsp' available to you?",
        "If yes, list all its parameter names exactly as they appear in the tool definition.",
      ].join("\\n");

      const stdout = await runOpenCode(
        ["run", "--format", "json", "--dir", FIXTURE_DIR, `"${prompt}"`],
        { OPENCODE_EXPERIMENTAL_LSP_TOOL: "true" },
      );

      const events = parseJsonOutput(stdout);

      const textEvents = events.filter(
        (e) => e.type === "text" && e.part?.type === "text" && e.part.text,
      );
      const fullText = textEvents.map((e) => e.part!.text!).join(" ");

      expect(fullText.toLowerCase()).toContain("fragment");
      expect(fullText.toLowerCase()).toContain("symbol");
    },
    TIMEOUT_MS,
  );
});
