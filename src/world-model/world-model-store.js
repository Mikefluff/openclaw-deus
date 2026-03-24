const fs = require("fs");
const path = require("path");
const { WORKSPACE_ROOT } = require("../workspace/workspace-path");
const {
  resolveIntrospectionDir,
  resolveIntrospectionWriteDir,
} = require("../runtime/runtime-surface-paths");
const { normalizeWorldModel } = require("./world-model-schema");

const WORLD_MODEL_LATEST_FILE = "world-model.latest.json";

function resolveWorldModelDir(options = {}) {
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  return resolveIntrospectionDir({ workspaceRoot });
}

function getLatestWorldModelPath(options = {}) {
  return path.join(resolveWorldModelDir(options), WORLD_MODEL_LATEST_FILE);
}

function getDailyWorldModelPath(dayKey, options = {}) {
  return path.join(resolveWorldModelDir(options), `world-model-${dayKey}.json`);
}

function readLatestWorldModel(options = {}) {
  const latestPath = getLatestWorldModelPath(options);

  if (!fs.existsSync(latestPath)) {
    return null;
  }

  return normalizeWorldModel(JSON.parse(fs.readFileSync(latestPath, "utf8")));
}

function writeWorldModel(model, options = {}) {
  const normalized = normalizeWorldModel(model);
  const worldModelDir = resolveWorldModelDir(options);
  const latestPath = getLatestWorldModelPath(options);
  const dailyPath = getDailyWorldModelPath(normalized.workspace_day, options);
  const payload = `${JSON.stringify(normalized, null, 2)}\n`;

  fs.mkdirSync(resolveIntrospectionWriteDir(options), { recursive: true });
  fs.writeFileSync(latestPath, payload);

  if (options.keepDailySnapshot !== false) {
    fs.writeFileSync(dailyPath, payload);
  }

  return {
    model: normalized,
    latestPath,
    dailyPath: options.keepDailySnapshot === false ? null : dailyPath,
  };
}

module.exports = {
  WORLD_MODEL_LATEST_FILE,
  getDailyWorldModelPath,
  getLatestWorldModelPath,
  readLatestWorldModel,
  resolveWorldModelDir,
  writeWorldModel,
};
