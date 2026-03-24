"use strict";

const fs = require("fs");
const path = require("path");
const { BELIEF_EXTRACTION_POLICY } = require("./belief-policy");
const {
  appendReviewCandidate,
  findNewMemoryFiles,
  getLastExtractionTime,
  loadBeliefs,
  log,
  resolveBeliefExtractorPaths,
  saveBeliefs,
  setLastExtractionTime,
} = require("./belief-extractor-state");
const {
  detectMemoryCandidateProvenance,
  extractCandidatesFromMemoryContent,
  extractPatterns,
  extractSectionPatternCandidates,
  findExistingBelief,
  generateBeliefId,
} = require("./belief-extractor-candidates");

function main(options = {}) {
  const lastExtraction = getLastExtractionTime(options);
  log(
    `Starting extraction. Last run: ${lastExtraction.toISOString()}`,
    options,
  );

  const newFiles = findNewMemoryFiles(lastExtraction, options);
  log(`Found ${newFiles.length} new memory files`, options);

  if (newFiles.length === 0) {
    log("No new data to extract", options);
    return { extracted: 0, updated: 0, deferred: 0 };
  }

  const beliefs = loadBeliefs(options);
  let extracted = 0;
  let updated = 0;
  let deferred = 0;

  for (const file of newFiles) {
    const content = fs.readFileSync(file, "utf8");
    const source = path.basename(file, ".md");
    const candidates = extractCandidatesFromMemoryContent(
      content,
      source,
      options,
    );

    for (const candidate of candidates) {
      const existing = findExistingBelief(beliefs, candidate.content);

      if (existing) {
        existing.confidence = Math.min(
          1.0,
          existing.confidence + BELIEF_EXTRACTION_POLICY.reinforcementBoost,
        );
        existing.timestamp_updated = new Date().toISOString();
        existing.drift_history = existing.drift_history || [];
        existing.drift_history.push({
          timestamp: new Date().toISOString(),
          confidence: existing.confidence,
          reason: "reinforced_by_new_evidence",
          source,
        });
        updated++;
        log(
          `Refreshed ${existing.belief_id}: ${candidate.content.substring(0, 50)}...`,
          options,
        );
      } else if (candidate.autoPromote) {
        const newBelief = {
          belief_id: generateBeliefId(beliefs, candidate.prefix),
          content: candidate.content,
          confidence: candidate.confidence,
          evidence_set: [source],
          source_type: "inference",
          timestamp_created: new Date().toISOString(),
          timestamp_updated: new Date().toISOString(),
          context_scope: candidate.category,
          ontological_anchor: "user_preference",
          inference_trace: [
            "pattern_extraction",
            `keyword_match_${candidate.type}`,
            "auto_promote_strong_signal",
            `provenance_${candidate.provenance || "memory_pattern"}`,
          ],
          drift_history: [],
          status: "active",
        };

        beliefs.push(newBelief);
        extracted++;
        log(
          `Created ${newBelief.belief_id}: ${candidate.content.substring(0, 50)}...`,
          options,
        );
      } else if (appendReviewCandidate(candidate, options)) {
        deferred++;
        log(
          `Deferred candidate for review: ${candidate.content.substring(0, 50)}...`,
          options,
        );
      }
    }
  }

  saveBeliefs(beliefs, options);
  setLastExtractionTime(options);

  const stats = {
    timestamp: new Date().toISOString(),
    files_processed: newFiles.length,
    extracted,
    updated,
    deferred,
    total_beliefs: beliefs.length,
  };

  log(
    `Extraction complete: ${extracted} new, ${updated} refreshed, ${deferred} deferred`,
    options,
  );
  console.log(JSON.stringify(stats, null, 2));

  return stats;
}

module.exports = {
  appendReviewCandidate,
  detectMemoryCandidateProvenance,
  extractPatterns,
  extractSectionPatternCandidates,
  findExistingBelief,
  loadBeliefs,
  main,
  resolveBeliefExtractorPaths,
  saveBeliefs,
};
