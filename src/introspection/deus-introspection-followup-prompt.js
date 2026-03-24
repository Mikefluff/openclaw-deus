"use strict";

function renderIntrospectionFollowupPrompt(packet) {
  const actionLines = packet.followup.recommendedActions.map(
    (action, index) => `${index + 1}. ${action.kind}: ${action.reason}`,
  );
  const guardrails = packet.followup.guardrails;

  return [
    "A fresh DEUS introspection report is ready for bounded follow-up.",
    "",
    "Packet:",
    `- decision: ${packet.followup.decision}`,
    `- severity: ${packet.followup.severity}`,
    `- report_date: ${packet.reportDate || "unknown"}`,
    `- report_path: ${packet.artifactPaths.reportPath || "missing"}`,
    `- data_path: ${packet.artifactPaths.dataPath || "missing"}`,
    `- analysis_path: ${packet.artifactPaths.analysisPath || "missing"}`,
    `- followup_packet_path: ${packet.artifactPaths.followupPath || "missing"}`,
    `- latest_followup_packet_path: ${
      packet.artifactPaths.latestFollowupPath || "missing"
    }`,
    "",
    "Required procedure:",
    "1. Read the follow-up packet JSON plus the referenced report/data files.",
    "2. Base this pass on the fresh report, not on stale prior introspection memory.",
    "3. Use the packet decision as the action ceiling for this pass.",
    "4. Keep the follow-up bounded to one pass and verify any mutation you make.",
    "",
    `Allowed measures: ${packet.followup.allowedMeasures.join(", ")}`,
    `Forbidden paths: ${guardrails.forbiddenPaths.join(", ")}`,
    `Allowed mutation surfaces: ${guardrails.allowedMutationSurfaces.join(", ")}`,
    `External actions require confirmation: ${guardrails.externalActionsRequireConfirmation}`,
    `Direct belief mutation allowed: ${guardrails.directBeliefMutationAllowed}`,
    `Decay tuning suggested: ${packet.followup.decayPolicy.tuningSuggested}`,
    `Critical decay risk count: ${packet.followup.decayPolicy.criticalAtRiskCount}`,
    `Archived non-archivable count: ${packet.followup.decayPolicy.archivedNonArchivableCount}`,
    "",
    "Decision semantics:",
    "- observe_only: summarize the report and stop.",
    "- review: update review/status/task/introspection surfaces only; do not self-authorize durable identity or belief changes.",
    "- repair: perform at most one small safe repair, verify it, and record it.",
    "- human_escalation: do not self-mutate beyond notes/status/task/report; escalate clearly.",
    "",
    "Recommended actions:",
    ...actionLines,
    ...(packet.followup.decayPolicy.tuningCandidates.length > 0
      ? [
          "",
          "Decay tuning candidates:",
          ...packet.followup.decayPolicy.tuningCandidates.map(
            (candidate, index) =>
              `${index + 1}. ${candidate.beliefClass || "unknown"}: ${candidate.kind} -> ${candidate.suggestedDecayMode || "none"} (${candidate.reason})`,
          ),
        ]
      : []),
    "",
    "Response format: 3-6 concise lines in the user's language covering signal, action taken or skipped, why, and next step.",
    "",
  ].join("\n");
}

module.exports = {
  renderIntrospectionFollowupPrompt,
};
