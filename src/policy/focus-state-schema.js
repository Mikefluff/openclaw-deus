const { normalizePolicyString } = require("./action-policy-helpers");
const {
  canRunBackgroundReflection,
  canRunFollowThrough,
  describeRuntimePosture,
  isModeCompatibleWithStatus,
  normalizeFocusStatus,
  normalizeFollowThroughRequired,
  normalizeRuntimeMode,
} = require("./focus-runtime-policy");

const ABSOLUTE_UTC_WINDOW_PATTERN =
  /\b(\d{2}):(\d{2})\s*UTC\s+on\s+(\d{4}-\d{2}-\d{2})\b/i;
const ISO_UTC_PATTERN = /\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?Z)\b/i;

function normalizeOptional(value) {
  const normalized = normalizePolicyString(value);
  return normalized || null;
}

function normalizeNow(now = new Date()) {
  if (now instanceof Date) {
    return new Date(now.getTime());
  }

  return new Date(now);
}

function extractAbsoluteUtcReference(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return null;
  }

  const isoMatch = text.match(ISO_UTC_PATTERN);
  if (isoMatch) {
    const parsed = new Date(isoMatch[1]);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const windowMatch = text.match(ABSOLUTE_UTC_WINDOW_PATTERN);
  if (!windowMatch) {
    return null;
  }

  const [, hour, minute, dayKey] = windowMatch;
  const parsed = new Date(`${dayKey}T${hour}:${minute}:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function collectStaleAbsoluteWarnings(resolved, now) {
  const warnings = [];
  const nowDate = normalizeNow(now);
  const temporalFields = [
    ["waiting_for", resolved.waiting_for],
    ["next_step", resolved.next_step],
  ];

  for (const [fieldName, value] of temporalFields) {
    const reference = extractAbsoluteUtcReference(value);
    if (reference && reference.getTime() < nowDate.getTime()) {
      warnings.push(`${fieldName}_references_past_utc_window`);
    }
  }

  return warnings;
}

function resolveCompatibleMode(status, mode) {
  if (isModeCompatibleWithStatus(status, mode)) {
    return mode;
  }

  if (status === "active") {
    return "working";
  }

  return "idle";
}

function parseStatusFocusState(statusState = {}) {
  const flat = statusState.flat || statusState || {};
  const rawStatus = normalizeOptional(flat.status);
  const rawMode = normalizeOptional(flat.mode);
  const rawFollowThrough = normalizeOptional(flat.follow_through_required);

  const status = normalizeFocusStatus(
    rawStatus || rawMode || undefined,
    "idle",
  );
  const normalizedMode = normalizeRuntimeMode(
    rawMode || (status === "active" ? "working" : "idle"),
    "idle",
  );
  const mode = resolveCompatibleMode(status, normalizedMode);
  const followThroughRequired = normalizeFollowThroughRequired(
    rawFollowThrough,
    "no",
  );

  const resolved = {
    status,
    mode,
    follow_through_required: followThroughRequired,
    active_project: normalizeOptional(flat.active_project),
    current_focus:
      normalizeOptional(flat.current_focus) || normalizeOptional(flat.goal),
    goal: normalizeOptional(flat.goal),
    next_step: normalizeOptional(flat.next_step),
    waiting_for: normalizeOptional(flat.waiting_for),
    unblock_condition: normalizeOptional(flat.unblock_condition),
  };

  const warnings = [];

  if (statusState.exists === false) {
    warnings.push("missing_status_file");
  }

  if (!rawStatus && rawMode) {
    warnings.push("status_inferred_from_mode");
  }

  if (!rawMode) {
    warnings.push("mode_inferred_from_status");
  }

  if (!isModeCompatibleWithStatus(status, normalizedMode)) {
    warnings.push(`mode_${normalizedMode}_incompatible_with_status_${status}`);
  }

  if (
    resolved.follow_through_required === "yes" &&
    !canRunFollowThrough({
      status: resolved.status,
      mode: resolved.mode,
      follow_through_required: resolved.follow_through_required,
    })
  ) {
    warnings.push("follow_through_requested_outside_active_mode");
  }

  if (
    resolved.status === "waiting" &&
    !resolved.waiting_for &&
    !resolved.unblock_condition
  ) {
    warnings.push("waiting_without_blocker");
  }

  if (resolved.status === "active" && !resolved.next_step) {
    warnings.push("active_without_next_step");
  }

  warnings.push(...collectStaleAbsoluteWarnings(resolved, statusState.now));

  return {
    input: {
      status: rawStatus,
      mode: rawMode,
      follow_through_required: rawFollowThrough,
    },
    resolved,
    gates: {
      ...describeRuntimePosture({
        status: resolved.status,
        mode: resolved.mode,
        follow_through_required: resolved.follow_through_required,
      }),
      backgroundReflectionAllowed: canRunBackgroundReflection({
        status: resolved.status,
        mode: resolved.mode,
      }),
    },
    validation: {
      valid: true,
      errors: [],
      warnings,
    },
  };
}

function summarizeFocusState(statusState = {}) {
  const focusState =
    statusState.focusState || parseStatusFocusState(statusState);
  const resolved = focusState.resolved || {};
  const gates = focusState.gates || {};
  const validation = focusState.validation || {};

  return {
    available: statusState.exists !== false,
    status: resolved.status || null,
    mode: resolved.mode || null,
    activeProject: resolved.active_project || null,
    currentFocus: resolved.current_focus || null,
    nextStep: resolved.next_step || null,
    waitingFor: resolved.waiting_for || null,
    followThroughRequired: resolved.follow_through_required || null,
    followThroughAllowed: Boolean(gates.followThroughAllowed),
    backgroundReflectionAllowed: Boolean(gates.backgroundReflectionAllowed),
    valid: validation.valid !== false,
    warnings: Array.isArray(validation.warnings) ? validation.warnings : [],
  };
}

module.exports = {
  collectStaleAbsoluteWarnings,
  extractAbsoluteUtcReference,
  normalizeNow,
  parseStatusFocusState,
  resolveCompatibleMode,
  summarizeFocusState,
};
