"use strict";

const { clampScore } = require("./action-policy-helpers");
const {
  INTERACTION_EVENT_POLICY,
} = require("./interaction-event-policy-constants");
const {
  normalizeInteractionEvent,
} = require("./interaction-event-policy-normalize");

function resolveInteractionSalienceBand(score) {
  if (score >= INTERACTION_EVENT_POLICY.thresholds.reviewSignal) {
    return "review_signal";
  }
  if (score >= INTERACTION_EVENT_POLICY.thresholds.memoryCandidate) {
    return "reflectable";
  }
  if (score >= INTERACTION_EVENT_POLICY.thresholds.log) {
    return "log_only";
  }
  return "ignore";
}

function assessInteractionSalience(event = {}) {
  const normalized = normalizeInteractionEvent(event);
  const rationale = [];
  let score =
    INTERACTION_EVENT_POLICY.kindWeights[normalized.kind] ??
    INTERACTION_EVENT_POLICY.kindWeights.other;

  if (normalized.signals.explicit_preference) {
    score += INTERACTION_EVENT_POLICY.signalWeights.explicitPreference;
    rationale.push("explicit preference signal");
  }
  if (normalized.signals.explicit_constraint) {
    score += INTERACTION_EVENT_POLICY.signalWeights.explicitConstraint;
    rationale.push("explicit constraint signal");
  }
  if (normalized.signals.explicit_instruction) {
    score += INTERACTION_EVENT_POLICY.signalWeights.explicitInstruction;
    rationale.push("explicit instruction signal");
  }
  if (normalized.signals.continuity_relevant) {
    score += INTERACTION_EVENT_POLICY.signalWeights.continuityRelevant;
    rationale.push("interaction affects continuity");
  }
  if (normalized.signals.identity_relevant) {
    score += INTERACTION_EVENT_POLICY.signalWeights.identityRelevant;
    rationale.push("interaction affects human/identity context");
  }
  if (normalized.signals.project_relevant) {
    score += INTERACTION_EVENT_POLICY.signalWeights.projectRelevant;
    rationale.push("interaction affects active project context");
  }
  if (normalized.signals.approval_change) {
    score += INTERACTION_EVENT_POLICY.signalWeights.approvalChange;
    rationale.push("interaction changes approval state");
  }
  if (normalized.signals.correction) {
    score += INTERACTION_EVENT_POLICY.signalWeights.correction;
    rationale.push("interaction corrects prior understanding");
  }
  if (normalized.signals.recurring_reference) {
    score += INTERACTION_EVENT_POLICY.signalWeights.recurringReference;
    rationale.push("interaction is recurring");
  }

  const clampedScore = clampScore(score);
  const band = resolveInteractionSalienceBand(clampedScore);
  const bandPolicy = INTERACTION_EVENT_POLICY.salienceBands[band];

  if (rationale.length === 0) {
    rationale.push("interaction is low-salience and mostly incidental");
  }

  return {
    event: normalized,
    score: clampedScore,
    band,
    captureDecision: bandPolicy.captureDecision,
    shouldEnterCanonicalLog: band !== "ignore",
    shouldAffectEpisodicMemory:
      band === "reflectable" || band === "review_signal",
    shouldRaiseReviewPressure: band === "review_signal",
    durableBeliefMutationAllowed: false,
    rationale,
  };
}

module.exports = {
  assessInteractionSalience,
  resolveInteractionSalienceBand,
};
