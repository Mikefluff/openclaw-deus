const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  createDeusWorkspaceFixtureSync,
} = require("./helpers/deus-workspace-fixture");
const { getWorkspaceDateContext } = require("../src/workspace/workspace-date-context");
const { parsePendingBeliefReviewQueue } = require("../src/beliefs/review-queue-schema");
const { recordInteractionEvent } = require("../src/deus/deus-interaction-log");

const REPO_ROOT = path.join(__dirname, "..");
const AGGREGATE_PATH = path.join(REPO_ROOT, "scripts", "aggregate-logs.js");
const EXTRACTOR_PATH = path.join(REPO_ROOT, "scripts", "belief-extractor.js");

function runScript(scriptPath, workspaceRoot) {
  const stdout = execFileSync(process.execPath, [scriptPath], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      WORKSPACE: workspaceRoot,
    },
  }).toString();

  const match = stdout.match(/\{[\s\S]*\}\s*$/);
  if (!match) {
    throw new Error(`Missing JSON payload in stdout:\n${stdout}`);
  }

  return JSON.parse(match[0]);
}

test("interaction-derived daily memory entries become review-first belief candidates", (t) => {
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
      timestamp: `${today}T09:00:00.000Z`,
      echo: false,
    },
  );

  runScript(AGGREGATE_PATH, workspaceRoot);
  const extractionResult = runScript(EXTRACTOR_PATH, workspaceRoot);
  const memory = fs.readFileSync(
    path.join(workspaceRoot, "memory", `${today}.md`),
    "utf8",
  );
  const queue = parsePendingBeliefReviewQueue(
    fs.readFileSync(
      path.join(workspaceRoot, "review", "pending-beliefs.md"),
      "utf8",
    ),
  );

  assert.match(
    memory,
    /preference \[review_signal\]: Я не люблю огурцы, не предлагай их в рецептах\./,
  );
  assert.equal(extractionResult.extracted, 0);
  assert.equal(extractionResult.deferred, 1);
  assert.equal(queue.length, 1);
  assert.equal(
    queue[0].candidate,
    "User preference: Я не люблю огурцы, не предлагай их в рецептах.",
  );
  assert.equal(queue[0].promotion_decision, "review_before_promotion");
  assert.equal(queue[0].provenance, "interactive_memory");
  assert.deepEqual(queue[0].evidence_sources, [`memory/${today}.md`]);
  assert.match(queue[0].evidence, /interaction signal/);
  assert.match(queue[0].notes, /\[review_signal\]/);
  assert.match(queue[0].notes, /\[interactive_memory\]/);
});
