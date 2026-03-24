"use strict";

const {
  selectExtractionConfidence,
} = require("./belief-policy");
const {
  splitDailyMemoryEntryBlocks,
  stripDailyMemoryEntryTimestamp,
} = require("../memory/daily-memory-builder");
const { hasExtractionSignal } = require("./belief-extractor-pattern-catalog");

function buildInteractionCandidateContent(content, kind) {
  const trimmed = String(content || "").trim();
  const labelByKind = {
    approval: "User approval",
    constraint: "User constraint",
    correction: "User correction",
    instruction: "User instruction",
    personal_context: "User context",
    preference: "User preference",
    project_context: "Project context",
    question: "User question",
  };
  const label = labelByKind[kind] || "User signal";

  if (trimmed) {
    return `${label}: ${trimmed}`;
  }

  return `${label}: recorded`;
}

function parseInteractionMemoryEntry(block) {
  const text = stripDailyMemoryEntryTimestamp(block);
  const match = text.match(/^([a-z_ ]+)\s+\[([a-z_]+)\]:\s+(.+)$/i);

  if (!match) {
    return null;
  }

  return {
    kind: match[1].trim().replace(/\s+/g, "_"),
    band: match[2].trim(),
    content: match[3].trim(),
    explicitMatch: match[3].trim(),
  };
}

function extractInteractionCandidates(sectionBody, source) {
  const candidates = [];

  for (const block of splitDailyMemoryEntryBlocks(sectionBody || "")) {
    const parsed = parseInteractionMemoryEntry(block);
    if (!parsed) {
      continue;
    }

    const hasStrongSignal = hasExtractionSignal(parsed.content);
    if (!hasStrongSignal) {
      continue;
    }

    const isWorkflow =
      parsed.kind === "instruction" || parsed.kind === "project_context";
    candidates.push({
      type: parsed.kind,
      content: buildInteractionCandidateContent(parsed.content, parsed.kind),
      confidence: selectExtractionConfidence(hasStrongSignal),
      source,
      category: isWorkflow ? "workflow" : "communication",
      prefix: isWorkflow ? "W" : "M",
      evidenceStrength: hasStrongSignal ? "strong" : "weak",
      explicitMatch: parsed.explicitMatch,
      autoPromote: false,
      evidenceKind: "interaction signal",
      interactionBand: parsed.band,
      provenance: "interactive_memory",
    });
  }

  return candidates;
}

module.exports = {
  buildInteractionCandidateContent,
  extractInteractionCandidates,
  parseInteractionMemoryEntry,
};
