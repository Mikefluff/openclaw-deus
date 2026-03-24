"use strict";

const { normalizePolicyString } = require("./action-policy-helpers");

const IDENTITY_ROOT_PATTERNS = [
  /^AGENTS\.md$/u,
  /^DEUS\.md$/u,
  /^IDENTITY\.md$/u,
  /^SOUL\.md$/u,
  /^USER\.md$/u,
];

function classifyDissensusTarget(target) {
  const normalizedTarget = normalizePolicyString(target);

  if (!normalizedTarget) {
    return "general";
  }

  if (IDENTITY_ROOT_PATTERNS.some((pattern) => pattern.test(normalizedTarget))) {
    return "identity_root";
  }

  if (
    normalizedTarget === "beliefs/core.jsonl" ||
    normalizedTarget.startsWith("beliefs/")
  ) {
    return "durable_belief_state";
  }

  if (
    normalizedTarget === "STATUS.md" ||
    normalizedTarget.startsWith("memory/") ||
    normalizedTarget.startsWith("logs/") ||
    normalizedTarget.startsWith("review/") ||
    normalizedTarget.startsWith("docs/introspection/") ||
    normalizedTarget.startsWith("reports/")
  ) {
    return "runtime_state";
  }

  if (
    /(^|\/)(operator|telegram|email|discord|slack|third_party|third-party)\b/iu.test(
      normalizedTarget,
    )
  ) {
    return "third_party";
  }

  return "general";
}

module.exports = {
  IDENTITY_ROOT_PATTERNS,
  classifyDissensusTarget,
};
