"use strict";

const { normalizePolicyStringArray } = require("./action-policy-helpers");
const {
  POLICY_EVENT_TYPES,
  buildPolicyFeedbackDescription,
  normalizePolicyEventType,
} = require("./deus-policy-feedback-events");

const POLICY_MEMORY_SECTION = "Policy Signals";

function formatPolicyFeedbackForMemory(entry = {}) {
  return buildPolicyFeedbackDescription(entry.context || {});
}

function classifyPolicyMemoryEntry(entry = {}) {
  const policyEventType = normalizePolicyEventType(entry);
  const context = entry.context || {};

  if (policyEventType === POLICY_EVENT_TYPES.WORLD_MODEL_REFRESH) {
    return {
      section: "System Events",
      line: formatPolicyFeedbackForMemory(entry),
    };
  }

  if (
    policyEventType === POLICY_EVENT_TYPES.ACTION_OUTCOME &&
    context.success === true &&
    normalizePolicyStringArray(context.blockers).length === 0
  ) {
    return {
      section: "Decisions",
      line: formatPolicyFeedbackForMemory(entry),
    };
  }

  if (
    context.decision === "blocked" ||
    normalizePolicyStringArray(context.blockers).length > 0 ||
    context.success === false
  ) {
    return {
      section: "System Events",
      line: formatPolicyFeedbackForMemory(entry),
    };
  }

  return {
    section: "Decisions",
    line: formatPolicyFeedbackForMemory(entry),
  };
}

function buildPolicyFeedbackMemoryEntries(summary = {}) {
  if (!summary.totalEvents) {
    return [];
  }

  const entries = [
    `Nightly policy feedback: ${summary.totalEvents} recent policy events; dominant decision ${summary.dominantDecision || "unknown"}; dominant outcome ${summary.dominantOutcome || "unknown"}.`,
  ];

  if (summary.dominantBlocker) {
    entries.push(
      `Nightly policy friction: blocker ${summary.dominantBlocker} repeated ${summary.dominantBlockerCount} times across recent policy events.`,
    );
  }

  if (summary.highMaintenanceOutcomes > 0) {
    entries.push(
      `Nightly policy feedback: ${summary.highMaintenanceOutcomes} recent action outcomes showed a high maintenance tail.`,
    );
  }

  return entries;
}

module.exports = {
  POLICY_MEMORY_SECTION,
  buildPolicyFeedbackMemoryEntries,
  classifyPolicyMemoryEntry,
  formatPolicyFeedbackForMemory,
};
