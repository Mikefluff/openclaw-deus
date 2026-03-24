"use strict";

const fs = require("fs");
const path = require("path");
const { resolvePendingBeliefsWritePath } = require("../runtime/runtime-surface-paths");
const { CONSOLIDATION_POLICY } = require("../memory/deus-memory-consolidation-patterns");
const {
  buildPendingBeliefReviewMarker,
  parsePendingBeliefReviewQueue,
  renderPendingBeliefReviewQueue,
  upsertPendingBeliefReviewEntry,
} = require("../beliefs/review-queue-schema");
const { resolveToday } = require("./deus-nightly-consolidation-paths");

function ensurePendingBeliefQueueFile(options = {}) {
  const pendingBeliefsPath = resolvePendingBeliefsWritePath({
    workspaceRoot: options.workspaceRoot,
  });
  fs.mkdirSync(path.dirname(pendingBeliefsPath), { recursive: true });

  if (!fs.existsSync(pendingBeliefsPath)) {
    fs.writeFileSync(
      pendingBeliefsPath,
      `${renderPendingBeliefReviewQueue([])}\n`,
    );
  }

  return pendingBeliefsPath;
}

function appendPendingBeliefEntry(entry, options = {}) {
  const pendingBeliefsPath = ensurePendingBeliefQueueFile(options);
  const existingEntries = parsePendingBeliefReviewQueue(
    fs.readFileSync(pendingBeliefsPath, "utf8"),
  );
  const { changed, entries } = upsertPendingBeliefReviewEntry(
    existingEntries,
    entry,
  );

  if (!changed) {
    return false;
  }

  fs.writeFileSync(
    pendingBeliefsPath,
    `${renderPendingBeliefReviewQueue(entries)}\n`,
  );
  return true;
}

function recordPolicyPatterns(patterns, timestamp, options = {}) {
  const dayKey = options.today || resolveToday();
  let added = false;

  for (const pattern of patterns) {
    added =
      appendPendingBeliefEntry(
        {
          timestamp,
          marker: buildPendingBeliefReviewMarker(dayKey, pattern.name),
          candidate: pattern.summary,
          category: pattern.category,
          evidence: "recurring pattern across recent policy feedback entries",
          evidence_sources: pattern.evidenceSources,
          recurrence: pattern.recurrence,
          confidence_proposal: CONSOLIDATION_POLICY.confidenceProposal,
          promotion_decision: CONSOLIDATION_POLICY.defaultPromotionDecision,
          human_review_needed: "no",
          provenance: "sleep_reflection",
          notes:
            "pattern detected by nightly consolidation from policy feedback, not yet promoted into durable beliefs",
        },
        options,
      ) || added;
  }

  return added;
}

module.exports = {
  appendPendingBeliefEntry,
  ensurePendingBeliefQueueFile,
  recordPolicyPatterns,
};
