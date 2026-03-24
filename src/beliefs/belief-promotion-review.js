"use strict";

const { decidePromotion } = require("./belief-policy");
const {
  loadBeliefs,
  saveBeliefs,
} = require("./belief-promotion-review-beliefs");
const {
  applyPromotionDecision,
  classifyAnchor,
} = require("./belief-promotion-review-apply");
const {
  findExistingBelief,
  generateBeliefId,
  similarity,
} = require("./belief-promotion-review-matching");
const {
  parseReviewQueue,
  updateReviewFile,
} = require("./belief-promotion-review-queue");
const {
  runBeliefPromotionReview,
} = require("./belief-promotion-review-runner");

module.exports = {
  applyPromotionDecision,
  classifyAnchor,
  decide: decidePromotion,
  findExistingBelief,
  generateBeliefId,
  loadBeliefs,
  parseReviewQueue,
  runBeliefPromotionReview,
  saveBeliefs,
  similarity,
  updateReviewFile,
};
