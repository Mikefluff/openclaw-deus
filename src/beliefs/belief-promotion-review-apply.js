"use strict";

const { generateBeliefId } = require("./belief-promotion-review-matching");

function classifyAnchor(category) {
  switch (category) {
    case "self_model":
      return "self_model_review";
    case "user_model":
      return "user_model_review";
    case "operational":
      return "operational_pattern";
    default:
      return "review_queue";
  }
}

function refreshExistingBelief(existing, entry, timestamp) {
  existing.confidence = Math.min(
    1.0,
    Math.max(existing.confidence, entry.confidence_proposal),
  );
  existing.timestamp_updated = timestamp;
  existing.drift_history = existing.drift_history || [];
  existing.drift_history.push({
    timestamp,
    confidence: existing.confidence,
    reason: "promotion_review_refresh",
    marker: entry.marker,
  });

  return {
    outcome: "refreshed",
    message: `Refreshed existing belief ${existing.belief_id} from ${entry.marker}`,
  };
}

function createPromotedBelief(beliefs, entry, timestamp) {
  return {
    belief_id: generateBeliefId(beliefs, "R"),
    content: entry.candidate,
    confidence: entry.confidence_proposal,
    evidence_set: entry.evidence_sources,
    source_type: "inference",
    timestamp_created: timestamp,
    timestamp_updated: timestamp,
    context_scope: entry.category,
    ontological_anchor: classifyAnchor(entry.category),
    inference_trace: [
      "review_queue",
      "nightly_memory_consolidation",
      "promotion_review",
    ],
    drift_history: [],
    status: "active",
  };
}

function applyPromotionDecision({ beliefs, entry, decision, existing, timestamp }) {
  if (existing) {
    return refreshExistingBelief(existing, entry, timestamp);
  }

  if (decision === "promote") {
    const newBelief = createPromotedBelief(beliefs, entry, timestamp);
    beliefs.push(newBelief);
    return {
      outcome: "promoted",
      message: `Promoted ${entry.marker} -> ${newBelief.belief_id}`,
    };
  }

  if (decision === "defer") {
    return {
      outcome: "deferred",
      message: `Deferred ${entry.marker}`,
    };
  }

  return {
    outcome: "rejected",
    message: `Rejected ${entry.marker}`,
  };
}

module.exports = {
  applyPromotionDecision,
  classifyAnchor,
  createPromotedBelief,
  refreshExistingBelief,
};
