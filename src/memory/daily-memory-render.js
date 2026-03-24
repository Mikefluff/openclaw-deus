"use strict";

const {
  DAILY_MEMORY_FOOTER,
  DAILY_MEMORY_TITLE_SUFFIX,
  DAILY_MEMORY_TOTAL_ACTIVITIES_LABEL,
  getDailyMemorySections,
} = require("./daily-memory-schema");
const {
  coerceToCanonicalDailyMemorySections,
} = require("./daily-memory-coercion");

function buildOrderedDailyMemorySections(sectionMap) {
  return buildOrderedDailyMemorySectionsWithOptions(sectionMap);
}

function buildOrderedDailyMemorySectionsWithOptions(sectionMap, options = {}) {
  const ordered = new Map();
  const dailySections = getDailyMemorySections(options);

  for (const section of dailySections) {
    ordered.set(section, sectionMap.get(section) || "");
  }

  for (const [section, body] of sectionMap.entries()) {
    if (!ordered.has(section)) {
      ordered.set(section, body);
    }
  }

  return ordered;
}

function countDailyMemoryEntries(sectionMap) {
  let count = 0;

  for (const body of sectionMap.values()) {
    count += body.split("\n").filter((line) => line.startsWith("- ")).length;
  }

  return count;
}

function renderDailyMemoryDocument(dayKey, sectionMap, options = {}) {
  const orderedSections = buildOrderedDailyMemorySectionsWithOptions(
    sectionMap,
    options,
  );
  let output = `# ${dayKey} — ${DAILY_MEMORY_TITLE_SUFFIX}\n\n**${DAILY_MEMORY_TOTAL_ACTIVITIES_LABEL}:** ${countDailyMemoryEntries(
    orderedSections,
  )}\n\n`;

  for (const [section, body] of orderedSections.entries()) {
    output += `## ${section}\n`;

    if (body) {
      output += `${body.trimEnd()}\n`;
    }

    output += "\n";
  }

  output += DAILY_MEMORY_FOOTER;
  return output;
}

function buildDailyMemoryTemplate(dayKey, options = {}) {
  return renderDailyMemoryDocument(dayKey, new Map(), options);
}

function normalizeDailyMemoryDocument(content, dayKey, options = {}) {
  return renderDailyMemoryDocument(
    dayKey,
    coerceToCanonicalDailyMemorySections(content, options),
    options,
  );
}

module.exports = {
  buildDailyMemoryTemplate,
  buildOrderedDailyMemorySections,
  buildOrderedDailyMemorySectionsWithOptions,
  countDailyMemoryEntries,
  normalizeDailyMemoryDocument,
  renderDailyMemoryDocument,
};
