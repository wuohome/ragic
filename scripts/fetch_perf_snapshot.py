"""
每日抓取珊珊姐的 GSheet 業績表快照，存入 data/perf-snapshots.json

觸發時機：GitHub Actions cron 每天 20:00 (Asia/Taipei)
輸出：data/perf-snapshots.json（歷史累積，供儀表板讀取 + 未來做趨勢）
"""
import json
import re
import sys
import urllib.request
from datetime import datetime, timezone, timedelta
from pathlib import Path

CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQMZq6T_6FgypxM2PEaBmIshN0WYlObLo0cVwnCydE6Ou-M3eetzRUaIC8_McxPG-UAjS6VQAYdBWMr/pub?output=csv'

OUTPUT = Path(__file__).parent.parent / 'data' / 'perf-snapshots.json'

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
SKIP_PATTERN = re.compile(r'^(總計|合計|平均|本次|英雄)')


def normalize_name(name):
    return NAME_ALIASES.get(name, name)


def parse_csv(text):
    lines = text.split('\n')[1:]  # 跳過表頭
    raw = []
    for line in lines:
        if not line.strip():
            continue
        cols = [c.strip() for c in line.split(',')]
        # A 欄（idx 0 姓名、1 業績）+ B 欄（idx 3、4）攤平
        for name_idx, perf_idx in [(0, 1), (3, 4)]:
            if len(cols) <= perf_idx:
                continue
            raw_name = cols[name_idx]
            if not raw_name or SKIP_PATTERN.match(raw_name):
                continue
            name = normalize_name(raw_name)
            if not name or name in EXCLUDE_DEVS:
                continue
            try:
                amount = int(re.sub(r'[,\s]', '', cols[perf_idx] or '0')) if cols[perf_idx] else 0
            except ValueError:
                amount = 0
            raw.append({'raw': raw_name, 'name': name, 'perf': amount})

    # 合併同人（例如 張忠豪 + WEIWEI 都 normalize 成張忠豪&蕭眞儀）
    merged = {}
    for r in raw:
        merged[r['name']] = merged.get(r['name'], 0) + r['perf']
    return [{'name': n, 'perf': p} for n, p in sorted(merged.items(), key=lambda x: -x[1])]


def main():
    print(f'抓取 GSheet: {CSV_URL}')
    req = urllib.request.Request(CSV_URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        text = resp.read().decode('utf-8')

    data = parse_csv(text)
    print(f'解析 {len(data)} 人，總業績 {sum(r["perf"] for r in data):,}')

    taipei = timezone(timedelta(hours=8))
    now = datetime.now(taipei)
    snapshot = {
        'timestamp': now.strftime('%Y-%m-%d %H:%M'),
        'ym': now.strftime('%Y-%m'),
        'weekday': '一二三四五六日'[now.weekday()],
        'data': data,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    if OUTPUT.exists():
        existing = json.loads(OUTPUT.read_text(encoding='utf-8'))
    else:
        existing = []

    # 同一個 ym 同一天已有快照 → 覆蓋；否則 append
    today_key = now.strftime('%Y-%m-%d')
    existing = [s for s in existing if not s['timestamp'].startswith(today_key)]
    existing.append(snapshot)
    existing.sort(key=lambda s: s['timestamp'])

    OUTPUT.write_text(
        json.dumps(existing, ensure_ascii=False, indent=2),
        encoding='utf-8'
    )
    print(f'寫入 {OUTPUT} — 累計 {len(existing)} 筆快照')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        print(f'❌ 失敗: {e}', file=sys.stderr)
        sys.exit(1)
