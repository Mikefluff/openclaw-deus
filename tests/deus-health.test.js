const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  createDeusWorkspaceFixtureSync,
} = require("./helpers/deus-workspace-fixture");
const {
  getDeusHealthSummary,
  parseTrackedPorcelainEntries,
  summarizeRepo,
} = require("../src/deus/deus-health");
const {
  getWorkspaceDateContext,
  shiftWorkspaceDayKey,
} = require("../src/workspace/workspace-date-context");

function writeFile(workspaceRoot, relativePath, content) {
  const fullPath = path.join(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function commitFixture(workspaceRoot) {
  execFileSync("git", ["add", "."], { cwd: workspaceRoot });
  execFileSync(
    "git",
    [
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.com",
      "commit",
      "-m",
      "fixture",
    ],
    { cwd: workspaceRoot },
  );
}

test("DEUS health summary reports memory, beliefs, introspection, adapter, and repo dirtiness", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  const { today } = getWorkspaceDateContext();
  const yesterday = shiftWorkspaceDayKey(new Date(), -1);

  writeFile(workspaceRoot, `memory/${yesterday}.md`, `# ${yesterday}\n`);
  writeFile(workspaceRoot, `memory/${today}.md`, `# ${today}\n`);
  writeFile(
    workspaceRoot,
    "STATUS.md",
    "# STATUS.md\n\n## Current state\n- mode: working\n- active_project: deus\n- status: working\n\n## Open work block\n- goal: inspect health\n- next_step: inspect DEUS health output\n",
  );
  writeFile(
    workspaceRoot,
    "docs/introspection/introspection-summaries.jsonl",
    `${JSON.stringify({ date: today, coherence: 0.9, needs_llm_analysis: false })}\n`,
  );
  writeFile(
    workspaceRoot,
    `docs/introspection/introspection-${today}.md`,
    "# Introspection\n",
  );
  commitFixture(workspaceRoot);
  writeFile(workspaceRoot, "notes.txt", "dirty\n");
  writeFile(
    workspaceRoot,
    `memory/${today}.md`,
    `# ${today}\ndirty tracked edit\n`,
  );

  const summary = getDeusHealthSummary({
    workspaceRoot,
    now: "2026-03-21T04:40:00.000Z",
  });
  assert.equal(summary.memory.todayExists, true);
  assert.equal(summary.memory.yesterdayExists, true);
  assert.equal(summary.memory.latestDayKey, today);
  assert.equal(summary.memory.daysSinceLatest, 0);
  assert.equal(summary.beliefs.total, 5);
  assert.equal(summary.beliefs.lowConfidence, 0);
  assert.equal(summary.introspection.latestSummary.date, today);
  assert.equal(summary.introspection.latestReport, `introspection-${today}.md`);
  assert.equal(typeof summary.adapter.memorySearchAvailable, "boolean");
  assert.equal(summary.policy.worldModel.activeProject, "deus");
  assert.equal(typeof summary.policy.worldModel.confidence, "number");
  assert.equal(summary.policy.focusState.status, "active");
  assert.equal(summary.policy.focusState.mode, "working");
  assert.equal(summary.policy.focusState.activeProject, "deus");
  assert.equal(summary.policy.focusState.currentFocus, "inspect health");
  assert.equal(
    summary.policy.focusState.nextStep,
    "inspect DEUS health output",
  );
  assert.equal(summary.policy.focusState.followThroughRequired, "no");
  assert.equal(summary.policy.focusState.followThroughAllowed, false);
  assert.equal(summary.policy.sleepPlanner.decision, "wait");
  assert.equal(summary.policy.sleepPlanner.recommendedMode, "idle");
  assert.equal(summary.policy.sleepPlanner.quietHours.active, true);
  assert.equal(summary.policy.sleepPlanner.nightlyWindow.active, true);
  assert.equal(
    summary.policy.sleepPlanner.backgroundReflection.allowedNow,
    false,
  );
  assert.equal(summary.policy.actionPolicy.decision, "direct_act");
  assert.equal(summary.policy.actionPolicy.recommendedMode, "direct_act");
  assert.equal(summary.repo.dirty, true);
  assert.ok(summary.repo.changes >= 1);
  assert.equal(summary.repo.untracked, 0);
});

test("parseTrackedPorcelainEntries parses NUL-delimited porcelain output", () => {
  const output = " M src/deus/deus-health.js\u0000R  old.txt -> new.txt\u0000";

  assert.deepEqual(parseTrackedPorcelainEntries(output), [
    "M src/deus/deus-health.js",
    "R  old.txt -> new.txt",
  ]);
});

test("summarizeRepo uses tracked-only porcelain status flags", () => {
  const seen = [];
  const summary = summarizeRepo(process.cwd(), (command) => {
    seen.push(command);
    return Buffer.from(" M src/deus/deus-health.js\u0000");
  });

  assert.deepEqual(seen, ["git status --porcelain -z --untracked-files=no"]);
  assert.equal(summary.dirty, true);
  assert.equal(summary.changes, 1);
  assert.equal(summary.untracked, 0);
});
