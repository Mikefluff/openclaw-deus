const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AUTHORITIES,
  LAYERS,
  classifyWorkspacePath,
} = require("../src/workspace/workspace-authority");

test("workspace authority classifies code surfaces as canonical trunk", () => {
  const result = classifyWorkspacePath("src/deus/deus-health.js");

  assert.equal(result.layer, LAYERS.CANONICAL_TRUNK);
  assert.equal(result.authority, AUTHORITIES.GITHUB_TRUNK);
});

test("workspace authority classifies STATUS.md as live runtime", () => {
  const result = classifyWorkspacePath("STATUS.md");

  assert.equal(result.layer, LAYERS.LIVE_RUNTIME);
  assert.equal(result.authority, AUTHORITIES.LIVE_WORKSPACE);
});

test("workspace authority classifies memory and introspection outputs as live runtime", () => {
  const memory = classifyWorkspacePath("memory/2026-03-22.md");
  const introspection = classifyWorkspacePath(
    "docs/introspection/introspection-followup.latest.json",
  );
  const dissensus = classifyWorkspacePath("dissensus/open-cases.json");

  assert.equal(memory.layer, LAYERS.LIVE_RUNTIME);
  assert.equal(memory.authority, AUTHORITIES.LIVE_WORKSPACE);
  assert.equal(introspection.layer, LAYERS.LIVE_RUNTIME);
  assert.equal(introspection.authority, AUTHORITIES.LIVE_WORKSPACE);
  assert.equal(dissensus.layer, LAYERS.LIVE_RUNTIME);
  assert.equal(dissensus.authority, AUTHORITIES.LIVE_WORKSPACE);
});

test("workspace authority classifies project data as live runtime", () => {
  const result = classifyWorkspacePath(
    "projects/example-project/data/state.json",
  );

  assert.equal(result.layer, LAYERS.LIVE_RUNTIME);
  assert.equal(result.authority, AUTHORITIES.LIVE_WORKSPACE);
});

test("workspace authority classifies project status and logs as live runtime", () => {
  const statusPath = classifyWorkspacePath(
    "projects/example-project/STATUS.md",
  );
  const logPath = classifyWorkspacePath(
    "projects/example-project/logs/published.json",
  );

  assert.equal(statusPath.layer, LAYERS.LIVE_RUNTIME);
  assert.equal(statusPath.authority, AUTHORITIES.LIVE_WORKSPACE);
  assert.equal(logPath.layer, LAYERS.LIVE_RUNTIME);
  assert.equal(logPath.authority, AUTHORITIES.LIVE_WORKSPACE);
});

test("workspace authority classifies .tmp diagnostics as ephemeral runtime", () => {
  const result = classifyWorkspacePath(
    ".tmp/diagnostics/openclaw-integration-test.json",
  );

  assert.equal(result.layer, LAYERS.EPHEMERAL_RUNTIME);
  assert.equal(result.authority, AUTHORITIES.LOCAL_ONLY);
});

test("workspace authority keeps local AGENTPLANE gateway out of the canonical trunk", () => {
  const result = classifyWorkspacePath("AGENTPLANE.md");

  assert.equal(result.layer, LAYERS.EPHEMERAL_RUNTIME);
  assert.equal(result.authority, AUTHORITIES.LOCAL_ONLY);
});

test("workspace authority keeps local AgentPlane config out of the canonical trunk", () => {
  const result = classifyWorkspacePath(".agentplane/config.json");

  assert.equal(result.layer, LAYERS.EPHEMERAL_RUNTIME);
  assert.equal(result.authority, AUTHORITIES.LOCAL_ONLY);
});

test("workspace authority keeps local AgentPlane task state out of the canonical trunk", () => {
  const result = classifyWorkspacePath(
    ".agentplane/tasks/202603230645-JJKBDA/README.md",
  );

  assert.equal(result.layer, LAYERS.EPHEMERAL_RUNTIME);
  assert.equal(result.authority, AUTHORITIES.LOCAL_ONLY);
});

test("workspace authority keeps promoted runtime snapshots in the canonical trunk", () => {
  const result = classifyWorkspacePath(
    "runtime-snapshots/20260323T080000Z/runtime-state.snapshot.json",
  );

  assert.equal(result.layer, LAYERS.CANONICAL_TRUNK);
  assert.equal(result.authority, AUTHORITIES.GITHUB_TRUNK);
});
