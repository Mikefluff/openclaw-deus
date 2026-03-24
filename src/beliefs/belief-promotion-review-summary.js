"use strict";

function createPromotionReviewCounters() {
  return {
    promoted: 0,
    deferred: 0,
    rejected: 0,
    refreshed: 0,
  };
}

function recordPromotionOutcome(counters, outcome) {
  if (Object.hasOwn(counters, outcome)) {
    counters[outcome] += 1;
  }
}

function buildPromotionReviewResult(entries, beliefs, counters, timestamp) {
  return {
    timestamp,
    entries: entries.length,
    promoted: counters.promoted,
    deferred: counters.deferred,
    rejected: counters.rejected,
    refreshed: counters.refreshed,
    total_beliefs: beliefs.length,
  };
}

module.exports = {
  buildPromotionReviewResult,
  createPromotionReviewCounters,
  recordPromotionOutcome,
};
