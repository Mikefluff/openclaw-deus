const { normalizePolicyString } = require("../policy/action-policy-helpers");
const {
  assessInteractionSalience,
  extractInteractionEventFromLogEntry,
} = require("../policy/interaction-event-policy");
const { getHumanInteractionSectionTitle } = require("./user-context");

function resolveInteractionCapture(entry = {}) {
  const event = extractInteractionEventFromLogEntry(entry);
  if (!event) {
    return null;
  }

  const persisted = entry.context?.interaction_capture || {};
  const assessment = assessInteractionSalience(event);

  return {
    event,
    score:
      typeof persisted.score === "number" ? persisted.score : assessment.score,
    band: persisted.band || assessment.band,
    captureDecision: persisted.captureDecision || assessment.captureDecision,
    shouldEnterCanonicalLog:
      typeof persisted.shouldEnterCanonicalLog === "boolean"
        ? persisted.shouldEnterCanonicalLog
        : assessment.shouldEnterCanonicalLog,
    shouldAffectEpisodicMemory:
      typeof persisted.shouldAffectEpisodicMemory === "boolean"
        ? persisted.shouldAffectEpisodicMemory
        : assessment.shouldAffectEpisodicMemory,
    shouldRaiseReviewPressure:
      typeof persisted.shouldRaiseReviewPressure === "boolean"
        ? persisted.shouldRaiseReviewPressure
        : assessment.shouldRaiseReviewPressure,
    durableBeliefMutationAllowed: false,
    rationale:
      Array.isArray(persisted.rationale) && persisted.rationale.length > 0
        ? persisted.rationale
        : assessment.rationale,
  };
}

function buildInteractionMemoryLine(capture) {
  const kindLabel = capture.event.kind.replace(/_/g, " ");
  const content = normalizePolicyString(
    capture.event.content || capture.event.summary,
  );
  return `${kindLabel} [${capture.band}]: ${content}`;
}

function classifyInteractionMemoryEntry(entry = {}) {
  const capture = resolveInteractionCapture(entry);
  if (!capture || !capture.shouldAffectEpisodicMemory) {
    return null;
  }

  return {
    section: getHumanInteractionSectionTitle(),
    line: buildInteractionMemoryLine(capture),
    capture,
  };
}

module.exports = {
  buildInteractionMemoryLine,
  classifyInteractionMemoryEntry,
  resolveInteractionCapture,
};
