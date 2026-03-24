"use strict";

const LAYERS = Object.freeze({
  CANONICAL_TRUNK: "canonical_trunk",
  LIVE_RUNTIME: "live_runtime",
  EPHEMERAL_RUNTIME: "ephemeral_runtime",
  UNKNOWN: "unknown",
});

const AUTHORITIES = Object.freeze({
  GITHUB_TRUNK: "github_trunk",
  LIVE_WORKSPACE: "live_workspace",
  LOCAL_ONLY: "local_only",
  MANUAL_REVIEW: "manual_review",
});

const SYNC_RULES = Object.freeze({
  PULL_PUSH_VIA_GIT: "pull_push_via_git",
  PRESERVE_THEN_PROMOTE: "preserve_then_promote",
  NEVER_PROMOTE: "never_promote",
  INSPECT_FIRST: "inspect_first",
});

module.exports = {
  AUTHORITIES,
  LAYERS,
  SYNC_RULES,
};
