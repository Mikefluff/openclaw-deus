const {
  ACTION_TYPE_PROFILES,
} = require("./action-policy-config");
const {
  normalizePolicyBoolean,
  normalizePolicyString,
  normalizePolicyStringArray,
} = require("./action-policy-helpers");

const ACTION_TYPE_ALIASES = Object.freeze({
  analysis: "analyze",
  analyze: "analyze",
  belief: "belief_mutation",
  belief_mutation: "belief_mutation",
  commit: "git_commit",
  delete: "destructive",
  deploy: "deploy",
  destructive: "destructive",
  email: "external_message",
  external_message: "external_message",
  git: "git_commit",
  git_commit: "git_commit",
  internal_write: "write_internal",
  message: "external_message",
  post: "external_message",
  read: "read",
  release: "deploy",
  remove: "destructive",
  repo: "repo_mutation",
  repo_mutation: "repo_mutation",
  repository_mutation: "repo_mutation",
  reset: "destructive",
  send_message: "external_message",
  write: "write_internal",
  write_internal: "write_internal",
});

const URGENCY_VALUES = Object.freeze(["low", "medium", "high", "critical"]);

function normalizeActionType(value) {
  const normalized = normalizePolicyString(value).toLowerCase().replace(/\s+/g, "_");
  return ACTION_TYPE_ALIASES[normalized] || "unknown";
}

function resolveActionTypeProfile(actionType) {
  return ACTION_TYPE_PROFILES[actionType] || ACTION_TYPE_PROFILES.unknown;
}

function normalizeUrgency(value) {
  const normalized = normalizePolicyString(value, "medium").toLowerCase();
  return URGENCY_VALUES.includes(normalized) ? normalized : "medium";
}

function normalizeActionIntent(intent = {}) {
  const actionType = normalizeActionType(
    intent.action_type || intent.actionType || intent.type,
  );
  const profile = resolveActionTypeProfile(actionType);
  const goal = normalizePolicyString(intent.goal);
  const target = normalizePolicyString(intent.target) || null;
  const external = normalizePolicyBoolean(intent.external, profile.external);
  const destructive = normalizePolicyBoolean(
    intent.destructive,
    profile.destructive,
  );
  const confirmedByHuman = normalizePolicyBoolean(
    intent.confirmed_by_human ?? intent.confirmedByHuman ?? intent.humanConfirmed,
    false,
  );
  const repoMutation = normalizePolicyBoolean(
    intent.repo_mutation ?? intent.repoMutation,
    profile.repo_mutation,
  );
  const beliefMutation = normalizePolicyBoolean(
    intent.belief_mutation ?? intent.beliefMutation,
    profile.belief_mutation,
  );
  const requiresHumanConfirmation = normalizePolicyBoolean(
    intent.requires_human_confirmation ??
      intent.requiresHumanConfirmation,
    profile.human_confirmation_required ||
      external ||
      destructive ||
      beliefMutation,
  );

  return {
    version: 1,
    goal,
    action_type: actionType,
    target,
    external,
    destructive,
    confirmed_by_human: confirmedByHuman,
    dependencies: normalizePolicyStringArray(intent.dependencies || intent.deps),
    urgency: normalizeUrgency(intent.urgency || intent.priority),
    context_sources: normalizePolicyStringArray(
      intent.context_sources || intent.contextSources || intent.sources,
    ),
    repo_mutation: repoMutation,
    belief_mutation: beliefMutation,
    requires_human_confirmation: requiresHumanConfirmation,
    high_impact:
      profile.high_impact || external || destructive || repoMutation || beliefMutation,
    scope: external ? "external" : "internal",
    profile: {
      action_type: profile.action_type,
      impact: profile.impact,
      reversibility: profile.reversibility,
      maintenance_tail: profile.maintenance_tail,
      high_impact: profile.high_impact,
    },
  };
}

module.exports = {
  ACTION_TYPE_ALIASES,
  URGENCY_VALUES,
  normalizeActionIntent,
  normalizeActionType,
  normalizeUrgency,
  resolveActionTypeProfile,
};
