"use strict";

const fs = require("fs");
const path = require("path");

const { resolveDayKeyFromTimestamp } = require("../deus/deus-activity-log");
const { normalizeDissensusDecision } = require("./deus-dissensus-schema");
const {
  resolveDissensusEventsDir,
  resolveDissensusEventsWriteDir,
  resolveDissensusLogWritePath,
} = require("../runtime/runtime-surface-paths");

function appendDissensusEvent(decisionInput, options = {}) {
  const decision = normalizeDissensusDecision(decisionInput);
  const dayKey = resolveDayKeyFromTimestamp(decision.evaluated_at);
  const logPath =
    options.filePath ||
    resolveDissensusLogWritePath(dayKey, {
      workspaceRoot: options.workspaceRoot,
      runtimeRoot: options.runtimeRoot,
    });

  fs.mkdirSync(
    resolveDissensusEventsWriteDir({
      workspaceRoot: options.workspaceRoot,
      runtimeRoot: options.runtimeRoot,
    }),
    { recursive: true },
  );
  fs.appendFileSync(logPath, `${JSON.stringify(decision)}\n`, "utf8");

  return {
    decision,
    logPath,
  };
}

function listDissensusEventFiles(options = {}) {
  const eventsDir = resolveDissensusEventsDir(options);
  if (!fs.existsSync(eventsDir)) {
    return [];
  }

  return fs
    .readdirSync(eventsDir)
    .filter((fileName) => /^\d{4}-\d{2}-\d{2}\.jsonl$/u.test(fileName))
    .sort();
}

function readDissensusEvents(options = {}) {
  const eventsDir = resolveDissensusEventsDir(options);
  const files = listDissensusEventFiles(options);
  const selectedFiles = options.dayKey
    ? files.filter((fileName) => fileName === `${options.dayKey}.jsonl`)
    : files.slice(-(options.days || files.length));
  const entries = [];

  for (const fileName of selectedFiles) {
    const filePath = path.join(eventsDir, fileName);
    const dayKey = fileName.replace(/\.jsonl$/u, "");
    const fileEntries = fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => ({
        ...normalizeDissensusDecision(JSON.parse(line)),
        dayKey,
        fileName,
        filePath,
      }));

    entries.push(...fileEntries);
  }

  if (options.limit) {
    return entries.slice(-options.limit);
  }

  return entries;
}

module.exports = {
  appendDissensusEvent,
  listDissensusEventFiles,
  readDissensusEvents,
};
