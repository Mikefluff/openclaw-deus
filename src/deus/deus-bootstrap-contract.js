const DEUS_BOOTSTRAP_SEQUENCE = [
  {
    path: "AGENTS.md",
    role: "entrypoint",
  },
  {
    path: "SOUL.md",
    role: "philosophy",
  },
  {
    path: "IDENTITY.md",
    role: "compact_identity",
  },
  {
    path: "USER.md",
    role: "human_context",
  },
  {
    path: "DEUS.md",
    role: "self_model",
  },
  {
    path: "beliefs/core.jsonl",
    role: "durable_beliefs",
  },
  {
    path: "memory/YYYY-MM-DD.md",
    role: "recent_memory",
    dynamic: true,
  },
];

const DEFAULT_BOOTSTRAP_ENTRYPOINTS = DEUS_BOOTSTRAP_SEQUENCE.filter(
  (entry) => !entry.dynamic,
).map((entry) => entry.path);

function getBootstrapSequence({ includeDynamic = true } = {}) {
  if (includeDynamic) {
    return [...DEUS_BOOTSTRAP_SEQUENCE];
  }

  return DEUS_BOOTSTRAP_SEQUENCE.filter((entry) => !entry.dynamic);
}

module.exports = {
  DEUS_BOOTSTRAP_SEQUENCE,
  DEFAULT_BOOTSTRAP_ENTRYPOINTS,
  getBootstrapSequence,
};
