import * as path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { spawnSync } from "child_process";

// Port of opencode's plugin entrypoint resolution (packages/opencode/src/plugin/shared.ts):
//   exports["./<kind>"] -> { import | default } | string, resolved relative to the package dir and
//   guarded by the "entry must stay inside the plugin directory" check. For a "server" kind with no
//   matching export it falls back to `main`.

export type PluginKind = "server" | "tui";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extractExportValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (!isRecord(value)) return undefined;
  for (const key of ["import", "default"]) {
    const nested = value[key];
    if (typeof nested === "string") return nested;
  }
  return undefined;
}

function resolveExportPath(raw: string, dir: string): string {
  if (raw.startsWith("file://")) return fileURLToPath(raw);
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(dir, raw);
}

function isInside(root: string, target: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function resolvePackageFile(spec: string, raw: string, kind: string, dir: string): string {
  const resolved = resolveExportPath(raw, dir);
  const root = path.resolve(dir);
  const next = path.resolve(resolved);
  if (!isInside(root, next)) {
    throw new Error(`Plugin ${spec} resolved ${kind} entry outside plugin directory`);
  }
  return next;
}

// `spec` is only used for the diagnostic message, mirroring opencode.
export function resolvePackageEntrypoint(
  spec: string,
  pkgJson: unknown,
  dir: string,
  kind: PluginKind = "server",
): string | undefined {
  if (!isRecord(pkgJson)) return undefined;
  const exportsField = pkgJson["exports"];
  if (isRecord(exportsField)) {
    const raw = extractExportValue(exportsField[`./${kind}`]);
    if (raw) return resolvePackageFile(spec, raw, kind, dir);
  }
  if (kind !== "server") return undefined;
  const main = pkgJson["main"];
  if (typeof main !== "string" || !main.trim()) return undefined;
  return resolvePackageFile(spec, main.trim(), kind, dir);
}

// Collect module specifiers referenced by a bundled ESM/CJS file, so we can prove the bundle is
// self-sufficient (only Node builtins survive bundling — every app dependency is inlined).
export function collectImportSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  const patterns = [
    /(?:^|[\s;{}()])(?:import|export)\b[^"'\n]*?\bfrom\s*["']([^"']+)["']/g,
    /(?:^|[\s;{}()])(?:import|export)\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      const spec = match[1];
      if (spec) specifiers.add(spec);
    }
  }
  return [...specifiers];
}

export function isRelativeOrAbsoluteImport(spec: string): boolean {
  return (
    spec.startsWith(".") ||
    spec.startsWith("/") ||
    spec.startsWith("file://") ||
    /^[A-Za-z]:[\\/]/.test(spec)
  );
}

export function normalizeBuiltin(spec: string): string {
  const trimmed = spec.trim();
  return trimmed.startsWith("node:") ? trimmed.slice("node:".length) : trimmed;
}

export interface ModuleShapeReport {
  defaultType: string;
  id: unknown;
  serverType: string | null;
  hookTypes: Record<string, string> | null;
}

// Import the built ESM bundle in a real Node process (Jest's CJS VM cannot `import()` it) and report
// its default-export shape. This mirrors how opencode imports the package entrypoint at runtime.
export function inspectModuleShape(entryFile: string, directory: string, timeoutMs = 60_000): ModuleShapeReport {
  const entryUrl = pathToFileURL(path.resolve(entryFile)).href;
  const script =
    "const m = await import(process.env.PLUGIN_ENTRY_URL);" +
    "const d = m.default;" +
    "let hooks = null;" +
    "if (d && typeof d.server === 'function') {" +
    "  const h = await d.server({ directory: process.env.PLUGIN_DIR });" +
    "  hooks = h && typeof h === 'object' ? Object.fromEntries(Object.entries(h).map(([k, v]) => [k, typeof v])) : null;" +
    "}" +
    "process.stdout.write(JSON.stringify({" +
    "  defaultType: typeof d," +
    "  id: d && typeof d === 'object' && 'id' in d ? d.id : null," +
    "  serverType: d && typeof d === 'object' && 'server' in d ? typeof d.server : null," +
    "  hookTypes: hooks," +
    "}));";
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
    encoding: "utf-8",
    timeout: timeoutMs,
    env: { ...process.env, PLUGIN_ENTRY_URL: entryUrl, PLUGIN_DIR: directory },
  });
  if (child.error) {
    throw new Error(`failed to launch node to inspect module shape: ${child.error.message}`);
  }
  if (child.status !== 0) {
    throw new Error(
      `imported plugin module errored (exit ${child.status}):\n${child.stderr?.trim() || child.stdout?.trim() || "no output"}`,
    );
  }
  return JSON.parse(child.stdout) as ModuleShapeReport;
}
