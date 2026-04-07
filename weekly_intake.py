"""
進案量排行榜 — 從 Ragic 租賃物件抓近半年資料，產出可前端篩選日期的 HTML 儀表板。

預設顯示本週（週一~週日），使用者可在頁面上切換任意區間。
另外把當週快照存成 Markdown 報表歸檔到 OB。

用法:
    python weekly_intake.py                # 本週快照
    python weekly_intake.py 2026-03-30     # 指定該週的週一日期當快照
"""
import os, sys, json, html, urllib.request, urllib.parse
from datetime import date, timedelta, datetime
from collections import Counter
from pathlib import Path

API_KEY = os.environ.get("RAGIC_API_KEY")
if not API_KEY:
    sys.exit("❌ 請先設定環境變數 RAGIC_API_KEY（複製 .env.example 為 .env）")

BASE = "https://ap15.ragic.com/wuohome/operation/4"  # 物件總表（含下架）
FIELD_START = "1000260"  # 委託時間(起)

# 輸出位置（可用環境變數覆蓋）
OUT_DIR = Path(os.environ.get("INTAKE_MD_DIR", "./reports"))
HTML_OUT = Path(os.environ.get("INTAKE_HTML_OUT", "./dist/intake-ranking.html"))

LOOKBACK_DAYS = 365  # 預先載入近一年資料供前端篩選


def this_week_range(today: date):
    mon = today - timedelta(days=today.weekday())
    return mon, mon + timedelta(days=6)


def fetch_range(start: date, end: date):
    qs = (
        "api=&subtables=true"
        f"&where={urllib.parse.quote(f'{FIELD_START},gte,{start:%Y/%m/%d}')}"
        f"&where={urllib.parse.quote(f'{FIELD_START},lte,{end:%Y/%m/%d}')}"
        "&limit=10000"
    )
    req = urllib.request.Request(
        f"{BASE}?{qs}",
        headers={"Authorization": "Basic " + API_KEY},
    )
    return json.loads(urllib.request.urlopen(req, timeout=120).read())


def normalize_district(d: str):
    return d.split("|", 1)[1] if d and "|" in d else (d or "")


def fmt_rent(v):
    try:
        return f"{int(float(v)):,}"
    except Exception:
        return v or "—"


def extract_developers(c):
    """從子表 _subtable_1000254 抽出 [(姓名, 比例 0~1)]，過濾比例為 0 的"""
    sub = c.get("_subtable_1000254") or {}
    devs = []
    for row in sub.values():
        name = (row.get("開發人員") or "").strip()
        if not name:
            continue
        try:
            ratio = float(row.get("比例") or 0)
        except Exception:
            ratio = 0
        if ratio > 0:
            devs.append({"name": name, "ratio": ratio})
    return devs


def to_records(rows: dict):
    """壓成 JS 用的精簡記錄"""
    out = []
    for c in rows.values():
        d = c.get("委託時間(起)", "") or ""
        if not d:
            continue
        devs = extract_developers(c)
        # 顯示用字串：張忠豪(100%)、蕭眞儀(0%) — 0% 不列
        people_str = "、".join(f"{x['name']}({int(round(x['ratio']*100))}%)" for x in devs) \
            or (c.get("開發人員", "") or "")
        out.append({
            "date": d.replace("/", "-"),
            "name": c.get("案名", "") or "",
            "city": c.get("縣市", "") or "",
            "district": normalize_district(c.get("鄉鎮市區", "") or ""),
            "rent": fmt_rent(c.get("月租金")),
            "people": people_str,
            "devs": devs,  # [{name, ratio}]
            "status": c.get("狀態", "") or "",
        })
    out.sort(key=lambda x: x["date"])
    return out


# ---------- Markdown 歸檔（保留） ----------
def build_md(mon, sun, records):
    week = [r for r in records if mon.isoformat() <= r["date"] <= sun.isoformat()]
    m_start = mon.replace(day=1)
    if m_start.month == 12:
        m_end = m_start.replace(year=m_start.year + 1, month=1) - timedelta(days=1)
    else:
        m_end = m_start.replace(month=m_start.month + 1) - timedelta(days=1)
    month = [r for r in records if m_start.isoformat() <= r["date"] <= m_end.isoformat()]

    counter = Counter()
    for r in month:
        for d in r.get("devs", []):
            counter[d["name"]] += d["ratio"]

    iso_year, iso_week, _ = mon.isocalendar()
    L = [
        "---", "tags: [報表, 進案量, 開發量, 週報]",
        f"updated: {date.today():%Y-%m-%d}",
        "source: Ragic 租賃物件 (property-data-kept/10)", "---", "",
        f"# {iso_year}-W{iso_week:02d} 週進案量報表", "",
        "> [!info] 區間",
        f"> {mon:%Y-%m-%d}（一） ~ {sun:%Y-%m-%d}（日）",
        f"> 全店進案量：**{len(week):,} 件**", "",
        f"## 開發量排行榜（{m_start:%Y-%m} 月累計）", "",
        f"> 全月進案 **{len(month):,} 件**", "",
        "| 名次 | 開發人員 | 進案件數 |", "|---:|---|---:|",
    ]
    for i, (p, n) in enumerate(counter.most_common(), 1):
        L.append(f"| {i} | {p} | {n:.2f} |")
    if not counter:
        L.append("| — | （本月無新進案） | 0 |")
    L += ["", "## 進案明細", "",
          "| 委託日 | 案名 | 縣市 | 行政區 | 月租 | 開發人員 |",
          "|---|---|---|---|---:|---|"]
    for r in week:
        L.append(f"| {r['date']} | {r['name']} | {r['city']} | {r['district']} | {r['rent']} | {r['people']} |")
    return "\n".join(L)


# ---------- HTML ----------
HTML_TPL = r"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>窩的家｜進案量排行榜</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body{font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;}
  .medal-1{background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#78350f;}
  .medal-2{background:linear-gradient(135deg,#e5e7eb,#9ca3af);color:#374151;}
  .medal-3{background:linear-gradient(135deg,#fdba74,#c2410c);color:#fff;}
  .bar{transition:width .8s cubic-bezier(.4,0,.2,1);}
  .chip{cursor:pointer;transition:all .15s;}
  .chip:hover{background:#dbeafe;}
  .chip.active{background:#2563eb;color:white;}
</style>
</head>
<body class="bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen">
  <div class="max-w-5xl mx-auto px-6 py-10">

    <header class="mb-8">
      <h1 class="text-4xl font-black text-slate-900">📊 窩的家 進案量排行榜</h1>
      <p class="text-slate-500 mt-2">資料來源：Ragic 物件總表（含下架）　|　最後更新：__UPDATED__　|　收錄區間：__DATA_RANGE__</p>
    </header>

    <!-- 區間選擇 -->
    <section class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-8">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <label class="text-sm text-slate-500">起</label>
          <input id="dateStart" type="date" class="border border-slate-200 rounded-lg px-3 py-2 text-sm">
        </div>
        <div class="flex items-center gap-2">
          <label class="text-sm text-slate-500">迄</label>
          <input id="dateEnd" type="date" class="border border-slate-200 rounded-lg px-3 py-2 text-sm">
        </div>
        <div class="flex flex-wrap gap-2 ml-auto">
          <span class="chip px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium" data-preset="thisWeek">本週</span>
          <span class="chip px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium" data-preset="lastWeek">上週</span>
          <span class="chip px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium" data-preset="thisMonth">本月</span>
          <span class="chip px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium" data-preset="lastMonth">上月</span>
          <span class="chip px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium" data-preset="last30">近30天</span>
          <span class="chip px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium" data-preset="last90">近90天</span>
        </div>
      </div>
    </section>

    <!-- 數字大卡 -->
    <section class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div class="text-slate-500 text-sm mb-1">區間進案總數</div>
        <div class="flex items-baseline gap-2">
          <div id="kpiTotal" class="text-5xl font-black text-blue-600">0</div>
          <div class="text-slate-400">件</div>
        </div>
      </div>
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div class="text-slate-500 text-sm mb-1">參與開發人數</div>
        <div class="flex items-baseline gap-2">
          <div id="kpiPeople" class="text-5xl font-black text-emerald-600">0</div>
          <div class="text-slate-400">人</div>
        </div>
      </div>
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div class="text-slate-500 text-sm mb-1">日均進案</div>
        <div class="flex items-baseline gap-2">
          <div id="kpiAvg" class="text-5xl font-black text-purple-600">0</div>
          <div class="text-slate-400">件/日</div>
        </div>
      </div>
    </section>

    <!-- 排行榜 -->
    <section class="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 mb-8">
      <h2 class="text-2xl font-bold text-slate-900 mb-1">🏆 開發量排行榜</h2>
      <p class="text-slate-500 text-sm mb-6">依 Ragic 開發業務子表的「比例」加總計算（例：張忠豪 100%＋蕭眞儀 0% → 張忠豪 1 間、蕭眞儀 0 間）</p>
      <div id="ranking" class="space-y-3"></div>
    </section>

    <!-- 明細 -->
    <section class="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 mb-8">
      <h2 class="text-2xl font-bold text-slate-900 mb-6">📋 進案明細</h2>
      <div id="detail" class="overflow-x-auto"></div>
    </section>

    <footer class="text-center text-slate-400 text-xs py-6">
      Generated by weekly_intake.py　•　窩的家系統部
    </footer>
  </div>

<script>
const DATA = __DATA__;

function ymd(d){const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;}
function thisMonday(){const d=new Date();const w=(d.getDay()+6)%7;d.setDate(d.getDate()-w);return d;}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}

const presets={
  thisWeek:()=>{const m=thisMonday();return [m,addDays(m,6)];},
  lastWeek:()=>{const m=addDays(thisMonday(),-7);return [m,addDays(m,6)];},
  thisMonth:()=>{const d=new Date();return [new Date(d.getFullYear(),d.getMonth(),1),new Date(d.getFullYear(),d.getMonth()+1,0)];},
  lastMonth:()=>{const d=new Date();return [new Date(d.getFullYear(),d.getMonth()-1,1),new Date(d.getFullYear(),d.getMonth(),0)];},
  last30:()=>{const d=new Date();return [addDays(d,-29),d];},
  last90:()=>{const d=new Date();return [addDays(d,-89),d];},
};

function escapeHtml(s){return (s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function fmtCount(n){return Number.isInteger(n)?String(n):n.toFixed(2).replace(/\.?0+$/,'');}

function render(){
  const start=document.getElementById('dateStart').value;
  const end=document.getElementById('dateEnd').value;
  if(!start||!end||start>end){return;}
  const rows=DATA.filter(r=>r.date>=start && r.date<=end);

  // KPI — 用子表的「比例」加總當開發間數
  const counter={};
  rows.forEach(r=>(r.devs||[]).forEach(d=>counter[d.name]=(counter[d.name]||0)+d.ratio));
  const days=(new Date(end)-new Date(start))/86400000+1;
  document.getElementById('kpiTotal').textContent=rows.length;
  document.getElementById('kpiPeople').textContent=Object.keys(counter).length;
  document.getElementById('kpiAvg').textContent=(rows.length/days).toFixed(1);

  // 排行榜
  const items=Object.entries(counter).sort((a,b)=>b[1]-a[1]);
  const top=items[0]?items[0][1]:1;
  const medals=['medal-1','medal-2','medal-3'];
  const icons=['🥇','🥈','🥉'];
  const rankHtml=items.length===0
    ? '<div class="text-center text-slate-400 py-8">此區間無進案</div>'
    : items.map((it,i)=>{
        const [name,n]=it;
        const pct=Math.round(n/top*100);
        const badge=i<3
          ? `<span class="${medals[i]} w-10 h-10 rounded-full flex items-center justify-center font-black text-lg">${icons[i]}</span>`
          : `<span class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-slate-400 bg-slate-100">${i+1}</span>`;
        return `<div class="flex items-center gap-4">${badge}<div class="flex-1"><div class="flex justify-between mb-1"><span class="font-bold text-slate-800">${escapeHtml(name)}</span><span class="font-black text-slate-900">${fmtCount(n)} <span class="text-sm text-slate-400 font-normal">間</span></span></div><div class="h-2 bg-slate-100 rounded-full overflow-hidden"><div class="bar h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" style="width:${pct}%"></div></div></div></div>`;
      }).join('');
  document.getElementById('ranking').innerHTML=rankHtml;

  // 明細
  const detailHtml=rows.length===0
    ? '<div class="text-center text-slate-400 py-8">此區間無進案</div>'
    : `<table class="w-full"><thead><tr class="text-left text-xs font-semibold text-slate-500 uppercase border-b-2 border-slate-200"><th class="py-2 px-2">委託日</th><th class="py-2 px-2">案名</th><th class="py-2 px-2">狀態</th><th class="py-2 px-2">地區</th><th class="py-2 px-2 text-right">月租</th><th class="py-2 px-2">開發人員</th></tr></thead><tbody>${
      rows.map(r=>{
        const off=r.status==='下架';
        const rowCls=off?'bg-slate-100 text-slate-400':'';
        const tag=off
          ?'<span class="px-2 py-0.5 text-xs rounded-full bg-slate-300 text-slate-600">下架</span>'
          :`<span class="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700">${escapeHtml(r.status||'—')}</span>`;
        const nameCls=off?'line-through':'text-slate-900';
        return `<tr class="border-b border-slate-100 hover:bg-slate-50 ${rowCls}"><td class="py-3 px-2 text-sm whitespace-nowrap">${escapeHtml(r.date)}</td><td class="py-3 px-2 font-medium ${nameCls}">${escapeHtml(r.name)}</td><td class="py-3 px-2">${tag}</td><td class="py-3 px-2 text-sm">${escapeHtml(r.city+' '+r.district)}</td><td class="py-3 px-2 text-right font-mono">${escapeHtml(r.rent)}</td><td class="py-3 px-2 text-sm">${escapeHtml(r.people)}</td></tr>`;
      }).join('')
    }</tbody></table>`;
  document.getElementById('detail').innerHTML=detailHtml;
}

function applyPreset(name){
  const [s,e]=presets[name]();
  document.getElementById('dateStart').value=ymd(s);
  document.getElementById('dateEnd').value=ymd(e);
  document.querySelectorAll('.chip').forEach(c=>c.classList.toggle('active',c.dataset.preset===name));
  render();
}

document.querySelectorAll('.chip').forEach(c=>c.addEventListener('click',()=>applyPreset(c.dataset.preset)));
document.getElementById('dateStart').addEventListener('change',()=>{document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));render();});
document.getElementById('dateEnd').addEventListener('change',()=>{document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));render();});

// 預設本週
applyPreset('thisWeek');
</script>
</body>
</html>"""


def main():
    if len(sys.argv) > 1:
        mon = datetime.strptime(sys.argv[1], "%Y-%m-%d").date()
    else:
        mon, _ = this_week_range(date.today())
    sun = mon + timedelta(days=6)

    today = date.today()
    data_start = today - timedelta(days=LOOKBACK_DAYS)
    data_end = today + timedelta(days=30)  # 預留未來日期

    print(f"抓取 Ragic：{data_start} ~ {data_end} ...")
    rows = fetch_range(data_start, data_end)
    records = to_records(rows)
    print(f"  共 {len(records)} 筆")

    # HTML
    html_doc = (
        HTML_TPL
        .replace("__DATA__", json.dumps(records, ensure_ascii=False))
        .replace("__UPDATED__", f"{datetime.now():%Y-%m-%d %H:%M}")
        .replace("__DATA_RANGE__", f"{data_start} ~ {data_end}")
    )
    HTML_OUT.parent.mkdir(parents=True, exist_ok=True)
    HTML_OUT.write_text(html_doc, encoding="utf-8")

    # Markdown 歸檔（本週快照）
    md = build_md(mon, sun, records)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    iso_year, iso_week, _ = mon.isocalendar()
    md_path = OUT_DIR / f"{iso_year}-W{iso_week:02d}_週進案量.md"
    md_path.write_text(md, encoding="utf-8")

    print(f"OK")
    print(f"  HTML:     {HTML_OUT}")
    print(f"  Markdown: {md_path}")


if __name__ == "__main__":
    main()
