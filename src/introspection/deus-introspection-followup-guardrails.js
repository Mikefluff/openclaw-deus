"use strict";

const FOLLOWUP_GUARDRAILS = Object.freeze({
  forbiddenPaths: Object.freeze(["DEUS.md", "USER.md", "beliefs/core.jsonl"]),
  allowedMutationSurfaces: Object.freeze([
    "STATUS.md",
    "beliefs/decay-policy.overrides.json",
    "review/",
    "docs/introspection/",
  ]),
  externalActionsRequireConfirmation: true,
  directBeliefMutationAllowed: false,
});

module.exports = {
  FOLLOWUP_GUARDRAILS,
};
