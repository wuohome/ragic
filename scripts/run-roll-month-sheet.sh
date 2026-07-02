#!/bin/bash
# 業績表月度滾動 — 由 launchd com.joan.perf-month-roller 每日 07:00 觸發
set -e
set -o pipefail

PROJECT_DIR="$HOME/Projects/wuohome-ragic"
LOG_DIR="$HOME/Library/Logs/perf-month-roller"
LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d).log"

mkdir -p "$LOG_DIR"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG_FILE"
}

log "=== start ==="
cd "$PROJECT_DIR"

# 同步 main（確保跑的是 repo 最新版）
git fetch origin main 2>&1 | tee -a "$LOG_FILE" || true
git reset --hard origin/main 2>&1 | tee -a "$LOG_FILE"

export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8
/opt/homebrew/bin/python3 "$PROJECT_DIR/scripts/roll_month_sheet.py" 2>&1 | tee -a "$LOG_FILE"

log "=== end ==="
