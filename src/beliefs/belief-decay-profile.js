"use strict";

const {
  BELIEF_DECAY_POLICY,
  isBeliefDecayExempt,
} = require("./belief-policy");
const { resolveRuntimeBeliefDecayProfile } = require("./belief-decay-overrides");

function applyDecay(belief) {
  const profile = resolveRuntimeBeliefDecayProfile(belief);
  const lambda = profile.decay_rate;
  if (lambda === 0.0) {
    return {
      changed: false,
      belief,
      profile,
      rawDecayedConfidence: belief.confidence,
    };
  }

  const daysSinceUpdate =
    (Date.now() - new Date(belief.timestamp_updated)) / 86400000;
  const decayFactor = Math.exp(-lambda * daysSinceUpdate);
  const rawDecayedConfidence = belief.confidence * decayFactor;

  const oldConfidence = belief.confidence;
  belief.confidence = Math.max(profile.confidence_floor, rawDecayedConfidence);
  belief.confidence = Math.round(belief.confidence * 1000) / 1000;

  const changed = oldConfidence !== belief.confidence;

  if (changed) {
    belief.drift_history = belief.drift_history || [];
    belief.drift_history.push({
      timestamp: new Date().toISOString(),
      old_confidence: oldConfidence,
      new_confidence: belief.confidence,
      reason: "time_decay",
      belief_class: profile.belief_class,
      decay_mode: profile.decay_mode,
      decay_rate: profile.decay_rate,
      confidence_floor: profile.confidence_floor,
    });
  }

  return { changed, belief, profile, rawDecayedConfidence };
}

function repairDecayExemptBelief(belief) {
  if (!isBeliefDecayExempt(belief)) {
    return { repaired: false, belief };
  }

  const profile = resolveRuntimeBeliefDecayProfile(belief);
  const oldConfidence = belief.confidence;
  const oldStatus = belief.status || "active";
  let repaired = false;

  if (belief.confidence !== profile.confidence_floor) {
    belief.confidence = profile.confidence_floor;
    repaired = true;
  }

  if (belief.status && belief.status !== "active") {
    belief.status = "active";
    repaired = true;
  }

  if (repaired) {
    belief.timestamp_updated = new Date().toISOString();
    belief.drift_history = belief.drift_history || [];
    belief.drift_history.push({
      timestamp: new Date().toISOString(),
      old_confidence: oldConfidence,
      new_confidence: belief.confidence,
      old_status: oldStatus,
      new_status: belief.status || "active",
      reason: "decay_exempt_restore",
      belief_class: profile.belief_class,
      confidence_floor: profile.confidence_floor,
    });
  }

  return { repaired, belief };
}

function refreshBelief(belief, evidence, log, options = {}) {
  const boost = BELIEF_DECAY_POLICY.refreshBoost;
  belief.confidence = Math.min(1.0, belief.confidence + boost);
  belief.timestamp_updated = new Date().toISOString();

  belief.drift_history = belief.drift_history || [];
  belief.drift_history.push({
    timestamp: new Date().toISOString(),
    confidence: belief.confidence,
    reason: "evidence_refresh",
    evidence,
  });

  log(
    `Refreshed ${belief.belief_id}: ${belief.content.substring(0, 50)}... (confidence: ${belief.confidence})`,
    options,
  );
}

module.exports = {
  applyDecay,
  refreshBelief,
  repairDecayExemptBelief,
};
