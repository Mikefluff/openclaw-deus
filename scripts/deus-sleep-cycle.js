#!/usr/bin/env node

const { runDrySleepCycle, runSleepCycle } = require("../src/deus/deus-sleep-cycle");

function printHelp() {
  console.log(`Usage: node scripts/deus-sleep-cycle.js [--dry-run] [--help]

Run the bounded DEUS sleep cycle.
- default: mutating bounded reflection over logs, memory, review, and introspection
- --dry-run: preview-only mode without canonical mutations
`);
}

function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return null;
  }

  const dryRun = argv.includes("--dry-run");
  const result = dryRun ? runDrySleepCycle() : runSleepCycle();
  console.log(JSON.stringify(result, null, 2));
  return result;
}

module.exports = {
  main,
  printHelp,
};

if (require.main === module) {
  main();
}
