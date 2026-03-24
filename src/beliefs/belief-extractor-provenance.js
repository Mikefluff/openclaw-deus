"use strict";

const BACKGROUND_REFLECTION_PREFIXES = Object.freeze([
  "Nightly consolidation:",
  "Policy feedback:",
]);

function detectMemoryCandidateProvenance(sectionTitle, blockText) {
  const text = String(blockText || "").trim();

  if (sectionTitle === "System Events") {
    if (
      BACKGROUND_REFLECTION_PREFIXES.some((prefix) => text.startsWith(prefix))
    ) {
      return "sleep_reflection";
    }

    return "idle_background";
  }

  return "memory_pattern";
}

module.exports = {
  BACKGROUND_REFLECTION_PREFIXES,
  detectMemoryCandidateProvenance,
};
