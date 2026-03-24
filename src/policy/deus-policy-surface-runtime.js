const { buildWorldModel } = require("../world-model/world-model-builder");
const {
  readLatestWorldModel,
  writeWorldModel,
} = require("../world-model/world-model-store");
const { readStatusState } = require("../deus/deus-state-readers");
const { summarizeFocusState } = require("./focus-state-schema");
const { planBoundedSleep } = require("../deus/deus-sleep-planner");
const { evaluateAction } = require("./deus-action-policy");
const { recordWorldModelRefresh } = require("./deus-policy-feedback");
const { buildAmbientActionIntent } = require("./deus-policy-surface-intent");
const {
  summarizeActionPolicySurface,
  summarizeWorldModelSurface,
} = require("./deus-policy-surface-summary");

function getPolicyRuntimeSurface(options = {}) {
  let worldModel = options.worldModel || null;
  let source = "provided";

  if (!worldModel && options.useLatestWorldModel) {
    worldModel = readLatestWorldModel(options);
    if (worldModel) {
      source = "latest_snapshot";
    }
  }

  if (!worldModel) {
    worldModel = buildWorldModel(options);
    source = "live_build";
  }

  const statusState = options.statusState || readStatusState(options);
  const focusStateSummary = summarizeFocusState(statusState);
  const intent = options.intent || buildAmbientActionIntent(worldModel);
  const evaluation =
    options.evaluation ||
    evaluateAction(intent, {
      ...options,
      worldModel,
      mode: "advisory",
    });

  const surface = {
    worldModel: summarizeWorldModelSurface(worldModel, {
      source,
      now: options.now,
    }),
    focusState: focusStateSummary,
    sleepPlanner: planBoundedSleep({
      ...options,
      statusState,
      focusState: focusStateSummary,
    }),
    actionPolicy: summarizeActionPolicySurface(worldModel, {
      ...options,
      intent,
      evaluation,
    }),
  };

  if (options.includeRaw === true) {
    surface.worldModelData = worldModel;
  }

  return surface;
}

function refreshPolicyRuntimeSurface(options = {}) {
  const worldModel = buildWorldModel(options);
  const intent = options.intent || buildAmbientActionIntent(worldModel);
  const actionPolicyEvaluation = evaluateAction(intent, {
    ...options,
    worldModel,
    mode: "advisory",
  });
  const persisted = options.dryRun
    ? { latestPath: null, dailyPath: null, dryRun: true }
    : writeWorldModel(worldModel, options);
  const surface = getPolicyRuntimeSurface({
    ...options,
    worldModel,
    intent,
    evaluation: actionPolicyEvaluation,
    includeRaw: true,
  });

  if (!options.dryRun && options.recordFeedback !== false) {
    recordWorldModelRefresh(surface, {
      workspaceRoot: options.workspaceRoot,
      source: options.feedbackSource || "world-model-refresh",
      timestamp: options.timestamp,
      echo: options.echoFeedback,
    });
  }

  return {
    ...surface,
    actionPolicyEvaluation,
    latestPath: persisted.latestPath || null,
    dailyPath: persisted.dailyPath || null,
    dryRun: Boolean(options.dryRun),
  };
}

module.exports = {
  getPolicyRuntimeSurface,
  refreshPolicyRuntimeSurface,
};
