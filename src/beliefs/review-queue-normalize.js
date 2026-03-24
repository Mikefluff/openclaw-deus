function normalizeString(value, defaultValue = "") {
  return String(value ?? defaultValue).trim();
}

function normalizeNumber(value, defaultValue = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : defaultValue;
}

function normalizeEvidenceSources(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function slugReviewQueueLabel(value) {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))];
}

function sortStrings(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function parseReviewQueueHeader(header) {
  const normalized = normalizeString(header);
  const match = normalized.match(/^(.+?)\s+—\s+(.+)$/);

  if (!match) {
    return {
      timestamp: "",
      label: normalized,
    };
  }

  return {
    timestamp: normalizeString(match[1]),
    label: normalizeString(match[2]),
  };
}

function normalizeTimestamp(value) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return "";
  }

  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? "" : new Date(parsed).toISOString();
}

function stripPendingBeliefReviewDatePrefix(marker) {
  return normalizeString(marker).replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

function buildPendingBeliefReviewMarker(...parts) {
  return parts
    .map((part) => slugReviewQueueLabel(part))
    .filter(Boolean)
    .join("-")
    .replace(/-+/g, "-");
}

module.exports = {
  buildPendingBeliefReviewMarker,
  normalizeEvidenceSources,
  normalizeNumber,
  normalizeString,
  normalizeTimestamp,
  parseReviewQueueHeader,
  slugReviewQueueLabel,
  sortStrings,
  stripPendingBeliefReviewDatePrefix,
  uniqueValues,
};
