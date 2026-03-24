"use strict";

const crypto = require("crypto");

const { normalizeString } = require("./deus-dissensus-normalize");

function inferLevelFromDecision(decision) {
  switch (decision) {
    case "signal_l1":
      return "l1";
    case "pause_l2":
      return "l2";
    case "refuse_l3":
      return "l3";
    default:
      return "none";
  }
}

function buildDissensusFingerprint(input = {}) {
  const fields = [
    normalizeString(input.trigger_type, "none"),
    normalizeString(input.action_type, "unknown"),
    normalizeString(input.target_class, "general"),
    normalizeString(input.target, "workspace"),
  ];

  return crypto.createHash("sha1").update(fields.join("|")).digest("hex");
}

function buildDecisionId(input = {}, timestamp = new Date().toISOString()) {
  const fingerprint = buildDissensusFingerprint(input);
  return crypto
    .createHash("sha1")
    .update(`${timestamp}|${fingerprint}`)
    .digest("hex")
    .slice(0, 16);
}

module.exports = {
  buildDecisionId,
  buildDissensusFingerprint,
  inferLevelFromDecision,
};
