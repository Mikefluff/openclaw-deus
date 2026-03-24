"use strict";

const {
  BELIEF_PROMOTION_POLICY,
  similarityExceedsThreshold,
} = require("./belief-policy");

function similarity(left, right) {
  const leftWords = new Set(left.split(/\s+/));
  const rightWords = new Set(right.split(/\s+/));
  const intersection = new Set(
    [...leftWords].filter((word) => rightWords.has(word)),
  );
  const union = new Set([...leftWords, ...rightWords]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function findExistingBelief(beliefs, content) {
  return beliefs.find((belief) =>
    similarityExceedsThreshold(
      similarity(belief.content.toLowerCase(), content.toLowerCase()),
      BELIEF_PROMOTION_POLICY.existingBeliefSimilarityThreshold,
    ),
  );
}

function generateBeliefId(beliefs, prefix = "R") {
  const existing = beliefs.filter((belief) => belief.belief_id.startsWith(prefix));
  const nums = existing.map((belief) =>
    parseInt((belief.belief_id.match(/\d+/) || ["0"])[0], 10),
  );
  return `${prefix}${Math.max(0, ...nums) + 1}`;
}

module.exports = {
  findExistingBelief,
  generateBeliefId,
  similarity,
};
