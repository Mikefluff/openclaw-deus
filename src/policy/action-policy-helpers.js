const { normalizeWorldModel } = require("../world-model/world-model-schema");

const BUILTIN_DEPENDENCIES = new Set([
  "openclaw",
  "repo",
  "workspace",
  "world-model",
]);

function clampScore(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.max(0, Math.min(1, Number(numeric.toFixed(2))));
}

function normalizePolicyString(value, fallback = "") {
  const normalized = String(value ?? fallback).trim();
  return normalized;
}

function normalizePolicyStringArray(values) {
  if (typeof values === "string") {
    const normalized = normalizePolicyString(values);
    return normalized ? [normalized] : [];
  }

  if (!Array.isArray(values)) {
    return [];
  }

  return [
    ...new Set(
      values.map((value) => normalizePolicyString(value)).filter(Boolean),
    ),
  ];
}

function normalizePolicyBoolean(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === null || value === undefined) {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "no", "n"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function normalizeWorldModelForPolicy(worldModel) {
  if (
    !worldModel ||
    typeof worldModel !== "object" ||
    Array.isArray(worldModel) ||
    Object.keys(worldModel).length === 0
  ) {
    return null;
  }

  return normalizeWorldModel(worldModel);
}

function getKnownWorldModelDependencies(worldModel) {
  const model = normalizeWorldModelForPolicy(worldModel);
  const known = new Set(BUILTIN_DEPENDENCIES);

  if (!model) {
    return known;
  }

  normalizePolicyStringArray(model.environment_model?.dependencies).forEach(
    (value) => known.add(value),
  );
  normalizePolicyStringArray(model.environment_model?.external_systems).forEach(
    (value) => known.add(value),
  );

  const activeProject = normalizePolicyString(
    model.workspace_model?.active_project,
  );
  if (activeProject) {
    known.add(activeProject);
  }

  return known;
}

function resolveDependencyStatus(intent, worldModel) {
  const dependencies = normalizePolicyStringArray(intent?.dependencies);
  if (dependencies.length === 0) {
    return {
      dependencies,
      ready: [],
      missing: [],
      score: 1,
      known: [...getKnownWorldModelDependencies(worldModel)],
    };
  }

  const known = getKnownWorldModelDependencies(worldModel);
  const ready = [];
  const missing = [];

  for (const dependency of dependencies) {
    if (known.has(dependency)) {
      ready.push(dependency);
    } else {
      missing.push(dependency);
    }
  }

  const score =
    dependencies.length === 0
      ? 1
      : clampScore(ready.length / dependencies.length);

  return {
    dependencies,
    ready,
    missing,
    score,
    known: [...known],
  };
}

function hasHardBlock(worldModel, marker) {
  const model = normalizeWorldModelForPolicy(worldModel);
  if (!model) {
    return false;
  }

  return normalizePolicyStringArray(model.action_priors?.hard_blocks).includes(
    marker,
  );
}

module.exports = {
  BUILTIN_DEPENDENCIES,
  clampScore,
  getKnownWorldModelDependencies,
  hasHardBlock,
  normalizePolicyBoolean,
  normalizePolicyString,
  normalizePolicyStringArray,
  normalizeWorldModelForPolicy,
  resolveDependencyStatus,
};
