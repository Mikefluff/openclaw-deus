#!/usr/bin/env node

const {
  readLatestIntrospectionFollowupPacket,
} = require("../src/introspection/deus-introspection-followup");
const {
  applyBoundedDecayTuningFromPacket,
} = require("../src/policy/deus-decay-tuning");

function parseArgs(argv = process.argv.slice(2)) {
  return {
    dryRun: argv.includes("--dry-run"),
  };
}

function main(options = {}) {
  const packet =
    options.packet ||
    readLatestIntrospectionFollowupPacket({
      workspaceRoot: options.workspaceRoot,
    });
  const result = applyBoundedDecayTuningFromPacket(packet, {
    dryRun: options.dryRun,
    filePath: options.filePath,
    actor: options.actor || "deus_decay_tuning_script",
  });
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  process.stdout.write(serialized);
  return result;
}

if (require.main === module) {
  try {
    main(parseArgs());
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  main,
  parseArgs,
};
