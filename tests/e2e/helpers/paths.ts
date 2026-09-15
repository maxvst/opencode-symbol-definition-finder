import * as path from "path";
import * as fs from "fs";

// Repo root: tests/<group>/helpers -> up three levels.
export const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

// Distribution directory produced by `npm run pack:dir` (structurally identical to `npm pack`).
// The e2e orchestrator passes the absolute path via E2E_PACKAGE_DIR; helpers fall back to the
// in-repo default.
export const E2E_PACKAGE_DIR_ENV = "E2E_PACKAGE_DIR";

export function defaultPackageDir(): string {
  return path.join(REPO_ROOT, "pkg", "opencode-semantic-lsp");
}

export function packagePluginDir(): string {
  const fromEnv = process.env[E2E_PACKAGE_DIR_ENV];
  const resolved = fromEnv && fromEnv.trim() ? path.resolve(fromEnv) : defaultPackageDir();
  return resolved;
}

export function packagePluginBundle(): string {
  return path.join(packagePluginDir(), "dist", "semantic-lsp-plugin.js");
}

export function assertPackageArtifact(dir: string = packagePluginDir()): void {
  const bundle = path.join(dir, "dist", "semantic-lsp-plugin.js");
  const pkgJson = path.join(dir, "package.json");
  if (!fs.existsSync(pkgJson) || !fs.existsSync(bundle)) {
    throw new Error(
      `Distributable plugin package is missing at ${dir}. ` +
        "Run `npm run pack:dir` first (the e2e orchestrator does this automatically).",
    );
  }
}
