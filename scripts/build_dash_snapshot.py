#!/usr/bin/env python3
"""全店業績榜快照產生器（2026-11-10）。

由 run-perf-update.sh 每 15 分鐘呼叫。把業績榜（staff-dashboard-v2.html／staff-dashboard.html）
開頁要用的資料事先備好，寫進 Cloudflare KV（wuohome-ragic-proxy 的 EARNEST_QUEUE，key dash:snapshot:v1），
Worker 的 dashData 驗過同仁身分後原樣吐出——頁面不用再等 Ragic。

快照內容（只留業績榜實際讀的欄位，不含屋主／租客電話、地址、資料夾連結、LINE userId、付款截圖等）：
  payments  payments/2：經辦人員、收款日期、兩個明細子表的 類型／金額
  intake    operation/4：委託時間(起) 落在 今天-365 ~ 今天+30 的物件，進案榜用的 11 個欄位＋開發人員比例子表
  goals     shanshans/5：月份、員工姓名、業績目標(萬)、新進案件量(間)
  staff     Worker 公開的 listStaff（姓名／部門／在職／到職日，已是白名單版）
  perfMd    vault 全店每月業績表.md 原文
  generatedAt / perfMdUpdatedAt  產生時間、業績表檔案最後更新時間（頁面顯示「資料更新於」）

欄位對應的頁面程式：toIntakeRecords／extractDevs／toPerfRecords／renderGoalPanel 等。頁面多讀新欄位時，
要同步改這裡的 *_FIELDS。

失敗就整支不寫（保留 KV 裡上一份），exit 非 0。環境：RAGIC_API_KEY、CLOUDFLARE_API_TOKEN（由 shell wrapper 從 ~/.env 載入）。
用法：build_dash_snapshot.py --vault-md <業績表.md> [--dry-run <輸出檔>]
"""
import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

RAGIC_BASE = "https://ap15.ragic.com/wuohome"
WORKER_BASE = "https://wuohome-ragic-proxy.wuohome.workers.dev"
PROXY_DIR = os.path.expanduser("~/Projects/wuohome-ragic-proxy")  # wrangler.toml 在這，--binding 靠它
KV_BINDING = "EARNEST_QUEUE"
KV_KEY = "dash:snapshot:v1"
KV_PERF_KEY = "dash:perf:v1"  # 每日工作行程用的精簡業績表（Worker worklogPerf）
LOOKBACK_DAYS = 365   # 同頁面 LOOKBACK_DAYS
LOOKAHEAD_DAYS = 30
TPE = timezone(timedelta(hours=8))

INTAKE_FIELDS = ["sync_來源", "委託時間(起)", "案名", "縣市", "鄉鎮市區", "月租金", "格局", "委託類別", "開發人員", "狀態"]
INTAKE_SUB = {"_subtable_1000254": ["開發人員", "比例"]}
PAYMENT_FIELDS = ["經辦人員", "收款日期"]
PAYMENT_SUB = {"_subtable_1001701": ["類型", "金額"], "_subtable_1000777": ["類型", "金額"]}
GOAL_FIELDS = ["月份", "員工姓名", "_index_title_", "業績目標(萬)", "新進案件量(間)"]


def ragic_get(sheet, query):
    key = os.environ.get("RAGIC_API_KEY", "")
    if not key:
        raise SystemExit("RAGIC_API_KEY 未設定")
    req = urllib.request.Request(f"{RAGIC_BASE}/{sheet}?api&{query}", headers={"Authorization": "Basic " + key})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = json.load(r)
    if not isinstance(data, dict):
        raise SystemExit(f"{sheet} 回傳格式不對")
    return data


def project(rec, fields, subs):
    out = {f: rec[f] for f in fields if f in rec}
    for sk, sfields in subs.items():
        rows = rec.get(sk)
        if isinstance(rows, dict):
            out[sk] = {k: {f: row.get(f, "") for f in sfields} for k, row in rows.items() if isinstance(row, dict)}
    return out


def perf_lite(md):
    """每日工作行程只讀「## 民國/月」標題與主表的 名次(欄1)／姓名(欄2)／業績(欄4)（js/worklog-perf.js parse）。
    其餘欄（業務獎金等）清空，不給只需要看自己業績的頁面。"""
    out = []
    for line in md.split("\n"):
        if re.match(r"^##\s+\d{3}/\d{2}\s*$", line):
            out.append(line.strip())
        elif line.startswith("|"):
            c = [x.strip() for x in line.split("|")]
            if len(c) >= 5 and re.fullmatch(r"\d+", c[1].replace("*", "")):  # 只留有名次編號的主表列（小表、合計列、表頭不給）
                out.append(f"| {c[1]} | {c[2]} |  | {c[4]} |")
    return "\n".join(out) + "\n"


def build(vault_md):
    now = datetime.now(TPE)
    fmt = lambda d: d.strftime("%Y/%m/%d")
    lo, hi = fmt(now - timedelta(days=LOOKBACK_DAYS)), fmt(now + timedelta(days=LOOKAHEAD_DAYS))
    q = "subtables=true&limit=10000&where=" + urllib.parse.quote(f"1000260,gte,{lo}") + "&where=" + urllib.parse.quote(f"1000260,lte,{hi}")
    intake_raw = ragic_get("operation/4", q)
    pay_raw = ragic_get("payments/2", "subtables=true&limit=10000")
    goals_raw = ragic_get("shanshans/5", "limit=200")
    req = urllib.request.Request(f"{WORKER_BASE}/listStaff?limit=200", headers={"Origin": "https://wuohome.github.io", "User-Agent": "wuohome-dash-snapshot/1.0"})  # 預設 Python UA 會被 Cloudflare 擋 403
    with urllib.request.urlopen(req, timeout=60) as r:
        staff = json.load(r)

    intake = {rid: project(r, INTAKE_FIELDS, INTAKE_SUB) for rid, r in intake_raw.items() if isinstance(r, dict) and not rid.startswith("_")}
    payments = {}
    for rid, r in pay_raw.items():
        if not isinstance(r, dict) or rid.startswith("_"):
            continue
        p = project(r, PAYMENT_FIELDS, PAYMENT_SUB)
        if p.get("經辦人員") and p.get("收款日期"):
            payments[rid] = p
    goals = {rid: project(r, GOAL_FIELDS, {}) for rid, r in goals_raw.items() if isinstance(r, dict) and not rid.startswith("_")}

    with open(vault_md, encoding="utf-8") as f:
        perf_md = f.read()
    md_mtime = datetime.fromtimestamp(os.path.getmtime(vault_md), TPE)

    # 安全閥：任何一塊空掉或小得離譜，寧可不更新（KV 留上一份）
    if len(intake) < 50 or len(payments) < 50 or len(goals) < 5 or len(staff) < 5 or len(perf_md) < 5000:
        raise SystemExit(f"快照內容異常，中止寫入：intake={len(intake)} payments={len(payments)} goals={len(goals)} staff={len(staff)} perfMd={len(perf_md)}")

    perf = {"v": 1, "generatedAt": now.isoformat(timespec="seconds"), "perfMdUpdatedAt": md_mtime.isoformat(timespec="seconds"), "perfMd": perf_lite(perf_md)}
    return perf, {
        "v": 1,
        "generatedAt": now.isoformat(timespec="seconds"),
        "perfMdUpdatedAt": md_mtime.isoformat(timespec="seconds"),
        "perfMd": perf_md,
        "intake": intake,
        "payments": payments,
        "goals": goals,
        "staff": staff,
    }


def kv_put(key, path):
    subprocess.run(
        ["wrangler", "kv", "key", "put", key, "--path", path, "--binding", KV_BINDING, "--remote"],
        cwd=PROXY_DIR, check=True, timeout=120,
    )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--vault-md", required=True)
    ap.add_argument("--dry-run", metavar="OUT", help="只輸出到檔案，不寫 KV")
    a = ap.parse_args()
    perf, snap = build(a.vault_md)
    body = json.dumps(snap, ensure_ascii=False, separators=(",", ":"))
    perf_body = json.dumps(perf, ensure_ascii=False, separators=(",", ":"))
    n = {k: len(snap[k]) for k in ("intake", "payments", "goals", "staff")}
    print(f"快照 {len(body.encode('utf-8')):,} bytes，筆數 {n}，perfMd {len(snap['perfMd']):,} 字，generatedAt={snap['generatedAt']}")
    if a.dry_run:
        for path, text in ((a.dry_run, body), (a.dry_run + ".perf", perf_body)):
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
        return
    for key, text in ((KV_KEY, body), (KV_PERF_KEY, perf_body)):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
            f.write(text)
            tmp = f.name
        try:
            kv_put(key, tmp)
        finally:
            os.unlink(tmp)
        print("已寫入 KV", key)


if __name__ == "__main__":
    sys.exit(main())
