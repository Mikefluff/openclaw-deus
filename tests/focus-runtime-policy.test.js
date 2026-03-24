const test = require("node:test");
const assert = require("node:assert/strict");

const {
  FOCUS_RUNTIME_POLICY,
  canRunBackgroundReflection,
  canRunFollowThrough,
  describeRuntimePosture,
  isAllowedRuntimeModeTransition,
  isAllowedStatusTransition,
  isModeCompatibleWithStatus,
  normalizeFocusStatus,
  normalizeFollowThroughRequired,
  normalizeRuntimeMode,
} = require("../src/policy/focus-runtime-policy");

test("focus/runtime policy exposes the canonical status and mode taxonomy", () => {
  assert.deepEqual(FOCUS_RUNTIME_POLICY.statuses, ["active", "waiting", "idle"]);
  assert.deepEqual(FOCUS_RUNTIME_POLICY.runtimeModes, [
    "working",
    "focus",
    "cron_follow_through",
    "sleep_reflection",
    "idle",
  ]);
});

test("normalization resolves legacy aliases into the canonical matrix", () => {
  assert.equal(normalizeFocusStatus("working"), "active");
  assert.equal(normalizeFocusStatus("blocked"), "waiting");
  assert.equal(normalizeRuntimeMode("cron"), "cron_follow_through");
  assert.equal(normalizeRuntimeMode("sleep_mode"), "sleep_reflection");
  assert.equal(normalizeRuntimeMode("waiting"), "idle");
  assert.equal(normalizeFollowThroughRequired(true), "yes");
  assert.equal(normalizeFollowThroughRequired("0"), "no");
});

test("transition guards enforce the canonical status and mode graph", () => {
  assert.equal(isAllowedStatusTransition("active", "waiting"), true);
  assert.equal(isAllowedStatusTransition("idle", "active"), true);
  assert.equal(isAllowedRuntimeModeTransition("working", "focus"), true);
  assert.equal(isAllowedRuntimeModeTransition("sleep_reflection", "cron_follow_through"), true);
  assert.equal(isAllowedRuntimeModeTransition("sleep_reflection", "focus"), false);
});

test("compatibility and gate helpers separate active follow-through from background reflection", () => {
  assert.equal(isModeCompatibleWithStatus("active", "focus"), true);
  assert.equal(isModeCompatibleWithStatus("waiting", "working"), false);
  assert.equal(canRunFollowThrough({ status: "active", mode: "focus", follow_through_required: "yes" }), true);
  assert.equal(canRunFollowThrough({ status: "waiting", mode: "cron", follow_through_required: "yes" }), false);
  assert.equal(canRunBackgroundReflection({ status: "idle", mode: "sleep_mode" }), true);
  assert.equal(canRunBackgroundReflection({ status: "active", mode: "sleep_mode" }), false);
});

test("runtime posture description returns normalized state plus gate decisions", () => {
  assert.deepEqual(
    describeRuntimePosture({
      status: "working",
      mode: "cron",
      follow_through_required: true,
    }),
    {
      status: "active",
      mode: "cron_follow_through",
      followThroughRequired: "yes",
      compatible: true,
      followThroughAllowed: true,
      backgroundReflectionAllowed: false,
    },
  );
});
