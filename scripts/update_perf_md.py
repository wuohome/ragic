"""
每日更新 vault 業績 md（新架構：Mac Mini launchd 直寫 vault）

觸發時機：Mac Mini launchd 每天 20:00 Asia/Taipei
流程：抓 GSheet CSV → 套綽號 / 合併夫妻檔 / 排除 → 更新 vault 全店每月業績表.md 當月區塊
      → 主程式 run-perf-update.sh cp 到 repo data/perf.md → git push

安全閥：
  - GSheet 抓不到 / 解析到 0 筆 → abort，不動 vault
  - 寫回後驗算其他月份的 hash 完全一致，不一致 → abort + restore
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


def parse_csv(text: str) -> list:
    """解析 GSheet CSV，回傳 [{'name': ..., 'perf': int}, ...]，依業績降序"""
    lines = text.split('\n')[1:]  # 跳過表頭
    raw = []
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
            # 排除含「測試」字樣
            if '測試' in name:
                continue
            try:
                amount = int(re.sub(r'[,\s]', '', cols[perf_idx] or '0')) if cols[perf_idx] else 0
            except ValueError:
                amount = 0
            raw.append({'raw': raw_name, 'name': name, 'perf': amount})

    # 合併同名（張忠豪 + WEIWEI 都 normalize 成張忠豪&蕭眞儀）
    merged = {}  # type: dict
    for r in raw:
        merged[r['name']] = merged.get(r['name'], 0) + r['perf']

    return sorted(
        [{'name': n, 'perf': p} for n, p in merged.items()],
        key=lambda x: -x['perf']
    )


def taiwan_year_month(dt: datetime) -> str:
    """回傳民國年/月，例 '115/04'"""
    roc_year = dt.year - 1911
    return f"{roc_year}/{dt.month:02d}"


def fmt_num(n: int) -> str:
    """千分位格式"""
    return f"{n:,}"


def build_section(ym_label: str, data: list, total_perf: int) -> str:
    """
    產出完整的月份 section，格式與歷史月份一致：

    ## 115/04

    **全店業績 X,XXX** | 1% 聚餐基金 = **X,XXX**

    | # | 姓名 | 業務獎金 | 業績 | 管理獎金 | 續約獎金 | 跳% | **獎金合計** |
    |---|------|---------|------|---------|---------|-----|-----------|
    | 1 | XXX | — | X,XXX | — | — | — | **—** |
    ...
    | | **合計** | **—** | **X,XXX** | **—** | **—** | **—** | **—** |

    ---
    """
    fund = total_perf // 100  # 1%
    lines = [
        f"## {ym_label}",
        "",
        f"**全店業績 {fmt_num(total_perf)}** | 1% 聚餐基金 = **{fmt_num(fund)}**",
        "",
        "| # | 姓名 | 業務獎金 | 業績 | 管理獎金 | 續約獎金 | 跳% | **獎金合計** |",
        "|---|------|---------|------|---------|---------|-----|-----------|",
    ]
    for i, row in enumerate(data, 1):
        perf_str = fmt_num(row['perf']) if row['perf'] else '—'
        lines.append(f"| {i} | {row['name']} | — | {perf_str} | — | — | — | **—** |")
    lines.append(f"| | **合計** | **—** | **{fmt_num(total_perf)}** | **—** | **—** | **—** | **—** |")
    lines.append("")
    lines.append("---")
    lines.append("")
    return "\n".join(lines)


def section_hash(text: str, h2_title: str) -> Optional[str]:
    """計算指定 ## 標題 section 的 MD5（不含當月，用來驗算其他月份不被動到）"""
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
    更新 vault md 當月區塊，絕對不動其他月份。
    回傳 True = 成功；False = 失敗（已還原）。
    """
    original = vault_md_path.read_text(encoding='utf-8')

    # 找所有 ## H2 標題的位置
    h2_pattern = re.compile(r'^## ', re.MULTILINE)
    matches = list(h2_pattern.finditer(original))

    # 收集其他月份（民國年格式 NNN/MM）的 hash
    roc_h2 = re.compile(r'^## \d{3}/\d{2}\s*$')
    other_hashes = {}  # type: dict
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
        # 替換當月 section
        new_text = original[:cur_start] + new_section + original[cur_end:]
    else:
        # 當月不存在 → 插入到最後一個民國年月份之後（「---」後換行前）
        # 找最後一個 roc h2
        last_roc_end = None
        for i, m in enumerate(matches):
            line_end = original.index('\n', m.start())
            title = original[m.start():line_end].strip()
            if roc_h2.match(title):
                last_roc_end = matches[i + 1].start() if i + 1 < len(matches) else None
        if last_roc_end is not None:
            new_text = original[:last_roc_end] + new_section + original[last_roc_end:]
        else:
            # fallback: append 到檔尾
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

    data = parse_csv(text)
    if not data:
        print("❌ GSheet 解析到 0 筆有效資料，abort（不動 vault）", file=sys.stderr)
        sys.exit(1)

    total_perf = sum(r['perf'] for r in data)
    print(f"解析 {len(data)} 人，總業績 {fmt_num(total_perf)}")

    new_section = build_section(ym_label, data, total_perf)

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
