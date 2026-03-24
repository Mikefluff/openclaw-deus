"use strict";

const { INTROSPECTION_POLICY } = require("../beliefs/belief-policy");

function resolveFollowupDecision(signals = {}, policy = INTROSPECTION_POLICY) {
  const coherence =
    typeof signals.coherence === "number" && Number.isFinite(signals.coherence)
      ? signals.coherence
      : null;
  const severeCoherence = coherence !== null && coherence < 0.65;
  const reviewCoherence =
    coherence !== null && coherence < policy.reviewThreshold;

  if (signals.needsHumanInput) {
    return "human_escalation";
  }

  if (
    severeCoherence ||
    signals.contradictionsFound > 0 ||
    signals.missingMemoryToday ||
    signals.missingMemoryYesterday ||
    signals.hardBlockers.length > 0 ||
    signals.archivedNonArchivableCount > 0
  ) {
    return "review";
  }

  if (
    signals.needsLlmAnalysis ||
    reviewCoherence ||
    signals.focusWarnings.length > 0 ||
    signals.uncommitted > 0 ||
    signals.criticalDecayRiskCount > 0 ||
    signals.decayTuningSuggested
  ) {
    return "repair";
  }

  return "observe_only";
}

function resolveSeverity(decision, signals = {}) {
  if (
    decision === "human_escalation" ||
    signals.contradictionsFound > 0 ||
    signals.missingMemoryToday
  ) {
    return "high";
  }

  if (
    decision === "review" ||
    decision === "repair" ||
    signals.needsLlmAnalysis
  ) {
    return "med";
  }

  return "low";
}

module.exports = {
  resolveFollowupDecision,
  resolveSeverity,
};
