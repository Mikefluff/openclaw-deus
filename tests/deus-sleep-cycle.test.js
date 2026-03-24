const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  createDeusWorkspaceFixtureSync,
} = require("./helpers/deus-workspace-fixture");
const {
  runDrySleepCycle,
  runSleepCycle,
} = require("../src/deus/deus-sleep-cycle");
const {
  SLEEP_INTROSPECTION_STAGE_NAMES,
} = require("../src/introspection/introspection-pipeline");
const {
  BACKGROUND_MUTATION_AUDIT_COMPONENT,
} = require("../src/policy/deus-background-mutation-policy");
const { readDeusOpsLogEntries } = require("../src/deus/deus-ops-log");
const {
  recordActionEvaluation,
} = require("../src/policy/deus-policy-feedback");
const {
  getWorkspaceDateContext,
  shiftWorkspaceDayKey,
} = require("../src/workspace/workspace-date-context");

function writeFile(workspaceRoot, relativePath, content) {
  const fullPath = path.join(workspaceRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

test("dry-run sleep cycle builds bounded reflection previews when the planner allows sleep reflection", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  const { today } = getWorkspaceDateContext();
  const yesterday = shiftWorkspaceDayKey(new Date(), -1);
  const twoDaysAgo = shiftWorkspaceDayKey(new Date(), -2);
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(
    workspaceRoot,
    "STATUS.md",
    "# STATUS.md\n\n## Current state\n- mode: idle\n- active_project: deus\n- status: idle\n- follow_through_required: no\n\n## Open work block\n- goal: bounded sleep reflection\n- next_step: review nightly signals\n",
  );
  writeFile(
    workspaceRoot,
    `memory/${twoDaysAgo}.md`,
    `# ${twoDaysAgo}\n\nCloudflare deploy touched dokploy, dns, and shared_workspace.\n`,
  );
  writeFile(
    workspaceRoot,
    `memory/${yesterday}.md`,
    `# ${yesterday}\n\nAnother deploy round touched cloudflare and dokploy again.\n`,
  );
  writeFile(
    workspaceRoot,
    `memory/${today}.md`,
    `# ${today}\n\nInfrastructure deploy work stayed active around cloudflare and shared_workspace.\n`,
  );

  recordActionEvaluation(
    {
      intent: {
        goal: "Send operator update",
        action_type: "external_message",
        target: "operator",
      },
      decision: "blocked",
      recommendedMode: "blocked",
      ripeness: { score: 0.4, class: "blocked" },
      cost: { band: "medium", total: 0.44 },
      blockers: ["missing_human_confirmation"],
      missingPreconditions: [],
    },
    {
      workspaceRoot,
      timestamp: `${yesterday}T09:00:00.000Z`,
      echo: false,
    },
  );
  recordActionEvaluation(
    {
      intent: {
        goal: "Send operator update",
        action_type: "external_message",
        target: "operator",
      },
      decision: "blocked",
      recommendedMode: "blocked",
      ripeness: { score: 0.39, class: "blocked" },
      cost: { band: "medium", total: 0.43 },
      blockers: ["missing_human_confirmation"],
      missingPreconditions: [],
    },
    {
      workspaceRoot,
      timestamp: `${today}T09:00:00.000Z`,
      echo: false,
    },
  );

  const pendingBeliefsPath = path.join(
    workspaceRoot,
    "review",
    "pending-beliefs.md",
  );
  const openTensionsPath = path.join(
    workspaceRoot,
    "review",
    "open-tensions.md",
  );
  assert.equal(fs.existsSync(pendingBeliefsPath), false);
  assert.equal(fs.existsSync(openTensionsPath), false);

  const result = runDrySleepCycle({
    workspaceRoot,
    now: "2026-03-21T04:40:00.000Z",
  });

  assert.equal(result.dryRun, true);
  assert.equal(result.status, "ready");
  assert.equal(result.planner.decision, "sleep_reflection");
  assert.equal(result.previews.structuralPatterns.length >= 1, true);
  assert.equal(result.previews.policyPatterns.length >= 1, true);
  assert.equal(result.previews.introspection.profile, "sleep");
  assert.deepEqual(
    result.previews.introspection.executedStages,
    SLEEP_INTROSPECTION_STAGE_NAMES,
  );
  assert.equal(result.previews.introspection.pipelineStatus, "ok");
  assert.equal(fs.existsSync(pendingBeliefsPath), false);
  assert.equal(fs.existsSync(openTensionsPath), false);
});

test("dry-run sleep cycle reports skipped state without mutating canonical artifacts outside the nightly window", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  const { today } = getWorkspaceDateContext();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(
    workspaceRoot,
    "STATUS.md",
    "# STATUS.md\n\n## Current state\n- mode: idle\n- active_project: deus\n- status: waiting\n- waiting_for: human input\n- follow_through_required: no\n\n## Open work block\n- goal: hold state\n- next_step: wait for human input\n",
  );
  writeFile(
    workspaceRoot,
    `memory/${today}.md`,
    `# ${today}\n\nQuiet operational day.\n`,
  );

  const memoryPath = path.join(workspaceRoot, "memory", `${today}.md`);
  const beforeMemory = fs.readFileSync(memoryPath, "utf8");

  const result = runDrySleepCycle({
    workspaceRoot,
    now: "2026-03-21T23:30:00.000Z",
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.planner.decision, "wait");
  assert.equal(result.previews.introspection, null);
  assert.equal(fs.readFileSync(memoryPath, "utf8"), beforeMemory);
});

test("mutating sleep cycle writes bounded artifacts without touching identity or durable beliefs", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  const { today } = getWorkspaceDateContext();
  const yesterday = shiftWorkspaceDayKey(new Date(), -1);
  const twoDaysAgo = shiftWorkspaceDayKey(new Date(), -2);
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(
    workspaceRoot,
    "STATUS.md",
    "# STATUS.md\n\n## Current state\n- mode: idle\n- active_project: deus\n- status: idle\n- follow_through_required: no\n\n## Open work block\n- goal: bounded sleep reflection\n- next_step: consolidate nightly signals\n",
  );
  writeFile(
    workspaceRoot,
    "docs/AXIOMS_AND_AGENCY.md",
    "# AXIOMS\n\n- identity invariant\n",
  );
  writeFile(
    workspaceRoot,
    `memory/${twoDaysAgo}.md`,
    `# ${twoDaysAgo}\n\nCloudflare deploy touched dokploy, dns, and shared_workspace.\n`,
  );
  writeFile(
    workspaceRoot,
    `memory/${yesterday}.md`,
    `# ${yesterday}\n\nAnother deploy round touched cloudflare and dokploy again.\n`,
  );
  writeFile(
    workspaceRoot,
    `memory/${today}.md`,
    `# ${today}\n\nInfrastructure deploy work stayed active around cloudflare and shared_workspace.\n`,
  );

  const beliefsPath = path.join(workspaceRoot, "beliefs", "core.jsonl");
  const deusPath = path.join(workspaceRoot, "DEUS.md");
  const axiomsPath = path.join(workspaceRoot, "docs", "AXIOMS_AND_AGENCY.md");
  const beforeBeliefs = fs.readFileSync(beliefsPath, "utf8");
  const beforeDeus = fs.readFileSync(deusPath, "utf8");
  const beforeAxioms = fs.readFileSync(axiomsPath, "utf8");

  const result = runSleepCycle({
    workspaceRoot,
    now: "2026-03-21T04:40:00.000Z",
  });

  assert.equal(result.dryRun, false);
  assert.equal(result.status, "ready");
  assert.equal(result.mutations.ran, true);
  assert.equal(result.mutations.introspection.profile, "sleep");
  assert.deepEqual(
    result.mutations.introspection.executedStages,
    SLEEP_INTROSPECTION_STAGE_NAMES,
  );
  assert.equal(
    fs.existsSync(path.join(workspaceRoot, "review", "pending-beliefs.md")),
    true,
  );
  assert.equal(
    fs.existsSync(
      path.join(
        workspaceRoot,
        "docs",
        "introspection",
        `introspection-${today}.md`,
      ),
    ),
    true,
  );
  assert.match(
    fs.readFileSync(path.join(workspaceRoot, "memory", `${today}.md`), "utf8"),
    /Nightly consolidation:/,
  );
  assert.equal(fs.readFileSync(beliefsPath, "utf8"), beforeBeliefs);
  assert.equal(fs.readFileSync(deusPath, "utf8"), beforeDeus);
  assert.equal(fs.readFileSync(axiomsPath, "utf8"), beforeAxioms);
});

test("mutating sleep cycle only appends audit logs when planner state is not eligible", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  const { today } = getWorkspaceDateContext();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(
    workspaceRoot,
    "STATUS.md",
    "# STATUS.md\n\n## Current state\n- mode: idle\n- active_project: deus\n- status: waiting\n- waiting_for: human input\n- follow_through_required: no\n\n## Open work block\n- goal: hold state\n- next_step: wait for human input\n",
  );
  writeFile(
    workspaceRoot,
    `memory/${today}.md`,
    `# ${today}\n\nQuiet operational day.\n`,
  );
  writeFile(
    workspaceRoot,
    "docs/AXIOMS_AND_AGENCY.md",
    "# AXIOMS\n\n- identity invariant\n",
  );

  const memoryPath = path.join(workspaceRoot, "memory", `${today}.md`);
  const beliefsPath = path.join(workspaceRoot, "beliefs", "core.jsonl");
  const beforeMemory = fs.readFileSync(memoryPath, "utf8");
  const beforeBeliefs = fs.readFileSync(beliefsPath, "utf8");

  const result = runSleepCycle({
    workspaceRoot,
    now: "2026-03-21T23:30:00.000Z",
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.mutations.ran, false);
  assert.equal(
    fs.existsSync(path.join(workspaceRoot, "review", "pending-beliefs.md")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(workspaceRoot, "docs", "introspection")),
    false,
  );
  assert.equal(fs.readFileSync(memoryPath, "utf8"), beforeMemory);
  assert.equal(fs.readFileSync(beliefsPath, "utf8"), beforeBeliefs);
  assert.equal(
    fs.existsSync(
      path.join(
        workspaceRoot,
        ".tmp",
        "diagnostics",
        "deus",
        "ops",
        "sleep-cycle.jsonl",
      ),
    ),
    true,
  );
});

test("mutating sleep cycle blocks before running when a planned target violates the background policy", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  writeFile(
    workspaceRoot,
    "STATUS.md",
    "# STATUS.md\n\n## Current state\n- mode: idle\n- active_project: deus\n- status: idle\n- follow_through_required: no\n\n## Open work block\n- goal: bounded sleep reflection\n- next_step: consolidate nightly signals\n",
  );

  let consolidationCalls = 0;
  let introspectionCalls = 0;

  assert.throws(
    () =>
      runSleepCycle({
        workspaceRoot,
        now: "2026-03-21T04:40:00.000Z",
        plannedTargets: [path.join(workspaceRoot, "DEUS.md")],
        runNightlyMemoryConsolidation: () => {
          consolidationCalls += 1;
          return {};
        },
        runIntrospection: () => {
          introspectionCalls += 1;
          return { summary: {} };
        },
      }),
    (error) => {
      assert.equal(error.code, "E_BACKGROUND_MUTATION_FORBIDDEN");
      return true;
    },
  );

  assert.equal(consolidationCalls, 0);
  assert.equal(introspectionCalls, 0);
  const [auditEntry] = readDeusOpsLogEntries(
    BACKGROUND_MUTATION_AUDIT_COMPONENT,
    {
      workspaceRoot,
    },
  );
  assert.equal(auditEntry.event, "background_mutation_blocked");
  assert.equal(auditEntry.details.relativePath, "DEUS.md");
});
