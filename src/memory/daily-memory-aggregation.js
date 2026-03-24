"use strict";

const fs = require("fs");
const path = require("path");
const { WORKSPACE_ROOT } = require("../workspace/workspace-path");
const {
  resolveLogPath,
  resolveMemoryWriteDir,
  resolveMemoryWritePath,
} = require("../runtime/runtime-surface-paths");
const { getWorkspaceDateContext } = require("../workspace/workspace-date-context");
const {
  appendDailyMemoryEntry,
  buildDailyMemoryTemplate,
  normalizeDailyMemoryDocument,
  parseDailyMemorySections,
  renderDailyMemoryDocument,
} = require("./daily-memory-builder");
const {
  classifyPolicyMemoryEntry,
  isPolicyActivityEntry,
} = require("../policy/deus-policy-feedback");
const { isHumanInteractionActivityEntry } = require("../policy/interaction-event-policy");
const {
  classifyInteractionMemoryEntry,
} = require("./interaction-memory-routing");

function todayString() {
  return getWorkspaceDateContext().today;
}

function ensureMemoryFile(dateStr, options = {}) {
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  const file = resolveMemoryWritePath(dateStr, { workspaceRoot });
  let content;

  if (!fs.existsSync(file)) {
    fs.mkdirSync(resolveMemoryWriteDir({ workspaceRoot }), {
      recursive: true,
    });
    content = buildDailyMemoryTemplate(dateStr, { workspaceRoot });
  } else {
    content = fs.readFileSync(file, "utf8");
  }

  const normalized = normalizeDailyMemoryDocument(content, dateStr, {
    workspaceRoot,
  });
  if (!fs.existsSync(file) || normalized !== content) {
    fs.writeFileSync(file, normalized);
  }

  return file;
}

function describeEntry(entry) {
  return (
    entry.description ||
    entry.message ||
    entry.event ||
    "Operational event recorded"
  );
}

function classifyLog(entry) {
  const text = JSON.stringify(entry).toLowerCase();
  const type = String(entry.type || entry.event || "").toLowerCase();
  const line = describeEntry(entry);

  if (isPolicyActivityEntry(entry)) {
    return classifyPolicyMemoryEntry(entry);
  }

  if (type === "git" || /commit|branch|merge|rebase|checkout/.test(text)) {
    return { section: "Git Activity", line };
  }

  if (type === "command" || /command|npm |node |git /.test(text)) {
    return { section: "Commands Executed", line };
  }

  if (isHumanInteractionActivityEntry(entry)) {
    return classifyInteractionMemoryEntry(entry);
  }

  if (/error|failed|exception|contradiction|drift|warning/.test(text)) {
    return {
      section: "System Events",
      line,
    };
  }
  if (
    type === "decision" ||
    /decision|updated|changed|restored|migrated|defined|formalize|fixed/.test(
      text,
    )
  ) {
    return {
      section: "Decisions",
      line,
    };
  }

  return {
    section: "System Events",
    line,
  };
}

function aggregateAll(dateStr = todayString(), options = {}) {
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  const memoryFile = ensureMemoryFile(dateStr, { workspaceRoot });
  const content = fs.readFileSync(memoryFile, "utf8");
  const sections = parseDailyMemorySections(content);
  const dailyLogPath = resolveLogPath(dateStr, { workspaceRoot });
  const entries = fs.existsSync(dailyLogPath)
    ? fs
        .readFileSync(dailyLogPath, "utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .slice(-20)
    : [];

  for (const entry of entries) {
    const classified = classifyLog(entry);
    if (!classified) {
      continue;
    }
    appendDailyMemoryEntry(
      sections,
      classified.section,
      entry.timestamp || entry.ts || new Date().toISOString(),
      classified.line,
    );
  }

  fs.writeFileSync(
    memoryFile,
    renderDailyMemoryDocument(dateStr, sections, {
      workspaceRoot,
    }),
  );
  return { memoryFile, updated: true };
}

module.exports = {
  aggregateAll,
  classifyLog,
  describeEntry,
  ensureMemoryFile,
  todayString,
};
