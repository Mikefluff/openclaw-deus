const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  relativizeKnownWorkspacePath,
  resolveWorkspaceFilePath,
  resolveWorkspaceRoots,
} = require("../src/workspace/workspace-roots");
const {
  resolveBeliefsPath,
  resolveBeliefsWritePath,
  resolveMemoryPath,
  resolveMemoryWritePath,
} = require("../src/runtime/runtime-surface-paths");
const {
  createDeusWorkspaceFixtureSync,
} = require("./helpers/deus-workspace-fixture");

test("workspace roots default to the canonical repository when no runtime root is configured", (t) => {
  const canonicalRoot = createDeusWorkspaceFixtureSync();

  t.after(() => {
    fs.rmSync(canonicalRoot, { recursive: true, force: true });
  });

  const roots = resolveWorkspaceRoots({ workspaceRoot: canonicalRoot });

  assert.equal(roots.canonicalRoot, canonicalRoot);
  assert.equal(roots.runtimeRoot, canonicalRoot);
  assert.equal(roots.runtimeSplit, false);
});

test("runtime surface reads resolve against canonical files by default", (t) => {
  const canonicalRoot = createDeusWorkspaceFixtureSync();

  t.after(() => {
    fs.rmSync(canonicalRoot, { recursive: true, force: true });
  });

  const memoryPath = resolveMemoryPath("2026-03-02", {
    workspaceRoot: canonicalRoot,
  });
  const beliefsPath = resolveBeliefsPath({
    workspaceRoot: canonicalRoot,
  });

  assert.equal(memoryPath, path.join(canonicalRoot, "memory", "2026-03-02.md"));
  assert.equal(beliefsPath, path.join(canonicalRoot, "beliefs", "core.jsonl"));
});

test("runtime surface writes target an explicit runtime root when it is configured", (t) => {
  const canonicalRoot = createDeusWorkspaceFixtureSync();
  const runtimeRoot = path.join(canonicalRoot, ".tmp", "runtime-state");
  fs.mkdirSync(runtimeRoot, { recursive: true });

  t.after(() => {
    fs.rmSync(canonicalRoot, { recursive: true, force: true });
  });

  assert.equal(
    resolveMemoryWritePath("2026-03-18", {
      workspaceRoot: canonicalRoot,
      runtimeRoot,
    }),
    path.join(runtimeRoot, "memory", "2026-03-18.md"),
  );
  assert.equal(
    resolveBeliefsWritePath({
      workspaceRoot: canonicalRoot,
      runtimeRoot,
    }),
    path.join(runtimeRoot, "beliefs", "core.jsonl"),
  );
  assert.equal(
    resolveWorkspaceFilePath("src/deus/deus-health.js", {
      workspaceRoot: canonicalRoot,
      runtimeRoot,
      forWrite: true,
    }),
    path.join(canonicalRoot, "src", "deus", "deus-health.js"),
  );
});

test("relativizeKnownWorkspacePath normalizes both canonical and runtime absolute paths", (t) => {
  const canonicalRoot = createDeusWorkspaceFixtureSync();
  const runtimeRoot = path.join(canonicalRoot, ".tmp", "runtime-state");
  fs.mkdirSync(runtimeRoot, { recursive: true });

  t.after(() => {
    fs.rmSync(canonicalRoot, { recursive: true, force: true });
  });

  const runtimeTarget = path.join(runtimeRoot, "memory", "2026-03-18.md");
  const canonicalTarget = path.join(
    canonicalRoot,
    "src",
    "deus",
    "deus-health.js",
  );

  assert.equal(
    relativizeKnownWorkspacePath(runtimeTarget, {
      workspaceRoot: canonicalRoot,
      runtimeRoot,
    }),
    "memory/2026-03-18.md",
  );
  assert.equal(
    relativizeKnownWorkspacePath(canonicalTarget, {
      workspaceRoot: canonicalRoot,
      runtimeRoot,
    }),
    "src/deus/deus-health.js",
  );
});
