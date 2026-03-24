const REVIEW_QUEUE_TITLE = "# Pending Belief Promotions";
const REVIEW_QUEUE_INTRO =
  "This file is the review queue for candidate belief promotions.";
const REVIEW_QUEUE_OUTRO =
  "Do not treat entries here as durable beliefs until reviewed/promoted.";

const REVIEW_QUEUE_FIELDS = Object.freeze([
  {
    name: "marker",
    description: "stable dedupe key",
    defaultValue: "",
  },
  {
    name: "candidate",
    description: "proposed durable belief text",
    defaultValue: "",
  },
  {
    name: "category",
    description: "user_model / self_model / operational / hypothesis / other",
    defaultValue: "operational",
  },
  {
    name: "evidence",
    description: "short explanation of supporting evidence",
    defaultValue: "",
  },
  {
    name: "evidence_sources",
    description: "relevant memory files or reports",
    defaultValue: [],
  },
  {
    name: "recurrence",
    description: "how many repeated signals were observed",
    defaultValue: 0,
  },
  {
    name: "confidence_proposal",
    description: "suggested confidence if promoted",
    defaultValue: 0,
  },
  {
    name: "promotion_decision",
    description: "review_before_promotion / auto_promote / reject / pending",
    defaultValue: "pending",
  },
  {
    name: "human_review_needed",
    description: "yes / no",
    defaultValue: "no",
  },
  {
    name: "provenance",
    description:
      "interactive_memory / memory_pattern / idle_background / sleep_reflection / other",
    defaultValue: "other",
  },
  {
    name: "notes",
    description: "optional clarifications",
    defaultValue: "",
  },
]);

module.exports = {
  REVIEW_QUEUE_FIELDS,
  REVIEW_QUEUE_INTRO,
  REVIEW_QUEUE_OUTRO,
  REVIEW_QUEUE_TITLE,
};
