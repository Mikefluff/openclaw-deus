const {
  REVIEW_QUEUE_FIELDS,
  REVIEW_QUEUE_INTRO,
  REVIEW_QUEUE_OUTRO,
  REVIEW_QUEUE_TITLE,
  normalizePendingBeliefReviewEntry,
} = require("./review-queue-base");
const { dedupePendingBeliefReviewEntries } = require("./review-queue-merge");

function parsePendingBeliefReviewQueue(text) {
  const blocks = text.split(/^## /m).slice(1);

  return dedupePendingBeliefReviewEntries(
    blocks
      .map((rawBlock) => {
        const lines = rawBlock.split("\n");
        const header = lines[0].trim();
        if (header === "Entry schema") {
          return null;
        }

        const fields = {};

        for (const line of lines.slice(1)) {
          const match = line.match(/^- ([a-z_]+):\s*(.*)$/);
          if (!match) {
            continue;
          }
          fields[match[1]] = match[2];
        }

        return normalizePendingBeliefReviewEntry({
          header,
          ...fields,
        });
      })
      .filter(Boolean),
  );
}

function renderPendingBeliefReviewEntry(entry) {
  const normalized = normalizePendingBeliefReviewEntry(entry);

  return [
    `## ${normalized.header}`,
    `- marker: ${normalized.marker}`,
    `- candidate: ${normalized.candidate}`,
    `- category: ${normalized.category}`,
    `- evidence: ${normalized.evidence}`,
    `- evidence_sources: ${normalized.evidence_sources.join(", ")}`,
    `- recurrence: ${normalized.recurrence}`,
    `- confidence_proposal: ${normalized.confidence_proposal}`,
    `- promotion_decision: ${normalized.promotion_decision}`,
    `- human_review_needed: ${normalized.human_review_needed}`,
    `- provenance: ${normalized.provenance}`,
    `- notes: ${normalized.notes}`,
  ].join("\n");
}

function renderPendingBeliefReviewQueue(entries) {
  const normalizedEntries = dedupePendingBeliefReviewEntries(entries);
  let output = `${REVIEW_QUEUE_TITLE}\n\n${REVIEW_QUEUE_INTRO}\n\n## Entry schema\n`;

  for (const field of REVIEW_QUEUE_FIELDS) {
    output += `- \`${field.name}\` — ${field.description}\n`;
  }

  output += `\n${REVIEW_QUEUE_OUTRO}\n`;

  for (const entry of normalizedEntries) {
    output += `\n${renderPendingBeliefReviewEntry(entry)}\n`;
  }

  return output;
}

module.exports = {
  parsePendingBeliefReviewQueue,
  renderPendingBeliefReviewEntry,
  renderPendingBeliefReviewQueue,
};
