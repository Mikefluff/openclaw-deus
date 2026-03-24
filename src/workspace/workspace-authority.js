"use strict";

const constants = require("./workspace-authority-constants");
const normalize = require("./workspace-authority-normalize");
const rules = require("./workspace-authority-rules");

function classifyWorkspacePath(filePath) {
  const normalizedPath = normalize.normalizeWorkspacePath(filePath);

  for (const rule of rules.RULE_DEFINITIONS) {
    if (rule.match(normalizedPath)) {
      return {
        path: normalizedPath,
        ruleId: rule.id,
        layer: rule.layer,
        authority: rule.authority,
        syncRule: rule.syncRule,
        description: rule.description,
        examples: [...rule.examples],
      };
    }
  }

  return {
    path: normalizedPath,
    ruleId: "unknown",
    layer: constants.LAYERS.UNKNOWN,
    authority: constants.AUTHORITIES.MANUAL_REVIEW,
    syncRule: constants.SYNC_RULES.INSPECT_FIRST,
    description:
      "Unclassified path. Inspect manually before deciding whether it belongs to the canonical trunk, live runtime, or ephemeral staging.",
    examples: [],
  };
}

module.exports = {
  ...constants,
  ...normalize,
  classifyWorkspacePath,
  getWorkspaceAuthorityManifest: rules.getWorkspaceAuthorityManifest,
};
