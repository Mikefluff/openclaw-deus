"use strict";

const {
  listKnownProjectRuntimeSurfaces,
} = require("./runtime-surface-projects");

function listKnownRuntimeSurfacePaths(options = {}) {
  const paths = [
    "STATUS.md",
    "beliefs/core.jsonl",
    "beliefs/decay-policy.overrides.json",
    "beliefs/drift.log",
    "dissensus",
    "dissensus/open-cases.json",
    "dissensus/overrides.jsonl",
    "memory",
    "logs",
    "review/pending-beliefs.md",
    "review/open-tensions.md",
    "docs/introspection",
    "data/.last-extraction",
    "reports/ops-rollup.ndjson",
  ];

  return [...paths, ...listKnownProjectRuntimeSurfaces(options)].sort();
}

module.exports = {
  listKnownRuntimeSurfacePaths,
};
