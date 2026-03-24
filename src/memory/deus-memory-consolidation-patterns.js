const {
  CONSOLIDATION_POLICY,
  hasStrongConsolidationSignal,
} = require("../beliefs/belief-policy");

function countOccurrences(text, needles) {
  const lower = text.toLowerCase();
  let total = 0;
  for (const needle of needles) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matches = lower.match(new RegExp(escaped, "g")) || [];
    total += matches.length;
  }
  return total;
}

function detectRecurringMemoryPatterns(memories = []) {
  const joined = memories.map((memory) => memory.content).join("\n");
  const patterns = [];

  const definitions = [
    {
      name: "infrastructure_work",
      category: "operational",
      needles: ["dokploy", "cloudflare", "deploy", "dns", "shared_workspace"],
      summary:
        "Infrastructure and deployment work keeps recurring and should remain a first-class operational concern.",
    },
    {
      name: "self_model_maintenance",
      category: "self_model",
      needles: [
        "belief",
        "introspection",
        "coherence",
        "invariant",
        "self-model",
      ],
      summary:
        "Self-model maintenance and epistemic hygiene are active recurring concerns, not one-off repairs.",
    },
    {
      name: "workspace_normalization",
      category: "operational",
      needles: ["workspace", "structure", "path", "canonical", "generated"],
      summary:
        "Workspace normalization and architecture boundary work recur enough to count as ongoing operational maintenance.",
    },
  ];

  for (const definition of definitions) {
    const score = countOccurrences(joined, definition.needles);
    const evidenceSources = memories
      .filter((memory) =>
        definition.needles.some((needle) =>
          memory.content.toLowerCase().includes(needle),
        ),
      )
      .map((memory) => `memory/${memory.file}`);

    if (hasStrongConsolidationSignal(score)) {
      patterns.push({
        ...definition,
        score,
        recurrence: evidenceSources.length,
        evidenceSources,
      });
    }
  }

  return patterns;
}

function buildStructuralReflectionEntries(patterns = []) {
  return patterns.length === 0
    ? [
        "Nightly consolidation: no strong recurring patterns detected tonight; day retained primarily as episodic memory.",
      ]
    : patterns.map(
        (pattern) =>
          `Nightly consolidation: ${pattern.summary} (signal score: ${pattern.score}, recurrence: ${pattern.recurrence})`,
      );
}

module.exports = {
  CONSOLIDATION_POLICY,
  buildStructuralReflectionEntries,
  detectRecurringMemoryPatterns,
};
