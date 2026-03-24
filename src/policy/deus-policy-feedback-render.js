"use strict";

const {
  POLICY_EVENT_TYPES,
} = require("./deus-policy-feedback-constants");
const {
  buildPolicyFeedbackContext,
} = require("./deus-policy-feedback-context");
const { normalizePolicyStringArray } = require("./action-policy-helpers");

function buildPolicyFeedbackDescription(context) {
  if (context.policyEventType === POLICY_EVENT_TYPES.WORLD_MODEL_REFRESH) {
    const parts = [
      `Policy refresh for ${context.activeProject || context.target || "workspace"}`,
    ];

    if (typeof context.worldModelConfidence === "number") {
      parts.push(`confidence ${context.worldModelConfidence.toFixed(2)}`);
    }
    if (context.decision) {
      parts.push(`decision ${context.decision}`);
    }

    return parts.join("; ");
  }

  if (context.policyEventType === POLICY_EVENT_TYPES.ACTION_OUTCOME) {
    const outcomeLabel = context.success === false ? "failed" : "success";
    const parts = [
      `Policy outcome ${outcomeLabel} for ${context.actionType || "action"} on ${context.target || "workspace"}`,
    ];

    if (context.maintenanceTailObserved) {
      parts.push(`maintenance ${context.maintenanceTailObserved}`);
    }
    if (normalizePolicyStringArray(context.blockers).length > 0) {
      parts.push(`friction ${context.blockers.join(", ")}`);
    }

    return parts.join("; ");
  }

  return `Policy evaluation ${context.decision || "recorded"} for ${context.actionType || "action"} on ${context.target || "workspace"}`;
}

function buildPolicyFeedbackLogEntry(options = {}) {
  const context = buildPolicyFeedbackContext(options);

  return {
    timestamp: options.timestamp || new Date().toISOString(),
    type: context.policyEventType,
    description: buildPolicyFeedbackDescription(context),
    context,
    agent: "DEUS",
  };
}

module.exports = {
  buildPolicyFeedbackDescription,
  buildPolicyFeedbackLogEntry,
};
