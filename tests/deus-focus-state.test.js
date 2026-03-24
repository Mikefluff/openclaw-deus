const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  createDeusWorkspaceFixtureSync,
} = require("./helpers/deus-workspace-fixture");
const { getDeusFocusState } = require("../src/deus/deus-focus-state");
const {
  getWorkspaceDateContext,
} = require("../src/workspace/workspace-date-context");

function writeFile(workspaceRoot, relativePath, content) {
  const fullPath = path.join(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

test("focus surface summarizes STATUS-derived focus state and sleep posture", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(
    workspaceRoot,
    "STATUS.md",
    "# STATUS.md\n\n## Current state\n- mode: idle\n- active_project: deus\n- status: idle\n- follow_through_required: no\n\n## Open work block\n- goal: bounded sleep reflection\n- next_step: review nightly signals\n",
  );

  const result = getDeusFocusState({
    workspaceRoot,
    now: "2026-03-21T04:40:00.000Z",
  });

  assert.equal(result.focusState.status, "idle");
  assert.equal(result.focusState.mode, "idle");
  assert.equal(result.focusState.activeProject, "deus");
  assert.equal(result.focusState.currentFocus, "bounded sleep reflection");
  assert.equal(result.focusState.nextStep, "review nightly signals");
  assert.equal(result.sleepPlanner.decision, "sleep_reflection");
  assert.equal(result.sleepPlanner.recommendedMode, "sleep_reflection");
  assert.equal(result.executionBoundary.actionExecution, "openclaw_only");
  assert.equal(
    result.executionBoundary.boundedSleepSurface,
    "logs,memory,review,introspection,diagnostics",
  );
});

test("focus script exposes the same canonical focus and sleep data through the official entrypoint", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  const scriptNow = "2026-03-21T12:00:00.000Z";
  const { today } = getWorkspaceDateContext(scriptNow);
  const scriptPath = path.resolve(
    __dirname,
    "..",
    "scripts",
    "deus-focus-state.js",
  );
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(
    workspaceRoot,
    "STATUS.md",
    "# STATUS.md\n\n## Current state\n- mode: waiting\n- active_project: deus\n- status: waiting\n- waiting_for: human input\n- follow_through_required: no\n\n## Open work block\n- goal: hold state\n- next_step: wait for human input\n",
  );

  const output = execFileSync(process.execPath, [scriptPath], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      DEUS_NOW: scriptNow,
      OPENCLAW_WORKSPACE: workspaceRoot,
    },
    encoding: "utf8",
  });
  const result = JSON.parse(output);

  assert.equal(result.workspaceRoot, workspaceRoot);
  assert.equal(result.date.today, today);
  assert.equal(result.focusState.status, "waiting");
  assert.equal(result.focusState.mode, "idle");
  assert.equal(result.sleepPlanner.decision, "wait");
  assert.match(result.sleepPlanner.summary, /outside quiet hours/);
  assert.equal(result.executionBoundary.focusStateSource, "STATUS.md");
});
