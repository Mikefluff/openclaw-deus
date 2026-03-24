const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  listKnownRuntimeSurfacePaths,
} = require("../src/runtime/runtime-surface-paths");
const {
  createDeusWorkspaceFixtureSync,
} = require("./helpers/deus-workspace-fixture");

function writeFile(root, relativePath, content) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
}

test("known runtime surfaces include project status, data, and logs when present", (t) => {
  const canonicalRoot = createDeusWorkspaceFixtureSync();
  const runtimeRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "deus-runtime-surface-"),
  );

  t.after(() => {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
    fs.rmSync(canonicalRoot, { recursive: true, force: true });
  });

  writeFile(
    canonicalRoot,
    "projects/example-project/STATUS.md",
    "# STATUS.md\n\n- paused\n",
  );
  writeFile(
    canonicalRoot,
    "projects/example-project/logs/published.json",
    "[]\n",
  );
  writeFile(runtimeRoot, "projects/example-project/data/state.json", "[]\n");

  const surfaces = listKnownRuntimeSurfacePaths({
    workspaceRoot: canonicalRoot,
    runtimeRoot,
  });

  assert.ok(surfaces.includes("projects/example-project/STATUS.md"));
  assert.ok(surfaces.includes("projects/example-project/data"));
  assert.ok(surfaces.includes("projects/example-project/logs"));
  assert.ok(surfaces.includes("dissensus"));
  assert.ok(surfaces.includes("dissensus/open-cases.json"));
});
