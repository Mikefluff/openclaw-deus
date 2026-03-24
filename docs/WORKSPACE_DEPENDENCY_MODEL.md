# Workspace Dependency Installation Model

> Status: approved target model, not fully implemented

## Decision

The repository will use an explicit root bootstrap layer as the single source of truth for dependency installation.

This means:

- the repository root remains a normal npm package, not an npm `workspaces` root for now;
- optional project packages may exist under `projects/<project-name>/`, but they are not part of the canonical clean-install baseline;
- the root setup flow runs `npm install` in the root and then only in discovered project directories that explicitly materialize their own `package.json`;
- root verification and doctor commands validate the discovered install surface instead of assuming `npm workspaces` or mandatory embedded apps.

## Confirmed Current State

The following facts define the currently expected install model:

- the root `package.json` has no `workspaces` field;
- `package-lock.json` exists in the repository root;
- project packages, when materialized, keep their own `package.json` and `package-lock.json`;
- existing setup guidance is fragmented and does not define one canonical clean-checkout bootstrap flow.

## Why This Model Was Chosen

This model is the lowest-risk path from the current repository state to a reproducible bootstrap contract.

Reasons:

1. Separate lockfiles already exist and reflect project-local dependency resolution.
2. Optional projects can be operationally different and are not yet managed as one tightly coupled Node monorepo.
3. A root bootstrap command can be added without reshaping package resolution, deploy assumptions, or local project workflows.
4. Later tasks can add setup, verify, and doctor surfaces immediately instead of first migrating the repository to npm `workspaces`.

## Rejected Alternative for This Phase

`npm workspaces` is not the approved model for the current stabilization phase.

Why it was not selected now:

- it would introduce a second migration problem before the bootstrap contract exists;
- it would require a deliberate decision on lockfile ownership, install topology, and project script routing;
- it would change the operational shape of the repository before current project health is even captured by a root verification matrix.

This is a defer decision, not a permanent ban. Revisit only after the explicit setup/verify flow is implemented and stable.

## Operational Consequences

The next workspace tasks should implement the decision as follows:

- `G1-T2`: add a root `setup:workspace` command that installs root dependencies and then installs each discovered project package explicitly;
- `G1-T3`: add a root verification matrix that checks root health and any materialized project-local install/test health separately;
- `G1-T5`: add a root non-network doctor command that checks manifests, lockfiles, and discovered project paths before any install attempt.

## Non-Goals

This decision does not:

- convert the repository to npm `workspaces`;
- merge lockfiles;
- claim that one-command bootstrap already exists today;
- change project-local deployment behavior.
