const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  createDeusWorkspaceFixtureSync,
} = require("./helpers/deus-workspace-fixture");
const {
  recordActionEvaluation,
  recordActionOutcome,
} = require("../src/policy/deus-policy-feedback");
const { parsePendingBeliefReviewQueue } = require("../src/beliefs/review-queue-schema");
const {
  getWorkspaceDateContext,
  shiftWorkspaceDayKey,
} = require("../src/workspace/workspace-date-context");

const REPO_ROOT = path.join(__dirname, "..");
const SCRIPT_PATH = path.join(
  REPO_ROOT,
  "scripts",
  "nightly-memory-consolidation.js",
);

function writeFile(workspaceRoot, relativePath, content) {
  const fullPath = path.join(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function runNightlyConsolidation(workspaceRoot) {
  const stdout = execFileSync(process.execPath, [SCRIPT_PATH], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      WORKSPACE: workspaceRoot,
    },
  }).toString();

  return JSON.parse(stdout);
}

test("nightly consolidation writes pending beliefs and memory reflection for recurring patterns", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  const { today } = getWorkspaceDateContext();
  const yesterday = shiftWorkspaceDayKey(new Date(), -1);
  const twoDaysAgo = shiftWorkspaceDayKey(new Date(), -2);
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(
    workspaceRoot,
    `memory/${twoDaysAgo}.md`,
    `# ${twoDaysAgo}\n\nInfrastructure deploy work touched dokploy, cloudflare, deploy, dns, and shared_workspace.\n`,
  );
  writeFile(
    workspaceRoot,
    `memory/${yesterday}.md`,
    `# ${yesterday}\n\nInfrastructure deploy work again involved dokploy and cloudflare with deploy planning.\n`,
  );
  writeFile(
    workspaceRoot,
    `memory/${today}.md`,
    `# ${today}\n\nCloudflare deploy and shared_workspace infrastructure work remained active today.\n`,
  );

  const result = runNightlyConsolidation(workspaceRoot);
  assert.ok(result.recurring_patterns >= 1);
  assert.equal(result.wrote_memory_reflection, true);

  const pending = fs.readFileSync(
    path.join(workspaceRoot, "review", "pending-beliefs.md"),
    "utf8",
  );
  const entries = parsePendingBeliefReviewQueue(pending);
  const infrastructureEntry = entries.find(
    (entry) => entry.marker === "infrastructure-work",
  );
  assert.ok(infrastructureEntry);
  assert.equal(infrastructureEntry.confidence_proposal, 0.65);
  assert.equal(
    infrastructureEntry.promotion_decision,
    "review_before_promotion",
  );
  assert.equal(infrastructureEntry.provenance, "sleep_reflection");

  const todayMemory = fs.readFileSync(
    path.join(workspaceRoot, "memory", `${today}.md`),
    "utf8",
  );
  assert.match(
    todayMemory,
    /Cloudflare deploy and shared_workspace infrastructure work remained active today\./,
  );
  assert.match(todayMemory, /## System Events/);
  assert.match(
    todayMemory,
    /Nightly consolidation: Infrastructure and deployment work keeps recurring/,
  );
  assert.doesNotMatch(todayMemory, /## Agent Memory Reflection/);
});

test("nightly consolidation records a low-signal tension when no pattern crosses the threshold", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  const { today } = getWorkspaceDateContext();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(
    workspaceRoot,
    `memory/${today}.md`,
    `# ${today}\n\nQuiet operational day.\n`,
  );

  const result = runNightlyConsolidation(workspaceRoot);
  assert.equal(result.recurring_patterns, 0);

  const tensions = fs.readFileSync(
    path.join(workspaceRoot, "review", "open-tensions.md"),
    "utf8",
  );
  const todayMemory = fs.readFileSync(
    path.join(workspaceRoot, "memory", `${today}.md`),
    "utf8",
  );
  assert.match(tensions, new RegExp(`marker: ${today}-no-patterns`));
  assert.match(todayMemory, /Quiet operational day\./);
});

test("nightly consolidation promotes recurring policy friction into review feedback", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  const { today } = getWorkspaceDateContext();
  const yesterday = shiftWorkspaceDayKey(new Date(), -1);
  const twoDaysAgo = shiftWorkspaceDayKey(new Date(), -2);
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(
    workspaceRoot,
    `memory/${twoDaysAgo}.md`,
    `# ${twoDaysAgo}\n\nOperational day.\n`,
  );
  writeFile(
    workspaceRoot,
    `memory/${yesterday}.md`,
    `# ${yesterday}\n\nOperational day.\n`,
  );
  writeFile(
    workspaceRoot,
    `memory/${today}.md`,
    `# ${today}\n\nOperational day.\n`,
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
      ripeness: { score: 0.4, class: "blocked" },
      cost: { band: "medium", total: 0.44 },
      blockers: ["missing_human_confirmation"],
      missingPreconditions: [],
    },
    {
      workspaceRoot,
      timestamp: `${yesterday}T09:00:00.000Z`,
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
      ripeness: { score: 0.39, class: "blocked" },
      cost: { band: "medium", total: 0.43 },
      blockers: ["missing_human_confirmation"],
      missingPreconditions: [],
    },
    {
      workspaceRoot,
      timestamp: `${today}T09:00:00.000Z`,
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
      timestamp: `${yesterday}T10:00:00.000Z`,
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
      timestamp: `${today}T10:00:00.000Z`,
      echo: false,
    },
  );

  const result = runNightlyConsolidation(workspaceRoot);
  assert.equal(result.policy_feedback_events >= 4, true);
  assert.equal(result.policy_recurring_patterns >= 2, true);

  const pending = fs.readFileSync(
    path.join(workspaceRoot, "review", "pending-beliefs.md"),
    "utf8",
  );
  const entries = parsePendingBeliefReviewQueue(pending);
  assert.ok(
    entries.find((entry) => entry.marker === "confirmation-gating-pressure"),
  );
  assert.ok(
    entries.find((entry) => entry.marker === "high-maintenance-action-tail"),
  );
  assert.equal(
    entries.every((entry) => entry.provenance === "sleep_reflection"),
    true,
  );

  const todayMemory = fs.readFileSync(
    path.join(workspaceRoot, "memory", `${today}.md`),
    "utf8",
  );
  assert.match(
    todayMemory,
    /confirmation gating should remain explicit and early/i,
  );
  assert.match(todayMemory, /high maintenance tail/i);
});
