"use strict";

const DISSENSUS_VERSION = 1;
const DISSENSUS_LEVELS = Object.freeze(["none", "l1", "l2", "l3"]);
const DISSENSUS_DECISIONS = Object.freeze([
  "allow",
  "signal_l1",
  "pause_l2",
  "refuse_l3",
]);
const DISSENSUS_TRIGGER_TYPES = Object.freeze([
  "none",
  "high_impact_attention",
  "external_action",
  "destructive_action",
  "identity_critical_mutation",
  "durable_belief_mutation",
  "missing_human_confirmation",
  "invariant_conflict",
]);
const DISSENSUS_TARGET_CLASSES = Object.freeze([
  "general",
  "identity_root",
  "durable_belief_state",
  "runtime_state",
  "third_party",
]);
const DISSENSUS_OVERRIDE_TOKEN_KINDS = Object.freeze([
  "none",
  "human_confirmation",
  "explicit_l2_override",
]);
const DISSENSUS_CASE_STATUSES = Object.freeze([
  "open",
  "overridden",
  "resolved",
  "expired",
  "escalated",
]);

module.exports = {
  DISSENSUS_CASE_STATUSES,
  DISSENSUS_DECISIONS,
  DISSENSUS_LEVELS,
  DISSENSUS_OVERRIDE_TOKEN_KINDS,
  DISSENSUS_TARGET_CLASSES,
  DISSENSUS_TRIGGER_TYPES,
  DISSENSUS_VERSION,
};
