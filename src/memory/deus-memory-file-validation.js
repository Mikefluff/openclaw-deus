"use strict";

const fs = require("fs").promises;
const {
  findMissingDailyMemorySections,
} = require("./daily-memory-schema");
const {
  normalizeDailyMemoryDocument,
} = require("./daily-memory-builder");
const {
  ensureDailyMemoryDocument,
} = require("./deus-memory-file-mutation");

async function validateFormat(store, options = {}) {
  const {
    createIfMissing = true,
    allowMissing = false,
    repairInvalid = createIfMissing,
  } = options;
  const target = store.getActiveMemoryTarget();

  let created = false;
  let content;

  try {
    content = await fs.readFile(target.memoryPath, "utf8");
  } catch {
    if (createIfMissing) {
      const ensured = await ensureDailyMemoryDocument(store, target);
      created = ensured.created;
      content = ensured.content;
    } else if (allowMissing) {
      return {
        valid: true,
        missing: [],
        exists: false,
        created: false,
      };
    } else {
      return {
        valid: false,
        missing: ["today memory file"],
        exists: false,
        created: false,
      };
    }
  }

  const missing = findMissingDailyMemorySections(content, {
    workspaceRoot: store.workspace,
  });

  if (missing.length > 0) {
    if (repairInvalid) {
      const ensured = await ensureDailyMemoryDocument(store, target);
      return {
        valid: true,
        missing: [],
        exists: true,
        created,
        repaired: ensured.content !== content,
      };
    }

    console.warn(`[DEUS Memory] Missing sections: ${missing.join(", ")}`);
    return {
      valid: false,
      missing,
      exists: true,
      created,
      repaired: false,
    };
  }

  if (repairInvalid) {
    const normalizedContent = normalizeDailyMemoryDocument(
      content,
      target.today,
      { workspaceRoot: store.workspace },
    );

    if (normalizedContent !== content) {
      await fs.writeFile(target.memoryPath, normalizedContent);
      return {
        valid: true,
        missing: [],
        exists: true,
        created,
        repaired: true,
      };
    }
  }

  return {
    valid: true,
    missing: [],
    exists: true,
    created,
    repaired: false,
  };
}

module.exports = {
  validateFormat,
};
