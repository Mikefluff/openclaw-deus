"use strict";

const fs = require("fs");
const path = require("path");
const { WORKSPACE_ROOT } = require("../workspace/workspace-path");
const {
  INTROSPECTION_DIR,
  buildIntrospectionFollowupPacket,
} = require("./deus-introspection-followup-packet");
const {
  resolveIntrospectionDir,
  resolveIntrospectionFollowupLatestPath,
} = require("../runtime/runtime-surface-paths");

const REPORT_JSON_PATTERN = /^introspection-\d{4}-\d{2}-\d{2}\.json$/;

function persistIntrospectionFollowupPacket(packet, options = {}) {
  const {
    dryRun = false,
    introspectionDir = INTROSPECTION_DIR,
    followupPath = packet.artifactPaths?.followupPath,
    latestFollowupPath = packet.artifactPaths?.latestFollowupPath,
  } = options;

  if (dryRun) {
    return packet.artifactPaths || {};
  }

  fs.mkdirSync(introspectionDir, { recursive: true });

  if (!followupPath || !latestFollowupPath) {
    throw new Error("follow-up packet paths are missing");
  }

  const serialized = `${JSON.stringify(packet, null, 2)}\n`;
  fs.writeFileSync(followupPath, serialized, "utf8");
  fs.writeFileSync(latestFollowupPath, serialized, "utf8");

  return packet.artifactPaths;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolveLatestIntrospectionReportData(options = {}) {
  const introspectionDir = options.introspectionDir || INTROSPECTION_DIR;
  const files = fs.existsSync(introspectionDir)
    ? fs.readdirSync(introspectionDir)
    : [];
  const candidates = files.filter((fileName) =>
    REPORT_JSON_PATTERN.test(fileName),
  );

  if (candidates.length === 0) {
    throw new Error("No introspection report JSON files found");
  }

  candidates.sort();
  const fileName = candidates[candidates.length - 1];
  const reportDate = fileName.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  const dataPath = path.join(introspectionDir, fileName);

  return {
    reportData: readJsonFile(dataPath),
    artifactPaths: {
      reportPath: path.join(introspectionDir, `introspection-${reportDate}.md`),
      dataPath,
      analysisPath: path.join(
        introspectionDir,
        `introspection-${reportDate}.analyzed.md`,
      ),
      followupPath: path.join(
        introspectionDir,
        `introspection-${reportDate}.followup.json`,
      ),
      latestFollowupPath: path.join(
        introspectionDir,
        "introspection-followup.latest.json",
      ),
    },
  };
}

function readLatestIntrospectionFollowupPacket(options = {}) {
  const introspectionDir =
    options.introspectionDir ||
    resolveIntrospectionDir({
      workspaceRoot: options.workspaceRoot || WORKSPACE_ROOT,
    });
  const latestPath =
    options.latestPath ||
    (options.introspectionDir
      ? path.join(introspectionDir, "introspection-followup.latest.json")
      : resolveIntrospectionFollowupLatestPath({
          workspaceRoot: options.workspaceRoot || WORKSPACE_ROOT,
        }));

  if (fs.existsSync(latestPath)) {
    return readJsonFile(latestPath);
  }

  const fallback = resolveLatestIntrospectionReportData({ introspectionDir });
  return buildIntrospectionFollowupPacket({
    reportData: fallback.reportData,
    artifactPaths: fallback.artifactPaths,
    dryRun: true,
  });
}

module.exports = {
  persistIntrospectionFollowupPacket,
  readLatestIntrospectionFollowupPacket,
  resolveLatestIntrospectionReportData,
};
