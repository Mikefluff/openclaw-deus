const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const {
  createDeusWorkspaceFixtureSync,
} = require("./helpers/deus-workspace-fixture");

const REPO_ROOT = path.join(__dirname, "..");
const SCRIPT_PATH = path.join(
  REPO_ROOT,
  "scripts",
  "belief-promotion-review.js",
);

function writeFile(workspaceRoot, relativePath, content) {
  const fullPath = path.join(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

function runPromotionReview(workspaceRoot) {
  const stdout = execFileSync(process.execPath, [SCRIPT_PATH], {
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

test("promotion review promotes, defers, and rejects entries via the shared policy", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(
    workspaceRoot,
    "review/pending-beliefs.md",
    [
      "# Pending Belief Promotions",
      "",
      "## 2026-03-18T00:00:00.000Z — promote-me",
      "- marker: 2026-03-18-promote-me",
      "- candidate: Infrastructure and deployment work keeps recurring and should remain a first-class operational concern.",
      "- category: operational",
      "- evidence: recurring pattern",
      "- evidence_sources: memory/2026-03-16.md, memory/2026-03-17.md, memory/2026-03-18.md",
      "- recurrence: 3",
      "- confidence_proposal: 0.65",
      "- promotion_decision: review_before_promotion",
      "- human_review_needed: no",
      "- notes: fixture entry",
      "",
      "## 2026-03-18T00:00:00.000Z — defer-me",
      "- marker: 2026-03-18-defer-me",
      "- candidate: Workspace normalization remains a recurring operational concern.",
      "- category: operational",
      "- evidence: recurring pattern",
      "- evidence_sources: memory/2026-03-17.md, memory/2026-03-18.md",
      "- recurrence: 2",
      "- confidence_proposal: 0.65",
      "- promotion_decision: review_before_promotion",
      "- human_review_needed: no",
      "- notes: fixture entry",
      "",
      "## 2026-03-18T00:00:00.000Z — reject-me",
      "- marker: 2026-03-18-reject-me",
      "- candidate: Minor low-signal note.",
      "- category: hypothesis",
      "- evidence: weak signal",
      "- evidence_sources: memory/2026-03-18.md",
      "- recurrence: 1",
      "- confidence_proposal: 0.5",
      "- promotion_decision: review_before_promotion",
      "- human_review_needed: no",
      "- notes: fixture entry",
      "",
    ].join("\n"),
  );

  const result = runPromotionReview(workspaceRoot);
  assert.equal(result.promoted, 1);
  assert.equal(result.deferred, 1);
  assert.equal(result.rejected, 1);

  const beliefs = fs
    .readFileSync(path.join(workspaceRoot, "beliefs", "core.jsonl"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const promoted = beliefs.find((belief) =>
    belief.content.includes(
      "Infrastructure and deployment work keeps recurring",
    ),
  );
  assert.ok(promoted);
  assert.equal(promoted.context_scope, "operational");

  const reviewFile = fs.readFileSync(
    path.join(workspaceRoot, "review", "pending-beliefs.md"),
    "utf8",
  );
  assert.match(
    reviewFile,
    /marker: promote-me[\s\S]*promotion_decision: promote/,
  );
  assert.match(reviewFile, /marker: defer-me[\s\S]*promotion_decision: defer/);
  assert.match(
    reviewFile,
    /marker: reject-me[\s\S]*promotion_decision: reject/,
  );
});
