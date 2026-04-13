import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const FIXTURE_DIR = path.resolve(__dirname, "fixtures/cpp-project");
const PLUGIN_SOURCE = path.resolve(__dirname, "../../dist/semantic-lsp-plugin.js");
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

function installOpencodeDeps(opencodeDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(path.join(opencodeDir, "node_modules"))) {
      resolve();
      return;
    }
    const proc = spawn("npm", ["install", "--no-audit", "--no-fund"], {
      cwd: opencodeDir,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString();
    });
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
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe("E2E: Semantic LSP plugin with clangd", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "semantic-lsp-e2e-"));

    fs.cpSync(FIXTURE_DIR, tempDir, { recursive: true });

    fs.writeFileSync(
      path.join(tempDir, "compile_commands.json"),
      generateCompileCommands(tempDir),
    );

    const opencodeDir = path.join(tempDir, ".opencode");
    const pluginsDir = path.join(opencodeDir, "plugins");
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.copyFileSync(PLUGIN_SOURCE, path.join(pluginsDir, "semantic-lsp-plugin.js"));

    const rootConfig = {
      lsp: {
        clangd: {
          command: ["clangd", `--compile-commands-dir=${tempDir}`],
        },
      },
      permission: {
        lsp: "allow",
      },
    };
    fs.writeFileSync(
      path.join(tempDir, "opencode.json"),
      JSON.stringify(rootConfig, null, 2),
    );

    const { execSync } = require("child_process");
    execSync("git init", { cwd: tempDir });
    execSync("git config user.email 'test@test.com'", { cwd: tempDir });
    execSync("git config user.name 'Test'", { cwd: tempDir });
    execSync("git add -A", { cwd: tempDir });
    execSync("git commit -m 'init'", { cwd: tempDir });

    await installOpencodeDeps(opencodeDir);
  }, 300_000);

  afterAll(() => {
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it(
    "should find getUltimateAnswer() and return 42",
    async () => {
      const prompt = [
        "Find out what the function getUltimateAnswer() does.",
        "It is called in B/b.cpp.",
        "Use the lsp tool with operation goToDefinition to locate its definition and report the result.",
        "Report the numeric value that getUltimateAnswer() returns.",
      ].join("\\n");

      const stdout = await runOpenCode(
        ["run", "--format", "json", "--dir", tempDir, `"${prompt}"`],
        { OPENCODE_EXPERIMENTAL_LSP_TOOL: "true" },
      );

      const events = parseJsonOutput(stdout);

      const lspEvents = events.filter(
        (e) =>
          e.type === "tool_use" &&
          e.part?.tool === "lsp" &&
          e.part?.state,
      );
      expect(lspEvents.length).toBeGreaterThanOrEqual(1);

      const goToDefEvents = lspEvents.filter(
        (e) => {
          const input = e.part!.state!.input;
          return input && input["operation"] === "goToDefinition";
        },
      );
      expect(goToDefEvents.length).toBeGreaterThanOrEqual(1);

      const completedLsp = lspEvents.filter(
        (e) => e.part!.state!.status === "completed",
      );
      for (const ev of completedLsp) {
        const output = ev.part!.state!.output || "";
        expect(output).toContain("c.");
      }

      const textEvents = events.filter(
        (e) => e.type === "text" && e.part?.type === "text" && e.part.text,
      );
      const fullText = textEvents.map((e) => e.part!.text!).join(" ");

      expect(fullText).toContain("42");
    },
    TIMEOUT_MS,
  );
});
