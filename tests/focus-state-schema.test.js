const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseStatusFocusState,
  resolveCompatibleMode,
} = require("../src/policy/focus-state-schema");

test("focus-state parser resolves a coherent runtime state from STATUS fields", () => {
  const parsed = parseStatusFocusState({
    exists: true,
    flat: {
      mode: "working",
      status: "waiting",
      active_project: "deus",
      goal: "Build parser",
      next_step: "add validator",
      waiting_for: "human confirmation",
      follow_through_required: "yes",
    },
  });

  assert.deepEqual(parsed.input, {
    status: "waiting",
    mode: "working",
    follow_through_required: "yes",
  });
  assert.deepEqual(parsed.resolved, {
    status: "waiting",
    mode: "idle",
    follow_through_required: "yes",
    active_project: "deus",
    current_focus: "Build parser",
    goal: "Build parser",
    next_step: "add validator",
    waiting_for: "human confirmation",
    unblock_condition: null,
  });
  assert.equal(parsed.gates.compatible, true);
  assert.equal(parsed.gates.followThroughAllowed, false);
  assert.match(parsed.validation.warnings.join(" "), /incompatible/);
  assert.match(
    parsed.validation.warnings.join(" "),
    /follow_through_requested_outside_active_mode/,
  );
});

test("focus-state parser infers missing fields and exposes missing-status warnings", () => {
  const parsed = parseStatusFocusState({
    exists: false,
    flat: {},
  });

  assert.equal(parsed.resolved.status, "idle");
  assert.equal(parsed.resolved.mode, "idle");
  assert.equal(parsed.resolved.follow_through_required, "no");
  assert.match(parsed.validation.warnings.join(" "), /missing_status_file/);
  assert.match(
    parsed.validation.warnings.join(" "),
    /mode_inferred_from_status/,
  );
});

test("focus-state parser flags stale absolute UTC waiting references", () => {
  const parsed = parseStatusFocusState({
    exists: true,
    now: "2026-03-22T14:00:00.000Z",
    flat: {
      mode: "working",
      status: "active",
      active_project: "deus",
      goal: "Monitor runtime drift",
      next_step:
        "monitor the next scheduled editorial window at 03:00 UTC on 2026-03-22",
      waiting_for: "next scheduled editorial window at 03:00 UTC on 2026-03-22",
      follow_through_required: "yes",
    },
  });

  assert.equal(parsed.resolved.status, "active");
  assert.equal(parsed.resolved.mode, "working");
  assert.match(
    parsed.validation.warnings.join(" "),
    /waiting_for_references_past_utc_window/,
  );
  assert.match(
    parsed.validation.warnings.join(" "),
    /next_step_references_past_utc_window/,
  );
});

test("compatible-mode resolver keeps coherent states and downgrades incompatible ones", () => {
  assert.equal(resolveCompatibleMode("active", "focus"), "focus");
  assert.equal(resolveCompatibleMode("waiting", "working"), "idle");
  assert.equal(resolveCompatibleMode("idle", "focus"), "idle");
});
