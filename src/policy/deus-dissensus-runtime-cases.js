"use strict";

const fs = require("fs");
const path = require("path");

const {
  createEmptyDissensusOpenCasesArtifact,
  normalizeDissensusCase,
  normalizeDissensusDecision,
} = require("./deus-dissensus-schema");
const {
  resolveDissensusOpenCasesPath,
  resolveDissensusOpenCasesWritePath,
} = require("../runtime/runtime-surface-paths");
const { readJsonFile } = require("./deus-dissensus-runtime-fileio");

function loadDissensusOpenCasesArtifact(options = {}) {
  const filePath = options.filePath || resolveDissensusOpenCasesPath(options);
  const fallback = createEmptyDissensusOpenCasesArtifact();
  const parsed = readJsonFile(filePath, fallback);

  return {
    version:
      typeof parsed.version === "number" && Number.isFinite(parsed.version)
        ? parsed.version
        : fallback.version,
    updated_at:
      typeof parsed.updated_at === "string" ? parsed.updated_at : null,
    updated_by:
      typeof parsed.updated_by === "string" ? parsed.updated_by : null,
    cases: Array.isArray(parsed.cases)
      ? parsed.cases.map((entry) => normalizeDissensusCase(entry))
      : [],
  };
}

function saveDissensusOpenCasesArtifact(artifact, options = {}) {
  const filePath =
    options.filePath || resolveDissensusOpenCasesWritePath(options);
  const normalized = {
    version:
      typeof artifact.version === "number" && Number.isFinite(artifact.version)
        ? artifact.version
        : 1,
    updated_at:
      typeof artifact.updated_at === "string" ? artifact.updated_at : null,
    updated_by:
      typeof artifact.updated_by === "string" ? artifact.updated_by : null,
    cases: Array.isArray(artifact.cases)
      ? artifact.cases.map((entry) => normalizeDissensusCase(entry))
      : [],
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(
    filePath,
    `${JSON.stringify(normalized, null, 2)}\n`,
    "utf8",
  );
  return normalized;
}

function upsertOpenCase(decisionInput, options = {}) {
  const decision = normalizeDissensusDecision(decisionInput);
  const artifact = loadDissensusOpenCasesArtifact(options);
  const now = decision.evaluated_at;
  const index = artifact.cases.findIndex(
    (entry) => entry.fingerprint === decision.fingerprint,
  );

  if (decision.requires_case) {
    const nextCase = normalizeDissensusCase({
      case_id:
        index >= 0 ? artifact.cases[index].case_id : decision.decision_id,
      fingerprint: decision.fingerprint,
      status: "open",
      opened_at: index >= 0 ? artifact.cases[index].opened_at : now,
      last_seen_at: now,
      linked_decision_id: decision.decision_id,
      action_type: decision.action_type,
      target: decision.target,
      target_class: decision.target_class,
      decision: decision.decision,
      level: decision.level,
      trigger_type: decision.trigger_type,
      invariant_refs: decision.invariant_refs,
      override_allowed: decision.override_allowed,
      override_token_kind: decision.override_token_kind,
      reason: decision.reason,
      operator_message: decision.operator_message,
    });

    if (index >= 0) {
      artifact.cases[index] = nextCase;
    } else {
      artifact.cases.push(nextCase);
    }
  } else if (index >= 0) {
    artifact.cases.splice(index, 1);
  }

  artifact.updated_at = now;
  artifact.updated_by = options.updatedBy || "DEUS";

  return saveDissensusOpenCasesArtifact(artifact, options);
}

module.exports = {
  loadDissensusOpenCasesArtifact,
  saveDissensusOpenCasesArtifact,
  upsertOpenCase,
};
