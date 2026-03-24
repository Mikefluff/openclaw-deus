const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  createDeusWorkspaceFixtureSync,
} = require("./helpers/deus-workspace-fixture");
const { getWorkspaceDateContext } = require("../src/workspace/workspace-date-context");
const {
  loadIntentFromArgs,
  parseArgs,
  parseIntentJson,
} = require("../scripts/deus-action-evaluate");

function writeFile(workspaceRoot, relativePath, content) {
  const fullPath = path.join(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

test("CLI arg parser accepts file, stdin, latest-world-model, and positional JSON", () => {
  const parsed = parseArgs(["--latest-world-model", "--file", "./intent.json"]);

  assert.equal(parsed.useLatestWorldModel, true);
  assert.equal(parsed.filePath, "./intent.json");
  assert.equal(parsed.readFromStdin, false);
  assert.equal(parsed.intentJson, null);
});

test("intent loader resolves file-backed JSON objects", () => {
  const parsed = {
    filePath: "/tmp/intent.json",
    readFromStdin: false,
    useLatestWorldModel: false,
    intentJson: null,
  };
  const intent = loadIntentFromArgs(parsed, {
    readFile(filePath) {
      assert.equal(filePath, path.resolve("/tmp/intent.json"));
      return '{"goal":"Inspect health","actionType":"analyze"}';
    },
  });

  assert.equal(intent.goal, "Inspect health");
  assert.equal(intent.actionType, "analyze");
});

test("intent parser rejects non-object JSON payloads", () => {
  assert.throws(
    () => parseIntentJson("[]", "argv"),
    /intent must be a JSON object/,
  );
});

test("read-only action-evaluate script uses the latest snapshot when requested", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  const { today, nowIso } = getWorkspaceDateContext();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(
    workspaceRoot,
    "docs/introspection/world-model.latest.json",
    `${JSON.stringify(
      {
        generated_at: nowIso,
        workspace_day: today,
        confidence: 0.92,
        self_model: {
          agency_level: "L2+",
          invariants: [
            { id: "I1", content: "Epistemic honesty", confidence: 1 },
          ],
          goals: [{ id: "G1", content: "Support the human", confidence: 0.8 }],
          review_pressure: {},
          active_limitations: [],
        },
        human_model: {
          preferences: ["structured output"],
          constraints: [],
          active_requests: [],
        },
        workspace_model: {
          active_project: "deus",
          mode: "working",
          status: "working",
          repo_dirty: false,
          repo_changes: 0,
          memory_freshness_days: 0,
          introspection_date: today,
          recurring_patterns: [],
          next_step: "inspect health",
          waiting_for: null,
          follow_through_required: "no",
        },
        environment_model: {
          waiting_conditions: [],
          dependencies: ["openclaw"],
          open_tensions: [],
          external_systems: [],
        },
        action_priors: {
          hard_blocks: [],
          preferred_modes: ["observe"],
          active_risks: [],
        },
        sources: {},
      },
      null,
      2,
    )}\n`,
  );
  writeFile(
    workspaceRoot,
    "intent.json",
    JSON.stringify({
      goal: "Inspect health",
      actionType: "analyze",
      target: "deus:health",
    }),
  );

  const output = execFileSync(
    process.execPath,
    [
      path.join(process.cwd(), "scripts", "deus-action-evaluate.js"),
      "--latest-world-model",
      "--file",
      path.join(workspaceRoot, "intent.json"),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WORKSPACE: workspaceRoot,
      },
      encoding: "utf8",
    },
  );

  const evaluation = JSON.parse(output);
  assert.equal(evaluation.decision, "direct_act");
  assert.equal(evaluation.worldModelRef.source, "latest_snapshot");
  assert.equal(evaluation.policy_mode, "advisory");
  assert.equal(evaluation.dissensus.decision, "allow");
});
