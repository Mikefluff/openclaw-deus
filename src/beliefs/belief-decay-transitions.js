"use strict";

function deriveLifecycleStatus(belief, decayResult) {
  const currentStatus = belief.status || "active";
  const { profile, rawDecayedConfidence } = decayResult;

  if (profile.archivable && rawDecayedConfidence < profile.confidence_floor) {
    if (currentStatus === "deprecated" || currentStatus === "archived") {
      return { nextStatus: "archived", reason: "decay_archive_threshold" };
    }

    return { nextStatus: "deprecated", reason: "decay_deprecation_threshold" };
  }

  if (belief.confidence < profile.review_threshold) {
    return { nextStatus: "review_needed", reason: "decay_review_threshold" };
  }

  return { nextStatus: "active", reason: "decay_stable" };
}

function applyLifecycleTransition(belief, decayResult) {
  const oldStatus = belief.status || "active";
  const { nextStatus, reason } = deriveLifecycleStatus(belief, decayResult);

  if (nextStatus === oldStatus) {
    return { changed: false, nextStatus };
  }

  belief.status = nextStatus;
  belief.drift_history = belief.drift_history || [];
  belief.drift_history.push({
    timestamp: new Date().toISOString(),
    old_status: oldStatus,
    new_status: nextStatus,
    reason,
    belief_class: decayResult.profile.belief_class,
  });

  return { changed: true, nextStatus };
}

module.exports = {
  applyLifecycleTransition,
  deriveLifecycleStatus,
};
