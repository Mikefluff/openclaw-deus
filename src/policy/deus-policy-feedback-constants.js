"use strict";

const POLICY_EVENT_TYPES = Object.freeze({
  WORLD_MODEL_REFRESH: "world_model_refresh",
  ACTION_EVALUATION: "action_evaluation",
  ACTION_OUTCOME: "action_outcome",
});

const POLICY_ACTIVITY_TYPE = POLICY_EVENT_TYPES.ACTION_EVALUATION;

module.exports = {
  POLICY_ACTIVITY_TYPE,
  POLICY_EVENT_TYPES,
};
