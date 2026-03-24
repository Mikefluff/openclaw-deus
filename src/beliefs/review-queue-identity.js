const {
  buildPendingBeliefReviewMarker,
  normalizeEvidenceSources,
  normalizeNumber,
  normalizeString,
  normalizeTimestamp,
  parseReviewQueueHeader,
  slugReviewQueueLabel,
  stripPendingBeliefReviewDatePrefix,
} = require("./review-queue-normalize");

function deriveReviewQueueLabel(entry) {
  if (entry.label) {
    return normalizeString(entry.label);
  }

  if (entry.marker) {
    const parts = normalizeString(entry.marker).split("-");
    if (parts.length > 3) {
      return parts.slice(3).join("-");
    }
    return normalizeString(entry.marker);
  }

  const candidate = normalizeString(entry.candidate);
  if (!candidate) {
    return "candidate";
  }

  return slugReviewQueueLabel(candidate) || "candidate";
}

function normalizeReviewQueueHeader(entry) {
  if (entry.header) {
    return normalizeString(entry.header);
  }

  const timestamp = normalizeString(
    entry.timestamp || entry.header_timestamp,
    new Date().toISOString(),
  );
  return `${timestamp} — ${deriveReviewQueueLabel(entry)}`;
}

function extractPendingBeliefReviewTimestamp(entry = {}) {
  const headerParts = parseReviewQueueHeader(entry.header);
  const directTimestamp = normalizeTimestamp(
    entry.timestamp || entry.header_timestamp || headerParts.timestamp,
  );

  if (directTimestamp) {
    return directTimestamp;
  }

  const markerDate = normalizeString(entry.marker).match(
    /^(\d{4}-\d{2}-\d{2})-/,
  );
  if (markerDate) {
    return `${markerDate[1]}T00:00:00.000Z`;
  }

  return "";
}

function normalizePendingBeliefReviewEntry(entry = {}) {
  return {
    header: normalizeReviewQueueHeader(entry),
    marker: normalizeString(entry.marker),
    candidate: normalizeString(entry.candidate),
    category: normalizeString(entry.category, "operational"),
    evidence: normalizeString(entry.evidence),
    evidence_sources: normalizeEvidenceSources(
      entry.evidence_sources ?? entry.source,
    ),
    recurrence: normalizeNumber(entry.recurrence),
    confidence_proposal: normalizeNumber(entry.confidence_proposal),
    promotion_decision: normalizeString(
      entry.promotion_decision ?? entry.action,
      "pending",
    ),
    human_review_needed: normalizeString(entry.human_review_needed, "no"),
    provenance: normalizeString(entry.provenance, "other"),
    notes: normalizeString(entry.notes ?? entry.evidence_strength),
  };
}

function buildPendingBeliefReviewIdentity(entry = {}) {
  const normalized = normalizePendingBeliefReviewEntry(entry);
  const candidateKey = normalizeString(normalized.candidate).toLowerCase();
  const categoryKey = normalizeString(
    normalized.category,
    "other",
  ).toLowerCase();

  if (candidateKey) {
    return `${categoryKey}\u0000${candidateKey}`;
  }

  const strippedMarker = stripPendingBeliefReviewDatePrefix(normalized.marker);
  if (strippedMarker) {
    return `marker\u0000${strippedMarker.toLowerCase()}`;
  }

  return `header\u0000${normalizeString(normalized.header).toLowerCase()}`;
}

module.exports = {
  buildPendingBeliefReviewIdentity,
  buildPendingBeliefReviewMarker,
  deriveReviewQueueLabel,
  extractPendingBeliefReviewTimestamp,
  normalizePendingBeliefReviewEntry,
  normalizeReviewQueueHeader,
};
