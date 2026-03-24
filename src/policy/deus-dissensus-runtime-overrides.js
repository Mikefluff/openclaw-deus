"use strict";

const fs = require("fs");
const path = require("path");

const { resolveDissensusOverridesWritePath } = require("../runtime/runtime-surface-paths");

function ensureDissensusOverrideLog(options = {}) {
  const filePath =
    options.filePath || resolveDissensusOverridesWritePath(options);
  if (!fs.existsSync(filePath)) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, "", "utf8");
  }
  return filePath;
}

function recordDissensusOverride(input = {}, options = {}) {
  const timestamp = input.timestamp || new Date().toISOString();
  const entry = {
    timestamp,
    case_id: input.case_id || input.caseId || null,
    decision_id: input.decision_id || input.decisionId || null,
    override_token_kind:
      input.override_token_kind ||
      input.overrideTokenKind ||
      "explicit_l2_override",
    actor: input.actor || "human",
    reason: input.reason || null,
  };
  const filePath = ensureDissensusOverrideLog(options);
  fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
  return {
    entry,
    filePath,
  };
}

module.exports = {
  ensureDissensusOverrideLog,
  recordDissensusOverride,
};
