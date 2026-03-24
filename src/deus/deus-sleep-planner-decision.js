"use strict";

function buildSleepPlannerSummary(result) {
  if (result.decision === "cron_follow_through") {
    return "active follow-through takes precedence over sleep reflection";
  }

  if (result.decision === "sleep_reflection") {
    return "bounded sleep reflection window is open and the workspace is ready";
  }

  if (result.decision === "prepare_conditions") {
    return "sleep reflection window is open but workspace readiness is incomplete";
  }

  if (!result.quietHours.active) {
    return "outside quiet hours";
  }

  if (!result.nightlyWindow.active) {
    return "quiet hours are active but outside the nightly DEUS maintenance window";
  }

  return "current STATUS posture does not permit bounded sleep reflection";
}

function resolveSleepPlannerDecision({
  focusState,
  posture,
  quietHoursActive,
  nightlyWindowActive,
  readiness,
}) {
  const statusEligibleForSleep = ["waiting", "idle"].includes(focusState.status);
  const currentModeAlreadySleep = focusState.mode === "sleep_reflection";

  let decision = "wait";
  let recommendedMode = currentModeAlreadySleep ? "sleep_reflection" : "idle";
  let allowedNow = false;

  if (posture.followThroughAllowed) {
    decision = "cron_follow_through";
    recommendedMode = "cron_follow_through";
  } else if (
    statusEligibleForSleep &&
    quietHoursActive &&
    nightlyWindowActive &&
    readiness.ready
  ) {
    decision = "sleep_reflection";
    recommendedMode = "sleep_reflection";
    allowedNow = true;
  } else if (
    statusEligibleForSleep &&
    quietHoursActive &&
    nightlyWindowActive &&
    !readiness.ready
  ) {
    decision = "prepare_conditions";
  }

  return {
    allowedNow,
    currentModeAlreadySleep,
    decision,
    recommendedMode,
    statusEligibleForSleep,
  };
}

module.exports = {
  buildSleepPlannerSummary,
  resolveSleepPlannerDecision,
};
