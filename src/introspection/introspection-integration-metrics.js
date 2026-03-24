const openclawIntegration = require("../openclaw/openclaw-integration");
const { defaultLog } = require("./introspection-runtime-state");

function calculateSilentMemorySearchValidation(openclaw) {
  const testQueries = [
    { query: "Git commit", expectedSection: "Git Activity" },
    { query: "command executed", expectedSection: "Commands" },
    { query: "decision made", expectedSection: "Decisions" },
    { query: "system event", expectedSection: "Events" },
  ];

  return testQueries.map(({ query, expectedSection }) => {
    const searchResults =
      typeof openclaw.fallbackSearch === "function"
        ? openclaw.fallbackSearch(query, 3)
        : [];
    const hasExpectedSection = searchResults.some(
      (result) =>
        result.snippet.includes(`## ${expectedSection}`) ||
        result.snippet.includes(expectedSection),
    );

    return {
      query,
      expectedSection,
      found: searchResults.length > 0,
      hasExpectedSection,
    };
  });
}

function collectIntegrationMetrics(options = {}) {
  const {
    openclaw = openclawIntegration,
    dryRun = false,
    log = defaultLog,
  } = options;

  const searchValidation =
    dryRun && typeof openclaw.fallbackSearch === "function"
      ? calculateSilentMemorySearchValidation(openclaw)
      : openclaw.validateMemorySearchEffectiveness();
  const effectiveness =
    searchValidation.length > 0
      ? searchValidation.filter(
          (entry) => entry.found && entry.hasExpectedSection,
        ).length / searchValidation.length
      : 0;

  if (!dryRun) {
    openclaw.registerFlushCallback((data) => {
      log(`Flush callback executed: ${data.reason}`);
    });
  }

  log(
    `Memory format search effectiveness: ${(effectiveness * 100).toFixed(1)}%`,
  );

  return {
    searchValidation,
    effectiveness,
    memorySearchAvailable: Boolean(openclaw.memorySearchAvailable),
    flushCallbacksRegistered: Array.isArray(openclaw.flushCallbacks)
      ? openclaw.flushCallbacks.length
      : 0,
    dryRun,
  };
}

module.exports = {
  calculateSilentMemorySearchValidation,
  collectIntegrationMetrics,
};
