"use strict";

const {
  splitDailyMemoryEntryBlocks,
} = require("./daily-memory-coercion");

function stripDailyMemoryEntryTimestamp(entryBlock) {
  return entryBlock.replace(/^- .*?: /, "");
}

function appendDailyMemoryEntryBlock(sectionBody, timestamp, entry) {
  const existingBlocks = splitDailyMemoryEntryBlocks(sectionBody);

  if (
    existingBlocks.some(
      (block) => stripDailyMemoryEntryTimestamp(block) === entry,
    )
  ) {
    return {
      added: false,
      sectionBody,
    };
  }

  const newBlock = `- ${timestamp}: ${entry}`;
  const trimmed = sectionBody.trimEnd();

  return {
    added: true,
    sectionBody: trimmed ? `${trimmed}\n${newBlock}` : newBlock,
  };
}

function appendDailyMemoryEntry(sectionMap, section, timestamp, entry) {
  const update = appendDailyMemoryEntryBlock(
    sectionMap.get(section) || "",
    timestamp,
    entry,
  );

  if (!update.added) {
    return false;
  }

  sectionMap.set(section, update.sectionBody);
  return true;
}

module.exports = {
  appendDailyMemoryEntry,
  appendDailyMemoryEntryBlock,
  stripDailyMemoryEntryTimestamp,
};
