#!/bin/bash
# Mac Mini 版 perf-update（取代 Windows run-perf-update.ps1）
# 由 launchd com.joan.perf-update 每 15 分鐘（:00/:15/:30/:45）觸發
PROJECT_DIR="$HOME/Projects/wuohome-ragic"

# FIX-2026-07-06-PERFFIX-git-lock: com.joan.perf-month-roller 每天 07:00 跟本 job 的
# :00 那班同一秒觸發，兩者都對這個 repo 做 git fetch/reset/commit/push，會搶
# .git/index.lock；更嚴重的是 `git reset --hard` 若插進本腳本「cp 完 data/perf.md
# 但還沒 commit」的空檔，會把還沒提交的變更蓋掉（資料損毀風險，不只是報錯）。
# 用共用 flock（scripts/with_git_lock.py）把整支腳本序列化，涵蓋 launchd 觸發跟手動執行。
GIT_LOCK="$PROJECT_DIR/.git/wuohome-cron.lock"
if [ -z "$WUOHOME_GIT_LOCK_HELD" ]; then
  export WUOHOME_GIT_LOCK_HELD=1
  exec /opt/homebrew/bin/python3 "$PROJECT_DIR/scripts/with_git_lock.py" "$GIT_LOCK" -- \
    /bin/bash "$PROJECT_DIR/scripts/run-perf-update.sh" "$@"
fi

set -e
set -o pipefail  # 讓 tee 接的 python fail 真正中斷 sh（避免 silent commit stale data）

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

# FIX-2026-07-13-JUNEGAP: v5 roller（2026-07-02）讓當月表在每月第 1 天就自動建好，
# 導致 v4.2（2026-06-05）「當月表不存在 + 日期<=10 → fallback 抓上月」的月結補登安全網
# 事實上再也不會觸發（當月表永遠存在，update_perf_md.py 的 fetch 不會失敗進 fallback 分支）。
# 結果：上月表在月初 1~10 天內若有人補登/修正，dashboard 永遠抓不到——6 月案例：7/13
# 發現 6 月數字停在月底舊值，跟即時 GSheet 差 178,026（同仁反映「對不上」查出的根因）。
# 修法：月初 1~10 天內，正常同步當月之外，額外明確指定 --target-month 多跑一次上月，
# 不動 update_perf_md.py 內部 fetch/fallback 邏輯（那段歷史踩坑多，維持不動風險最低）。
TAIPEI_DAY=$(TZ=Asia/Taipei date +%-d)
if [ "$TAIPEI_DAY" -le 10 ]; then
  PREV_MONTH=$(TZ=Asia/Taipei python3 -c "
from datetime import datetime, timezone, timedelta
now = datetime.now(timezone(timedelta(hours=8)))
roc_year = now.year - 1911
month = now.month - 1 if now.month > 1 else 12
prev_roc_year = roc_year if now.month > 1 else roc_year - 1
print(f'{prev_roc_year}/{month:02d}')
")
  log "月結補登窗口（day<=10）→ 額外同步上月 $PREV_MONTH"
  /opt/homebrew/bin/python3 "$PROJECT_DIR/scripts/update_perf_md.py" --vault-md "$VAULT_MD" --target-month "$PREV_MONTH" 2>&1 | tee -a "$LOG_FILE"
fi

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
