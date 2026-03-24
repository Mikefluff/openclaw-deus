#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");
const {
  LAYERS,
  classifyWorkspacePath,
} = require("../src/workspace/workspace-authority");
const { resolveWorkspaceRoots } = require("../src/workspace/workspace-roots");

const workspaceRoot = path.resolve(__dirname, "..");

function readGitStatus() {
  const result = spawnSync("git", ["status", "--porcelain"], {
    cwd: workspaceRoot,
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(result.stderr || "git status failed");
  }

  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2),
      path: line.slice(3).trim(),
    }));
}

function groupBy(entries, keyFn) {
  const groups = new Map();
  for (const entry of entries) {
    const key = keyFn(entry);
    const existing = groups.get(key) || [];
    existing.push(entry);
    groups.set(key, existing);
  }
  return groups;
}

const entries = readGitStatus();
const tracked = entries.filter((entry) => !entry.status.startsWith("??"));
const untracked = entries.filter((entry) => entry.status.startsWith("??"));

function printGroup(title, rows) {
  console.log(title);
  if (rows.length === 0) {
    console.log("- none");
    return;
  }

  const groups = groupBy(rows, (entry) => {
    const result = classifyWorkspacePath(entry.path);
    return [result.layer, result.authority, result.syncRule].join("|");
  });
  for (const [group, groupEntries] of groups.entries()) {
    const [layer, authority, syncRule] = group.split("|");
    console.log(`- ${layer}:`);
    console.log(`    authority: ${authority}`);
    console.log(`    syncRule: ${syncRule}`);
    for (const entry of groupEntries) {
      const result = classifyWorkspacePath(entry.path);
      console.log(
        `    - ${entry.status} ${entry.path} [rule=${result.ruleId}]`,
      );
    }
  }
}

console.log("Workspace cleanliness report");
console.log(`- tracked changes: ${tracked.length}`);
console.log(`- untracked changes: ${untracked.length}`);
console.log("");
printGroup("Tracked changes", tracked);
console.log("");
printGroup("Untracked changes", untracked);

const liveRuntimeResidue = entries.filter(
  (entry) => classifyWorkspacePath(entry.path).layer === LAYERS.LIVE_RUNTIME,
);
const roots = resolveWorkspaceRoots();

console.log("");
console.log("Workspace roots");
console.log(`- canonical root: ${roots.canonicalRoot}`);
console.log(`- runtime root: ${roots.runtimeRoot}`);
console.log(`- runtime split active: ${roots.runtimeSplit ? "yes" : "no"}`);
console.log(`- snapshot root: ${roots.snapshotRoot}`);

if (liveRuntimeResidue.length === 0) {
  console.log("- tracked live runtime residue: none");
} else {
  console.log("- tracked live runtime residue:");
  for (const entry of liveRuntimeResidue) {
    console.log(`  - ${entry.status} ${entry.path}`);
  }
}
