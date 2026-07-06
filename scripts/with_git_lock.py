#!/usr/bin/env python3
"""
共用 git 操作鎖 — 序列化跨 launchd job 對同一 repo 的 git 動作。

2026-07-06 PERFFIX 根因（見 07-04 / 07-06 log）：
com.joan.perf-update（每 15 分 :00/:15/:30/:45 觸發）跟
com.joan.perf-month-roller（每日 07:00 觸發）在 07:00 同一秒都對
/Users/9m/Projects/wuohome-ragic 做 `git fetch` + `git reset --hard origin/main`，
搶 .git/index.lock 導致其中一支 fatal 中止。
更嚴重的是：`git reset --hard` 若插進另一支「cp 完 data/perf.md 但還沒 commit」的空檔，
會直接把還沒提交的變更蓋掉——這是資料損毀風險，不只是報錯訊息而已。

用法：
    python3 with_git_lock.py <lockfile> [--timeout SEC] -- <command> [args...]

設計：
- fcntl advisory lock，OS 在 process 結束（含被 kill）時自動釋放，不會留下 stale lock，
  不需要額外的 staleness 偵測邏輯。
- 非 blocking 輪詢＋逾時（預設 180s，遠大於正常 fetch+reset+commit+push 的十幾秒），
  逾時就直接失敗退出（不無限等待）——避免萬一持鎖端網路卡住，後面所有排程堆疊等到天荒地老、
  問題被無聲吞掉。
"""
import fcntl
import os
import subprocess
import sys
import time

DEFAULT_TIMEOUT = 180  # 秒


def main():
    argv = sys.argv[1:]
    timeout = DEFAULT_TIMEOUT
    if argv[:1] == ['--timeout']:
        timeout = int(argv[1])
        argv = argv[2:]
    if len(argv) < 2 or argv[1] != '--':
        print('usage: with_git_lock.py <lockfile> [--timeout SEC] -- <command...>', file=sys.stderr)
        sys.exit(64)
    lockfile = argv[0]
    cmd = argv[2:]
    if not cmd:
        print('usage: with_git_lock.py <lockfile> [--timeout SEC] -- <command...>', file=sys.stderr)
        sys.exit(64)

    os.makedirs(os.path.dirname(lockfile) or '.', exist_ok=True)
    f = open(lockfile, 'a')
    deadline = time.monotonic() + timeout
    acquired = False
    while time.monotonic() < deadline:
        try:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            acquired = True
            break
        except BlockingIOError:
            time.sleep(1)
    if not acquired:
        print(f'[with_git_lock] 等 {timeout}s 仍搶不到鎖 {lockfile}，放棄執行'
              f'（可能另一支卡住了，需人工檢查）', file=sys.stderr)
        sys.exit(75)  # EX_TEMPFAIL

    try:
        result = subprocess.run(cmd)
    finally:
        fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        f.close()
    sys.exit(result.returncode)


if __name__ == '__main__':
    main()
