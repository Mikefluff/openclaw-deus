"use strict";

const { parseStatusFocusState } = require("../policy/focus-state-schema");
const { resolveStatusPath } = require("../runtime/runtime-surface-paths");
const { readTextFile } = require("./deus-state-reader-files");
const { resolveWorkspaceRoot } = require("./deus-state-reader-paths");

function normalizeSectionKey(title) {
  return String(title)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseMarkdownSections(content) {
  const sections = {};
  let currentSection = null;

  for (const line of String(content || "").split("\n")) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      const title = headingMatch[1].trim();
      const key = normalizeSectionKey(title);
      currentSection = {
        key,
        title,
        lines: [],
      };
      sections[key] = currentSection;
      continue;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    }
  }

  return sections;
}

function parseBulletFields(lines) {
  const fields = {};

  for (const line of lines) {
    const fieldMatch = line.match(/^- ([a-z0-9_]+):\s*(.*)$/i);
    if (fieldMatch) {
      fields[fieldMatch[1]] = fieldMatch[2];
    }
  }

  return fields;
}

function readStatusState(options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(options);
  const statusPath = resolveStatusPath({ workspaceRoot });
  const raw = readTextFile(statusPath);

  if (raw === null) {
    return {
      exists: false,
      path: statusPath,
      raw: "",
      sections: {},
      flat: {},
      focusState: parseStatusFocusState({
        exists: false,
        flat: {},
        now: options.now,
      }),
    };
  }

  const sectionMap = parseMarkdownSections(raw);
  const sections = {};
  const flat = {};

  for (const [sectionKey, section] of Object.entries(sectionMap)) {
    const fields = parseBulletFields(section.lines);
    sections[sectionKey] = {
      title: section.title,
      fields,
    };
    Object.assign(flat, fields);
  }

  return {
    exists: true,
    path: statusPath,
    raw,
    sections,
    flat,
    focusState: parseStatusFocusState({
      exists: true,
      raw,
      sections,
      flat,
      now: options.now,
    }),
  };
}

module.exports = {
  normalizeSectionKey,
  parseBulletFields,
  parseMarkdownSections,
  readStatusState,
};
