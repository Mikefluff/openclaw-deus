const coercion = require("./daily-memory-coercion");
const entry = require("./daily-memory-entry");
const render = require("./daily-memory-render");

module.exports = {
  appendDailyMemoryEntry: entry.appendDailyMemoryEntry,
  appendDailyMemoryEntryBlock: entry.appendDailyMemoryEntryBlock,
  buildDailyMemoryTemplate: render.buildDailyMemoryTemplate,
  buildOrderedDailyMemorySections: render.buildOrderedDailyMemorySections,
  buildOrderedDailyMemorySectionsWithOptions:
    render.buildOrderedDailyMemorySectionsWithOptions,
  coerceToCanonicalDailyMemorySections:
    coercion.coerceToCanonicalDailyMemorySections,
  countDailyMemoryEntries: render.countDailyMemoryEntries,
  extractLooseDailyMemoryBody: coercion.extractLooseDailyMemoryBody,
  LEGACY_DAILY_MEMORY_SECTION_MAP: coercion.LEGACY_DAILY_MEMORY_SECTION_MAP,
  mergeDailyMemorySectionBodies: coercion.mergeDailyMemorySectionBodies,
  migrateLegacyBodyToBullets: coercion.migrateLegacyBodyToBullets,
  normalizeDailyMemoryDocument: render.normalizeDailyMemoryDocument,
  parseDailyMemorySections: coercion.parseDailyMemorySections,
  renderDailyMemoryDocument: render.renderDailyMemoryDocument,
  splitDailyMemoryEntryBlocks: coercion.splitDailyMemoryEntryBlocks,
  stripDailyMemoryEntryTimestamp: entry.stripDailyMemoryEntryTimestamp,
};
