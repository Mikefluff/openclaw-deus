const { getWorkspaceDateContext } = require("../workspace/workspace-date-context");
const { WORLD_MODEL_POLICY } = require("../policy/action-policy-config");

function clampConfidence(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, Number(numeric.toFixed(2))));
}

function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

function normalizeStringArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(values.map((value) => normalizeString(value)).filter(Boolean)),
  ];
}

function normalizeBeliefEntries(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map((entry) => ({
    id: normalizeString(entry.id),
    content: normalizeString(entry.content),
    confidence: clampConfidence(entry.confidence),
  }));
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizeWorldModel(model = {}) {
  const generatedAt = normalizeString(
    model.generated_at,
    new Date().toISOString(),
  );
  const dateContext = getWorkspaceDateContext(generatedAt);
  const selfModel = normalizeObject(model.self_model);
  const humanModel = normalizeObject(model.human_model);
  const workspaceModel = normalizeObject(model.workspace_model);
  const environmentModel = normalizeObject(model.environment_model);
  const actionPriors = normalizeObject(model.action_priors);
  const sources = normalizeObject(model.sources);

  return {
    version: Number.isFinite(Number(model.version)) ? Number(model.version) : 1,
    generated_at: generatedAt,
    workspace_day: normalizeString(model.workspace_day, dateContext.today),
    confidence: clampConfidence(model.confidence),
    self_model: {
      agency_level: normalizeString(selfModel.agency_level, "L2+"),
      invariants: normalizeBeliefEntries(selfModel.invariants),
      goals: normalizeBeliefEntries(selfModel.goals),
      review_pressure: normalizeObject(selfModel.review_pressure),
      active_limitations: normalizeStringArray(selfModel.active_limitations),
    },
    human_model: {
      preferences: normalizeStringArray(humanModel.preferences),
      constraints: normalizeStringArray(humanModel.constraints),
      active_requests: normalizeStringArray(humanModel.active_requests),
    },
    workspace_model: {
      active_project: normalizeString(workspaceModel.active_project) || null,
      mode: normalizeString(workspaceModel.mode) || null,
      status: normalizeString(workspaceModel.status) || null,
      repo_dirty: Boolean(workspaceModel.repo_dirty),
      repo_changes: Number(workspaceModel.repo_changes) || 0,
      memory_freshness_days:
        workspaceModel.memory_freshness_days === null ||
        workspaceModel.memory_freshness_days === undefined
          ? null
          : Number(workspaceModel.memory_freshness_days),
      introspection_date:
        normalizeString(workspaceModel.introspection_date) || null,
      recurring_patterns: normalizeStringArray(
        workspaceModel.recurring_patterns,
      ),
      next_step: normalizeString(workspaceModel.next_step) || null,
      waiting_for: normalizeString(workspaceModel.waiting_for) || null,
      follow_through_required:
        normalizeString(workspaceModel.follow_through_required) || null,
    },
    environment_model: {
      waiting_conditions: normalizeStringArray(
        environmentModel.waiting_conditions,
      ),
      dependencies: normalizeStringArray(environmentModel.dependencies),
      open_tensions: normalizeStringArray(environmentModel.open_tensions),
      external_systems: normalizeStringArray(environmentModel.external_systems),
    },
    action_priors: {
      hard_blocks: normalizeStringArray(actionPriors.hard_blocks),
      preferred_modes: normalizeStringArray(actionPriors.preferred_modes),
      active_risks: normalizeStringArray(actionPriors.active_risks),
    },
    sources,
  };
}

function getWorldModelAgeHours(model, now = new Date()) {
  const generatedAt = Date.parse(model?.generated_at || "");
  const reference = new Date(now);

  if (Number.isNaN(generatedAt) || Number.isNaN(reference.getTime())) {
    return null;
  }

  const ageMs = reference.getTime() - generatedAt;
  return Number((ageMs / 3_600_000).toFixed(2));
}

function isWorldModelFresh(
  model,
  now = new Date(),
  policy = WORLD_MODEL_POLICY,
) {
  const ageHours = getWorldModelAgeHours(model, now);
  return ageHours !== null && ageHours <= policy.staleAfterHours;
}

module.exports = {
  WORLD_MODEL_POLICY,
  clampConfidence,
  getWorldModelAgeHours,
  isWorldModelFresh,
  normalizeWorldModel,
};
