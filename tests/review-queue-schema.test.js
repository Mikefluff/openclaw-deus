const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizePendingBeliefReviewEntry,
  parsePendingBeliefReviewQueue,
  renderPendingBeliefReviewQueue,
} = require("../src/beliefs/review-queue-schema");

test("review queue schema round-trips canonical entries through shared render and parse helpers", () => {
  const text = renderPendingBeliefReviewQueue([
    {
      timestamp: "2026-03-18T00:00:00.000Z",
      marker: "2026-03-18-promote-me",
      candidate:
        "Infrastructure and deployment work keeps recurring and should remain a first-class operational concern.",
      category: "operational",
      evidence: "recurring pattern across recent memory files",
      evidence_sources: [
        "memory/2026-03-16.md",
        "memory/2026-03-17.md",
        "memory/2026-03-18.md",
      ],
      recurrence: 3,
      confidence_proposal: 0.65,
      promotion_decision: "review_before_promotion",
      human_review_needed: "no",
      provenance: "memory_pattern",
      notes: "fixture entry",
    },
  ]);

  assert.match(text, /# Pending Belief Promotions/);
  assert.match(text, /## 2026-03-18T00:00:00\.000Z — promote-me/);
  assert.match(text, /- marker: promote-me/);

  const [entry] = parsePendingBeliefReviewQueue(text);

  assert.deepEqual(entry, {
    header: "2026-03-18T00:00:00.000Z — promote-me",
    marker: "promote-me",
    candidate:
      "Infrastructure and deployment work keeps recurring and should remain a first-class operational concern.",
    category: "operational",
    evidence: "recurring pattern across recent memory files",
    evidence_sources: [
      "memory/2026-03-16.md",
      "memory/2026-03-17.md",
      "memory/2026-03-18.md",
    ],
    recurrence: 3,
    confidence_proposal: 0.65,
    promotion_decision: "review_before_promotion",
    human_review_needed: "no",
    provenance: "memory_pattern",
    notes: "fixture entry",
  });
});

test("review queue schema applies canonical defaults and legacy aliases during normalization", () => {
  const entry = normalizePendingBeliefReviewEntry({
    header: "2026-03-18T00:00:00.000Z — extractor-candidate",
    marker: "2026-03-18-extractor-candidate",
    candidate: "Human prefers concise technical language",
    source: "memory/2026-03-18.md",
    action: "review_before_promotion",
    evidence_strength: "strong",
  });

  assert.deepEqual(entry, {
    header: "2026-03-18T00:00:00.000Z — extractor-candidate",
    marker: "2026-03-18-extractor-candidate",
    candidate: "Human prefers concise technical language",
    category: "operational",
    evidence: "",
    evidence_sources: ["memory/2026-03-18.md"],
    recurrence: 0,
    confidence_proposal: 0,
    promotion_decision: "review_before_promotion",
    human_review_needed: "no",
    provenance: "other",
    notes: "strong",
  });
});
