const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO_ROOT = path.join(__dirname, "..");
const SCRIPT_PATH = path.join(REPO_ROOT, "scripts", "belief-decay.js");

function writeFile(workspaceRoot, relativePath, content) {
  const fullPath = path.join(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

test("belief decay restores decay-exempt invariants and separates deprecated from archived lifecycle states", (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "belief-decay-"));
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(workspaceRoot, "AGENTS.md", "# AGENTS\n");
  writeFile(
    workspaceRoot,
    "beliefs/core.jsonl",
    [
      JSON.stringify({
        belief_id: "I1",
        content: "Invariant",
        confidence: 0.2,
        source_type: "axiom",
        timestamp_created: "2026-03-01T00:00:00.000Z",
        timestamp_updated: "2026-03-01T00:00:00.000Z",
        status: "archived",
        drift_history: [],
      }),
      JSON.stringify({
        belief_id: "R1",
        content: "Operational belief",
        confidence: 0.25,
        source_type: "inference",
        timestamp_created: "2026-03-01T00:00:00.000Z",
        timestamp_updated: "2026-03-01T00:00:00.000Z",
        status: "active",
        drift_history: [],
      }),
      JSON.stringify({
        belief_id: "R2",
        content: "Already deprecated operational belief",
        confidence: 0.5,
        source_type: "inference",
        timestamp_created: "2026-03-01T00:00:00.000Z",
        timestamp_updated: "2026-03-01T00:00:00.000Z",
        status: "deprecated",
        drift_history: [],
      }),
    ].join("\n") + "\n",
  );

  const stdout = execFileSync(process.execPath, [SCRIPT_PATH], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      WORKSPACE: workspaceRoot,
    },
  }).toString();
  const result = JSON.parse(stdout.match(/\{[\s\S]*\}\s*$/)[0]);
  const beliefs = fs
    .readFileSync(path.join(workspaceRoot, "beliefs", "core.jsonl"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  const invariant = beliefs.find((belief) => belief.belief_id === "I1");
  const deprecated = beliefs.find((belief) => belief.belief_id === "R1");
  const archived = beliefs.find((belief) => belief.belief_id === "R2");

  assert.equal(result.restored_exempt, 1);
  assert.equal(result.archived, 1);
  assert.equal(result.deprecated, 1);
  assert.equal(invariant.confidence, 1);
  assert.equal(invariant.status, "active");
  assert.match(JSON.stringify(invariant.drift_history), /decay_exempt_restore/);
  assert.equal(deprecated.status, "deprecated");
  assert.equal(deprecated.confidence, 0.5);
  assert.match(
    JSON.stringify(deprecated.drift_history),
    /decay_deprecation_threshold/,
  );
  assert.equal(archived.status, "archived");
  assert.equal(archived.confidence, 0.5);
  assert.match(
    JSON.stringify(archived.drift_history),
    /decay_archive_threshold/,
  );
  assert.match(
    JSON.stringify(archived.drift_history),
    /\"belief_class\":\"operational\"/,
  );
});

test("belief decay keeps non-archivable user-model beliefs in review instead of archiving them", (t) => {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "belief-decay-user-"),
  );
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(workspaceRoot, "AGENTS.md", "# AGENTS\n");
  writeFile(
    workspaceRoot,
    "beliefs/core.jsonl",
    [
      JSON.stringify({
        belief_id: "M1",
        content: "User preference belief",
        confidence: 0.76,
        source_type: "inference",
        timestamp_created: "2026-03-01T00:00:00.000Z",
        timestamp_updated: "2026-03-01T00:00:00.000Z",
        status: "active",
        drift_history: [],
      }),
    ].join("\n") + "\n",
  );

  const stdout = execFileSync(process.execPath, [SCRIPT_PATH], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      WORKSPACE: workspaceRoot,
    },
  }).toString();
  const result = JSON.parse(stdout.match(/\{[\s\S]*\}\s*$/)[0]);
  const beliefs = fs
    .readFileSync(path.join(workspaceRoot, "beliefs", "core.jsonl"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const userModel = beliefs.find((belief) => belief.belief_id === "M1");

  assert.equal(result.archived, 0);
  assert.equal(result.deprecated, 0);
  assert.equal(result.flagged, 1);
  assert.equal(userModel.status, "review_needed");
  assert.equal(userModel.confidence, 0.75);
  assert.match(
    JSON.stringify(userModel.drift_history),
    /decay_review_threshold/,
  );
});
