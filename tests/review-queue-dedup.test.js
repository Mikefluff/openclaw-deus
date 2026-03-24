const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parsePendingBeliefReviewQueue,
  renderPendingBeliefReviewQueue,
  upsertPendingBeliefReviewEntry,
} = require("../src/beliefs/review-queue-schema");

test("review queue parser collapses legacy daily duplicates into one canonical entry", () => {
  const text = [
    "# Pending Belief Promotions",
    "",
    "This file is the review queue for candidate belief promotions.",
    "",
    "## Entry schema",
    "- `marker` — stable dedupe key",
    "",
    "Do not treat entries here as durable beliefs until reviewed/promoted.",
    "",
    "## 2026-03-10T17:05:04.701Z — infrastructure_work",
    "- marker: 2026-03-10-infrastructure_work",
    "- candidate: Infrastructure and deployment work keeps recurring and should remain a first-class operational concern.",
    "- category: operational",
    "- evidence: recurring pattern across recent memory files",
    "- evidence_sources: memory/2026-03-03.md, memory/2026-03-05.md",
    "- recurrence: 2",
    "- confidence_proposal: 0.65",
    "- promotion_decision: defer",
    "- human_review_needed: no",
    "- provenance: sleep_reflection",
    "- notes: pattern detected by nightly consolidation, not yet promoted into durable beliefs",
    "",
    "## 2026-03-13T21:20:12.422Z — infrastructure_work",
    "- marker: 2026-03-13-infrastructure_work",
    "- candidate: Infrastructure and deployment work keeps recurring and should remain a first-class operational concern.",
    "- category: operational",
    "- evidence: recurring pattern across recent memory files",
    "- evidence_sources: memory/2026-03-03.md, memory/2026-03-05.md, memory/2026-03-11.md, memory/2026-03-12.md",
    "- recurrence: 4",
    "- confidence_proposal: 0.65",
    "- promotion_decision: promote",
    "- human_review_needed: no",
    "- provenance: sleep_reflection",
    "- notes: pattern detected by nightly consolidation, not yet promoted into durable beliefs",
    "",
  ].join("\n");

  const [entry] = parsePendingBeliefReviewQueue(text);

  assert.deepEqual(entry, {
    header: "2026-03-13T21:20:12.422Z — infrastructure-work",
    marker: "infrastructure-work",
    candidate:
      "Infrastructure and deployment work keeps recurring and should remain a first-class operational concern.",
    category: "operational",
    evidence: "recurring pattern across recent memory files",
    evidence_sources: [
      "memory/2026-03-03.md",
      "memory/2026-03-05.md",
      "memory/2026-03-11.md",
      "memory/2026-03-12.md",
    ],
    recurrence: 4,
    confidence_proposal: 0.65,
    promotion_decision: "promote",
    human_review_needed: "no",
    provenance: "sleep_reflection",
    notes:
      "pattern detected by nightly consolidation, not yet promoted into durable beliefs",
  });
});

test("review queue upsert merges a new daily duplicate into the canonical entry", () => {
  const existingEntries = parsePendingBeliefReviewQueue(
    renderPendingBeliefReviewQueue([
      {
        timestamp: "2026-03-16T21:20:20.265Z",
        marker: "2026-03-16-infrastructure-work",
        candidate:
          "Infrastructure and deployment work keeps recurring and should remain a first-class operational concern.",
        category: "operational",
        evidence: "recurring pattern across recent memory files",
        evidence_sources: [
          "memory/2026-03-12.md",
          "memory/2026-03-13.md",
          "memory/2026-03-14.md",
        ],
        recurrence: 3,
        confidence_proposal: 0.65,
        promotion_decision: "review_before_promotion",
        human_review_needed: "no",
        provenance: "sleep_reflection",
        notes: "pattern detected by nightly consolidation",
      },
    ]),
  );

  const { changed, entries } = upsertPendingBeliefReviewEntry(existingEntries, {
    timestamp: "2026-03-18T21:20:20.265Z",
    marker: "2026-03-18-infrastructure-work",
    candidate:
      "Infrastructure and deployment work keeps recurring and should remain a first-class operational concern.",
    category: "operational",
    evidence: "recurring pattern across recent memory files",
    evidence_sources: [
      "memory/2026-03-14.md",
      "memory/2026-03-15.md",
      "memory/2026-03-18.md",
    ],
    recurrence: 6,
    confidence_proposal: 0.65,
    promotion_decision: "promote",
    human_review_needed: "no",
    provenance: "sleep_reflection",
    notes: "pattern detected by nightly consolidation",
  });

  assert.equal(changed, true);
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], {
    header: "2026-03-18T21:20:20.265Z — infrastructure-work",
    marker: "infrastructure-work",
    candidate:
      "Infrastructure and deployment work keeps recurring and should remain a first-class operational concern.",
    category: "operational",
    evidence: "recurring pattern across recent memory files",
    evidence_sources: [
      "memory/2026-03-12.md",
      "memory/2026-03-13.md",
      "memory/2026-03-14.md",
      "memory/2026-03-15.md",
      "memory/2026-03-18.md",
    ],
    recurrence: 6,
    confidence_proposal: 0.65,
    promotion_decision: "promote",
    human_review_needed: "no",
    provenance: "sleep_reflection",
    notes: "pattern detected by nightly consolidation",
  });
});
