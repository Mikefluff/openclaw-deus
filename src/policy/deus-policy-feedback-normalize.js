"use strict";

const { normalizePolicyStringArray } = require("./action-policy-helpers");
const { POLICY_EVENT_TYPES } = require("./deus-policy-feedback-constants");

function normalizePolicyEventType(input = {}) {
  const raw =
    typeof input === "string"
      ? input
      : input.context?.policyEventType ||
        input.context?.policy_event ||
        input.policyEventType ||
        input.policy_event ||
        input.kind ||
        input.type;
  const normalized = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (Object.values(POLICY_EVENT_TYPES).includes(normalized)) {
    return normalized;
  }

  return null;
}

function deriveOutcomeSuccess(outcome = {}, policyEventType, evaluation = {}) {
  if (typeof outcome.success === "boolean") {
    return outcome.success;
  }

  const normalizedOutcome =
    normalizePolicyStringArray([outcome.outcome])[0] || null;
  if (normalizedOutcome === "success") {
    return true;
  }
  if (["failed", "blocked", "aborted"].includes(normalizedOutcome)) {
    return false;
  }

  if (policyEventType === POLICY_EVENT_TYPES.ACTION_OUTCOME) {
    return evaluation.success ?? null;
  }

  return null;
}

module.exports = {
  deriveOutcomeSuccess,
  normalizePolicyEventType,
};
