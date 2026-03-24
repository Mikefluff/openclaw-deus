#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { workspaceTargets } = require("./workspace-targets");

const workspaceRoot = path.resolve(__dirname, "..");

const supportedArgs = new Set(["--dry-run", "--help", "-h"]);
const args = process.argv.slice(2);
const unknownArgs = args.filter((arg) => !supportedArgs.has(arg));

if (unknownArgs.length > 0) {
  console.error(`Unknown arguments: ${unknownArgs.join(", ")}`);
  process.exit(1);
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: npm run setup:workspace -- [--dry-run]

Install dependencies in the repository root and each supported Node project.

Options:
  --dry-run  Print the install order without running npm install.
  --help     Show this help message.
`);
  process.exit(0);
}

const dryRun = args.includes("--dry-run");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function requireFile(targetName, filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `${targetName}: missing required file ${path.relative(workspaceRoot, filePath)}`,
    );
  }
}

function getTargetInfo(target) {
  const dir = path.resolve(workspaceRoot, target.relativeDir);
  const packageJsonPath = path.join(dir, "package.json");
  const packageLockPath = path.join(dir, "package-lock.json");

  requireFile(target.name, packageJsonPath);
  requireFile(target.name, packageLockPath);

  return {
    ...target,
    dir,
    packageJsonPath,
    packageLockPath,
  };
}

const targets = workspaceTargets.map(getTargetInfo);

console.log("Workspace setup plan:");
for (const [index, target] of targets.entries()) {
  console.log(`${index + 1}. ${target.name} -> ${target.relativeDir}`);
}

if (dryRun) {
  console.log("");
  console.log("Dry run complete. No installs were executed.");
  process.exit(0);
}

for (const [index, target] of targets.entries()) {
  console.log("");
  console.log(
    `[${index + 1}/${targets.length}] npm ${target.setupCommandArgs.join(" ")} in ${target.relativeDir}`,
  );

  if (
    target.setupCommandArgs.length !== 1 ||
    target.setupCommandArgs[0] !== "install"
  ) {
    console.error(`Unsupported setup command for ${target.name}`);
    process.exit(1);
  }

  const setupResult = spawnSync(npmCommand, target.setupCommandArgs, {
    cwd: target.dir,
    stdio: "inherit",
  });

  if (setupResult.error) {
    console.error(
      `Failed to run npm ${target.setupCommandArgs.join(" ")} in ${target.relativeDir}: ${setupResult.error.message}`,
    );
    process.exit(1);
  }

  if (typeof setupResult.status === "number" && setupResult.status !== 0) {
    process.exit(setupResult.status);
  }
}

console.log("");
console.log("Workspace setup completed successfully.");
