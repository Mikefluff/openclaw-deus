"use strict";

const fs = require("fs");
const { resolveBeliefsPath, resolveBeliefsWritePath } = require("../runtime/runtime-surface-paths");
const { appendDeusOpsLog } = require("../deus/deus-ops-log");

function log(msg, options = {}) {
  appendDeusOpsLog({
    component: "belief-contradictions",
    message: msg,
    workspaceRoot: options.workspaceRoot,
  });
}

function loadBeliefs(options = {}) {
  try {
    const data = fs.readFileSync(resolveBeliefsPath(options), "utf8");
    return data
      .trim()
      .split("\n")
      .filter((l) => l)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function saveBeliefs(beliefs, options = {}) {
  const data = beliefs.map((b) => JSON.stringify(b)).join("\n") + "\n";
  fs.writeFileSync(resolveBeliefsWritePath(options), data);
}

function findContradictions(beliefs) {
  const contradictions = [];
  const byScope = {};
  beliefs.forEach((b) => {
    byScope[b.context_scope] = byScope[b.context_scope] || [];
    byScope[b.context_scope].push(b);
  });

  for (const [scope, scopeBeliefs] of Object.entries(byScope)) {
    for (let i = 0; i < scopeBeliefs.length; i++) {
      for (let j = i + 1; j < scopeBeliefs.length; j++) {
        const b1 = scopeBeliefs[i];
        const b2 = scopeBeliefs[j];

        if (b1.status === "archived" || b2.status === "archived") continue;

        if (isNegation(b1.content, b2.content)) {
          contradictions.push({
            belief_1: b1.belief_id,
            belief_2: b2.belief_id,
            content_1: b1.content,
            content_2: b2.content,
            severity: "high",
            scope,
          });
        }

        if (
          similarContent(b1.content, b2.content) &&
          Math.abs(b1.confidence - b2.confidence) > 0.5
        ) {
          contradictions.push({
            belief_1: b1.belief_id,
            belief_2: b2.belief_id,
            content_1: b1.content,
            content_2: b2.content,
            severity: "medium",
            scope,
            reason: "confidence_divergence",
          });
        }
      }
    }
  }

  return contradictions;
}

function isNegation(content1, content2) {
  const negations = ["не ", "нет", "никогда", "всегда"];
  const c1 = content1.toLowerCase();
  const c2 = content2.toLowerCase();

  for (const neg of negations) {
    if (
      (c1.includes(neg) && !c2.includes(neg)) ||
      (!c1.includes(neg) && c2.includes(neg))
    ) {
      const base1 = c1.replace(new RegExp(neg, "g"), "").trim();
      const base2 = c2.replace(new RegExp(neg, "g"), "").trim();
      if (calculateSimilarity(base1, base2) > 0.6) {
        return true;
      }
    }
  }
  return false;
}

function similarContent(c1, c2) {
  return calculateSimilarity(c1.toLowerCase(), c2.toLowerCase()) > 0.5;
}

function calculateSimilarity(a, b) {
  const aWords = new Set(a.split(/\s+/).filter((w) => w.length > 3));
  const bWords = new Set(b.split(/\s+/).filter((w) => w.length > 3));
  if (aWords.size === 0 || bWords.size === 0) return 0;
  const intersection = new Set([...aWords].filter((x) => bWords.has(x)));
  return intersection.size / Math.max(aWords.size, bWords.size);
}

function resolveContradictions(contradictions, beliefs, options = {}) {
  for (const contr of contradictions) {
    const b1 = beliefs.find((b) => b.belief_id === contr.belief_1);
    const b2 = beliefs.find((b) => b.belief_id === contr.belief_2);

    if (!b1 || !b2) continue;

    log(
      `Resolving contradiction: ${contr.belief_1} vs ${contr.belief_2} (${contr.severity})`,
      options,
    );

    if (contr.severity === "high") {
      b1.confidence *= 0.8;
      b2.confidence *= 0.8;
      b1.status = "review_needed";
      b2.status = "review_needed";

      b1.drift_history.push({
        timestamp: new Date().toISOString(),
        confidence: b1.confidence,
        reason: "contradiction_detected",
        with: contr.belief_2,
      });

      b2.drift_history.push({
        timestamp: new Date().toISOString(),
        confidence: b2.confidence,
        reason: "contradiction_detected",
        with: contr.belief_1,
      });

      log("  → Both flagged for review, confidence reduced", options);
    } else {
      log("  → Logged for information (confidence divergence)", options);
    }
  }
}

function main(options = {}) {
  log("Starting contradiction detection...", options);

  const beliefs = loadBeliefs(options);
  const contradictions = findContradictions(beliefs);

  if (contradictions.length === 0) {
    log("No contradictions found", options);
    return { found: 0 };
  }

  log(`Found ${contradictions.length} contradictions`, options);

  const highSeverity = contradictions.filter((c) => c.severity === "high");
  if (highSeverity.length > 0) {
    log(
      `WARNING: ${highSeverity.length} high-severity contradictions detected`,
      options,
    );
    resolveContradictions(contradictions, beliefs, options);
    saveBeliefs(beliefs, options);
  }

  const stats = {
    timestamp: new Date().toISOString(),
    total_checked: beliefs.length,
    contradictions_found: contradictions.length,
    high_severity: highSeverity.length,
    medium_severity: contradictions.filter((c) => c.severity === "medium")
      .length,
  };

  log("Contradiction check complete", options);
  console.log(JSON.stringify(stats, null, 2));

  return stats;
}

module.exports = {
  findContradictions,
  loadBeliefs,
  main,
  resolveContradictions,
  saveBeliefs,
};
