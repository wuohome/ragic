"""
每日更新 vault 業績 md — V2 SA 版（不再 hardcoded PUBKEY）

觸發時機：Windows Task Scheduler 每天 20:00 Asia/Taipei
流程：用 SA + Drive API 列 mirror folder → 找當月「{roc}年{月}月業績表」sheet
      → 用 Sheets API 抓所有 tabs → 套綽號 / 合併夫妻檔 / 排除
      → idempotent merge 到 vault 全店每月業績表.md 當月區塊
      → wrapper script cp 到 repo data/perf.md → git push

# FIX-2026-04-28-multisheet: 改抓所有員工 sheet 的成交明細總計（含房東+房客方）
# FIX-2026-04-28-perf-flow: idempotent merge，保留 Joan 已填的獎金欄
# FIX-2026-05-22-L50-real-fix: 母 folder 共享 SA 後改 auto-detect 主路徑，MONTH_SHEET_OVERRIDE 清空為 escape hatch
# FIX-2026-05-03-mirror-folder: 移除 hardcoded PUBKEY (鎖死 4 月 sheet → 抓到的數字被當當月寫，造成 5/2 跑時 4 月新增業績寫進 115/05)
#                                改 SA + mirror folder 動態找「{roc}年{當月}月業績表」
# FIX-2026-06-05-monthly-close-race: 找不到當月表 + 日期 ≤10 → fallback 抓上月表（月結期 race condition 修復）
"""
import os
import argparse
import csv
import hashlib
import io
import re
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

# === SA + mirror folder ===
from google.oauth2 import service_account
from googleapiclient.discovery import build

SA_KEY = Path.home() / '.claude' / 'scripts' / 'perf-sa-key.json'
MIRROR_FOLDER_ID = '1s_2wWYcRAiFV-nwIYA0-hHSKsL_DMqsw'  # legacy fallback (mirror folder，5/8 後同步已斷，保留作安全網)
PARENT_FOLDER_ID = '1izWZC2w49BJGkMoWD5c_0UtIRrI9qkHx'  # 母 folder「薪資表」owner=wuo.home@gmail.com，2026-05-22 共享 SA Reader
# L50 真正修法 2026-05-22：Joan 把母 folder 共享給 SA，改用 auto-detect 動態找月份 sheet。
# MONTH_SHEET_OVERRIDE 保留作 manual escape hatch（auto-detect 不適用的 edge case 時 Joan 可直接填）
# 正常情況 dict 應保持空白，由 auto-detect 接管。
MONTH_SHEET_OVERRIDE: dict = {
    # 格式：(roc_year, month): 'sheet_id'
    # 只在 auto-detect 無法命中（同事用奇怪命名 / 臨時狀況）時手填
}
SA_SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
]

# 綽號 → 本名
# FIX-2026-05-20-yzhen-rename: 2026-05-19 蕭眞儀改名蕭頤臻；舊名/合併 key 全 alias 到「張忠豪&蕭頤臻」(vault 正式名)
NAME_ALIASES = {
    'TINA': '蕭靜芳', 'TINA（蕭靜芳）': '蕭靜芳', '蕭靜芳': '蕭靜芳',
    '蕭頤臻': '張忠豪&蕭頤臻', '頤臻': '張忠豪&蕭頤臻',
    '蕭眞儀': '張忠豪&蕭頤臻', '眞儀': '張忠豪&蕭頤臻', '蕭真儀': '張忠豪&蕭頤臻',
    '張忠豪': '張忠豪&蕭頤臻', '忠豪': '張忠豪&蕭頤臻',
    'WEIWEI': '張忠豪&蕭頤臻', 'Weiwei': '張忠豪&蕭頤臻', 'weiwei': '張忠豪&蕭頤臻',
    '忠豪&眞儀': '張忠豪&蕭頤臻', '忠豪&頤臻': '張忠豪&蕭頤臻',
    '張忠豪、蕭眞儀': '張忠豪&蕭頤臻', '蕭眞儀、張忠豪': '張忠豪&蕭頤臻',
    '張忠豪、蕭頤臻': '張忠豪&蕭頤臻', '蕭頤臻、張忠豪': '張忠豪&蕭頤臻',
    '張忠豪&蕭眞儀': '張忠豪&蕭頤臻',
    '宣佑': '林宣佑', '惠慈': '吳惠慈', '張傳': '詹張傳',
    '小碩': '劉子碩', '小鐘': '鐘晟鈺',
    '炫儒': '吳炫儒', '小炫': '吳炫儒',
    '佳燕': '林佳燕', 'Amber': '林佳燕', 'amber': '林佳燕', 'AMBER': '林佳燕',
    '心瑜': '陳心瑜', '則泓': '張則泓', '張則泓': '張則泓',
    '薇雅': '陳薇雅', '陳薇雅': '陳薇雅',
    '卓威': '李卓威', '小方': '方鼎文', '馬丁': '關宗宇',
    '小吳': '吳彥廷', '小吳哥': '吳彥廷', '吳彥廷': '吳彥廷',
    'jerry': '曾正煌', 'Jerry': '曾正煌', 'JERRY': '曾正煌', '煌': '曾正煌',
    '慧慧': '張玉慧', '惠惠': '張玉慧',
    'sussana': '謝佳芬', 'Sussana': '謝佳芬',
    '勁豪': '陳勁豪',  # FIX-2026-04-28-jinghao-alias: Ragic 人事表是陳勁豪不是朱勁豪
    '偉民': '林偉民',
    '李維': '李維',
}

EXCLUDE_DEVS = {'張瓊安', 'minor', '孟書', '廖崇勝', '陳泳竹'}


def normalize_name(name: str) -> str:
    return NAME_ALIASES.get(name, name)


def fetch(url: str, timeout: int = 30) -> str:
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read().decode('utf-8', errors='replace')


def get_sa_clients():
    """建 SA + Drive/Sheets API client"""
    creds = service_account.Credentials.from_service_account_file(str(SA_KEY), scopes=SA_SCOPES)
    return (
        build('drive', 'v3', credentials=creds, cache_discovery=False),
        build('sheets', 'v4', credentials=creds, cache_discovery=False),
    )




def is_zero_perf_anomaly(total_perf, gsheet_data, now=None):
    """sanity check: non-day1, employees>=10, total==0 => anomaly"""
    from datetime import datetime
    now = now or datetime.now()
    if now.day == 1:
        return False
    if len(gsheet_data) < 10:
        return False
    return total_perf == 0


def maybe_alert_zero_perf(roc_year, month):
    """Send Telegram OPS alert for zero-perf anomaly. 30-min throttle."""
    import time, urllib.parse
    THROTTLE_SEC = 30 * 60
    state_file = __import__("pathlib").Path.home() / ".claude" / "state" / "perf-sanity-throttle.txt"
    now = time.time()
    if state_file.exists():
        try:
            last = float(state_file.read_text().strip())
            if now - last < THROTTLE_SEC:
                print(f"[sanity] zero-perf alert throttled (last alert {int(now - last)}s ago)", file=sys.stderr)
                return False
        except ValueError:
            pass
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(str(now))
    sys.path.insert(0, str(__import__("pathlib").Path.home() / ".claude" / "scripts"))
    try:
        from _secrets import OPS_BOT_TOKEN, OPS_CHAT_ID
    except Exception as e:
        print(f"[sanity] cannot import OPS creds: {e}", file=sys.stderr)
        return False
    msg = (
        "⚠️ 業績 cron sanity check 觸發\n"
        f"{roc_year}/{month:02d} total_perf=0 且非月初 + 員工解析 >=10\n"
        "已擋住 commit + push（避免 silent push 0 業績）\n"
        "行動：檢查源 sheet 是否被清空 / SA 權限是否被撤 / sheet ID 是否需更新"
    )
    url = f"https://api.telegram.org/bot{OPS_BOT_TOKEN}/sendMessage"
    data = urllib.parse.urlencode({"chat_id": OPS_CHAT_ID, "text": msg}).encode()
    try:
        with __import__("urllib.request", fromlist=["urlopen"]).urlopen(url, data=data, timeout=10) as r:
            r.read()
        print("[sanity] alert sent to OPS bot", file=sys.stderr)
        return True
    except Exception as e:
        print(f"[sanity] alert failed: {e}", file=sys.stderr)
        return False


def maybe_remind_new_month_sheet(roc_year, month):
    """L50 all-miss reminder: auto-detect + mirror fallback 全都找不到月份 sheet 時 fire。

    2026-05-22 升級：Joan 把母 folder 共享 SA 後，auto-detect 應天天命中；
    all-miss 代表真實異常（sheet 未建 / SA 權限問題 / 命名不對），全月每次都應 ping，
    不再限制 day 1-3。
    Throttle: 30min per trigger（同 sanity check throttle 分離）。
    """
    import time, urllib.parse
    # day <= 3 guard 已移除 — auto-detect 接管後 all-miss 全月都是異常
    THROTTLE_SEC = 30 * 60
    state_file = __import__("pathlib").Path.home() / ".claude" / "state" / "perf-newsheet-throttle.txt"
    now = time.time()
    if state_file.exists():
        try:
            last = float(state_file.read_text().strip())
            if now - last < THROTTLE_SEC:
                print(f"[L50-remind] new-sheet reminder throttled (last {int(now - last)}s ago)", file=sys.stderr)
                return False
        except ValueError:
            pass
    state_file.parent.mkdir(parents=True, exist_ok=True)
    state_file.write_text(str(now))
    sys.path.insert(0, str(__import__("pathlib").Path.home() / ".claude" / "scripts"))
    try:
        from _secrets import OPS_BOT_TOKEN, OPS_CHAT_ID
    except Exception as e:
        print(f"[L50-remind] cannot import OPS creds: {e}", file=sys.stderr)
        return False
    msg = (
        "⚠️ 業績 cron auto-detect 全 miss\n"
        f"{roc_year}/{month:02d} 母 folder + mirror folder 都找不到業績表\n"
        "可能原因：\n"
        "1. 當月業績表尚未建立（珊珊未月結）\n"
        "2. SA 對母 folder 的 Reader 被撤\n"
        f"3. 檔名不符命名規則（應含 {roc_year}年{month}月業績表）\n"
        "行動：確認後若急用，在 MONTH_SHEET_OVERRIDE 手填 sheet_id"
    )
    url = f"https://api.telegram.org/bot{OPS_BOT_TOKEN}/sendMessage"
    data = urllib.parse.urlencode({"chat_id": OPS_CHAT_ID, "text": msg}).encode()
    try:
        with __import__("urllib.request", fromlist=["urlopen"]).urlopen(url, data=data, timeout=10) as r:
            r.read()
        print("[L50-remind] all-miss reminder sent to OPS bot", file=sys.stderr)
        return True
    except Exception as e:
        print(f"[L50-remind] reminder failed: {e}", file=sys.stderr)
        return False

def _pick_exact_month_sheet(files: list, roc_year: int, month: int) -> Optional[dict]:
    """從 candidate 過濾「檔名去空格後精確 == {roc}年{month}月業績表」那張。
    避開 Drive `name contains` 分詞 match（搜「1月」會中 1~5 月全部）+ 容忍檔名尾隨空格。
    多張精確 match 才取 modifiedTime 最新。"""
    target = f"{roc_year}年{month}月業績表"
    def _norm(s):
        return (s or '').replace(' ', '').replace('　', '').strip()
    exact = [f for f in files if _norm(f.get('name')) == target]
    if not exact:
        return None
    if len(exact) > 1:
        exact = sorted(exact, key=lambda x: x.get('modifiedTime', ''), reverse=True)
    return exact[0]


def find_month_sheet(drive, roc_year: int, month: int) -> Optional[dict]:
    """search layers:
    1. MONTH_SHEET_OVERRIDE (manual escape hatch，override 優先)
    2. PARENT_FOLDER_ID auto-detect 母 folder + 檔名精確比對（主路徑）
    2.5 全 drive 精確比對（歷史月跨 folder / 檔名含尾空格，2026-05-29）
    3. MIRROR_FOLDER_ID fallback（legacy safety net）
    4. all-miss → maybe_remind_new_month_sheet

    Fault inject:
    - PERF_FORCE_MISS=1 : 強制 return None（略過全部搜尋，reminder 仍 fire）
    - PERF_DISABLE_OVERRIDE=1 : 跳過 layer 1 直接走 auto-detect（驗 auto-detect 有效性）
    """
    # ── fault inject: PERF_FORCE_MISS ──────────────────────────────────
    if os.environ.get("PERF_FORCE_MISS") == "1":
        print(f"[fault-inject] PERF_FORCE_MISS=1, forcing find_month_sheet to return None", file=sys.stderr)
        maybe_remind_new_month_sheet(roc_year, month)
        return None

    # ── layer 1: MONTH_SHEET_OVERRIDE (manual escape hatch) ────────────
    if os.environ.get("PERF_DISABLE_OVERRIDE") == "1":
        print(f"[fault-inject] PERF_DISABLE_OVERRIDE=1, skipping MONTH_SHEET_OVERRIDE", file=sys.stderr)
    else:
        override_id = MONTH_SHEET_OVERRIDE.get((roc_year, month))
        if override_id:
            print(f"✅ 使用 override sheet: {roc_year}年{month}月 -> {override_id[:20]}…")
            return {'id': override_id, 'name': f'{roc_year}年{month}月業績表 (override)'}

    # ── layer 2: auto-detect 母 folder（主路徑，2026-05-22）───────────────
    name_q = f"{roc_year}年{month}月業績表"
    try:
        resp2 = drive.files().list(
            q=(
                f'"{PARENT_FOLDER_ID}" in parents'
                f' and mimeType="application/vnd.google-apps.spreadsheet"'
                f' and name contains "{name_q}"'
                f' and trashed=false'
            ),
            fields='files(id,name,modifiedTime)',
            orderBy='modifiedTime desc',
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()
        auto_files = resp2.get('files', [])
    except Exception as e:
        print(f"[auto-detect] Drive API error: {e}", file=sys.stderr)
        auto_files = []

    # 精確比對：Drive `name contains` 是分詞 match（搜「1月」會中 1~5 月全部），
    # 不能盲取 auto_files[0]（最新），必須過濾出檔名精確相符那張
    hit = _pick_exact_month_sheet(auto_files, roc_year, month)
    if hit:
        print(f"✅ auto-detect 精確命中：{hit['name']!r} (id={hit['id'][:20]}…)")
        return hit
    if auto_files:
        print(f"⚠️  auto-detect: name contains 命中 {[f['name'] for f in auto_files]} 但無檔名精確相符，往下層", file=sys.stderr)

    print(f"⚠️  auto-detect: 母 folder 內找不到 {name_q}")

    # ── layer 2.5: 全 drive 精確比對（歷史月表常不在母 folder、檔名帶尾隨空格）──
    # 解 2026-05-29 教訓：114 年月表檔名有尾空格 + 不在母 folder → layer 2 抓不到；
    # 全 drive name contains + 去空格精確比對可命中，且避開分詞取最新抓錯月
    try:
        resp_all = drive.files().list(
            q=(
                f'mimeType="application/vnd.google-apps.spreadsheet"'
                f' and name contains "{name_q}"'
                f' and trashed=false'
            ),
            fields='files(id,name,modifiedTime)',
            orderBy='modifiedTime desc',
            pageSize=50,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()
        all_files = resp_all.get('files', [])
    except Exception as e:
        print(f"[full-drive] Drive API error: {e}", file=sys.stderr)
        all_files = []

    hit = _pick_exact_month_sheet(all_files, roc_year, month)
    if hit:
        print(f"✅ 全 drive 精確命中（跨 folder/含空格）：{hit['name']!r} (id={hit['id'][:20]}…)")
        return hit

    # ── layer 3: mirror folder fallback（legacy safety net）─────────────
    try:
        mirror_q = f"'{MIRROR_FOLDER_ID}' in parents and trashed=false and mimeType='application/vnd.google-apps.spreadsheet'"
        resp3 = drive.files().list(
            q=mirror_q,
            fields='files(id,name,modifiedTime)',
            pageSize=200,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        ).execute()
        mirror_files = resp3.get('files', [])
    except Exception as e:
        print(f"[mirror-fallback] Drive API error: {e}", file=sys.stderr)
        mirror_files = []

    # 先去空格精確比對，再 fallback 寬鬆 regex
    hit = _pick_exact_month_sheet(mirror_files, roc_year, month)
    if hit:
        print(f"✅ mirror 精確命中：{hit['name']!r} (id={hit['id'][:20]}…)")
        return hit
    pat = re.compile(rf'{roc_year}\s*年\s*0?{month}\s*月.*業績表')
    mirror_matches = [f for f in mirror_files if pat.search(f['name'])]
    if mirror_matches:
        if len(mirror_matches) > 1:
            print(f"⚠️  mirror fallback 多筆 match {[f['name'] for f in mirror_matches]}，取最新 modifiedTime")
            mirror_matches.sort(key=lambda x: x.get('modifiedTime', ''), reverse=True)
        best = mirror_matches[0]
        print(f"✅ mirror fallback 命中：{best['name']} (id={best['id'][:20]}…)")
        return best

    print(f"⚠️  mirror folder 內也找不到 {roc_year}年{month}月業績表")
    print(f"   mirror 現有檔: {[f['name'] for f in mirror_files]}")

    # ── layer 4: all-miss → reminder ───────────────────────────────────
    maybe_remind_new_month_sheet(roc_year, month)
    return None

def to_int(s) -> int:
    s = (s or '').replace(',', '').replace('\t', '').strip()
    if not s or s in ('—', '-', '_'):
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def parse_extras_from_rows(rows: list) -> tuple:
    """
    從單張員工 sheet rows 解析 renewal_perf（續約業績）和 mgmt_perf（代管業績）。
    - 「本月續約業績」區段 → 找「總計」row 的 col 3
    - 「（公司件）代管分租套房」區段 → 逐行累加 col 3，直到「總計」或下一個 section
    回傳 (renewal_perf: int, mgmt_perf: int)
    """
    renewal_perf = 0
    mgmt_perf = 0
    in_renewal = False
    in_mgmt_section = False

    for r in rows:
        if not r:
            continue
        col0 = (r[0] or '').strip().rstrip('\t').strip()

        if col0 == '本月續約業績':
            in_renewal = True
            in_mgmt_section = False
            continue

        if '（公司件）代管分租套房' in col0:
            in_renewal = False
            in_mgmt_section = True
            continue

        if col0.startswith('（公司件）') and '代管分租套房' not in col0:
            in_renewal = False
            in_mgmt_section = False
            continue

        STOP_LABELS = ('獎金總計', '業務獎金', '本月租賃業績', '本月業績', '本月成交業績')
        if any(col0.startswith(x) for x in STOP_LABELS):
            in_renewal = False
            in_mgmt_section = False
            continue

        if in_renewal:
            if col0.startswith('總計') or col0.startswith('合計'):
                renewal_perf = to_int(r[3]) if len(r) > 3 else 0
                in_renewal = False
            continue

        if in_mgmt_section:
            if col0.startswith('總計') or col0.startswith('合計'):
                in_mgmt_section = False
                continue
            if col0.startswith(('本月', '（公司件）', '獎金', '業務獎金')):
                in_mgmt_section = False
                continue
            if len(r) > 3:
                mgmt_perf += to_int(r[3])

    return renewal_perf, mgmt_perf


def parse_employee_sheet(rows: list) -> tuple:
    """
    解析單張員工 sheet（115年04月員工薪資表）。
    結構：
      row 0: 第 4 欄是員工名（例 '115年04月員工薪資表,,,煌'）
      中間有 '成交案源名稱,,獎金,業績' header row
      header 後第一個「總計」row 的第 4 欄就是「業績」（含房東+房客方）

    回傳 (姓名, 業績)；非員工 sheet（PK / 定金 log / 公司件管理）回 (None, 0) 自動 skip
    """
    if not rows or not rows[0]:
        return (None, 0)

    # 取員工名（row 0 第 4 欄、或最後一個非空 cell）
    name_raw = ''
    for cell in rows[0]:
        c = (cell or '').strip()
        if c and '薪資' not in c and '月' not in c and 'A班' not in c and 'B班' not in c:
            name_raw = c
            break

    # 找「成交案源名稱」header row
    header_idx = None
    for i, r in enumerate(rows):
        if r and any('成交案源' in (c or '') for c in r):
            header_idx = i
            break
    if header_idx is None:
        return (None, 0)  # 不是員工 sheet（PK / 公司件 / 定金 log）

    # 從 header_idx+1 起找第一個「總計 / 合計」row
    perf = 0
    for r in rows[header_idx + 1:]:
        if not r:
            continue
        first = (r[0] or '').replace('\t', '').strip()
        if first in ('總計', '合計') or first.startswith('總計') or first.startswith('合計'):
            # 業績通常在 col 3，fallback col 4
            v = to_int(r[3]) if len(r) > 3 else 0
            if v == 0 and len(r) > 4:
                v = to_int(r[4])
            perf = v
            break
    else:
        # 沒「總計」row → 加總明細直到遇到區塊邊界
        for r in rows[header_idx + 1:]:
            if not r:
                continue
            label = (r[0] or '').strip()
            if label.startswith(('總計', '合計', '（公司件', '本月', '獎金總計', '業務獎金')):
                break
            if len(r) > 3:
                perf += to_int(r[3])

    if not name_raw:
        return (None, perf)
    return (name_raw, perf)


def fetch_all_perf(roc_year: int, month: int) -> Optional[tuple]:
    """從 mirror folder 找當月 sheet → SA + Sheets API 抓所有 tabs → 解析。
       回 None = 找不到當月 sheet（珊珊還沒建 / 還沒月結），呼叫端應 skip。
       回 ({}, {}) = 找到 sheet 但解析 0 筆有效員工（異常，需檢查）。
       回 (raw_perf, extras) where:
         raw_perf = {name: perf_int}
         extras   = {name: {'renewal': int, 'mgmt': int}}
    """
    drive, sheets = get_sa_clients()
    f = find_month_sheet(drive, roc_year, month)
    if not f:
        return None
    sheet_id = f['id']
    sheet_name = f['name']
    print(f"✅ 找到當月 sheet: {sheet_name} (id={sheet_id[:20]}…)")

    # 列所有 tabs
    meta = sheets.spreadsheets().get(spreadsheetId=sheet_id, includeGridData=False).execute()
    tabs = [s['properties']['title'] for s in meta['sheets']]
    print(f"{len(tabs)} 個 tabs")
    print(f"{'TAB':<14}  {'NAME':<14}  {'PERF':>10}  {'RENEWAL':>10}  {'MGMT':>10}")
    print('-' * 65)

    raw = {}
    extras = {}
    for tab in tabs:
        try:
            data = sheets.spreadsheets().values().get(
                spreadsheetId=sheet_id,
                range=f"'{tab}'!A1:N200"
            ).execute()
            rows = data.get('values', [])
        except Exception as e:
            print(f"{tab:<14}  fetch fail: {e}", file=sys.stderr)
            continue

        name_raw, perf = parse_employee_sheet(rows)
        renewal_perf, mgmt_perf = parse_extras_from_rows(rows)
        display_name = name_raw or '(非員工 sheet)'
        print(f"{tab:<14}  {display_name:<14}  {perf:>10,}  {renewal_perf:>10,}  {mgmt_perf:>10,}")

        if name_raw is None:
            continue
        name = normalize_name(name_raw)
        if not name or name in EXCLUDE_DEVS or '測試' in name:
            continue
        raw[name] = raw.get(name, 0) + perf
        if name not in extras:
            extras[name] = {'renewal': 0, 'mgmt': 0}
        extras[name]['renewal'] += renewal_perf
        extras[name]['mgmt'] += mgmt_perf

    print('-' * 65)
    print(f"員工解析人數：{len(raw)}（合計 {sum(raw.values()):,}）")
    total_renewal = sum(v['renewal'] for v in extras.values())
    total_mgmt = sum(v['mgmt'] for v in extras.values())
    print(f"全店續約業績：{fmt_num(total_renewal)}  全店代管業績：{fmt_num(total_mgmt)}")
    return raw, extras


def taiwan_year_month(dt: datetime) -> str:
    roc_year = dt.year - 1911
    return f"{roc_year}/{dt.month:02d}"


def fmt_num(n: int) -> str:
    return f"{n:,}"


ROW_RE = re.compile(
    r'^\|\s*\d+\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*\*\*(.+?)\*\*\s*\|'
)


def parse_existing_section_rows(section_text: str) -> dict:
    """從既有 md section 解析 row（跳過合計行）"""
    rows = {}
    for line in section_text.split('\n'):
        if '**合計**' in line:
            continue
        m = ROW_RE.match(line)
        if m:
            name = m.group(1).strip()

            def parse_val(v):
                v = v.strip()
                if v == '—':
                    return None
                try:
                    return int(re.sub(r'[,\s]', '', v))
                except ValueError:
                    return v

            rows[name] = {
                '業務獎金': parse_val(m.group(2)),
                '業績':     parse_val(m.group(3)),
                '管理獎金': parse_val(m.group(4)),
                '續約獎金': parse_val(m.group(5)),
                '跳%':      parse_val(m.group(6)),
                '獎金合計': parse_val(m.group(7)),
            }
    return rows


def render_val(v) -> str:
    if v is None:
        return '—'
    if isinstance(v, int):
        return fmt_num(v)
    return str(v)


def build_merged_section(ym_label: str, gsheet_data: dict, existing_rows: dict,
                         extras: Optional[dict] = None) -> str:
    """idempotent merge：只動業績欄，其他保留 Joan 已填值。
    extras = {name: {'renewal': int, 'mgmt': int}}，用來附加續約/代管資訊。
    """
    all_names = set(gsheet_data.keys()) | set(existing_rows.keys())

    merged = {}
    for name in all_names:
        if name in existing_rows:
            row = dict(existing_rows[name])
        else:
            row = {'業務獎金': None, '業績': None, '管理獎金': None,
                   '續約獎金': None, '跳%': None, '獎金合計': None}
        if name in gsheet_data and gsheet_data[name] > 0:
            row['業績'] = gsheet_data[name]
        merged[name] = row

    def sort_key(item):
        v = item[1]['業績']
        return (0 if v is not None else 1, -(v or 0))

    sorted_rows = sorted(merged.items(), key=sort_key)

    total_perf = sum(gsheet_data.values())
    fund = total_perf // 100

    # 額外業績摘要
    total_renewal = sum(v['renewal'] for v in extras.values()) if extras else 0
    total_mgmt = sum(v['mgmt'] for v in extras.values()) if extras else 0

    lines = [
        f"## {ym_label}",
        "",
        f"**全店業績 {fmt_num(total_perf)}** | 1% 聚餐基金 = **{fmt_num(fund)}**",
        f"**全店續約業績 {fmt_num(total_renewal)}** | **全店代管業績 {fmt_num(total_mgmt)}**",
        "",
        "| # | 姓名 | 業務獎金 | 業績 | 管理獎金 | 續約獎金 | 跳% | **獎金合計** |",
        "|---|------|---------|------|---------|---------|-----|-----------|",
    ]
    for i, (name, row) in enumerate(sorted_rows, 1):
        lines.append(
            f"| {i} | {name} | {render_val(row['業務獎金'])} | {render_val(row['業績'])} | "
            f"{render_val(row['管理獎金'])} | {render_val(row['續約獎金'])} | {render_val(row['跳%'])} | "
            f"**{render_val(row['獎金合計'])}** |"
        )
    lines.append(
        f"| | **合計** | **—** | **{fmt_num(total_perf)}** | **—** | **—** | **—** | **—** |"
    )
    lines.append("")

    # 個人續約 / 代管業績小表
    if extras:
        extra_rows = [(n, v) for n, v in extras.items() if v['renewal'] > 0 or v['mgmt'] > 0]
        extra_rows.sort(key=lambda x: -(x[1]['renewal'] + x[1]['mgmt']))
        if extra_rows:
            lines.append(f"### 個人續約 / 代管業績（{ym_label}）")
            lines.append("| 姓名 | 續約業績 | 代管業績 |")
            lines.append("|------|---------|---------|")
            for name, v in extra_rows:
                lines.append(f"| {name} | {fmt_num(v['renewal'])} | {fmt_num(v['mgmt'])} |")
            lines.append("")

    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def section_hash(text: str, h2_title: str) -> Optional[str]:
    pattern = re.compile(r'^## ', re.MULTILINE)
    matches = list(pattern.finditer(text))
    for i, m in enumerate(matches):
        line_end = text.index('\n', m.start())
        title = text[m.start():line_end].strip()
        if title == h2_title:
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            return hashlib.md5(text[start:end].encode()).hexdigest()
    return None


def update_vault_md(vault_md_path: Path, ym_label: str, new_section: str) -> bool:
    """idempotent 寫入當月 section，安全閥驗其他月份不變"""
    original = vault_md_path.read_text(encoding='utf-8')

    h2_pattern = re.compile(r'^## ', re.MULTILINE)
    matches = list(h2_pattern.finditer(original))

    roc_h2 = re.compile(r'^## \d{3}/\d{2}\s*$')
    other_hashes = {}
    for i, m in enumerate(matches):
        line_end = original.index('\n', m.start())
        title = original[m.start():line_end].strip()
        if roc_h2.match(title) and title != f"## {ym_label}":
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(original)
            other_hashes[title] = hashlib.md5(original[start:end].encode()).hexdigest()

    target_title = f"## {ym_label}"
    cur_start = cur_end = None
    for i, m in enumerate(matches):
        line_end = original.index('\n', m.start())
        title = original[m.start():line_end].strip()
        if title == target_title:
            cur_start = m.start()
            cur_end = matches[i + 1].start() if i + 1 < len(matches) else len(original)
            break

    if cur_start is not None:
        new_text = original[:cur_start] + new_section + original[cur_end:]
    else:
        last_roc_end = None
        for i, m in enumerate(matches):
            line_end = original.index('\n', m.start())
            title = original[m.start():line_end].strip()
            if roc_h2.match(title):
                last_roc_end = matches[i + 1].start() if i + 1 < len(matches) else None
        if last_roc_end is not None:
            new_text = original[:last_roc_end] + new_section + original[last_roc_end:]
        else:
            new_text = original.rstrip() + "\n\n" + new_section

    for title, expected_hash in other_hashes.items():
        actual = section_hash(new_text, title)
        if actual != expected_hash:
            print(f"❌ 安全閥觸發：{title} hash 變動（預期 {expected_hash}，實際 {actual}）", file=sys.stderr)
            return False

    vault_md_path.write_text(new_text, encoding='utf-8')
    print(f"✅ 寫入完成：{vault_md_path}")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--vault-md', required=True, help='vault 業績 md 完整路徑')
    parser.add_argument('--dry-run', action='store_true', help='只印不寫')
    parser.add_argument('--target-month', default=None,
                        help='手動指定 ROC 月份「{roc}/{月}」如 115/04，預設用當下系統時間')
    args = parser.parse_args()

    vault_md = Path(args.vault_md)
    if not vault_md.exists():
        print(f"❌ vault md 不存在：{vault_md}", file=sys.stderr)
        sys.exit(1)

    if args.target_month:
        m = re.match(r'^(\d{3})/(\d{1,2})$', args.target_month.strip())
        if not m:
            print(f"❌ --target-month 格式錯（要 ROC 年/月，如 115/04），收到 {args.target_month}", file=sys.stderr)
            sys.exit(1)
        roc_year = int(m.group(1))
        month = int(m.group(2))
        ym_label = f"{roc_year}/{month:02d}"
    else:
        taipei = timezone(timedelta(hours=8))
        now = datetime.now(taipei)
        roc_year = now.year - 1911
        month = now.month
        ym_label = taiwan_year_month(now)
    print(f"目標月份：{ym_label}")

    fetch_result = fetch_all_perf(roc_year, month)
    if fetch_result is None:
        # FIX-2026-06-05-monthly-close-race: 當月表不存在時，月結期（1~10日）繼續嘗試上月表。
        # 背景：珊珊在月結期（1~10日）仍會更新上月業績表；但腳本只找當月表，找不到就 skip，
        # 導致 cron 每輪都 "no change"，上月補填的數字永遠抓不回來。
        # 修法：找不到當月表 + 日期 ≤10 → fallback 抓上月表（用當月 ym_label 寫進 md 所屬月份區塊）。
        if not args.target_month:
            taipei = timezone(timedelta(hours=8))
            _now = datetime.now(taipei)
            if _now.day <= 10:
                prev_month = month - 1 if month > 1 else 12
                prev_roc_year = roc_year if month > 1 else roc_year - 1
                prev_ym_label = f"{prev_roc_year}/{prev_month:02d}"
                print(f"⏩  當月表不存在，月結期 fallback → 嘗試上月 {prev_ym_label}")
                fetch_result = fetch_all_perf(prev_roc_year, prev_month)
                if fetch_result is not None:
                    roc_year, month, ym_label = prev_roc_year, prev_month, prev_ym_label
                    print(f"✅  月結 fallback 成功，改寫 {ym_label}")
        if fetch_result is None:
            print(f"⏭  skip：當月 sheet 還沒建（珊珊未月結）— 不寫 markdown，留待下輪")
            sys.exit(0)
    gsheet_data, extras = fetch_result
    if not gsheet_data:
        print("❌ 解析到 0 筆有效員工業績（sheet 找到但解析空），abort", file=sys.stderr)
        sys.exit(1)

    total_perf = sum(gsheet_data.values())
    print(f"全店合計：{fmt_num(total_perf)}（{len(gsheet_data)} 人）")

    # ── fault injection hook（tester 用 PERF_FORCE_ZERO=1 觸發）───────────────────────
    if os.environ.get("PERF_FORCE_ZERO") == "1":
        print("[sanity] PERF_FORCE_ZERO=1 detected, forcing total_perf=0 for fault injection test", file=sys.stderr)
        total_perf = 0
        gsheet_data = {f"emp{i}": 0 for i in range(15)}  # 確保 len>=10

    # ── L51 sanity check：0 業績異常擋寫入 ─────────────────────
    if is_zero_perf_anomaly(total_perf, gsheet_data):
        print(f"[sanity] ⚠️ {roc_year}/{month} 0 業績異常，中止寫入", file=sys.stderr)
        maybe_alert_zero_perf(roc_year, month)
        sys.exit(2)

    original = vault_md.read_text(encoding='utf-8')
    h2_pattern = re.compile(r'^## ', re.MULTILINE)
    matches = list(h2_pattern.finditer(original))
    target_title = f"## {ym_label}"
    existing_section_text = ''
    for i, m in enumerate(matches):
        line_end = original.index('\n', m.start())
        title = original[m.start():line_end].strip()
        if title == target_title:
            cur_start = m.start()
            cur_end = matches[i + 1].start() if i + 1 < len(matches) else len(original)
            existing_section_text = original[cur_start:cur_end]
            break

    existing_rows = parse_existing_section_rows(existing_section_text) if existing_section_text else {}
    print(f"既有 md row 數：{len(existing_rows)}")

    new_section = build_merged_section(ym_label, gsheet_data, existing_rows, extras=extras)

    if args.dry_run:
        print("=== DRY RUN — 不寫入 vault ===")
        print(new_section)
        return

    ok = update_vault_md(vault_md, ym_label, new_section)
    if not ok:
        print("❌ vault 寫入失敗（安全閥阻擋）", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
