#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  appendPolicyFeedbackActivity,
  POLICY_EVENT_TYPES,
  recordActionEvaluation,
  recordActionOutcome,
  recordWorldModelRefresh,
} = require("../src/policy/deus-policy-feedback");

function printHelp() {
  console.log(`Usage: node scripts/deus-policy-record.js [options] <event-json>

Options:
  --file <path>            Read the policy event from a JSON file.
  --stdin                  Read the policy event from stdin.
  --help                   Show this message.

Examples:
  node scripts/deus-policy-record.js '{"kind":"action_outcome","success":true,"actionType":"repo_mutation","target":"ROADMAP.md"}'
  echo '{"kind":"action_evaluation","decision":"blocked","blockers":["missing_human_confirmation"]}' | node scripts/deus-policy-record.js --stdin
`);
}

function parseArgs(argv) {
  const parsed = {
    filePath: null,
    readFromStdin: false,
    eventJson: null,
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

    if (parsed.eventJson !== null) {
      throw new Error("Provide only one positional event JSON argument");
    }

    parsed.eventJson = argument;
  }

  return parsed;
}

function parseEventJson(text, sourceLabel) {
  try {
    const parsed = JSON.parse(String(text || ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("policy event must be a JSON object");
    }
    return parsed;
  } catch (error) {
    throw new Error(
      `Failed to parse policy event from ${sourceLabel}: ${error.message}`,
    );
  }
}

function loadEventFromArgs(parsedArgs, options = {}) {
  const readFile = options.readFile || fs.readFileSync;

  if (parsedArgs.filePath) {
    const absolutePath = path.resolve(parsedArgs.filePath);
    return parseEventJson(readFile(absolutePath, "utf8"), absolutePath);
  }

  if (parsedArgs.readFromStdin) {
    return parseEventJson(readFile(0, "utf8"), "stdin");
  }

  if (parsedArgs.eventJson) {
    return parseEventJson(parsedArgs.eventJson, "argv");
  }

  throw new Error("No policy event provided");
}

function recordEvent(event, options = {}) {
  const kind = String(event.kind || event.policyEventType || event.policy_event || "")
    .trim()
    .toLowerCase();

  if (kind === POLICY_EVENT_TYPES.WORLD_MODEL_REFRESH) {
    return recordWorldModelRefresh(event.surface || event, options);
  }

  if (kind === POLICY_EVENT_TYPES.ACTION_OUTCOME) {
    return recordActionOutcome(event.outcome || event, options);
  }

  if (kind === POLICY_EVENT_TYPES.ACTION_EVALUATION) {
    return recordActionEvaluation(event.evaluation || event, options);
  }

  return appendPolicyFeedbackActivity({
    ...event,
    workspaceRoot: options.workspaceRoot,
    echo: options.echo,
  });
}

async function main(options = {}) {
  const parsedArgs = parseArgs(options.argv || process.argv.slice(2));

  if (parsedArgs.help) {
    printHelp();
    return null;
  }

  const event = loadEventFromArgs(parsedArgs, options);
  const result = recordEvent(event, {
    workspaceRoot: options.workspaceRoot,
  });
  const output = JSON.stringify(
    {
      logFile: result.logFile,
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
  loadEventFromArgs,
  main,
  parseArgs,
  parseEventJson,
  printHelp,
  recordEvent,
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
