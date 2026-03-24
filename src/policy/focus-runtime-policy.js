const STATUS_ALIASES = Object.freeze({
  active: "active",
  working: "active",
  in_progress: "active",
  wait: "waiting",
  waiting: "waiting",
  blocked: "waiting",
  paused: "waiting",
  idle: "idle",
  none: "idle",
  done: "idle",
});

const MODE_ALIASES = Object.freeze({
  working: "working",
  work: "working",
  focus: "focus",
  focused: "focus",
  cron: "cron_follow_through",
  cron_follow_through: "cron_follow_through",
  follow_through: "cron_follow_through",
  sleep: "sleep_reflection",
  sleep_mode: "sleep_reflection",
  sleep_reflection: "sleep_reflection",
  waiting: "idle",
  wait: "idle",
  idle: "idle",
  none: "idle",
});

const FOLLOW_THROUGH_ALIASES = Object.freeze({
  yes: "yes",
  true: "yes",
  y: "yes",
  "1": "yes",
  no: "no",
  false: "no",
  n: "no",
  "0": "no",
});

const FOCUS_RUNTIME_POLICY = Object.freeze({
  version: 1,
  statuses: Object.freeze(["active", "waiting", "idle"]),
  runtimeModes: Object.freeze([
    "working",
    "focus",
    "cron_follow_through",
    "sleep_reflection",
    "idle",
  ]),
  compatibility: Object.freeze({
    active: Object.freeze(["working", "focus", "cron_follow_through"]),
    waiting: Object.freeze(["idle", "cron_follow_through"]),
    idle: Object.freeze(["idle", "sleep_reflection", "cron_follow_through"]),
  }),
  transitions: Object.freeze({
    status: Object.freeze({
      active: Object.freeze(["active", "waiting", "idle"]),
      waiting: Object.freeze(["waiting", "active", "idle"]),
      idle: Object.freeze(["idle", "active", "waiting"]),
    }),
    mode: Object.freeze({
      working: Object.freeze(["working", "focus", "idle", "cron_follow_through"]),
      focus: Object.freeze(["focus", "working", "idle", "cron_follow_through"]),
      cron_follow_through: Object.freeze([
        "cron_follow_through",
        "working",
        "idle",
        "sleep_reflection",
      ]),
      sleep_reflection: Object.freeze([
        "sleep_reflection",
        "idle",
        "cron_follow_through",
      ]),
      idle: Object.freeze([
        "idle",
        "working",
        "focus",
        "cron_follow_through",
        "sleep_reflection",
      ]),
    }),
  }),
  followThrough: Object.freeze({
    requiredValue: "yes",
    allowedStatuses: Object.freeze(["active"]),
    allowedModes: Object.freeze(["working", "focus", "cron_follow_through"]),
  }),
  backgroundReflection: Object.freeze({
    allowedStatuses: Object.freeze(["waiting", "idle"]),
    allowedModes: Object.freeze(["sleep_reflection"]),
  }),
});

function normalizeToken(value, fallback) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
}

function normalizeFocusStatus(value, fallback = "idle") {
  const normalized = normalizeToken(value, fallback);
  return STATUS_ALIASES[normalized] || fallback;
}

function normalizeRuntimeMode(value, fallback = "idle") {
  const normalized = normalizeToken(value, fallback);
  return MODE_ALIASES[normalized] || fallback;
}

function normalizeFollowThroughRequired(value, fallback = "no") {
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }

  const normalized = normalizeToken(value, fallback);
  return FOLLOW_THROUGH_ALIASES[normalized] || fallback;
}

function isAllowedStatusTransition(fromStatus, toStatus) {
  const from = normalizeFocusStatus(fromStatus);
  const to = normalizeFocusStatus(toStatus);
  return FOCUS_RUNTIME_POLICY.transitions.status[from].includes(to);
}

function isAllowedRuntimeModeTransition(fromMode, toMode) {
  const from = normalizeRuntimeMode(fromMode);
  const to = normalizeRuntimeMode(toMode);
  return FOCUS_RUNTIME_POLICY.transitions.mode[from].includes(to);
}

function isModeCompatibleWithStatus(status, mode) {
  const normalizedStatus = normalizeFocusStatus(status);
  const normalizedMode = normalizeRuntimeMode(mode);
  return FOCUS_RUNTIME_POLICY.compatibility[normalizedStatus].includes(
    normalizedMode,
  );
}

function canRunFollowThrough(state = {}) {
  const status = normalizeFocusStatus(state.status);
  const mode = normalizeRuntimeMode(state.mode);
  const followThroughRequired = normalizeFollowThroughRequired(
    state.follow_through_required ?? state.followThroughRequired,
  );

  return (
    followThroughRequired === FOCUS_RUNTIME_POLICY.followThrough.requiredValue &&
    FOCUS_RUNTIME_POLICY.followThrough.allowedStatuses.includes(status) &&
    FOCUS_RUNTIME_POLICY.followThrough.allowedModes.includes(mode)
  );
}

function canRunBackgroundReflection(state = {}) {
  const status = normalizeFocusStatus(state.status);
  const mode = normalizeRuntimeMode(state.mode);

  return (
    FOCUS_RUNTIME_POLICY.backgroundReflection.allowedStatuses.includes(status) &&
    FOCUS_RUNTIME_POLICY.backgroundReflection.allowedModes.includes(mode)
  );
}

function describeRuntimePosture(state = {}) {
  const status = normalizeFocusStatus(state.status);
  const mode = normalizeRuntimeMode(state.mode);
  const followThroughRequired = normalizeFollowThroughRequired(
    state.follow_through_required ?? state.followThroughRequired,
  );

  return {
    status,
    mode,
    followThroughRequired,
    compatible: isModeCompatibleWithStatus(status, mode),
    followThroughAllowed: canRunFollowThrough({
      status,
      mode,
      follow_through_required: followThroughRequired,
    }),
    backgroundReflectionAllowed: canRunBackgroundReflection({ status, mode }),
  };
}

module.exports = {
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
};
