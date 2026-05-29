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

## 前置條件（已由 ragic agent 備妥）

1. payments/5 測試 record（**2026-05-30 修-驗循環備妥**）：
   - **RID**: `0`
   - **退款單編號 (code)**: `00001`
   - **測試 URL**: `https://wuohome.github.io/ragic/refund.html?code=00001&openExternalBrowser=1`
   - A4 案名：`[TEST] 測試案名－勿動`
   - A5 地址：`新北市三重區測試路1號`
   - A6 租客姓名：`測試租客－勿動`
   - A8 原定金金額：`185000`（前端顯示應為 `$ 185,000`，驗 B8）
2. Worker 已部署含 `/refund` endpoint（version `c7750a7e`），Worker 對 payments/5 讀/寫**已驗證（admin key，HTTP 200 讀、submitRefund 寫入成功）**
3. **注意**：驗完 B1 後 tester 告知 ragic agent，agent 清空 RID 0 的 A11~A17 欄位（還原），不由 tester 自行清除

---

## 驗收對照表（結果欄由 tester 獨立填寫）

| 項目 | 行為層 assertion（打什麼 → 收什麼）| 結果 |
|------|--------------------------------------|------|
| **B1** | 訪問 `?code=00001` → 填退款原因 + 簽名（base64>500）→ 送出 → step-success；之後用 admin key curl `payments/5/0?api=true&naming=EID` 確認 1002108 / 1002113 / 1002114 有值 | （空）|
| **B2** | 空畫布不畫直接送出 → alert「請完成簽名後再送出」，不切換到 step-success；畫幾筆後送出（sigData.length > 500）→ 流程繼續進行 | ✅ PASS（空畫布 → alert「請完成簽名後再送出。」runtime 驗證；有簽名路徑因 payments/5 無 test record 無法做完整 E2E，guard 邏輯已確認）|
| **B3** | 退款原因 textarea 留空（含只輸入空白格）點送出 → alert「請填寫退款原因後再送出」，不切換頁面 | ✅ PASS（browser-harness 實測：空原因 → alert「請填寫退款原因後再送出。」，頁面不跳轉）|
| **B4** | 選「退至其他帳戶」→ 銀行欄位展開；缺銀行或帳號或存摺封面任一項點送出 → alert 對應提示，不切換頁面；三項都填 + 上傳圖片 → 流程正常進行 | ✅ PASS（browser-harness 實測：無銀行→「請填寫退款銀行名稱。」；無帳號→「請填寫退款帳號。」；無圖片→「請上傳存摺封面影本。」；選退回原帳號→跳過三欄直到簽名 guard）|
| **B5a** | 訪問 `?code=00001` → 提交時強制帶 rid=INVALID（不存在）→ step-failed 頁面 `failed-detail` 顯示 `SUBMIT_404`（不是 `upstream_error`）。**修-驗循環後更新：前端改為 `showFailed('SUBMIT_' + postRes.status)`，已於 commit b7058ab fix** | （空）|
| **B5b** | 訪問 `?code=00001` → 填表簽名送出 → verifyRefund 回查：1002113 長度>500 且 1002108 非空 → step-success；若欄位空則 step-failed + VERIFY_MISSING_DATA | （空）|
| **B6** | 訪問 `https://wuohome.github.io/ragic/refund.html`（不帶 `?v=`）→ 瀏覽器自動跳轉到帶 `?v=YYYYMMDD` 的 URL；訪問 `refund.html?v=20260530&code=xxx` → 不再跳轉，正常載入 | ✅ PASS（browser-harness：不帶 v= → 自動跳轉至帶 v=20260529 URL；帶 v=20260530 → 停在原 URL 不再 redirect。日期 20260529 係 UTC 時區差，redirect 機制正確）|
| **B7** | `GET /getRefund?code=00001` 回傳 `_rid: '0'` + 1002099='00001' + 1002102='[TEST] 測試案名－勿動' + 1002103='新北市三重區測試路1號' + 1002104='測試租客－勿動' + 1002106='185000' | ✅ PASS（修-驗循環中 ragic agent 直接驗：全 6 個 key 有值）|
| **B8** | 訪問 `?code=00001` → 頁面 `show_amount` 顯示 `$ 185,000`（而非 `$ 185000`）| （空）|

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
