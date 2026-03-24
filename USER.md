# USER.md — Local Human Context Template

This file is the canonical home for operator-specific profile data in a DEUS workspace.

For the public `clean-install` branch it stays generic on purpose.
After local installation, personalize this file privately instead of hardcoding user details into reusable docs, code, or templates.

---

## Identity

- **Name:** Human Operator
- **What to call them:** Human
- **Timezone:** (optional)
- **Languages:** (optional)
- **Quiet Hours:** (optional, `HH:MM-HH:MM`)

## Role & Positioning

- **Primary role:** Document locally
- **Current working mode:** Document locally
- **Domain focus:** Document locally

## Stable Preferences

- Capture stable communication preferences here.
- Capture durable project or tooling context here.
- Keep facts, preferences, and hypotheses explicit.
- Prefer short, inspectable notes over narrative biography.

## Decision Priorities

Document the local operator's stable priorities here, for example:

1. Correctness
2. Reversibility
3. Auditability
4. Modularity
5. Cost awareness

## What Belongs Here

- stable communication preferences
- durable professional or project context
- preferred terminology and output format
- local tooling expectations that affect reasoning quality

## What Does Not Belong Here

- secrets, credentials, or private keys
- low-value episodic details that belong in `memory/`
- raw logs or operational traces that belong in `logs/`
- private reflections that belong in local runtime-only artifacts

## Local Update Policy

- Update this file only for stable operator context.
- Keep public `clean-install` generic; personalize only in private/local variants.
- If a preference is transient or day-specific, store it in `memory/` instead.
