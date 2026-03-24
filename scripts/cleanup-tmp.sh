#!/bin/bash
# DEUS Workspace Cleanup Script
# Removes files older than 30 days from .tmp/

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_DIR="$WORKSPACE_DIR/.tmp"
DAYS_TO_KEEP=30

if [ ! -d "$TMP_DIR" ]; then
  echo "No .tmp directory found. Nothing to clean."
  exit 0
fi

# Find and remove old files
find "$TMP_DIR" -type f -mtime +$DAYS_TO_KEEP -delete 2>/dev/null || true

# Remove empty directories
find "$TMP_DIR" -type d -empty -delete 2>/dev/null || true

echo "Cleanup complete. Files older than $DAYS_TO_KEEP days removed from .tmp/"
