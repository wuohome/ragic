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
# 2026-11-10：update_perf_md.py 的 sanity 安全閥（當月業績全 0 等）會回非 0 並拒絕改寫 vault md。
# 以前 set -e 會讓整支腳本在這裡死掉；現在業績榜快照要照常產生（vault md 沒被改壞，快照用現有那份），所以不致命。
/opt/homebrew/bin/python3 "$PROJECT_DIR/scripts/update_perf_md.py" --vault-md "$VAULT_MD" 2>&1 | tee -a "$LOG_FILE" \
  || log "update_perf_md.py 回非 0（多半是 sanity 擋下，見上方），仍用現有 vault md 產生快照"

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
  /opt/homebrew/bin/python3 "$PROJECT_DIR/scripts/update_perf_md.py" --vault-md "$VAULT_MD" --target-month "$PREV_MONTH" 2>&1 | tee -a "$LOG_FILE" \
    || log "上月同步回非 0（見上方），略過"
fi

# 2026-11-10：業績表不再 push 到公開 repo（data/perf.md 含全店個人業績與獎金）。
# 改成產生「業績榜快照」寫進 Cloudflare KV（wuohome-ragic-proxy 的 dashData／worklogPerf，要同仁登入才拿得到）。
# build_dash_snapshot.py 需要 RAGIC_API_KEY、CLOUDFLARE_API_TOKEN（launchd 沒有環境變數，從 ~/.env 載入）與 wrangler（/opt/homebrew/bin）。
# 失敗時 KV 保留上一份快照（頁面「資料更新於」會顯示舊時間），腳本回非 0。
export PATH="/opt/homebrew/bin:$PATH"
set -a; . "$HOME/.env"; set +a
if /opt/homebrew/bin/python3 "$PROJECT_DIR/scripts/build_dash_snapshot.py" --vault-md "$VAULT_MD" 2>&1 | tee -a "$LOG_FILE"; then
  log "=== snapshot written ==="
else
  log "=== snapshot FAILED（KV 保留上一份）==="
  exit 1
fi
log "=== end ==="
