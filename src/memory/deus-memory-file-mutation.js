"use strict";

const fs = require("fs").promises;
const { resolveMemoryWriteDir, resolveMemoryWritePath } = require("../runtime/runtime-surface-paths");
const {
  appendDailyMemoryEntryBlock,
  buildDailyMemoryTemplate,
  normalizeDailyMemoryDocument,
  parseDailyMemorySections,
  renderDailyMemoryDocument,
} = require("./daily-memory-builder");
const { getHumanInteractionSectionTitle } = require("./user-context");

async function ensureDailyMemoryDocument(store, target = store.getActiveMemoryTarget()) {
  await fs.mkdir(resolveMemoryWriteDir({ workspaceRoot: store.workspace }), {
    recursive: true,
  });

  let currentContent;
  let created = false;
  const writePath =
    target.memoryPath ||
    resolveMemoryWritePath(target.today, { workspaceRoot: store.workspace });

  try {
    currentContent = await fs.readFile(target.memoryPath, "utf8");
  } catch {
    currentContent = buildDailyMemoryTemplate(target.today, {
      workspaceRoot: store.workspace,
    });
    created = true;
  }

  const normalizedContent = normalizeDailyMemoryDocument(
    currentContent,
    target.today,
    { workspaceRoot: store.workspace },
  );

  if (created || normalizedContent !== currentContent) {
    await fs.writeFile(writePath, normalizedContent);
  }

  return {
    created,
    content: normalizedContent,
  };
}

async function initToday(store, target = store.getActiveMemoryTarget()) {
  const ensured = await ensureDailyMemoryDocument(store, target);

  if (ensured.created) {
    console.log(
      `[DEUS Memory] Created new memory file: ${target.memoryPath}`,
    );
  }

  return ensured.created;
}

async function addEntry(store, section, entry) {
  const target = store.getActiveMemoryTarget();
  const ensured = await ensureDailyMemoryDocument(store, target);
  const timestamp = target.dateContext.localTimestamp;
  const sections = parseDailyMemorySections(ensured.content);
  const update = appendDailyMemoryEntryBlock(
    sections.get(section) || "",
    timestamp,
    entry,
  );

  if (!update.added) {
    return false;
  }

  sections.set(section, update.sectionBody);
  await fs.writeFile(
    target.memoryPath,
    renderDailyMemoryDocument(target.today, sections, {
      workspaceRoot: store.workspace,
    }),
  );
  console.log(
    `[DEUS Memory] Added entry to ${section}: ${entry.substring(0, 50)}...`,
  );
  return true;
}

function createLogMethods(store) {
  return {
    logGit(activity) {
      return addEntry(store, "Git Activity", activity);
    },
    logCommand(command) {
      return addEntry(store, "Commands Executed", command);
    },
    logDecision(decision, reasoning) {
      return addEntry(
        store,
        "Decisions",
        `${decision}\n  *Reasoning:* ${reasoning}`,
      );
    },
    logInteraction(description) {
      return addEntry(
        store,
        getHumanInteractionSectionTitle({ workspaceRoot: store.workspace }),
        description,
      );
    },
    logEvent(event) {
      return addEntry(store, "System Events", event);
    },
  };
}

module.exports = {
  addEntry,
  createLogMethods,
  ensureDailyMemoryDocument,
  initToday,
};
