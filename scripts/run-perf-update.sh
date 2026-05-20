#!/bin/bash
# Mac Mini 版 perf-update（取代 Windows run-perf-update.ps1）
# 由 launchd com.joan.perf-update 每天 20:00 觸發
set -e
set -o pipefail  # 讓 tee 接的 python fail 真正中斷 sh（避免 silent commit stale data）

PROJECT_DIR="$HOME/Projects/wuohome-ragic"
VAULT_MD="$HOME/Vaults/Joan/窩的家/管理部/全店每月業績表.md"
REPO_PERF_MD="$PROJECT_DIR/data/perf.md"
LOG_DIR="$HOME/Library/Logs/perf-update"
LOG_FILE="$LOG_DIR/$(date +%Y-%m-%d).log"

mkdir -p "$LOG_DIR"

log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG_FILE"
}

log "=== start ==="
cd "$PROJECT_DIR"

# 同步 main
git fetch origin main 2>&1 | tee -a "$LOG_FILE" || true
git reset --hard origin/main 2>&1 | tee -a "$LOG_FILE"

# 跑 update_perf_md.py，直接吃 vault md
export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8
/opt/homebrew/bin/python3 "$PROJECT_DIR/scripts/update_perf_md.py" --vault-md "$VAULT_MD" 2>&1 | tee -a "$LOG_FILE"

# 同步 vault → repo data/
cp "$VAULT_MD" "$REPO_PERF_MD"
log "Copied vault md -> $REPO_PERF_MD"

# 變動才 commit
if ! git diff --quiet -- data/perf.md; then
  git add data/perf.md
  git -c user.email='bot@wuohome.local' -c user.name='perf-update-bot' \
    commit -m "auto: 業績更新 $(date '+%Y-%m-%d %H:%M')" 2>&1 | tee -a "$LOG_FILE"
  git push origin main 2>&1 | tee -a "$LOG_FILE"
  log "=== pushed ==="
else
  log "=== no change ==="
fi
log "=== end ==="
