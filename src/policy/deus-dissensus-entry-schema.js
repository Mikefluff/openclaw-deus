"use strict";

const {
  DISSENSUS_CASE_STATUSES,
  DISSENSUS_DECISIONS,
  DISSENSUS_LEVELS,
  DISSENSUS_OVERRIDE_TOKEN_KINDS,
  DISSENSUS_TARGET_CLASSES,
  DISSENSUS_TRIGGER_TYPES,
  DISSENSUS_VERSION,
} = require("./deus-dissensus-constants");
const {
  buildDecisionId,
  buildDissensusFingerprint,
  inferLevelFromDecision,
} = require("./deus-dissensus-ids");
const {
  normalizeEnum,
  normalizeString,
  normalizeStringArray,
} = require("./deus-dissensus-normalize");

function normalizeDissensusDecision(input = {}) {
  const evaluatedAt = normalizeString(
    input.evaluated_at || input.evaluatedAt,
    new Date().toISOString(),
  );
  const decision = normalizeEnum(
    input.decision,
    DISSENSUS_DECISIONS,
    "allow",
  );
  const level = normalizeEnum(
    input.level,
    DISSENSUS_LEVELS,
    inferLevelFromDecision(decision),
  );
  const triggerType = normalizeEnum(
    input.trigger_type || input.triggerType,
    DISSENSUS_TRIGGER_TYPES,
    "none",
  );
  const targetClass = normalizeEnum(
    input.target_class || input.targetClass,
    DISSENSUS_TARGET_CLASSES,
    "general",
  );
  const overrideTokenKind = normalizeEnum(
    input.override_token_kind || input.overrideTokenKind,
    DISSENSUS_OVERRIDE_TOKEN_KINDS,
    input.override_allowed || input.overrideAllowed
      ? "explicit_l2_override"
      : "none",
  );
  const fingerprint = normalizeString(
    input.fingerprint,
    buildDissensusFingerprint({
      ...input,
      trigger_type: triggerType,
      target_class: targetClass,
    }),
  );

  return {
    version:
      typeof input.version === "number" && Number.isFinite(input.version)
        ? input.version
        : DISSENSUS_VERSION,
    decision_id: normalizeString(
      input.decision_id || input.decisionId,
      buildDecisionId(
        {
          ...input,
          trigger_type: triggerType,
          target_class: targetClass,
        },
        evaluatedAt,
      ),
    ),
    evaluated_at: evaluatedAt,
    level,
    decision,
    trigger_type: triggerType,
    action_type: normalizeString(input.action_type || input.actionType, "unknown"),
    target: normalizeString(input.target, "workspace") || "workspace",
    target_class: targetClass,
    invariant_refs: normalizeStringArray(
      input.invariant_refs || input.invariantRefs,
    ),
    reason: normalizeString(input.reason),
    override_allowed: Boolean(
      input.override_allowed ?? input.overrideAllowed,
    ),
    override_token_kind: overrideTokenKind,
    requires_case:
      Boolean(input.requires_case ?? input.requiresCase) ||
      ["pause_l2", "refuse_l3"].includes(decision),
    fingerprint,
    operator_message: normalizeString(
      input.operator_message || input.operatorMessage,
    ),
  };
}

function normalizeDissensusCase(input = {}) {
  return {
    version:
      typeof input.version === "number" && Number.isFinite(input.version)
        ? input.version
        : DISSENSUS_VERSION,
    case_id: normalizeString(
      input.case_id || input.caseId,
      normalizeString(
        input.decision_id || input.decisionId || input.fingerprint,
        buildDecisionId(input),
      ),
    ),
    fingerprint: normalizeString(
      input.fingerprint,
      buildDissensusFingerprint(input),
    ),
    status: normalizeEnum(
      input.status,
      DISSENSUS_CASE_STATUSES,
      "open",
    ),
    opened_at: normalizeString(
      input.opened_at || input.openedAt,
      new Date().toISOString(),
    ),
    last_seen_at: normalizeString(
      input.last_seen_at || input.lastSeenAt || input.opened_at || input.openedAt,
      new Date().toISOString(),
    ),
    resolved_at: normalizeString(
      input.resolved_at || input.resolvedAt,
    ) || null,
    resolution: normalizeString(input.resolution) || null,
    linked_decision_id: normalizeString(
      input.linked_decision_id || input.linkedDecisionId || input.decision_id,
    ),
    action_type: normalizeString(input.action_type || input.actionType, "unknown"),
    target: normalizeString(input.target, "workspace") || "workspace",
    target_class: normalizeEnum(
      input.target_class || input.targetClass,
      DISSENSUS_TARGET_CLASSES,
      "general",
    ),
    decision: normalizeEnum(
      input.decision,
      DISSENSUS_DECISIONS,
      "allow",
    ),
    level: normalizeEnum(
      input.level,
      DISSENSUS_LEVELS,
      inferLevelFromDecision(input.decision),
    ),
    trigger_type: normalizeEnum(
      input.trigger_type || input.triggerType,
      DISSENSUS_TRIGGER_TYPES,
      "none",
    ),
    invariant_refs: normalizeStringArray(
      input.invariant_refs || input.invariantRefs,
    ),
    override_allowed: Boolean(
      input.override_allowed ?? input.overrideAllowed,
    ),
    override_token_kind: normalizeEnum(
      input.override_token_kind || input.overrideTokenKind,
      DISSENSUS_OVERRIDE_TOKEN_KINDS,
      "none",
    ),
    reason: normalizeString(input.reason),
    operator_message: normalizeString(
      input.operator_message || input.operatorMessage,
    ),
  };
}

function createEmptyDissensusOpenCasesArtifact() {
  return {
    version: DISSENSUS_VERSION,
    updated_at: null,
    updated_by: null,
    cases: [],
  };
}

module.exports = {
  createEmptyDissensusOpenCasesArtifact,
  normalizeDissensusCase,
  normalizeDissensusDecision,
};
