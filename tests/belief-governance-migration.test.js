const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  annotateBeliefWithGovernanceProfile,
  repairBeliefWithGovernanceDirective,
} = require("../src/beliefs/belief-governance-migration");
const {
  runClassificationMigration,
} = require("../scripts/belief-governance-migrate");

test("governance classification honors belief-level class directives over legacy fallback", () => {
  const classified = annotateBeliefWithGovernanceProfile({
    belief_id: "G1",
    source_type: "inference",
    confidence: 0.2,
    timestamp_created: "2026-02-27T17:50:00.000Z",
    timestamp_updated: "2026-02-27T17:50:00.000Z",
  });

  assert.equal(classified.belief_class, "self_model");
  assert.equal(classified.decay_mode, "slow");
  assert.equal(classified.confidence_floor, 0.9);
  assert.equal(classified.review_threshold, 0.9);
  assert.equal(classified.archivable, false);
});

test("governance repair restores critical beliefs but leaves weak archived beliefs untouched", () => {
  const repaired = repairBeliefWithGovernanceDirective(
    {
      belief_id: "S1",
      source_type: "self",
      confidence: 0.2,
      status: "archived",
      drift_history: [],
      timestamp_created: "2026-02-27T17:50:00.000Z",
      timestamp_updated: "2026-02-27T17:50:00.000Z",
    },
    { now: new Date("2026-03-22T08:30:00.000Z") },
  );

  assert.equal(repaired.repaired, true);
  assert.equal(repaired.belief.confidence, 0.95);
  assert.equal(repaired.belief.status, "active");
  assert.match(
    JSON.stringify(repaired.belief.drift_history),
    /governance_migration_repair/,
  );

  const untouched = repairBeliefWithGovernanceDirective({
    belief_id: "M2",
    source_type: "external",
    confidence: 0.2,
    status: "archived",
    drift_history: [],
    timestamp_created: "2026-02-27T17:50:00.000Z",
    timestamp_updated: "2026-02-27T17:50:00.000Z",
  });

  assert.equal(untouched.repaired, false);
  assert.equal(untouched.belief.confidence, 0.2);
  assert.equal(untouched.belief.status, "archived");
});

test("classification migration script supports classify-only and repair modes", (t) => {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "belief-governance-migration-"),
  );
  const beliefsFile = path.join(workspaceRoot, "beliefs.core.jsonl");
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  fs.writeFileSync(
    beliefsFile,
    [
      JSON.stringify({
        belief_id: "G2",
        source_type: "inference",
        confidence: 0.2,
        drift_history: [],
        timestamp_created: "2026-02-27T17:50:00.000Z",
        timestamp_updated: "2026-02-27T17:50:00.000Z",
      }),
      JSON.stringify({
        belief_id: "M3",
        source_type: "external",
        confidence: 0.2,
        status: "archived",
        drift_history: [],
        timestamp_created: "2026-02-27T17:50:00.000Z",
        timestamp_updated: "2026-02-27T17:50:00.000Z",
      }),
    ].join("\n") + "\n",
  );

  const classified = runClassificationMigration({
    beliefsFile,
    dryRun: false,
    repair: false,
  });
  assert.equal(classified.total, 2);
  assert.equal(classified.repaired, 0);

  let beliefs = fs
    .readFileSync(beliefsFile, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(
    beliefs.find((belief) => belief.belief_id === "G2").belief_class,
    "self_model",
  );
  assert.equal(
    beliefs.find((belief) => belief.belief_id === "M3").belief_class,
    "hypothesis",
  );

  const repaired = runClassificationMigration({
    beliefsFile,
    dryRun: false,
    repair: true,
  });
  assert.equal(repaired.repaired, 1);

  beliefs = fs
    .readFileSync(beliefsFile, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  assert.equal(
    beliefs.find((belief) => belief.belief_id === "G2").confidence,
    0.9,
  );
  assert.equal(
    beliefs.find((belief) => belief.belief_id === "M3").confidence,
    0.2,
  );
});
