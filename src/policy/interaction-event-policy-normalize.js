"use strict";

const {
  normalizePolicyBoolean,
  normalizePolicyString,
  normalizePolicyStringArray,
} = require("./action-policy-helpers");
const {
  INTERACTION_EVENT_POLICY,
  INTERACTION_KIND_ALIASES,
  INTERACTION_SIGNAL_KEYWORDS,
} = require("./interaction-event-policy-constants");

function normalizeInteractionKind(value) {
  const normalized = normalizePolicyString(value, "other")
    .toLowerCase()
    .replace(/\s+/g, "_");
  return INTERACTION_KIND_ALIASES[normalized] || "other";
}

function textIncludesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function detectInteractionSignals(input = {}) {
  const text = normalizePolicyString(
    input.content || input.summary || input.description || input.message,
  ).toLowerCase();
  const kind = normalizeInteractionKind(
    input.kind || input.type || input.category,
  );
  const inputSignals = input.signals || {};
  const tags = normalizePolicyStringArray(input.tags).map((tag) =>
    tag.toLowerCase(),
  );

  const explicitPreference = normalizePolicyBoolean(
    inputSignals.explicit_preference ?? inputSignals.explicitPreference,
    kind === "preference" ||
      textIncludesAny(text, INTERACTION_SIGNAL_KEYWORDS.preference),
  );
  const explicitConstraint = normalizePolicyBoolean(
    inputSignals.explicit_constraint ?? inputSignals.explicitConstraint,
    kind === "constraint" ||
      textIncludesAny(text, INTERACTION_SIGNAL_KEYWORDS.constraint),
  );
  const explicitInstruction = normalizePolicyBoolean(
    inputSignals.explicit_instruction ?? inputSignals.explicitInstruction,
    kind === "instruction" ||
      textIncludesAny(text, INTERACTION_SIGNAL_KEYWORDS.instruction),
  );
  const identityRelevant = normalizePolicyBoolean(
    inputSignals.identity_relevant ?? inputSignals.identityRelevant,
    kind === "personal_context" ||
      tags.includes("identity") ||
      textIncludesAny(text, INTERACTION_SIGNAL_KEYWORDS.identity),
  );
  const projectRelevant = normalizePolicyBoolean(
    inputSignals.project_relevant ?? inputSignals.projectRelevant,
    kind === "project_context" ||
      tags.includes("project") ||
      textIncludesAny(text, INTERACTION_SIGNAL_KEYWORDS.project),
  );
  const approvalChange = normalizePolicyBoolean(
    inputSignals.approval_change ?? inputSignals.approvalChange,
    kind === "approval",
  );
  const correction = normalizePolicyBoolean(
    inputSignals.correction,
    kind === "correction",
  );
  const recurringReference = normalizePolicyBoolean(
    inputSignals.recurring_reference ??
      inputSignals.recurringReference ??
      input.recurring,
    false,
  );
  const continuityRelevant = normalizePolicyBoolean(
    inputSignals.continuity_relevant ?? inputSignals.continuityRelevant,
    explicitPreference ||
      explicitConstraint ||
      explicitInstruction ||
      approvalChange ||
      correction ||
      identityRelevant,
  );

  return {
    explicit_preference: explicitPreference,
    explicit_constraint: explicitConstraint,
    explicit_instruction: explicitInstruction,
    continuity_relevant: continuityRelevant,
    identity_relevant: identityRelevant,
    project_relevant: projectRelevant,
    approval_change: approvalChange,
    correction,
    recurring_reference: recurringReference,
  };
}

function normalizeInteractionEvent(event = {}) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new TypeError("interaction event must be an object");
  }

  const summary = normalizePolicyString(
    event.summary ||
      event.description ||
      event.message ||
      event.content ||
      event.text,
  );
  const content = normalizePolicyString(
    event.content ||
      event.text ||
      event.message ||
      event.description ||
      summary,
  );

  return {
    version: INTERACTION_EVENT_POLICY.version,
    kind: normalizeInteractionKind(event.kind || event.type || event.category),
    actor: normalizePolicyString(
      event.actor || event.speaker,
      INTERACTION_EVENT_POLICY.defaultActor,
    ).toLowerCase(),
    source: normalizePolicyString(
      event.source,
      INTERACTION_EVENT_POLICY.defaultSource,
    ).toLowerCase(),
    summary: summary || content,
    content,
    tags: normalizePolicyStringArray(event.tags),
    references: normalizePolicyStringArray(
      event.references || event.evidence_sources || event.context_sources,
    ),
    signals: detectInteractionSignals(event),
  };
}

module.exports = {
  detectInteractionSignals,
  normalizeInteractionEvent,
  normalizeInteractionKind,
  textIncludesAny,
};
