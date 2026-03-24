"use strict";

const {
  BELIEF_CLASS_DEFAULTS,
  resolveBeliefDecayProfile,
} = require("./belief-policy");
const {
  extractRuntimeDecayOverrides,
  loadDecayPolicyOverrideArtifact,
  mergeRuntimeDecayOverrides,
} = require("./belief-decay-override-artifact");

function resolveRuntimeBeliefDecayProfile(belief, options = {}) {
  const defaults = options.defaults || BELIEF_CLASS_DEFAULTS;
  const runtimeOverrides =
    options.runtimeOverrides ||
    extractRuntimeDecayOverrides(
      loadDecayPolicyOverrideArtifact({ filePath: options.filePath }),
    );
  const overrides = mergeRuntimeDecayOverrides(
    runtimeOverrides,
    options.extraOverrides || {},
  );

  return resolveBeliefDecayProfile(belief, {
    defaults,
    overrides,
  });
}

function getEffectiveRuntimeClassProfile(beliefClass, options = {}) {
  return resolveRuntimeBeliefDecayProfile(
    {
      belief_id: `class:${beliefClass}`,
      belief_class: beliefClass,
    },
    options,
  );
}

module.exports = {
  getEffectiveRuntimeClassProfile,
  resolveRuntimeBeliefDecayProfile,
};
