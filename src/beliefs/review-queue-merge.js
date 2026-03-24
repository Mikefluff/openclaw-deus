const {
  buildPendingBeliefReviewIdentity,
  buildPendingBeliefReviewMarker,
  deriveReviewQueueLabel,
  extractPendingBeliefReviewTimestamp,
  normalizeEvidenceSources,
  normalizeNumber,
  normalizePendingBeliefReviewEntry,
  normalizeString,
  slugReviewQueueLabel,
  sortStrings,
  stripPendingBeliefReviewDatePrefix,
  uniqueValues,
} = require("./review-queue-base");

function sortPendingBeliefReviewEntries(entries) {
  return [...entries].sort((left, right) => {
    const leftTimestamp = extractPendingBeliefReviewTimestamp(left);
    const rightTimestamp = extractPendingBeliefReviewTimestamp(right);

    if (leftTimestamp && rightTimestamp && leftTimestamp !== rightTimestamp) {
      return leftTimestamp.localeCompare(rightTimestamp);
    }

    if (leftTimestamp && !rightTimestamp) {
      return -1;
    }

    if (!leftTimestamp && rightTimestamp) {
      return 1;
    }

    return normalizeString(left.header).localeCompare(
      normalizeString(right.header),
    );
  });
}

function selectCanonicalPendingBeliefReviewMarker(entries) {
  const markers = uniqueValues(
    entries.map((entry) =>
      slugReviewQueueLabel(stripPendingBeliefReviewDatePrefix(entry.marker)),
    ),
  );

  if (markers.length > 0) {
    return markers[0];
  }

  const latest = entries[entries.length - 1] || {};
  return buildPendingBeliefReviewMarker(latest.category, latest.candidate);
}

function selectLatestNonEmptyValue(entries, field, fallback = "") {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const value = entries[index][field];
    if (Array.isArray(value)) {
      if (value.length > 0) {
        return value;
      }
      continue;
    }

    if (normalizeString(value)) {
      return value;
    }
  }

  return fallback;
}

function mergePendingBeliefReviewEntries(entries) {
  const normalizedEntries = sortPendingBeliefReviewEntries(
    entries.map(normalizePendingBeliefReviewEntry),
  );
  const latest = normalizedEntries[normalizedEntries.length - 1] || {};
  const timestamp =
    extractPendingBeliefReviewTimestamp(latest) ||
    extractPendingBeliefReviewTimestamp(normalizedEntries[0]) ||
    new Date().toISOString();
  const marker = selectCanonicalPendingBeliefReviewMarker(normalizedEntries);
  const candidate = selectLatestNonEmptyValue(normalizedEntries, "candidate");
  const category = selectLatestNonEmptyValue(
    normalizedEntries,
    "category",
    "operational",
  );
  const evidenceValues = uniqueValues(
    normalizedEntries.map((entry) => normalizeString(entry.evidence)),
  );
  const notesValues = uniqueValues(
    normalizedEntries.map((entry) => normalizeString(entry.notes)),
  );
  const evidenceSources = sortStrings(
    uniqueValues(
      normalizedEntries.flatMap((entry) =>
        normalizeEvidenceSources(entry.evidence_sources),
      ),
    ),
  );

  return {
    header: `${timestamp} — ${deriveReviewQueueLabel({ marker, candidate })}`,
    marker,
    candidate,
    category,
    evidence: evidenceValues.join(" | "),
    evidence_sources: evidenceSources,
    recurrence: Math.max(
      evidenceSources.length,
      normalizedEntries.length,
      ...normalizedEntries.map((entry) => normalizeNumber(entry.recurrence)),
    ),
    confidence_proposal: Math.max(
      0,
      ...normalizedEntries.map((entry) =>
        normalizeNumber(entry.confidence_proposal),
      ),
    ),
    promotion_decision: normalizeString(
      selectLatestNonEmptyValue(
        normalizedEntries,
        "promotion_decision",
        "pending",
      ),
      "pending",
    ),
    human_review_needed: normalizedEntries.some(
      (entry) =>
        normalizeString(entry.human_review_needed, "no").toLowerCase() ===
        "yes",
    )
      ? "yes"
      : "no",
    provenance: normalizeString(
      selectLatestNonEmptyValue(normalizedEntries, "provenance", "other"),
      "other",
    ),
    notes: notesValues.join(" | "),
  };
}

function dedupePendingBeliefReviewEntries(entries = []) {
  const groups = new Map();

  for (const entry of entries.map(normalizePendingBeliefReviewEntry)) {
    const identity = buildPendingBeliefReviewIdentity(entry);
    const existing = groups.get(identity) || [];
    existing.push(entry);
    groups.set(identity, existing);
  }

  return sortPendingBeliefReviewEntries(
    [...groups.values()].map((group) => mergePendingBeliefReviewEntries(group)),
  );
}

function upsertPendingBeliefReviewEntry(entries = [], entry = {}) {
  const before = dedupePendingBeliefReviewEntries(entries);
  const after = dedupePendingBeliefReviewEntries([...before, entry]);

  return {
    changed: JSON.stringify(before) !== JSON.stringify(after),
    entries: after,
  };
}

function isCompletePendingBeliefReviewEntry(entry) {
  const normalized = normalizePendingBeliefReviewEntry(entry);
  return Boolean(normalized.marker && normalized.candidate);
}

module.exports = {
  dedupePendingBeliefReviewEntries,
  isCompletePendingBeliefReviewEntry,
  mergePendingBeliefReviewEntries,
  sortPendingBeliefReviewEntries,
  upsertPendingBeliefReviewEntry,
};
