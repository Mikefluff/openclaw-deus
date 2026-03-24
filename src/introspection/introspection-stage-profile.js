const FULL_INTROSPECTION_STAGE_NAMES = Object.freeze([
  "belief_extraction",
  "contradiction_scan",
  "belief_decay",
  "decay_policy_audit",
  "openclaw_integration_checks",
  "world_model_refresh",
  "report_generation",
  "summary_output",
]);

const SLEEP_INTROSPECTION_STAGE_NAMES = Object.freeze([
  "openclaw_integration_checks",
  "world_model_refresh",
  "report_generation",
  "summary_output",
]);

const INTROSPECTION_STAGE_NAMES = FULL_INTROSPECTION_STAGE_NAMES;

function resolveIntrospectionStageNames(profile = "full") {
  return profile === "sleep"
    ? SLEEP_INTROSPECTION_STAGE_NAMES
    : FULL_INTROSPECTION_STAGE_NAMES;
}

module.exports = {
  FULL_INTROSPECTION_STAGE_NAMES,
  INTROSPECTION_STAGE_NAMES,
  SLEEP_INTROSPECTION_STAGE_NAMES,
  resolveIntrospectionStageNames,
};
