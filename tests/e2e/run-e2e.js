#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const IS_WINDOWS = process.platform === "win32";
const CLANGD_FLAG = "--clangd";
const CLANGD_ENV = "E2E_CLANGD_BIN";
const JEST_ARGS_HINT = "[jest args...]";
const USAGE = `usage: npm run test:e2e -- [${CLANGD_FLAG} <path to clangd>] ${JEST_ARGS_HINT}`;
const RULE = "=".repeat(72);
const SUITE_NEEDS_CLANGD = "tests/e2e/semantic-lsp.test.ts";

const supportsColor = Boolean(process.stderr.isTTY) && !("NO_COLOR" in process.env);
const colorize = (code, text) => (supportsColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const red = (text) => colorize("31", text);
const yellow = (text) => colorize("33", text);
const green = (text) => colorize("32", text);
const bold = (text) => colorize("1", text);

const rootDir = path.resolve(__dirname, "..", "..");

function firstLine(text) {
  const index = text.indexOf("\n");
  return (index === -1 ? text : text.slice(0, index)).trim();
}

function banner(headline, details, notes) {
  return [
    "",
    RULE,
    `  ${headline}`,
    ...details.map((detail) => `    ${detail}`),
    ...notes.map((note) => `    ${note}`),
    "",
    `  ${USAGE}`,
    RULE,
    "",
  ].join("\n");
}

function abort(summary, details = [], notes = ["nothing was built, no tests were started"]) {
  console.error(banner(bold(red("E2E RUN ABORTED")) + `: ${summary}`, details, notes));
  process.exit(1);
}

function parseArgs(argv) {
  const clangdOptions = [];
  const jestArgs = [];

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === CLANGD_FLAG) {
      clangdOptions.push(argv[index + 1]);
      index++;
      continue;
    }
    if (arg.startsWith(`${CLANGD_FLAG}=`)) {
      clangdOptions.push(arg.slice(CLANGD_FLAG.length + 1));
      continue;
    }
    jestArgs.push(arg);
  }

  return { clangdOptions, jestArgs };
}

// Bad CLI usage stops the run: the requested command itself is ambiguous.
// A bad clangd binary does not: the suites that do not need clangd are still worth running,
// and the clangd suite fails loudly on its own with the same diagnostic.
function resolveClangd(clangdOptions) {
  if (clangdOptions.length === 0) return null;

  if (clangdOptions.length > 1) {
    abort(`${CLANGD_FLAG} must be specified only once`);
  }

  const rawOption = clangdOptions[0];
  if (!rawOption || rawOption.startsWith("-")) {
    abort(`${CLANGD_FLAG} requires a path to the clangd binary`);
  }
  if (rawOption.toLowerCase() === "auto") {
    abort(`${CLANGD_FLAG} requires an explicit path, "auto" is not supported`);
  }

  const clangdBin = path.resolve(rawOption);

  let stats = null;
  try {
    stats = fs.statSync(clangdBin);
  } catch {
    return { clangdBin, problem: "clangd binary was not found", details: [`specified: ${rawOption}`, `resolved:  ${clangdBin}`] };
  }
  if (!stats.isFile()) {
    return { clangdBin, problem: "clangd path is not a file", details: [`resolved: ${clangdBin}`] };
  }

  const probe = spawnSync(clangdBin, ["--version"], { encoding: "utf8", timeout: 15_000 });
  if (probe.error || probe.status !== 0) {
    const reason = probe.error ? probe.error.message : `exit code ${probe.status}`;
    return { clangdBin, problem: "clangd binary is not runnable", details: [`resolved: ${clangdBin}`, `reason:   ${reason}`] };
  }

  const versionLine = firstLine(probe.stdout || "");
  if (!/clangd/i.test(versionLine)) {
    return {
      clangdBin,
      problem: `${CLANGD_FLAG} does not point to a clangd binary`,
      details: [`resolved: ${clangdBin}`, `--version returned: "${versionLine || "empty output"}"`],
    };
  }

  return { clangdBin, versionLine };
}

function seconds(startedAt) {
  return `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
}

function runBuild() {
  const startedAt = Date.now();
  process.stdout.write("[e2e] (1/2) build ... ");

  const build = spawnSync(IS_WINDOWS ? "npm.cmd" : "npm", ["run", "build"], {
    cwd: rootDir,
    encoding: "utf8",
    shell: IS_WINDOWS,
    env: process.env,
  });

  if (build.error || build.status !== 0) {
    process.stdout.write(`${red("FAILED")}\n`);
    const reason = build.error ? build.error.message : `exit code ${build.status}`;
    const output = [build.stdout, build.stderr].filter(Boolean).join("\n").trim();
    if (output) console.error(output);
    abort("npm run build failed", [`reason: ${reason}`], ["no tests were started"]);
  }

  process.stdout.write(`${green("ok")} (${seconds(startedAt)})\n`);
}

function runJest(jestArgs, clangdBin) {
  const env = { ...process.env };
  if (clangdBin) {
    env[CLANGD_ENV] = clangdBin;
  } else {
    delete env[CLANGD_ENV];
  }

  process.stdout.write("[e2e] (2/2) jest ... \n");
  const result = spawnSync(
    process.execPath,
    [path.join(rootDir, "node_modules", "jest", "bin", "jest.js"), "--config", path.join(rootDir, "jest.e2e.config.js"), ...jestArgs],
    { cwd: rootDir, stdio: "inherit", env },
  );

  if (result.error) {
    abort("failed to start jest", [`reason: ${result.error.message}`], ["no results were collected"]);
  }

  return result.status === null ? 1 : result.status;
}

const { clangdOptions, jestArgs } = parseArgs(process.argv.slice(2));
const clangd = resolveClangd(clangdOptions);

if (!clangd) {
  console.log(
    "[e2e] " +
      bold("NOTE:") +
      ` ${SUITE_NEEDS_CLANGD} needs a clangd binary and will be skipped.\n` +
      `[e2e]       full run: npm run test:e2e -- ${CLANGD_FLAG} <path to clangd>`,
  );
} else if (clangd.problem) {
  console.error(
    banner(
      bold(red("INVALID CLANGD PATH")) + `: ${clangd.problem}`,
      clangd.details,
      [
        "the run continues:",
        `    ${SUITE_NEEDS_CLANGD} is expected to FAIL,`,
        "    all other e2e suites are executed normally.",
      ],
    ),
  );
} else {
  console.log(`[e2e] clangd: ${clangd.versionLine}`);
}

runBuild();
const status = runJest(jestArgs, clangd ? clangd.clangdBin : null);

if (!clangd) {
  console.log(
    "[e2e] " +
      bold("RESULT:") +
      ` ${SUITE_NEEDS_CLANGD} (clangd) was skipped.\n` +
      `[e2e]         run it too: npm run test:e2e -- ${CLANGD_FLAG} <path to clangd>`,
  );
} else if (clangd.problem) {
  console.log(
    "[e2e] " +
      bold(yellow("RESULT:")) +
      ` ${clangd.problem} (${clangd.clangdBin});\n` +
      `[e2e]         ${SUITE_NEEDS_CLANGD} failed because of it, other suites are unaffected.`,
  );
}

process.exit(status);
