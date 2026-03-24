#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   source ./scripts/load-env.sh
#   source ./scripts/load-env.sh ./projects/<project-name>/.env

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"
ROOT_ENV="$WORKSPACE_ROOT/.env"
PROJECT_ENV="${1:-}"

if [[ -f "$ROOT_ENV" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$ROOT_ENV"
  set +a
fi

if [[ -n "$PROJECT_ENV" ]]; then
  [[ "$PROJECT_ENV" = /* ]] || PROJECT_ENV="$WORKSPACE_ROOT/$PROJECT_ENV"
fi

if [[ -n "$PROJECT_ENV" && -f "$PROJECT_ENV" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$PROJECT_ENV"
  set +a
fi
