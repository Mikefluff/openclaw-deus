const test = require("node:test");
const assert = require("node:assert/strict");

const packageJson = require("../package.json");
const {
  SCENARIOS,
  renderScenarioCatalog,
} = require("../scripts/deus-scenarios");

const REQUIRED_PACKAGE_SCRIPTS = [
  "deus:scenarios",
  "deus:action:evaluate",
  "deus:bootstrap",
  "deus:bootstrap:repair",
  "deus:focus",
  "deus:world-model",
  "deus:introspect",
  "deus:introspect:dry",
  "deus:introspection:followup",
  "deus:decay:tune",
  "deus:decay:tune:dry",
  "deus:beliefs:cycle",
  "deus:nightly",
  "deus:openclaw:check",
  "deus:policy:record",
  "deus:sleep",
  "deus:sleep:dry",
  "deus:health",
];

test("official DEUS package scripts are exposed in package.json", () => {
  for (const scriptName of REQUIRED_PACKAGE_SCRIPTS) {
    assert.equal(
      typeof packageJson.scripts[scriptName],
      "string",
      `${scriptName} should exist in root package scripts`,
    );
  }
});

test("scenario catalog distinguishes read-only and mutating flows", () => {
  assert.equal(SCENARIOS.bootstrap.mutates, false);
  assert.equal(SCENARIOS["action:evaluate"].mutates, false);
  assert.equal(SCENARIOS.focus.mutates, false);
  assert.equal(SCENARIOS.health.mutates, false);
  assert.equal(SCENARIOS["introspect:dry"].mutates, false);
  assert.equal(SCENARIOS["introspection:followup"].mutates, false);
  assert.equal(SCENARIOS["decay:tune:dry"].mutates, false);
  assert.equal(SCENARIOS["sleep:dry"].mutates, false);
  assert.equal(SCENARIOS["decay:tune"].mutates, true);
  assert.equal(SCENARIOS.sleep.mutates, true);
  assert.equal(SCENARIOS["world-model"].mutates, true);
  assert.equal(SCENARIOS["bootstrap:repair"].mutates, true);
  assert.equal(SCENARIOS["beliefs:cycle"].mutates, true);
  assert.equal(SCENARIOS.nightly.mutates, true);
  assert.equal(SCENARIOS.log.mutates, true);
  assert.equal(SCENARIOS["policy:record"].mutates, true);
  assert.deepEqual(SCENARIOS.nightly.steps, [
    { script: "scripts/deus-nightly.js" },
  ]);
});

test("scenario catalog renders the official npm discovery surface", () => {
  const catalog = renderScenarioCatalog();

  assert.match(catalog, /Official DEUS npm scenarios:/);
  assert.match(catalog, /bootstrap \[read-only\]/);
  assert.match(catalog, /action:evaluate \[read-only\]/);
  assert.match(catalog, /focus \[read-only\]/);
  assert.match(catalog, /health \[read-only\]/);
  assert.match(catalog, /sleep:dry \[read-only\]/);
  assert.match(catalog, /introspection:followup \[read-only\]/);
  assert.match(catalog, /decay:tune:dry \[read-only\]/);
  assert.match(catalog, /world-model \[mutating\]/);
  assert.match(catalog, /decay:tune \[mutating\]/);
  assert.match(catalog, /sleep \[mutating\]/);
  assert.match(catalog, /nightly \[mutating\]/);
  assert.match(catalog, /log \[mutating\]/);
  assert.match(catalog, /policy:record \[mutating\]/);
  assert.match(catalog, /npm run deus:scenarios/);
  assert.match(catalog, /npm run deus:focus/);
  assert.match(catalog, /npm run deus:action:evaluate/);
  assert.match(catalog, /npm run deus:sleep:dry/);
  assert.match(catalog, /npm run deus:introspection:followup -- --prompt/);
  assert.match(catalog, /npm run deus:decay:tune:dry/);
  assert.match(catalog, /npm run deus:sleep/);
  assert.match(catalog, /npm run deus:nightly/);
  assert.match(catalog, /npm run deus:decay:tune/);
  assert.match(catalog, /npm run deus:policy:record/);
});
