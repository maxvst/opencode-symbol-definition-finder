import { spawn } from "child_process";

export const OPENCODE_BIN = process.env["OPENCODE_BIN"] || "opencode";

export const TIMEOUT_MS = 300_000;

export interface JsonEvent {
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

export function parseJsonOutput(raw: string): JsonEvent[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{"));
  return lines.map((line) => JSON.parse(line));
}

export function runOpenCode(
  args: string[],
  env: Record<string, string> = {},
  timeoutMs: number = TIMEOUT_MS,
): Promise<string> {
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
      reject(new Error(`Timeout after ${timeoutMs}ms. stderr: ${stderr.slice(0, 500)}`));
    }, timeoutMs);

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
