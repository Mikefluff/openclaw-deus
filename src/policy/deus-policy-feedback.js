const { recordDissensusEvaluation } = require("./deus-dissensus-runtime");
const {
  POLICY_ACTIVITY_TYPE,
  POLICY_EVENT_TYPES,
  appendPolicyFeedbackActivity,
  buildPolicyFeedbackContext,
  buildPolicyFeedbackLogEntry,
  isPolicyActivityEntry,
  normalizePolicyEventType,
} = require("./deus-policy-feedback-events");
const {
  POLICY_MEMORY_SECTION,
  buildPolicyFeedbackMemoryEntries,
  classifyPolicyMemoryEntry,
  formatPolicyFeedbackForMemory,
} = require("./deus-policy-feedback-memory");
const {
  detectRecurringPolicyPatterns,
  readRecentPolicyFeedback,
  readRecentPolicyFeedbackEntries,
  summarizePolicyFeedback,
} = require("./deus-policy-feedback-analysis");

function recordWorldModelRefresh(surface, options = {}) {
  return appendPolicyFeedbackActivity({
    ...options,
    policyEventType: POLICY_EVENT_TYPES.WORLD_MODEL_REFRESH,
    surface,
  });
}

function recordActionEvaluation(evaluation, options = {}) {
  const result = appendPolicyFeedbackActivity({
    ...options,
    policyEventType: POLICY_EVENT_TYPES.ACTION_EVALUATION,
    evaluation,
  });

  if (evaluation?.dissensus) {
    recordDissensusEvaluation(evaluation, options);
  }

  return result;
}

function recordActionOutcome(outcome, options = {}) {
  return appendPolicyFeedbackActivity({
    ...options,
    policyEventType: POLICY_EVENT_TYPES.ACTION_OUTCOME,
    outcome,
  });
}

module.exports = {
  POLICY_ACTIVITY_TYPE,
  POLICY_EVENT_TYPES,
  POLICY_MEMORY_SECTION,
  appendPolicyFeedbackActivity,
  buildPolicyFeedbackContext,
  buildPolicyFeedbackMemoryEntries,
  buildPolicyFeedbackLogEntry,
  classifyPolicyMemoryEntry,
  detectRecurringPolicyPatterns,
  formatPolicyFeedbackForMemory,
  isPolicyActivityEntry,
  normalizePolicyEventType,
  readRecentPolicyFeedback,
  readRecentPolicyFeedbackEntries,
  recordActionEvaluation,
  recordActionOutcome,
  recordWorldModelRefresh,
  summarizePolicyFeedback,
};
