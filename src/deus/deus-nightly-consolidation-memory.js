"use strict";

const fs = require("fs");
const {
  resolveMemoryWriteDir,
  resolveMemoryWritePath,
} = require("../runtime/runtime-surface-paths");
const {
  appendDailyMemoryEntry,
  buildDailyMemoryTemplate,
  normalizeDailyMemoryDocument,
  parseDailyMemorySections,
  renderDailyMemoryDocument,
} = require("../memory/daily-memory-builder");
const { resolveToday } = require("./deus-nightly-consolidation-paths");

function appendMemoryReflection(
  entries,
  section = "System Events",
  options = {},
) {
  const dayKey = options.today || resolveToday();
  const memoryPath = resolveMemoryWritePath(dayKey, {
    workspaceRoot: options.workspaceRoot,
  });
  const currentContent = fs.existsSync(memoryPath)
    ? fs.readFileSync(memoryPath, "utf8")
    : buildDailyMemoryTemplate(dayKey, {
        workspaceRoot: options.workspaceRoot,
      });
  const normalizedContent = normalizeDailyMemoryDocument(
    currentContent,
    dayKey,
    { workspaceRoot: options.workspaceRoot },
  );
  const sections = parseDailyMemorySections(normalizedContent);
  const timestamp = options.timestamp || new Date().toISOString();
  let added = false;

  for (const entry of entries) {
    if (appendDailyMemoryEntry(sections, section, timestamp, entry)) {
      added = true;
    }
  }

  if (
    added ||
    normalizedContent !== currentContent ||
    !fs.existsSync(memoryPath)
  ) {
    fs.mkdirSync(
      resolveMemoryWriteDir({ workspaceRoot: options.workspaceRoot }),
      {
        recursive: true,
      },
    );
    fs.writeFileSync(
      memoryPath,
      renderDailyMemoryDocument(dayKey, sections, {
        workspaceRoot: options.workspaceRoot,
      }),
    );
  }

  return {
    added,
    memoryPath,
  };
}

module.exports = {
  appendMemoryReflection,
};
