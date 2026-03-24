"use strict";

const { clampConfidence } = require("./world-model-schema");

function selectBeliefs(beliefs, pattern) {
  return beliefs
    .filter((belief) => pattern.test(String(belief.belief_id || "")))
    .map((belief) => ({
      id: belief.belief_id,
      content: belief.content,
      confidence: belief.confidence,
    }));
}

function deriveHumanPreferences(beliefs) {
  return beliefs
    .filter(
      (belief) =>
        belief.ontological_anchor === "user_preference" ||
        belief.context_scope === "communication" ||
        belief.context_scope === "workflow",
    )
    .map((belief) => belief.content)
    .filter(Boolean);
}

function deriveReviewPressure(beliefs, pendingBeliefs, openTensions) {
  const lowConfidenceBeliefs = beliefs
    .filter((belief) => Number(belief.confidence) < 0.7)
    .map((belief) => belief.belief_id)
    .filter(Boolean);

  return {
    low_confidence_beliefs: lowConfidenceBeliefs,
    pending_belief_markers: pendingBeliefs.markers,
    open_tension_markers: openTensions.markers,
  };
}

function hasMeaningfulValue(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return Boolean(normalized) && normalized !== "none" && normalized !== "n/a";
}

function resolveFocusState(statusState) {
  return statusState.focusState?.resolved || statusState.flat || {};
}

function deriveActiveLimitations(statusState, introspection, memoryEntries) {
  const focusState = resolveFocusState(statusState);
  const limitations = [];

  if (focusState.status === "waiting") {
    limitations.push("status_waiting");
  }

  if (!introspection.summary) {
    limitations.push("missing_introspection_summary");
  }

  if (memoryEntries.length === 0) {
    limitations.push("missing_recent_memory");
  }

  return limitations;
}

function getMemoryFreshnessDays(memoryEntries, dateContext) {
  const latestMemory = memoryEntries[0];
  if (!latestMemory) {
    return null;
  }

  const latestDate = Date.parse(`${latestMemory.dayKey}T00:00:00Z`);
  const referenceDate = Date.parse(`${dateContext.today}T00:00:00Z`);
  if (Number.isNaN(latestDate) || Number.isNaN(referenceDate)) {
    return null;
  }

  return Math.floor((referenceDate - latestDate) / 86_400_000);
}

function deriveWaitingConditions(statusState) {
  const focusState = resolveFocusState(statusState);
  return [focusState.waiting_for, focusState.unblock_condition].filter(
    hasMeaningfulValue,
  );
}

function deriveHardBlocks(statusState, introspection, memoryFreshnessDays) {
  const focusState = resolveFocusState(statusState);
  const blocks = [];

  if (
    focusState.status === "waiting" &&
    hasMeaningfulValue(focusState.waiting_for)
  ) {
    blocks.push("waiting_for_condition");
  }

  if (!introspection.summary) {
    blocks.push("missing_introspection_summary");
  }

  if (memoryFreshnessDays !== null && memoryFreshnessDays > 1) {
    blocks.push("stale_memory");
  }

  return blocks;
}

function derivePreferredModes(statusState, hardBlocks) {
  const focusState = resolveFocusState(statusState);

  if (hardBlocks.length > 0) {
    return ["prepare_conditions", "wait"];
  }

  if (focusState.follow_through_required === "yes") {
    return ["prepare_conditions", "observe"];
  }

  return ["observe", "prepare_conditions"];
}

function deriveActiveRisks(
  statusState,
  openTensions,
  repoState,
  memoryFreshnessDays,
) {
  const focusState = resolveFocusState(statusState);
  const risks = [];

  if (repoState.dirty) {
    risks.push("repo_dirty");
  }

  if (openTensions.markers.length > 0) {
    risks.push("open_tensions_present");
  }

  if (focusState.status === "waiting") {
    risks.push("work_block_waiting");
  }

  if (memoryFreshnessDays !== null && memoryFreshnessDays > 1) {
    risks.push("memory_not_current_day");
  }

  return risks;
}

function calculateWorldModelConfidence({
  beliefs,
  memoryEntries,
  logEntries,
  statusState,
  pendingBeliefs,
  openTensions,
  introspection,
  repoState,
}) {
  let score = 0;

  if (beliefs.length > 0) {
    score += 0.2;
  }
  if (memoryEntries.length > 0) {
    score += 0.2;
  }
  if (logEntries.length > 0) {
    score += 0.1;
  }
  if (statusState.exists) {
    score += 0.15;
  }
  if (pendingBeliefs.exists) {
    score += 0.1;
  }
  if (openTensions.exists) {
    score += 0.1;
  }
  if (introspection.summary) {
    score += 0.15;
  }

  if (repoState.dirty) {
    score -= 0.05;
  }

  return clampConfidence(score);
}

module.exports = {
  calculateWorldModelConfidence,
  deriveActiveLimitations,
  deriveActiveRisks,
  deriveHardBlocks,
  deriveHumanPreferences,
  derivePreferredModes,
  deriveReviewPressure,
  deriveWaitingConditions,
  getMemoryFreshnessDays,
  resolveFocusState,
  selectBeliefs,
};
