const paths = require("./deus-nightly-consolidation-paths");
const review = require("./deus-nightly-consolidation-review");
const memory = require("./deus-nightly-consolidation-memory");
const runner = require("./deus-nightly-consolidation-runner");

module.exports = {
  appendMemoryReflection: memory.appendMemoryReflection,
  appendPendingBeliefEntry: review.appendPendingBeliefEntry,
  ensurePendingBeliefQueueFile: review.ensurePendingBeliefQueueFile,
  readRecentMemory: paths.readRecentMemory,
  recordPolicyPatterns: review.recordPolicyPatterns,
  resolveNightlyPaths: paths.resolveNightlyPaths,
  runNightlyMemoryConsolidation: runner.runNightlyMemoryConsolidation,
};
