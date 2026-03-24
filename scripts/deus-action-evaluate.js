#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { evaluateAction } = require("../src/policy/deus-action-policy");

function printHelp() {
  console.log(`Usage: node scripts/deus-action-evaluate.js [options] <intent-json>

Options:
  --file <path>            Read the proposed action intent from a JSON file.
  --stdin                  Read the proposed action intent from stdin.
  --latest-world-model     Use docs/introspection/world-model.latest.json when available.
  --help                   Show this message.

Examples:
  node scripts/deus-action-evaluate.js '{"goal":"Inspect health","actionType":"analyze","target":"deus:health"}'
  node scripts/deus-action-evaluate.js --file ./intent.json --latest-world-model
  echo '{"goal":"Inspect health","actionType":"analyze"}' | node scripts/deus-action-evaluate.js --stdin
`);
}

function parseArgs(argv) {
  const parsed = {
    filePath: null,
    readFromStdin: false,
    useLatestWorldModel: false,
    intentJson: null,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      parsed.help = true;
      continue;
    }

    if (argument === "--stdin") {
      parsed.readFromStdin = true;
      continue;
    }

    if (argument === "--latest-world-model") {
      parsed.useLatestWorldModel = true;
      continue;
    }

    if (argument === "--file") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("--file requires a path");
      }
      parsed.filePath = argv[index];
      continue;
    }

    if (argument.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`);
    }

    if (parsed.intentJson !== null) {
      throw new Error("Provide only one positional intent JSON argument");
    }

    parsed.intentJson = argument;
  }

  return parsed;
}

function parseIntentJson(text, sourceLabel) {
  try {
    const parsed = JSON.parse(String(text || ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("intent must be a JSON object");
    }
    return parsed;
  } catch (error) {
    throw new Error(`Failed to parse intent from ${sourceLabel}: ${error.message}`);
  }
}

function loadIntentFromArgs(parsedArgs, options = {}) {
  const readFile = options.readFile || fs.readFileSync;

  if (parsedArgs.filePath) {
    const absolutePath = path.resolve(parsedArgs.filePath);
    return parseIntentJson(readFile(absolutePath, "utf8"), absolutePath);
  }

  if (parsedArgs.readFromStdin) {
    return parseIntentJson(readFile(0, "utf8"), "stdin");
  }

  if (parsedArgs.intentJson) {
    return parseIntentJson(parsedArgs.intentJson, "argv");
  }

  throw new Error("No action intent provided");
}

async function main(options = {}) {
  const parsedArgs = parseArgs(options.argv || process.argv.slice(2));

  if (parsedArgs.help) {
    printHelp();
    return null;
  }

  const intent = loadIntentFromArgs(parsedArgs, options);
  const evaluation = await evaluateAction(intent, {
    workspaceRoot: options.workspaceRoot,
    useLatestWorldModel: parsedArgs.useLatestWorldModel,
    mode: "advisory",
  });

  const output = JSON.stringify(evaluation, null, 2);
  if (options.silent !== true) {
    console.log(output);
  }

  return evaluation;
}

module.exports = {
  loadIntentFromArgs,
  main,
  parseArgs,
  parseIntentJson,
  printHelp,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
