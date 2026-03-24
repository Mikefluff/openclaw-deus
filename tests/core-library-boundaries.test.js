const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  BOUNDED_SRC_DIRECTORIES,
  resolveBoundedSrcDirectory,
  resolveBoundedSrcPath,
} = require("../src/runtime/bounded-src-topology");

const REPO_ROOT = path.join(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf8");
}

function readBoundedImplementation(rootFileName) {
  const target = resolveBoundedSrcPath(rootFileName);
  assert.ok(target, `expected a bounded target for ${rootFileName}`);
  return read(`src/${target}`);
}

test("bounded src topology contract exposes the target directories", () => {
  assert.deepEqual(BOUNDED_SRC_DIRECTORIES, [
    "beliefs",
    "deus",
    "introspection",
    "memory",
    "openclaw",
    "policy",
    "runtime",
    "workspace",
    "world-model",
  ]);

  for (const directory of BOUNDED_SRC_DIRECTORIES) {
    assert.equal(
      fs.existsSync(path.join(REPO_ROOT, "src", directory)),
      true,
      `expected src/${directory} to exist`,
    );
  }
});

test("bounded src topology contract resolves representative families", () => {
  assert.equal(resolveBoundedSrcDirectory("belief-policy.js"), "beliefs");
  assert.equal(resolveBoundedSrcDirectory("daily-memory-builder.js"), "memory");
  assert.equal(resolveBoundedSrcDirectory("deus-health.js"), "deus");
  assert.equal(
    resolveBoundedSrcDirectory("introspection-pipeline.js"),
    "introspection",
  );
  assert.equal(resolveBoundedSrcDirectory("action-cost-model.js"), "policy");
  assert.equal(resolveBoundedSrcDirectory("runtime-diagnostics.js"), "runtime");
  assert.equal(resolveBoundedSrcDirectory("workspace-roots.js"), "workspace");
  assert.equal(
    resolveBoundedSrcDirectory("openclaw-integration.js"),
    "openclaw",
  );
  assert.equal(
    resolveBoundedSrcDirectory("world-model-builder.js"),
    "world-model",
  );
});

test("bounded src topology contract resolves canonical bounded paths", () => {
  assert.equal(
    resolveBoundedSrcPath("belief-policy.js"),
    "beliefs/belief-policy.js",
  );
  assert.equal(
    resolveBoundedSrcPath("runtime-diagnostics.js"),
    "runtime/runtime-diagnostics.js",
  );
  assert.equal(resolveBoundedSrcPath("unknown.js"), null);
});

test("core runtime modules no longer import aggregate-logs from scripts", () => {
  const introspectionPipeline = readBoundedImplementation(
    "introspection-pipeline.js",
  );
  const introspectionRuntimeState = readBoundedImplementation(
    "introspection-runtime-state.js",
  );

  assert.doesNotMatch(
    introspectionPipeline,
    /require\(["']\.\.\/scripts\/aggregate-logs["']\)/,
  );
  assert.doesNotMatch(
    introspectionRuntimeState,
    /require\(["']\.\.\/scripts\/aggregate-logs["']\)/,
  );
  assert.match(
    introspectionRuntimeState,
    /require\(["']\.\.\/memory\/daily-memory-aggregation["']\)/,
  );
});

test("core runtime modules no longer import OpenClaw integration from scripts", () => {
  const introspectionPipeline = readBoundedImplementation(
    "introspection-pipeline.js",
  );
  const introspectionPipelineDefaults = readBoundedImplementation(
    "introspection-pipeline-defaults.js",
  );
  const deusHealth = readBoundedImplementation("deus-health.js");
  const deusSleepCycle = readBoundedImplementation("deus-sleep-cycle.js");
  const sleepCycleIntrospection = readBoundedImplementation(
    "deus-sleep-cycle-introspection.js",
  );

  for (const source of [
    introspectionPipeline,
    deusHealth,
    deusSleepCycle,
    sleepCycleIntrospection,
  ]) {
    assert.doesNotMatch(
      source,
      /require\(["']\.\.\/scripts\/openclaw-integration["']\)/,
    );
  }

  assert.match(
    introspectionPipeline,
    /require\(["']\.\/introspection-pipeline-defaults["']\)/,
  );
  assert.match(
    introspectionPipelineDefaults,
    /require\(["']\.\.\/openclaw\/openclaw-integration["']\)/,
  );
  assert.match(
    deusHealth,
    /require\(["']\.\.\/openclaw\/openclaw-integration["']\)/,
  );
  assert.match(
    sleepCycleIntrospection,
    /require\(["']\.\.\/openclaw\/openclaw-integration["']\)/,
  );
});

test("core runtime modules no longer import belief maintenance from scripts", () => {
  const introspectionPipeline = readBoundedImplementation(
    "introspection-pipeline.js",
  );
  const introspectionPipelineDefaults = readBoundedImplementation(
    "introspection-pipeline-defaults.js",
  );

  assert.doesNotMatch(
    introspectionPipelineDefaults,
    /require\(["']\.\.\/scripts\/belief-(extractor|contradictions|decay)["']\)/,
  );
  assert.match(
    introspectionPipelineDefaults,
    /require\(["']\.\.\/beliefs\/belief-extractor["']\)/,
  );
  assert.match(
    introspectionPipelineDefaults,
    /require\(["']\.\.\/beliefs\/belief-contradictions["']\)/,
  );
  assert.match(
    introspectionPipelineDefaults,
    /require\(["']\.\.\/beliefs\/belief-decay["']\)/,
  );
  assert.match(
    introspectionPipeline,
    /require\(["']\.\/introspection-stage-runner["']\)/,
  );
  assert.match(
    introspectionPipeline,
    /require\(["']\.\/introspection-pipeline-defaults["']\)/,
  );
});

test("deus introspection followup is a facade over signal, storage, and prompt helpers", () => {
  const followup = readBoundedImplementation("deus-introspection-followup.js");

  assert.doesNotMatch(followup, /require\(["']fs["']\)/);
  assert.doesNotMatch(followup, /require\(["']path["']\)/);
  assert.match(
    followup,
    /require\(["']\.\/deus-introspection-followup-packet["']\)/,
  );
  assert.match(
    followup,
    /require\(["']\.\/deus-introspection-followup-signals["']\)/,
  );
  assert.match(
    followup,
    /require\(["']\.\/deus-introspection-followup-storage["']\)/,
  );
  assert.match(
    followup,
    /require\(["']\.\/deus-introspection-followup-prompt["']\)/,
  );
});

test("deus policy feedback is a facade over events, memory, and analysis helpers", () => {
  const policyFeedback = readBoundedImplementation("deus-policy-feedback.js");

  assert.doesNotMatch(
    policyFeedback,
    /require\(["']\.\/action-policy-helpers["']\)/,
  );
  assert.doesNotMatch(
    policyFeedback,
    /require\(["']\.\/deus-activity-log["']\)/,
  );
  assert.match(
    policyFeedback,
    /require\(["']\.\/deus-policy-feedback-events["']\)/,
  );
  assert.match(
    policyFeedback,
    /require\(["']\.\/deus-policy-feedback-memory["']\)/,
  );
  assert.match(
    policyFeedback,
    /require\(["']\.\/deus-policy-feedback-analysis["']\)/,
  );
});

test("deus policy feedback events is a facade over constants, normalize, friction, context, and render helpers", () => {
  const feedbackEvents = readBoundedImplementation(
    "deus-policy-feedback-events.js",
  );

  assert.match(
    feedbackEvents,
    /require\(["']\.\/deus-policy-feedback-constants["']\)/,
  );
  assert.match(
    feedbackEvents,
    /require\(["']\.\/deus-policy-feedback-normalize["']\)/,
  );
  assert.match(
    feedbackEvents,
    /require\(["']\.\/deus-policy-feedback-friction["']\)/,
  );
  assert.match(
    feedbackEvents,
    /require\(["']\.\/deus-policy-feedback-context["']\)/,
  );
  assert.match(
    feedbackEvents,
    /require\(["']\.\/deus-policy-feedback-render["']\)/,
  );
  assert.doesNotMatch(
    feedbackEvents,
    /function buildPolicyFeedbackContext|function buildPolicyFeedbackLogEntry|function buildPolicyFrictionTokens|function normalizePolicyEventType/,
  );
});

test("belief extractor routes state and candidate logic through helper modules", () => {
  const beliefExtractor = readBoundedImplementation("belief-extractor.js");

  assert.match(
    beliefExtractor,
    /require\(["']\.\/belief-extractor-state["']\)/,
  );
  assert.match(
    beliefExtractor,
    /require\(["']\.\/belief-extractor-candidates["']\)/,
  );
});

test("belief extractor candidates is a facade over assembly, parser, provenance, and matching helpers", () => {
  const candidates = readBoundedImplementation(
    "belief-extractor-candidates.js",
  );

  assert.match(
    candidates,
    /require\(["']\.\/belief-extractor-candidate-assembly["']\)/,
  );
  assert.match(
    candidates,
    /require\(["']\.\/belief-extractor-interaction-parser["']\)/,
  );
  assert.match(
    candidates,
    /require\(["']\.\/belief-extractor-provenance["']\)/,
  );
  assert.match(candidates, /require\(["']\.\/belief-extractor-matching["']\)/);
  assert.doesNotMatch(
    candidates,
    /function extractCandidatesFromMemoryContent|function parseInteractionMemoryEntry|function generateBeliefId/,
  );
});

test("belief promotion review is a facade over beliefs, queue, matching, apply, and runner helpers", () => {
  const promotionReview = readBoundedImplementation(
    "belief-promotion-review.js",
  );

  assert.match(
    promotionReview,
    /require\(["']\.\/belief-promotion-review-beliefs["']\)/,
  );
  assert.match(
    promotionReview,
    /require\(["']\.\/belief-promotion-review-queue["']\)/,
  );
  assert.match(
    promotionReview,
    /require\(["']\.\/belief-promotion-review-matching["']\)/,
  );
  assert.match(
    promotionReview,
    /require\(["']\.\/belief-promotion-review-apply["']\)/,
  );
  assert.match(
    promotionReview,
    /require\(["']\.\/belief-promotion-review-runner["']\)/,
  );
  assert.doesNotMatch(
    promotionReview,
    /function runBeliefPromotionReview|function loadBeliefs|function updateReviewFile|function similarity/,
  );
});

test("review queue schema is a facade over base, merge, and markdown helpers", () => {
  const reviewQueueSchema = readBoundedImplementation("review-queue-schema.js");

  assert.match(reviewQueueSchema, /require\(["']\.\/review-queue-base["']\)/);
  assert.match(reviewQueueSchema, /require\(["']\.\/review-queue-merge["']\)/);
  assert.match(
    reviewQueueSchema,
    /require\(["']\.\/review-queue-markdown["']\)/,
  );
});

test("review queue base is a facade over content, normalize, and identity helpers", () => {
  const reviewQueueBase = readBoundedImplementation("review-queue-base.js");

  assert.match(reviewQueueBase, /require\(["']\.\/review-queue-content["']\)/);
  assert.match(
    reviewQueueBase,
    /require\(["']\.\/review-queue-normalize["']\)/,
  );
  assert.match(reviewQueueBase, /require\(["']\.\/review-queue-identity["']\)/);
  assert.doesNotMatch(
    reviewQueueBase,
    /REVIEW_QUEUE_TITLE|function normalizePendingBeliefReviewEntry|function slugReviewQueueLabel/,
  );
});

test("introspection report content is a facade over render, data, and posture helpers", () => {
  const reportContent = readBoundedImplementation(
    "introspection-report-content.js",
  );

  assert.match(
    reportContent,
    /require\(["']\.\/introspection-report-render["']\)/,
  );
  assert.match(
    reportContent,
    /require\(["']\.\/introspection-report-data["']\)/,
  );
  assert.match(
    reportContent,
    /require\(["']\.\/introspection-report-posture["']\)/,
  );
  assert.doesNotMatch(
    reportContent,
    /INTROSPECTION_POLICY|function renderIntrospectionReport|function buildIntrospectionReportData/,
  );
});

test("deus policy surface is a facade over intent, summary, and runtime helpers", () => {
  const policySurface = readBoundedImplementation("deus-policy-surface.js");

  assert.match(
    policySurface,
    /require\(["']\.\/deus-policy-surface-intent["']\)/,
  );
  assert.match(
    policySurface,
    /require\(["']\.\/deus-policy-surface-summary["']\)/,
  );
  assert.match(
    policySurface,
    /require\(["']\.\/deus-policy-surface-runtime["']\)/,
  );
  assert.doesNotMatch(
    policySurface,
    /buildWorldModel|readLatestWorldModel|recordWorldModelRefresh|function getPolicyRuntimeSurface/,
  );
});

test("deus nightly orchestrator is a facade over stage summary and runner helpers", () => {
  const nightlyOrchestrator = readBoundedImplementation(
    "deus-nightly-orchestrator.js",
  );

  assert.match(
    nightlyOrchestrator,
    /require\(["']\.\/deus-nightly-stage-summary["']\)/,
  );
  assert.match(
    nightlyOrchestrator,
    /require\(["']\.\/deus-nightly-runner["']\)/,
  );
  assert.doesNotMatch(
    nightlyOrchestrator,
    /runSleepCycle|runIntrospectionPipeline|runBeliefPromotionReview|function runDeusNightly/,
  );
});

test("deus sleep cycle is a facade over target, state, and introspection helpers", () => {
  const sleepCycle = readBoundedImplementation("deus-sleep-cycle.js");

  assert.match(sleepCycle, /require\(["']\.\/deus-sleep-cycle-targets["']\)/);
  assert.match(sleepCycle, /require\(["']\.\/deus-sleep-cycle-state["']\)/);
  assert.match(
    sleepCycle,
    /require\(["']\.\/deus-sleep-cycle-introspection["']\)/,
  );
});

test("deus nightly orchestrator composes runtime stages from src modules only", () => {
  const nightly = readBoundedImplementation("deus-nightly-orchestrator.js");
  const nightlyRunner = readBoundedImplementation("deus-nightly-runner.js");

  assert.doesNotMatch(
    nightly,
    /require\(["']\.\.\/scripts\/(aggregate-logs|deus-sleep-cycle|introspection|belief-promotion-review|deus-decay-tuning)["']\)/,
  );
  assert.match(nightlyRunner, /require\(["']\.\/deus-sleep-cycle["']\)/);
  assert.match(
    nightlyRunner,
    /require\(["']\.\.\/introspection\/introspection-pipeline["']\)/,
  );
  assert.match(
    nightlyRunner,
    /require\(["']\.\.\/introspection\/deus-introspection-followup["']\)/,
  );
  assert.match(
    nightlyRunner,
    /require\(["']\.\.\/policy\/deus-decay-tuning["']\)/,
  );
  assert.match(
    nightlyRunner,
    /require\(["']\.\.\/beliefs\/belief-promotion-review["']\)/,
  );
  assert.match(
    readBoundedImplementation("deus-nightly-stage-summary.js"),
    /require\(["']\.\.\/memory\/daily-memory-aggregation["']\)/,
  );
});

test("belief policy is a facade over focused threshold and decay helper modules", () => {
  const beliefPolicy = readBoundedImplementation("belief-policy.js");

  assert.match(beliefPolicy, /require\(["']\.\/belief-policy-thresholds["']\)/);
  assert.match(
    beliefPolicy,
    /require\(["']\.\/belief-policy-decay-schema["']\)/,
  );
  assert.match(
    beliefPolicy,
    /require\(["']\.\/belief-policy-decay-profile["']\)/,
  );
  assert.doesNotMatch(
    beliefPolicy,
    /function (similarityExceedsThreshold|resolveBeliefDecayProfile|classifyIntrospectionPosture)\(/,
  );
});

test("ripeness estimator is a facade over focused factor, precondition, rationale, and runner helpers", () => {
  const ripenessEstimator = readBoundedImplementation("ripeness-estimator.js");

  assert.match(
    ripenessEstimator,
    /require\(["']\.\/ripeness-estimator-runner["']\)/,
  );
  assert.match(
    ripenessEstimator,
    /require\(["']\.\/ripeness-preconditions["']\)/,
  );
  assert.match(ripenessEstimator, /require\(["']\.\/ripeness-rationale["']\)/);
  assert.match(
    ripenessEstimator,
    /require\(["']\.\/ripeness-score-factors["']\)/,
  );
  assert.doesNotMatch(
    ripenessEstimator,
    /resolveDependencyStatus|normalizeActionIntent/,
  );
});

test("deus sleep planner is a facade over decision, readiness, runner, and timing helpers", () => {
  const sleepPlanner = readBoundedImplementation("deus-sleep-planner.js");

  assert.match(
    sleepPlanner,
    /require\(["']\.\/deus-sleep-planner-decision["']\)/,
  );
  assert.match(
    sleepPlanner,
    /require\(["']\.\/deus-sleep-planner-readiness["']\)/,
  );
  assert.match(
    sleepPlanner,
    /require\(["']\.\/deus-sleep-planner-runner["']\)/,
  );
  assert.match(
    sleepPlanner,
    /require\(["']\.\/deus-sleep-planner-timing["']\)/,
  );
  assert.doesNotMatch(sleepPlanner, /readStatusState|describeRuntimePosture/);
});

test("deus introspection followup signals is a facade over guardrail, normalize, action, and decision helpers", () => {
  const followupSignals = readBoundedImplementation(
    "deus-introspection-followup-signals.js",
  );

  assert.match(
    followupSignals,
    /require\(["']\.\/deus-introspection-followup-guardrails["']\)/,
  );
  assert.match(
    followupSignals,
    /require\(["']\.\/deus-introspection-followup-normalize["']\)/,
  );
  assert.match(
    followupSignals,
    /require\(["']\.\/deus-introspection-followup-actions["']\)/,
  );
  assert.match(
    followupSignals,
    /require\(["']\.\/deus-introspection-followup-decision["']\)/,
  );
  assert.doesNotMatch(
    followupSignals,
    /INTROSPECTION_POLICY|function buildRecommendedActions|function buildFollowupSignals/,
  );
});

test("deus dissensus schema is a facade over constants, ids, entry schema, and normalize helpers", () => {
  const dissensusSchema = readBoundedImplementation("deus-dissensus-schema.js");

  assert.match(
    dissensusSchema,
    /require\(["']\.\/deus-dissensus-constants["']\)/,
  );
  assert.match(dissensusSchema, /require\(["']\.\/deus-dissensus-ids["']\)/);
  assert.match(
    dissensusSchema,
    /require\(["']\.\/deus-dissensus-entry-schema["']\)/,
  );
  assert.match(
    dissensusSchema,
    /require\(["']\.\/deus-dissensus-normalize["']\)/,
  );
  assert.doesNotMatch(
    dissensusSchema,
    /createHash|function normalizeDissensusDecision/,
  );
});

test("deus dissensus runtime is a facade over case, event, override, and recorder helpers", () => {
  const dissensusRuntime = readBoundedImplementation(
    "deus-dissensus-runtime.js",
  );

  assert.match(
    dissensusRuntime,
    /require\(["']\.\/deus-dissensus-runtime-cases["']\)/,
  );
  assert.match(
    dissensusRuntime,
    /require\(["']\.\/deus-dissensus-runtime-events["']\)/,
  );
  assert.match(
    dissensusRuntime,
    /require\(["']\.\/deus-dissensus-runtime-overrides["']\)/,
  );
  assert.match(
    dissensusRuntime,
    /require\(["']\.\/deus-dissensus-runtime-recorder["']\)/,
  );
  assert.doesNotMatch(dissensusRuntime, /readFileSync|appendFileSync/);
});

test("deus dissensus engine is a facade over target, invariant, decision, and runner helpers", () => {
  const dissensusEngine = readBoundedImplementation("deus-dissensus-engine.js");

  assert.match(
    dissensusEngine,
    /require\(["']\.\/deus-dissensus-engine-targets["']\)/,
  );
  assert.match(
    dissensusEngine,
    /require\(["']\.\/deus-dissensus-engine-invariants["']\)/,
  );
  assert.match(
    dissensusEngine,
    /require\(["']\.\/deus-dissensus-engine-decisions["']\)/,
  );
  assert.match(
    dissensusEngine,
    /require\(["']\.\/deus-dissensus-engine-runner["']\)/,
  );
  assert.doesNotMatch(
    dissensusEngine,
    /IDENTITY_ROOT_PATTERNS|function evaluateDissensus|function classifyDissensusTarget/,
  );
});

test("deus state readers is a facade over projects, timeline, status, and review helpers", () => {
  const stateReaders = readBoundedImplementation("deus-state-readers.js");

  assert.match(
    stateReaders,
    /require\(["']\.\/deus-state-reader-projects["']\)/,
  );
  assert.match(stateReaders, /require\(["']\.\/deus-state-reader-review["']\)/);
  assert.match(stateReaders, /require\(["']\.\/deus-state-reader-status["']\)/);
  assert.match(
    stateReaders,
    /require\(["']\.\/deus-state-reader-timeline["']\)/,
  );
  assert.doesNotMatch(
    stateReaders,
    /resolveBeliefsPath|resolveMemoryDir|parseStatusFocusState|resolveIntrospectionSummaryPath|PROJECTS\.md/,
  );
});

test("workspace authority is a facade over constants, normalize, and rules helpers", () => {
  const workspaceAuthority = readBoundedImplementation(
    "workspace-authority.js",
  );

  assert.match(
    workspaceAuthority,
    /require\(["']\.\/workspace-authority-constants["']\)/,
  );
  assert.match(
    workspaceAuthority,
    /require\(["']\.\/workspace-authority-normalize["']\)/,
  );
  assert.match(
    workspaceAuthority,
    /require\(["']\.\/workspace-authority-rules["']\)/,
  );
  assert.doesNotMatch(
    workspaceAuthority,
    /const RULE_DEFINITIONS|function normalizeWorkspacePath|function isProjectDataPath/,
  );
});

test("workspace roots is a facade over detect, layout, and resolve helpers", () => {
  const workspaceRoots = readBoundedImplementation("workspace-roots.js");

  assert.match(workspaceRoots, /require\(["']\.\/workspace-roots-detect["']\)/);
  assert.match(workspaceRoots, /require\(["']\.\/workspace-roots-layout["']\)/);
  assert.match(
    workspaceRoots,
    /require\(["']\.\/workspace-roots-resolve["']\)/,
  );
  assert.doesNotMatch(
    workspaceRoots,
    /function detectCanonicalRoot|function resolveWorkspaceRoots|function defaultRuntimeRoot/,
  );
});

test("world model builder is a facade over repo-state and derivation helpers", () => {
  const worldModelBuilder = readBoundedImplementation("world-model-builder.js");

  assert.doesNotMatch(worldModelBuilder, /require\(["']child_process["']\)/);
  assert.match(
    worldModelBuilder,
    /require\(["']\.\/world-model-repo-state["']\)/,
  );
  assert.match(
    worldModelBuilder,
    /require\(["']\.\/world-model-derivations["']\)/,
  );
  assert.doesNotMatch(
    worldModelBuilder,
    /function (summarizeTrackedRepoState|deriveActiveRisks|calculateWorldModelConfidence)\(/,
  );
});

test("belief decay overrides is a facade over artifact, profile, and patch helpers", () => {
  const beliefDecayOverrides = readBoundedImplementation(
    "belief-decay-overrides.js",
  );

  assert.doesNotMatch(beliefDecayOverrides, /require\(["']fs["']\)/);
  assert.match(
    beliefDecayOverrides,
    /require\(["']\.\/belief-decay-override-artifact["']\)/,
  );
  assert.match(
    beliefDecayOverrides,
    /require\(["']\.\/belief-decay-override-profile["']\)/,
  );
  assert.match(
    beliefDecayOverrides,
    /require\(["']\.\/belief-decay-override-patch["']\)/,
  );
  assert.doesNotMatch(
    beliefDecayOverrides,
    /function (createEmptyOverrideArtifact|resolveRuntimeBeliefDecayProfile|applyBoundedDecayOverridePatch)\(/,
  );
});

test("belief decay is a facade over store, profile, transition, and runner helpers", () => {
  const beliefDecay = readBoundedImplementation("belief-decay.js");

  assert.match(beliefDecay, /require\(["']\.\/belief-decay-store["']\)/);
  assert.match(beliefDecay, /require\(["']\.\/belief-decay-profile["']\)/);
  assert.match(beliefDecay, /require\(["']\.\/belief-decay-transitions["']\)/);
  assert.match(beliefDecay, /require\(["']\.\/belief-decay-runner["']\)/);
  assert.doesNotMatch(
    beliefDecay,
    /resolveBeliefsPath|function applyDecay|function deriveLifecycleStatus|appendDeusOpsLog/,
  );
});

test("belief governance migration is a facade over directives, annotation, and repair helpers", () => {
  const governanceMigration = readBoundedImplementation(
    "belief-governance-migration.js",
  );

  assert.match(
    governanceMigration,
    /require\(["']\.\/belief-governance-directives["']\)/,
  );
  assert.match(
    governanceMigration,
    /require\(["']\.\/belief-governance-annotate["']\)/,
  );
  assert.match(
    governanceMigration,
    /require\(["']\.\/belief-governance-repair["']\)/,
  );
  assert.doesNotMatch(
    governanceMigration,
    /GOVERNANCE_DIRECTIVES|function annotateBeliefWithGovernanceProfile|function repairBeliefWithGovernanceDirective/,
  );
});

test("runtime surface paths is a facade over base, DEUS, project, and catalog helpers", () => {
  const runtimeSurfacePaths = readBoundedImplementation(
    "runtime-surface-paths.js",
  );

  assert.doesNotMatch(runtimeSurfacePaths, /require\(["']fs["']\)/);
  assert.doesNotMatch(runtimeSurfacePaths, /require\(["']path["']\)/);
  assert.match(
    runtimeSurfacePaths,
    /require\(["']\.\/runtime-surface-base["']\)/,
  );
  assert.match(
    runtimeSurfacePaths,
    /require\(["']\.\/runtime-surface-deus["']\)/,
  );
  assert.match(
    runtimeSurfacePaths,
    /require\(["']\.\/runtime-surface-projects["']\)/,
  );
  assert.match(
    runtimeSurfacePaths,
    /require\(["']\.\/runtime-surface-catalog["']\)/,
  );
  assert.doesNotMatch(
    runtimeSurfacePaths,
    /function (resolveRuntimeSurfacePath|resolveStatusPath|resolveProjectDataPath|listKnownRuntimeSurfacePaths)\(/,
  );
});

test("runtime surface DEUS paths are routed through bounded family helpers", () => {
  const deusSurface = readBoundedImplementation("runtime-surface-deus.js");

  assert.match(
    deusSurface,
    /require\(["']\.\/runtime-surface-deus-beliefs["']\)/,
  );
  assert.match(
    deusSurface,
    /require\(["']\.\/runtime-surface-deus-dissensus["']\)/,
  );
  assert.match(
    deusSurface,
    /require\(["']\.\/runtime-surface-deus-introspection["']\)/,
  );
  assert.match(
    deusSurface,
    /require\(["']\.\/runtime-surface-deus-memory["']\)/,
  );
  assert.match(deusSurface, /require\(["']\.\/runtime-surface-deus-ops["']\)/);
  assert.match(
    deusSurface,
    /require\(["']\.\/runtime-surface-deus-review["']\)/,
  );
  assert.doesNotMatch(
    deusSurface,
    /function (resolveBeliefsPath|resolveMemoryPath|resolveDissensusLogPath|resolveOpsRollupPath)\(/,
  );
});

test("deus nightly consolidation is a facade over paths, review, memory, and runner helpers", () => {
  const nightlyConsolidation = readBoundedImplementation(
    "deus-nightly-consolidation.js",
  );

  assert.doesNotMatch(nightlyConsolidation, /require\(["']fs["']\)/);
  assert.doesNotMatch(nightlyConsolidation, /require\(["']path["']\)/);
  assert.match(
    nightlyConsolidation,
    /require\(["']\.\/deus-nightly-consolidation-paths["']\)/,
  );
  assert.match(
    nightlyConsolidation,
    /require\(["']\.\/deus-nightly-consolidation-review["']\)/,
  );
  assert.match(
    nightlyConsolidation,
    /require\(["']\.\/deus-nightly-consolidation-memory["']\)/,
  );
  assert.match(
    nightlyConsolidation,
    /require\(["']\.\/deus-nightly-consolidation-runner["']\)/,
  );
  assert.doesNotMatch(
    nightlyConsolidation,
    /function (resolveNightlyPaths|appendPendingBeliefEntry|appendMemoryReflection|runNightlyMemoryConsolidation)\(/,
  );
});

test("deus memory file store is a facade over fallback, mutation, and validation helpers", () => {
  const memoryFileStore = readBoundedImplementation(
    "deus-memory-file-store.js",
  );

  assert.doesNotMatch(memoryFileStore, /require\(["']path["']\)/);
  assert.match(
    memoryFileStore,
    /require\(["']\.\/deus-memory-file-fallback["']\)/,
  );
  assert.match(
    memoryFileStore,
    /require\(["']\.\/deus-memory-file-mutation["']\)/,
  );
  assert.match(
    memoryFileStore,
    /require\(["']\.\/deus-memory-file-validation["']\)/,
  );
  assert.doesNotMatch(
    memoryFileStore,
    /require\(["']\.\/daily-memory-builder["']\)/,
  );
  assert.doesNotMatch(memoryFileStore, /require\(["']\.\/user-context["']\)/);
  assert.doesNotMatch(memoryFileStore, /function escapeRegExp\(/);
});

test("deus action policy is a facade over world-model, decision, summary, and runner helpers", () => {
  const actionPolicy = readBoundedImplementation("deus-action-policy.js");

  assert.doesNotMatch(
    actionPolicy,
    /require\(["']\.\/world-model-builder["']\)/,
  );
  assert.doesNotMatch(actionPolicy, /require\(["']\.\/action-cost-model["']\)/);
  assert.match(
    actionPolicy,
    /require\(["']\.\/deus-action-policy-runner["']\)/,
  );
  assert.match(
    actionPolicy,
    /require\(["']\.\/deus-action-policy-decision["']\)/,
  );
  assert.match(
    actionPolicy,
    /require\(["']\.\/deus-action-policy-summary["']\)/,
  );
  assert.match(
    actionPolicy,
    /require\(["']\.\/deus-action-policy-world-model["']\)/,
  );
  assert.doesNotMatch(
    actionPolicy,
    /function (compactWorldModelRef|selectDecision|summarizeDecision|evaluateAction)\(/,
  );
});

test("daily memory builder is a facade over coercion, render, and entry helpers", () => {
  const dailyMemoryBuilder = readBoundedImplementation(
    "daily-memory-builder.js",
  );

  assert.doesNotMatch(
    dailyMemoryBuilder,
    /require\(["']\.\/daily-memory-schema["']\)/,
  );
  assert.match(
    dailyMemoryBuilder,
    /require\(["']\.\/daily-memory-coercion["']\)/,
  );
  assert.match(
    dailyMemoryBuilder,
    /require\(["']\.\/daily-memory-render["']\)/,
  );
  assert.match(dailyMemoryBuilder, /require\(["']\.\/daily-memory-entry["']\)/);
  assert.doesNotMatch(
    dailyMemoryBuilder,
    /function (parseDailyMemorySections|renderDailyMemoryDocument|appendDailyMemoryEntryBlock)\(/,
  );
});

test("action policy config is a facade over threshold and profile helpers", () => {
  const actionPolicyConfig = readBoundedImplementation(
    "action-policy-config.js",
  );

  assert.match(
    actionPolicyConfig,
    /require\(["']\.\/action-policy-thresholds["']\)/,
  );
  assert.match(
    actionPolicyConfig,
    /require\(["']\.\/action-policy-profiles["']\)/,
  );
  assert.doesNotMatch(
    actionPolicyConfig,
    /ACTION_TYPE_PROFILES|WORLD_MODEL_POLICY|RIPENESS_POLICY|ACTION_COORDINATOR_POLICY/,
  );
});

test("interaction event policy is a facade over constants, normalize, salience, and log helpers", () => {
  const interactionPolicy = readBoundedImplementation(
    "interaction-event-policy.js",
  );

  assert.match(
    interactionPolicy,
    /require\(["']\.\/interaction-event-policy-constants["']\)/,
  );
  assert.match(
    interactionPolicy,
    /require\(["']\.\/interaction-event-policy-normalize["']\)/,
  );
  assert.match(
    interactionPolicy,
    /require\(["']\.\/interaction-event-policy-salience["']\)/,
  );
  assert.match(
    interactionPolicy,
    /require\(["']\.\/interaction-event-policy-log["']\)/,
  );
  assert.doesNotMatch(
    interactionPolicy,
    /function (normalizeInteractionEvent|assessInteractionSalience|extractInteractionEventFromLogEntry)\(/,
  );
});
