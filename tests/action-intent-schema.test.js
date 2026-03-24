const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeActionIntent,
  normalizeActionType,
} = require("../src/policy/action-intent-schema");

test("normalizeActionType resolves aliases to canonical advisory action types", () => {
  assert.equal(normalizeActionType("message"), "external_message");
  assert.equal(normalizeActionType("write"), "write_internal");
  assert.equal(normalizeActionType("repository mutation"), "repo_mutation");
});

test("normalizeActionIntent folds camelCase fields and profile defaults into one shape", () => {
  const intent = normalizeActionIntent({
    goal: "Deploy example project",
    actionType: "deploy",
    target: "projects/example-project",
    confirmedByHuman: "yes",
    dependencies: "cloudflare",
    contextSources: ["STATUS.md", "PROJECTS.md"],
  });

  assert.equal(intent.action_type, "deploy");
  assert.equal(intent.external, true);
  assert.equal(intent.repo_mutation, true);
  assert.equal(intent.requires_human_confirmation, true);
  assert.equal(intent.confirmed_by_human, true);
  assert.deepEqual(intent.dependencies, ["cloudflare"]);
  assert.deepEqual(intent.context_sources, ["STATUS.md", "PROJECTS.md"]);
  assert.equal(intent.scope, "external");
  assert.equal(intent.high_impact, true);
});
