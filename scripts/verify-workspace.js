#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { workspaceTargets } = require("./workspace-targets");

const workspaceRoot = path.resolve(__dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const supportedArgs = new Set(["--dry-run", "--help", "-h"]);
const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => !supportedArgs.has(arg));

if (unknownArgs.length > 0) {
  console.error(`Unknown arguments: ${unknownArgs.join(", ")}`);
  process.exit(1);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run verify:workspace -- [--dry-run]

Run the root and project verification matrix without using npm workspaces.

Options:
  --dry-run  Print the verification order and commands without executing them.
  --help     Show this help message.
`);
  process.exit(0);
}

const dryRun = args.includes("--dry-run");

const targets = workspaceTargets.map((target) => ({
  ...target,
  command: npmCommand,
  commandArgs: target.verifyCommandArgs,
}));

function readTrackedGitStatus() {
  const result = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    {
      cwd: workspaceRoot,
      encoding: "utf8",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || "git status failed");
  }

  const entries = new Map();
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }

    const status = line.slice(0, 2);
    const filePath = line.slice(3).trim();
    entries.set(filePath, status);
  }

  return entries;
}

function collectUnexpectedTrackedMutations(beforeStatus, afterStatus) {
  const unexpected = [];

  for (const [filePath, afterEntry] of afterStatus.entries()) {
    const beforeEntry = beforeStatus.get(filePath);
    if (beforeEntry === undefined) {
      unexpected.push({
        filePath,
        before: "(clean)",
        after: afterEntry,
      });
      continue;
    }

    if (beforeEntry !== afterEntry) {
      unexpected.push({
        filePath,
        before: beforeEntry,
        after: afterEntry,
      });
    }
  }

  return unexpected;
}

function requirePackageJson(target) {
  const packageJsonPath = path.resolve(
    workspaceRoot,
    target.relativeDir,
    "package.json",
  );

  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(
      `${target.name}: missing required file ${path.relative(workspaceRoot, packageJsonPath)}`,
    );
  }
}

for (const target of targets) {
  requirePackageJson(target);
}

const trackedStatusBefore = readTrackedGitStatus();

console.log("Workspace verification matrix:");
for (const [index, target] of targets.entries()) {
  const renderedCommand = [target.command, ...target.commandArgs].join(" ");
  console.log(
    `${index + 1}. ${target.name} -> ${target.relativeDir} :: ${renderedCommand}`,
  );
}

if (dryRun) {
  console.log("");
  console.log("Dry run complete. No verification commands were executed.");
  process.exit(0);
}

const results = [];

for (const [index, target] of targets.entries()) {
  console.log("");
  console.log(
    `[${index + 1}/${targets.length}] ${target.name}: ${[target.command, ...target.commandArgs].join(" ")}`,
  );

  const result = spawnSync(target.command, target.commandArgs, {
    cwd: path.resolve(workspaceRoot, target.relativeDir),
    stdio: "inherit",
  });

  const failed = Boolean(result.error) || result.status !== 0;
  results.push({
    name: target.name,
    relativeDir: target.relativeDir,
    failed,
    status: result.status,
    error: result.error ? result.error.message : null,
  });
}

console.log("");
console.log("Workspace verification summary:");

for (const result of results) {
  const statusLabel = result.failed ? "FAIL" : "PASS";
  const detail = result.error
    ? result.error
    : typeof result.status === "number"
      ? `exit ${result.status}`
      : "exit unknown";

  console.log(
    `- [${statusLabel}] ${result.name} (${result.relativeDir}) :: ${detail}`,
  );
}

if (results.some((result) => result.failed)) {
  process.exit(1);
}

const trackedStatusAfter = readTrackedGitStatus();
const unexpectedTrackedMutations = collectUnexpectedTrackedMutations(
  trackedStatusBefore,
  trackedStatusAfter,
);

if (unexpectedTrackedMutations.length > 0) {
  console.log("");
  console.log("Unexpected tracked workspace mutations detected:");
  for (const mutation of unexpectedTrackedMutations) {
    console.log(
      `- ${mutation.filePath} :: before=${mutation.before} after=${mutation.after}`,
    );
  }
  process.exit(1);
}

console.log("");
console.log("Workspace verification completed successfully.");
