import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawnSync } from "child_process";
import semver from "semver";
import { REPO_ROOT, packagePluginDir } from "../e2e/helpers/paths";
import {
  collectImportSpecifiers,
  inspectModuleShape,
  isRelativeOrAbsoluteImport,
  normalizeBuiltin,
  resolvePackageEntrypoint,
} from "./helpers";

const IS_WINDOWS = process.platform === "win32";
const NPM_BIN = IS_WINDOWS ? "npm.cmd" : "npm";
const OPENCODE_BIN = process.env["OPENCODE_BIN"] || "opencode";

// Minimum opencode version the e2e suite targets; used when the installed binary can't be probed.
const FALLBACK_OPENCODE_VERSION = "1.17.0";

const PKG_DIR = packagePluginDir();
const PKG_SPEC = "opencode-semantic-lsp@dir";
const BUNDLE_REL = path.join("dist", "semantic-lsp-plugin.js");
const ALLOWED_EXTERNALS = new Set(["fs", "path"]);

const PACK_BUILD_TIMEOUT_MS = 300_000;

const pkgJsonPath = path.join(PKG_DIR, "package.json");

interface PackedPackageJson {
  exports?: Record<string, { import?: string } | string | undefined>;
  engines?: { opencode?: string };
}

function readPkgJson(): PackedPackageJson {
  return JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) as PackedPackageJson;
}

// Run `npm pack --dry-run --json` (read-only) and return the flat list of publishable paths.
function publishablePaths(): string[] {
  const dryRun = spawnSync(NPM_BIN, ["pack", "--dry-run", "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf-8",
    shell: IS_WINDOWS,
  });
  if (dryRun.error || dryRun.status !== 0) {
    const reason = dryRun.error ? dryRun.error.message : `exit code ${dryRun.status}`;
    throw new Error(`npm pack --dry-run failed: ${reason}\n${dryRun.stderr ?? ""}`);
  }
  const parsed = JSON.parse(dryRun.stdout) as Array<{ files?: Array<{ path: string }> }> | { files?: Array<{ path: string }> };
  const entry = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!entry) throw new Error("npm pack --dry-run produced no package entry");
  return (entry.files ?? []).map((file) => file.path);
}

function probeOpenCodeVersion(): string {
  const info = spawnSync(OPENCODE_BIN, ["--version"], { encoding: "utf-8", timeout: 20_000 });
  const match = (info.stdout || "").match(/\d+\.\d+\.\d+/);
  const found = match ? match[0] : undefined;
  if (found && semver.valid(found)) return found;
  return FALLBACK_OPENCODE_VERSION;
}

function writeTempPackage(dir: string, contents: Record<string, unknown>): void {
  fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify(contents, null, 2));
}

describe("Packaging: publishable integrity of opencode-semantic-lsp", () => {
  let tempDirs: string[] = [];

  beforeAll(() => {
    if (process.env["SKIP_PACK_BUILD"] === "1") {
      if (!fs.existsSync(pkgJsonPath)) {
        throw new Error(
          `SKIP_PACK_BUILD=1 but no packaged artifact at ${PKG_DIR}. Run \`npm run pack:dir\` first.`,
        );
      }
      return;
    }
    // Rebuild the exact artifact a user would install: clean -> build:plugin -> npm pack -> extract.
    const build = spawnSync(NPM_BIN, ["run", "pack:dir"], {
      cwd: REPO_ROOT,
      encoding: "utf-8",
      shell: IS_WINDOWS,
      timeout: PACK_BUILD_TIMEOUT_MS,
    });
    if (build.error || build.status !== 0) {
      const reason = build.error ? build.error.message : `exit code ${build.status}`;
      throw new Error(`npm run pack:dir failed: ${reason}\n${build.stdout ?? ""}\n${build.stderr ?? ""}`);
    }
  }, PACK_BUILD_TIMEOUT_MS);

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // best-effort cleanup
      }
    }
    tempDirs = [];
  });

  describe("1. publishable file list (files field)", () => {
    it("includes the plugin entry, document files and package.json", () => {
      const bundled = publishablePaths();
      for (const required of ["package.json", "README.md", "LICENSE", "CHANGELOG.md", BUNDLE_REL]) {
        expect(bundled).toContain(required);
      }
    });

    it("excludes skills and runtime tool/cli bundles from the publication build", () => {
      const packaged = fs.existsSync(PKG_DIR)
        ? ["dist/skills", "dist/symbol-finder.js", "dist/cli.js"].filter((entry) =>
            fs.existsSync(path.join(PKG_DIR, entry)),
          )
        : [];
      expect(packaged).toEqual([]);

      // `!dist/skills` is the field-driven exclusion; verify it via npm pack itself too.
      const bundled = publishablePaths();
      expect(bundled.filter((p) => p.startsWith("dist/skills/"))).toEqual([]);
    });
  });

  describe("2. entrypoint resolves by opencode rules (exports[\"./server\"])", () => {
    it("declares exports[\"./server\"].import as the plugin bundle", () => {
      const server = readPkgJson().exports?.["./server"];
      const importValue = typeof server === "string" ? server : server?.import;
      expect(importValue).toBe("./dist/semantic-lsp-plugin.js");
    });

    it("resolves the entry to an existing file inside the package root", () => {
      const entry = resolvePackageEntrypoint(PKG_SPEC, readPkgJson(), PKG_DIR);
      expect(entry).toBeDefined();
      expect(entry).toBe(path.resolve(PKG_DIR, "dist", "semantic-lsp-plugin.js"));
      expect(fs.existsSync(entry as string)).toBe(true);
    });

    it("rejects an entry that would point outside the plugin directory", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-integrity-outside-"));
      tempDirs.push(dir);
      writeTempPackage(dir, { exports: { "./server": { import: "../outside.js" } } });
      expect(() =>
        resolvePackageEntrypoint("packaged-plugin", readTemp(dir), dir),
      ).toThrow(/outside plugin directory/i);
    });

    it("falls back to main when there is no ./server export", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-integrity-main-"));
      tempDirs.push(dir);
      writeTempPackage(dir, { main: "./lib/index.js" });
      expect(resolvePackageEntrypoint("packaged-plugin", readTemp(dir), dir)).toBe(
        path.resolve(dir, "lib", "index.js"),
      );
    });

    it("accepts a string form of the ./server export", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pack-integrity-string-"));
      tempDirs.push(dir);
      writeTempPackage(dir, { exports: { "./server": "./server.js" } });
      expect(resolvePackageEntrypoint("packaged-plugin", readTemp(dir), dir)).toBe(
        path.resolve(dir, "server.js"),
      );
    });
  });

  describe("3. bundled module shape (default { id, server })", () => {
    it("default-exports an id object whose server() yields exactly the three lsp hooks", () => {
      const report = inspectModuleShape(path.join(PKG_DIR, BUNDLE_REL), PKG_DIR);
      expect(report.defaultType).toBe("object");
      expect(report.id).toBe("semantic-lsp");
      expect(report.serverType).toBe("function");

      const hookTypes = report.hookTypes ?? {};
      const hookNames = Object.keys(hookTypes).sort();
      expect(hookNames).toEqual(["tool.definition", "tool.execute.after", "tool.execute.before"]);
      for (const name of hookNames) {
        expect(hookTypes[name]).toBe("function");
      }
    });
  });

  describe("4. bundle self-sufficiency (only node builtins survive)", () => {
    it("references only fs/path as external modules", () => {
      const bundle = fs.readFileSync(path.join(PKG_DIR, BUNDLE_REL), "utf-8");
      const externals = collectImportSpecifiers(bundle)
        .filter((spec) => !isRelativeOrAbsoluteImport(spec))
        .map(normalizeBuiltin);
      const unexpected = [...new Set(externals)].filter((spec) => !ALLOWED_EXTERNALS.has(spec));
      expect(unexpected).toEqual([]);
      expect(externals).toContain("fs");
      expect(externals).toContain("path");
    });
  });

  describe("5. engines gate (engines.opencode vs target)", () => {
    it("engines.opencode is satisfied by the target opencode version", () => {
      const engines = readPkgJson().engines;
      expect(engines).toBeDefined();
      const range = engines?.["opencode"] ?? "";
      // engines.opencode must be a *range*, and the installed/target opencode must fall inside it.
      expect(semver.validRange(range)).not.toBeNull();
      const target = probeOpenCodeVersion();
      expect(semver.satisfies(target, range as Parameters<typeof semver.satisfies>[1])).toBe(true);
    });
  });
});

function readTemp(dir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf-8")) as Record<string, unknown>;
}
