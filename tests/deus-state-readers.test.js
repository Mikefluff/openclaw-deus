const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { createDeusWorkspaceFixtureSync } = require("./helpers/deus-workspace-fixture");
const {
  readBeliefs,
  readLatestIntrospectionSummary,
  readOpenTensions,
  readPendingBeliefs,
  readProjectsSnapshot,
  readRecentLogs,
  readRecentMemory,
  readStatusState,
} = require("../src/deus/deus-state-readers");

function writeFile(workspaceRoot, relativePath, content) {
  const fullPath = path.join(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

test("state readers return beliefs memory and logs from the workspace fixture", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(
    workspaceRoot,
    "memory/2026-03-19.md",
    "# 2026-03-19 - DEUS Activity Log\n\n## Git Activity\n- 2026-03-19 10:00:00 +07: fixture\n",
  );
  writeFile(
    workspaceRoot,
    "logs/2026-03-19.jsonl",
    `${JSON.stringify({ type: "decision", description: "second fixture entry" })}\n`,
  );

  const beliefs = readBeliefs({ workspaceRoot });
  const memoryEntries = readRecentMemory({ workspaceRoot, limit: 2 });
  const logEntries = readRecentLogs({ workspaceRoot, fileLimit: 2, limit: 5 });

  assert.equal(beliefs.length, 5);
  assert.deepEqual(
    memoryEntries.map((entry) => entry.dayKey),
    ["2026-03-19", "2026-03-02"],
  );
  assert.equal(logEntries.length, 2);
  assert.equal(logEntries[0].dayKey, "2026-03-18");
  assert.equal(logEntries[1].dayKey, "2026-03-19");
});

test("state readers parse status review and introspection surfaces without requiring a full runtime", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(
    workspaceRoot,
    "STATUS.md",
    "# STATUS.md\n\n## Current state\n- mode: working\n- active_project: deus\n- status: waiting\n\n## Open work block\n- goal: build world model\n- next_step: add readers\n",
  );
  writeFile(
    workspaceRoot,
    "PROJECTS.md",
    "# PROJECTS.md\n\n## Current Projects\n- placeholder\n",
  );
  writeFile(
    workspaceRoot,
    "review/pending-beliefs.md",
    "# Pending Belief Promotions\n\n## 2026-03-21T00:00:00Z - fixture\n- marker: reader-foundation\n- candidate: Shared DEUS state readers should exist.\n",
  );
  writeFile(
    workspaceRoot,
    "review/open-tensions.md",
    "# Open Tensions\n\n## 2026-03-21T00:00:00Z - fixture\n- marker: policy-gap\n- unresolved_issue: No world model yet.\n",
  );
  writeFile(
    workspaceRoot,
    "docs/introspection/introspection-summaries.jsonl",
    `${JSON.stringify({ date: "2026-03-20", coherence: 0.7 })}\n${JSON.stringify({ date: "2026-03-21", coherence: 0.8 })}\n`,
  );

  const status = readStatusState({ workspaceRoot });
  const projects = readProjectsSnapshot({ workspaceRoot });
  const pendingBeliefs = readPendingBeliefs({ workspaceRoot });
  const openTensions = readOpenTensions({ workspaceRoot });
  const introspection = readLatestIntrospectionSummary({ workspaceRoot });

  assert.equal(status.exists, true);
  assert.equal(status.sections.current_state.fields.mode, "working");
  assert.equal(status.sections.open_work_block.fields.next_step, "add readers");
  assert.equal(status.flat.active_project, "deus");
  assert.equal(status.focusState.resolved.status, "waiting");
  assert.equal(status.focusState.resolved.mode, "idle");
  assert.equal(status.focusState.resolved.current_focus, "build world model");
  assert.match(
    status.focusState.validation.warnings.join(" "),
    /mode_working_incompatible_with_status_waiting/,
  );
  assert.equal(projects.exists, true);
  assert.match(projects.raw, /Current Projects/);
  assert.deepEqual(pendingBeliefs.markers, ["reader-foundation"]);
  assert.deepEqual(openTensions.markers, ["policy-gap"]);
  assert.deepEqual(introspection.summary, {
    date: "2026-03-21",
    coherence: 0.8,
  });
});
