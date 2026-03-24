"use strict";

function createInitialIntrospectionContext(options = {}) {
  return {
    dryRun: options.dryRun ?? false,
    now: options.now || new Date(),
    profile: options.profile || "full",
  };
}

function runIntrospectionStages(stages, initialContext = {}) {
  let context = {
    ...initialContext,
    executedStages: [],
    stageOutputs: {},
    stageFailures: [],
  };

  for (const stage of stages) {
    let output = {};

    try {
      output = stage.run(context) || {};
    } catch (error) {
      output = {
        error: {
          stage: stage.name,
          message: error.message,
        },
      };
      context = {
        ...context,
        stageFailures: [
          ...context.stageFailures,
          {
            stage: stage.name,
            message: error.message,
          },
        ],
      };
    }

    context = {
      ...context,
      ...output,
      executedStages: [...context.executedStages, stage.name],
      stageOutputs: {
        ...context.stageOutputs,
        [stage.name]: output,
      },
    };
  }

  return context;
}

module.exports = {
  createInitialIntrospectionContext,
  runIntrospectionStages,
};
