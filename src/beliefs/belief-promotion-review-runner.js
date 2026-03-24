"use strict";

const { decidePromotion } = require("./belief-policy");
const { appendDeusOpsLog } = require("../deus/deus-ops-log");
const { loadBeliefs, saveBeliefs } = require("./belief-promotion-review-beliefs");
const {
  parseReviewQueue,
  updateReviewFile,
} = require("./belief-promotion-review-queue");
const {
  findExistingBelief,
} = require("./belief-promotion-review-matching");
const {
  applyPromotionDecision,
} = require("./belief-promotion-review-apply");
const {
  buildPromotionReviewResult,
  createPromotionReviewCounters,
  recordPromotionOutcome,
} = require("./belief-promotion-review-summary");

function log(message, options = {}) {
  appendDeusOpsLog({
    component: options.component || "belief-promotion",
    workspaceRoot: options.workspaceRoot,
    message,
  });
}

function runBeliefPromotionReview(options = {}) {
  const entries = parseReviewQueue(options);
  const beliefs = loadBeliefs(options);
  const decisions = {};
  const counters = createPromotionReviewCounters();

  log(`Starting promotion review for ${entries.length} queue entries`, options);

  for (const entry of entries) {
    const decision = decidePromotion(entry);
    const timestamp = new Date().toISOString();
    decisions[entry.marker] = decision;

    const outcome = applyPromotionDecision({
      beliefs,
      entry,
      decision,
      existing: findExistingBelief(beliefs, entry.candidate),
      timestamp,
    });
    recordPromotionOutcome(counters, outcome.outcome);
    log(outcome.message, options);
  }

  saveBeliefs(beliefs, options);
  updateReviewFile(entries, decisions, options);

  const result = buildPromotionReviewResult(
    entries,
    beliefs,
    counters,
    new Date().toISOString(),
  );

  log(
    `Promotion review complete: ${result.promoted} promoted, ${result.deferred} deferred, ${result.rejected} rejected, ${result.refreshed} refreshed`,
    options,
  );
  return result;
}

module.exports = {
  log,
  runBeliefPromotionReview,
};
