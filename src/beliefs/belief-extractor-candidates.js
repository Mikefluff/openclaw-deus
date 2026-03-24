"use strict";

const {
  extractCandidatesFromMemoryContent,
  extractPatterns,
  extractSectionPatternCandidates,
} = require("./belief-extractor-candidate-assembly");
const {
  buildInteractionCandidateContent,
  extractInteractionCandidates,
  parseInteractionMemoryEntry,
} = require("./belief-extractor-interaction-parser");
const {
  calculateSimilarity,
  findExistingBelief,
  generateBeliefId,
} = require("./belief-extractor-matching");
const {
  detectMemoryCandidateProvenance,
} = require("./belief-extractor-provenance");

module.exports = {
  buildInteractionCandidateContent,
  calculateSimilarity,
  detectMemoryCandidateProvenance,
  extractCandidatesFromMemoryContent,
  extractInteractionCandidates,
  extractPatterns,
  extractSectionPatternCandidates,
  findExistingBelief,
  generateBeliefId,
  parseInteractionMemoryEntry,
};
