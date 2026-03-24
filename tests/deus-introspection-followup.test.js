const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  buildIntrospectionFollowupPacket,
  persistIntrospectionFollowupPacket,
  readLatestIntrospectionFollowupPacket,
  renderIntrospectionFollowupPrompt,
} = require("../src/introspection/deus-introspection-followup");

test("follow-up packet keeps review-level follow-up even when the active project requires human confirmation", () => {
  const packet = buildIntrospectionFollowupPacket({
    reportData: {
      date: "2026-03-22",
      coherence: 0.92,
      memory: { today: true, yesterday: true },
      uncommitted: 0,
      belief_processing: {
        contradictions: 0,
      },
      action_policy: {
        decision: "blocked",
        blockers: ["missing_human_confirmation"],
        requiresHumanConfirmation: true,
      },
      focus_state: {
        warnings: [],
      },
    },
    artifactPaths: {
      reportPath: "/tmp/introspection-2026-03-22.md",
      dataPath: "/tmp/introspection-2026-03-22.json",
      analysisPath: "/tmp/introspection-2026-03-22.analyzed.md",
      followupPath: "/tmp/introspection-2026-03-22.followup.json",
      latestFollowupPath: "/tmp/introspection-followup.latest.json",
    },
  });

  assert.equal(packet.followup.decision, "review");
  assert.equal(packet.followup.requiresHumanInput, false);
  assert.match(
    renderIntrospectionFollowupPrompt(packet),
    /review: update review\/status\/task\/introspection surfaces only/,
  );
});

test("follow-up packet selects repair for focus drift without hard blockers", () => {
  const packet = buildIntrospectionFollowupPacket({
    reportData: {
      date: "2026-03-22",
      coherence: 0.78,
      llm_analysis_needed: true,
      memory: { today: true, yesterday: true },
      uncommitted: 1,
      belief_processing: {
        contradictions: 0,
      },
      action_policy: {
        decision: "observe",
        blockers: [],
      },
      focus_state: {
        warnings: ["mode_working_incompatible_with_status_waiting"],
      },
      decay_policy_audit: {
        tuningSuggested: true,
        activeFloorPressure: [{ beliefId: "G1" }, { beliefId: "G2" }],
        criticalAtRisk: [{ beliefId: "G1" }, { beliefId: "G2" }],
        archivedNonArchivable: [],
        tuningCandidates: [
          {
            kind: "review_floor_binding",
            beliefClass: "self_model",
            suggestedDecayMode: "no_decay",
            affectedBeliefCount: 2,
            reason:
              "2 active beliefs are pinned to the class floor under a decaying mode",
          },
        ],
      },
    },
    artifactPaths: {
      reportPath: "/tmp/introspection-2026-03-22.md",
      dataPath: "/tmp/introspection-2026-03-22.json",
      analysisPath: "/tmp/introspection-2026-03-22.analyzed.md",
      followupPath: "/tmp/introspection-2026-03-22.followup.json",
      latestFollowupPath: "/tmp/introspection-followup.latest.json",
    },
  });

  assert.equal(packet.followup.decision, "repair");
  assert.deepEqual(
    packet.followup.allowedMeasures.includes("apply_one_bounded_repair"),
    true,
  );
  assert.equal(packet.signals.decayTuningSuggested, true);
  assert.equal(packet.signals.criticalDecayRiskCount, 2);
  assert.equal(packet.followup.decayPolicy.tuningSuggested, true);
  assert.equal(packet.followup.decayPolicy.tuningCandidates.length, 1);
  assert.deepEqual(
    packet.followup.recommendedActions.map((action) => action.kind),
    [
      "read_full_report",
      "repair_focus_state",
      "review_decay_risk",
      "review_decay_tuning_candidates",
      "check_workspace_drift",
    ],
  );
  assert.match(
    renderIntrospectionFollowupPrompt(packet),
    /Decay tuning candidates:/,
  );
});

test("follow-up packet escalates decay contract breaches to review", () => {
  const packet = buildIntrospectionFollowupPacket({
    reportData: {
      date: "2026-03-22",
      coherence: 0.9,
      memory: { today: true, yesterday: true },
      uncommitted: 0,
      belief_processing: {
        contradictions: 0,
      },
      action_policy: {
        decision: "observe",
        blockers: [],
      },
      focus_state: {
        warnings: [],
      },
      decay_policy_audit: {
        tuningSuggested: false,
        activeFloorPressure: [],
        criticalAtRisk: [],
        archivedNonArchivable: [{ beliefId: "S1" }],
        tuningCandidates: [],
      },
    },
  });

  assert.equal(packet.followup.decision, "review");
  assert.deepEqual(
    packet.followup.recommendedActions.map((action) => action.kind),
    ["inspect_decay_contract_breach"],
  );
});

test("persisted follow-up packet becomes readable from the canonical latest path", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "deus-introspection-followup-"),
  );
  const packet = buildIntrospectionFollowupPacket({
    reportData: {
      date: "2026-03-22",
      coherence: 0.9,
      memory: { today: true, yesterday: true },
      uncommitted: 0,
      belief_processing: {
        contradictions: 0,
      },
      action_policy: {
        blockers: [],
      },
      focus_state: {
        warnings: [],
      },
    },
    artifactPaths: {
      reportPath: path.join(tempDir, "introspection-2026-03-22.md"),
      dataPath: path.join(tempDir, "introspection-2026-03-22.json"),
      analysisPath: path.join(tempDir, "introspection-2026-03-22.analyzed.md"),
      followupPath: path.join(
        tempDir,
        "introspection-2026-03-22.followup.json",
      ),
      latestFollowupPath: path.join(
        tempDir,
        "introspection-followup.latest.json",
      ),
    },
  });

  persistIntrospectionFollowupPacket(packet, { introspectionDir: tempDir });

  const latest = readLatestIntrospectionFollowupPacket({
    introspectionDir: tempDir,
  });
  assert.equal(latest.reportDate, "2026-03-22");
  assert.equal(latest.followup.decision, "observe_only");
});
