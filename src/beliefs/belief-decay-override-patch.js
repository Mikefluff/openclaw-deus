"use strict";

const { BELIEF_CLASS_NAMES } = require("./belief-policy");
const {
  DECAY_POLICY_OVERRIDE_FILE,
  extractRuntimeDecayOverrides,
  loadDecayPolicyOverrideArtifact,
  sanitizeOverrideArtifact,
  sanitizeOverrideEntry,
  saveDecayPolicyOverrideArtifact,
} = require("./belief-decay-override-artifact");
const {
  getEffectiveRuntimeClassProfile,
} = require("./belief-decay-override-profile");

const DECAY_MODE_ORDER = Object.freeze(["fast", "normal", "slow", "no_decay"]);
const BOUNDED_DECAY_TUNING_POLICY = Object.freeze({
  forbiddenClasses: Object.freeze(["axiom"]),
  allowedFields: Object.freeze([
    "decay_mode",
    "confidence_floor",
    "review_threshold",
  ]),
  maxClassUpdatesPerPass: 1,
  maxModeSteps: 1,
  maxFloorDelta: 0.05,
  maxReviewThresholdDelta: 0.05,
});

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function getModeDistance(fromMode, toMode) {
  const fromIndex = DECAY_MODE_ORDER.indexOf(fromMode);
  const toIndex = DECAY_MODE_ORDER.indexOf(toMode);

  if (fromIndex < 0 || toIndex < 0) {
    return Number.POSITIVE_INFINITY;
  }

  return Math.abs(toIndex - fromIndex);
}

function validateBoundedDecayOverridePatch(patch, options = {}) {
  const policy = options.policy || BOUNDED_DECAY_TUNING_POLICY;
  const beliefClass = patch?.beliefClass;
  const updates = sanitizeOverrideEntry(patch?.updates);

  if (!beliefClass || !BELIEF_CLASS_NAMES.includes(beliefClass)) {
    throw new Error("bounded decay tuning requires a known beliefClass");
  }

  if (policy.forbiddenClasses.includes(beliefClass)) {
    throw new Error(`bounded decay tuning is forbidden for ${beliefClass}`);
  }

  const fields = Object.keys(updates);
  if (fields.length === 0) {
    throw new Error(
      "bounded decay tuning patch must include at least one update",
    );
  }

  if (fields.length > policy.maxClassUpdatesPerPass) {
    throw new Error(
      "bounded decay tuning patch exceeds the one-field guardrail",
    );
  }

  for (const field of fields) {
    if (!policy.allowedFields.includes(field)) {
      throw new Error(`bounded decay tuning does not allow ${field}`);
    }
  }

  const currentProfile = getEffectiveRuntimeClassProfile(beliefClass, options);

  if (updates.decay_mode) {
    if (
      getModeDistance(currentProfile.decay_mode, updates.decay_mode) >
      policy.maxModeSteps
    ) {
      throw new Error("bounded decay tuning may only move one decay mode step");
    }
  }

  if (isFiniteNumber(updates.confidence_floor)) {
    if (
      Math.abs(updates.confidence_floor - currentProfile.confidence_floor) >
      policy.maxFloorDelta
    ) {
      throw new Error(
        "bounded decay tuning exceeds the maximum confidence floor delta",
      );
    }

    if (updates.confidence_floor < 0 || updates.confidence_floor > 1) {
      throw new Error("confidence_floor must stay within [0, 1]");
    }
  }

  if (isFiniteNumber(updates.review_threshold)) {
    if (
      Math.abs(updates.review_threshold - currentProfile.review_threshold) >
      policy.maxReviewThresholdDelta
    ) {
      throw new Error(
        "bounded decay tuning exceeds the maximum review threshold delta",
      );
    }

    if (updates.review_threshold < 0 || updates.review_threshold > 1) {
      throw new Error("review_threshold must stay within [0, 1]");
    }
  }

  const nextFloor = updates.confidence_floor ?? currentProfile.confidence_floor;
  const nextReviewThreshold =
    updates.review_threshold ?? currentProfile.review_threshold;

  if (nextReviewThreshold < nextFloor) {
    throw new Error(
      "bounded decay tuning may not set review_threshold below confidence_floor",
    );
  }

  return {
    beliefClass,
    updates,
    currentProfile,
  };
}

function applyBoundedDecayOverridePatch(patch, options = {}) {
  const filePath = options.filePath || DECAY_POLICY_OVERRIDE_FILE;
  const dryRun = options.dryRun || false;
  const now = options.now || new Date();
  const actor = options.actor || "introspection_followup";
  const artifact = sanitizeOverrideArtifact(
    loadDecayPolicyOverrideArtifact({ filePath }),
  );
  const validation = validateBoundedDecayOverridePatch(patch, {
    ...options,
    filePath,
  });
  const currentClassOverride = artifact.classes[validation.beliefClass] || {};
  const nextArtifact = cloneJson(artifact);

  nextArtifact.classes[validation.beliefClass] = sanitizeOverrideEntry({
    ...currentClassOverride,
    ...validation.updates,
  });
  nextArtifact.updated_at = now.toISOString();
  nextArtifact.updated_by = actor;
  nextArtifact.history.push({
    timestamp: now.toISOString(),
    actor,
    beliefClass: validation.beliefClass,
    updates: validation.updates,
    reason: patch.reason || "bounded_decay_tuning",
    reportDate: patch.reportDate || null,
    previousProfile: {
      decay_mode: validation.currentProfile.decay_mode,
      confidence_floor: validation.currentProfile.confidence_floor,
      review_threshold: validation.currentProfile.review_threshold,
    },
  });

  const nextProfile = getEffectiveRuntimeClassProfile(validation.beliefClass, {
    ...options,
    runtimeOverrides: extractRuntimeDecayOverrides(nextArtifact),
  });

  if (!dryRun) {
    saveDecayPolicyOverrideArtifact(nextArtifact, { filePath });
  }

  return {
    filePath,
    dryRun,
    beliefClass: validation.beliefClass,
    updates: validation.updates,
    previousProfile: validation.currentProfile,
    nextProfile,
    artifact: dryRun ? nextArtifact : undefined,
  };
}

module.exports = {
  BOUNDED_DECAY_TUNING_POLICY,
  applyBoundedDecayOverridePatch,
  validateBoundedDecayOverridePatch,
};
