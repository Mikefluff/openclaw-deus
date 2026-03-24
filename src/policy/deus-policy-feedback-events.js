"use strict";

const {
  POLICY_ACTIVITY_TYPE,
  POLICY_EVENT_TYPES,
} = require("./deus-policy-feedback-constants");
const {
  appendWorkspaceActivityLogEntry,
} = require("../deus/deus-activity-log");
const {
  buildPolicyFeedbackContext,
} = require("./deus-policy-feedback-context");
const {
  buildPolicyFrictionTokens,
} = require("./deus-policy-feedback-friction");
const {
  deriveOutcomeSuccess,
  normalizePolicyEventType,
} = require("./deus-policy-feedback-normalize");
const {
  buildPolicyFeedbackDescription,
  buildPolicyFeedbackLogEntry,
} = require("./deus-policy-feedback-render");

function appendPolicyFeedbackActivity(options = {}) {
  const entry = buildPolicyFeedbackLogEntry(options);

  return appendWorkspaceActivityLogEntry({
    ...entry,
    workspaceRoot: options.workspaceRoot,
    echo: options.echo,
  });
}

function isPolicyActivityEntry(entry = {}) {
  return Boolean(normalizePolicyEventType(entry));
}

module.exports = {
  POLICY_ACTIVITY_TYPE,
  POLICY_EVENT_TYPES,
  appendPolicyFeedbackActivity,
  buildPolicyFeedbackContext,
  buildPolicyFeedbackDescription,
  buildPolicyFeedbackLogEntry,
  buildPolicyFrictionTokens,
  deriveOutcomeSuccess,
  isPolicyActivityEntry,
  normalizePolicyEventType,
};
