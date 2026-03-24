const { normalizePolicyStringArray } = require("./action-policy-helpers");

function inferAmbientActionType(worldModel) {
  const signals = [
    worldModel.workspace_model?.status,
    worldModel.workspace_model?.next_step,
    worldModel.human_model?.active_requests?.[0],
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/(deploy|release|publish)/.test(signals)) {
    return "deploy";
  }

  if (/(message|reply|comment|post|email)/.test(signals)) {
    return "external_message";
  }

  if (/(delete|remove|drop|reset|destroy)/.test(signals)) {
    return "destructive";
  }

  if (
    /(commit|merge|branch|refactor|patch|edit|implement|update|build)/.test(
      signals,
    )
  ) {
    return "repo_mutation";
  }

  if (
    worldModel.workspace_model?.status === "waiting" ||
    /(wait|monitor|observe|inspect|review|check)/.test(signals)
  ) {
    return "analyze";
  }

  return "write_internal";
}

function buildAmbientActionIntent(worldModel) {
  const goal =
    worldModel.workspace_model?.next_step ||
    worldModel.human_model?.active_requests?.[0] ||
    "Evaluate current workspace trajectory";

  return {
    goal,
    actionType: inferAmbientActionType(worldModel),
    target: worldModel.workspace_model?.active_project || "workspace",
    dependencies: normalizePolicyStringArray(
      worldModel.environment_model?.dependencies,
    ),
    contextSources: ["STATUS.md", "world-model.latest.json"],
  };
}

module.exports = {
  buildAmbientActionIntent,
  inferAmbientActionType,
};
