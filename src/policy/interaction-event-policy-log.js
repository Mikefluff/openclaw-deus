"use strict";

const {
  normalizeInteractionEvent,
} = require("./interaction-event-policy-normalize");

function extractInteractionEventFromLogEntry(entry = {}) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }

  if (entry.context?.interaction_event) {
    return normalizeInteractionEvent(entry.context.interaction_event);
  }

  if (entry.context?.interaction) {
    return normalizeInteractionEvent(entry.context.interaction);
  }

  if (String(entry.type || "").toLowerCase() === "interaction") {
    return normalizeInteractionEvent({
      type: entry.context?.kind,
      summary: entry.description || entry.message || entry.event,
      content: entry.context?.content || entry.description || entry.message,
      tags: entry.context?.tags,
      signals: entry.context?.signals,
    });
  }

  return null;
}

function isHumanInteractionActivityEntry(entry = {}) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return false;
  }

  const structured = extractInteractionEventFromLogEntry(entry);
  if (structured) {
    return structured.actor === "human";
  }

  const type = String(entry.type || entry.event || "").toLowerCase();
  const text = JSON.stringify(entry).toLowerCase();
  return (
    type === "interaction" ||
    /дэн|den|instruction|asked|requested|human/.test(text)
  );
}

module.exports = {
  extractInteractionEventFromLogEntry,
  isHumanInteractionActivityEntry,
};
