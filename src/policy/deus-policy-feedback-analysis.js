"use strict";

const { normalizePolicyStringArray } = require("./action-policy-helpers");
const { readWorkspaceActivityLogEntries } = require("../deus/deus-activity-log");
const {
  POLICY_EVENT_TYPES,
  isPolicyActivityEntry,
  normalizePolicyEventType,
} = require("./deus-policy-feedback-events");

function readRecentPolicyFeedbackEntries(options = {}) {
  return readWorkspaceActivityLogEntries(options).filter(isPolicyActivityEntry);
}

function buildSortedCounts(counter) {
  return Object.entries(counter)
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .map(([value, count]) => ({ value, count }));
}

function incrementCounts(counter, values) {
  for (const value of normalizePolicyStringArray(values)) {
    counter[value] = (counter[value] || 0) + 1;
  }
}

function summarizePolicyFeedbackEntries(entries = []) {
  const decisionCounts = {};
  const blockerCounts = {};
  const outcomeCounts = {};
  const frictionCounts = {};
  const highCostActionTypeCounts = {};
  let worldModelRefreshes = 0;
  let evaluations = 0;
  let outcomes = 0;
  let blockedEvaluations = 0;
  let failedOutcomes = 0;
  let highMaintenanceOutcomes = 0;

  for (const entry of entries) {
    const context = entry.context || {};
    const policyEventType = normalizePolicyEventType(entry);

    if (policyEventType === POLICY_EVENT_TYPES.WORLD_MODEL_REFRESH) {
      worldModelRefreshes += 1;
    } else if (policyEventType === POLICY_EVENT_TYPES.ACTION_OUTCOME) {
      outcomes += 1;
      if (context.success === false) {
        failedOutcomes += 1;
      }
      if (context.maintenanceTailObserved === "high") {
        highMaintenanceOutcomes += 1;
      }
    } else if (policyEventType === POLICY_EVENT_TYPES.ACTION_EVALUATION) {
      evaluations += 1;
      if (context.decision === "blocked") {
        blockedEvaluations += 1;
      }
    }

    if (context.decision) {
      decisionCounts[context.decision] =
        (decisionCounts[context.decision] || 0) + 1;
    }

    const outcomeLabel =
      typeof context.success === "boolean"
        ? context.success
          ? "success"
          : "failed"
        : null;
    if (outcomeLabel) {
      outcomeCounts[outcomeLabel] = (outcomeCounts[outcomeLabel] || 0) + 1;
    }

    incrementCounts(blockerCounts, context.blockers);
    incrementCounts(frictionCounts, context.friction);

    if (
      (context.costBand === "high" ||
        context.maintenanceTailObserved === "high") &&
      context.actionType
    ) {
      highCostActionTypeCounts[context.actionType] =
        (highCostActionTypeCounts[context.actionType] || 0) + 1;
    }
  }

  const topBlockers = buildSortedCounts(blockerCounts).map(
    ({ value, count }) => ({
      blocker: value,
      count,
    }),
  );
  const highCostActionTypes = buildSortedCounts(highCostActionTypeCounts).map(
    ({ value, count }) => ({
      actionType: value,
      count,
    }),
  );
  const dominantDecision = buildSortedCounts(decisionCounts)[0] || null;
  const dominantOutcome = buildSortedCounts(outcomeCounts)[0] || null;
  const dominantBlocker = topBlockers[0] || null;

  return {
    total: entries.length,
    totalEvents: entries.length,
    worldModelRefreshes,
    evaluations,
    outcomes,
    blockedEvaluations,
    failedOutcomes,
    highMaintenanceOutcomes,
    decisionCounts,
    blockerCounts,
    outcomeCounts,
    frictionCounts,
    topBlockers,
    highCostActionTypes,
    dominantDecision: dominantDecision?.value || null,
    dominantDecisionCount: dominantDecision?.count || 0,
    dominantOutcome: dominantOutcome?.value || null,
    dominantOutcomeCount: dominantOutcome?.count || 0,
    dominantBlocker: dominantBlocker?.blocker || null,
    dominantBlockerCount: dominantBlocker?.count || 0,
  };
}

function summarizePolicyFeedback(entries = []) {
  return summarizePolicyFeedbackEntries(entries.filter(isPolicyActivityEntry));
}

function buildEvidenceSources(entries, predicate) {
  return [
    ...new Set(
      entries
        .filter(predicate)
        .map((entry) => `logs/${entry.fileName || `${entry.dayKey}.jsonl`}`),
    ),
  ].sort();
}

function detectRecurringPolicyPatterns(entries = [], options = {}) {
  const minCount = options.minCount || 2;
  const summary = summarizePolicyFeedbackEntries(entries);
  const patterns = [];

  const confirmationCount =
    summary.blockerCounts.missing_human_confirmation || 0;
  if (confirmationCount >= minCount) {
    patterns.push({
      name: "confirmation_gating_pressure",
      category: "operational",
      summary:
        "confirmation gating should remain explicit and early because recent policy feedback repeatedly stalled on missing human confirmation.",
      recurrence: confirmationCount,
      evidenceSources: buildEvidenceSources(entries, (entry) =>
        normalizePolicyStringArray(entry.context?.blockers).includes(
          "missing_human_confirmation",
        ),
      ),
    });
  }

  const dependencyEntries = entries.filter((entry) =>
    normalizePolicyStringArray(entry.context?.friction).some((token) =>
      token.startsWith("precondition:dependency_not_ready"),
    ),
  );
  if (dependencyEntries.length >= minCount) {
    patterns.push({
      name: "dependency_readiness_gaps",
      category: "operational",
      summary:
        "dependency readiness gaps are recurring in recent policy feedback and should stay visible before high-cost actions.",
      recurrence: dependencyEntries.length,
      evidenceSources: buildEvidenceSources(dependencyEntries, () => true),
    });
  }

  const highMaintenanceEntries = entries.filter(
    (entry) => entry.context?.maintenanceTailObserved === "high",
  );
  if (highMaintenanceEntries.length >= minCount) {
    patterns.push({
      name: "high_maintenance_action_tail",
      category: "operational",
      summary:
        "high maintenance tail is recurring after recent actions and should remain part of execution-cost review.",
      recurrence: highMaintenanceEntries.length,
      evidenceSources: buildEvidenceSources(highMaintenanceEntries, () => true),
    });
  }

  return patterns;
}

function readRecentPolicyFeedback(options = {}) {
  const entries = readRecentPolicyFeedbackEntries({
    workspaceRoot: options.workspaceRoot,
    days: options.limitDays || options.days || 7,
    limit: options.limit || 100,
  });

  return {
    entries,
    summary: summarizePolicyFeedbackEntries(entries),
  };
}

module.exports = {
  detectRecurringPolicyPatterns,
  readRecentPolicyFeedback,
  readRecentPolicyFeedbackEntries,
  summarizePolicyFeedback,
  summarizePolicyFeedbackEntries,
};
