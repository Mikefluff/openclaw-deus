const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  OpenClawIntegrationTest,
  resolveResultsPath,
} = require("./openclaw-integration-test");
const { resolveDiagnosticPaths } = require("../src/runtime/runtime-diagnostics");
const { getWorkspaceDateContext } = require("../src/workspace/workspace-date-context");

async function createWorkspaceFixture() {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "openclaw-integration-fixture-"),
  );

  await fs.mkdir(path.join(workspace, "beliefs"), { recursive: true });
  await fs.mkdir(path.join(workspace, "memory"), { recursive: true });

  await fs.writeFile(path.join(workspace, "SOUL.md"), "# SOUL\n");
  await fs.writeFile(path.join(workspace, "IDENTITY.md"), "# IDENTITY\n");
  await fs.writeFile(path.join(workspace, "USER.md"), "# USER\n");
  await fs.writeFile(path.join(workspace, "DEUS.md"), "# DEUS\n");
  await fs.writeFile(path.join(workspace, "AGENTS.md"), "# AGENTS\n");
  await fs.writeFile(
    path.join(workspace, "beliefs", "core.jsonl"),
    `${JSON.stringify({
      belief_id: "I1",
      content: "Test belief",
      confidence: 1,
      source_type: "axiom",
      timestamp_created: "2026-03-01T00:00:00.000Z",
    })}\n`,
  );
  await fs.writeFile(
    path.join(workspace, "memory", "2026-03-02.md"),
    `# 2026-03-02 — DEUS Activity Log

**Total activities:** 0

## Git Activity
- 2026-03-02 10:00:00 +07: Git test entry

## Commands Executed
- 2026-03-02 10:01:00 +07: test-command

## Decisions
- 2026-03-02 10:02:00 +07: keep fallback behavior

## Interactions with Human

## System Events
`,
  );

  return workspace;
}

test("openclaw integration test writes diagnostics under .tmp instead of tracked logs", async () => {
  const workspace = await createWorkspaceFixture();
  const resultsPath = resolveResultsPath({ workspaceRoot: workspace });
  const diagnosticsPaths = resolveDiagnosticPaths("openclaw-integration-test", {
    workspaceRoot: workspace,
  });

  await new OpenClawIntegrationTest({ workspaceRoot: workspace }).run();

  const persisted = JSON.parse(await fs.readFile(resultsPath, "utf8"));
  const historyEntries = await fs.readdir(diagnosticsPaths.historyDir);
  const todayPath = path.join(
    workspace,
    "memory",
    `${getWorkspaceDateContext().today}.md`,
  );

  assert.equal(
    resultsPath,
    path.join(
      workspace,
      ".tmp",
      "diagnostics",
      "openclaw-integration-test.json",
    ),
  );
  assert.equal(persisted.summary.total > 0, true);
  assert.equal(historyEntries.length, 1);
  await assert.rejects(
    fs.access(path.join(workspace, "logs", "openclaw-integration-test.json")),
    /ENOENT/,
  );
  await assert.rejects(fs.access(todayPath), /ENOENT/);
});
