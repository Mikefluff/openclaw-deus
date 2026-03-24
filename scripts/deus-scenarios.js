#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");

const workspaceRoot = path.resolve(__dirname, "..");
const nodeCommand = process.execPath;

const SCENARIOS = Object.freeze({
  bootstrap: {
    description: "Run the DEUS bootstrap validator in read-only check mode.",
    mutates: false,
    steps: [{ script: "scripts/bootstrap-validator.js" }],
  },
  "bootstrap:repair": {
    description:
      "Run the DEUS bootstrap validator in repair mode and persist diagnostics.",
    mutates: true,
    steps: [
      {
        script: "scripts/bootstrap-validator.js",
        args: ["--repair", "--write-log"],
      },
    ],
  },
  "memory:aggregate": {
    description: "Aggregate today's DEUS ops logs into the daily memory file.",
    mutates: true,
    steps: [{ script: "scripts/aggregate-logs.js" }],
  },
  "beliefs:extract": {
    description: "Extract candidate beliefs from recent memory files.",
    mutates: true,
    steps: [{ script: "scripts/belief-extractor.js" }],
  },
  "beliefs:contradictions": {
    description: "Scan active beliefs for contradictions and flag conflicts.",
    mutates: true,
    steps: [{ script: "scripts/belief-contradictions.js" }],
  },
  "beliefs:decay": {
    description: "Apply daily decay policy to non-exempt beliefs.",
    mutates: true,
    steps: [{ script: "scripts/belief-decay.js" }],
  },
  "beliefs:review": {
    description: "Review pending belief promotions and update durable beliefs.",
    mutates: true,
    steps: [{ script: "scripts/belief-promotion-review.js" }],
  },
  health: {
    description: "Print the compact DEUS health summary.",
    mutates: false,
    steps: [{ script: "scripts/deus-health.js" }],
  },
  focus: {
    description:
      "Print the canonical focus-state and bounded sleep posture derived from STATUS.md.",
    mutates: false,
    steps: [{ script: "scripts/deus-focus-state.js" }],
  },
  "action:evaluate": {
    description:
      "Evaluate a proposed action using the DEUS action-policy coordinator.",
    mutates: false,
    steps: [
      { script: "scripts/deus-action-evaluate.js", passthroughArgs: true },
    ],
  },
  "world-model": {
    description: "Build and persist the latest DEUS world-model snapshot.",
    mutates: true,
    steps: [{ script: "scripts/world-model-refresh.js" }],
  },
  "beliefs:cycle": {
    description:
      "Run the full belief maintenance cycle: extract, contradiction scan, decay, review.",
    mutates: true,
    steps: [
      { script: "scripts/belief-extractor.js" },
      { script: "scripts/belief-contradictions.js" },
      { script: "scripts/belief-decay.js" },
      { script: "scripts/belief-promotion-review.js" },
    ],
  },
  introspect: {
    description:
      "Run the full DEUS introspection pipeline and write report artifacts.",
    mutates: true,
    steps: [{ script: "scripts/introspection.js" }],
  },
  "introspect:dry": {
    description:
      "Run the DEUS introspection pipeline in dry-run mode without writing artifacts.",
    mutates: false,
    steps: [
      {
        script: "scripts/introspection.js",
        env: {
          INTROSPECTION_DRY_RUN: "1",
        },
      },
    ],
  },
  "introspection:followup": {
    description:
      "Print the canonical follow-up packet or prompt for the latest introspection report.",
    mutates: false,
    steps: [
      {
        script: "scripts/deus-introspection-followup.js",
        passthroughArgs: true,
      },
    ],
  },
  "decay:tune:dry": {
    description:
      "Preview one bounded post-introspection decay tuning patch without mutating the override artifact.",
    mutates: false,
    steps: [{ script: "scripts/deus-decay-tuning.js", args: ["--dry-run"] }],
  },
  "sleep:dry": {
    description:
      "Preview the bounded DEUS sleep reflection cycle without mutating canonical artifacts.",
    mutates: false,
    steps: [{ script: "scripts/deus-sleep-cycle.js", args: ["--dry-run"] }],
  },
  sleep: {
    description:
      "Run the bounded DEUS sleep reflection cycle over logs, memory, review, introspection, and diagnostics only.",
    mutates: true,
    steps: [{ script: "scripts/deus-sleep-cycle.js" }],
  },
  "decay:tune": {
    description:
      "Apply one bounded post-introspection decay tuning patch to the runtime override artifact.",
    mutates: true,
    steps: [{ script: "scripts/deus-decay-tuning.js" }],
  },
  nightly: {
    description:
      "Run the full DEUS night orchestration: memory aggregation, bounded sleep, full introspection, bounded decay tuning, then reviewed belief promotion.",
    mutates: true,
    steps: [{ script: "scripts/deus-nightly.js" }],
  },
  "openclaw:check": {
    description: "Run the OpenClaw integration diagnostics surface.",
    mutates: false,
    steps: [{ script: "scripts/openclaw-integration.js" }],
  },
  log: {
    description: "Append a structured DEUS activity log entry.",
    mutates: true,
    steps: [{ script: "scripts/deus-logger.js", passthroughArgs: true }],
  },
  "policy:record": {
    description:
      "Append a structured policy feedback event to the canonical DEUS daily log.",
    mutates: true,
    steps: [{ script: "scripts/deus-policy-record.js", passthroughArgs: true }],
  },
});

function getScenario(name) {
  return SCENARIOS[name] || null;
}

function renderScenarioCatalog() {
  const lines = ["Official DEUS npm scenarios:"];

  for (const [name, scenario] of Object.entries(SCENARIOS)) {
    const mutability = scenario.mutates ? "mutating" : "read-only";
    lines.push(`- ${name} [${mutability}] ${scenario.description}`);
  }

  lines.push("");
  lines.push("Use the matching root package scripts, for example:");
  lines.push("  npm run deus:scenarios");
  lines.push("  npm run deus:bootstrap");
  lines.push("  npm run deus:focus");
  lines.push(
    '  npm run deus:action:evaluate -- \'{"goal":"Inspect health","actionType":"analyze"}\'',
  );
  lines.push("  npm run deus:sleep:dry");
  lines.push("  npm run deus:introspect:dry");
  lines.push("  npm run deus:introspection:followup -- --prompt");
  lines.push("  npm run deus:decay:tune:dry");
  lines.push("  npm run deus:sleep");
  lines.push("  npm run deus:nightly");
  lines.push("  npm run deus:decay:tune");
  lines.push(
    '  npm run deus:policy:record -- \'{"kind":"action_outcome","outcome":"success"}\'',
  );

  return `${lines.join("\n")}\n`;
}

function printHelp() {
  console.log(`Usage: node scripts/deus-scenarios.js <scenario>|list

Scenarios:
${Object.keys(SCENARIOS)
  .map((name) => `  - ${name}`)
  .join("\n")}

Commands:
  list       Print the official DEUS scenario catalog.
  --help     Show this message.
`);
}

function runStep(step, extraArgs = []) {
  const scriptPath = path.resolve(workspaceRoot, step.script);
  const args = [
    scriptPath,
    ...(step.args || []),
    ...(step.passthroughArgs ? extraArgs : []),
  ];
  const result = spawnSync(nodeCommand, args, {
    cwd: workspaceRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      ...(step.env || {}),
    },
  });

  if (result.error) {
    throw result.error;
  }

  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

function runScenario(name, extraArgs = []) {
  const scenario = getScenario(name);
  if (!scenario) {
    throw new Error(`Unknown scenario: ${name}`);
  }

  console.log(
    `[deus-scenarios] ${name} (${scenario.mutates ? "mutating" : "read-only"})`,
  );

  for (const [index, step] of scenario.steps.entries()) {
    console.log(
      `[deus-scenarios] step ${index + 1}/${scenario.steps.length}: ${step.script}`,
    );
    runStep(step, extraArgs);
  }
}

if (require.main === module) {
  const command = process.argv[2];
  const extraArgs = process.argv.slice(3);

  if (!command || command === "--help" || command === "-h") {
    printHelp();
    process.exit(0);
  }

  if (command === "list") {
    process.stdout.write(renderScenarioCatalog());
    process.exit(0);
  }

  try {
    runScenario(command, extraArgs);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  SCENARIOS,
  getScenario,
  renderScenarioCatalog,
  runScenario,
};
