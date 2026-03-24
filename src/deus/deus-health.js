const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { OpenClawIntegration } = require("../openclaw/openclaw-integration");
const { INTROSPECTION_POLICY } = require("../beliefs/belief-policy");
const {
  readBeliefs,
  readLatestIntrospectionSummary,
} = require("./deus-state-readers");
const {
  getWorkspaceDateContext,
  shiftWorkspaceDayKey,
} = require("../workspace/workspace-date-context");
const { detectWorkspaceRoot } = require("../workspace/workspace-path");
const { getPolicyRuntimeSurface } = require("../policy/deus-policy-surface");
const {
  resolveIntrospectionDir,
  resolveMemoryDir,
  resolveMemoryPath,
} = require("../runtime/runtime-surface-paths");

function listFiles(dir, extension) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((file) => !extension || file.endsWith(extension))
    .sort();
}

function parseMemoryDayKey(fileName) {
  if (typeof fileName !== "string") {
    return null;
  }

  const match = fileName.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
  return match ? match[1] : null;
}

function getMemoryStalenessDays(latestDayKey, referenceDayKey) {
  if (!latestDayKey || !referenceDayKey) {
    return null;
  }

  const latestDate = new Date(`${latestDayKey}T00:00:00Z`);
  const referenceDate = new Date(`${referenceDayKey}T00:00:00Z`);

  if (
    Number.isNaN(latestDate.getTime()) ||
    Number.isNaN(referenceDate.getTime())
  ) {
    return null;
  }

  return Math.floor(
    (referenceDate.getTime() - latestDate.getTime()) / 86_400_000,
  );
}

function summarizeMemory(workspaceRoot) {
  const memoryDir = resolveMemoryDir({ workspaceRoot });
  const files = listFiles(memoryDir, ".md");
  const latestFile = files[files.length - 1] || null;
  const latestDayKey = parseMemoryDayKey(latestFile);
  const { today } = getWorkspaceDateContext();
  const yesterday = shiftWorkspaceDayKey(new Date(), -1);

  return {
    files: files.length,
    latestFile,
    latestDayKey,
    daysSinceLatest: getMemoryStalenessDays(latestDayKey, today),
    todayExists: fs.existsSync(resolveMemoryPath(today, { workspaceRoot })),
    yesterdayExists: fs.existsSync(
      resolveMemoryPath(yesterday, { workspaceRoot }),
    ),
  };
}

function summarizeBeliefs(workspaceRoot) {
  const beliefs = readBeliefs({ workspaceRoot });
  const archived = beliefs.filter((belief) => belief.status === "archived");
  const reviewNeeded = beliefs.filter(
    (belief) => belief.status === "review_needed",
  );
  const lowConfidence = beliefs.filter(
    (belief) => belief.confidence < INTROSPECTION_POLICY.lowConfidenceThreshold,
  );

  return {
    total: beliefs.length,
    archived: archived.length,
    reviewNeeded: reviewNeeded.length,
    lowConfidence: lowConfidence.length,
  };
}

function summarizeIntrospection(workspaceRoot) {
  const introspectionDir = resolveIntrospectionDir({ workspaceRoot });
  const latestSummary = readLatestIntrospectionSummary({
    workspaceRoot,
  }).summary;
  const reportFiles = listFiles(introspectionDir, ".md").filter((file) =>
    file.startsWith("introspection-"),
  );

  return {
    latestSummary,
    latestReport: reportFiles[reportFiles.length - 1] || null,
  };
}

function summarizeAdapter(workspaceRoot) {
  const integration = new OpenClawIntegration({
    workspaceRoot,
    logger() {},
  });

  return {
    memorySearchAvailable: integration.memorySearchAvailable,
    flushCallbacksRegistered: integration.flushCallbacks.length,
  };
}

function parseTrackedPorcelainEntries(output) {
  if (!output) {
    return [];
  }

  return output
    .split("\u0000")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function summarizeRepo(workspaceRoot, runCommand = execSync) {
  try {
    const output = runCommand(
      "git status --porcelain -z --untracked-files=no",
      {
        cwd: workspaceRoot,
      },
    ).toString();
    const entries = parseTrackedPorcelainEntries(output);

    return {
      dirty: entries.length > 0,
      changes: entries.length,
      untracked: 0,
    };
  } catch (error) {
    return {
      dirty: false,
      changes: 0,
      untracked: 0,
      error: error.message,
    };
  }
}

function getDeusHealthSummary(options = {}) {
  const workspaceRoot = options.workspaceRoot || detectWorkspaceRoot();

  return {
    workspaceRoot,
    date: getWorkspaceDateContext(),
    memory: summarizeMemory(workspaceRoot),
    beliefs: summarizeBeliefs(workspaceRoot),
    introspection: summarizeIntrospection(workspaceRoot),
    adapter: summarizeAdapter(workspaceRoot),
    policy: getPolicyRuntimeSurface({
      workspaceRoot,
      now: options.now,
    }),
    repo: summarizeRepo(workspaceRoot),
  };
}

function main(options = {}) {
  const summary = getDeusHealthSummary(options);
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

module.exports = {
  getDeusHealthSummary,
  main,
  parseTrackedPorcelainEntries,
  summarizeAdapter,
  summarizeBeliefs,
  summarizeIntrospection,
  summarizeMemory,
  summarizeRepo,
};
