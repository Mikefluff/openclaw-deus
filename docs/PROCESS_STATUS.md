# PROCESS_STATUS.md

## Purpose

`STATUS.md` is the canonical live status file for DEUS.
It exists to answer a simple operational question:
- is DEUS actively working,
- waiting on input,
- or idle?

It also provides a machine-readable-enough place for follow-through checks.

---

## Status fields

### `mode`
High-level mode such as:
- `working`
- `focus`
- `cron_follow_through`
- `sleep_reflection`
- `idle`

### `active_project`
Current primary project, if any.
Examples:
- `none`
- `<project-name>`

### `current_focus`
Short plain-language description of what is being worked on now.

### `status`
Operational state:
- `active` — there is still meaningful work in progress
- `waiting` — blocked on human input or an external dependency that current automation cannot resolve
- `idle` — nothing currently needs follow-through

### `waiting_for`
If blocked, state what input/decision is needed.

### `follow_through_required`
- `yes` — regular follow-through checks should continue the active block when possible
- `no` — no automatic continuation needed

---

## Update rule

Update `STATUS.md` when:
- starting a meaningful work block
- finishing a meaningful work block
- shifting from active work to waiting
- changing active project/focus

---

## Follow-through rule

A periodic cron check may read `STATUS.md`.
If it finds:
- `status: active`
- `follow_through_required: yes`

then it should continue the open work block, update `STATUS.md`, and report briefly.

Scheduled future windows are not `waiting` blockers by themselves.
If the next meaningful step is a cron-checked window, keep the state `active` with a follow-through-eligible mode instead of converting that future time marker into `status: waiting`.

Current operational rule:
- any local scheduler or operator automation may read `STATUS.md`
- the repository does not ship a canonical server cron profile in clean-install
- follow-through automation is a local deployment overlay, not part of the public bootstrap

Current anti-spam rule for follow-through automation:
- compare `status`, `waiting_for`, `current_focus`, and `next_step`
- live status file: current workspace `STATUS.md` or the configured `DEUS_RUNTIME_ROOT/STATUS.md`
- state file: local `.tmp/follow-through-last-state.json`
- if state did not change and current posture is `waiting` or `idle`, do not send a chat update

Reporting format for a sent cron update should stay short and structured (2–4 lines):
- `Status: ...`
- `Check: ...`
- `Outcome: ...`
- `Next: ...` (optional)

If it finds:
- `status: waiting`
- or `follow_through_required: no`

then it should not force work.

For read-only inspection of the same runtime posture, use:
- `npm run deus:focus`

For bounded background reflection derived from the same state machine, use:
- `npm run deus:sleep:dry`
- `npm run deus:sleep`

---

## Project-level status files

Active projects may also maintain their own `STATUS.md` files after explicit materialization.
Example:
- `projects/<project-name>/STATUS.md`

Rule:
- workspace `STATUS.md` = global/system state
- project `STATUS.md` = local project state
- if a local operator configures a separate runtime root, both may live there as a deployment overlay while project code/docs stay in the canonical root

## Design principle

`STATUS.md` is not a memory dump.
It is a live operational handoff note between active DEUS work, cron follow-through, and human visibility.
