#!/usr/bin/env node

const path = require("path");
const { spawnSync } = require("child_process");
const {
  createDeusWorkspaceFixtureSync,
} = require("../tests/helpers/deus-workspace-fixture");

const workspaceRoot = path.resolve(__dirname, "..");
const nodeCommand = process.execPath;
const args = process.argv.slice(2);
const liveWorkspace = args.includes("--live-workspace");
const unknownArgs = args.filter((arg) => arg !== "--live-workspace");

if (unknownArgs.length > 0) {
  console.error(`Unknown arguments: ${unknownArgs.join(", ")}`);
  process.exit(1);
}

const integrationWorkspace = liveWorkspace
  ? workspaceRoot
  : createDeusWorkspaceFixtureSync();

console.log(
  `Root test mode: ${liveWorkspace ? "live-workspace" : "fixture-workspace"}`,
);
if (!liveWorkspace) {
  console.log(`Fixture workspace: ${integrationWorkspace}`);
}

const testCommands = [
  {
    label: "deus-entry-surfaces",
    args: [
      "--test",
      "tests/deus-scenarios.test.js",
      "tests/deus-introspection-followup.test.js",
      "tests/deus-decay-tuning.test.js",
      "tests/runtime-surface-paths.test.js",
      "tests/deus-focus-state.test.js",
      "tests/workspace-authority.test.js",
      "tests/doctor-workspace.test.js",
    ],
    env: process.env,
  },
  {
    label: "deus-belief-governance",
    args: [
      "--test",
      "tests/belief-decay-audit.test.js",
      "tests/belief-decay-overrides.test.js",
      "tests/belief-policy.test.js",
      "tests/belief-decay.exemptions.test.js",
      "tests/belief-governance-migration.test.js",
    ],
    env: process.env,
  },
  {
    label: "deus-action-policy",
    args: [
      "--test",
      "tests/deus-action-policy.test.js",
      "tests/deus-dissensus-engine.test.js",
      "tests/deus-dissensus-runtime.test.js",
      "tests/deus-action-evaluate.test.js",
      "tests/interaction-event-policy.test.js",
      "tests/deus-interaction-record.test.js",
      "tests/deus-policy-feedback.test.js",
      "tests/deus-policy-record.test.js",
      "tests/aggregate-logs.test.js",
      "tests/interaction-memory-routing.test.js",
      "tests/focus-runtime-policy.test.js",
      "tests/focus-state-schema.test.js",
      "tests/deus-background-mutation-policy.test.js",
      "tests/deus-sleep-planner.test.js",
      "tests/deus-sleep-cycle.test.js",
      "tests/review-queue-schema.test.js",
      "tests/review-queue-dedup.test.js",
      "tests/belief-extractor.review-queue.test.js",
      "tests/interaction-memory-routing.test.js",
      "tests/belief-pipeline.end-to-end.test.js",
      "tests/nightly-memory-consolidation.test.js",
    ],
    env: process.env,
  },
  {
    label: "workspace-db-config",
    args: ["--test", "tests/workspace-database-url.test.js"],
    env: process.env,
  },
  {
    label: "bootstrap-contract",
    args: ["--test", "tests/deus-bootstrap-contract.test.js"],
    env: process.env,
  },
  {
    label: "constitution",
    script: "tests/constitution-test.js",
    env: process.env,
  },
  {
    label: "integration",
    script: "tests/integration-test.js",
    env: {
      ...process.env,
      TEST_WORKSPACE_ROOT: integrationWorkspace,
    },
  },
  {
    label: "openclaw-integration",
    script: "tests/openclaw-integration-test.js",
    env: {
      ...process.env,
      TEST_WORKSPACE_ROOT: integrationWorkspace,
    },
  },
];

for (const command of testCommands) {
  const nodeArgs = command.args || [command.script];
  console.log(`\n[${command.label}] node ${nodeArgs.join(" ")}`);
  const result = spawnSync(nodeCommand, nodeArgs, {
    cwd: workspaceRoot,
    env: command.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}
