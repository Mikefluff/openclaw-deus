const {
  normalizePolicyString,
} = require("../policy/action-policy-helpers");
const {
  appendWorkspaceActivityLogEntry,
  resolveDayKeyFromTimestamp,
  resolveWorkspaceActivityLogPath,
} = require("./deus-activity-log");
const {
  INTERACTION_EVENT_POLICY,
  assessInteractionSalience,
} = require("../policy/interaction-event-policy");

function buildInteractionActivityDescription(assessment) {
  const kindLabel = assessment.event.kind.replace(/_/g, " ");
  return `Interaction ${kindLabel}: ${assessment.event.summary}`;
}

function buildInteractionCaptureContext(assessment) {
  return {
    policyVersion: INTERACTION_EVENT_POLICY.version,
    score: assessment.score,
    band: assessment.band,
    captureDecision: assessment.captureDecision,
    shouldEnterCanonicalLog: assessment.shouldEnterCanonicalLog,
    shouldAffectEpisodicMemory: assessment.shouldAffectEpisodicMemory,
    shouldRaiseReviewPressure: assessment.shouldRaiseReviewPressure,
    durableBeliefMutationAllowed: assessment.durableBeliefMutationAllowed,
    rationale: assessment.rationale,
  };
}

function buildInteractionLogEntry(event, options = {}) {
  const assessment =
    options.assessment || assessInteractionSalience(event);
  const timestamp = options.timestamp || new Date().toISOString();

  return {
    timestamp,
    type: "interaction",
    description:
      normalizePolicyString(options.description) ||
      buildInteractionActivityDescription(assessment),
    context: {
      interaction_event: assessment.event,
      interaction_capture: buildInteractionCaptureContext(assessment),
    },
    agent: options.agent || "DEUS",
  };
}

function recordInteractionEvent(event, options = {}) {
  const timestamp = options.timestamp || new Date().toISOString();
  const assessment = assessInteractionSalience(event);

  if (!assessment.shouldEnterCanonicalLog) {
    return {
      recorded: false,
      skipped: true,
      skipReason: "salience_below_log_threshold",
      assessment,
      entry: null,
      logPath: resolveWorkspaceActivityLogPath(
        resolveDayKeyFromTimestamp(timestamp),
        { workspaceRoot: options.workspaceRoot },
      ),
      logFile: null,
    };
  }

  const entry = buildInteractionLogEntry(event, {
    ...options,
    assessment,
    timestamp,
  });
  const result = appendWorkspaceActivityLogEntry({
    ...entry,
    workspaceRoot: options.workspaceRoot,
    echo: options.echo,
  });

  return {
    ...result,
    recorded: true,
    skipped: false,
    skipReason: null,
    assessment,
  };
}

module.exports = {
  buildInteractionCaptureContext,
  buildInteractionLogEntry,
  recordInteractionEvent,
};
