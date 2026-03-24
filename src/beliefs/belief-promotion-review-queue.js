"use strict";

const fs = require("fs");
const {
  resolvePendingBeliefsPath,
  resolvePendingBeliefsWritePath,
} = require("../runtime/runtime-surface-paths");
const {
  isCompletePendingBeliefReviewEntry,
  parsePendingBeliefReviewQueue,
  renderPendingBeliefReviewQueue,
} = require("./review-queue-schema");

function parseReviewQueue(options = {}) {
  const reviewFile =
    options.reviewFile ||
    resolvePendingBeliefsPath({ workspaceRoot: options.workspaceRoot });
  if (!fs.existsSync(reviewFile)) {
    return [];
  }

  const text = fs.readFileSync(reviewFile, "utf8");

  return parsePendingBeliefReviewQueue(text).filter(
    isCompletePendingBeliefReviewEntry,
  );
}

function updateReviewFile(entries, decisions, options = {}) {
  const reviewFile =
    options.reviewFile ||
    resolvePendingBeliefsWritePath({ workspaceRoot: options.workspaceRoot });
  const updatedEntries = entries.map((entry) => ({
    ...entry,
    promotion_decision:
      decisions[entry.marker] || entry.promotion_decision || "pending",
  }));

  fs.writeFileSync(
    reviewFile,
    `${renderPendingBeliefReviewQueue(updatedEntries)}\n`,
  );
}

module.exports = {
  parseReviewQueue,
  updateReviewFile,
};
