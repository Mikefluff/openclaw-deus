const { refreshPolicyRuntimeSurface } = require("../src/policy/deus-policy-surface");

function main(options = {}) {
  if (options.dryRun) {
    const result = refreshPolicyRuntimeSurface({
      ...options,
      dryRun: true,
      recordFeedback: false,
    });
    console.log(JSON.stringify(result.worldModelData, null, 2));
    return {
      worldModel: result.worldModelData,
      latestPath: null,
      dailyPath: null,
      dryRun: true,
    };
  }

  const result = refreshPolicyRuntimeSurface({
    ...options,
    feedbackSource: "world-model-refresh",
  });
  console.log(
    JSON.stringify(
      {
        latestPath: result.latestPath,
        dailyPath: result.dailyPath,
        confidence: result.worldModel.confidence,
        workspaceDay: result.worldModel.workspaceDay,
        decision: result.actionPolicy.decision,
      },
      null,
      2,
    ),
  );

  return result;
}

module.exports = {
  main,
};

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  main({ dryRun });
}
