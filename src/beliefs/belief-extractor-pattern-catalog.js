"use strict";

const { INTERACTION_SIGNAL_KEYWORDS } = require("../policy/interaction-event-policy");

const EXTRACTION_SIGNAL_KEYWORDS = Object.freeze([
  ...new Set(Object.values(INTERACTION_SIGNAL_KEYWORDS).flat()),
]);

const EXTRACTION_PATTERNS = Object.freeze({
  communication: Object.freeze({
    patterns: [
      /предпочитаю (.+?)(?:\.|$)/gi,
      /не нравится (.+?)(?:\.|$)/gi,
      /не используй (.+?)(?:\.|$)/gi,
      /избегай (.+?)(?:\.|$)/gi,
    ],
    category: "communication",
    prefix: "M",
  }),
  workflow: Object.freeze({
    patterns: [
      /хочу (.+?)(?:\.|$)/gi,
      /нужно (.+?)(?:\.|$)/gi,
      /важно (.+?)(?:\.|$)/gi,
      /критично (.+?)(?:\.|$)/gi,
    ],
    category: "workflow",
    prefix: "W",
  }),
});

function hasExtractionSignal(text) {
  const normalized = String(text || "").toLowerCase();
  return EXTRACTION_SIGNAL_KEYWORDS.some((signal) => normalized.includes(signal));
}

module.exports = {
  EXTRACTION_PATTERNS,
  EXTRACTION_SIGNAL_KEYWORDS,
  hasExtractionSignal,
};
