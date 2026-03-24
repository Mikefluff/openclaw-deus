const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEUS_BOOTSTRAP_SEQUENCE,
  DEFAULT_BOOTSTRAP_ENTRYPOINTS,
} = require("../src/deus/deus-bootstrap-contract");

test("canonical DEUS bootstrap sequence is ordered and explicit", () => {
  assert.deepEqual(
    DEUS_BOOTSTRAP_SEQUENCE.map((entry) => entry.path),
    [
      "AGENTS.md",
      "SOUL.md",
      "IDENTITY.md",
      "USER.md",
      "DEUS.md",
      "beliefs/core.jsonl",
      "memory/YYYY-MM-DD.md",
    ],
  );
});

test("entrypoint drift detection monitors the static bootstrap files from the canonical sequence", () => {
  assert.deepEqual(DEFAULT_BOOTSTRAP_ENTRYPOINTS, [
    "AGENTS.md",
    "SOUL.md",
    "IDENTITY.md",
    "USER.md",
    "DEUS.md",
    "beliefs/core.jsonl",
  ]);
});
