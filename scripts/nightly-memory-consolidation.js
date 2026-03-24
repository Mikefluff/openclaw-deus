#!/usr/bin/env node

const {
  runNightlyMemoryConsolidation,
} = require("../src/deus/deus-nightly-consolidation");

function main(options = {}) {
  const result = runNightlyMemoryConsolidation(options);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};
