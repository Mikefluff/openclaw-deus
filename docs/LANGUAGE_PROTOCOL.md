# Language Protocol

> Internal documentation language vs user-facing communication language

---

## Scope Boundary

This document is only about localization and communication language.

It does **not** define semantic grammar, prompt governance, or ontology evolution.
Those belong to:
- `docs/SEMANTIC_GOVERNANCE.md`
- `docs/DEUS_ARCHIVE_TO_RUNTIME_MAPPING.md`

---

## Rule

| Context | Language |
| --- | --- |
| Internal repository artifacts | English by default |
| User-facing communication to the human operator | The user's current language |
| Code identifiers and technical literals | English |

---

## Internal Artifacts

English is the default for:
- Markdown docs committed to the repository,
- JSON and JSONL structures,
- code and comments intended for repository readers,
- task artifacts,
- verification notes and operational summaries written into repository files.

Reasons:
- tool compatibility,
- stable grep/search behavior,
- reduced terminology drift,
- contributor readability.

Exceptions:
- quoted user content may remain in its original language,
- examples may include the user's language when the example itself is user-facing.

---

## User-Facing Communication

The user's current language is the default for:
- direct explanations to the human operator,
- questions, summaries, and alerts,
- conversational responses in the main working thread.

Exceptions:
- established technical terms without a useful local-language replacement,
- code, commands, file names, and identifiers.

---

## Mixed Cases

### Belief content

Belief entries may describe user-language context while keeping the structural fields in English.

### Code samples in explanations

Narrative around the code may use the user's language, but the code itself stays English.

### Public project output

Application projects may define their own output-language rules for their user-facing content.
That does not change the root DEUS repository language policy.

---

## Enforcement

There is currently no dedicated `scripts/check-language.sh` enforcement command in the repository.

Current enforcement is procedural:
- review against repository policy,
- keep internal artifacts in English,
- keep user-facing conversation in the user's current language,
- avoid silently mixing localization policy with semantic-governance policy.
