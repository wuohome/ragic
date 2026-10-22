#!/usr/bin/env python3
"""業績儀表板新版（staff-dashboard-v2.html）數字對帳。

從 Ragic proxy 與 data/perf.md 抓原始資料，用這支腳本自己的算法重算每個主要數字，
再用無頭瀏覽器打開頁面、讀 window.DASH_NUMBERS 與畫面上的卡片數字，逐項比對。

用法：
  python3 scripts/verify_staff_dashboard_v2.py            # 驗線上版
  python3 scripts/verify_staff_dashboard_v2.py --local    # 驗這份 repo 的本機檔案（上線前）
--local 時瀏覽器仍開線上網址，但頁面與 data/ 由本機檔案供應；proxy 只放行 github.io 來源，本機網址會被 CORS 擋。
需要 playwright；Mac Mini 上若 HOME 被隔離，先設 PLAYWRIGHT_BROWSERS_PATH。
任何一項不符時結束碼為 1。
"""
import datetime as dt
import json
import re
import sys
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).resolve().parent.parent
PROXY = 'https://wuohome-ragic-proxy.wuohome.workers.dev'
BASE = 'https://wuohome.github.io/ragic/'
PAGE = BASE + 'staff-dashboard-v2.html'
LOCAL = '--local' in sys.argv
FOUR_TYPES = {'專任': '專任出租案', '一般': '一般出租案', '包租': '包租案', '包租代管': '包租案',
              '代管': '代管案', '專任(含代管)': '代管案', '一般(含代管)': '代管案'}
EXCLUDE = {'張瓊安', 'minor', '孟書', '廖崇勝', '陳泳竹'}


def fetch(action, params):
    # Cloudflare 擋 Python 預設 User-Agent（回 403），帶頁面同源的標頭
    req = urllib.request.Request(f'{PROXY}/{action}?{params}',
                                 headers={'User-Agent': 'Mozilla/5.0', 'Origin': 'https://wuohome.github.io'})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())


def aliases_from(path, var):
    """別名表是設定資料，直接從頁面原始碼取，避免兩份表各自漂移。"""
    src = (REPO / path).read_text(encoding='utf-8')
    body = re.search(var + r'\s*=\s*\{(.*?)\};', src, re.S).group(1)
    return dict(re.findall(r"'([^']+)'\s*:\s*'([^']+)'", body))


DASH_ALIAS = aliases_from('staff-dashboard-v2.html', 'const NAME_ALIASES')
YEAR_ALIAS = aliases_from('js/worklog-perf.js', 'const ALIASES')


def dash_name(n):
    n = (n or '').strip()
    return DASH_ALIAS.get(n, n)


def excluded(n):
    return n in EXCLUDE or '測試' in n


def num(s):
    s = (s or '').replace(',', '').replace('*', '').strip()
    try:
        v = int(float(s))
    except ValueError:
        return 0
    return v if v > 0 else 0


def perf_sections(text):
    """perf.md → {(roc_year, month): [lines]}"""
    out, cur = defaultdict(list), None
    for line in text.split('\n'):
        m = re.match(r'^##\s+(\d{3})/(\d{2})\s*$', line)
        if m:
            cur = (int(m[1]), int(m[2]))
            continue
        if cur:
            out[cur].append(line)
    return out


def main_rows(lines, alias):
    rows = {}
    for line in lines:
        if not line.startswith('|'):
            continue
        cols = [c.strip() for c in line.split('|')]
        if len(cols) < 5 or not re.fullmatch(r'\d+', cols[1].replace('*', '')):
            continue
        name = cols[2].replace('*', '').strip()
        name = alias.get(name, name)
        if not name or name == '合計':
            continue
        rows[name] = max(rows.get(name, 0), num(cols[4]))
    return rows


def extras_rows(lines):
    renewal = mgmt = 0
    inside = False
    for line in lines:
        if re.match(r'^###\s+個人續約 / 代管業績', line):
            inside = True
            continue
        if inside and (line.startswith('##') or line.startswith('---')):
            inside = False
        if not inside or not line.startswith('|'):
            continue
        cols = [c.strip() for c in line.split('|')]
        if len(cols) < 4 or cols[1] in ('姓名', '') or re.fullmatch(r'-+', cols[1]):
            continue
        renewal += int(cols[2].replace(',', '') or 0) if re.fullmatch(r'[\d,]+', cols[2] or '') else 0
        mgmt += int(cols[3].replace(',', '') or 0) if re.fullmatch(r'[\d,]+', cols[3] or '') else 0
    return renewal, mgmt


def devs_of(rec):
    listed, pos = [], defaultdict(float)
    for row in (rec.get('_subtable_1000254') or {}).values():
        n = (row.get('開發人員') or '').strip()
        if not n or excluded(n):
            continue
        n = dash_name(n)
        listed.append(n)
        try:
            r = float(row.get('比例') or 0)
        except ValueError:
            r = 0
        if r > 0:
            pos[n] += r
    if pos:
        return dict(pos), False
    uniq = list(dict.fromkeys(listed))
    return ({n: 1 / len(uniq) for n in uniq}, True) if uniq else ({}, False)


def expected():
    today = dt.date.today()
    ym = f'{today.year}-{today.month:02d}'
    roc = (today.year - 1911, today.month)
    start = (today - dt.timedelta(days=365)).strftime('%Y/%m/%d')
    end = (today + dt.timedelta(days=30)).strftime('%Y/%m/%d')
    q = lambda w: urllib.parse.quote(w, safe='')
    intake = fetch('listIntake', f'subtables=true&where={q("1000260,gte," + start)}&where={q("1000260,lte," + end)}&limit=10000')
    inventory = fetch('listInventory', 'subtables=true&limit=10000')
    goals = fetch('listGoals', 'limit=200')
    hr = fetch('listStaff', 'limit=200')
    if LOCAL:
        perf_md = (REPO / 'data/perf.md').read_text(encoding='utf-8')
    else:
        with urllib.request.urlopen(BASE + 'data/perf.md', timeout=60) as r:
            perf_md = r.read().decode('utf-8')

    intake = [c for c in intake.values() if c.get('sync_來源') != 'sync_ap16' and (c.get('委託時間(起)') or '').strip()]
    month_in = [c for c in intake if c['委託時間(起)'].strip().replace('/', '-').startswith(ym)]
    month_devs = [devs_of(c) for c in month_in]

    secs = perf_sections(perf_md)
    month_perf = {n: v for n, v in main_rows(secs.get(roc, []), DASH_ALIAS).items() if v > 0 and not excluded(n)}
    renewal, mgmt = extras_rows(secs.get(roc, []))

    goal_recs = [g for g in goals.values() if (g.get('月份') or '').strip() == ym or (g.get('月份') or '').strip().startswith(ym)]
    fl = lambda v: float(v) if re.fullmatch(r'-?[\d.]+', str(v or '').strip()) else 0.0

    inv = []
    for c in inventory.values():
        st = (c.get('狀態') or '').strip()
        if c.get('sync_來源') == 'sync_ap16' or not st or st == '下架':
            continue
        inv.append(FOUR_TYPES.get((c.get('委託類型') or '').strip()))

    year_rows = {}
    for (y, mo), lines in secs.items():
        if y == roc[0]:
            for n, v in main_rows(lines, YEAR_ALIAS).items():
                if v > 0:
                    year_rows[(mo, n)] = v
    last_mo = max(mo for (y, mo) in secs if y == roc[0])
    total, first = defaultdict(int), {}
    for (mo, n), v in year_rows.items():
        total[n] += v
        first[n] = min(first.get(n, 99), mo)
    active = {(r.get('姓名') or '').strip() for r in hr.values() if (r.get('在職狀態') or '').strip() in ('在職', '試用')}
    ranked = []
    for n, t in total.items():
        avg = round(t / (last_mo - first[n] + 1))
        for m in (n.split('&') if '&' in n else [n]):
            m = m.strip()
            if m in active and not excluded(m):
                ranked.append((round(avg / 2) if '&' in n else avg, m))
    ranked.sort(reverse=True)

    today_s = today.isoformat()
    had_case = {n for c in intake if c['委託時間(起)'].strip().replace('/', '-') <= today_s for n in devs_of(c)[0]}
    rental = [(r.get('姓名') or '').strip() for r in hr.values()
              if (r.get('部門') or '').strip() == '租賃部' and (r.get('在職狀態') or '').strip() in ('在職', '試用')]
    no_case = [n for n in dict.fromkeys(dash_name(x) for x in rental) if n not in had_case and not excluded(n)]

    return {
        'intake_count': len(month_in),
        'intake_cases': round(sum(sum(d.values()) for d, _ in month_devs), 2),
        'intake_ratio_missing': sum(1 for _, miss in month_devs if miss),
        'perf_total': sum(month_perf.values()),
        'perf_people': len(month_perf),
        'goal_perf_wan': sum(fl(g.get('業績目標(萬)')) for g in goal_recs),
        'goal_cases': sum(fl(g.get('新進案件量(間)')) for g in goal_recs),
        'renewal_month': renewal,
        'mgmt_month': mgmt,
        'inv_total': len(inv),
        'inv_excl': inv.count('專任出租案'),
        'inv_genl': inv.count('一般出租案'),
        'inv_lease': inv.count('包租案'),
        'inv_mgmt': inv.count('代管案'),
        'inv_untyped': inv.count(None),
        'year_total': sum(total.values()),
        'year_top': f'{ranked[0][1]} {ranked[0][0]}' if ranked else '',
        'no_case_people': '、'.join(sorted(no_case)),
    }


# 畫面卡片（id）↔ 登記表 key：確認使用者實際看到的數字也一樣，不只是登記表自己算對
CARDS = {'mKpiIntake': 'intake_count', 'invTotal': 'inv_total', 'invExcl': 'inv_excl', 'invGenl': 'inv_genl',
         'invLease': 'inv_lease', 'invMgmt': 'inv_mgmt', 'invUntyped': 'inv_untyped'}


def page_numbers():
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        pg.on('pageerror', lambda e: errors.append(str(e)))
        if LOCAL:
            def serve(route):
                rel = urllib.parse.unquote(urllib.parse.urlparse(route.request.url).path)[len('/ragic/'):]
                f = REPO / rel
                route.fulfill(path=str(f)) if f.is_file() else route.fulfill(status=404)
            pg.route(BASE + '**', serve)
        pg.goto(PAGE, wait_until='domcontentloaded', timeout=60000)
        pg.wait_for_function('window.DASH_NUMBERS && Object.keys(window.DASH_NUMBERS).length > 0', timeout=120000)
        nums = pg.evaluate('window.DASH_NUMBERS')
        cards = {cid: pg.inner_text('#' + cid).strip() for cid in CARDS}
        kpi_perf = pg.inner_text('#mKpiPerf').strip()
        year_rows = pg.locator('#yRankBody tbody tr').count()
        b.close()
    return nums, cards, kpi_perf, year_rows, errors


def main():
    exp = expected()
    got, cards, kpi_perf, year_rows, errors = page_numbers()
    if 'no_case_people' in got:
        got['no_case_people'] = '、'.join(sorted(filter(None, got['no_case_people'].split('、'))))
    bad = 0
    print(f'頁面：{PAGE}' + ('（本機檔案）' if LOCAL else ''))
    print(f'{"項目":<22}{"頁面":>18}{"重算":>18}  結果')
    for k, v in exp.items():
        ok = (abs(float(got.get(k, 'nan')) - float(v)) < 0.01) if isinstance(v, (int, float)) else got.get(k) == v
        bad += not ok
        print(f'{k:<22}{str(got.get(k)):>18}{str(v):>18}  {"一致" if ok else "不一致"}')
    for cid, k in CARDS.items():
        ok = cards[cid].replace(',', '') == str(exp[k])
        bad += not ok
        print(f'卡片 #{cid:<15}{cards[cid]:>18}{str(exp[k]):>18}  {"一致" if ok else "不一致"}')
    ok = kpi_perf.replace(',', '').replace('$', '').replace('NT', '').strip() == str(exp['perf_total'])
    bad += not ok
    print(f'卡片 #mKpiPerf         {kpi_perf:>18}{exp["perf_total"]:>18}  {"一致" if ok else "不一致"}')
    print(f'今年業績排行列數：{year_rows}')
    bad += year_rows == 0
    print(f'JS 錯誤：{len(errors)} 個' + ('' if not errors else '：' + '；'.join(errors[:3])))
    bad += len(errors)
    print('全部一致' if not bad else f'{bad} 項不一致')
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
