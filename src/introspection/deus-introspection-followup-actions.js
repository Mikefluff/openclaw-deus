"use strict";

function buildRecommendedActions(signals = {}) {
  const actions = [];

  if (signals.needsLlmAnalysis) {
    actions.push({
      kind: "read_full_report",
      reason: "report flagged llm_analysis_needed",
    });
  }

  if (signals.contradictionsFound > 0) {
    actions.push({
      kind: "inspect_contradictions",
      reason: `${signals.contradictionsFound} contradictions were detected`,
    });
  }

  if (signals.missingMemoryToday || signals.missingMemoryYesterday) {
    actions.push({
      kind: "repair_memory_gap",
      reason: signals.missingMemoryToday
        ? "today's memory coverage is missing"
        : "yesterday's memory coverage is missing",
    });
  }

  if (signals.focusWarnings.length > 0) {
    actions.push({
      kind: "repair_focus_state",
      reason: `focus-state warnings: ${signals.focusWarnings.join(", ")}`,
    });
  }

  if (signals.archivedNonArchivableCount > 0) {
    actions.push({
      kind: "inspect_decay_contract_breach",
      reason: `${signals.archivedNonArchivableCount} non-archivable beliefs ended up archived`,
    });
  }

  if (signals.criticalDecayRiskCount > 0) {
    actions.push({
      kind: "review_decay_risk",
      reason: `${signals.criticalDecayRiskCount} critical beliefs are under decay pressure`,
    });
  }

  if (signals.decayTuningSuggested) {
    actions.push({
      kind: "review_decay_tuning_candidates",
      reason: `${signals.decayTuningCandidates.length} bounded decay tuning candidates were proposed`,
    });
  }

  if (signals.hardBlockers.length > 0) {
    actions.push({
      kind: "respect_action_blockers",
      reason: `active blockers: ${signals.hardBlockers.join(", ")}`,
    });
  }

  if (signals.uncommitted > 0) {
    actions.push({
      kind: "check_workspace_drift",
      reason: `${signals.uncommitted} tracked changes detected`,
    });
  }

  if (actions.length === 0) {
    actions.push({
      kind: "record_summary_only",
      reason: "no bounded follow-up trigger exceeded the threshold",
    });
  }

  return actions;
}

function resolveAllowedMeasures(decision) {
  if (decision === "repair") {
    return [
      "read_report",
      "write_user_summary",
      "write_analyzed_report",
      "update_STATUS",
      "update_review_surfaces",
      "create_task",
      "apply_one_bounded_repair",
      "apply_one_bounded_decay_tuning",
    ];
  }

  if (decision === "review") {
    return [
      "read_report",
      "write_user_summary",
      "write_analyzed_report",
      "update_STATUS",
      "update_review_surfaces",
      "create_task",
    ];
  }

  if (decision === "human_escalation") {
    return [
      "read_report",
      "write_user_summary",
      "write_analyzed_report",
      "update_STATUS",
      "create_task",
    ];
  }

  return ["read_report", "write_user_summary"];
}

module.exports = {
  buildRecommendedActions,
  resolveAllowedMeasures,
};
