const { INTROSPECTION_POLICY } = require("../beliefs/belief-policy");

function renderIntrospectionReport({
  actionPolicySurface = {},
  activityStats = {},
  beliefs = [],
  coherenceScore,
  decayAuditSurface = {},
  focusStateSurface = {},
  lowConfidence = [],
  memoryExists = {},
  policyFeedback = {},
  posture,
  sleepPlannerSurface = {},
  today,
  todayLogs = [],
  uncommittedCount = 0,
  worldModelSurface = {},
  yesterday,
  yesterdayLogs = [],
}) {
  let report = `# Introspection Report — ${today}\n\n`;
  report += `## System Status\n\n`;
  report += `- **Coherence:** ${(coherenceScore * 100).toFixed(1)}%\n`;
  report += `- **Beliefs tracked:** ${beliefs.length}\n`;
  report += `- **Low confidence:** ${lowConfidence.length}\n`;
  report += `- **Uncommitted changes:** ${uncommittedCount}\n\n`;

  report += `## DEUS Activity Today\n\n`;
  report += `- **Total activities logged:** ${activityStats.today}\n`;
  if (activityStats.today > 0) {
    report += `- **Activity types:**\n`;
    Object.entries(activityStats.byType).forEach(([type, count]) => {
      report += `  - ${type}: ${count}\n`;
    });
  }
  report += `\n`;

  report += `## Memory Coverage\n\n`;
  report += `- Today (${today}): ${memoryExists.today ? "[ok]" : "[missing]"}\n`;
  report += `  - Source: ${todayLogs.length > 0 ? "DEUS activity logs" : "Template/manual"}\n`;
  report += `- Yesterday (${yesterday}): ${memoryExists.yesterday ? "[ok]" : "[missing]"}\n`;
  report += `  - Source: ${yesterdayLogs.length > 0 ? "DEUS activity logs" : "Template/manual"}\n\n`;

  report += `## Status\n\n`;
  if (
    coherenceScore > INTROSPECTION_POLICY.reviewThreshold &&
    memoryExists.today
  ) {
    report += "[ok] System coherent, memory complete, DEUS active\n";
  } else {
    report += "[review] Review recommended\n";
    if (!memoryExists.today) {
      report += "   - Missing today's memory file\n";
    }
    if (!memoryExists.yesterday) {
      report += "   - Missing yesterday's memory file\n";
    }
    if (coherenceScore < INTROSPECTION_POLICY.reviewThreshold) {
      report += "   - Low coherence score\n";
    }
    if (activityStats.today === 0) {
      report += "   - No DEUS activity logged today\n";
    }
  }

  report += `\n## Agent Reflection\n\n`;
  if (posture === "stable") {
    report +=
      "System posture feels stable tonight: the core model is holding, the adapter remains aligned, and no immediate self-model correction is required. The main priority is not reinvention, but preserving clarity while converting repeated operational lessons into cleaner long-term structure.\n";
  } else if (posture === "review") {
    report +=
      "The system is functional but not perfectly settled. Nothing suggests an identity-level problem, but there is enough noise in beliefs, memory, or operational residue that continued consolidation and selective review are more important than aggressive self-modification.\n";
  } else {
    report +=
      "The system is carrying too much instability tonight. Priority should shift from feature growth to coherence repair: reduce drift, inspect contradictions, and avoid promoting weak conclusions into durable belief state until the structure is calmer.\n";
  }

  report += `\n## Decay Policy Audit\n\n`;
  report += `- Beliefs audited: ${decayAuditSurface.totalBeliefs ?? beliefs.length}\n`;
  report += `- Pinned at floor: ${
    Array.isArray(decayAuditSurface.pinnedAtFloor)
      ? decayAuditSurface.pinnedAtFloor.length
      : 0
  }\n`;
  report += `- Critical at risk: ${
    Array.isArray(decayAuditSurface.criticalAtRisk)
      ? decayAuditSurface.criticalAtRisk.length
      : 0
  }\n`;
  report += `- Archived non-archivable: ${
    Array.isArray(decayAuditSurface.archivedNonArchivable)
      ? decayAuditSurface.archivedNonArchivable.length
      : 0
  }\n`;
  report += `- Tuning suggested: ${
    decayAuditSurface.tuningSuggested ? "yes" : "no"
  }\n`;
  if (
    Array.isArray(decayAuditSurface.tuningCandidates) &&
    decayAuditSurface.tuningCandidates.length > 0
  ) {
    report += `- Tuning candidates:\n`;
    decayAuditSurface.tuningCandidates.forEach((candidate) => {
      report += `  - ${candidate.beliefClass}: ${candidate.kind} -> ${candidate.suggestedDecayMode}\n`;
    });
  }
  report += `\n`;

  report += `\n## World Model Status\n\n`;
  report += `- Confidence: ${worldModelSurface.confidence ?? "n/a"}\n`;
  report += `- Fresh: ${worldModelSurface.fresh ?? "n/a"}\n`;
  report += `- Age hours: ${worldModelSurface.ageHours ?? "n/a"}\n`;
  report += `- Active project: ${worldModelSurface.activeProject || "n/a"}\n`;
  report += `- Open loops: ${worldModelSurface.openLoops ?? "n/a"}\n`;
  report += `- Active risks: ${worldModelSurface.activeRisks ?? "n/a"}\n\n`;

  report += `## Focus State\n\n`;
  report += `- Status: ${focusStateSurface.status || "n/a"}\n`;
  report += `- Mode: ${focusStateSurface.mode || "n/a"}\n`;
  report += `- Active project: ${focusStateSurface.activeProject || "n/a"}\n`;
  report += `- Current focus: ${focusStateSurface.currentFocus || "none"}\n`;
  report += `- Next step: ${focusStateSurface.nextStep || "none"}\n`;
  report += `- Waiting for: ${focusStateSurface.waitingFor || "none"}\n`;
  report += `- Follow-through required: ${
    focusStateSurface.followThroughRequired || "n/a"
  }\n`;
  report += `- Follow-through allowed: ${
    focusStateSurface.followThroughAllowed ?? "n/a"
  }\n`;
  report += `- Background reflection allowed: ${
    focusStateSurface.backgroundReflectionAllowed ?? "n/a"
  }\n`;
  report += `- Validation warnings: ${
    Array.isArray(focusStateSurface.warnings) &&
    focusStateSurface.warnings.length > 0
      ? focusStateSurface.warnings.join(", ")
      : "none"
  }\n\n`;

  report += `## Sleep Planner\n\n`;
  report += `- Decision: ${sleepPlannerSurface.decision || "n/a"}\n`;
  report += `- Recommended mode: ${sleepPlannerSurface.recommendedMode || "n/a"}\n`;
  report += `- Summary: ${sleepPlannerSurface.summary || "n/a"}\n`;
  report += `- Quiet hours active: ${
    sleepPlannerSurface.quietHours?.active ?? "n/a"
  }\n`;
  report += `- Nightly window active: ${
    sleepPlannerSurface.nightlyWindow?.active ?? "n/a"
  }\n`;
  report += `- Background reflection allowed now: ${
    sleepPlannerSurface.backgroundReflection?.allowedNow ?? "n/a"
  }\n`;
  report += `- Readiness score: ${
    sleepPlannerSurface.readiness?.score ?? "n/a"
  }\n`;
  report += `- Readiness blockers: ${
    Array.isArray(sleepPlannerSurface.readiness?.blockers) &&
    sleepPlannerSurface.readiness.blockers.length > 0
      ? sleepPlannerSurface.readiness.blockers.join(", ")
      : "none"
  }\n\n`;

  report += `## Policy Readiness\n\n`;
  report += `- Default recommended mode: ${actionPolicySurface.recommendedMode || "n/a"}\n`;
  report += `- Recommended next step: ${actionPolicySurface.recommendedNextStep || "none"}\n`;
  report += `- Ripeness score: ${actionPolicySurface.ripenessScore ?? "n/a"}\n`;
  report += `- Cost band: ${actionPolicySurface.costBand || "n/a"}\n`;
  report += `- Hard blocks active: ${
    Array.isArray(actionPolicySurface.blockers) &&
    actionPolicySurface.blockers.length > 0
      ? actionPolicySurface.blockers.join(", ")
      : "none"
  }\n\n`;

  report += `## Active Blockers\n\n`;
  if (policyFeedback.topBlockers.length > 0) {
    policyFeedback.topBlockers.forEach((blocker) => {
      report += `- ${blocker.blocker}: ${blocker.count}\n`;
    });
  } else {
    report += "- none observed in recent policy feedback\n";
  }
  report += "\n";

  report += `## High-Cost Action Classes\n\n`;
  if (policyFeedback.highCostActionTypes.length > 0) {
    policyFeedback.highCostActionTypes.forEach((actionType) => {
      report += `- ${actionType.actionType}: ${actionType.count}\n`;
    });
  } else {
    report += "- none observed in recent policy feedback\n";
  }
  report += "\n";

  return report;
}

module.exports = {
  renderIntrospectionReport,
};
