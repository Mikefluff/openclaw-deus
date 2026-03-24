const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { main } = require("../src/beliefs/belief-contradictions");

function writeFile(workspaceRoot, relativePath, content) {
  const fullPath = path.join(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

test("belief contradictions uses the provided workspace root instead of the repository root", () => {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "belief-contradictions-"),
  );

  writeFile(workspaceRoot, "AGENTS.md", "# AGENTS\n");
  writeFile(
    workspaceRoot,
    "beliefs/core.jsonl",
    [
      JSON.stringify({
        belief_id: "B1",
        content: "Я люблю огурцы",
        confidence: 0.9,
        source_type: "inference",
        timestamp_created: "2026-03-01T00:00:00.000Z",
        timestamp_updated: "2026-03-01T00:00:00.000Z",
        context_scope: "communication",
        status: "active",
        drift_history: [],
      }),
      JSON.stringify({
        belief_id: "B2",
        content: "Я не люблю огурцы",
        confidence: 0.85,
        source_type: "inference",
        timestamp_created: "2026-03-01T00:00:00.000Z",
        timestamp_updated: "2026-03-01T00:00:00.000Z",
        context_scope: "communication",
        status: "active",
        drift_history: [],
      }),
    ].join("\n") + "\n",
  );

  const result = main({ workspaceRoot });
  const beliefs = fs
    .readFileSync(path.join(workspaceRoot, "beliefs", "core.jsonl"), "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  fs.rmSync(workspaceRoot, { recursive: true, force: true });

  assert.equal(result.contradictions_found, 1);
  assert.equal(result.high_severity, 1);
  assert.equal(
    beliefs.every((belief) => belief.status === "review_needed"),
    true,
  );
  assert.equal(
    beliefs.every((belief) =>
      belief.drift_history.some(
        (entry) => entry.reason === "contradiction_detected",
      ),
    ),
    true,
  );
});
