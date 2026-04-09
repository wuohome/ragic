"""
窩的家｜全員儀表板 — 進案量（週）+ 業績（月）+ 年度總覽
資料來源：
  - 進案量：Ragic operation/4（物件總表）
  - 業績：OB 全店每月業績表.md

用法：python staff_dashboard.py
輸出：C:/Users/Joan/Downloads/全員儀表板.html
"""
import os, sys, json, re, urllib.request, urllib.parse
from datetime import date, timedelta, datetime
from pathlib import Path

API_KEY = os.environ.get("RAGIC_API_KEY") or "VEZsOEwzYzVJdWdoWXRDM3ptS2YwRytLV21BaWhPTDRLWXhPb2FLZ3VBUm1BZE90VzJtZzlTNjVlbCszRnZkRw=="
BASE    = "https://ap15.ragic.com/wuohome/operation/4"
FIELD_START = "1000260"
PAYMENTS_BASE = "https://ap15.ragic.com/wuohome/payments/2"
PERF_SERVICE_TYPES_LANDLORD = {"房東服務費"}
PERF_SERVICE_TYPES_TENANT   = {"服務費", "定金轉服務費"}

VAULT    = Path(r"c:/Second Brain/Obsidian")
PERF_MD  = VAULT / "窩的家/管理部/全店每月業績表.md"
HTML_OUT = Path(r"C:/Users/Joan/Downloads/租賃部業績儀表板.html")

LOOKBACK_DAYS = 365


# ── 1. Ragic 進案量 ────────────────────────────────────────────────

def fetch_intake():
    today      = date.today()
    data_start = today - timedelta(days=LOOKBACK_DAYS)
    data_end   = today + timedelta(days=30)
    qs = (
        "api=&subtables=true"
        f"&where={urllib.parse.quote(f'{FIELD_START},gte,{data_start:%Y/%m/%d}')}"
        f"&where={urllib.parse.quote(f'{FIELD_START},lte,{data_end:%Y/%m/%d}')}"
        "&limit=10000"
    )
    req = urllib.request.Request(
        f"{BASE}?{qs}",
        headers={"Authorization": "Basic " + API_KEY},
    )
    return json.loads(urllib.request.urlopen(req, timeout=120).read())


def normalize_district(d):
    return d.split("|", 1)[1] if d and "|" in d else (d or "")


def fmt_rent(v):
    try:
        return f"{int(float(v)):,}"
    except Exception:
        return v or "—"


EXCLUDE_DEVS = {"張瓊安"}
EXCLUDE_KEYWORDS = ["測試"]

def extract_devs(c):
    sub = c.get("_subtable_1000254") or {}
    devs = []
    for row in sub.values():
        name = (row.get("開發人員") or "").strip()
        if not name:
            continue
        if name in EXCLUDE_DEVS or any(k in name for k in EXCLUDE_KEYWORDS):
            continue
        try:
            ratio = float(row.get("比例") or 0)
        except Exception:
            ratio = 0
        if ratio > 0:
            devs.append({"name": name, "ratio": ratio})
    return devs


def to_intake_records(rows):
    out = []
    for c in rows.values():
        d = c.get("委託時間(起)", "") or ""
        if not d:
            continue
        devs = extract_devs(c)
        people_str = "、".join(
            f"{x['name']}({int(round(x['ratio']*100))}%)" for x in devs
        ) or (c.get("開發人員", "") or "")
        out.append({
            "date":     d.replace("/", "-"),
            "name":     c.get("案名", "") or "",
            "city":     c.get("縣市", "") or "",
            "district": normalize_district(c.get("鄉鎮市區", "") or ""),
            "rent":     fmt_rent(c.get("月租金")),
            "people":   people_str,
            "devs":     devs,
            "status":   c.get("狀態", "") or "",
        })
    out.sort(key=lambda x: x["date"])
    return out


# ── 2. Ragic 業績（payments/2）──────────────────────────────────────

def fetch_perf_from_ragic():
    """
    從 Ragic payments/2 抓業績資料
    回傳 [{"ym": "2026-04", "name": "蕭眞儀", "perf": 5750}, ...]
    算業績的類型：
      _subtable_1001701 (房東) → 房東服務費
      _subtable_1000777 (租客) → 服務費、定金轉服務費
    """
    qs = "api=&subtables=true&limit=10000"
    req = urllib.request.Request(
        f"{PAYMENTS_BASE}?{qs}",
        headers={"Authorization": "Basic " + API_KEY},
    )
    data = json.loads(urllib.request.urlopen(req, timeout=120).read())
    records = []
    for rec in data.values():
        staff = (rec.get("經辦人員") or "").strip()
        if not staff:
            continue
        if staff in EXCLUDE_DEVS or any(k in staff for k in EXCLUDE_KEYWORDS):
            continue
        date_str = (rec.get("收款日期") or "").strip()
        if not date_str:
            continue
        parts = date_str.split("/")
        if len(parts) < 2:
            continue
        ym = f"{parts[0]}-{int(parts[1]):02d}"
        for row in (rec.get("_subtable_1001701") or {}).values():
            if row.get("類型", "").strip() in PERF_SERVICE_TYPES_LANDLORD:
                try:
                    amt = int(float(row.get("金額") or 0))
                except Exception:
                    amt = 0
                if amt > 0:
                    records.append({"ym": ym, "name": staff, "perf": amt})
        for row in (rec.get("_subtable_1000777") or {}).values():
            if row.get("類型", "").strip() in PERF_SERVICE_TYPES_TENANT:
                try:
                    amt = int(float(row.get("金額") or 0))
                except Exception:
                    amt = 0
                if amt > 0:
                    records.append({"ym": ym, "name": staff, "perf": amt})
    return records


def build_compare(ragic_perf, ob_perf):
    """
    比對兩個業績來源，回傳 {ym: [{name, ragic, ob, diff, status}]}
    status: match / ragic_more / ob_more / only_ragic / only_ob
    """
    from collections import defaultdict
    ragic_map = defaultdict(int)
    ob_map    = defaultdict(int)
    for r in ragic_perf:
        ragic_map[(r["ym"], r["name"])] += r["perf"]
    for r in ob_perf:
        ob_map[(r["ym"], r["name"])]    += r["perf"]
    all_keys = set(ragic_map) | set(ob_map)
    result   = defaultdict(list)
    for ym, name in sorted(all_keys):
        ragic_amt = ragic_map[(ym, name)]
        ob_amt    = ob_map[(ym, name)]
        diff      = ragic_amt - ob_amt
        if   ragic_amt == 0: status = "only_ob"
        elif ob_amt    == 0: status = "only_ragic"
        elif diff      == 0: status = "match"
        elif diff      >  0: status = "ragic_more"
        else:                status = "ob_more"
        result[ym].append({"name": name, "ragic": ragic_amt, "ob": ob_amt, "diff": diff, "status": status})
    return {k: v for k, v in sorted(result.items())}


# ── 3. OB 業績解析（用於比對）────────────────────────────────────── ──────────────────────────────────────────────────

def roc_to_iso(roc_str):
    """'113/03' → '2024-03'"""
    parts = roc_str.strip().split("/")
    year  = int(parts[0]) + 1911
    month = int(parts[1])
    return f"{year}-{month:02d}"


def parse_perf_md(path: Path):
    """
    回傳 [{"ym": "2024-03", "name": "蕭靜芳", "perf": 158525}, ...]
    跳過「合計」行、跳過業績為 0 或空的行
    """
    text    = path.read_text(encoding="utf-8")
    records = []
    cur_ym  = None

    for line in text.splitlines():
        # 月份標題
        m = re.match(r"^##\s+(\d{3}/\d{2})\s*$", line)
        if m:
            cur_ym = roc_to_iso(m.group(1))
            continue

        if cur_ym is None:
            continue

        # 表格資料行：| # | 姓名 | 業務獎金 | 業績 | ...
        if not line.startswith("|"):
            continue
        cols = [c.strip() for c in line.split("|")]
        # cols[0]='' cols[1]=# cols[2]=姓名 cols[3]=業務獎金 cols[4]=業績 ...
        if len(cols) < 5:
            continue
        rank = cols[1].strip("* ")
        if not rank.isdigit():
            continue   # 跳過標題行、合計行

        name = cols[2].strip("* ")
        if not name or name == "合計":
            continue

        raw_perf = cols[4].replace(",", "").replace("*", "").strip()
        try:
            perf = int(float(raw_perf))
        except Exception:
            continue
        if perf <= 0:
            continue

        records.append({"ym": cur_ym, "name": name, "perf": perf})

    return records


# ── 3. HTML ────────────────────────────────────────────────────────

HTML_TPL = r"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>窩的家｜租賃部業績儀表板</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
<style>
  body{font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;}
  .medal-1{background:linear-gradient(135deg,#fbbf24,#f59e0b);color:#78350f;}
  .medal-2{background:linear-gradient(135deg,#e5e7eb,#9ca3af);color:#374151;}
  .medal-3{background:linear-gradient(135deg,#fdba74,#c2410c);color:#fff;}
  .bar{transition:width .7s cubic-bezier(.4,0,.2,1);}
  .chip{cursor:pointer;transition:all .15s;}
  .chip:hover{background:#dbeafe;}
  .chip.active{background:#2563eb;color:white;}
  .tab{cursor:pointer;transition:all .2s;border-bottom:3px solid transparent;}
  .tab.active{border-bottom-color:#2563eb;color:#2563eb;font-weight:700;}
  .tab-panel{display:none;}
  .tab-panel.active{display:block;}
</style>
</head>
<body class="bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen">
<div class="max-w-5xl mx-auto px-6 py-10">

  <header class="mb-8">
    <h1 class="text-4xl font-black text-slate-900">🏠 窩的家 租賃部業績儀表板</h1>
    <p class="text-slate-500 mt-2">最後更新：__UPDATED__</p>
  </header>

  <!-- Tabs -->
  <div class="flex gap-8 border-b border-slate-200 mb-8">
    <div class="tab active pb-3 text-lg px-1" data-tab="week">📦 週進案量</div>
    <div class="tab pb-3 text-lg px-1" data-tab="month">💰 月業績</div>
    <div class="tab pb-3 text-lg px-1" data-tab="year">📊 年度總覽</div>
    <div class="tab pb-3 text-lg px-1" data-tab="compare">⚖️ 資料比對</div>
  </div>

  <!-- ── 週進案量 ── -->
  <div class="tab-panel active" id="panel-week">
    <section class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6">
      <div class="flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <label class="text-sm text-slate-500">起</label>
          <input id="wStart" type="date" class="border border-slate-200 rounded-lg px-3 py-2 text-sm">
        </div>
        <div class="flex items-center gap-2">
          <label class="text-sm text-slate-500">迄</label>
          <input id="wEnd" type="date" class="border border-slate-200 rounded-lg px-3 py-2 text-sm">
        </div>
        <div class="flex flex-wrap gap-2 ml-auto">
          <span class="chip px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium" data-w="thisWeek">本週</span>
          <span class="chip px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium" data-w="lastWeek">上週</span>
          <span class="chip px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium" data-w="thisMonth">本月</span>
          <span class="chip px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium" data-w="last30">近30天</span>
          <span class="chip px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium" data-w="last90">近90天</span>
        </div>
      </div>
    </section>

    <section class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div class="text-slate-500 text-sm mb-1">進案總數</div>
        <div class="flex items-baseline gap-2">
          <div id="wKpiTotal" class="text-5xl font-black text-blue-600">0</div>
          <div class="text-slate-400">件</div>
        </div>
      </div>
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div class="text-slate-500 text-sm mb-1">參與開發人數</div>
        <div class="flex items-baseline gap-2">
          <div id="wKpiPeople" class="text-5xl font-black text-emerald-600">0</div>
          <div class="text-slate-400">人</div>
        </div>
      </div>
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div class="text-slate-500 text-sm mb-1">日均進案</div>
        <div class="flex items-baseline gap-2">
          <div id="wKpiAvg" class="text-5xl font-black text-purple-600">0</div>
          <div class="text-slate-400">件/日</div>
        </div>
      </div>
    </section>

    <section class="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 mb-6">
      <h2 class="text-xl font-bold text-slate-900 mb-6">🏆 開發量排行</h2>
      <div id="wRanking" class="space-y-3"></div>
    </section>

    <section class="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
      <h2 class="text-xl font-bold text-slate-900 mb-4">📋 進案明細</h2>
      <div id="wDetail" class="overflow-x-auto"></div>
    </section>
  </div>

  <!-- ── 月業績 ── -->
  <div class="tab-panel" id="panel-month">
    <section class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6">
      <div class="flex flex-wrap gap-2">
        <span class="chip px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium" data-m="thisMonth">本月</span>
        <span class="chip px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium" data-m="lastMonth">上月</span>
        <span id="mMonthChips" class="contents"></span>
      </div>
    </section>

    <section class="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div class="text-slate-500 text-sm mb-1">全店業績</div>
        <div class="flex items-baseline gap-2">
          <div id="mKpiTotal" class="text-4xl font-black text-blue-600">0</div>
          <div class="text-slate-400">元</div>
        </div>
      </div>
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div class="text-slate-500 text-sm mb-1">參與人數</div>
        <div class="flex items-baseline gap-2">
          <div id="mKpiPeople" class="text-4xl font-black text-emerald-600">0</div>
          <div class="text-slate-400">人</div>
        </div>
      </div>
    </section>

    <section class="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
      <h2 class="text-xl font-bold text-slate-900 mb-6">🏆 業績排行</h2>
      <div id="mRanking" class="space-y-3"></div>
    </section>
  </div>

  <!-- ── 年度總覽 ── -->
  <div class="tab-panel" id="panel-year">
    <section class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6">
      <div class="flex flex-wrap gap-2" id="yYearChips"></div>
    </section>

    <section class="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div class="text-slate-500 text-sm mb-1">年度全店業績</div>
        <div class="flex items-baseline gap-2">
          <div id="yKpiPerf" class="text-4xl font-black text-blue-600">0</div>
          <div class="text-slate-400">元</div>
        </div>
      </div>
      <div class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
        <div class="text-slate-500 text-sm mb-1">年度進案量</div>
        <div class="flex items-baseline gap-2">
          <div id="yKpiIntake" class="text-4xl font-black text-purple-600">0</div>
          <div class="text-slate-400">件</div>
        </div>
      </div>
    </section>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
      <section class="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
        <h2 class="text-xl font-bold text-slate-900 mb-6">💰 業績排行</h2>
        <div id="yPerfRanking" class="space-y-3"></div>
      </section>
      <section class="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
        <h2 class="text-xl font-bold text-slate-900 mb-6">📦 開發量排行</h2>
        <div id="yIntakeRanking" class="space-y-3"></div>
      </section>
    </div>

    <section class="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
      <h2 class="text-xl font-bold text-slate-900 mb-6">📈 月度趨勢</h2>
      <div class="relative" style="height:300px"><canvas id="yTrendChart"></canvas></div>
    </section>
  </div>

  <!-- ── 資料比對 ── -->
  <div class="tab-panel" id="panel-compare">
    <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 text-sm text-amber-800">
      ⚠️ 比對 <strong>Ragic 收款紀錄</strong> vs <strong>珊珊 GSheet（OB 業績表）</strong>，找出漏填或資料不一致。<br>
      <span class="text-amber-600 text-xs mt-1 block">📊 Ragic 多 = 有收款但珊珊表未更新 ／ 📋 GSheet 多 = 有業績但未 key in Ragic ／ ❌ 未 key in = 僅在 GSheet，Ragic 完全缺失</span>
    </div>
    <section class="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6">
      <div class="flex flex-wrap gap-2" id="cMonthChips"></div>
    </section>
    <section class="bg-white rounded-2xl p-8 shadow-sm border border-slate-100">
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-bold text-slate-900">⚖️ 比對結果</h2>
        <div id="cSummary" class="text-sm text-slate-500"></div>
      </div>
      <div id="cTable" class="overflow-x-auto"></div>
    </section>
  </div>

  <footer class="text-center text-slate-400 text-xs py-6">
    Generated by staff_dashboard.py　•　窩的家系統部
  </footer>
</div>

<script>
const INTAKE   = __INTAKE__;
const PERF     = __PERF__;
const COMPARE  = __COMPARE__;

// ── utils ──
function ymd(d){const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;}
function ym(d){const z=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${z(d.getMonth()+1)}`;}
function thisMonday(){const d=new Date();const w=(d.getDay()+6)%7;d.setDate(d.getDate()-w);return d;}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x;}
function fmtN(n){return Number.isInteger(n)?n.toLocaleString():n.toFixed(2).replace(/\.?0+$/,'');}
function fmtMoney(n){return Number(n).toLocaleString();}
function esc(s){return (s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

const datePresets = {
  thisWeek:()=>{const m=thisMonday();return [m,addDays(m,6)];},
  lastWeek:()=>{const m=addDays(thisMonday(),-7);return [m,addDays(m,6)];},
  thisMonth:()=>{const d=new Date();return [new Date(d.getFullYear(),d.getMonth(),1),new Date(d.getFullYear(),d.getMonth()+1,0)];},
  last30:()=>{const d=new Date();return [addDays(d,-29),d];},
  last90:()=>{const d=new Date();return [addDays(d,-89),d];},
};

function rankHtml(items, fmtVal, unit){
  if(!items.length) return '<div class="text-center text-slate-400 py-8">此區間無資料</div>';
  const top = items[0][1]||1;
  const medals=['medal-1','medal-2','medal-3'];
  const icons=['🥇','🥈','🥉'];
  return items.map(([name,n],i)=>{
    const pct=Math.round(n/top*100);
    const badge = i<3
      ? `<span class="${medals[i]} w-10 h-10 rounded-full flex items-center justify-center font-black text-lg">${icons[i]}</span>`
      : `<span class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-slate-400 bg-slate-100">${i+1}</span>`;
    return `<div class="flex items-center gap-4">${badge}<div class="flex-1"><div class="flex justify-between mb-1"><span class="font-bold text-slate-800">${esc(name)}</span><span class="font-black text-slate-900">${fmtVal(n)} <span class="text-sm text-slate-400 font-normal">${unit}</span></span></div><div class="h-2 bg-slate-100 rounded-full overflow-hidden"><div class="bar h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" style="width:${pct}%"></div></div></div></div>`;
  }).join('');
}

// ── Tab ──
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(x=>x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById('panel-'+t.dataset.tab).classList.add('active');
}));

// ════════════════════════════════════════
// 週進案量
// ════════════════════════════════════════
function renderWeek(){
  const start=document.getElementById('wStart').value;
  const end=document.getElementById('wEnd').value;
  if(!start||!end||start>end) return;
  const rows=INTAKE.filter(r=>r.date>=start && r.date<=end);
  const counter={};
  rows.forEach(r=>(r.devs||[]).forEach(d=>counter[d.name]=(counter[d.name]||0)+d.ratio));
  const days=(new Date(end)-new Date(start))/86400000+1;
  document.getElementById('wKpiTotal').textContent=rows.length;
  document.getElementById('wKpiPeople').textContent=Object.keys(counter).length;
  document.getElementById('wKpiAvg').textContent=(rows.length/days).toFixed(1);

  const items=Object.entries(counter).sort((a,b)=>b[1]-a[1]);
  document.getElementById('wRanking').innerHTML=rankHtml(items,fmtN,'間');

  const detailHtml=rows.length===0
    ?'<div class="text-center text-slate-400 py-8">此區間無進案</div>'
    :`<table class="w-full"><thead><tr class="text-left text-xs font-semibold text-slate-500 uppercase border-b-2 border-slate-200"><th class="py-2 px-2">委託日</th><th class="py-2 px-2">案名</th><th class="py-2 px-2">狀態</th><th class="py-2 px-2">地區</th><th class="py-2 px-2 text-right">月租</th><th class="py-2 px-2">開發人員</th></tr></thead><tbody>${
      rows.map(r=>{
        const off=r.status==='下架';
        const rowCls=off?'bg-slate-100 text-slate-400':'';
        const tag=off?'<span class="px-2 py-0.5 text-xs rounded-full bg-slate-300 text-slate-600">下架</span>':`<span class="px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-700">${esc(r.status||'—')}</span>`;
        return `<tr class="border-b border-slate-100 hover:bg-slate-50 ${rowCls}"><td class="py-3 px-2 text-sm whitespace-nowrap">${esc(r.date)}</td><td class="py-3 px-2 font-medium ${off?'line-through':''}">${esc(r.name)}</td><td class="py-3 px-2">${tag}</td><td class="py-3 px-2 text-sm">${esc(r.city+' '+r.district)}</td><td class="py-3 px-2 text-right font-mono">${esc(r.rent)}</td><td class="py-3 px-2 text-sm">${esc(r.people)}</td></tr>`;
      }).join('')
    }</tbody></table>`;
  document.getElementById('wDetail').innerHTML=detailHtml;
}

function applyWeekPreset(name){
  const [s,e]=datePresets[name]();
  document.getElementById('wStart').value=ymd(s);
  document.getElementById('wEnd').value=ymd(e);
  document.querySelectorAll('[data-w]').forEach(c=>c.classList.toggle('active',c.dataset.w===name));
  renderWeek();
}
document.querySelectorAll('[data-w]').forEach(c=>c.addEventListener('click',()=>applyWeekPreset(c.dataset.w)));
document.getElementById('wStart').addEventListener('change',()=>{document.querySelectorAll('[data-w]').forEach(c=>c.classList.remove('active'));renderWeek();});
document.getElementById('wEnd').addEventListener('change',()=>{document.querySelectorAll('[data-w]').forEach(c=>c.classList.remove('active'));renderWeek();});

// ════════════════════════════════════════
// 月業績
// ════════════════════════════════════════
// 取得所有有資料的月份
const perfMonths = [...new Set(PERF.map(r=>r.ym))].sort();

function renderMonth(targetYm){
  const rows = PERF.filter(r=>r.ym===targetYm);
  const counter = {};
  rows.forEach(r=>{ counter[r.name]=(counter[r.name]||0)+r.perf; });
  const total = Object.values(counter).reduce((a,b)=>a+b,0);
  document.getElementById('mKpiTotal').textContent = fmtMoney(total);
  document.getElementById('mKpiPeople').textContent = Object.keys(counter).length;
  const items = Object.entries(counter).sort((a,b)=>b[1]-a[1]);
  document.getElementById('mRanking').innerHTML = rankHtml(items, fmtMoney, '元');
  document.querySelectorAll('[data-m]').forEach(c=>c.classList.toggle('active', c.dataset.m===targetYm));
}

function buildMonthChips(){
  const container = document.getElementById('mMonthChips');
  perfMonths.slice().reverse().slice(0,12).forEach(m=>{
    const el = document.createElement('span');
    el.className='chip px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium';
    el.dataset.m = m;
    el.textContent = m;
    el.addEventListener('click',()=>renderMonth(m));
    container.appendChild(el);
  });
}

// thisMonth / lastMonth chips
document.querySelectorAll('[data-m="thisMonth"]').forEach(c=>c.addEventListener('click',()=>{
  const d=new Date(); renderMonth(ym(d));
}));
document.querySelectorAll('[data-m="lastMonth"]').forEach(c=>c.addEventListener('click',()=>{
  const d=new Date(new Date().getFullYear(), new Date().getMonth()-1, 1); renderMonth(ym(d));
}));

// ════════════════════════════════════════
// 年度總覽
// ════════════════════════════════════════
const intakeYears = [...new Set(INTAKE.map(r=>r.date.slice(0,4)))].sort();
const perfYears   = [...new Set(PERF.map(r=>r.ym.slice(0,4)))].sort();
const allYears    = [...new Set([...intakeYears,...perfYears])].sort().reverse();

function renderYear(year){
  // 業績
  const perfRows = PERF.filter(r=>r.ym.startsWith(year));
  const perfCounter = {};
  perfRows.forEach(r=>{ perfCounter[r.name]=(perfCounter[r.name]||0)+r.perf; });
  const perfTotal = Object.values(perfCounter).reduce((a,b)=>a+b,0);

  // 進案
  const intakeRows = INTAKE.filter(r=>r.date.startsWith(year));
  const intakeCounter = {};
  intakeRows.forEach(r=>(r.devs||[]).forEach(d=>{ intakeCounter[d.name]=(intakeCounter[d.name]||0)+d.ratio; }));
  const intakeTotal = intakeRows.length;

  document.getElementById('yKpiPerf').textContent   = fmtMoney(perfTotal);
  document.getElementById('yKpiIntake').textContent = intakeTotal;

  const perfItems   = Object.entries(perfCounter).sort((a,b)=>b[1]-a[1]);
  const intakeItems = Object.entries(intakeCounter).sort((a,b)=>b[1]-a[1]);
  document.getElementById('yPerfRanking').innerHTML   = rankHtml(perfItems,   fmtMoney,'元');
  document.getElementById('yIntakeRanking').innerHTML = rankHtml(intakeItems, fmtN,    '間');

  // 月度趨勢折線圖
  const SYSTEM_START = '2025-12'; // Ragic 正式試用起始月
  const months=[];
  for(let m=1;m<=12;m++) months.push(`${year}-${String(m).padStart(2,'0')}`);
  // 業績來自 OB markdown，有歷史資料；進案量來自 Ragic，系統建置前無資料
  const perfData   = months.map(m=>PERF.filter(r=>r.ym===m).reduce((a,r)=>a+r.perf,0));
  const intakeData = months.map(m=>m<SYSTEM_START ? null : INTAKE.filter(r=>r.date.startsWith(m)).length);
  const labels     = months.map(m=>m.slice(5)+'月');
  // inline plugin：對無資料月份畫灰底 + 文字
  const noDataPlugin = {
    id:'noData',
    beforeDraw(chart){
      const {ctx, chartArea, scales} = chart;
      if(!chartArea) return;
      const xs = scales.x;
      const preIdxs = months.reduce((a,m,i)=>{ if(m<SYSTEM_START) a.push(i); return a; },[]);
      if(!preIdxs.length) return;
      const barW = xs.width / months.length;
      ctx.save();
      ctx.fillStyle = 'rgba(148,163,184,0.13)';
      preIdxs.forEach(i=>{
        const cx = xs.getPixelForValue(i);
        ctx.fillRect(cx-barW/2, chartArea.top, barW, chartArea.height);
      });
      // 中央標示文字
      const midI = preIdxs[Math.floor(preIdxs.length/2)];
      const midX = xs.getPixelForValue(midI);
      const midY = chartArea.top + chartArea.height/2;
      ctx.fillStyle = 'rgba(100,116,139,0.55)';
      ctx.font = 'bold 12px "Noto Sans TC",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('進案量無資料', midX, midY);
      ctx.restore();
    }
  };
  if(window._trendChart) window._trendChart.destroy();
  window._trendChart = new Chart(document.getElementById('yTrendChart'),{
    type:'line',
    data:{
      labels,
      datasets:[
        {
          label:'業績（元）',
          data:perfData,
          borderColor:'#6366f1',
          backgroundColor:'rgba(99,102,241,0.08)',
          fill:true,
          tension:0.35,
          pointRadius:4,
          pointHoverRadius:6,
          spanGaps:false,
          yAxisID:'yPerf'
        },
        {
          type:'bar',
          label:'進案量（間）',
          data:intakeData,
          backgroundColor:'rgba(16,185,129,0.25)',
          borderColor:'#10b981',
          borderWidth:1.5,
          borderRadius:4,
          yAxisID:'yIntake'
        }
      ]
    },
    plugins:[noDataPlugin],
    options:{
      responsive:true,
      maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{position:'top',labels:{font:{size:13}}},
        tooltip:{
          filter:item=>item.parsed.y!==null,
          callbacks:{
            label:ctx=>ctx.dataset.yAxisID==='yPerf'
              ? '業績 '+fmtMoney(ctx.parsed.y)
              : '進案 '+fmtN(ctx.parsed.y)+'間'
          }
        }
      },
      scales:{
        yPerf:{
          type:'linear',position:'left',
          ticks:{callback:v=>v===0?'0':fmtMoney(v),font:{size:11}},
          grid:{color:'rgba(0,0,0,0.05)'}
        },
        yIntake:{
          type:'linear',position:'right',
          ticks:{callback:v=>v+'間',stepSize:1,font:{size:11}},
          grid:{drawOnChartArea:false}
        }
      }
    }
  });

  document.querySelectorAll('[data-y]').forEach(c=>c.classList.toggle('active',c.dataset.y===year));
}

function buildYearChips(){
  const container = document.getElementById('yYearChips');
  allYears.forEach(y=>{
    const el=document.createElement('span');
    el.className='chip px-4 py-2 bg-slate-100 rounded-full text-sm font-medium';
    el.dataset.y=y;
    el.textContent=y+'年';
    el.addEventListener('click',()=>renderYear(y));
    container.appendChild(el);
  });
}

// ════════════════════════════════════════
// 資料比對
// ════════════════════════════════════════
const compareMonths = Object.keys(COMPARE).sort().reverse();

const statusBadge = {
  match:       '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">✅ 一致</span>',
  ragic_more:  '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">📊 Ragic 多</span>',
  ob_more:     '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">📋 GSheet 多</span>',
  only_ragic:  '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">🆕 僅 Ragic</span>',
  only_ob:     '<span class="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">❌ 未 key in</span>',
};

function renderCompare(targetYm){
  const rows = COMPARE[targetYm] || [];
  const matched = rows.filter(r=>r.status==='match').length;
  const issues  = rows.length - matched;
  document.getElementById('cSummary').textContent =
    rows.length + ' 人次　✅ 一致 ' + matched + '　⚠️ 差異 ' + issues;
  document.querySelectorAll('[data-c]').forEach(c=>c.classList.toggle('active', c.dataset.c===targetYm));
  if(!rows.length){
    document.getElementById('cTable').innerHTML='<div class="text-center text-slate-400 py-8">無資料</div>';
    return;
  }
  const sorted = rows.slice().sort((a,b)=>{
    const order={only_ob:0,ob_more:1,ragic_more:2,only_ragic:3,match:4};
    return (order[a.status]??5)-(order[b.status]??5);
  });
  const tbl = '<table class="w-full text-sm"><thead><tr class="text-left text-xs font-semibold text-slate-500 uppercase border-b-2 border-slate-200">' +
    '<th class="py-2 px-3">業務</th>' +
    '<th class="py-2 px-3 text-right">Ragic</th>' +
    '<th class="py-2 px-3 text-right">GSheet（OB）</th>' +
    '<th class="py-2 px-3 text-right">差異</th>' +
    '<th class="py-2 px-3">狀態</th>' +
    '</tr></thead><tbody>' +
    sorted.map(r=>{
      const diffStr = r.diff===0?'—':(r.diff>0?'+':'')+fmtMoney(r.diff);
      const diffCls = r.diff===0?'text-slate-400':r.diff>0?'text-blue-600 font-medium':'text-amber-700 font-medium';
      const rowCls  = r.status==='match'?'opacity-50':'';
      return '<tr class="border-b border-slate-100 hover:bg-slate-50 ' + rowCls + '">' +
        '<td class="py-3 px-3 font-medium">' + esc(r.name) + '</td>' +
        '<td class="py-3 px-3 text-right font-mono">' + (r.ragic?fmtMoney(r.ragic):'—') + '</td>' +
        '<td class="py-3 px-3 text-right font-mono">'  + (r.ob   ?fmtMoney(r.ob)   :'—') + '</td>' +
        '<td class="py-3 px-3 text-right font-mono ' + diffCls + '">' + diffStr + '</td>' +
        '<td class="py-3 px-3">' + (statusBadge[r.status]||r.status) + '</td>' +
      '</tr>';
    }).join('') +
    '</tbody></table>';
  document.getElementById('cTable').innerHTML = tbl;
}

function buildCompareChips(){
  const container = document.getElementById('cMonthChips');
  compareMonths.slice(0,12).forEach(m=>{
    const el = document.createElement('span');
    el.className = 'chip px-3 py-1.5 bg-slate-100 rounded-full text-sm font-medium';
    el.dataset.c = m;
    el.textContent = m;
    el.addEventListener('click', ()=>renderCompare(m));
    container.appendChild(el);
  });
}

// ── 初始化 ──
buildMonthChips();
buildYearChips();
buildCompareChips();
applyWeekPreset('thisWeek');
(()=>{const d=new Date(); renderMonth(ym(d));})();
if(allYears.length) renderYear(allYears[0]);
if(compareMonths.length) renderCompare(compareMonths[0]);
</script>
</body>
</html>"""


def main():
    today = date.today()

    print("抓取 Ragic 進案量...")
    rows    = fetch_intake()
    intake  = to_intake_records(rows)
    print(f"  {len(intake)} 筆")

    print("抓取 Ragic 業績資料...")
    perf_ragic = fetch_perf_from_ragic()
    print(f"  {len(perf_ragic)} 筆（{len(set(r['ym'] for r in perf_ragic))} 個月）")

    print("解析 OB 業績資料（用於比對）...")
    perf_ob = parse_perf_md(PERF_MD)
    print(f"  {len(perf_ob)} 筆（{len(set(r['ym'] for r in perf_ob))} 個月）")

    compare = build_compare(perf_ragic, perf_ob)
    print(f"  比對 {len(compare)} 個月份")

    html_doc = (
        HTML_TPL
        .replace("__INTAKE__",  json.dumps(intake,     ensure_ascii=False))
        .replace("__PERF__",    json.dumps(perf_ob,    ensure_ascii=False))
        .replace("__COMPARE__", json.dumps(compare,    ensure_ascii=False))
        .replace("__UPDATED__", f"{datetime.now():%Y-%m-%d %H:%M}")
    )

    HTML_OUT.parent.mkdir(parents=True, exist_ok=True)
    HTML_OUT.write_text(html_doc, encoding="utf-8")
    print(f"✅  {HTML_OUT}")


if __name__ == "__main__":
    main()
