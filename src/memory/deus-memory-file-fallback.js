"use strict";

const fs = require("fs").promises;
const path = require("path");
const { resolveRuntimeSurfacePath } = require("../runtime/runtime-surface-paths");

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fallbackSearch(store, query, maxResults) {
  console.log(`[DEUS Memory] Using fallback search for: "${query}"`);

  const files = await fs.readdir(store.memoryDir).catch(() => []);
  const mdFiles = files.filter((file) => file.endsWith(".md"));

  const results = [];
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);

  if (terms.length === 0) {
    return [];
  }

  for (const file of mdFiles) {
    const content = await fs.readFile(
      path.join(store.memoryDir, file),
      "utf8",
    );
    const lowerContent = content.toLowerCase();

    let score = 0;
    for (const term of terms) {
      const safeTerm = escapeRegExp(term);
      const matches = (lowerContent.match(new RegExp(safeTerm, "g")) || [])
        .length;
      score += matches;
    }

    if (score > 0) {
      results.push({
        path: `memory/${file}`,
        score: score / terms.length,
        snippet: content.substring(0, 500),
        line: 1,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

async function fallbackGet(store, filePath, from, lines) {
  const fullPath = resolveRuntimeSurfacePath(filePath, {
    workspaceRoot: store.workspace,
  });
  const content = await fs.readFile(fullPath, "utf8");

  if (typeof lines === "number") {
    const start = typeof from === "number" ? from : 1;
    const allLines = content.split("\n");
    return allLines.slice(start - 1, start - 1 + lines).join("\n");
  }

  return content;
}

module.exports = {
  fallbackGet,
  fallbackSearch,
};
