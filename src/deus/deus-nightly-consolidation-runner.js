"use strict";

const { resolveOpenTensionsWritePath } = require("../runtime/runtime-surface-paths");
const {
  CONSOLIDATION_POLICY,
  buildStructuralReflectionEntries,
  detectRecurringMemoryPatterns,
} = require("../memory/deus-memory-consolidation-patterns");
const {
  buildPendingBeliefReviewMarker,
} = require("../beliefs/review-queue-schema");
const {
  buildPolicyFeedbackMemoryEntries,
  detectRecurringPolicyPatterns,
  readRecentPolicyFeedback,
} = require("../policy/deus-policy-feedback");
const {
  appendMemoryReflection,
} = require("./deus-nightly-consolidation-memory");
const {
  appendOnce,
  ensureFile,
  readRecentMemory,
  resolveNightlyPaths,
  resolveToday,
} = require("./deus-nightly-consolidation-paths");
const {
  appendPendingBeliefEntry,
  recordPolicyPatterns,
} = require("./deus-nightly-consolidation-review");

function runNightlyMemoryConsolidation(options = {}) {
  const paths = resolveNightlyPaths(options.workspaceRoot);
  const dayKey = options.today || resolveToday();
  const timestamp = options.timestamp || new Date().toISOString();
  ensureFile(
    resolveOpenTensionsWritePath({ workspaceRoot: options.workspaceRoot }),
    "# Open Tensions",
  );

  const memories = readRecentMemory(7, options);
  const structuralPatterns = detectRecurringMemoryPatterns(memories);
  const policyFeedback = readRecentPolicyFeedback({
    workspaceRoot: options.workspaceRoot,
    limitDays: 7,
  });
  const policyPatterns = detectRecurringPolicyPatterns(policyFeedback.entries, {
    minCount: 2,
  });
  let pendingBeliefUpdates = 0;

  for (const pattern of structuralPatterns) {
    const changed = appendPendingBeliefEntry(
      {
        timestamp,
        marker: buildPendingBeliefReviewMarker(dayKey, pattern.name),
        candidate: pattern.summary,
        category: pattern.category,
        evidence: "recurring pattern across recent memory files",
        evidence_sources: pattern.evidenceSources,
        recurrence: pattern.recurrence,
        confidence_proposal: CONSOLIDATION_POLICY.confidenceProposal,
        promotion_decision: CONSOLIDATION_POLICY.defaultPromotionDecision,
        human_review_needed: "no",
        provenance: "sleep_reflection",
        notes:
          "pattern detected by nightly consolidation, not yet promoted into durable beliefs",
      },
      options,
    );

    if (changed) {
      pendingBeliefUpdates += 1;
    }
  }

  const policyPatternRecorded = recordPolicyPatterns(
    policyPatterns,
    timestamp,
    {
      ...options,
      today: dayKey,
    },
  );
  if (policyPatternRecorded) {
    pendingBeliefUpdates += policyPatterns.length;
  }

  let wroteOpenTension = false;
  if (structuralPatterns.length === 0 && policyPatterns.length === 0) {
    wroteOpenTension = appendOnce(
      paths.openTensionsPath,
      `${dayKey}-no-patterns`,
      `## ${timestamp} — low-signal night\n- marker: ${dayKey}-no-patterns\n- note: no strong recurring pattern crossed the consolidation threshold tonight\n\n`,
    );
  }

  const memoryReflection = appendMemoryReflection(
    buildStructuralReflectionEntries(structuralPatterns),
    "System Events",
    {
      ...options,
      today: dayKey,
      timestamp,
    },
  );
  const policyReflection = appendMemoryReflection(
    [
      ...buildPolicyFeedbackMemoryEntries(policyFeedback.summary),
      ...policyPatterns.map((pattern) => `Policy feedback: ${pattern.summary}`),
    ],
    "System Events",
    {
      ...options,
      today: dayKey,
      timestamp,
    },
  );

  return {
    date: dayKey,
    reviewed_memory_files: memories.length,
    recurring_patterns: structuralPatterns.length,
    wrote_memory_reflection: memoryReflection.added,
    policy_feedback_events: policyFeedback.summary.totalEvents,
    policy_recurring_patterns: policyPatterns.length,
    wrote_policy_reflection: policyReflection.added,
    wrote_open_tension: wroteOpenTension,
    pending_belief_updates: pendingBeliefUpdates,
    memory_file: memoryReflection.memoryPath,
    review_file: paths.pendingBeliefsPath,
    tensions_file: paths.openTensionsPath,
  };
}

module.exports = {
  runNightlyMemoryConsolidation,
};
