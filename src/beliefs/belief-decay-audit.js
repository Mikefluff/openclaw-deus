const {
  resolveRuntimeBeliefDecayProfile,
} = require("./belief-decay-overrides");

const FLOOR_EPSILON = 0.000001;

function nextSlowerDecayMode(mode) {
  if (mode === "fast") {
    return "normal";
  }

  if (mode === "normal") {
    return "slow";
  }

  if (mode === "slow") {
    return "no_decay";
  }

  return "no_decay";
}

function sortObjectEntriesDescending(object) {
  return Object.entries(object).sort((left, right) => right[1] - left[1]);
}

function resolveDominantKey(counts = {}) {
  return sortObjectEntriesDescending(counts)[0]?.[0] || null;
}

function buildDecayPolicyAudit(beliefs = [], options = {}) {
  const records = beliefs.map((belief) => {
    const profile = resolveRuntimeBeliefDecayProfile(belief, options);
    const confidence = Number(belief.confidence || 0);
    const pinnedAtFloor =
      confidence <= profile.confidence_floor + FLOOR_EPSILON;
    const reviewNeeded = confidence < profile.review_threshold;
    const archived = (belief.status || "active") === "archived";
    const activeFloorPressure =
      !archived && pinnedAtFloor && profile.decay_mode !== "no_decay";

    return {
      beliefId: belief.belief_id,
      status: belief.status || "active",
      confidence,
      pinnedAtFloor,
      reviewNeeded,
      archived,
      activeFloorPressure,
      profile,
    };
  });

  const byClass = {};
  const byMode = {};
  const byStatus = {};
  const pinnedAtFloor = [];
  const activeFloorPressure = [];
  const archivedNonArchivable = [];
  const criticalAtRisk = [];

  for (const record of records) {
    const beliefClass = record.profile.belief_class;
    const decayMode = record.profile.decay_mode;

    byMode[decayMode] = (byMode[decayMode] || 0) + 1;
    byStatus[record.status] = (byStatus[record.status] || 0) + 1;

    if (!byClass[beliefClass]) {
      byClass[beliefClass] = {
        count: 0,
        avgConfidence: 0,
        pinnedAtFloorCount: 0,
        activeFloorPressureCount: 0,
        reviewNeededCount: 0,
        activeReviewNeededCount: 0,
        archivedCount: 0,
        nonArchivableCount: 0,
        modeCounts: {},
      };
    }

    const metrics = byClass[beliefClass];
    metrics.count += 1;
    metrics.avgConfidence += record.confidence;
    metrics.modeCounts[decayMode] = (metrics.modeCounts[decayMode] || 0) + 1;

    if (record.pinnedAtFloor) {
      metrics.pinnedAtFloorCount += 1;
      pinnedAtFloor.push({
        beliefId: record.beliefId,
        beliefClass,
        confidence: record.confidence,
        confidenceFloor: record.profile.confidence_floor,
        status: record.status,
      });
    }

    if (record.activeFloorPressure) {
      metrics.activeFloorPressureCount += 1;
      activeFloorPressure.push({
        beliefId: record.beliefId,
        beliefClass,
        confidence: record.confidence,
        confidenceFloor: record.profile.confidence_floor,
        decayMode: record.profile.decay_mode,
        status: record.status,
      });
    }

    if (record.reviewNeeded) {
      metrics.reviewNeededCount += 1;
      if (!record.archived) {
        metrics.activeReviewNeededCount += 1;
      }
    }

    if (record.archived) {
      metrics.archivedCount += 1;
    }

    if (!record.profile.archivable) {
      metrics.nonArchivableCount += 1;
      if (record.archived) {
        archivedNonArchivable.push({
          beliefId: record.beliefId,
          beliefClass,
          confidence: record.confidence,
          status: record.status,
        });
      }
    }

    if (
      !record.profile.archivable &&
      (record.reviewNeeded || record.activeFloorPressure)
    ) {
      criticalAtRisk.push({
        beliefId: record.beliefId,
        beliefClass,
        confidence: record.confidence,
        reviewThreshold: record.profile.review_threshold,
        confidenceFloor: record.profile.confidence_floor,
        decayMode: record.profile.decay_mode,
        status: record.status,
      });
    }
  }

  const classMetrics = {};
  for (const [beliefClass, metrics] of Object.entries(byClass)) {
    classMetrics[beliefClass] = {
      ...metrics,
      avgConfidence:
        metrics.count > 0
          ? Number((metrics.avgConfidence / metrics.count).toFixed(3))
          : 0,
      dominantDecayMode: resolveDominantKey(metrics.modeCounts),
    };
  }

  const tuningCandidates = [];
  for (const [beliefClass, metrics] of Object.entries(classMetrics)) {
    if (metrics.activeFloorPressureCount >= 2) {
      tuningCandidates.push({
        kind: "review_floor_binding",
        scope: "class",
        beliefClass,
        dominantDecayMode: metrics.dominantDecayMode,
        suggestedDecayMode: nextSlowerDecayMode(metrics.dominantDecayMode),
        affectedBeliefCount: metrics.activeFloorPressureCount,
        reason: `${metrics.activeFloorPressureCount} active beliefs are pinned to the class floor under a decaying mode`,
      });
    } else if (metrics.activeReviewNeededCount >= 2) {
      tuningCandidates.push({
        kind: "consider_slower_decay",
        scope: "class",
        beliefClass,
        dominantDecayMode: metrics.dominantDecayMode,
        suggestedDecayMode: nextSlowerDecayMode(metrics.dominantDecayMode),
        affectedBeliefCount: metrics.activeReviewNeededCount,
        reason: `${metrics.activeReviewNeededCount} active beliefs remain below the class review threshold`,
      });
    }
  }

  return {
    totalBeliefs: records.length,
    byClass: classMetrics,
    byMode,
    byStatus,
    pinnedAtFloor,
    activeFloorPressure,
    archivedNonArchivable,
    criticalAtRisk,
    tuningCandidates,
    tuningSuggested: tuningCandidates.length > 0,
  };
}

module.exports = {
  buildDecayPolicyAudit,
  nextSlowerDecayMode,
};
