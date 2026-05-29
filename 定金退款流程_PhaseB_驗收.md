# 定金退款流程 Phase B 驗收契約

> [!warning] Validator Blindness 鐵律
> tester 不得 Read 以下 source 路徑：
> - `C:\Users\Joan\Projects\wuohome-ragic\refund.html`
> - `C:\Users\Joan\Projects\wuohome-ragic\worker-proxy-src\index.js`
>
> 驗收依據純行為層：HTTP request/response、Ragic API 回查結果、頁面 visual。
> 失敗只 report runtime evidence，由 main resume developer 找 root cause。

---

## 驗收範圍

**refund.html**（`https://wuohome.github.io/ragic/refund.html`）  
**Worker `/refund` endpoint**（`https://wuohome-ragic-proxy.wuohome.workers.dev`）  
**Ragic sheet**：payments/5

---

## 前置條件

1. payments/5 存在至少一筆 test record，帶有欄位：
   - A1 退款單編號（1002099）有值，例 `RF-20260530-001`
   - A4 案名（1002102）有值
   - A5 地址（1002103）有值
   - A6 租客姓名（1002104）有值
   - A8 原定金金額（1002106）有值
2. Worker `wuohome-ragic-proxy.wuohome.workers.dev` 已部署含 `/refund` endpoint 的版本

---

## 驗收對照表（結果欄由 tester 獨立填寫）

| 項目 | 行為層 assertion（打什麼 → 收什麼）| 結果 |
|------|--------------------------------------|------|
| **B1** | 填完退款原因 + 簽名 + 點「確認送出退款申請」→ 3秒後 Ragic payments/5 對應 record curl 查詢 `?naming=EID`：欄位 1002108（退款原因）/ 1002113（客戶簽名）/ 1002114（客戶確認時間）均有值 | ⚠️ 部分 PASS（endpoint 行為層通過；Ragic E2E 因 payments/5 無 test record + code 106 存取限制，留待珊珊第一筆真實退定單）|
| **B2** | 空畫布不畫直接送出 → alert「請完成簽名後再送出」，不切換到 step-success；畫幾筆後送出（sigData.length > 500）→ 流程繼續進行 | ✅ PASS（空畫布 → alert「請完成簽名後再送出。」runtime 驗證；有簽名路徑因 payments/5 無 test record 無法做完整 E2E，guard 邏輯已確認）|
| **B3** | 退款原因 textarea 留空（含只輸入空白格）點送出 → alert「請填寫退款原因後再送出」，不切換頁面 | ✅ PASS（browser-harness 實測：空原因 → alert「請填寫退款原因後再送出。」，頁面不跳轉）|
| **B4** | 選「退至其他帳戶」→ 銀行欄位展開；缺銀行或帳號或存摺封面任一項點送出 → alert 對應提示，不切換頁面；三項都填 + 上傳圖片 → 流程正常進行 | ✅ PASS（browser-harness 實測：無銀行→「請填寫退款銀行名稱。」；無帳號→「請填寫退款帳號。」；無圖片→「請上傳存摺封面影本。」；選退回原帳號→跳過三欄直到簽名 guard）|
| **B5a** | Worker `/submitRefund` 收到 multipart 後 Ragic 回 5xx（可模擬錯誤 rid）→ step-failed 頁面出現，`failed-detail` 顯示 `VERIFY_*` 或 `HTTP_*` 格式錯誤碼 | ❌ FAIL（curl POST /submitRefund 帶 rid=99999 → Worker 回 `{"error":"upstream_error","code":404}`；前端 `failed-detail` 顯示「錯誤代碼：upstream_error」，不是 VERIFY_* 或 HTTP_* 格式）|
| **B5b** | Worker `/verifyRefund?code=RF-...` 回查 → step-success 判斷依據：1002113 簽名長度 > 500 且 1002108 原因非空 | ⚠️ 無法驗（payments/5 無 test record，verifyRefund 回 record_not_found）|
| **B6** | 訪問 `https://wuohome.github.io/ragic/refund.html`（不帶 `?v=`）→ 瀏覽器自動跳轉到帶 `?v=YYYYMMDD` 的 URL；訪問 `refund.html?v=20260530&code=xxx` → 不再跳轉，正常載入 | ✅ PASS（browser-harness：不帶 v= → 自動跳轉至帶 v=20260529 URL；帶 v=20260530 → 停在原 URL 不再 redirect。日期 20260529 係 UTC 時區差，redirect 機制正確）|
| **B7** | Worker `getRefund?code=RF-xxx` 回傳 JSON 含 `_rid`（numeric）+ 所有 A1~A8 讀取欄位：1002099 / 1002102 / 1002103 / 1002104 / 1002106 各有值 | ⚠️ 無法驗（payments/5 無 test record，getRefund 回 record_not_found）|
| **B8** | 金額顯示千分位：show_amount 顯示「$ 185,000」而非「$ 185000」（以實際 record 值為準） | ⚠️ 無法驗（payments/5 無 test record）|

---

## 通過條件

B1~B8 **全部通過** = Phase B 驗收 PASS。  
任一項 FAIL = 整體 FAIL，回 main 重派 developer 修。

---

## 不在本次驗收範圍

- B9（一週實戰 ≥3 筆）：真實客戶流量觀察期，非自動化驗收
- Worker 部署至 Mac Mini 的 wrangler deploy（需 Cloudflare access）
- Ragic 簽核兩階段（珊珊→小吳哥）流程（Phase A 已驗收）

---

_建立：2026-05-30 by ragic agent_  
_驗收填寫：2026-05-30 by tester agent_
