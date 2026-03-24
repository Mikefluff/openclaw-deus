"use strict";

const {
  FOLLOWUP_GUARDRAILS,
  buildFollowupSignals,
  buildRecommendedActions,
  resolveAllowedMeasures,
  resolveFollowupDecision,
  resolveSeverity,
} = require("./deus-introspection-followup-signals");
const { resolveIntrospectionDir } = require("../runtime/runtime-surface-paths");

const FOLLOWUP_VERSION = 1;
const INTROSPECTION_DIR = resolveIntrospectionDir();

function buildIntrospectionFollowupPacket(options = {}) {
  const {
    reportData = {},
    artifactPaths = {},
    dryRun = false,
    now = new Date(),
  } = options;

  const signals = buildFollowupSignals(reportData);
  const decision = resolveFollowupDecision(signals);
  const severity = resolveSeverity(decision, signals);
  const recommendedActions = buildRecommendedActions(signals);

  return {
    version: FOLLOWUP_VERSION,
    generatedAt: now.toISOString(),
    dryRun,
    reportDate: reportData.date || null,
    artifactPaths: {
      reportPath: artifactPaths.reportPath || null,
      dataPath: artifactPaths.dataPath || null,
      analysisPath: artifactPaths.analysisPath || null,
      followupPath: artifactPaths.followupPath || null,
      latestFollowupPath: artifactPaths.latestFollowupPath || null,
    },
    signals: {
      coherence: signals.coherence,
      llmAnalysisNeeded: signals.needsLlmAnalysis,
      contradictionsFound: signals.contradictionsFound,
      missingMemoryToday: signals.missingMemoryToday,
      missingMemoryYesterday: signals.missingMemoryYesterday,
      hardBlockers: signals.hardBlockers,
      focusWarnings: signals.focusWarnings,
      uncommitted: signals.uncommitted,
      actionPolicyRequiresHumanConfirmation:
        signals.actionPolicyRequiresHumanConfirmation,
      focusStatus: reportData.focus_state?.status || null,
      focusMode: reportData.focus_state?.mode || null,
      sleepDecision: reportData.sleep_planner?.decision || null,
      actionPolicyDecision: reportData.action_policy?.decision || null,
      decayTuningSuggested: signals.decayTuningSuggested,
      criticalDecayRiskCount: signals.criticalDecayRiskCount,
      archivedNonArchivableCount: signals.archivedNonArchivableCount,
      activeFloorPressureCount: signals.activeFloorPressureCount,
    },
    followup: {
      decision,
      severity,
      requiresHumanInput: signals.needsHumanInput,
      allowedMeasures: resolveAllowedMeasures(decision),
      recommendedActions,
      decayPolicy: {
        tuningSuggested: signals.decayTuningSuggested,
        criticalAtRiskCount: signals.criticalDecayRiskCount,
        archivedNonArchivableCount: signals.archivedNonArchivableCount,
        activeFloorPressureCount: signals.activeFloorPressureCount,
        tuningCandidates: signals.decayTuningCandidates,
      },
      guardrails: FOLLOWUP_GUARDRAILS,
    },
  };
}

module.exports = {
  FOLLOWUP_VERSION,
  INTROSPECTION_DIR,
  buildIntrospectionFollowupPacket,
};
