"use strict";

const fs = require("fs");
const path = require("path");

function hasRepoEntrypoint(rootPath) {
  try {
    return fs.existsSync(path.join(rootPath, "AGENTS.md"));
  } catch {
    return false;
  }
}

function hasGitMetadata(rootPath) {
  try {
    return (
      fs.existsSync(path.join(rootPath, ".git")) ||
      fs.existsSync(path.join(rootPath, ".git", "gitdir"))
    );
  } catch {
    return false;
  }
}

function detectCanonicalRoot() {
  const localRoot = path.resolve(__dirname, "..", "..");
  const candidates = [
    process.env.DEUS_CANONICAL_ROOT,
    process.env.OPENCLAW_WORKSPACE,
    process.env.WORKSPACE,
    localRoot,
  ]
    .filter(Boolean)
    .map((candidate) => path.resolve(candidate));

  for (const candidate of candidates) {
    if (hasRepoEntrypoint(candidate)) {
      return candidate;
    }
  }

  return localRoot;
}

module.exports = {
  detectCanonicalRoot,
  hasGitMetadata,
  hasRepoEntrypoint,
};
