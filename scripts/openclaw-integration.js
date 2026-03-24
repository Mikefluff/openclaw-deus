const integration = require("../src/openclaw/openclaw-integration");

async function main(options = {}) {
  const runtime = options.integration || integration;
  const log = options.log || console.log;

  log("\n=== OpenClaw Integration Check ===\n");
  log(`memory_search available: ${runtime.memorySearchAvailable}`);

  log("\n--- Memory Search Test ---");
  const searchResults = await runtime.searchMemory("Git commit", {
    useNative: false,
  });
  log(`Found ${searchResults.length} results`);
  searchResults.forEach((result) => {
    log(`  - ${result.file}: score ${result.score.toFixed(2)}`);
  });

  log("\n--- Memory Format Validation ---");
  const validation = runtime.validateMemorySearchEffectiveness();
  validation.forEach((result) => {
    const status = result.found && result.hasExpectedSection ? "✓" : "✗";
    log(`${status} "${result.query}" → ${result.expectedSection}`);
  });

  log("\n--- Flush Preview Test ---");
  await runtime.previewFlush("manual-test");
  log("Flush preview built");

  return {
    memorySearchAvailable: runtime.memorySearchAvailable,
    searchResultsCount: searchResults.length,
    validation,
  };
}

module.exports = integration;
module.exports.main = main;
module.exports.runOpenClawIntegrationCheck = main;

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
