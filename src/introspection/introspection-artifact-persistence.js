const fs = require("fs");
const path = require("path");
const {
  buildIntrospectionFollowupPacket,
  persistIntrospectionFollowupPacket,
} = require("./deus-introspection-followup");

function buildIntrospectionArtifactPaths(introspectionDir, today, summaryPath) {
  return {
    reportPath: path.join(introspectionDir, `introspection-${today}.md`),
    dataPath: path.join(introspectionDir, `introspection-${today}.json`),
    analysisPath: path.join(
      introspectionDir,
      `introspection-${today}.analyzed.md`,
    ),
    followupPath: path.join(
      introspectionDir,
      `introspection-${today}.followup.json`,
    ),
    latestFollowupPath: path.join(
      introspectionDir,
      "introspection-followup.latest.json",
    ),
    summaryPath,
  };
}

function buildCompactSummaryLine({
  actionPolicySurface = {},
  activityStats = {},
  beliefs = [],
  coherenceScore,
  focusStateSurface = {},
  memoryExists = {},
  policyFeedback = {},
  reportData = {},
  sleepPlannerSurface = {},
  today,
  worldModelSurface = {},
}) {
  return JSON.stringify({
    date: today,
    coherence: coherenceScore,
    beliefs: beliefs.length,
    memory_today: memoryExists.today,
    memory_yesterday: memoryExists.yesterday,
    activity_count: activityStats.today,
    needs_llm_analysis: reportData.llm_analysis_needed,
    world_model_confidence: worldModelSurface.confidence ?? null,
    focus_state_status: focusStateSurface.status || null,
    focus_state_mode: focusStateSurface.mode || null,
    sleep_planner_decision: sleepPlannerSurface.decision || null,
    action_policy_decision: actionPolicySurface.decision || null,
    policy_feedback_events: policyFeedback.totalEvents,
    timestamp: new Date().toISOString(),
  });
}

function buildFollowupSurface(followupPacket, artifactPaths) {
  return {
    decision: followupPacket.followup.decision,
    severity: followupPacket.followup.severity,
    requiresHumanInput: followupPacket.followup.requiresHumanInput,
    packetPath: artifactPaths.followupPath,
    latestPacketPath: artifactPaths.latestFollowupPath,
    analysisPath: artifactPaths.analysisPath,
    recommendedActions: followupPacket.followup.recommendedActions.map(
      (action) => action.kind,
    ),
  };
}

function persistReportArtifacts({
  artifactPaths,
  dryRun = false,
  followupPacket,
  introspectionDir,
  log,
  report,
  reportData,
  summaryLine,
}) {
  if (!dryRun) {
    fs.writeFileSync(artifactPaths.reportPath, report);
    log(`Algorithmic report saved: introspection-${reportData.date}.md`);
    fs.writeFileSync(
      artifactPaths.dataPath,
      JSON.stringify(reportData, null, 2),
    );
    log(`Raw data saved: introspection-${reportData.date}.json`);
    persistIntrospectionFollowupPacket(followupPacket, {
      introspectionDir,
      dryRun,
    });
    log(`Follow-up packet saved: introspection-${reportData.date}.followup.json`);
    fs.appendFileSync(artifactPaths.summaryPath, `${summaryLine}\n`);
    log("Summary updated");
    return;
  }

  log("Skipping introspection artifact writes in dry-run mode");
}

function buildIntrospectionFollowupArtifacts({
  artifactPaths,
  dryRun = false,
  reportData,
}) {
  return buildIntrospectionFollowupPacket({
    reportData,
    artifactPaths,
    dryRun,
  });
}

module.exports = {
  buildCompactSummaryLine,
  buildFollowupSurface,
  buildIntrospectionArtifactPaths,
  buildIntrospectionFollowupArtifacts,
  persistReportArtifacts,
};
