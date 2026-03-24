"use strict";

function normalizeArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.filter(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}

function normalizeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizeDecayTuningCandidates(candidates) {
  if (!Array.isArray(candidates)) {
    return [];
  }

  return candidates
    .filter((candidate) => candidate && typeof candidate === "object")
    .map((candidate) => ({
      kind: typeof candidate.kind === "string" ? candidate.kind : "unknown",
      scope: typeof candidate.scope === "string" ? candidate.scope : "class",
      beliefClass:
        typeof candidate.beliefClass === "string"
          ? candidate.beliefClass
          : null,
      dominantDecayMode:
        typeof candidate.dominantDecayMode === "string"
          ? candidate.dominantDecayMode
          : null,
      suggestedDecayMode:
        typeof candidate.suggestedDecayMode === "string"
          ? candidate.suggestedDecayMode
          : null,
      affectedBeliefCount: Number(candidate.affectedBeliefCount || 0),
      reason: typeof candidate.reason === "string" ? candidate.reason : "",
    }));
}

function buildFollowupSignals(reportData = {}) {
  const memory = reportData.memory || {};
  const actionPolicy = reportData.action_policy || {};
  const focusState = reportData.focus_state || {};
  const beliefProcessing = reportData.belief_processing || {};
  const decayAudit = normalizeObject(reportData.decay_policy_audit);
  const hardBlockers = normalizeArray(actionPolicy.blockers);
  const focusWarnings = normalizeArray(focusState.warnings);
  const decayTuningCandidates = normalizeDecayTuningCandidates(
    decayAudit.tuningCandidates,
  );
  const criticalAtRisk = Array.isArray(decayAudit.criticalAtRisk)
    ? decayAudit.criticalAtRisk
    : [];
  const archivedNonArchivable = Array.isArray(decayAudit.archivedNonArchivable)
    ? decayAudit.archivedNonArchivable
    : [];
  const activeFloorPressure = Array.isArray(decayAudit.activeFloorPressure)
    ? decayAudit.activeFloorPressure
    : [];

  return {
    coherence: normalizeNumber(reportData.coherence),
    llmNeeded: Boolean(reportData.llm_analysis_needed),
    needsLlmAnalysis: Boolean(reportData.llm_analysis_needed),
    contradictionsFound: beliefProcessing.contradictions || 0,
    missingMemoryToday: memory.today === false,
    missingMemoryYesterday: memory.yesterday === false,
    needsHumanInput: Boolean(reportData.human_input_needed),
    actionPolicyRequiresHumanConfirmation:
      Boolean(actionPolicy.requiresHumanConfirmation) ||
      hardBlockers.includes("missing_human_confirmation"),
    hardBlockers,
    focusWarnings,
    uncommitted: Number(reportData.uncommitted || 0),
    decayTuningSuggested: Boolean(decayAudit.tuningSuggested),
    decayTuningCandidates,
    criticalDecayRiskCount: criticalAtRisk.length,
    archivedNonArchivableCount: archivedNonArchivable.length,
    activeFloorPressureCount: activeFloorPressure.length,
  };
}

module.exports = {
  buildFollowupSignals,
  normalizeArray,
  normalizeDecayTuningCandidates,
  normalizeNumber,
  normalizeObject,
};
