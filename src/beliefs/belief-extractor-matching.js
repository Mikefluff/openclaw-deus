"use strict";

const {
  BELIEF_EXTRACTION_POLICY,
  similarityExceedsThreshold,
} = require("./belief-policy");

function calculateSimilarity(a, b) {
  const aWords = new Set(a.split(/\s+/));
  const bWords = new Set(b.split(/\s+/));
  const intersection = new Set([...aWords].filter((value) => bWords.has(value)));
  const union = new Set([...aWords, ...bWords]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function findExistingBelief(beliefs, content) {
  return beliefs.find((belief) => {
    const similarity = calculateSimilarity(
      belief.content.toLowerCase(),
      content.toLowerCase(),
    );
    return similarityExceedsThreshold(
      similarity,
      BELIEF_EXTRACTION_POLICY.existingBeliefSimilarityThreshold,
    );
  });
}

function generateBeliefId(beliefs, prefix) {
  const existing = beliefs.filter((belief) => belief.belief_id.startsWith(prefix));
  const numbers = existing.map((belief) => {
    const match = belief.belief_id.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  });
  const max = Math.max(0, ...numbers);
  return `${prefix}${max + 1}`;
}

module.exports = {
  calculateSimilarity,
  findExistingBelief,
  generateBeliefId,
};
