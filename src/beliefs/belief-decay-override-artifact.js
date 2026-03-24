"use strict";

const fs = require("fs");
const {
  BELIEF_CLASS_NAMES,
  BELIEF_DECAY_MODES,
  BELIEF_DECAY_PROFILE_FIELD_NAMES,
} = require("./belief-policy");
const {
  resolveBeliefDecayOverridesWritePath,
} = require("../runtime/runtime-surface-paths");

const DECAY_POLICY_OVERRIDE_FILE = resolveBeliefDecayOverridesWritePath();
const DECAY_POLICY_OVERRIDE_VERSION = 1;

function createEmptyOverrideArtifact() {
  return {
    version: DECAY_POLICY_OVERRIDE_VERSION,
    updated_at: null,
    updated_by: null,
    defaults: {},
    classes: {},
    beliefs: {},
    history: [],
  };
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeOverrideEntry(entry = {}) {
  const fields = BELIEF_DECAY_PROFILE_FIELD_NAMES;
  const next = {};

  if (
    typeof entry[fields.decayMode] === "string" &&
    BELIEF_DECAY_MODES.includes(entry[fields.decayMode])
  ) {
    next[fields.decayMode] = entry[fields.decayMode];
  }

  if (isFiniteNumber(entry[fields.confidenceFloor])) {
    next[fields.confidenceFloor] = entry[fields.confidenceFloor];
  }

  if (isFiniteNumber(entry[fields.reviewThreshold])) {
    next[fields.reviewThreshold] = entry[fields.reviewThreshold];
  }

  return next;
}

function sanitizeOverrideArtifact(artifact = {}) {
  const empty = createEmptyOverrideArtifact();
  const next = {
    version:
      typeof artifact.version === "number" ? artifact.version : empty.version,
    updated_at:
      typeof artifact.updated_at === "string" ? artifact.updated_at : null,
    updated_by:
      typeof artifact.updated_by === "string" ? artifact.updated_by : null,
    defaults: sanitizeOverrideEntry(artifact.defaults),
    classes: {},
    beliefs: {},
    history: Array.isArray(artifact.history) ? artifact.history : [],
  };

  for (const beliefClass of BELIEF_CLASS_NAMES) {
    const classEntry = sanitizeOverrideEntry(artifact.classes?.[beliefClass]);
    if (Object.keys(classEntry).length > 0) {
      next.classes[beliefClass] = classEntry;
    }
  }

  for (const [beliefId, beliefEntry] of Object.entries(
    artifact.beliefs || {},
  )) {
    const entry = sanitizeOverrideEntry(beliefEntry);
    if (Object.keys(entry).length > 0) {
      next.beliefs[beliefId] = entry;
    }
  }

  return next;
}

function ensureDecayPolicyOverrideArtifact(options = {}) {
  const filePath = options.filePath || DECAY_POLICY_OVERRIDE_FILE;
  if (fs.existsSync(filePath)) {
    return loadDecayPolicyOverrideArtifact({ filePath });
  }

  const artifact = createEmptyOverrideArtifact();
  fs.writeFileSync(filePath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  return artifact;
}

function loadDecayPolicyOverrideArtifact(options = {}) {
  const filePath = options.filePath || DECAY_POLICY_OVERRIDE_FILE;
  if (!fs.existsSync(filePath)) {
    return createEmptyOverrideArtifact();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return sanitizeOverrideArtifact(parsed);
  } catch {
    return createEmptyOverrideArtifact();
  }
}

function saveDecayPolicyOverrideArtifact(artifact, options = {}) {
  const filePath = options.filePath || DECAY_POLICY_OVERRIDE_FILE;
  const sanitized = sanitizeOverrideArtifact(artifact);
  fs.writeFileSync(filePath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
  return sanitized;
}

function extractRuntimeDecayOverrides(artifact) {
  const sanitized = sanitizeOverrideArtifact(artifact);
  return {
    defaults: sanitized.defaults,
    classes: sanitized.classes,
    beliefs: sanitized.beliefs,
  };
}

function mergeRuntimeDecayOverrides(base = {}, extra = {}) {
  return {
    defaults: {
      ...(base.defaults || {}),
      ...(extra.defaults || {}),
    },
    classes: {
      ...(base.classes || {}),
      ...(extra.classes || {}),
    },
    beliefs: {
      ...(base.beliefs || {}),
      ...(extra.beliefs || {}),
    },
  };
}

module.exports = {
  DECAY_POLICY_OVERRIDE_FILE,
  DECAY_POLICY_OVERRIDE_VERSION,
  createEmptyOverrideArtifact,
  ensureDecayPolicyOverrideArtifact,
  extractRuntimeDecayOverrides,
  loadDecayPolicyOverrideArtifact,
  mergeRuntimeDecayOverrides,
  sanitizeOverrideArtifact,
  sanitizeOverrideEntry,
  saveDecayPolicyOverrideArtifact,
};
