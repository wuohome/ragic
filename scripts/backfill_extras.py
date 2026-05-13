"""
backfill_extras.py — 一次性歷史回填：續約業績 + 代管業績

遍歷 mirror folder 全部歷史 sheet (113/03 ~ 115/05)，
對每個月跑 parser → 寫入 vault 全店每月業績表.md 對應月份區塊的新欄位。

只動：
  - ## X/YY 下面緊接主表格後的「全店續約業績 / 全店代管業績」一行
  - ### 個人續約 / 代管業績（X/YY）小表

不動：既有主表格、h2 section 其他內容。
Idempotent：跑第二次結果一樣。

Usage:
  python backfill_extras.py --dry-run   # 只印不寫
  python backfill_extras.py --write     # 實際寫入 vault
"""

import argparse
import re
import sys
import time
from pathlib import Path

from google.oauth2 import service_account
from googleapiclient.discovery import build

SA_KEY = Path.home() / '.claude' / 'scripts' / 'perf-sa-key.json'
MIRROR_FOLDER_ID = '1s_2wWYcRAiFV-nwIYA0-hHSKsL_DMqsw'
SA_SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/spreadsheets.readonly',
]

VAULT_MD = Path(r'C:\Second Brain\Obsidian\窩的家\管理部\全店每月業績表.md')

NAME_ALIASES = {
    'TINA': '蕭靜芳', 'TINA（蕭靜芳）': '蕭靜芳', '蕭靜芳': '蕭靜芳',
    '蕭眞儀': '張忠豪&蕭眞儀', '眞儀': '張忠豪&蕭眞儀',
    '張忠豪': '張忠豪&蕭眞儀', '忠豪': '張忠豪&蕭眞儀',
    'WEIWEI': '張忠豪&蕭眞儀', 'Weiwei': '張忠豪&蕭眞儀', 'weiwei': '張忠豪&蕭眞儀',
    '忠豪&眞儀': '張忠豪&蕭眞儀', '張忠豪、蕭眞儀': '張忠豪&蕭眞儀', '蕭眞儀、張忠豪': '張忠豪&蕭眞儀',
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
    '勁豪': '陳勁豪',
    '偉民': '林偉民',
    '李維': '李維',
}

EXCLUDE_DEVS = {'張瓊安', 'minor', '孟書', '廖崇勝', '陳泳竹'}


def normalize_name(name: str) -> str:
    return NAME_ALIASES.get(name, name)


def to_int(s) -> int:
    s = (s or '').replace(',', '').replace('\t', '').strip()
    if not s or s in ('—', '-', '_'):
        return 0
    try:
        return int(float(s))
    except ValueError:
        return 0


def get_sa_clients():
    creds = service_account.Credentials.from_service_account_file(str(SA_KEY), scopes=SA_SCOPES)
    return (
        build('drive', 'v3', credentials=creds, cache_discovery=False),
        build('sheets', 'v4', credentials=creds, cache_discovery=False),
    )


def list_mirror_files(drive) -> list:
    resp = drive.files().list(
        q=f"'{MIRROR_FOLDER_ID}' in parents and trashed=false and mimeType='application/vnd.google-apps.spreadsheet'",
        fields='files(id,name,modifiedTime)',
        pageSize=200,
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()
    return resp.get('files', [])


def parse_month_from_filename(name: str):
    """從檔名解析 (roc_year, month)，失敗回 None"""
    m = re.search(r'(\d{3})\s*年\s*(\d{1,2})\s*月', name)
    if not m:
        return None
    roc_year = int(m.group(1))
    month = int(m.group(2))
    return (roc_year, month)


def parse_extras_from_sheet(sheets, sheet_id: str) -> dict:
    """
    回傳 {name: {'renewal': int, 'mgmt': int}, ...}
    空的 tab / 非員工 tab → 自動跳過
    """
    time.sleep(1.2)
    meta = sheets.spreadsheets().get(spreadsheetId=sheet_id, includeGridData=False).execute()
    tabs = [s['properties']['title'] for s in meta['sheets']]

    result = {}

    for tab in tabs:
        try:
            time.sleep(1.2)  # Sheets API rate limit: 60 req/min per user
            data = sheets.spreadsheets().values().get(
                spreadsheetId=sheet_id,
                range=f"'{tab}'!A1:N200"
            ).execute()
            rows = data.get('values', [])
        except Exception as e:
            err_str = str(e)
            if '429' in err_str:
                print(f"  rate limit on {tab}, sleeping 60s...", file=sys.stderr)
                time.sleep(60)
                try:
                    data = sheets.spreadsheets().values().get(
                        spreadsheetId=sheet_id,
                        range=f"'{tab}'!A1:N200"
                    ).execute()
                    rows = data.get('values', [])
                except Exception as e2:
                    print(f"  warning {tab}: retry fail {e2}", file=sys.stderr)
                    continue
            else:
                print(f"  warning {tab}: fetch fail {e}", file=sys.stderr)
                continue

        if not rows or not rows[0]:
            continue

        # 取員工名（row 0 的最後非空 cell，排除「薪資表」「月」「年」「A班」「B班」字樣）
        name_raw = ''
        for cell in reversed(rows[0]):
            c = (cell or '').strip()
            if c and '薪資' not in c and '月' not in c and 'A班' not in c and 'B班' not in c and '年' not in c:
                name_raw = c
                break
        if not name_raw:
            continue

        # 確認這是員工 tab（要有「成交案源名稱」header）
        has_header = any(
            any('成交案源' in (c or '') for c in r)
            for r in rows
        )
        if not has_header:
            continue

        name = normalize_name(name_raw)
        if not name or name in EXCLUDE_DEVS or '測試' in name:
            continue

        # 解析「本月續約業績」區段 → 找「總計」row col 3
        renewal_perf = 0
        mgmt_perf = 0

        in_renewal = False
        in_mgmt_section = False  # 「（公司件）代管分租套房」section

        for r in rows:
            if not r:
                continue
            col0 = (r[0] or '').strip().rstrip('\t').strip()

            # 進入「本月續約業績」區段
            if col0 == '本月續約業績':
                in_renewal = True
                in_mgmt_section = False
                continue

            # 進入「（公司件）代管分租套房」區段
            if '（公司件）代管分租套房' in col0:
                in_renewal = False
                in_mgmt_section = True
                continue

            # 其他「（公司件）」開頭 section → 離開兩個 section
            if col0.startswith('（公司件）') and '代管分租套房' not in col0:
                in_renewal = False
                in_mgmt_section = False
                continue

            # 終止條件
            STOP_LABELS = ('獎金總計', '業務獎金', '本月租賃業績', '本月業績', '本月成交業績')
            if any(col0.startswith(x) for x in STOP_LABELS):
                in_renewal = False
                in_mgmt_section = False
                continue

            # 在「本月續約業績」找「總計」→ col 3
            if in_renewal:
                if col0.startswith('總計') or col0.startswith('合計'):
                    renewal_perf = to_int(r[3]) if len(r) > 3 else 0
                    in_renewal = False
                continue

            # 在「（公司件）代管分租套房」累加 col 3 直到「總計」
            if in_mgmt_section:
                if col0.startswith('總計') or col0.startswith('合計'):
                    in_mgmt_section = False
                    continue
                if col0.startswith(('本月', '（公司件）', '獎金', '業務獎金')):
                    in_mgmt_section = False
                    continue
                # 明細行：col 3 = 管理業績
                if len(r) > 3:
                    v = to_int(r[3])
                    mgmt_perf += v

        if name not in result:
            result[name] = {'renewal': 0, 'mgmt': 0}
        result[name]['renewal'] = result[name].get('renewal', 0) + renewal_perf
        result[name]['mgmt'] = result[name].get('mgmt', 0) + mgmt_perf

    return result


def fmt_num(n: int) -> str:
    return f"{n:,}"


def build_extras_block(ym_label: str, extras: dict) -> tuple:
    """
    回傳 (summary_line, detail_table_str)
    summary_line: **全店續約業績 X** | **全店代管業績 Y**
    detail_table_str: ### 個人續約 / 代管業績（X/YY）\n...
    """
    total_renewal = sum(v['renewal'] for v in extras.values())
    total_mgmt = sum(v['mgmt'] for v in extras.values())

    summary_line = f"**全店續約業績 {fmt_num(total_renewal)}** | **全店代管業績 {fmt_num(total_mgmt)}**"

    rows = [(n, v) for n, v in extras.items() if v['renewal'] > 0 or v['mgmt'] > 0]
    rows.sort(key=lambda x: -(x[1]['renewal'] + x[1]['mgmt']))

    lines = [
        f"### 個人續約 / 代管業績（{ym_label}）",
        "| 姓名 | 續約業績 | 代管業績 |",
        "|------|---------|---------|",
    ]
    for name, v in rows:
        lines.append(f"| {name} | {fmt_num(v['renewal'])} | {fmt_num(v['mgmt'])} |")

    detail_table = "\n".join(lines)
    return summary_line, detail_table


# ── vault md 更新邏輯 ──────────────────────────────────────────────

SUMMARY_RE = re.compile(
    r'\*\*全店續約業績[^*]*\*\*\s*\|\s*\*\*全店代管業績[^*]*\*\*'
)
DETAIL_BLOCK_RE = re.compile(
    r'### 個人續約 / 代管業績（\d{3}/\d{2}）\n(?:\|[^\n]+\n)*'
)


def find_section_bounds(text: str, h2_title: str):
    """找 ## X/YY section 的起止 (start, end)"""
    h2_pat = re.compile(r'^## ', re.MULTILINE)
    matches = list(h2_pat.finditer(text))
    for i, m in enumerate(matches):
        line_end = text.index('\n', m.start())
        title = text[m.start():line_end].strip()
        if title == h2_title:
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            return start, end
    return None, None


def inject_extras_into_section(section_text: str, ym_label: str, summary_line: str, detail_table: str) -> str:
    """
    在 section_text 內：
    1. 在「**全店業績」行後插入 / 替換 summary_line
    2. 在 section 末尾（--- 前）插入 / 替換 detail_table
    Idempotent。
    """
    # ── Step 1: summary_line ──
    total_perf_re = re.compile(r'(\*\*全店業績[^\n]*\n)')
    m = total_perf_re.search(section_text)
    if not m:
        return section_text

    after_total_line_pos = m.end()

    # 檢查之後是否已有 summary_line（可能有空行間隔）
    after_part = section_text[after_total_line_pos:]
    # 跳過空行找第一個非空行
    stripped_start = len(after_part) - len(after_part.lstrip('\n'))
    first_non_empty = after_part.lstrip('\n')
    if SUMMARY_RE.match(first_non_empty):
        # 已有 → 找到並替換
        abs_pos = after_total_line_pos + stripped_start
        summary_end = abs_pos + SUMMARY_RE.match(first_non_empty).end()
        section_text = section_text[:abs_pos] + summary_line + section_text[summary_end:]
    else:
        # 插入
        section_text = (
            section_text[:after_total_line_pos]
            + summary_line + "\n"
            + section_text[after_total_line_pos:]
        )

    # ── Step 2: detail_table ──
    existing_detail = DETAIL_BLOCK_RE.search(section_text)
    if existing_detail:
        section_text = (
            section_text[:existing_detail.start()]
            + detail_table + "\n"
            + section_text[existing_detail.end():]
        )
    else:
        # 插入在 --- 前，或 section 末尾
        sep_pos = section_text.rfind('\n---\n')
        if sep_pos != -1:
            section_text = section_text[:sep_pos] + "\n" + detail_table + "\n" + section_text[sep_pos:]
        else:
            section_text = section_text.rstrip() + "\n\n" + detail_table + "\n"

    return section_text


def update_vault_section(vault_md: Path, ym_label: str, summary_line: str, detail_table: str, dry_run: bool) -> bool:
    original = vault_md.read_text(encoding='utf-8')
    h2_title = f"## {ym_label}"
    start, end = find_section_bounds(original, h2_title)
    if start is None:
        print(f"  warning vault md 找不到 {h2_title} section，跳過")
        return False

    section_text = original[start:end]
    new_section = inject_extras_into_section(section_text, ym_label, summary_line, detail_table)

    if new_section == section_text:
        print(f"  [OK] {ym_label} 無變動（已是最新）")
        return True

    new_text = original[:start] + new_section + original[end:]

    if dry_run:
        print(f"  [DRY-RUN] {ym_label} 會寫入：")
        print(f"    summary: {summary_line}")
        print(f"    detail table 行數: {len(detail_table.splitlines())}")
        return True

    vault_md.write_text(new_text, encoding='utf-8')
    print(f"  [WRITE] {ym_label} 寫入完成")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true', help='只印不寫')
    parser.add_argument('--write', action='store_true', help='實際寫入 vault')
    parser.add_argument('--month', default=None, help='只跑指定月份如 115/03')
    args = parser.parse_args()

    if not args.dry_run and not args.write:
        print("error 請指定 --dry-run 或 --write", file=sys.stderr)
        sys.exit(1)

    dry_run = args.dry_run

    drive, sheets = get_sa_clients()
    files = list_mirror_files(drive)

    # 建立 (roc_year, month) → file dict（取 modifiedTime 最新者）
    month_files = {}
    for f in files:
        parsed = parse_month_from_filename(f['name'])
        if parsed:
            key = parsed
            if key not in month_files:
                month_files[key] = f
            else:
                if f.get('modifiedTime', '') > month_files[key].get('modifiedTime', ''):
                    month_files[key] = f

    print(f"mirror folder 共找到 {len(month_files)} 個月份 sheet")
    for k in sorted(month_files.keys()):
        print(f"  {k[0]}/{k[1]:02d}  ->  {month_files[k]['name']}")

    if args.month:
        m = re.match(r'^(\d{3})/(\d{1,2})$', args.month.strip())
        if not m:
            print(f"error --month 格式錯（要 ROC年/月，如 115/03），收到 {args.month}", file=sys.stderr)
            sys.exit(1)
        filter_key = (int(m.group(1)), int(m.group(2)))
        month_files = {k: v for k, v in month_files.items() if k == filter_key}

    grand_renewal = 0
    grand_mgmt = 0
    processed_count = 0
    results_summary = []

    for key in sorted(month_files.keys()):
        roc_year, month = key
        ym_label = f"{roc_year}/{month:02d}"
        f = month_files[key]
        sheet_id = f['id']
        print(f"\n{'='*60}")
        print(f"處理 {ym_label}  sheet: {f['name']}")

        try:
            extras = parse_extras_from_sheet(sheets, sheet_id)
        except Exception as e:
            print(f"  error parse 失敗: {e}", file=sys.stderr)
            continue

        total_renewal = sum(v['renewal'] for v in extras.values())
        total_mgmt = sum(v['mgmt'] for v in extras.values())
        print(f"  全店續約業績: {fmt_num(total_renewal)}")
        print(f"  全店代管業績: {fmt_num(total_mgmt)}")
        for name, v in sorted(extras.items(), key=lambda x: -(x[1]['renewal'] + x[1]['mgmt'])):
            if v['renewal'] > 0 or v['mgmt'] > 0:
                print(f"    {name}: 續約={fmt_num(v['renewal'])}, 代管={fmt_num(v['mgmt'])}")

        grand_renewal += total_renewal
        grand_mgmt += total_mgmt
        processed_count += 1
        results_summary.append((ym_label, total_renewal, total_mgmt, extras))

        summary_line, detail_table = build_extras_block(ym_label, extras)
        update_vault_section(VAULT_MD, ym_label, summary_line, detail_table, dry_run=dry_run)

    print(f"\n{'='*60}")
    print(f"處理完成：{processed_count} 個月")
    print(f"歷史累計全店續約業績合計：{fmt_num(grand_renewal)}")
    print(f"歷史累計全店代管業績合計：{fmt_num(grand_mgmt)}")

    # 驗算 115/03
    for ym_label, total_renewal, total_mgmt, extras in results_summary:
        if ym_label == '115/03':
            expected_renewal = 197795
            status = 'PASS' if total_renewal == expected_renewal else f'FAIL（預期 {expected_renewal:,}，實得 {total_renewal:,}）'
            print(f"\n驗算 115/03：全店續約業績 {fmt_num(total_renewal)} => {status}")
            print(f"  個人明細：")
            for name, v in sorted(extras.items(), key=lambda x: -x[1]['renewal']):
                if v['renewal'] > 0:
                    print(f"    {name}: 續約={fmt_num(v['renewal'])}, 代管={fmt_num(v['mgmt'])}")


if __name__ == '__main__':
    main()
