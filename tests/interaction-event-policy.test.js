const test = require("node:test");
const assert = require("node:assert/strict");

const {
  INTERACTION_EVENT_POLICY,
  assessInteractionSalience,
  extractInteractionEventFromLogEntry,
  isHumanInteractionActivityEntry,
  normalizeInteractionEvent,
  normalizeInteractionKind,
} = require("../src/policy/interaction-event-policy");

test("interaction kind normalization resolves aliases into the canonical schema", () => {
  assert.equal(normalizeInteractionKind("request"), "instruction");
  assert.equal(normalizeInteractionKind("personal"), "personal_context");
  assert.equal(normalizeInteractionKind("small_talk"), "incidental");
  assert.equal(normalizeInteractionKind("unknown-value"), "other");
});

test("interaction event normalization derives canonical fields and signals", () => {
  const event = normalizeInteractionEvent({
    type: "request",
    message: "Не используй огурцы в рецептах, это важно для меня.",
    tags: ["food", "food", "identity"],
  });

  assert.equal(event.version, INTERACTION_EVENT_POLICY.version);
  assert.equal(event.kind, "instruction");
  assert.equal(event.actor, "human");
  assert.equal(event.source, "chat");
  assert.deepEqual(event.tags, ["food", "identity"]);
  assert.equal(event.signals.explicit_constraint, true);
  assert.equal(event.signals.explicit_instruction, true);
  assert.equal(event.signals.identity_relevant, true);
  assert.equal(event.signals.continuity_relevant, true);
});

test("explicit user preferences become reflectable but never direct durable beliefs", () => {
  const assessment = assessInteractionSalience({
    kind: "preference",
    content: "Я не люблю огурцы, не предлагай их в рецептах.",
    tags: ["food", "identity"],
  });

  assert.equal(assessment.band, "review_signal");
  assert.equal(assessment.captureDecision, "log_memory_and_review_candidate");
  assert.equal(assessment.shouldEnterCanonicalLog, true);
  assert.equal(assessment.shouldAffectEpisodicMemory, true);
  assert.equal(assessment.shouldRaiseReviewPressure, true);
  assert.equal(assessment.durableBeliefMutationAllowed, false);
  assert.match(assessment.rationale.join(" "), /explicit preference signal/);
});

test("incidental questions stay low-salience by default", () => {
  const assessment = assessInteractionSalience({
    kind: "question",
    content: "Что ты думаешь про огурцы?",
  });

  assert.equal(assessment.band, "ignore");
  assert.equal(assessment.shouldEnterCanonicalLog, false);
  assert.equal(assessment.shouldAffectEpisodicMemory, false);
  assert.equal(assessment.shouldRaiseReviewPressure, false);
});

test("structured interaction log entries are recognized as human interaction events", () => {
  const entry = {
    type: "system",
    description: "Human preference recorded",
    context: {
      interaction_event: {
        kind: "preference",
        content: "Human does not like cucumbers",
        tags: ["food"],
      },
    },
  };

  const extracted = extractInteractionEventFromLogEntry(entry);
  assert.equal(extracted.kind, "preference");
  assert.equal(extracted.actor, "human");
  assert.equal(isHumanInteractionActivityEntry(entry), true);
});
