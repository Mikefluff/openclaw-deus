const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  BACKGROUND_MUTATION_POLICY,
  BACKGROUND_MUTATION_AUDIT_COMPONENT,
  assertBackgroundMutationTarget,
  evaluateBackgroundMutationTarget,
  resolveBackgroundMutationAuditLogPath,
} = require("../src/policy/deus-background-mutation-policy");
const { readDeusOpsLogEntries } = require("../src/deus/deus-ops-log");

function createWorkspace() {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "deus-background-policy-"),
  );
  fs.writeFileSync(path.join(workspaceRoot, "AGENTS.md"), "# AGENTS\n");
  return workspaceRoot;
}

test("background mutation policy whitelists bounded runtime surfaces", (t) => {
  const workspaceRoot = createWorkspace();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  const allowedTargets = [
    ".tmp/diagnostics/deus/ops/sleep-cycle.jsonl",
    "logs/2026-03-22.jsonl",
    "memory/2026-03-22.md",
    "review/pending-beliefs.md",
    "docs/introspection/introspection-2026-03-22.md",
    "docs/introspection/world-model.latest.json",
  ];

  for (const target of allowedTargets) {
    const evaluation = evaluateBackgroundMutationTarget(target, {
      workspaceRoot,
      origin: "sleep",
    });
    assert.equal(evaluation.allowed, true, target);
    assert.equal(
      BACKGROUND_MUTATION_POLICY.allowedPrefixes.includes(
        evaluation.matchedPrefix,
      ),
      true,
    );
  }
});

test("background mutation policy hard-blocks identity and durable belief surfaces", (t) => {
  const workspaceRoot = createWorkspace();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  for (const target of BACKGROUND_MUTATION_POLICY.forbiddenPaths) {
    const evaluation = evaluateBackgroundMutationTarget(target, {
      workspaceRoot,
      origin: "sleep",
    });
    assert.equal(evaluation.allowed, false, target);
    assert.equal(evaluation.reason, "forbidden_identity_or_belief_surface");
  }
});

test("background mutation assertion throws a typed boundary error", (t) => {
  const workspaceRoot = createWorkspace();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  assert.throws(
    () =>
      assertBackgroundMutationTarget(
        path.join(workspaceRoot, "beliefs", "core.jsonl"),
        {
          workspaceRoot,
          origin: "sleep",
        },
      ),
    (error) => {
      assert.equal(error.code, "E_BACKGROUND_MUTATION_FORBIDDEN");
      assert.equal(
        error.evaluation.reason,
        "forbidden_identity_or_belief_surface",
      );
      return true;
    },
  );
});

test("blocked background mutations are audited on the diagnostics surface", (t) => {
  const workspaceRoot = createWorkspace();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  assert.throws(() =>
    assertBackgroundMutationTarget(path.join(workspaceRoot, "DEUS.md"), {
      workspaceRoot,
      origin: "sleep",
    }),
  );

  const logPath = resolveBackgroundMutationAuditLogPath({ workspaceRoot });
  assert.equal(fs.existsSync(logPath), true);
  const [entry] = readDeusOpsLogEntries(BACKGROUND_MUTATION_AUDIT_COMPONENT, {
    workspaceRoot,
  });
  assert.equal(entry.event, "background_mutation_blocked");
  assert.equal(entry.details.origin, "sleep");
  assert.equal(entry.details.relativePath, "DEUS.md");
  assert.equal(entry.details.reason, "forbidden_identity_or_belief_surface");
});
