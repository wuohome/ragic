"""
每日更新 vault 業績 md（新架構：Mac Mini launchd 直寫 vault）

觸發時機：Mac Mini launchd 每天 20:00 Asia/Taipei
流程：抓 GSheet CSV → 套綽號 / 合併夫妻檔 / 排除 → idempotent merge 到 vault 全店每月業績表.md 當月區塊
      → 主程式 run-perf-update.sh cp 到 repo data/perf.md → git push

Merge 規則（idempotent 安全）：
  - GSheet 有、md 有該人 → 只更新「業績」欄；其他欄保留 md 既有值（業務獎金、管理獎金等）
  - GSheet 有、md 沒有 → append 新 row，業績從 GSheet 拿，其他欄填 —
  - GSheet 沒有、md 有 → 保留 md row 不動（Joan 可能手動加）
  - 合計 row → 業績欄重算（GSheet 有的加總），其他欄維持 —

安全閥：
  - GSheet 抓不到 / 解析到 0 筆 → abort，不動 vault
  - 寫回後驗算其他月份的 hash 完全一致，不一致 → abort + restore

# FIX-2026-04-28-perf-flow: 改為 idempotent merge，保留 Joan 已填的獎金欄
"""
import argparse
import hashlib
import re
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

CSV_URL = (
    'https://docs.google.com/spreadsheets/d/e/'
    '2PACX-1vQMZq6T_6FgypxM2PEaBmIshN0WYlObLo0cVwnCydE6Ou-M3eetzRUaIC8_McxPG-UAjS6VQAYdBWMr'
    '/pub?output=csv'
)

# 綽號 → 本名（與 js/shared.js NAME_ALIASES 保持同步）
NAME_ALIASES = {
    'TINA': '蕭靜芳', 'TINA（蕭靜芳）': '蕭靜芳',
    '蕭眞儀': '張忠豪&蕭眞儀', '眞儀': '張忠豪&蕭眞儀',
    '張忠豪': '張忠豪&蕭眞儀', '忠豪': '張忠豪&蕭眞儀',
    'WEIWEI': '張忠豪&蕭眞儀', 'Weiwei': '張忠豪&蕭眞儀', 'weiwei': '張忠豪&蕭眞儀',
    '忠豪&眞儀': '張忠豪&蕭眞儀', '張忠豪、蕭眞儀': '張忠豪&蕭眞儀', '蕭眞儀、張忠豪': '張忠豪&蕭眞儀',
    '宣佑': '林宣佑', '惠慈': '吳惠慈', '張傳': '詹張傳',
    '小碩': '劉子碩', '小鐘': '鐘晟鈺',
    '炫儒': '吳炫儒', '小炫': '吳炫儒',
    '佳燕': '林佳燕', 'Amber': '林佳燕', 'amber': '林佳燕', 'AMBER': '林佳燕',
    '心瑜': '陳心瑜', '則泓': '張則泓', '薇雅': '陳薇雅',
    '卓威': '李卓威', '小方': '方鼎文', '馬丁': '關宗宇',
    '小吳': '吳彥廷', '小吳哥': '吳彥廷',
    'jerry': '曾正煌', 'Jerry': '曾正煌', 'JERRY': '曾正煌',
    '慧慧': '張玉慧', '惠惠': '張玉慧',
    'sussana': '謝佳芬', 'Sussana': '謝佳芬',
}

EXCLUDE_DEVS = {'張瓊安', 'minor', '孟書', '廖崇勝', '陳泳竹'}
SKIP_PATTERN = re.compile(r'^(總計|合計|平均|本次|英雄|測試)')


def normalize_name(name: str) -> str:
    return NAME_ALIASES.get(name, name)


def parse_csv(text: str) -> dict:
    """解析 GSheet CSV，回傳 {姓名: 業績} dict"""
    lines = text.split('\n')[1:]  # 跳過表頭
    raw = {}
    for line in lines:
        if not line.strip():
            continue
        cols = [c.strip() for c in line.split(',')]
        for name_idx, perf_idx in [(0, 1), (3, 4)]:
            if len(cols) <= perf_idx:
                continue
            raw_name = cols[name_idx]
            if not raw_name or SKIP_PATTERN.match(raw_name):
                continue
            name = normalize_name(raw_name)
            if not name or name in EXCLUDE_DEVS:
                continue
            if '測試' in name:
                continue
            try:
                amount = int(re.sub(r'[,\s]', '', cols[perf_idx] or '0')) if cols[perf_idx] else 0
            except ValueError:
                amount = 0
            raw[name] = raw.get(name, 0) + amount

    return raw  # {name: perf_amount}


def taiwan_year_month(dt: datetime) -> str:
    """回傳民國年/月，例 '115/04'"""
    roc_year = dt.year - 1911
    return f"{roc_year}/{dt.month:02d}"


def fmt_num(n: int) -> str:
    """千分位格式"""
    return f"{n:,}"


ROW_RE = re.compile(
    r'^\|\s*\d+\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*\*\*(.+?)\*\*\s*\|'
)


def parse_existing_section_rows(section_text: str) -> dict:
    """
    從 section 的 markdown 解析既有 row（跳過合計行）。
    回傳 {姓名: {'業務獎金': val, '業績': val, '管理獎金': val, '續約獎金': val, '跳%': val, '獎金合計': val}}
    業績欄的「—」保留為 None，數字保留為 int，其他字串原樣保留。
    """
    rows = {}
    for line in section_text.split('\n'):
        # 跳過合計行
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
                    return v  # 保留原始字串（如已填的特殊值）

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


def build_merged_section(ym_label: str, gsheet_data: dict, existing_rows: dict) -> str:
    """
    Idempotent merge：
    - GSheet 有、md 有 → 只更新業績欄，其他欄保留
    - GSheet 有、md 沒有 → 新建 row，業績從 GSheet，其他欄 —
    - GSheet 沒有、md 有 → 保留不動
    排序：有業績的按降序，無業績（None）的排最後
    """
    # 合併所有人名
    all_names = set(gsheet_data.keys()) | set(existing_rows.keys())

    merged = {}
    for name in all_names:
        if name in existing_rows:
            row = dict(existing_rows[name])  # copy 保留已填欄位
        else:
            row = {'業務獎金': None, '業績': None, '管理獎金': None,
                   '續約獎金': None, '跳%': None, '獎金合計': None}

        if name in gsheet_data:
            row['業績'] = gsheet_data[name]  # 只更新業績欄

        merged[name] = row

    # 排序：業績有值的按降序，None 排最後
    def sort_key(item):
        v = item[1]['業績']
        return (0 if v is not None else 1, -(v or 0))

    sorted_rows = sorted(merged.items(), key=sort_key)

    # 計算總業績（GSheet 有的才算）
    total_perf = sum(gsheet_data.values())
    fund = total_perf // 100

    lines = [
        f"## {ym_label}",
        "",
        f"**全店業績 {fmt_num(total_perf)}** | 1% 聚餐基金 = **{fmt_num(fund)}**",
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
    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def section_hash(text: str, h2_title: str) -> Optional[str]:
    """計算指定 ## 標題 section 的 MD5"""
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
    """
    Idempotent merge 更新 vault md 當月區塊，絕對不動其他月份。
    回傳 True = 成功；False = 失敗（已還原）。
    """
    original = vault_md_path.read_text(encoding='utf-8')

    h2_pattern = re.compile(r'^## ', re.MULTILINE)
    matches = list(h2_pattern.finditer(original))

    # 收集其他月份 hash（安全閥）
    roc_h2 = re.compile(r'^## \d{3}/\d{2}\s*$')
    other_hashes = {}
    for i, m in enumerate(matches):
        line_end = original.index('\n', m.start())
        title = original[m.start():line_end].strip()
        if roc_h2.match(title) and title != f"## {ym_label}":
            start = m.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(original)
            other_hashes[title] = hashlib.md5(original[start:end].encode()).hexdigest()

    # 找當月 section 的範圍
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
        # 當月不存在 → 插入到最後一個民國年月份之後
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

    # 驗算：其他月份 hash 不變
    for title, expected_hash in other_hashes.items():
        actual = section_hash(new_text, title)
        if actual != expected_hash:
            print(f"❌ 安全閥觸發：{title} 的 hash 被改動（預期 {expected_hash}，實際 {actual}）", file=sys.stderr)
            return False

    vault_md_path.write_text(new_text, encoding='utf-8')
    print(f"✅ 寫入完成：{vault_md_path}")
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--vault-md', required=True, help='vault 業績 md 的完整路徑')
    parser.add_argument('--dry-run', action='store_true', help='只印出要寫的內容，不實際寫')
    args = parser.parse_args()

    vault_md = Path(args.vault_md)
    if not vault_md.exists():
        print(f"❌ vault md 不存在：{vault_md}", file=sys.stderr)
        sys.exit(1)

    taipei = timezone(timedelta(hours=8))
    now = datetime.now(taipei)
    ym_label = taiwan_year_month(now)
    print(f"目標月份：{ym_label}")

    # 抓 GSheet
    print(f"抓取 GSheet: {CSV_URL}")
    req = urllib.request.Request(CSV_URL, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode('utf-8')
    except Exception as e:
        print(f"❌ GSheet 抓取失敗：{e}", file=sys.stderr)
        sys.exit(1)

    gsheet_data = parse_csv(text)
    if not gsheet_data:
        print("❌ GSheet 解析到 0 筆有效資料，abort（不動 vault）", file=sys.stderr)
        sys.exit(1)

    total_perf = sum(gsheet_data.values())
    print(f"解析 {len(gsheet_data)} 人，總業績 {fmt_num(total_perf)}")

    # 讀現有 md 中當月 section（若存在）
    original = vault_md.read_text(encoding='utf-8')
    h2_pattern = re.compile(r'^## ', re.MULTILINE)
    roc_h2 = re.compile(r'^## \d{3}/\d{2}\s*$')
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

    # Idempotent merge 建出新 section
    new_section = build_merged_section(ym_label, gsheet_data, existing_rows)

    if args.dry_run:
        print("=== DRY RUN — 不寫入 vault ===")
        print(new_section)
        return

    ok = update_vault_md(vault_md, ym_label, new_section)
    if not ok:
        print("❌ vault 寫入失敗（安全閥阻擋），已放棄", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
