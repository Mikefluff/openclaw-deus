const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  createDeusWorkspaceFixtureSync,
} = require("./helpers/deus-workspace-fixture");
const { appendDeusOpsLog } = require("../src/deus/deus-ops-log");
const { getWorkspaceDateContext } = require("../src/workspace/workspace-date-context");
const {
  recordActionEvaluation,
  recordActionOutcome,
  recordWorldModelRefresh,
} = require("../src/policy/deus-policy-feedback");
const { recordInteractionEvent } = require("../src/deus/deus-interaction-log");

const REPO_ROOT = path.join(__dirname, "..");
const SCRIPT_PATH = path.join(REPO_ROOT, "scripts", "aggregate-logs.js");

function writeFile(workspaceRoot, relativePath, content) {
  const fullPath = path.join(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

test("aggregate-logs consumes canonical daily activity logs and ignores component diagnostics", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  const { today } = getWorkspaceDateContext();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(
    workspaceRoot,
    `logs/${today}.jsonl`,
    [
      JSON.stringify({
        timestamp: `${today}T09:00:00.000Z`,
        type: "decision",
        message: "Defined workspace boundary",
      }),
      JSON.stringify({
        timestamp: `${today}T09:01:00.000Z`,
        type: "error",
        message: "Warning surfaced during sync",
      }),
    ].join("\n") + "\n",
  );
  recordWorldModelRefresh(
    {
      worldModel: {
        activeProject: "deus",
        confidence: 0.84,
      },
      actionPolicy: {
        decision: "blocked",
      },
    },
    {
      workspaceRoot,
      timestamp: `${today}T09:02:00.000Z`,
      echo: false,
    },
  );
  recordActionEvaluation(
    {
      intent: {
        goal: "Send operator update",
        action_type: "external_message",
        target: "operator",
      },
      decision: "blocked",
      recommendedMode: "blocked",
      decisionSummary: "hard blocker prevents action",
      blockers: ["missing_human_confirmation"],
      ripeness: { score: 0.41 },
      cost: { band: "medium", total: 0.44 },
    },
    {
      workspaceRoot,
      timestamp: `${today}T09:03:00.000Z`,
      echo: false,
    },
  );
  recordActionOutcome(
    {
      actionType: "external_message",
      target: "operator",
      success: false,
      maintenanceTailObserved: "high",
      followupRequired: true,
    },
    {
      workspaceRoot,
      timestamp: `${today}T09:04:00.000Z`,
      echo: false,
    },
  );
  appendDeusOpsLog({
    component: "belief-decay",
    message: "Operational decay diagnostic that must stay out of memory",
    workspaceRoot,
    echo: false,
  });

  execFileSync(process.execPath, [SCRIPT_PATH], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      WORKSPACE: workspaceRoot,
    },
  });

  const memory = fs.readFileSync(
    path.join(workspaceRoot, "memory", `${today}.md`),
    "utf8",
  );
  assert.match(memory, /Defined workspace boundary/);
  assert.match(memory, /Warning surfaced during sync/);
  assert.match(
    memory,
    new RegExp(
      `## Decisions\\n- ${today}T09:00:00\\.000Z: Defined workspace boundary`,
    ),
  );
  assert.match(
    memory,
    new RegExp(
      `- ${today}T09:03:00\\.000Z: Policy evaluation blocked for external_message on operator`,
    ),
  );
  assert.match(
    memory,
    new RegExp(
      `## System Events\\n- ${today}T09:01:00\\.000Z: Warning surfaced during sync`,
    ),
  );
  assert.match(
    memory,
    new RegExp(
      `- ${today}T09:02:00\\.000Z: Policy refresh for deus; confidence 0\\.84; decision blocked`,
    ),
  );
  assert.match(
    memory,
    new RegExp(
      `- ${today}T09:04:00\\.000Z: Policy outcome failed for external_message on operator; maintenance high`,
    ),
  );
  assert.match(memory, /## Commands Executed/);
  assert.match(memory, /## Interactions with Human/);
  assert.match(memory, /## Git Activity/);
  assert.doesNotMatch(memory, /## Events/);
  assert.doesNotMatch(memory, /## Durable observations/);
  assert.doesNotMatch(memory, /## Open tensions/);
  assert.doesNotMatch(
    memory,
    /Operational decay diagnostic that must stay out of memory/,
  );
});

test("aggregate-logs routes structured interaction events into the human-interaction section", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  const { today } = getWorkspaceDateContext();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  recordInteractionEvent(
    {
      kind: "preference",
      content: "Я не люблю огурцы, не предлагай их в рецептах.",
      tags: ["food", "identity"],
    },
    {
      workspaceRoot,
      timestamp: `${today}T10:00:00.000Z`,
      echo: false,
    },
  );

  execFileSync(process.execPath, [SCRIPT_PATH], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      WORKSPACE: workspaceRoot,
    },
  });

  const memory = fs.readFileSync(
    path.join(workspaceRoot, "memory", `${today}.md`),
    "utf8",
  );
  assert.match(memory, /## Interactions with Human/);
  assert.match(
    memory,
    new RegExp(
      `## Interactions with Human\\n- ${today}T10:00:00\\.000Z: preference \\[review_signal\\]: Я не люблю огурцы, не предлагай их в рецептах\\.`,
    ),
  );
});

test("aggregate-logs keeps log-only interaction events out of daily memory", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  const { today } = getWorkspaceDateContext();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  recordInteractionEvent(
    {
      kind: "project_context",
      content: "В проекте cucumber-importer мы все еще обсуждаем форму данных.",
      tags: ["project"],
      recurring: true,
    },
    {
      workspaceRoot,
      timestamp: `${today}T11:00:00.000Z`,
      echo: false,
    },
  );

  execFileSync(process.execPath, [SCRIPT_PATH], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      WORKSPACE: workspaceRoot,
    },
  });

  const memory = fs.readFileSync(
    path.join(workspaceRoot, "memory", `${today}.md`),
    "utf8",
  );
  assert.doesNotMatch(
    memory,
    /cucumber-importer мы все еще обсуждаем форму данных/,
  );
});
