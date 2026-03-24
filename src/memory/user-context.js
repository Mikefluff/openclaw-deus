const fs = require("fs");
const path = require("path");
const { WORKSPACE_ROOT } = require("../workspace/workspace-path");

function normalizeField(value) {
  const normalized = String(value || "")
    .replace(/^_+|_+$/g, "")
    .trim();

  if (!normalized || normalized === "(optional)") {
    return null;
  }

  return normalized;
}

function parseTopLevelFields(raw = "") {
  const fields = {};

  for (const line of String(raw).split("\n")) {
    if (/^##\s+/.test(line)) {
      break;
    }

    const match = line.match(/^- \*\*(.+?):\*\*\s*(.*)$/);
    if (!match) {
      continue;
    }

    const key = match[1]
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
    fields[key] = normalizeField(match[2]);
  }

  return fields;
}

function readUserContext(options = {}) {
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  const userPath = path.join(workspaceRoot, "USER.md");
  const raw = fs.existsSync(userPath) ? fs.readFileSync(userPath, "utf8") : "";
  const fields = parseTopLevelFields(raw);
  const displayName =
    fields.what_to_call_they ||
    fields.what_to_call_them ||
    fields.name ||
    "Human";

  return {
    exists: raw.length > 0,
    path: userPath,
    raw,
    fields,
    displayName,
    interactionSectionTitle: `Interactions with ${displayName}`,
  };
}

function getHumanInteractionSectionTitle(options = {}) {
  return readUserContext(options).interactionSectionTitle;
}

module.exports = {
  getHumanInteractionSectionTitle,
  readUserContext,
};
