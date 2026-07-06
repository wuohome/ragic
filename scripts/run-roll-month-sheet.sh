#!/bin/bash
# 業績表月度滾動 — 由 launchd com.joan.perf-month-roller 每日 07:00 觸發
PROJECT_DIR="$HOME/Projects/wuohome-ragic"

# FIX-2026-07-06-PERFFIX-git-lock: 本 job 07:00 跟 com.joan.perf-update 的 :00 那班
# 同一秒觸發，兩者都對這個 repo 做 git fetch/reset，會搶 .git/index.lock（07-04/07-06
# 實際發生過）。用共用 flock（跟 run-perf-update.sh 同一把鎖檔）序列化，涵蓋 launchd
# 觸發跟手動執行。
GIT_LOCK="$PROJECT_DIR/.git/wuohome-cron.lock"
if [ -z "$WUOHOME_GIT_LOCK_HELD" ]; then
  export WUOHOME_GIT_LOCK_HELD=1
  exec /opt/homebrew/bin/python3 "$PROJECT_DIR/scripts/with_git_lock.py" "$GIT_LOCK" -- \
    /bin/bash "$PROJECT_DIR/scripts/run-roll-month-sheet.sh" "$@"
fi

set -e
set -o pipefail

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
