import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import { assertPackageArtifact, packagePluginDir, REPO_ROOT } from "./paths";

const SEARCH_TOOLS = [
  "grep",
  "glob",
  "read",
  "bash",
  "webfetch",
  "websearch",
  "edit",
  "write",
  "list",
  "codesearch",
];

function disabledTools(): Record<string, boolean> {
  const tools: Record<string, boolean> = {};
  for (const tool of SEARCH_TOOLS) {
    tools[tool] = false;
  }
  return tools;
}

export interface FileCopySpec {
  // Absolute source file on disk.
  source: string;
  // Destination path relative to the consumer project root.
  target: string;
}

export interface TreeCopySpec {
  // Absolute source directory copied recursively into the consumer root.
  from: string;
  // Directory names (matched by basename) to skip — e.g. a fixture's own `.opencode`.
  exclude?: string[];
}

export interface ConsumerOptions {
  // Absolute path to the packed plugin directory (dir-spec for `opencode.json: plugin`).
  // Defaults to the `npm run pack:dir` artifact resolved via E2E_PACKAGE_DIR.
  pluginDir?: string;
  // Merge an additional `plugin` spec instead of the default one (rarely needed).
  skipPluginSpec?: boolean;
  // Extra top-level fields merged into the generated `opencode.json` (override defaults).
  extraConfig?: Record<string, unknown>;
  // Copy whole source trees into the consumer root (fixture sources).
  trees?: TreeCopySpec[];
  // Copy individual files (e.g. `.opencode/tools/...`, `.opencode/skills/...`) into the consumer.
  files?: FileCopySpec[];
  // Callback run after config + trees/files are in place but BEFORE the git snapshot, for consumers
  // that need directory-dependent artifacts (e.g. a clangd `compile_commands.json`).
  finalize?: (dir: string) => void;
  // Generate a git repository in the consumer (default: true).
  git?: boolean;
}

export interface ConsumerProject {
  dir: string;
  cleanup: () => void;
}

function git(cwd: string, args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function copyTree(spec: TreeCopySpec, dest: string): void {
  fs.cpSync(spec.from, dest, {
    recursive: true,
    force: true,
    filter: (src: string) => {
      if (!spec.exclude) return true;
      const rel = path.relative(spec.from, src);
      if (!rel) return true;
      const first = rel.split(path.sep)[0] ?? "";
      return !spec.exclude.includes(first);
    },
  });
}

export function makeConsumerProject(options: ConsumerOptions = {}): ConsumerProject {
  // Consumers are created INSIDE the repo (not /tmp): opencode's tsserver resolves `typescript`/libs
  // by walking up from the file to the nearest node_modules, which only exists under the repo tree.
  const base = path.join(REPO_ROOT, ".e2e-tmp");
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, "consumer-"));

  const config: Record<string, unknown> = {
    $schema: "https://opencode.ai/config.json",
    lsp: true,
    permission: { lsp: "allow" },
    tools: disabledTools(),
  };
  if (!options.skipPluginSpec) {
    const pluginDir = options.pluginDir ?? packagePluginDir();
    assertPackageArtifact(pluginDir);
    config["plugin"] = [pluginDir];
  }
  for (const [key, value] of Object.entries(options.extraConfig ?? {})) {
    config[key] = value;
  }
  fs.writeFileSync(path.join(dir, "opencode.json"), JSON.stringify(config, null, 2) + "\n");

  for (const tree of options.trees ?? []) {
    copyTree(tree, dir);
  }
  for (const file of options.files ?? []) {
    const target = path.join(dir, file.target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file.source, target);
  }

  options.finalize?.(dir);

  const wantGit = options.git ?? true;
  if (wantGit) {
    git(dir, ["init"]);
    git(dir, ["config", "user.email", "test@test.com"]);
    git(dir, ["config", "user.name", "Test"]);
    git(dir, ["add", "-A"]);
    git(dir, ["commit", "-m", "init"]);
  }

  return {
    dir,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup of the temporary consumer
      }
    },
  };
}

export { SEARCH_TOOLS };
