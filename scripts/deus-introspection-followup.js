#!/usr/bin/env node

const {
  readLatestIntrospectionFollowupPacket,
  renderIntrospectionFollowupPrompt,
} = require("../src/introspection/deus-introspection-followup");

function parseArgs(argv = process.argv.slice(2)) {
  return {
    prompt: argv.includes("--prompt"),
  };
}

function main(options = {}) {
  const packet =
    options.packet ||
    readLatestIntrospectionFollowupPacket({
      workspaceRoot: options.workspaceRoot,
    });

  if (options.prompt) {
    const prompt = renderIntrospectionFollowupPrompt(packet);
    process.stdout.write(prompt);
    return prompt;
  }

  const serialized = `${JSON.stringify(packet, null, 2)}\n`;
  process.stdout.write(serialized);
  return serialized;
}

if (require.main === module) {
  const options = parseArgs();

  try {
    main(options);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  main,
  parseArgs,
};
