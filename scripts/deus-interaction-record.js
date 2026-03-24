#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { recordInteractionEvent } = require("../src/deus/deus-interaction-log");

function printHelp() {
  console.log(`Usage: node scripts/deus-interaction-record.js [options] <interaction-json>

Options:
  --file <path>            Read the interaction event from a JSON file.
  --stdin                  Read the interaction event from stdin.
  --help                   Show this message.

Examples:
  node scripts/deus-interaction-record.js '{"kind":"preference","content":"Я не люблю огурцы","tags":["food","identity"]}'
  echo '{"kind":"question","content":"Что ты думаешь про огурцы?"}' | node scripts/deus-interaction-record.js --stdin
`);
}

function parseArgs(argv) {
  const parsed = {
    filePath: null,
    readFromStdin: false,
    interactionJson: null,
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

    if (parsed.interactionJson !== null) {
      throw new Error("Provide only one positional interaction JSON argument");
    }

    parsed.interactionJson = argument;
  }

  return parsed;
}

function parseInteractionJson(text, sourceLabel) {
  try {
    const parsed = JSON.parse(String(text || ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("interaction event must be a JSON object");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Failed to parse interaction event from ${sourceLabel}: ${error.message}`,
    );
  }
}

function loadInteractionFromArgs(parsedArgs, options = {}) {
  const readFile = options.readFile || fs.readFileSync;

  if (parsedArgs.filePath) {
    const absolutePath = path.resolve(parsedArgs.filePath);
    return parseInteractionJson(readFile(absolutePath, "utf8"), absolutePath);
  }

  if (parsedArgs.readFromStdin) {
    return parseInteractionJson(readFile(0, "utf8"), "stdin");
  }

  if (parsedArgs.interactionJson) {
    return parseInteractionJson(parsedArgs.interactionJson, "argv");
  }

  throw new Error("No interaction event provided");
}

async function main(options = {}) {
  const parsedArgs = parseArgs(options.argv || process.argv.slice(2));

  if (parsedArgs.help) {
    printHelp();
    return null;
  }

  const event = loadInteractionFromArgs(parsedArgs, options);
  const result = recordInteractionEvent(event, {
    workspaceRoot: options.workspaceRoot,
    timestamp: options.timestamp,
    echo: options.echo,
  });
  const output = JSON.stringify(
    {
      recorded: result.recorded,
      skipped: result.skipped,
      skipReason: result.skipReason,
      logFile: result.logFile,
      assessment: result.assessment
        ? {
            score: result.assessment.score,
            band: result.assessment.band,
            captureDecision: result.assessment.captureDecision,
          }
        : null,
      entry: result.entry,
    },
    null,
    2,
  );

  if (options.silent !== true) {
    console.log(output);
  }

  return result;
}

module.exports = {
  loadInteractionFromArgs,
  main,
  parseArgs,
  parseInteractionJson,
  printHelp,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
