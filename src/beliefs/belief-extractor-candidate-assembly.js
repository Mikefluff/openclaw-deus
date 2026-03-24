"use strict";

const {
  selectExtractionConfidence,
  shouldAutoPromoteCandidate,
} = require("./belief-policy");
const {
  parseDailyMemorySections,
  splitDailyMemoryEntryBlocks,
  stripDailyMemoryEntryTimestamp,
} = require("../memory/daily-memory-builder");
const { getHumanInteractionSectionTitle } = require("../memory/user-context");
const {
  EXTRACTION_PATTERNS,
  hasExtractionSignal,
} = require("./belief-extractor-pattern-catalog");
const {
  detectMemoryCandidateProvenance,
} = require("./belief-extractor-provenance");
const {
  extractInteractionCandidates,
} = require("./belief-extractor-interaction-parser");

function extractPatterns(text, source, context = {}) {
  const candidates = [];
  const provenance = context.provenance || "memory_pattern";
  const allowAutoPromote = context.allowAutoPromote !== false;

  for (const [type, config] of Object.entries(EXTRACTION_PATTERNS)) {
    for (const pattern of config.patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const hasStrongSignal = hasExtractionSignal(text);
        const explicitMatch = (match[0] || "").trim();

        candidates.push({
          type,
          content:
            type === "workflow"
              ? `User requirement: ${explicitMatch}`
              : `User signal: ${explicitMatch}`,
          confidence: selectExtractionConfidence(hasStrongSignal),
          source,
          category: config.category,
          prefix: config.prefix,
          evidenceStrength: hasStrongSignal ? "strong" : "weak",
          explicitMatch,
          autoPromote:
            allowAutoPromote &&
            shouldAutoPromoteCandidate({
              hasStrongSignal,
              explicitMatchLength: explicitMatch.length,
            }),
          provenance,
        });
      }
    }
  }

  return candidates;
}

function extractSectionPatternCandidates(sections, source) {
  const candidates = [];

  for (const [sectionTitle, sectionBody] of sections.entries()) {
    for (const block of splitDailyMemoryEntryBlocks(sectionBody || "")) {
      const text = stripDailyMemoryEntryTimestamp(block);
      if (!text) {
        continue;
      }

      const provenance = detectMemoryCandidateProvenance(sectionTitle, text);
      candidates.push(
        ...extractPatterns(text, source, {
          provenance,
          allowAutoPromote: provenance === "memory_pattern",
        }),
      );
    }
  }

  return candidates;
}

function extractCandidatesFromMemoryContent(content, source, options = {}) {
  const sections = parseDailyMemorySections(content);
  const interactionSectionTitle = getHumanInteractionSectionTitle(options);
  const interactionSection = sections.get(interactionSectionTitle) || "";
  sections.delete(interactionSectionTitle);

  return [
    ...extractSectionPatternCandidates(sections, source),
    ...extractInteractionCandidates(interactionSection, source),
  ];
}

module.exports = {
  extractCandidatesFromMemoryContent,
  extractPatterns,
  extractSectionPatternCandidates,
};
