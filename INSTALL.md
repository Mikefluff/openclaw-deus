# INSTALL.md

This file is the canonical installation contract for OpenClaw agents and human operators.

Target repository:
- `https://github.com/basilisk-labs/openclaw-deus`

## Purpose

Install a fresh public-safe DEUS workspace on top of a clean OpenClaw base, ensure a system `agentplane` CLI exists, and initialize local AgentPlane state only after the repository files are already present.

## Assumptions

- `git` is available.
- `node >=20` and `npm` are available.
- the operator wants a normal checked-out workspace, not a bare mirror.
- the commands below are executed from the target workspace root.
- the target workspace root is clean enough for a repository checkout into `.`.

## Deterministic Install Steps

### 1. Materialize the repository in the workspace root

```bash
git clone https://github.com/basilisk-labs/openclaw-deus.git .
```

### 2. Install workspace dependencies

```bash
npm install
```

### 3. Ensure a system `agentplane` CLI exists

Install it only when the command is missing:

```bash
if ! command -v agentplane >/dev/null 2>&1; then
  npm install -g agentplane@latest
fi
```

Optional check:

```bash
agentplane --version
```

### 4. Initialize local AgentPlane state only if the workspace does not have a local `.agentplane/` yet

This repository does not ship `.agentplane/` in git.
Initialization must happen after checkout and dependency install.
The repository `AGENTS.md` is the DEUS bootstrap entrypoint and must be preserved.
The AgentPlane-installed `AGENTS.md` must be renamed to local `AGENTPLANE.md`.

```bash
if [ ! -d .agentplane ]; then
  mkdir -p .tmp/install
  cp AGENTS.md .tmp/install/AGENTS.md.original
  cp .gitignore .tmp/install/.gitignore.original
  agentplane init \
    --setup-profile light \
    --policy-gateway codex \
    --workflow direct \
    --backend local \
    --hooks false \
    --gitignore-agents \
    --yes
  mv AGENTS.md AGENTPLANE.md
  cp .tmp/install/AGENTS.md.original AGENTS.md
  cp .tmp/install/.gitignore.original .gitignore
  git reset -q HEAD -- .gitignore >/dev/null 2>&1 || true
  git checkout -- .gitignore >/dev/null 2>&1 || true
  rm -f CLAUDE.md
fi
```

Notes:
- `AGENTPLANE.md` is generated locally by renaming the AgentPlane-installed `AGENTS.md`.
- `.agentplane/` and `AGENTPLANE.md` are local post-install state and stay untracked.
- restoring `AGENTS.md` is mandatory because the repository ships its own DEUS bootstrap entrypoint.
- restoring `.gitignore` keeps the repository-owned ignore contract intact after local AgentPlane initialization.

### 5. Validate the local AgentPlane workspace

```bash
agentplane quickstart
agentplane doctor
```

### 6. Validate the DEUS bootstrap and runtime surfaces

```bash
npm run deus:bootstrap
npm run deus:health
```

## Expected Result

After the steps above:

- the repository is checked out directly in the workspace root;
- a system `agentplane` CLI exists, installing `agentplane@latest` only when it was missing;
- the repository still owns `AGENTS.md`;
- local `.agentplane/` and local `AGENTPLANE.md` exist only after explicit post-install initialization;
- OpenClaw can bootstrap from `AGENTS.md`;
- DEUS read-only bootstrap and health checks pass.

## Notes

- `clean-install` does not ship embedded project applications under `projects/`.
- `clean-install` does not ship bundled skill packs under `skills/`.
- `clean-install` does not ship `.agentplane/`, `AGENTPLANE.md`, or any tracked AgentPlane workspace state.
- AgentPlane task history is not part of the public baseline. Local task state should be created in the installed workspace, not copied from a historical private archive.
- Projects and skills are optional overlays. Materialize them only after installation and only through explicit local workflow/task tracking.
- If this repository is later mirrored under another public remote, update only the GitHub URL above; the rest of the install contract stays the same.
