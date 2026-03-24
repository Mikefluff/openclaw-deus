const path = require("path");

const BOUNDED_SRC_DIRECTORIES = [
  "beliefs",
  "deus",
  "introspection",
  "memory",
  "openclaw",
  "policy",
  "runtime",
  "workspace",
  "world-model",
];

const BOUNDED_SRC_FAMILY_RULES = [
  { directory: "beliefs", patterns: [/^belief-/, /^review-queue-/] },
  {
    directory: "memory",
    patterns: [
      /^daily-memory-/,
      /^deus-memory(?:-|\.js$)/,
      /^interaction-memory-routing\.js$/,
      /^user-context\.js$/,
    ],
  },
  {
    directory: "policy",
    patterns: [
      /^action-/,
      /^ripeness-/,
      /^interaction-event-policy(?:-|\.js$)/,
      /^focus-runtime-policy\.js$/,
      /^focus-state-schema\.js$/,
      /^deus-action-policy(?:-|\.js$)/,
      /^deus-policy-(?:.+|\.js$)/,
      /^deus-dissensus-/,
      /^deus-background-mutation-policy\.js$/,
      /^deus-cron-policy\.js$/,
      /^deus-decay-tuning\.js$/,
    ],
  },
  {
    directory: "introspection",
    patterns: [
      /^introspection-/,
      /^entrypoint-drift-detector\.js$/,
      /^deus-introspection-followup(?:-|\.js$)/,
    ],
  },
  {
    directory: "openclaw",
    patterns: [/^openclaw-/],
  },
  {
    directory: "runtime",
    patterns: [
      /^runtime-/,
      /^runtime-diagnostics\.js$/,
      /^bounded-src-topology\.js$/,
    ],
  },
  {
    directory: "workspace",
    patterns: [/^workspace-/],
  },
  {
    directory: "world-model",
    patterns: [/^world-model-/],
  },
  {
    directory: "deus",
    patterns: [/^deus-/, /^deus\.js$/],
  },
];

function resolveBoundedSrcDirectory(filePath) {
  const fileName = path.basename(filePath || "");

  for (const rule of BOUNDED_SRC_FAMILY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(fileName))) {
      return rule.directory;
    }
  }

  return null;
}

function resolveBoundedSrcPath(filePath) {
  const directory = resolveBoundedSrcDirectory(filePath);
  if (!directory) {
    return null;
  }

  return path.posix.join(directory, path.basename(filePath));
}

module.exports = {
  BOUNDED_SRC_DIRECTORIES,
  BOUNDED_SRC_FAMILY_RULES,
  resolveBoundedSrcDirectory,
  resolveBoundedSrcPath,
};
