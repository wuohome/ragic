#!/bin/bash
set -euo pipefail
PROJECT_DIR="$HOME/Projects/wuohome-ragic"
VAULT_MD="$HOME/Vaults/Joan/窩的家/管理部/全店每月業績表.md"
REPO_PERF_MD="$PROJECT_DIR/data/perf.md"
LOG_DIR="$HOME/Library/Logs/perf-update"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/$(date "+%Y-%m-%d").log"

{
  echo "=== $(date "+%Y-%m-%d %H:%M:%S") start ==="
  cd "$PROJECT_DIR"
  git fetch origin main
  git reset --hard origin/main

  /usr/bin/python3 "$PROJECT_DIR/scripts/update_perf_md.py" --vault-md "$VAULT_MD"

  cp "$VAULT_MD" "$REPO_PERF_MD"

  if ! git diff --quiet -- data/perf.md; then
    git add data/perf.md
    git -c user.email="bot@wuohome.local" -c user.name="perf-update-bot" \
      commit -m "auto: 業績更新 $(date "+%Y-%m-%d %H:%M")"
    git push origin main
    echo "=== pushed ==="
  else
    echo "=== no change ==="
  fi
  echo "=== $(date "+%Y-%m-%d %H:%M:%S") end ==="
} >> "$LOG_FILE" 2>&1
