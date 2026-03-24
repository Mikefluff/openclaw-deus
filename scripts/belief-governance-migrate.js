const fs = require("fs");
const {
  annotateBeliefCollection,
  repairBeliefCollection,
} = require("../src/beliefs/belief-governance-migration");
const {
  resolveBeliefsPath,
  resolveBeliefsWritePath,
} = require("../src/runtime/runtime-surface-paths");

const BELIEFS_FILE = resolveBeliefsPath();

function loadBeliefs(beliefsFile = BELIEFS_FILE) {
  const data = fs.readFileSync(beliefsFile, "utf8");
  return data
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function saveBeliefs(beliefs, beliefsFile = BELIEFS_FILE) {
  const targetPath =
    beliefsFile === BELIEFS_FILE ? resolveBeliefsWritePath() : beliefsFile;
  fs.writeFileSync(
    targetPath,
    `${beliefs.map((belief) => JSON.stringify(belief)).join("\n")}\n`,
    "utf8",
  );
}

function runClassificationMigration(options = {}) {
  const {
    beliefsFile = BELIEFS_FILE,
    dryRun = false,
    repair = false,
  } = options;
  const beliefs = loadBeliefs(beliefsFile);
  const classified = annotateBeliefCollection(beliefs);
  const repaired = repair
    ? repairBeliefCollection(classified, options)
    : { beliefs: classified, repairedCount: 0 };
  const migrated = repaired.beliefs;

  if (!dryRun) {
    saveBeliefs(migrated, beliefsFile);
  }

  return {
    total: migrated.length,
    repaired: repaired.repairedCount,
    beliefsFile,
    dryRun,
    repair,
  };
}

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  const repair = process.argv.includes("--repair");
  const result = runClassificationMigration({ dryRun, repair });
  console.log(JSON.stringify(result, null, 2));
}

module.exports = {
  loadBeliefs,
  runClassificationMigration,
  saveBeliefs,
};
