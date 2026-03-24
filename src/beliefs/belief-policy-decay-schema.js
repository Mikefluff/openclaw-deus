"use strict";

const BELIEF_DECAY_POLICY = Object.freeze({
  rates: Object.freeze({
    axiom: 0.0,
    self: 0.0,
    external: 0.03,
    inference: 0.05,
  }),
  defaultRate: 0.05,
  minConfidence: 0.2,
  reviewThreshold: 0.7,
  refreshBoost: 0.05,
});

const BELIEF_DECAY_PROFILE_FIELD_NAMES = Object.freeze({
  beliefClass: "belief_class",
  decayMode: "decay_mode",
  confidenceFloor: "confidence_floor",
  reviewThreshold: "review_threshold",
  archivable: "archivable",
  refreshStrategy: "refresh_strategy",
});

const BELIEF_DECAY_MODES = Object.freeze([
  "no_decay",
  "slow",
  "normal",
  "fast",
]);

const BELIEF_DECAY_MODE_RATES = Object.freeze({
  no_decay: 0.0,
  slow: 0.01,
  normal: 0.03,
  fast: 0.05,
});

const BELIEF_LIFECYCLE_STATES = Object.freeze([
  "active",
  "review_needed",
  "deprecated",
  "archived",
]);

const BELIEF_CLASS_NAMES = Object.freeze([
  "axiom",
  "self_model",
  "user_model",
  "operational",
  "hypothesis",
]);

const BELIEF_CLASS_DEFAULTS = Object.freeze({
  axiom: Object.freeze({
    belief_class: "axiom",
    decay_mode: "no_decay",
    confidence_floor: 1.0,
    review_threshold: 1.0,
    archivable: false,
    refresh_strategy: "axiom_integrity",
  }),
  self_model: Object.freeze({
    belief_class: "self_model",
    decay_mode: "slow",
    confidence_floor: 0.85,
    review_threshold: 0.9,
    archivable: false,
    refresh_strategy: "self_reflection",
  }),
  user_model: Object.freeze({
    belief_class: "user_model",
    decay_mode: "slow",
    confidence_floor: 0.75,
    review_threshold: 0.8,
    archivable: false,
    refresh_strategy: "interaction_reinforcement",
  }),
  operational: Object.freeze({
    belief_class: "operational",
    decay_mode: "normal",
    confidence_floor: 0.5,
    review_threshold: 0.6,
    archivable: true,
    refresh_strategy: "operational_evidence",
  }),
  hypothesis: Object.freeze({
    belief_class: "hypothesis",
    decay_mode: "fast",
    confidence_floor: BELIEF_DECAY_POLICY.minConfidence,
    review_threshold: BELIEF_DECAY_POLICY.reviewThreshold,
    archivable: true,
    refresh_strategy: "evidence_refresh",
  }),
});

const BELIEF_SOURCE_CLASS_FALLBACKS = Object.freeze({
  axiom: "axiom",
  self: "self_model",
  external: "operational",
  inference: "hypothesis",
});

const BELIEF_ID_CLASS_FALLBACKS = Object.freeze({
  I: "axiom",
  S: "self_model",
  M: "user_model",
  R: "operational",
});

const DEFAULT_BELIEF_CLASS = "hypothesis";

module.exports = {
  BELIEF_CLASS_DEFAULTS,
  BELIEF_CLASS_NAMES,
  BELIEF_DECAY_MODE_RATES,
  BELIEF_DECAY_MODES,
  BELIEF_DECAY_POLICY,
  BELIEF_DECAY_PROFILE_FIELD_NAMES,
  BELIEF_ID_CLASS_FALLBACKS,
  BELIEF_LIFECYCLE_STATES,
  BELIEF_SOURCE_CLASS_FALLBACKS,
  DEFAULT_BELIEF_CLASS,
};
