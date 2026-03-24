"use strict";

const {
  BELIEF_CLASS_DEFAULTS,
  BELIEF_CLASS_NAMES,
  BELIEF_DECAY_MODE_RATES,
  BELIEF_DECAY_MODES,
  BELIEF_DECAY_POLICY,
  BELIEF_DECAY_PROFILE_FIELD_NAMES,
  BELIEF_ID_CLASS_FALLBACKS,
  BELIEF_SOURCE_CLASS_FALLBACKS,
  DEFAULT_BELIEF_CLASS,
} = require("./belief-policy-decay-schema");

function pickDefinedEntries(object) {
  return Object.fromEntries(
    Object.entries(object || {}).filter(([, value]) => value !== undefined),
  );
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function getBeliefClassDefaultProfile(
  beliefClass,
  defaults = BELIEF_CLASS_DEFAULTS,
) {
  const profile = defaults[beliefClass];
  return profile ? { ...profile } : null;
}

function inferBeliefClass(
  belief,
  {
    defaults = BELIEF_CLASS_DEFAULTS,
    sourceFallbacks = BELIEF_SOURCE_CLASS_FALLBACKS,
    idFallbacks = BELIEF_ID_CLASS_FALLBACKS,
  } = {},
) {
  const explicitClass = belief?.[BELIEF_DECAY_PROFILE_FIELD_NAMES.beliefClass];
  if (explicitClass && defaults[explicitClass]) {
    return explicitClass;
  }

  const beliefId = String(belief?.belief_id || "");
  const idPrefix = beliefId.charAt(0);
  if (idFallbacks[idPrefix]) {
    return idFallbacks[idPrefix];
  }

  return sourceFallbacks[belief?.source_type] || DEFAULT_BELIEF_CLASS;
}

function extractBeliefDecayProfileFields(belief) {
  const fields = BELIEF_DECAY_PROFILE_FIELD_NAMES;
  const explicitProfile = {
    belief_class: belief?.[fields.beliefClass],
    decay_mode: belief?.[fields.decayMode],
    confidence_floor: belief?.[fields.confidenceFloor],
    review_threshold: belief?.[fields.reviewThreshold],
    archivable: belief?.[fields.archivable],
    refresh_strategy: belief?.[fields.refreshStrategy],
  };

  if (!BELIEF_CLASS_NAMES.includes(explicitProfile.belief_class)) {
    delete explicitProfile.belief_class;
  }

  if (!BELIEF_DECAY_MODES.includes(explicitProfile.decay_mode)) {
    delete explicitProfile.decay_mode;
  }

  if (!isFiniteNumber(explicitProfile.confidence_floor)) {
    delete explicitProfile.confidence_floor;
  }

  if (!isFiniteNumber(explicitProfile.review_threshold)) {
    delete explicitProfile.review_threshold;
  }

  if (typeof explicitProfile.archivable !== "boolean") {
    delete explicitProfile.archivable;
  }

  if (typeof explicitProfile.refresh_strategy !== "string") {
    delete explicitProfile.refresh_strategy;
  }

  return explicitProfile;
}

function getBeliefDecayModeRate(
  decayMode,
  modeRates = BELIEF_DECAY_MODE_RATES,
  policy = BELIEF_DECAY_POLICY,
) {
  return modeRates[decayMode] ?? policy.defaultRate;
}

function resolveBeliefDecayProfile(
  belief,
  { defaults = BELIEF_CLASS_DEFAULTS, overrides = {} } = {},
) {
  const beliefId = belief?.belief_id;
  const explicitProfile = extractBeliefDecayProfileFields(belief);
  const overrideBelief = pickDefinedEntries(overrides.beliefs?.[beliefId]);
  const beliefClass =
    explicitProfile.belief_class ||
    overrideBelief.belief_class ||
    inferBeliefClass(belief, { defaults });
  const globalDefault =
    getBeliefClassDefaultProfile(DEFAULT_BELIEF_CLASS, defaults) || {};
  const classDefault =
    getBeliefClassDefaultProfile(beliefClass, defaults) || {};
  const overrideDefaults = pickDefinedEntries(overrides.defaults);
  const overrideClass = pickDefinedEntries(overrides.classes?.[beliefClass]);
  const resolvedProfile = {
    ...globalDefault,
    ...classDefault,
    ...overrideDefaults,
    ...overrideClass,
    ...overrideBelief,
    ...explicitProfile,
  };

  const decayMode = BELIEF_DECAY_MODES.includes(resolvedProfile.decay_mode)
    ? resolvedProfile.decay_mode
    : classDefault.decay_mode || globalDefault.decay_mode || "fast";
  const confidenceFloor = isFiniteNumber(resolvedProfile.confidence_floor)
    ? resolvedProfile.confidence_floor
    : BELIEF_DECAY_POLICY.minConfidence;
  const reviewThreshold = isFiniteNumber(resolvedProfile.review_threshold)
    ? resolvedProfile.review_threshold
    : BELIEF_DECAY_POLICY.reviewThreshold;
  const archivable =
    typeof resolvedProfile.archivable === "boolean"
      ? resolvedProfile.archivable
      : true;
  const refreshStrategy =
    typeof resolvedProfile.refresh_strategy === "string"
      ? resolvedProfile.refresh_strategy
      : "evidence_refresh";

  return {
    belief_id: beliefId || null,
    source_type: belief?.source_type || null,
    belief_class: beliefClass,
    decay_mode: decayMode,
    decay_rate: getBeliefDecayModeRate(decayMode),
    confidence_floor: confidenceFloor,
    review_threshold: reviewThreshold,
    archivable,
    refresh_strategy: refreshStrategy,
    resolved_from: {
      default_class: DEFAULT_BELIEF_CLASS,
      class_default: beliefClass,
      override_defaults: Object.keys(overrideDefaults),
      override_class: Object.keys(overrideClass),
      override_belief: Object.keys(overrideBelief),
      explicit_fields: Object.keys(explicitProfile),
    },
  };
}

function getBeliefDecayRate(sourceType, policy = BELIEF_DECAY_POLICY) {
  return policy.rates[sourceType] ?? policy.defaultRate;
}

function isBeliefDecayExempt(belief) {
  return (
    belief?.source_type === "axiom" || /^I\d+$/.test(belief?.belief_id || "")
  );
}

module.exports = {
  extractBeliefDecayProfileFields,
  getBeliefClassDefaultProfile,
  getBeliefDecayModeRate,
  getBeliefDecayRate,
  inferBeliefClass,
  isBeliefDecayExempt,
  resolveBeliefDecayProfile,
};
