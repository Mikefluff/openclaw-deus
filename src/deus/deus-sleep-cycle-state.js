const { getPolicyRuntimeSurface } = require("../policy/deus-policy-surface");
const {
  readOpenTensions,
  readPendingBeliefs,
  readRecentLogs,
  readRecentMemory,
} = require("./deus-state-readers");
const {
  buildStructuralReflectionEntries,
  detectRecurringMemoryPatterns,
} = require("../memory/deus-memory-consolidation-patterns");
const {
  buildPolicyFeedbackMemoryEntries,
  detectRecurringPolicyPatterns,
  readRecentPolicyFeedback,
} = require("../policy/deus-policy-feedback");
const {
  runSleepIntrospection,
  summarizeSleepIntrospectionResult,
} = require("./deus-sleep-cycle-introspection");

function normalizeMemoryEntries(memoryEntries = []) {
  return memoryEntries.map((entry) => ({
    file: entry.file || entry.fileName || `${entry.dayKey}.md`,
    content: entry.content || "",
  }));
}

function summarizeReviewLayer(reviewDoc = {}, limit = 5) {
  return {
    exists: reviewDoc.exists !== false,
    totalMarkers: Array.isArray(reviewDoc.markers)
      ? reviewDoc.markers.length
      : 0,
    markers: Array.isArray(reviewDoc.markers)
      ? reviewDoc.markers.slice(0, limit)
      : [],
  };
}

function resolveCycleStatus(planner = {}) {
  if (planner.decision === "sleep_reflection") {
    return "ready";
  }

  if (planner.decision === "prepare_conditions") {
    return "blocked";
  }

  return "skipped";
}

function buildSleepCycleState(options = {}) {
  const policySurface =
    options.policySurface ||
    getPolicyRuntimeSurface({
      ...options,
      now: options.now,
    });
  const planner = policySurface.sleepPlanner || {};
  const recentMemory =
    options.recentMemory ||
    readRecentMemory({
      ...options,
      limit: 7,
    });
  const recentLogs =
    options.recentLogs ||
    readRecentLogs({
      ...options,
      limit: 50,
    });
  const pendingBeliefs = options.pendingBeliefs || readPendingBeliefs(options);
  const openTensions = options.openTensions || readOpenTensions(options);
  const policyFeedback =
    options.policyFeedback ||
    readRecentPolicyFeedback({
      workspaceRoot: options.workspaceRoot,
      limitDays: 7,
      limit: 100,
    });

  const structuralPatterns = detectRecurringMemoryPatterns(
    normalizeMemoryEntries(recentMemory),
  );
  const policyPatterns = detectRecurringPolicyPatterns(policyFeedback.entries, {
    minCount: 2,
  });
  const status = resolveCycleStatus(planner);
  const shouldPreviewReflection = [
    "sleep_reflection",
    "prepare_conditions",
  ].includes(planner.decision);
  const includeIntrospectionPreview =
    options.includeIntrospectionPreview !== false;
  const introspectionPreview = Object.prototype.hasOwnProperty.call(
    options,
    "introspectionPreview",
  )
    ? options.introspectionPreview
    : includeIntrospectionPreview && shouldPreviewReflection
      ? runSleepIntrospection({
          ...options,
          dryRun: true,
        })
      : null;

  return {
    status,
    planner,
    inputs: {
      memoryDaysReviewed: recentMemory.length,
      logEntriesReviewed: recentLogs.length,
      pendingBeliefMarkers: summarizeReviewLayer(pendingBeliefs).totalMarkers,
      openTensionMarkers: summarizeReviewLayer(openTensions).totalMarkers,
      policyFeedbackEvents: policyFeedback.summary.totalEvents || 0,
    },
    previews: {
      structuralPatterns,
      policyPatterns,
      memoryReflection: buildStructuralReflectionEntries(structuralPatterns),
      policyReflection: [
        ...buildPolicyFeedbackMemoryEntries(policyFeedback.summary),
        ...policyPatterns.map(
          (pattern) => `Policy feedback: ${pattern.summary}`,
        ),
      ],
      pendingBeliefReview: summarizeReviewLayer(pendingBeliefs),
      openTensionReview: summarizeReviewLayer(openTensions),
      introspection: summarizeSleepIntrospectionResult(introspectionPreview),
    },
  };
}

module.exports = {
  buildSleepCycleState,
  normalizeMemoryEntries,
  resolveCycleStatus,
  summarizeReviewLayer,
};
