const {
  applyBoundedDecayOverridePatch,
  ensureDecayPolicyOverrideArtifact,
  getEffectiveRuntimeClassProfile,
} = require("../beliefs/belief-decay-overrides");

function selectBestTuningCandidate(packet) {
  const candidates = Array.isArray(packet?.followup?.decayPolicy?.tuningCandidates)
    ? packet.followup.decayPolicy.tuningCandidates
    : [];

  return (
    candidates.find(
      (candidate) =>
        candidate &&
        candidate.scope === "class" &&
        typeof candidate.beliefClass === "string" &&
        candidate.beliefClass !== "axiom" &&
        typeof candidate.suggestedDecayMode === "string",
    ) || null
  );
}

function buildBoundedDecayTuningProposal(packet, options = {}) {
  if (!packet?.followup) {
    return {
      eligible: false,
      reason: "followup_packet_missing",
      proposal: null,
    };
  }

  if (packet.followup.decision !== "repair") {
    return {
      eligible: false,
      reason: "followup_decision_not_repair",
      proposal: null,
    };
  }

  if (!packet.followup.decayPolicy?.tuningSuggested) {
    return {
      eligible: false,
      reason: "decay_tuning_not_suggested",
      proposal: null,
    };
  }

  const candidate = selectBestTuningCandidate(packet);
  if (!candidate) {
    return {
      eligible: false,
      reason: "no_eligible_decay_tuning_candidate",
      proposal: null,
    };
  }

  const currentProfile = getEffectiveRuntimeClassProfile(candidate.beliefClass, {
    filePath: options.filePath,
  });
  if (currentProfile.decay_mode === candidate.suggestedDecayMode) {
    return {
      eligible: false,
      reason: "suggested_decay_mode_already_applied",
      proposal: null,
    };
  }

  return {
    eligible: true,
    reason: null,
    proposal: {
      beliefClass: candidate.beliefClass,
      updates: {
        decay_mode: candidate.suggestedDecayMode,
      },
      reason: `introspection_decay_tuning:${candidate.kind}`,
      reportDate: packet.reportDate || null,
      sourceCandidate: candidate,
    },
  };
}

function applyBoundedDecayTuningFromPacket(packet, options = {}) {
  ensureDecayPolicyOverrideArtifact({ filePath: options.filePath });
  const proposalResult = buildBoundedDecayTuningProposal(packet, options);

  if (!proposalResult.eligible) {
    return {
      applied: false,
      dryRun: Boolean(options.dryRun),
      reason: proposalResult.reason,
      proposal: null,
      filePath: options.filePath,
    };
  }

  const result = applyBoundedDecayOverridePatch(proposalResult.proposal, options);

  return {
    applied: !options.dryRun,
    dryRun: Boolean(options.dryRun),
    reason: null,
    proposal: proposalResult.proposal,
    ...result,
  };
}

module.exports = {
  applyBoundedDecayTuningFromPacket,
  buildBoundedDecayTuningProposal,
  selectBestTuningCandidate,
};
