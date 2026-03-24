"use strict";

const fs = require("fs");

const DAY_FILE_PATTERNS = Object.freeze({
  memory: /^\d{4}-\d{2}-\d{2}\.md$/,
  logs: /^\d{4}-\d{2}-\d{2}\.jsonl$/,
});

function readTextFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, "utf8");
}

function listMatchingFiles(dirPath, pattern) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }

  return fs
    .readdirSync(dirPath)
    .filter((fileName) => pattern.test(fileName))
    .sort();
}

function parseJsonl(text) {
  if (typeof text !== "string" || text.trim() === "") {
    return [];
  }

  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

module.exports = {
  DAY_FILE_PATTERNS,
  listMatchingFiles,
  parseJsonl,
  readTextFile,
};
