const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  detectEntrypointDrift,
  readEntrypointSnapshot,
} = require("../src/introspection/entrypoint-drift-detector");

test("entrypoint drift detector reports disappearing bootstrap files", async () => {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "entrypoint-drift-detector-"),
  );

  await fs.mkdir(path.join(workspace, "beliefs"), { recursive: true });
  await fs.writeFile(path.join(workspace, "AGENTS.md"), "# AGENTS\n");
  await fs.writeFile(path.join(workspace, "SOUL.md"), "# SOUL\n");
  await fs.writeFile(path.join(workspace, "USER.md"), "# USER\n");
  await fs.writeFile(path.join(workspace, "DEUS.md"), "# DEUS\n");
  await fs.writeFile(path.join(workspace, "IDENTITY.md"), "# IDENTITY\n");
  await fs.writeFile(
    path.join(workspace, "beliefs", "core.jsonl"),
    `${JSON.stringify({ belief_id: "I1" })}\n`,
  );

  const beforeSnapshot = readEntrypointSnapshot({ workspaceRoot: workspace });
  await fs.unlink(path.join(workspace, "AGENTS.md"));
  const afterSnapshot = readEntrypointSnapshot({ workspaceRoot: workspace });
  const drift = detectEntrypointDrift(beforeSnapshot, afterSnapshot);

  assert.equal(drift.detected, true);
  assert.deepEqual(drift.changes, [
    {
      relativePath: "AGENTS.md",
      type: "missing",
    },
  ]);
  assert.equal(drift.summary, "AGENTS.md missing");
});
