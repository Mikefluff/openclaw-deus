#!/usr/bin/env node

const { runDeusNightly } = require("../src/deus/deus-nightly-orchestrator");

function main(options = {}) {
  const result = runDeusNightly(options);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

module.exports = {
  main,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
