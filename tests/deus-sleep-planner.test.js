const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseStatusFocusState,
  summarizeFocusState,
} = require("../src/policy/focus-state-schema");
const {
  getNextFollowThroughRun,
  planBoundedSleep,
} = require("../src/deus/deus-sleep-planner");

function createStatusState(flat) {
  const statusState = {
    exists: true,
    flat,
  };
  statusState.focusState = parseStatusFocusState(statusState);
  return statusState;
}

test("sleep planner recommends sleep_reflection during the nightly window for idle workspaces", () => {
  const statusState = createStatusState({
    status: "idle",
    mode: "idle",
    active_project: "deus",
    current_focus: "nightly maintenance",
    follow_through_required: "no",
  });

  const result = planBoundedSleep({
    now: "2026-03-21T04:40:00.000Z",
    statusState,
    focusState: summarizeFocusState(statusState),
    beliefs: [{ belief_id: "I1" }],
    recentMemory: [{ dayKey: "2026-03-21" }],
    recentLogs: [],
    introspection: { summary: { date: "2026-03-20" } },
  });

  assert.equal(result.decision, "sleep_reflection");
  assert.equal(result.recommendedMode, "sleep_reflection");
  assert.equal(result.quietHours.active, true);
  assert.equal(result.nightlyWindow.active, true);
  assert.equal(result.backgroundReflection.allowedNow, true);
  assert.equal(result.state.currentModeAlreadySleep, false);
});

test("sleep planner keeps active follow-through ahead of sleep reflection", () => {
  const statusState = createStatusState({
    status: "active",
    mode: "working",
    active_project: "deus",
    current_focus: "finish active task",
    follow_through_required: "yes",
  });

  const result = planBoundedSleep({
    now: "2026-03-21T04:40:00.000Z",
    statusState,
    focusState: summarizeFocusState(statusState),
    beliefs: [{ belief_id: "I1" }],
    recentMemory: [{ dayKey: "2026-03-21" }],
    recentLogs: [{ type: "event" }],
    introspection: { summary: { date: "2026-03-20" } },
  });

  assert.equal(result.decision, "cron_follow_through");
  assert.equal(result.followThrough.allowed, true);
  assert.equal(result.backgroundReflection.allowedNow, false);
});

test("sleep planner waits during quiet hours until the nightly maintenance window opens", () => {
  const statusState = createStatusState({
    status: "waiting",
    mode: "idle",
    waiting_for: "human approval",
    follow_through_required: "no",
  });

  const result = planBoundedSleep({
    now: "2026-03-21T23:30:00.000Z",
    statusState,
    focusState: summarizeFocusState(statusState),
    beliefs: [{ belief_id: "I1" }],
    recentMemory: [{ dayKey: "2026-03-21" }],
    recentLogs: [],
    introspection: { summary: { date: "2026-03-20" } },
  });

  assert.equal(result.quietHours.active, true);
  assert.equal(result.nightlyWindow.active, false);
  assert.equal(result.decision, "wait");
  assert.match(result.summary, /outside the nightly DEUS maintenance window/);
});

test("sleep planner requests preparation when the nightly window is open but workspace readiness is incomplete", () => {
  const statusState = createStatusState({
    status: "idle",
    mode: "idle",
    follow_through_required: "no",
  });

  const result = planBoundedSleep({
    now: "2026-03-21T04:40:00.000Z",
    statusState,
    focusState: summarizeFocusState(statusState),
    beliefs: [],
    recentMemory: [],
    recentLogs: [],
    introspection: {},
  });

  assert.equal(result.decision, "prepare_conditions");
  assert.deepEqual(result.readiness.blockers, [
    "missing_beliefs",
    "missing_recent_evidence",
  ]);
});

test("sleep planner resolves the next follow-through slot with server stagger applied", () => {
  const nextRun = getNextFollowThroughRun("2026-03-21T16:31:00.000Z");

  assert.equal(nextRun.utc, "2026-03-21T18:05:00.000Z");
  assert.equal(nextRun.localDayKey, "2026-03-21");
  assert.equal(nextRun.localTime, "18:05");
  assert.equal(nextRun.staggerMinutes, 5);
});
