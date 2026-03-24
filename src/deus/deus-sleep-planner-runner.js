"use strict";

const {
  readBeliefs,
  readLatestIntrospectionSummary,
  readRecentLogs,
  readRecentMemory,
  readStatusState,
} = require("./deus-state-readers");
const { DEUS_CRON_POLICY } = require("../policy/deus-cron-policy");
const { summarizeFocusState } = require("../policy/focus-state-schema");
const { describeRuntimePosture } = require("../policy/focus-runtime-policy");
const { getWorkspaceDateContext } = require("../workspace/workspace-date-context");
const {
  buildSleepPlannerSummary,
  resolveSleepPlannerDecision,
} = require("./deus-sleep-planner-decision");
const { buildWorkspaceReadiness } = require("./deus-sleep-planner-readiness");
const {
  clockToMinutes,
  getLocalMinutes,
  getNextFollowThroughRun,
  isWithinWindow,
  isWithinWrappedWindow,
  resolveNextNightlyWindowDayKey,
} = require("./deus-sleep-planner-timing");

function planBoundedSleep(options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const policy = options.policy || DEUS_CRON_POLICY;
  const dateContext = getWorkspaceDateContext(now, {
    timeZone: policy.timeZone,
  });
  const localMinutes = getLocalMinutes(now, policy.timeZone);
  const quietStartMinute = clockToMinutes(policy.quietHours.startLocal);
  const quietEndMinute = clockToMinutes(policy.quietHours.endLocal);
  const nightlyStartMinute = clockToMinutes(policy.nightly.windowStartLocal);
  const nightlyEndMinute = clockToMinutes(policy.nightly.windowEndLocal);

  const statusState = options.statusState || readStatusState(options);
  const focusState = options.focusState || summarizeFocusState(statusState);
  const posture = describeRuntimePosture({
    status: focusState.status,
    mode: focusState.mode,
    followThroughRequired: focusState.followThroughRequired,
  });
  const beliefs = options.beliefs || readBeliefs(options);
  const recentMemory =
    options.recentMemory ||
    readRecentMemory({
      ...options,
      limit: 2,
    });
  const recentLogs =
    options.recentLogs ||
    readRecentLogs({
      ...options,
      limit: 10,
    });
  const introspection =
    options.introspection || readLatestIntrospectionSummary(options);
  const readiness = buildWorkspaceReadiness({
    beliefs,
    recentMemory,
    recentLogs,
    introspection,
    focusState,
    statusState,
  });
  const quietHoursActive = isWithinWrappedWindow(
    localMinutes,
    quietStartMinute,
    quietEndMinute,
  );
  const nightlyWindowActive = isWithinWindow(
    localMinutes,
    nightlyStartMinute,
    nightlyEndMinute,
  );
  const nextNightlyWindowDayKey = resolveNextNightlyWindowDayKey(
    dateContext,
    localMinutes,
    nightlyStartMinute,
    now,
  );
  const decisionState = resolveSleepPlannerDecision({
    focusState,
    posture,
    quietHoursActive,
    nightlyWindowActive,
    readiness,
  });

  const result = {
    available: true,
    decision: decisionState.decision,
    recommendedMode: decisionState.recommendedMode,
    summary: "",
    quietHours: {
      active: quietHoursActive,
      startLocal: policy.quietHours.startLocal,
      endLocal: policy.quietHours.endLocal,
      timeZone: policy.timeZone,
      currentLocalTime: dateContext.localTimestamp,
      currentDayKey: dateContext.today,
    },
    nightlyWindow: {
      active: nightlyWindowActive,
      startLocal: policy.nightly.windowStartLocal,
      endLocal: policy.nightly.windowEndLocal,
      nextStartDayKey: nextNightlyWindowDayKey,
      jobs: policy.nightly.jobs.map((job) => ({
        key: job.key,
        id: job.id,
        name: job.name,
        localTime: job.localTime,
        schedule: job.schedule,
      })),
    },
    followThrough: {
      required: posture.followThroughRequired,
      allowed: posture.followThroughAllowed,
      schedule: policy.followThrough.schedule,
      nextRun: getNextFollowThroughRun(now, policy),
    },
    state: {
      status: focusState.status,
      mode: focusState.mode,
      statusEligibleForSleep: decisionState.statusEligibleForSleep,
      currentModeAlreadySleep: decisionState.currentModeAlreadySleep,
      warnings: focusState.warnings || [],
    },
    readiness,
    backgroundReflection: {
      allowedByStatus: decisionState.statusEligibleForSleep,
      allowedByCurrentMode: posture.backgroundReflectionAllowed,
      allowedNow: decisionState.allowedNow,
    },
  };

  result.summary = buildSleepPlannerSummary(result);
  return result;
}

module.exports = {
  planBoundedSleep,
};
