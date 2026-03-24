"use strict";

const fs = require("fs");
const path = require("path");
const {
  resolveBeliefsPath,
  resolveBeliefsWritePath,
  resolveExtractionMarkerPath,
  resolveExtractionMarkerWritePath,
  resolveMemoryDir,
  resolvePendingBeliefsPath,
  resolvePendingBeliefsWritePath,
} = require("../runtime/runtime-surface-paths");
const { BELIEF_EXTRACTION_POLICY } = require("./belief-policy");
const { appendDeusOpsLog } = require("../deus/deus-ops-log");
const {
  buildPendingBeliefReviewMarker,
  parsePendingBeliefReviewQueue,
  renderPendingBeliefReviewQueue,
  upsertPendingBeliefReviewEntry,
} = require("./review-queue-schema");

function resolveBeliefExtractorPaths(options = {}) {
  return {
    beliefsFile: resolveBeliefsPath(options),
    beliefsWritePath: resolveBeliefsWritePath(options),
    memoryDir: resolveMemoryDir(options),
    extractionMarkerPath: resolveExtractionMarkerPath(options),
    extractionMarkerWritePath: resolveExtractionMarkerWritePath(options),
    reviewPath: resolvePendingBeliefsPath(options),
    reviewWritePath: resolvePendingBeliefsWritePath(options),
  };
}

function log(msg, options = {}) {
  appendDeusOpsLog({
    component: "belief-extractor",
    message: msg,
    workspaceRoot: options.workspaceRoot,
  });
}

function ensureReviewFile(options = {}) {
  const { reviewWritePath } = resolveBeliefExtractorPaths(options);
  const dir = path.dirname(reviewWritePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(reviewWritePath)) {
    fs.writeFileSync(reviewWritePath, `${renderPendingBeliefReviewQueue([])}\n`);
  }
}

function buildReviewCandidateEntry(candidate) {
  const evidenceKind =
    candidate.evidenceKind || `${candidate.type} pattern match`;
  const interactionBandNote = candidate.interactionBand
    ? ` [${candidate.interactionBand}]`
    : "";
  const provenance = candidate.provenance || "other";

  return {
    timestamp: new Date().toISOString(),
    marker: buildPendingBeliefReviewMarker(
      candidate.source,
      candidate.category,
      candidate.content,
    ),
    candidate: candidate.content,
    category: candidate.category,
    evidence: `extracted from ${evidenceKind}`,
    evidence_sources: [`memory/${candidate.source}.md`],
    recurrence: 1,
    confidence_proposal: candidate.confidence,
    promotion_decision: BELIEF_EXTRACTION_POLICY.reviewAction,
    human_review_needed: "no",
    provenance,
    notes: `${candidate.evidenceStrength} signal via "${candidate.explicitMatch}"${interactionBandNote} [${provenance}]`,
  };
}

function appendReviewCandidate(candidate, options = {}) {
  ensureReviewFile(options);
  const { reviewWritePath } = resolveBeliefExtractorPaths(options);
  const existingEntries = parsePendingBeliefReviewQueue(
    fs.readFileSync(reviewWritePath, "utf8"),
  );
  const reviewEntry = buildReviewCandidateEntry(candidate);
  const { changed, entries } = upsertPendingBeliefReviewEntry(
    existingEntries,
    reviewEntry,
  );

  if (!changed) {
    return false;
  }

  fs.writeFileSync(
    reviewWritePath,
    `${renderPendingBeliefReviewQueue(entries)}\n`,
  );
  return true;
}

function loadBeliefs(options = {}) {
  const { beliefsFile } = resolveBeliefExtractorPaths(options);
  try {
    const data = fs.readFileSync(beliefsFile, "utf8");
    return data
      .trim()
      .split("\n")
      .filter((line) => line)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function saveBeliefs(beliefs, options = {}) {
  const { beliefsWritePath } = resolveBeliefExtractorPaths(options);
  const data = beliefs.map((belief) => JSON.stringify(belief)).join("\n") + "\n";
  fs.writeFileSync(beliefsWritePath, data);
}

function getLastExtractionTime(options = {}) {
  const { extractionMarkerPath } = resolveBeliefExtractorPaths(options);
  try {
    const data = fs.readFileSync(extractionMarkerPath, "utf8");
    return new Date(data.trim());
  } catch {
    return new Date(0);
  }
}

function setLastExtractionTime(options = {}) {
  const { extractionMarkerWritePath } = resolveBeliefExtractorPaths(options);
  fs.mkdirSync(path.dirname(extractionMarkerWritePath), { recursive: true });
  fs.writeFileSync(extractionMarkerWritePath, new Date().toISOString());
}

function findNewMemoryFiles(since, options = {}) {
  const { memoryDir } = resolveBeliefExtractorPaths(options);
  const files = [];
  try {
    const entries = fs.readdirSync(memoryDir);
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const filepath = path.join(memoryDir, entry);
      const stat = fs.statSync(filepath);
      if (stat.mtime > since) {
        files.push(filepath);
      }
    }
  } catch (error) {
    log(`Error reading memory dir: ${error.message}`, options);
  }
  return files.sort((left, right) => fs.statSync(left).mtime - fs.statSync(right).mtime);
}

module.exports = {
  appendReviewCandidate,
  findNewMemoryFiles,
  getLastExtractionTime,
  loadBeliefs,
  log,
  resolveBeliefExtractorPaths,
  saveBeliefs,
  setLastExtractionTime,
};
