"use strict";

const { normalizeWorldModelForPolicy } = require("./action-policy-helpers");
const { buildWorldModel } = require("../world-model/world-model-builder");
const { readLatestWorldModel } = require("../world-model/world-model-store");

function compactWorldModelRef(worldModel, source) {
  return {
    generatedAt: worldModel.generated_at,
    workspaceDay: worldModel.workspace_day,
    confidence: worldModel.confidence,
    source,
  };
}

function getOrBuildWorldModel(options = {}) {
  if (options.worldModel) {
    return {
      worldModel: normalizeWorldModelForPolicy(options.worldModel),
      source: "provided",
    };
  }

  if (options.useLatestWorldModel) {
    const latestWorldModel = readLatestWorldModel(options);
    if (latestWorldModel) {
      return {
        worldModel: latestWorldModel,
        source: "latest_snapshot",
      };
    }
  }

  return {
    worldModel: buildWorldModel(options),
    source: "live_build",
  };
}

module.exports = {
  compactWorldModelRef,
  getOrBuildWorldModel,
};
