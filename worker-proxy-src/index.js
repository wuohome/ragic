// wuohome-ragic-proxy v46 — earnest/payment-receipt token 收尾加嚴（2026-07-30）：
// getEarnest / verifyEarnestToken（定金 token 1002558）、getPaymentReceipt /
// verifyPaymentReceiptToken（收款憑單 token 1003029）、getPaymentSource / submitPaymentSource
// （同用 1003029 做 gate）、以及 submitEarnest/submitEarnestAsync/submitPaymentReceipt 共用的
// processMultipart() token 欄位解析，全部從純 validUuid() regex 換成 v38 refund 就已存在的
// validHardenedToken()（UUID regex + 非 nil-UUID + hex 唯一字元數 ≥5），與 refund 三條路徑同級。
// 只動 token 格式驗證這一層，查詢欄位/白名單/錯誤碼慣例一律不變（格式不合格仍 400
// invalid_token；查無記錄仍 404 record_not_found；缺參數仍 400 missing_param）。
// 版號更正說明：原任務指示寫「升 v39」，但實際 git HEAD 已到 v41、且本機工作區另有尚未
// commit 但**已部署上線**的 v42/v42.1(portal)／v43(listStaff 白名單)／v44(listEmployees 白名單)／
// v45(pettyCash) —— 開發時 stash 隔離、寫完後已用 git apply --reject 合併回同一份檔案，故本次
// 用 v46（見 2026-07-30 交付摘要「spec 外決定」）。既有 84 個 action 一行未動（hardening only）。
// wuohome-ragic-proxy v45 — 零用金請款開發批次 2（Group X，2026-07-28）：新增 5 個 action
// pettyCashIdentity / pettyCashCreate / pettyCashListMine / pettyCashListAll /
// pettyCashMarkPaid，讀寫 finance2/14（批次 1 已建表，主表 19 欄 + 發票號碼 noDup 唯一索引）。
// 兩種 token 身分：A 同仁（`?token=` 反查人事表 ragicforms4/20004 的 1003215「零用金請款
// Token」，在職狀態必須 ∈ {在職,試用}）／B 財務（`?token=` 比對新 secret
// PETTY_CASH_FINANCE_TOKENS_JSON，格式比照既有 WORKLOG_TOKENS_JSON）。同一支 gate 函式
// `authenticatePettyCash()` 先試 A 再試 B，每個 action 只接受其中一種角色，token 失敗或角色
// 不符一律同型 `not_found` 404（不回 403，避免洩漏 token 有效性，比照 v29/v30/P5/Group T/U
// IDOR root-fix 手法）。請款人身分（1003196）只能由 token 反查得出，前端傳入的任何姓名欄位
// 一律不讀取（service-fee.html 既定鐵律，避開 earnest.html 的 IDOR 教訓）；建立時間
// （1003195）伺服器端產生台北時間、已付款（1003212）建立時一律寫 No。發票號碼重複防呆兩層：
// 寫入前 GET 查重（P0-3，整套最重要一條）+ Ragic noDup 唯一索引兜底，兩者皆轉譯成同一個
// `duplicate_invoice` 409（不吐 upstream_invalid）。pettyCashCreate 建單後讀回驗證自動編號
// （1003194）確實有值，比照 createPaymentReceipt/createServiceFeeOrder「防謊報成功」手法；
// pettyCashMarkPaid 寫入後讀回確認 1003212 狀態真的變了才回成功。日期時間格式沿用批次1 已修
// 正的大寫 `HH`（見踩坑速查 2026-07-28 條目，小寫 `hh` 會讓時間部分靜默歸零）。既有 79 個
// action 一行未動（additive only）。v1 已知落差：規格書「代 key 人」機制（1003197 代填人）
// 因 Joan 明確指示「請款人一律 token 反查」而未實作，欄位保留不寫入，待 Joan 拍板，詳交付摘要。
// wuohome-ragic-proxy v42 — 企業入口第 3 批：公布欄 + 心情留言板（Group W，2026-07-28）。
// **本 Worker 第一組非 Ragic 後端的 action** — 資料在 Supabase 專案 wuohome-systems
// (zqngfhkcftpeqbhllzvl, ap-northeast-1)，表 portal_posts / portal_moods（2026-07-28 建，
// 前綴依車可充移植包架構決策）。既有 74 個 Ragic action 一行未動（additive only）。
// 新增 7 個 action：portalListPosts / portalCreatePost / portalPinPost / portalDeletePost /
// portalListMoods / portalCreateMood / portalDeleteMood。
// 資安設計（規格書 § 公布欄與心情留言板 兩條資安鐵律）：
//  1. **前端不得直連 Supabase**。窩的家沒有真認證（shared.js 的 ensureAuth 只是姓名下拉＋
//     localStorage），RLS 沒有可信身分可判。service_role 等級的 secret key 只存在 Worker
//     secret `SUPABASE_SERVICE_KEY`，前端只能呼叫本 Worker（CORS 仍鎖 wuohome.github.io）。
//     附帶佐證：Supabase 本身會擋帶瀏覽器 UA 的 secret key 請求（實測回 401「Forbidden use of
//     secret API key in browser」），故 portalSupabase() 明確送出非瀏覽器 User-Agent。
//  2. **不照抄車可充的 supabase_setup.sql**。他們對這兩張表開 `for all using(true) with
//     check(true)`（全網匿名可讀寫刪）。窩的家版：兩表 RLS 開啟但**刻意零 policy**，且
//     anon/authenticated 完全無 grant（2026-07-28 用 publishable key 實測 GET/POST 皆 401
//     permission denied）。只有 service_role（BYPASSRLS）進得去。
// 權限模型（v1 誠實版）：發文者身分由前端送 `actor` 姓名，Worker **自己**判定是否為管理層
//     （PORTAL_MANAGERS，與 js/shared.js 的 MANAGERS 同一份名單），不接受前端傳來的角色旗標。
//     ⚠️ 這**不是**存取控制——v1 沒有可信身分，任何人都能冒名。此為規格書明列的已知取捨
//     （「v1 不得宣稱有權限控制」），v2 升級一人一條 token 後才成立。
// 刪除：一律 soft delete（寫 deleted_at/deleted_by，不 DELETE），本人可刪自己、MANAGERS 可刪
//     任何一則。保留期為「查詢時過濾」不是刪除：公布欄 30 天、心情留言板 7 天，
//     **但置頂公告不受保留期限制、永遠顯示**（Joan 2026-07-28 拍板）。
// wuohome-ragic-proxy v40 — 工作日誌 V2（自訂起訖時間）接後端：既有 worklogCreate/
// worklogListMine/worklogListAll 3 個 action 就地擴充（不新增 action，沿用原名，符合規格書
// 「V2 寫新欄位，既有 action 不得破壞」要求）。maintenance-management/9 新增「開始時間」
// (1003191)／「結束時間」(1003192) 兩個自由輸入文字欄（"HH:MM"，2026-07-25 用 JoanDevAgent
// agent-browser 進 Design Mode 新增，舊「時間(小時)」(1003095) 欄位一行未動）。worklogCreate
// 依 row 是否帶 startTime/endTime（V2）或 hour（V1 既有）分流驗證與寫入，V1 分支程式碼邏輯
// 完全保留只是包進 else；V2 分支新增 WORKLOG_TIME_RE 格式驗證＋結束必須晚於開始＋批次內
// 不可重複同一組起訖時間＋findWorklogRowByTime() dedup（鏡像既有 findWorklogRow()，安全網
// 用途，V2 前端正常流程靠自己記住 rid 做更新）。worklogPublicRecord() 新增 startTime/endTime
// 純讀取欄位擴充，V1 舊紀錄該兩欄回空字串，V1 前端本來就不讀這兩個 key，不受影響。
// WORKLOG_TOKENS_JSON 新增 1 支測試專用 token（假名「測試員／測試主管」，見敏感憑證總表），
// 所有寫入測試一律用此 token，不動陳勁豪／恩廷／主管既有 token。既有 71 個 action 一行未動。
// wuohome-ragic-proxy v39 — 修繕報價單 Ragic 化：新增 rqCreate/rqGet 2 個 action，讀寫新表
// maintenance-management/15（主表 24 欄 + 子表格「報價明細」8 欄，2026-07-24 建表，見
// BuildSpec）。此表對 `Authorization: Basic` 一律回 code:106 降級 guest，必須用
// `?api=true&APIKey=<key>` query param 認證（與既有 property-data-kept/17 的坑同款，見
// ragicUrl/`APIKey` 既有先例）——新增專屬 rqUrl() helper，不動既有 getFromRagic/
// postUrlEncodedToRagic（那兩支預設 Basic header，繼續給其餘 66 支 action 用，未受影響）。
// rqCreate：驗證客戶名稱非空／items 1~50 筆／snapshot ≤200KB，通過才寫入；金額四欄（項目
// 小計/折扣金額/稅額/總計）直接採前端算好的快照值，Worker 不重算不覆寫（報價單是法律性
// 單據快照原則，見 BuildSpec 設計取捨）；分享token 用 `crypto.getRandomValues` 產生 32 碼
// hex（非既有 `crypto.randomUUID()` 的 36 碼含 dash 格式，因規格明確要求 32 hex）；寫入後
// 讀回新記錄驗證自動編號欄（1003157）確實有值，比照 createPaymentReceipt 的「讀回驗證防
// 謊報成功」手法。rqGet：只認 `?token=`，Worker 用 token 反查表（where=1003179,eq,token），
// 找不到／格式不符一律同型 404（比照 v29/v30/P5/Group T/U IDOR root-fix 手法，不分因由防
// 列舉，不接受任何形式的 record id 查詢）。既有 69 個 action 一行未動（additive only）。
// wuohome-ragic-proxy v38 — refund (payments/5) IDOR root-fix + token 加固：getRefund /
// verifyRefund 改為 token-only（token 欄位 1002099→已死之 code 參數與 rid 參數一律不再接受，
// 均回 missing_param/record_not_found），mirrors v29/v30 手法。同時修掉 getRefund 舊 rid 分支
// 呼叫 getRagicRecordById(.json) 的 BATCH LIST 洩漏（同 v30 修的 236 筆洩漏是同一類洞，這裡
// 尚未被利用是因為舊連結參數契約本來就對不上、事實上已是死連結，詳見交付回報）。submitRefund
// 過去完全沒有任何 rid 歸屬驗證（payments/1、payments/2 早在 v29/v30 就補了、payments/5 這次
// 才補上，屬系統性缺口延遲修復），新增 verifyRefundToken() 比照 verifyEarnestToken/
// verifyPaymentReceiptToken 寫法。另外新增 validHardenedToken()（UUID regex + 非 all-zero
// nil-UUID + hex 唯一字元數 ≥5）比 getEarnest/getPaymentReceipt 現行的純 validUuid() regex
// 檢查更嚴格一級，僅用於 refund 三個 action；未回頭加固既有 earnest/payment-receipt（範圍外，
// 見交付摘要 spec 外決定）。全 67 支 action 中僅修改 getRefund/verifyRefund/submitRefund
// 這 3 支，其餘 64 支邏輯一行未動。
// wuohome-ragic-proxy v37 — 設計部工作檯 P2 補派：合約附件（1000179）多檔案瀏覽。規格書
// §decorFile 契約原就寫明「多檔瀏覽列 P2」，v36 派工漏列，本輪補上。新增 decorContractFile
// （flat action，rid+idx+token，比照 decorProgressPhoto 款式），固定反查 1000179、串流回傳，
// 不接受任意 URL/欄位/sheet 參數。**既有 decorFile（PATH_PREFIX，回傳陣列第一筆）一行不改**——
// 舊連結行為完全不變，新 action 是「可指定第幾筆」的附加版本，不是取代。decorPublicRecord
// 新增 contractFileCount（純讀取欄位擴充，比照 progress.photoCount 先例），hasContract 既有
// 語意（count>0）不變。2026-07-20 已用 finance/8 record 36 真實 13 檔合約案（既有資料，非
// 沙盒列）實測 idx=0~12 全 200、idx=13 越界 404。既有 48 個 action 一行未動。
// wuohome-ragic-proxy v36 — 設計部工作檯 P2：新增 2 個寫入/代理 action（decorProgressAdd/
// decorProgressPhoto），finance/8 工程進度子表新增「工項分類」(1003091,LIST)/「進度照片」
// (1003092,多檔上傳) 兩欄後開放現場寫入。decorProgressAdd 走 PATH_PREFIX（rid 在路徑，比照
// wbAddInvestorSub），multipart 直接把 2+ 張照片以同一 fieldId `1003092_-1` 重複 append 到單一
// POST，2026-07-20 已對 finance/8 record 31（沙盒列，事後 DELSUB 清除零殘留）實測驗證「新列一次
// 到位含多檔案」可行；POST 帶 `?doLinkLoad=first&doFormula=true`（既有 payment-create 慣例）。
// LIST 欄位 API 不驗選項合法性（見踩坑速查續14/20），Worker 端自帶 12 選項白名單擋非法值。
// 兩個行為疑點實測結論（同一沙盒 record 31 兩輪 probe，round-trip 後 1001241/1001242 均確認
// 復原零殘留）：(a) 唯讀公式欄 1001240（進度子表「更新日期」，預設 $DATE）API 新增列時**不會**
// 自動觸發（即使帶 doFormula/doLinkLoad 亦同，探測值仍空白）——Worker 端顯式帶入
// `todayTaipei()` 補寫，寫入後主表 1001241（MAX(G16) 催更判定源）即正確重新計算，此為必要非
// 選配步驟。(b) 1000189 記錄人（使用者指派型，預設 $USERNAME）API 寫入時**不會**掉成 admin key
// 綁定帳號、也**不會**接受非真實帳號的任意字串（測試值「工務主管」送出後仍讀回空白，Ragic 靜默
// 丟棄不合法的使用者指派值，非 error）——依「禁止硬編碼人名」規則，Worker 不嘗試寫入此欄，API
// 建立的進度列該欄維持空白（已知限制，不影響驗收契約 #16，該契約未要求記錄人回填）。
// decorProgressPhoto 比照 decorFile 從嚴代理契約，但輸入多一個「子表列 Row ID」（GET 回應
// `_subtable_1000192` 物件的數字 key，同 wbUpdateInvestorSub 沿用的 rowId 概念）與 idx（多檔
// 陣列索引）；仍固定反查 1003092 欄、不接受任意 URL/欄位/sheet 參數。decorPublicRecord() 的
// progress 陣列新增 rowId/category/photoCount 三個唯讀欄位（新增 decorSubtableRowEntries()
// 輔助函式取代原本會丟棄 row key 的 decorSubtableRows()，僅用於 progress 這條路徑；
// decorSubtableRows() 本身與 payments/addons 呼叫處一行未動）——比照 v34 repairPublicRecord
// 新增 updatedAt 的「純讀取欄位擴充」先例，不算破壞 additive only 紀律。既有 46 個 action 與
// decorListAll/decorDetail/decorFile 既有欄位輸出值一行未變。
// wuohome-ragic-proxy v35 — 資產活化工作檯 P5.1：補完整 CRUD。新增 4 個 wb* action
// （wbUpdateInvestorSub/wbDeleteInvestorSub/wbUpdatePropertySub/wbDeletePropertySub），
// 讓 asset-workbench.html 對既有 8 個子表格（進度紀錄/關係人/資產盤點/財務結構/報酬試算/
// 風險評估/學員詢問/操盤進度log）也能修改既有列、刪除列（先前只能新增列）。動機：Joan
// 2026-07-20 拍板「Ragic 只當純資料庫，不要再叫我回 Ragic 原生 UI 做」。子表列修改用
// Ragic API 文件「子表格資料修改與刪除」語法 `{fieldId}_{正數RowId}=value`；刪除用
// `DELSUB_{子表格KeyFieldId}={RowId}`——兩者皆已對 asset-activation/6 record 11（既有
// P5 沙盒）新增一列「TEST-CRUD-請勿理會」測試列並完整跑過建立→修改→刪除→GET 復驗零殘留
// 才落地。field whitelist 完全複用既有 WB_INVESTOR_SUBTABLES / WB_PROPERTY_SUBTABLES（無
// 新增可寫欄位，只是新增了「對既有列」的操作路徑），rowId 必須 `/^\d{1,12}$/`（正整數，
// 與新增用的負數 -1 區分開，避免誤刪/誤改）。全部強制驗 `?token=` 比照 WORKBENCH_ACTIONS
// 既有規則。既有 38 個 action（含 v32 的 8 個 wb* GET/主表更新/新增子表）一行未動
// （additive only）。
// wuohome-ragic-proxy v34 — 工務報修工作檯優化 v2：`fetchRepairPages` GET 加 `info=true`，
// `repairPublicRecord` 新增 `updatedAt`（Ragic 內建 `_update_date`，近似計算「已停留 N 天」，
// 零 schema 變更）；`repairListMine`/`repairListAll` 回應新增 `viewer:{role,name}` 供前端
// 角色化標題渲染（移除硬編碼「陳勁豪專用」）。既有 45 個 action 與所有寫入邏輯一行未動
// （additive only，純讀取欄位擴充）。
// wuohome-ragic-proxy v33 — 設計部工作檯 P1：新增 3 個唯讀 decor* action（decorListAll/
// decorDetail/decorFile），讀 finance/8（裝潢_工程進度）。全 action 強制驗 `?token=` 比對
// Worker secret DECOR_TOKENS_JSON（token→角色 supervisor/designer/admin 對照表，角色化不
// 硬編碼人名），失敗一律同型 404（比照 v29/v30/P5 IDOR root-fix 手法，不分因由防列舉）。
// decorFile 為全家第一個「伺服器端代下載附件位元組」代理（既有 repair/wb 附件皆是直接把
// ap15 file.jsp URL 回給前端），僅接受 rid+token，Worker 固定反查 finance/8 該 rid 的
// 1000179 合約上傳欄、fetch 後串流回傳，不接受任意 URL/欄位/sheet 參數。欄位白名單採
// default-deny：decorPublicRecord() 只手動取用明列欄位組成輸出物件，從不 spread 原始
// Ragic record，成本/利潤欄位（1001232/1001233/1001228）與其餘未列欄位在程式碼層面就不
// 可能外洩。既有 42 個 action 一行未動（additive only）。
// wuohome-ragic-proxy v32 — 資產活化工作檯 P5：新增 8 個 wb* action（wbListInvestors/
// wbGetInvestor/wbUpdateInvestor/wbAddInvestorSub/wbListProperties/wbGetProperty/
// wbUpdateProperty/wbAddPropertySub），讀寫 asset-activation/6（投資學員）與 /4（物件）。
// 全 action 強制驗 `?token=` 比對 Worker secret WORKBENCH_TOKEN，失敗一律同型 404（比照
// v29/v30 IDOR root-fix 手法，不分因由防列舉）。既有 34 個 action 一行未動（additive only）。
// v31 — 工務報修完整狀態機、安全 owner/quote token、附件與分頁
// v30 — payment-receipt IDOR root-fix: getPaymentReceipt /
// verifyPaymentReceipt / submitPaymentReceipt / getPaymentSource / submitPaymentSource /
// createPaymentReceipt all reworked to require + generate a token (field 1003029 on
// payments/2, new field added 2026-07-16) — mirrors v29's earnest fix. Additionally fixes
// the getRagicRecordById(.json) BATCH LIST leak that let `?rid=1` alone dump the entire
// 236-record table (worse than earnest's IDOR — see 技術債/規格書 for full incident writeup).
//
// v29 — earnest IDOR root-fix: rid/code branches of getEarnest /
// submitEarnest / submitEarnestAsync now REQUIRE a matching token (was optional since
// v21/v22, which is why the hole survived those two versions — see 技術債/規格書).
// Worker directly calls Telegram API on failure (no Mac Mini hop).
// Mac Mini notify-server retains /telegram-webhook for callback_query button handling.

const ALLOWED_ACTIONS = {
  lookupOperator:   { method: 'GET' },
  bindOperator:     { method: 'POST' },
  submitTenantNeed: { method: 'POST' },
  bindTenant:       { method: 'POST' },
  // Group A (schedule)
  listEmployees:    { method: 'GET' },
  listStaff:        { method: 'GET' },
  listLeaves:       { method: 'GET' },
  createLeave:      { method: 'POST' },
  // Group B (dashboard read-only)
  listIntake:       { method: 'GET' },
  listInventory:    { method: 'GET' },
  listPayments:     { method: 'GET' },
  listOutreach:     { method: 'GET' },
  listCommission:   { method: 'GET' },
  listClients:      { method: 'GET' },
  listGoals:        { method: 'GET' },
  submitHrOnboarding: { method: 'POST' },
  // Group H2: bcard survey (in-service staff name list + update 3 fields)
  getBcardStaff:    { method: 'GET' },
  submitBcardSurvey: { method: 'POST' },
  // Group C: earnest + payment-receipt (sync, kept for 60-day observation)
  getEarnest:            { method: 'GET' },
  submitEarnest:         { method: 'POST' },
  getPaymentReceipt:     { method: 'GET' },
  verifyPaymentReceipt:  { method: 'GET' },
  getPaymentSource:      { method: 'GET' },
  submitPaymentReceipt:  { method: 'POST' },
  createPaymentReceipt:  { method: 'POST' },  // Group C2: 建立新收款單
  submitPaymentSource:   { method: 'POST' },
  // Group D: earnest async queue (Phase 1B)
  submitEarnestAsync:    { method: 'POST' },
  listFailedSubmissions: { method: 'GET' },
  // Group H: perf-goal (5月業績目標)
  'perf-goal':           { method: 'POST' },
  // Group E: client diagnostic (no Ragic key needed)
  diagnostic:            { method: 'POST' },
  // Group F: yongce map (ap16 read-only, no write)
  getYongceProperties:   { method: 'GET' },
  // Group G: wuohome map (ap15, own sheet10 + alliance sheet27, read-only)
  getOwnProperties:      { method: 'GET' },
  getAllianceProperties:       { method: 'GET' },
  // Group F2: yongce alliance map (ap15 sheet21 + filterId=104, read-only, no key in browser)
  getYongceAllianceProperties: { method: 'GET' },
  // Group I: refund confirm page (payments/5)
  getRefund:             { method: 'GET' },
  submitRefund:          { method: 'POST' },
  verifyRefund:          { method: 'GET' },
  // Group J: 591拋轉刊登包 (toss591.html, read-only single record)
  getToss591:            { method: 'GET' },
  // Group K: 591 撒單雷達 (extension, token-gated)
  check591Collision:     { method: 'POST' },
  // Group L: 591 一鍵登記開發 (extension, token-gated, Joan-only in testing)
  // Group L: 591 一鍵登記開發 (extension, token-gated, Joan-only in testing)
  registerDevelopment:   { method: 'POST' },
  // Group N: payment-create.html — search active cases
  searchCases:           { method: 'GET' },  // Group N: in-management case list for 收款單建立
  searchStaff:           { method: 'GET' },  // Group N2: active staff list for 經辦人員 dropdown
  searchDeposits:        { method: 'GET' },  // Group N3: deposit list for 定金單 lookup
  // Group M: Ragic email validate (extension, CORS-allowed)
  checkRagicEmail:       { method: 'GET' },
  // Group O: deposit.html — business staff quick-create 定金/斡旋 record (payments/1)
  createDeposit:         { method: 'POST' },
  // Group P: bug report -- staff pages send screenshot + description to OPS Telegram
  reportBug:             { method: 'POST' },
  // Group Q: service-fee.html — Esther 自助請款（固定連結、每月自填，2026-07-13）
  getServiceFeeIdentity: { method: 'GET' },
  createServiceFeeOrder: { method: 'POST' },
  // Group R: 工務報修系統（maintenance-management/8）
  repairCreate:          { method: 'POST' },
  repairListMine:        { method: 'GET' },
  repairListAll:         { method: 'GET' },
  repairQuoteCost:       { method: 'POST' },
  repairSetMargin:       { method: 'POST' },
  repairReportPayment:   { method: 'POST' },
  repairDispatch:        { method: 'POST' },
  repairComplete:        { method: 'POST' },
  repairAccept:          { method: 'POST' },
  repairReject:          { method: 'POST' },
  repairCancel:          { method: 'POST' },
  repairQuoteView:       { method: 'GET' },
  // Group S: 資產活化工作檯 P5（asset-activation/4 + /6，固定連結 + WORKBENCH_TOKEN 全 action 強制驗證，2026-07-17）
  wbListInvestors:       { method: 'GET' },
  wbListProperties:      { method: 'GET' },
  // Group T: 設計部工作檯 P1（finance/8，固定連結 + DECOR_TOKENS_JSON 全 action 強制驗證，2026-07-20，唯讀）
  decorListAll:          { method: 'GET' },
  // Group T.1（P2，2026-07-20）：進度照片回看代理，flat action（query string 帶 rid+row+idx+token，
  // 比照 decorFile 的「可被 <a href> 直接開啟」需求，但因需要 rid+子表列兩個識別參數，改用 query
  // string 而非 PATH_PREFIX 單一路徑段）
  decorProgressPhoto:    { method: 'GET' },
  // Group T.2（P2 補派，2026-07-20）：合約附件多檔瀏覽，flat action（rid+idx+token），與
  // decorProgressPhoto 同款式；既有 decorFile（PATH_PREFIX，回傳第一筆）一行不改，舊連結行為不變。
  decorContractFile:     { method: 'GET' },
  // Group U: 工作日誌（maintenance-management/9，固定連結 + WORKLOG_TOKENS_JSON 全 action 強制
  // 驗證，2026-07-22）。worklogCreate 支援批次（一次送出多個小時列，each row 可選帶既有 rid 做
  // 部分更新）；worklogListAll 僅限 manager 角色 token。
  worklogCreate:         { method: 'POST' },
  worklogListMine:       { method: 'GET' },
  worklogListAll:        { method: 'GET' },
  // Group V: 修繕報價單產生器 → Ragic 化（maintenance-management/15，2026-07-24）。無固定
  // WORKER secret token gate（不像 Group S/T/U）——rqGet 的守門是「建單當下產生、僅該筆記錄
  // 持有」的分享token 逐筆交叉比對，token-only IDOR 防護見下方 handler 註解。
  rqCreate:              { method: 'POST' },
  rqGet:                 { method: 'GET' },
  // Group W: 企業入口 公布欄 + 心情留言板（Supabase portal_posts / portal_moods，2026-07-28）。
  // 本組是唯一不打 Ragic 的 action group。無固定 token gate（全公司首頁，人人可讀），守門靠
  // CORS lock + action/欄位白名單 + Worker 端自行判定管理層身分；service_role key 只在 Worker。
  portalListPosts:       { method: 'GET' },
  portalCreatePost:      { method: 'POST' },
  portalPinPost:         { method: 'POST' },
  portalDeletePost:      { method: 'POST' },
  portalListMoods:       { method: 'GET' },
  portalCreateMood:      { method: 'POST' },
  portalDeleteMood:      { method: 'POST' },
  // Group X: 零用金請款（petty-cash.html / petty-cash-admin.html，finance2/14，2026-07-28）。
  // 兩種 token 身分（同仁反查人事表 / 財務比對 PETTY_CASH_FINANCE_TOKENS_JSON），全 action 強制
  // 驗證，失敗或角色不符一律同型 404（不分因由防列舉）。
  pettyCashIdentity:     { method: 'GET' },
  pettyCashCreate:       { method: 'POST' },
  pettyCashListMine:     { method: 'GET' },
  pettyCashListAll:      { method: 'GET' },
  pettyCashMarkPaid:     { method: 'POST' },
};

const REPAIR_INTERNAL_ACTIONS = new Set([
  'repairCreate', 'repairListMine', 'repairListAll', 'repairQuoteCost',
  'repairSetMargin', 'repairReportPayment', 'repairDispatch', 'repairComplete',
  'repairAccept', 'repairReject', 'repairCancel',
]);
const REPAIR_SHEET = 'maintenance-management/8';
const REPAIR_VENDOR_SHEET = 'decorating/4';
const RF = Object.freeze({
  ticket: '1001851', time: '1000489', elapsedDays: '1000490', reporter: '1001852', status: '1001311', category: '1001854',
  phone: '1001853', address: '1001856', room: '1001855', available: '1001864', photos: '1000788',
  description: '1000486', estimateNote: '1001874', vendor: '1001879', scheduledAt: '1001880',
  finishedAt: '1001310', finishedPhoto: '1001883', actualDescription: '1001885', companyCost: '1003012', margin: '1003013',
  total: '1003014', vendorActual: '1003015', companyProfit: '1003016', owner: '1003023',
  source: '1003017', paymentStatus: '1003018', paymentAt: '1003019', paymentProof: '1003020',
  cancelReason: '1003021', acceptKey: '1003028', acceptDate: '1003024', acceptResult: '1003025',
  acceptReason: '1003026', acceptPhoto: '1003027',
});

const PAYMENT_SOURCE_SHEETS = {
  ownerSource:  'operation/8',
  tenantSource: 'payments/1',
};
// IDOR root-fix 2026-07-16: getPaymentSource / submitPaymentSource no longer trust a
// client-supplied `where=`/`_rid=` — they re-derive the lookup from the TOKEN-VERIFIED
// payments/2 record. These two maps mirror payment-receipt.html's `sourceConfig`:
// codeFieldId = field on payments/2 holding the source-sheet's code value (link display);
// idField     = field on the source sheet itself to where=eq the code against.
const PAYMENT_SOURCE_CODE_FIELD = { ownerSource: '1001705', tenantSource: '1000789' }; // payments/2: 屋主編號 / 定金單編號
const PAYMENT_SOURCE_ID_FIELD   = { ownerSource: '1000264', tenantSource: '1000796' }; // source sheet: 屋主編號 / 定金單編號

const EARNEST_FIELDS_WHITELIST = new Set([
  '1000792', // 租客姓名
  '1000808', // 租客電話
  '1000837', // 租客職業
  '1000816', // 租客簽名 (base64)
  '1001709', // PDF 上傳
]);
const EARNEST_SIGNATURE_FIELDS = new Set(['1000816']);
const EARNEST_SIGNATURE_MAX_BYTES = 2 * 1024 * 1024;

const PAYMENT_RECEIPT_FIELDS_WHITELIST = new Set([
  '1000786', '1000787', '1000784', '1000650', '1000785', '1000780', '1000603',
]);
const PAYMENT_RECEIPT_SIGNATURE_FIELDS = new Set(['1000786', '1000787']);

// Group I: refund (payments/5) — A11~A17 writable by customer
const REFUND_FIELDS_WHITELIST = new Set([
  '1002108', // A11 refund reason
  '1002109', // A12 refund method
  '1002110', // A13 refund bank
  '1002111', // A14 refund account
  '1002112', // A15 passbook file
  '1002113', // A16 customer signature (base64)
  '1002114', // A17 customer confirm time
]);
const REFUND_SIGNATURE_FIELDS = new Set(['1002113']);

const PAYMENT_SOURCE_FIELDS_WHITELIST = new Set(['1001642', '1000808']);

// Group O: deposit.html — createDeposit allowed EIDs (payments/1)
// Only these fields may be written; all others from the body are silently dropped.
const DEPOSIT_FIELDS_WHITELIST = new Set([
  '1002054', // 選擇分類
  '1000790', // 案名/連結
  '1002055', // 公司件案名
  '1000799', // 地址
  '1002056', // 公司件地址
  '1000818', // 租金
  '1000819', // 押金
  '1000821', // 租金內含稅金
  '1000822', // 租金內含管理費
  '1000824', // 租期
  '1000826', // 租金內含車位
  '1000828', // 車位類型
  '1000829', // 車位編號
  '1000830', // 付款方式
  '1000831', // 要約條件
  '1000832', // 要約定金
  '1000798', // 定金收款日期
  '1000833', // 簽約日
  '1000834', // 起租日
  '1000835', // 定金付法
  '1000836', // 匯款後五碼
  '1000820', // 物件來源
  '1000793', // 經辦人員
  '1000838', // 經辦電話
  // 1001815 選擇群組 — 故意不列入白名單；Worker 端固定注入，前端無法覆蓋
  '1000839', // 服務費
  '1000792', // 租客姓名
  '1000808', // 租客電話
  '1000837', // 租客職業
  '1002558', // 定金 token (UUID, IDOR fix 2026-06-22)
]);

// ── Group Q: service-fee.html — Esther 自助請款（固定連結、每月自填，2026-07-13）──
// 廠商 = decorating/4（協力廠商）；Token 存於新增欄位 1002939（固定連結Token，2026-07-13 建）
// 訂單 = finance2/5（採購/請款）；client 送的是具名 meta key（token/mode/name/...），
// 不是原始 Ragic fieldId，故不用 processMultipart 泛用白名單，Worker 端顯式取值+驗證後
// 自己組出 Ragic 欄位參數，杜絕任意 fieldId 注入。
const SERVICE_FEE_VENDOR_SHEET = 'decorating/4';
const SERVICE_FEE_ORDER_SHEET  = 'finance2/5';
const SERVICE_FEE_TOKEN_FIELD  = '1002939';
const SERVICE_FEE_MAX_PDF_BYTES = 8 * 1024 * 1024;
// 身分證正反面 + 存摺封面照片（2026-07-13 補回舊 GAS 系統原有功能，轉 Ragic 架構時掉的缺口）。
// mode=first 專用（KYC 一次性資料，回訪不重傳）。存放位置＝finance2/5 既有附件欄位 1000663（多檔案上傳，
// 已於 2026-07-13 驗證「追加不覆蓋」行為），不新增 decorating/4 schema 欄位——decorating/4 主表單沒有
// 可寫入的檔案欄位（子表格 1000663 鏡射唯讀），加欄位屬 schema 變更，本次功能缺口用既有欄位即可解決，
// 不動 schema 風險更低。
const SERVICE_FEE_MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const SERVICE_FEE_BANK_OPTIONS = new Set([
  '(822) 中國信託','(004) 台灣銀行','(005) 土地銀行','(006) 合作金庫','(007) 第一銀行',
  '(008) 華南銀行','(009) 彰化銀行','(011) 上海商業','(012) 台北富邦','(013) 國泰世華',
  '(016) 高雄銀行','(017) 兆豐國際','(021) 花旗銀行','(050) 台灣中小企銀','(052) 渣打國際',
  '(053) 台中銀行','(054) 京城銀行','(081) 滙豐銀行','(101) 瑞興銀行','(102) 華泰銀行',
  '(103) 新光銀行','(108) 陽信銀行','(118) 板信銀行','(147) 三信商業','(289) 王道銀行',
  '(700) 郵局','(803) 聯邦銀行','(805) 遠東商銀','(806) 元大銀行','(807) 永豐銀行',
  '(808) 玉山銀行','(809) 凱基銀行','(810) 星展銀行','(812) 台新銀行','(815) 日盛銀行',
  '(816) 安泰銀行',
]);

const HR_FIELDS_WHITELIST = new Set([
  '3000933','3000947','3001021','3000954','3000956','3001020','3001022','3000945',
  '3000943','3000975','3000941','1000875','3000976','3000977','3001019','1000861',
  '1000863','1000864','3000953','1000865',
  '3000965','3000988','3001092','3000990','3000991','3000992',
  '3000982','3000983','3000984','3000986','3000987',
  '3000979','3001027','3001031','3001029','3001030','1000874',
  '1000868','1000870','1000925',
]);
const HR_MAX_FILE_BYTES = 5 * 1024 * 1024;

// Group H2: bcard survey — only these 3 fields are writable by staff self-service
// 1002556（名片調查填寫時間）is intentionally excluded: proxy writes it server-side, not client
const BCARD_FIELDS_WHITELIST = new Set([
  '3000975', // 主要手機號碼
  '1002554', // 營業員證號
  '1002555', // 租賃住宅管理人員證號
]);

const PATH_PREFIX = [
  { prefix: 'deleteLeave/',          method: 'DELETE', op: 'deleteLeave' },
  { prefix: 'updateLeave/',          method: 'POST',   op: 'updateLeave' },
  { prefix: 'getSubmission/',        method: 'GET',    op: 'getSubmission' },
  { prefix: 'retrySubmission/',      method: 'POST',   op: 'retrySubmission' },
  { prefix: 'markSubmissionManual/', method: 'POST',   op: 'markSubmissionManual' },
  // Group S: 資產活化工作檯 P5（rid 皆為 asset-activation/4 或 /6 的數字 record id）
  { prefix: 'wbGetInvestor/',        method: 'GET',    op: 'wbGetInvestor' },
  { prefix: 'wbUpdateInvestor/',     method: 'POST',   op: 'wbUpdateInvestor' },
  { prefix: 'wbAddInvestorSub/',     method: 'POST',   op: 'wbAddInvestorSub' },
  { prefix: 'wbGetProperty/',        method: 'GET',    op: 'wbGetProperty' },
  { prefix: 'wbUpdateProperty/',     method: 'POST',   op: 'wbUpdateProperty' },
  { prefix: 'wbAddPropertySub/',     method: 'POST',   op: 'wbAddPropertySub' },
  // Group S.1（2026-07-20）：子表列修改／刪除，補完整 CRUD（先前只能新增列）
  { prefix: 'wbUpdateInvestorSub/',  method: 'POST',   op: 'wbUpdateInvestorSub' },
  { prefix: 'wbDeleteInvestorSub/',  method: 'POST',   op: 'wbDeleteInvestorSub' },
  { prefix: 'wbUpdatePropertySub/',  method: 'POST',   op: 'wbUpdatePropertySub' },
  { prefix: 'wbDeletePropertySub/',  method: 'POST',   op: 'wbDeletePropertySub' },
  // Group T: 設計部工作檯 P1（rid 皆為 finance/8 的數字 record id，唯讀）
  { prefix: 'decorDetail/',          method: 'GET',    op: 'decorDetail' },
  { prefix: 'decorFile/',            method: 'GET',    op: 'decorFile' },
  // Group T.1（P2，2026-07-20）：新增進度紀錄（寫入），rid 在路徑比照 wbAddInvestorSub 慣例
  { prefix: 'decorProgressAdd/',     method: 'POST',   op: 'decorProgressAdd' },
];

// PATH_PREFIX ops whose path segment is a numeric Ragic record id (vs. UUID submission id)
const RID_PATH_OPS = new Set([
  'deleteLeave', 'updateLeave',
  'wbGetInvestor', 'wbUpdateInvestor', 'wbAddInvestorSub',
  'wbGetProperty', 'wbUpdateProperty', 'wbAddPropertySub',
  'wbUpdateInvestorSub', 'wbDeleteInvestorSub', 'wbUpdatePropertySub', 'wbDeletePropertySub',
  'decorDetail', 'decorFile', 'decorProgressAdd',
]);

// Group S: 資產活化工作檯 P5 常數（asset-activation/4 + /6，[[資產活化工作檯_規格書]] Schema A/B 欄位定案）
const WB_INVESTOR_SHEET = 'asset-activation/6';
const WB_PROPERTY_SHEET = 'asset-activation/4';
const WORKBENCH_ACTIONS = new Set([
  'wbListInvestors', 'wbGetInvestor', 'wbUpdateInvestor', 'wbAddInvestorSub',
  'wbListProperties', 'wbGetProperty', 'wbUpdateProperty', 'wbAddPropertySub',
  'wbUpdateInvestorSub', 'wbDeleteInvestorSub', 'wbUpdatePropertySub', 'wbDeletePropertySub',
]);
// 主表可寫白名單（部分更新：body 只帶要改的欄位，未帶的欄位維持原值）
const WB_INVESTOR_MAIN_WHITELIST = new Set([
  '1003030', '1003031', '1003032', '1003033', '1003034', '1003035',
  '1003036', '1003037', '1003038', '1003039', '1003040', '1003090',
]);
const WB_INVESTOR_MULTI_FIELDS = new Set(['1003035', '1003037']); // 資金來源／現有負債（多選，API 寫入用重複同名參數，見踩坑速查續20）
const WB_PROPERTY_MAIN_WHITELIST = new Set([
  '1003058', '1003059', '1003060', '1003061', '1003062', '1003063', '1003064', '1003065', '1003066',
]);
const WB_PROPERTY_MULTI_FIELDS = new Set(['1003066']); // 關聯投資人（多選連結欄，同上重複同名參數）
const WB_PROPERTY_WHERE_FIELDS = new Set(['1003058', '1001996']); // 操盤階段／591狀態
const WB_PROPERTY_DEFAULT_LIMIT = 100;
const WB_PROPERTY_MAX_LIMIT = 500;
// 子表新增列白名單：{ 子表格 keyFieldId, 該子表可寫欄位 }
const WB_INVESTOR_SUBTABLES = {
  progress: { key: '1003007', fields: new Set(['1003003', '1003011', '1003004', '1003006', '1003056']) },
  relation: { key: '1003047', fields: new Set(['1003041', '1003042', '1003043', '1003044', '1003045', '1003046']) },
  asset:    { key: '1003055', fields: new Set(['1003048', '1003049', '1003050', '1003051', '1003052', '1003053', '1003054']) },
};
const WB_PROPERTY_SUBTABLES = {
  finance:     { key: '1003071', fields: new Set(['1003068', '1003069', '1003070']) },
  calc:        { key: '1003076', fields: new Set(['1003072', '1003073', '1003074', '1003075']) },
  risk:        { key: '1003080', fields: new Set(['1003077', '1003078', '1003079']) },
  inquiry:     { key: '1003085', fields: new Set(['1003081', '1003082', '1003083', '1003084']) },
  progresslog: { key: '1003089', fields: new Set(['1003086', '1003087', '1003088']) },
};

// ── Group T: 設計部工作檯 P1（finance/8＝裝潢_工程進度，固定連結，全 GET 唯讀，2026-07-20）──
// 欄位 fid 依 [[設計部工作檯_規格書]] § 欄位白名單 2026-07-20 Ragic 實表定案；rid 型別/來源比照
// P5 wbGetInvestor 直接路徑 GET（無 .json 後綴，避免踩 earnest 那個「.json 觸發批量列表」IDOR）。
const DECOR_SHEET = 'finance/8';
const DECOR_STATUS_ACTIVE = '🛠️工程中'; // 狀態值含 emoji，全字串比對，禁用「工程中」純文字比對
const DECOR_STALE_DAYS = 7; // 「滿 7 天無更新（第 8 個日曆天起）」規劃預設值，非 Joan 拍板數字
const DF = Object.freeze({
  name: '1000170', assignee: '1000203', supervisor: '1000207', status: '1000206',
  contractTotal: '1000173', startAt: '1000177', endAt: '1000178', paidRatio: '1000174',
  lastUpdateAt: '1001241', lastWorkItem: '1001242', contractFile: '1000179',
  progressKey: '1000192', progressStart: '1000186', progressEnd: '1000214', progressContent: '1000187',
  // P2（2026-07-20 ragic agent 新增欄位）：工項分類（LIST，12 選項）／進度照片（多檔上傳）／
  // 子表自身「更新日期」（唯讀，預設 $DATE，實測 API 新增列不自動觸發，Worker 顯式補寫，見上方 v36 註記）。
  progressCategory: '1003091', progressPhoto: '1003092', progressUpdatedAt: '1001240',
  paymentKey: '1000191', paymentName: '1000181', paymentRatio: '1000183', paymentAt: '1000180',
  addonKey: '1000199', addonDate: '1000194', addonItem: '1000195', addonAmount: '1000196',
});
// 角色化：只存角色代號 + 顯示稱呼，禁止在程式碼中出現真實人名（呼應規格書制度前提）
const DECOR_ROLES = new Set(['supervisor', 'designer', 'admin']);
const DECOR_ROLE_LABELS = { supervisor: '工務主管', designer: '設計師', admin: '管理員' };
// P2：三角色皆可寫（規格書角色表「可寫（P2 起）」欄位三者皆勾），沿用同一 token→角色驗證機制。
const DECOR_ACTIONS = new Set(['decorListAll', 'decorDetail', 'decorFile', 'decorProgressAdd', 'decorProgressPhoto', 'decorContractFile']);
// 工項分類 12 選項（2026-07-20 Joan 核定，見規格書 § 工項順序與關鍵字對照）——Ragic LIST 欄位 API
// 不驗證選項合法性（踩坑速查續14/20 已記載），Worker 端必須自帶白名單擋非法值。
const DECOR_WORK_CATEGORIES = Object.freeze([
  '拆除工程', '水電工程', '泥作工程', '門窗工程', '木作工程', '油漆工程',
  '系統櫃', '廚具工程', '衛浴設備', '空調工程', '雜項工程', '其他',
]);
const DECOR_WORK_CATEGORY_SET = new Set(DECOR_WORK_CATEGORIES);
const DECOR_PHOTO_MAX_COUNT = 10; // spec 未定數字，工地單次紀錄合理張數上限，spec-外決定

// ── Group U: 工作日誌（maintenance-management/9，固定連結，全 action 強制驗 token→{role,name}，
// 2026-07-22）。比照 Group T（DECOR_TOKENS_JSON）/ Group S（WORKBENCH_TOKEN）手法：token 失敗
// 一律同型 404（不分因由防列舉）；角色不符（token 有效但非管理者呼叫 worklogListAll）回 403，
// 兩者語意不同（比照既有 repair 系統 requireRepairRole 手法區分）。填寫人（1003093）一律伺服器端
// 固定帶入，不接受前端傳入值——防冒名是本系統唯一防線（Ragic 該欄目前未勾唯讀，見規格書已知
// 落差 #1）。日期（1003094）2026-07-24 起改為**接受前端傳入**，但伺服器驗證「不得早於今天」
// （Asia/Taipei）——放寬成「今天或未來可寫」是陳勁豪/葉恩廷實際使用後提出的真實需求（提早排定
// 明天行程），跨日鎖定的防竄改精神不變：鎖點從「必須等於今天」改成「不得早於今天」，過去日期一律
// 拒絕（見下方 worklogCreate 內 date_locked_past／record_locked_cross_day）。
const WORKLOG_SHEET = 'maintenance-management/9';
const WORKLOG_ROLES = new Set(['staff', 'manager']);
const WF = Object.freeze({
  reporter: '1003093', date: '1003094', hour: '1003095', category: '1003097',
  caseName: '1003098', repairReason: '1003099', plannedSchedule: '1003100', note: '1003101',
  // startTime/endTime：2026-07-25 V2 重做新增（自由輸入文字型，"HH:MM"，非 Ragic 原生時間
  // 型別——決策理由：既有欄位全走文字型 API 寫入穩定，時間型別在其他系統踩過時區轉換偏移的坑
  // （見踩坑速查 Google Sheet 時區條目同類風險），文字型可完全掌控格式、零轉換層。舊「時間
  // (小時)」(1003095) 欄位保留不動，V1 舊紀錄／V2 新紀錄並存於同一張表，互不干擾。
  startTime: '1003191', endTime: '1003192',
});
// V2 逐筆時間（"HH:MM"，24hr）格式驗證；範圍檢查（結束>開始）在 handleWorklogAction 內做。
const WORKLOG_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
function worklogTimeToMinutes(t) {
  const m = WORKLOG_TIME_RE.exec(t);
  if (!m) return null;
  const [h, mm] = t.split(':').map(Number);
  return h * 60 + mm;
}
// 1003095「時間(小時)」11 個真實選項，2026-07-22 用 JoanDevAgent 帳號透過 agent-browser 登入
// Design Mode 開新增表單、實際點開下拉選單逐一讀出（非猜測／非規格書字面直翻）：中段 9 格
// 跳過 12:00-13:00 午休（09:00 起連續到 11:00-12:00，接著跳到 13:00-14:00 到 18:00-19:00），
// 頭尾各一個桶籃選項。此為規格書 §Ragic schema 的「9格」文字唯一自洽的真實排列。
const WORKLOG_HOUR_ORDER = Object.freeze([
  '0900之前', '09:00-10:00', '10:00-11:00', '11:00-12:00', '13:00-14:00',
  '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00', '18:00-19:00', '19:00之後',
]);
const WORKLOG_HOUR_SET = new Set(WORKLOG_HOUR_ORDER);
const WORKLOG_HOUR_RANK = new Map(WORKLOG_HOUR_ORDER.map((h, i) => [h, i]));
// 項目選項依角色分流（2026-07-22 規格書 P2 補充「項目選單需依角色分流」落地）。
// 工務 9 個選項沿用既有（main 派工已核實，不重新查證）；租賃 13 個選項取自既有
// [[每日行程點名]]（property-data-kept/9 fid 1000610，運作 4 個月無問題的封閉選項），
// 沿用同一批文字字面值以利未來對照/合併。伺服器驗證用「聯集」——不論 token 屬於哪個
// categoryGroup，寫入時都接受任一組的值（不做角色鎖死，避免真的跨類別使用時被卡住；
// 分流只影響前端顯示順序，不影響後端可寫入的值域，見規格書「顯示順序/預設子集，不是
// 寫死擋掉其他選項」）。
const WORKLOG_CATEGORIES_WORK = Object.freeze([
  '場勘', '租客聯繫', '屋主聯繫', '報價', '廠商聯繫', '驗收', '內部會議', '文書作業', '其他',
]);
const WORKLOG_CATEGORIES_RENTAL = Object.freeze([
  '開發', '委託', '帶看', '簽約', '修繕', '續約', '議價', '請假', '休假', '上課', '活動', '上廣告', '退租點交',
]);
const WORKLOG_CATEGORY_SET = new Set([...WORKLOG_CATEGORIES_WORK, ...WORKLOG_CATEGORIES_RENTAL]);
// token 設定檔 categoryGroup 允許值；manager／未指定 = 不分組（前端顯示全部，工務組在前，
// 沿用既有預設順序，不影響既有 manager token 行為）。
const WORKLOG_CATEGORY_GROUPS = new Set(['工務', '租賃']);
// spec 僅寫「建議限制字數」未給硬性上限，此為 spec-外決定的保守值（比前端 UI 顯示上限寬鬆，
// 避免擋到合理輸入，同時防止異常超長字串灌入）。
const WORKLOG_TEXT_MAX = { caseName: 200, repairReason: 300, plannedSchedule: 300, note: 500 };
const WORKLOG_MAX_BATCH = 13; // 一天最多 11 小時格＋前後桶籃，批次上限比欄位數再留餘裕
const WORKLOG_ACTIONS = new Set(['worklogCreate', 'worklogListMine', 'worklogListAll']);

function parseWorklogTokenConfig(env) {
  let tokens;
  try { tokens = JSON.parse(env.WORKLOG_TOKENS_JSON || '{}'); } catch { return null; }
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return null;
  const normalized = {};
  for (const [token, raw] of Object.entries(tokens)) {
    if (!token || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const role = raw.role;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!WORKLOG_ROLES.has(role) || !name) return null;
    // categoryGroup 選填（2026-07-22 規格書補充）：manager／未指定＝不分組（前端顯示全部）；
    // staff 若指定，值必須是已知組別，否則整包設定視為壞掉（比照既有 role/name 全有全無的
    // fail-closed 手法，見上方 WORKLOG_TOKENS_JSON 中文字元多層 shell 轉義踩坑記錄）。
    let categoryGroup;
    if (raw.categoryGroup !== undefined && raw.categoryGroup !== null) {
      if (typeof raw.categoryGroup !== 'string' || !WORKLOG_CATEGORY_GROUPS.has(raw.categoryGroup)) return null;
      categoryGroup = raw.categoryGroup;
    }
    normalized[token] = { role, name, categoryGroup };
  }
  return normalized;
}

// 失敗一律回 null，呼叫端統一映射同型 404（不分因由防列舉，比照 v29/v30/P5/Group T 手法）
function authenticateWorklog(url, env) {
  const tokens = parseWorklogTokenConfig(env);
  if (!tokens) return null;
  const token = url.searchParams.get('token') || '';
  return tokens[token] || null;
}

function worklogClean(v) { return String(v ?? '').trim(); }

function worklogTodayDate() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((out, p) => { out[p.type] = p.value; return out; }, {});
  return `${parts.year}/${parts.month}/${parts.day}`; // Ragic 日期欄位格式 YYYY/MM/DD（既有記錄實測確認）
}

// 接受前端 <input type=date> 的 YYYY-MM-DD 或 Ragic 原生 YYYY/MM/DD，正規化失敗回 null 讓呼叫端拒絕
// （比照既有 decorNormalizeDate 手法）。
function worklogNormalizeDate(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})[\/-](\d{2})[\/-](\d{2})$/.exec(s.trim());
  return m ? `${m[1]}/${m[2]}/${m[3]}` : null;
}

function worklogRecordForRid(data, rid) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const rec = data[String(rid)] || Object.values(data)[0];
  return (rec && typeof rec === 'object' && !Array.isArray(rec)) ? rec : null;
}

function worklogPublicRecord(rid, rec) {
  return {
    rid: String(rid),
    date: worklogClean(rec[WF.date]),
    hour: worklogClean(rec[WF.hour]),
    // 2026-07-25 V2 新增：startTime/endTime 純讀取欄位擴充（additive），V1 舊紀錄這兩欄
    // 是空字串，V1 前端 parseApiEntry() 本來就不讀這兩個 key，不受影響。
    startTime: worklogClean(rec[WF.startTime]),
    endTime: worklogClean(rec[WF.endTime]),
    category: worklogClean(rec[WF.category]),
    caseName: worklogClean(rec[WF.caseName]),
    repairReason: worklogClean(rec[WF.repairReason]),
    plannedSchedule: worklogClean(rec[WF.plannedSchedule]),
    note: worklogClean(rec[WF.note]),
    reporter: worklogClean(rec[WF.reporter]),
  };
}

function worklogSortKey(rec) {
  // V2 紀錄沒有 hour（走 startTime/endTime），rank 落 999 排最後；V2 前端自己依 startTime
  // 排序顯示，這個 key 只給 V1 worklogListMine/ListAll 既有排序邏輯用，行為不變。
  const rank = WORKLOG_HOUR_RANK.has(rec.hour) ? WORKLOG_HOUR_RANK.get(rec.hour) : 999;
  return `${rec.date}_${String(rank).padStart(3, '0')}`;
}

// 找既有列（reporter+date+hour 三者相符），供 worklogCreate 在前端未帶 rid 時自我防呆，
// 避免同一小時格因重複送出（如網路重試、多分頁）而長出兩筆重複列。
async function findWorklogRow(env, name, date, hour) {
  const qs = `naming=EID&limit=0,5&where=${WF.reporter},eq,${encodeURIComponent(name)}` +
    `&where=${WF.date},eq,${encodeURIComponent(date)}&where=${WF.hour},eq,${encodeURIComponent(hour)}`;
  const { upstream, data } = await getFromRagic(env, WORKLOG_SHEET, qs);
  if (!upstream.ok || !data) return null;
  const entries = Object.entries(data).filter(([k]) => /^\d+$/.test(k));
  return entries.length > 0 ? entries[0][0] : null;
}

// V2（2026-07-25）鏡像 findWorklogRow，但用 startTime+endTime 當比對鍵（V2 沒有 hour 格）。
// 同樣只是「前端沒帶 rid 時的自我防呆」安全網——V2 前端正常流程是第一次送出後把 Worker
// 回傳的 rid 存在本機（block.rid），之後編輯同一筆一律帶 rid，不依賴這支函式命中。
async function findWorklogRowByTime(env, name, date, startTime, endTime) {
  const qs = `naming=EID&limit=0,5&where=${WF.reporter},eq,${encodeURIComponent(name)}` +
    `&where=${WF.date},eq,${encodeURIComponent(date)}&where=${WF.startTime},eq,${encodeURIComponent(startTime)}` +
    `&where=${WF.endTime},eq,${encodeURIComponent(endTime)}`;
  const { upstream, data } = await getFromRagic(env, WORKLOG_SHEET, qs);
  if (!upstream.ok || !data) return null;
  const entries = Object.entries(data).filter(([k]) => /^\d+$/.test(k));
  return entries.length > 0 ? entries[0][0] : null;
}

async function handleWorklogAction(action, request, env, identity, origin) {
  const url = new URL(request.url);

  if (action === 'worklogListMine' || action === 'worklogListAll') {
    if (action === 'worklogListAll' && identity.role !== 'manager') {
      return jsonResp({ error: 'forbidden' }, 403, origin);
    }
    const rawDate = url.searchParams.get('date');
    const date = rawDate ? worklogNormalizeDate(rawDate) : worklogTodayDate();
    if (!date) return jsonResp({ error: 'invalid_date' }, 400, origin);
    const whereParts = [`where=${WF.date},eq,${encodeURIComponent(date)}`];
    if (action === 'worklogListMine') whereParts.push(`where=${WF.reporter},eq,${encodeURIComponent(identity.name)}`);
    const qs = `naming=EID&limit=0,200&${whereParts.join('&')}`;
    const { upstream, data } = await getFromRagic(env, WORKLOG_SHEET, qs);
    const fail = detectUpstreamFailure(upstream, data);
    if (fail) return jsonResp(fail, 502, origin);
    const entries = Object.entries(data || {})
      .filter(([k]) => /^\d+$/.test(k))
      .map(([rid, rec]) => worklogPublicRecord(rid, rec))
      .sort((a, b) => worklogSortKey(a).localeCompare(worklogSortKey(b)));
    // categoryGroup 明確帶 null（非 undefined）給前端：manager／未指定分組時前端拿到明確
    // 值可判斷「顯示全部、工務組排前面」，不會因欄位缺失走到不同的預設分支。
    return jsonResp({
      ok: true, date, entries,
      viewer: { role: identity.role, name: identity.name, categoryGroup: identity.categoryGroup ?? null },
    }, 200, origin);
  }

  if (action === 'worklogCreate') {
    let body;
    try { body = await request.json(); } catch { return jsonResp({ error: 'bad_json' }, 400, origin); }
    const rows = Array.isArray(body?.entries) ? body.entries : null;
    if (!rows || rows.length === 0) return jsonResp({ error: 'empty_entries' }, 400, origin);
    if (rows.length > WORKLOG_MAX_BATCH) return jsonResp({ error: 'batch_too_large' }, 400, origin);

    const today = worklogTodayDate();
    // 2026-07-24：日期改接受前端傳入（body.date），沒帶就預設今天（向下相容舊前端／既有呼叫端
    // 未帶此欄位的情況）。唯一防線：目標日期不得早於今天——`worklogNormalizeDate` 統一輸出固定
    // 寬度 YYYY/MM/DD，字串比較在此格式下等同日期比較。維持「跨日鎖定」防竄改精神，只是把鎖點
    // 從「只能是今天」放寬為「今天或未來」。
    const rawTargetDate = typeof body?.date === 'string' ? body.date : null;
    const targetDate = rawTargetDate ? worklogNormalizeDate(rawTargetDate) : today;
    if (!targetDate) return jsonResp({ error: 'invalid_date' }, 400, origin);
    if (targetDate < today) return jsonResp({ error: 'date_locked_past' }, 400, origin);

    const seenHours = new Set();
    const seenTimeRanges = new Set(); // V2 版：同一批次不可重複同一組 startTime-endTime，比照 seenHours
    const results = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || typeof row !== 'object' || Array.isArray(row)) { results.push({ index: i, ok: false, error: 'invalid_row' }); continue; }

      // 2026-07-25 V2：row 帶 startTime/endTime（不帶 hour）＝新版逐筆自訂起訖時間紀錄；
      // row 帶 hour＝V1 既有小時格紀錄。兩者由 row 本身欄位判斷、互斥分流，V1 分支的驗證／
      // 寫入邏輯本身一行未動，只是整段包進 else（額外多一個 index 欄位回傳，V1 前端沿用
      // 既有的 r.hour 比對邏輯，不受影響）。
      const hasTimeRange = row.startTime !== undefined || row.endTime !== undefined;
      let hour = '';
      let startTime = '';
      let endTime = '';
      let resultBase;

      if (hasTimeRange) {
        startTime = worklogClean(row.startTime);
        endTime = worklogClean(row.endTime);
        resultBase = { index: i, startTime, endTime };
        if (!WORKLOG_TIME_RE.test(startTime) || !WORKLOG_TIME_RE.test(endTime)) {
          results.push({ ...resultBase, ok: false, error: 'invalid_time' }); continue;
        }
        const sMin = worklogTimeToMinutes(startTime);
        const eMin = worklogTimeToMinutes(endTime);
        if (eMin <= sMin) { results.push({ ...resultBase, ok: false, error: 'invalid_time_range' }); continue; }
        const rangeKey = `${startTime}-${endTime}`;
        if (seenTimeRanges.has(rangeKey)) { results.push({ ...resultBase, ok: false, error: 'duplicate_time_in_batch' }); continue; }
        seenTimeRanges.add(rangeKey);
      } else {
        hour = worklogClean(row.hour);
        resultBase = { index: i, hour };
        if (!WORKLOG_HOUR_SET.has(hour)) { results.push({ ...resultBase, ok: false, error: 'invalid_hour' }); continue; }
        if (seenHours.has(hour)) { results.push({ ...resultBase, ok: false, error: 'duplicate_hour_in_batch' }); continue; }
        seenHours.add(hour);
      }

      const category = worklogClean(row.category);
      if (!WORKLOG_CATEGORY_SET.has(category)) { results.push({ ...resultBase, ok: false, error: 'invalid_category' }); continue; }

      const textFields = {
        [WF.caseName]: worklogClean(row.caseName),
        [WF.repairReason]: worklogClean(row.repairReason),
        [WF.plannedSchedule]: worklogClean(row.plannedSchedule),
        [WF.note]: worklogClean(row.note),
      };
      const overLimit = (
        textFields[WF.caseName].length > WORKLOG_TEXT_MAX.caseName ||
        textFields[WF.repairReason].length > WORKLOG_TEXT_MAX.repairReason ||
        textFields[WF.plannedSchedule].length > WORKLOG_TEXT_MAX.plannedSchedule ||
        textFields[WF.note].length > WORKLOG_TEXT_MAX.note
      );
      if (overLimit) { results.push({ ...resultBase, ok: false, error: 'value_too_long' }); continue; }

      let targetRid = null;
      const rowRidRaw = row.rid;
      if (rowRidRaw !== undefined && rowRidRaw !== null && rowRidRaw !== '') {
        const ridStr = String(rowRidRaw);
        if (!/^\d{1,12}$/.test(ridStr)) { results.push({ ...resultBase, ok: false, error: 'invalid_rid' }); continue; }
        const { upstream: checkUp, data: checkData } = await getFromRagic(env, `${WORKLOG_SHEET}/${ridStr}`, 'naming=EID');
        const existing = (checkUp.ok && checkData) ? worklogRecordForRid(checkData, ridStr) : null;
        // 同型失敗（不存在／不是自己的列）一律 not_found，防止用 rid 探測他人紀錄是否存在
        if (!existing || worklogClean(existing[WF.reporter]) !== identity.name) {
          results.push({ ...resultBase, ok: false, error: 'not_found' }); continue;
        }
        // 跨日鎖定（2026-07-24 放寬）：只鎖「這筆既有紀錄本身的日期已經是過去」——今天或未來
        // 都還能改，不再要求「必須等於今天」。V2 沿用同一道防線，不另外實作。
        if (worklogClean(existing[WF.date]) < today) {
          results.push({ ...resultBase, ok: false, error: 'record_locked_cross_day' }); continue;
        }
        targetRid = ridStr;
      } else if (hasTimeRange) {
        targetRid = await findWorklogRowByTime(env, identity.name, targetDate, startTime, endTime);
      } else {
        targetRid = await findWorklogRow(env, identity.name, targetDate, hour);
      }

      const params = new URLSearchParams();
      params.append(WF.reporter, identity.name); // 伺服器固定帶入，防冒名（前端不得傳入此欄）
      params.append(WF.date, targetDate);        // 已在上方驗證「不早於今天」，接受前端指定的今天/未來日期
      if (hasTimeRange) {
        params.append(WF.startTime, startTime);
        params.append(WF.endTime, endTime);
      } else {
        params.append(WF.hour, hour); // V1 既有欄位，V2 紀錄不寫入（保持空白，退役前不混用）
      }
      params.append(WF.category, category);
      for (const [fid, val] of Object.entries(textFields)) params.append(fid, val);

      const sheetPath = targetRid ? `${WORKLOG_SHEET}/${targetRid}` : WORKLOG_SHEET;
      const { upstream, data } = await postUrlEncodedToRagic(env, sheetPath, params.toString());
      const fail = detectUpstreamFailure(upstream, data);
      if (fail) { results.push({ ...resultBase, ok: false, error: fail.error }); continue; }
      results.push({ ...resultBase, ok: true, rid: String(targetRid || data?.ragicId || '') });
    }

    return jsonResp({ ok: results.every((r) => r.ok), results }, 200, origin);
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Group X: 零用金請款（petty-cash.html / petty-cash-admin.html，finance2/14，2026-07-28）
// 開發批次 2（Worker）。批次 1（Ragic 建表＋人事表 token 欄位）已完成，見規格書。
// 兩種身分：A 同仁（`?token=` 反查人事表 ragicforms4/20004 的 1003215，在職狀態必須 ∈
// {在職,試用}）／B 財務（`?token=` 比對 Worker secret PETTY_CASH_FINANCE_TOKENS_JSON，格式
// 比照 WORKLOG_TOKENS_JSON）。同一支 token gate 函式先試 A 再試 B；每個 action 只接受其中
// 一種角色，角色不符或 token 驗證失敗一律回同型 `not_found` 404（不回 403，避免洩漏 token
// 有效性），比照 v29/v30/Group S/T/U IDOR root-fix 手法。請款人身分只能由 token 反查得出，
// 前端傳入的任何姓名欄位一律不讀取（service-fee.html 既定鐵律，避開 earnest.html 的 IDOR 教訓）。
// ═══════════════════════════════════════════════════════════════════════════════
const PETTY_CASH_SHEET = 'finance2/14';
const PETTY_CASH_STAFF_SHEET = 'ragicforms4/20004';
const PC_STAFF_TOKEN_FIELD = '1003215';
const PC_STAFF_NAME_FIELD = '3000933';
const PC_STAFF_DEPT_FIELD = '3000937';
const PC_STAFF_STATUS_FIELD = '3000945';
const PC_ACTIVE_STATUSES = new Set(['在職', '試用']); // 只有這兩種在職狀態可請款
const PC = Object.freeze({
  claimNo: '1003194', createdAt: '1003195', claimant: '1003196', delegate: '1003197',
  category: '1003198', item: '1003199', site: '1003200', note: '1003201',
  invoiceType: '1003202', invoiceNumber: '1003203', invoiceDate: '1003204',
  sellerTaxId: '1003205', store: '1003206', amountExTax: '1003207', taxAmount: '1003208',
  amount: '1003209', photo: '1003210', source: '1003211', isPaid: '1003212', paidAt: '1003213',
});
const PC_CATEGORIES = new Set(['交通', '餐費', '五金', '耗材', '規費', '其他']);
const PC_INVOICE_TYPES = new Set(['電子發票', '手開發票', '收據', '免用統一發票']);
const PC_SOURCES = new Set(['qr', 'manual']);
// spec 僅寫「一般 2000 字，短欄位自己訂合理值」，未給精確數字，以下為 spec-外決定的保守上限
const PC_TEXT_MAX = { item: 200, site: 100, note: 2000, invoiceNumber: 30, sellerTaxId: 20, store: 100 };
// 零用金上限：金額（含稅）>= 3000 要改走請款單（需吳彥廷簽名），不走本系統。
// 規則來源：韓珊珊 2026-07-29 口頭、Joan 當日轉述（非書面規定，日後有爭議回頭找珊珊確認）。
// 前端 petty-cash 頁也擋一次，這裡是防 F12 繞過前端的第二層。
// 見 窩的家/系統部/規格書/零用金請款_規格書.md § 片段 A
const PC_AMOUNT_LIMIT = 3000;
const PC_MAX_FILE_BYTES = 5 * 1024 * 1024; // 比照既有 size guard
const PC_STAFF_ACTIONS = new Set(['pettyCashIdentity', 'pettyCashCreate', 'pettyCashListMine']);
const PC_FINANCE_ACTIONS = new Set(['pettyCashListAll', 'pettyCashMarkPaid']);
const PETTY_CASH_ACTIONS = new Set([...PC_STAFF_ACTIONS, ...PC_FINANCE_ACTIONS]);

function pcClean(v) { return typeof v === 'string' ? v.trim() : ''; }
function pcVal(v) { return typeof v === 'string' ? v : (v == null ? '' : String(v)); }
function pcNum(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// 台北時間日期時間字串，格式 `YYYY/MM/DD HH:mm:ss`（24 小時制）。2026-07-28 建表踩坑：日期
// 時間欄位若設小寫 `hh`，POST 寫入的時間部分會被靜默歸零；1003195/1003213 建表時已改用大寫
// `HH`（見踩坑速查 § Ragic API 補充 2026-07-28），這裡另外防 `Intl.DateTimeFormat`
// `hour12:false` 在午夜輸出 `"24"` 而非 `"00"` 的已知 ICU 怪癖（同類保護，未實際踩到也先擋）。
function nowTaipeiDateTime() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date()).reduce((out, p) => { out[p.type] = p.value; return out; }, {});
  const hh = parts.hour === '24' ? '00' : parts.hour;
  return `${parts.year}/${parts.month}/${parts.day} ${hh}:${parts.minute}:${parts.second}`;
}

// Ragic 附件欄位（多檔）GET 回傳值可能是單一 token 字串或字串陣列，統一轉陣列。file.jsp 端點
// 實測不需要 Authorization header（同 decorFile/decorContractFile 既有做法，token 本身即為
// 存取憑證），可直接組 URL 回給前端，不需要額外做位元組代理。
function pettyCashPhotoUrls(raw) {
  const arr = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  return arr
    .map((t) => pcClean(t))
    .filter(Boolean)
    .map((t) => `https://ap15.ragic.com/sims/file.jsp?a=wuohome&f=${encodeURIComponent(t)}`);
}

function pettyCashPublicRecord(rid, rec) {
  const photoUrls = pettyCashPhotoUrls(rec[PC.photo]);
  return {
    rid: String(rid),
    claimNo: pcVal(rec[PC.claimNo]),
    createdAt: pcVal(rec[PC.createdAt]),
    claimant: pcVal(rec[PC.claimant]),
    category: pcVal(rec[PC.category]),
    item: pcVal(rec[PC.item]),
    site: pcVal(rec[PC.site]),
    note: pcVal(rec[PC.note]),
    invoiceType: pcVal(rec[PC.invoiceType]),
    invoiceNumber: pcVal(rec[PC.invoiceNumber]),
    invoiceDate: pcVal(rec[PC.invoiceDate]),
    sellerTaxId: pcVal(rec[PC.sellerTaxId]),
    store: pcVal(rec[PC.store]),
    amountExTax: pcNum(rec[PC.amountExTax]),
    taxAmount: pcNum(rec[PC.taxAmount]),
    amount: pcNum(rec[PC.amount]),
    source: pcVal(rec[PC.source]),
    photoUrl: photoUrls[0] || '',
    photoUrls, // spec 外決定：憑證照片是多檔欄位，額外提供完整陣列，photoUrl 仍保留供契約相容
    isPaid: pcVal(rec[PC.isPaid]) === 'Yes',
    paidAt: pcVal(rec[PC.paidAt]) || null,
  };
}

async function findPettyCashByInvoice(env, invoiceNumber) {
  const qs = `naming=EID&limit=0,1&where=${PC.invoiceNumber},eq,${encodeURIComponent(invoiceNumber)}`;
  const { upstream, data } = await getFromRagic(env, PETTY_CASH_SHEET, qs);
  if (!upstream.ok || !data) return null;
  const entries = Object.entries(data).filter(([k]) => /^\d+$/.test(k));
  if (entries.length === 0) return null;
  const [rid, rec] = entries[0];
  return { rid, rec };
}

function pettyCashDuplicateResponse(found, invoiceNumber, origin) {
  const rec = found ? found.rec : null;
  const createdAt = rec ? pcVal(rec[PC.createdAt]) : '';
  return jsonResp({
    error: 'duplicate_invoice',
    invoiceNumber,
    existing: {
      claimNo: rec ? pcVal(rec[PC.claimNo]) : undefined,
      claimant: rec ? pcVal(rec[PC.claimant]) : undefined,
      claimedAt: createdAt ? createdAt.split(' ')[0] : undefined,
    },
  }, 409, origin);
}

// A：同仁身分，`?token=` 反查人事表。失敗（不存在／格式錯／離職／非在職試用狀態）一律回 null，
// 呼叫端統一映射同型 404（不分因由防列舉）。
async function authenticatePettyCashStaff(url, env) {
  const token = url.searchParams.get('token') || '';
  if (!validUuid(token)) return null;
  const qs = `naming=EID&limit=0,1&where=${PC_STAFF_TOKEN_FIELD},eq,${encodeURIComponent(token)}`;
  const { upstream, data } = await getFromRagic(env, PETTY_CASH_STAFF_SHEET, qs);
  if (!upstream.ok || !data) return null;
  const records = Object.values(data).filter((r) => r && typeof r === 'object');
  if (records.length === 0) return null;
  const rec = records[0];
  const status = pcClean(rec[PC_STAFF_STATUS_FIELD]);
  if (!PC_ACTIVE_STATUSES.has(status)) return null;
  const name = pcClean(rec[PC_STAFF_NAME_FIELD]);
  if (!name) return null;
  return { role: 'staff', name, department: pcClean(rec[PC_STAFF_DEPT_FIELD]) };
}

// B：財務身分，`?token=` 比對 Worker secret（比照 parseWorklogTokenConfig 手法）。
function parsePettyCashFinanceTokens(env) {
  let tokens;
  try { tokens = JSON.parse(env.PETTY_CASH_FINANCE_TOKENS_JSON || '{}'); } catch { return null; }
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return null;
  const normalized = {};
  for (const [token, raw] of Object.entries(tokens)) {
    if (!token || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!name) return null;
    normalized[token] = { name };
  }
  return normalized;
}

function authenticatePettyCashFinance(url, env) {
  const tokens = parsePettyCashFinanceTokens(env);
  if (!tokens) return null;
  const token = url.searchParams.get('token') || '';
  const entry = tokens[token];
  if (!entry) return null;
  return { role: 'finance', name: entry.name };
}

// 同一支 gate：先試 A（同仁）再試 B（財務）。呼叫端再檢查 role 是否符合該 action 需求，
// 不符也回同型 404（見路由段落）。
async function authenticatePettyCash(url, env) {
  const staff = await authenticatePettyCashStaff(url, env);
  if (staff) return staff;
  return authenticatePettyCashFinance(url, env);
}

async function handlePettyCashAction(action, request, env, identity, origin) {
  const url = new URL(request.url);

  if (action === 'pettyCashIdentity') {
    return jsonResp({
      ok: true,
      viewer: { name: identity.name, department: identity.department || '', role: 'staff' },
    }, 200, origin);
  }

  if (action === 'pettyCashCreate') {
    const ct = request.headers.get('Content-Type') || '';
    if (!ct.toLowerCase().startsWith('multipart/form-data')) {
      return jsonResp({ error: 'expect_multipart' }, 400, origin);
    }
    let form;
    try { form = await request.formData(); } catch { return jsonResp({ error: 'bad_multipart' }, 400, origin); }

    // 前端只有以下 key 會被讀取；其餘一律不讀（含前端可能誤送的 claimant，防冒名唯一防線是
    // 「Worker 根本不看這個 key」，不是格式檢查）。spec 外決定：不逐一 error 每個未知 key，
    // 統一「忽略」（既有 invalid_field 手法用於 Ragic fid 白名單，這裡欄位是前端命名鍵不是
    // fid，性質不同，見交付摘要）。
    const category = pcClean(form.get('category'));
    const item = pcClean(form.get('item'));
    const site = pcClean(form.get('site'));
    const note = pcClean(form.get('note'));
    const invoiceType = pcClean(form.get('invoiceType'));
    const invoiceNumber = pcClean(form.get('invoiceNumber'));
    const invoiceDateRaw = form.get('invoiceDate');
    const sellerTaxId = pcClean(form.get('sellerTaxId'));
    const store = pcClean(form.get('store'));
    const amountExTaxRaw = form.get('amountExTax');
    const taxAmountRaw = form.get('taxAmount');
    const amountRaw = form.get('amount');
    const source = pcClean(form.get('source'));
    const photos = form.getAll('photo').filter((v) => v instanceof File);

    if (!PC_CATEGORIES.has(category)) return jsonResp({ error: 'invalid_category' }, 400, origin);
    if (!item || item.length > PC_TEXT_MAX.item) return jsonResp({ error: 'invalid_item' }, 400, origin);
    if (site.length > PC_TEXT_MAX.site) return jsonResp({ error: 'invalid_site' }, 400, origin);
    if (note.length > PC_TEXT_MAX.note) return jsonResp({ error: 'invalid_note' }, 400, origin);
    if (!PC_INVOICE_TYPES.has(invoiceType)) return jsonResp({ error: 'invalid_invoiceType' }, 400, origin);
    if (!invoiceNumber || invoiceNumber.length > PC_TEXT_MAX.invoiceNumber) return jsonResp({ error: 'invalid_invoiceNumber' }, 400, origin);
    const invoiceDate = decorNormalizeDate(invoiceDateRaw);
    if (!invoiceDate) return jsonResp({ error: 'invalid_invoiceDate' }, 400, origin);
    if (sellerTaxId.length > PC_TEXT_MAX.sellerTaxId) return jsonResp({ error: 'invalid_sellerTaxId' }, 400, origin);
    if (store.length > PC_TEXT_MAX.store) return jsonResp({ error: 'invalid_store' }, 400, origin);
    const amountExTax = (amountExTaxRaw !== null && amountExTaxRaw !== '') ? Number(amountExTaxRaw) : null;
    if (amountExTax !== null && (!Number.isFinite(amountExTax) || amountExTax < 0)) return jsonResp({ error: 'invalid_amountExTax' }, 400, origin);
    const taxAmount = (taxAmountRaw !== null && taxAmountRaw !== '') ? Number(taxAmountRaw) : null;
    if (taxAmount !== null && (!Number.isFinite(taxAmount) || taxAmount < 0)) return jsonResp({ error: 'invalid_taxAmount' }, 400, origin);
    const amount = Number(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) return jsonResp({ error: 'invalid_amount' }, 400, origin);
    if (amount >= PC_AMOUNT_LIMIT) return jsonResp({ error: 'amount_over_limit', limit: PC_AMOUNT_LIMIT }, 400, origin);
    if (!PC_SOURCES.has(source)) return jsonResp({ error: 'invalid_source' }, 400, origin);
    if (photos.length === 0) return jsonResp({ error: 'photo_required' }, 400, origin);
    for (const f of photos) {
      if (f.size > PC_MAX_FILE_BYTES) return jsonResp({ error: 'file_too_large', size: f.size }, 400, origin);
    }

    // 發票號碼重複防呆：前端第一道防線（P0-3，整套最重要的一條）
    const dup = await findPettyCashByInvoice(env, invoiceNumber);
    if (dup) return pettyCashDuplicateResponse(dup, invoiceNumber, origin);

    const createdAt = nowTaipeiDateTime();
    const writeForm = new FormData();
    writeForm.append(PC.claimant, identity.name); // 唯一來源：token 反查，前端傳什麼都不採信
    writeForm.append(PC.createdAt, createdAt);
    writeForm.append(PC.category, category);
    writeForm.append(PC.item, item);
    if (site) writeForm.append(PC.site, site);
    if (note) writeForm.append(PC.note, note);
    writeForm.append(PC.invoiceType, invoiceType);
    writeForm.append(PC.invoiceNumber, invoiceNumber);
    writeForm.append(PC.invoiceDate, invoiceDate);
    if (sellerTaxId) writeForm.append(PC.sellerTaxId, sellerTaxId);
    if (store) writeForm.append(PC.store, store);
    if (amountExTax !== null) writeForm.append(PC.amountExTax, String(amountExTax));
    if (taxAmount !== null) writeForm.append(PC.taxAmount, String(taxAmount));
    writeForm.append(PC.amount, String(amount));
    writeForm.append(PC.source, source);
    writeForm.append(PC.isPaid, 'No');
    for (const f of photos) writeForm.append(PC.photo, f, f.name || 'receipt.jpg');

    const upstream = await ragicFetch(`${env.RAGIC_BASE}/${PETTY_CASH_SHEET}?api&v=3`, {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY },
      body: writeForm,
    });
    const text = await upstream.text();
    let data = null; try { data = JSON.parse(text); } catch {}
    const fail = detectUpstreamFailure(upstream, data);
    if (fail) {
      // 資料庫唯一索引第二道防線：Ragic noDup 擋撞號回 status:INVALID，轉譯成前端看得懂的
      // duplicate_invoice（不吐 upstream_invalid），existing 允許缺值（見 spec）
      if (fail.error === 'upstream_invalid' && /發票號碼/.test(String(fail.msg || ''))) {
        const dup2 = await findPettyCashByInvoice(env, invoiceNumber);
        return pettyCashDuplicateResponse(dup2, invoiceNumber, origin);
      }
      console.error('[pettyCashCreate] write_failed', { ragicCode: fail.code, ragicMsg: fail.msg });
      return jsonResp({ error: 'write_failed', ...fail }, 502, origin);
    }
    const newRid = data?.ragicId;
    if (!newRid) return jsonResp({ error: 'no_rid_returned' }, 502, origin);

    // 讀回驗證（防謊報成功；自動編號有時序問題，比照 createPaymentReceipt/createServiceFeeOrder 手法）
    let rec = null;
    try {
      const { upstream: ru, data: rd } = await getFromRagic(env, `${PETTY_CASH_SHEET}/${newRid}`, 'naming=EID');
      if (ru.ok && rd) rec = rd[String(newRid)] || Object.values(rd)[0] || null;
    } catch { /* rec stays null，下面統一回 write_unverified */ }
    if (!rec || !pcVal(rec[PC.claimNo])) return jsonResp({ error: 'write_unverified', ragicId: newRid }, 502, origin);

    return jsonResp({
      ok: true,
      claim: {
        rid: String(newRid),
        claimNo: pcVal(rec[PC.claimNo]),
        createdAt: pcVal(rec[PC.createdAt]) || createdAt,
        claimant: pcVal(rec[PC.claimant]) || identity.name,
        amount,
        invoiceNumber,
      },
    }, 200, origin);
  }

  if (action === 'pettyCashListMine') {
    const paid = url.searchParams.get('paid') || 'all';
    if (!['all', 'unpaid', 'paid'].includes(paid)) return jsonResp({ error: 'invalid_paid' }, 400, origin);
    let limit = Number(url.searchParams.get('limit') || '100');
    if (!Number.isFinite(limit) || limit <= 0) limit = 100;
    limit = Math.min(Math.floor(limit), 500);

    // where 條件完全由 Worker 自行組（請款人=token 反查到的姓名），不接受前端指定任何 where
    const whereParts = [`where=${PC.claimant},eq,${encodeURIComponent(identity.name)}`];
    if (paid === 'unpaid') whereParts.push(`where=${PC.isPaid},eq,No`);
    if (paid === 'paid') whereParts.push(`where=${PC.isPaid},eq,Yes`);
    const qs = `naming=EID&limit=0,${limit}&${whereParts.join('&')}`;
    const { upstream, data } = await getFromRagic(env, PETTY_CASH_SHEET, qs);
    const fail = detectUpstreamFailure(upstream, data);
    if (fail) return jsonResp(fail, 502, origin);
    const claims = Object.entries(data || {})
      .filter(([k]) => /^\d+$/.test(k))
      .map(([rid, rec]) => pettyCashPublicRecord(rid, rec))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return jsonResp({ ok: true, claims, viewer: { name: identity.name, role: 'staff' } }, 200, origin);
  }

  if (action === 'pettyCashListAll') {
    const paid = url.searchParams.get('paid') || 'all';
    if (!['all', 'unpaid', 'paid'].includes(paid)) return jsonResp({ error: 'invalid_paid' }, 400, origin);
    const claimantFilter = pcClean(url.searchParams.get('claimant'));
    const dateFromRaw = url.searchParams.get('dateFrom');
    const dateToRaw = url.searchParams.get('dateTo');
    let limit = Number(url.searchParams.get('limit') || '200');
    if (!Number.isFinite(limit) || limit <= 0) limit = 200;
    limit = Math.min(Math.floor(limit), 1000);

    const whereParts = [];
    if (paid === 'unpaid') whereParts.push(`where=${PC.isPaid},eq,No`);
    if (paid === 'paid') whereParts.push(`where=${PC.isPaid},eq,Yes`);
    if (claimantFilter) whereParts.push(`where=${PC.claimant},eq,${encodeURIComponent(claimantFilter)}`);
    if (dateFromRaw) {
      const nd = decorNormalizeDate(dateFromRaw);
      if (!nd) return jsonResp({ error: 'invalid_dateFrom' }, 400, origin);
      whereParts.push(`where=${PC.createdAt},gte,${encodeURIComponent(nd + ' 00:00:00')}`);
    }
    if (dateToRaw) {
      const nd = decorNormalizeDate(dateToRaw);
      if (!nd) return jsonResp({ error: 'invalid_dateTo' }, 400, origin);
      whereParts.push(`where=${PC.createdAt},lte,${encodeURIComponent(nd + ' 23:59:59')}`);
    }
    const qs = `naming=EID&limit=0,${limit}${whereParts.length ? '&' + whereParts.join('&') : ''}`;
    const { upstream, data } = await getFromRagic(env, PETTY_CASH_SHEET, qs);
    const fail = detectUpstreamFailure(upstream, data);
    if (fail) return jsonResp(fail, 502, origin);
    const claims = Object.entries(data || {})
      .filter(([k]) => /^\d+$/.test(k))
      .map(([rid, rec]) => pettyCashPublicRecord(rid, rec))
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const summary = claims.reduce((s, c) => {
      s.total += 1;
      if (c.isPaid) { s.paidCount += 1; s.paidAmount += c.amount || 0; }
      else { s.unpaidCount += 1; s.unpaidAmount += c.amount || 0; }
      return s;
    }, { total: 0, unpaidCount: 0, unpaidAmount: 0, paidCount: 0, paidAmount: 0 });
    return jsonResp({ ok: true, claims, summary, viewer: { name: identity.name, role: 'finance' } }, 200, origin);
  }

  if (action === 'pettyCashMarkPaid') {
    let body;
    try { body = await request.json(); } catch { return jsonResp({ error: 'bad_json' }, 400, origin); }
    const ridRaw = body?.rid;
    if (typeof ridRaw !== 'string' && typeof ridRaw !== 'number') return jsonResp({ error: 'invalid_rid' }, 400, origin);
    const rid = String(ridRaw);
    if (!/^\d{1,12}$/.test(rid)) return jsonResp({ error: 'invalid_rid' }, 400, origin);
    if (typeof body?.isPaid !== 'boolean') return jsonResp({ error: 'invalid_is_paid' }, 400, origin);
    const isPaid = body.isPaid;

    const { upstream: cu, data: cd } = await getFromRagic(env, `${PETTY_CASH_SHEET}/${rid}`, 'naming=EID');
    if (!cu.ok || !cd || Object.keys(cd).length === 0) return jsonResp({ error: 'not_found' }, 404, origin);
    const existingRec = cd[rid] || Object.values(cd)[0];
    if (!existingRec) return jsonResp({ error: 'not_found' }, 404, origin);

    const params = new URLSearchParams();
    params.append(PC.isPaid, isPaid ? 'Yes' : 'No');
    params.append(PC.paidAt, isPaid ? nowTaipeiDateTime() : ''); // 取消誤勾要能清空，財務一定會誤勾
    const { upstream, data } = await postUrlEncodedToRagic(env, `${PETTY_CASH_SHEET}/${rid}`, params.toString());
    const fail = detectUpstreamFailure(upstream, data);
    if (fail) return jsonResp({ error: 'write_failed', ...fail }, 502, origin);

    // 讀回確認狀態真的變了，沒變回 502（不假裝成功）
    const { upstream: ru, data: rd } = await getFromRagic(env, `${PETTY_CASH_SHEET}/${rid}`, 'naming=EID');
    if (!ru.ok || !rd) return jsonResp({ error: 'write_unverified' }, 502, origin);
    const rec = rd[rid] || Object.values(rd)[0];
    const actualPaid = rec ? pcVal(rec[PC.isPaid]) === 'Yes' : null;
    if (actualPaid !== isPaid) return jsonResp({ error: 'write_unverified' }, 502, origin);

    return jsonResp({ ok: true, claim: pettyCashPublicRecord(rid, rec) }, 200, origin);
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Group W: 企業入口 公布欄 + 心情留言板（Supabase，2026-07-28）
// 後端是 Supabase PostgREST，不是 Ragic。詳細資安脈絡見檔頭 v42 段落。
// ═══════════════════════════════════════════════════════════════════════════════
const PORTAL_ACTIONS = new Set([
  'portalListPosts', 'portalCreatePost', 'portalPinPost', 'portalDeletePost',
  'portalListMoods', 'portalCreateMood', 'portalDeleteMood',
]);
const PORTAL_POSTS_TABLE = 'portal_posts';
const PORTAL_MOODS_TABLE = 'portal_moods';
// 與 wuohome/ragic 的 js/shared.js `MANAGERS` 同一份名單（經營階層＋管理部）。兩邊都要改時
// 以 shared.js 為顯示端、本表為裁決端——Worker 不接受前端傳來的角色旗標，只認姓名。
const PORTAL_MANAGERS = new Set(['吳彥廷', '蕭靜芳', '韓珊珊', '張瓊安']);
const PORTAL_POST_RETENTION_DAYS = 30; // 規格書：公布欄 30 天後不顯示（不刪）
const PORTAL_MOOD_RETENTION_DAYS = 7;  // 規格書：心情留言板 7 天
const PORTAL_POST_MAX_CHARS = 2000;    // 與資料表 CHECK 約束一致
const PORTAL_MOOD_MAX_CHARS = 500;     // 與資料表 CHECK 約束一致
const PORTAL_NAME_MAX_CHARS = 40;      // 與資料表 CHECK 約束一致
const PORTAL_POST_LIST_LIMIT = 100;
const PORTAL_MOOD_LIST_LIMIT = 200;
// Supabase 會擋「看起來像瀏覽器」的 secret key 請求（實測 401 Forbidden use of secret API key
// in browser）。Worker 的 subrequest 不會自動帶上使用者的 UA，但這裡明確指定，免得未來 runtime
// 預設值改變導致整組 action 一起 401。
const PORTAL_SUPABASE_UA = 'wuohome-ragic-proxy';

async function portalSupabase(env, table, { method = 'GET', qs = '', body = null, prefer = null } = {}) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    console.error('portalSupabase: SUPABASE_URL / SUPABASE_SERVICE_KEY 未設定');
    return { ok: false, status: 500, error: 'supabase_not_configured', data: null };
  }
  const headers = {
    'apikey': env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'User-Agent': PORTAL_SUPABASE_UA,
    'Accept': 'application/json',
  };
  if (body !== null) headers['Content-Type'] = 'application/json';
  if (prefer) headers['Prefer'] = prefer;

  let resp;
  try {
    resp = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}${qs ? `?${qs}` : ''}`, {
      method,
      headers,
      body: body === null ? undefined : JSON.stringify(body),
    });
  } catch (e) {
    console.error('portalSupabase fetch failed', table, method, String(e));
    return { ok: false, status: 502, error: 'supabase_unreachable', data: null };
  }

  const text = await resp.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!resp.ok) {
    // 比照既有 detectUpstreamFailure 精神：上游錯誤落 console.error 供 `wrangler tail` 追，
    // 但不把 Supabase 原始訊息回給前端（避免外洩表結構/權限提示）。
    console.error('portalSupabase upstream error', table, method, resp.status, text.slice(0, 500));
    return { ok: false, status: 502, error: 'supabase_error', data };
  }
  return { ok: true, status: resp.status, error: null, data };
}

function portalClean(v) { return String(v ?? '').replace(/\u0000/g, '').trim(); }
function portalValidActor(s) { return typeof s === 'string' && s.length >= 1 && s.length <= PORTAL_NAME_MAX_CHARS; }
function portalIsManager(name) { return PORTAL_MANAGERS.has(name); }
function portalSinceIso(days) { return new Date(Date.now() - days * 86400000).toISOString(); }

// 回前端的欄位一律 camelCase，且只回白名單欄位——deleted_at / deleted_by 不外流。
function portalPublicPost(row, actor, isManager) {
  return {
    id: row.id,
    authorName: row.author_name,
    content: row.content,
    isPinned: row.is_pinned === true,
    createdAt: row.created_at,
    canDelete: isManager || row.author_name === actor,
    canPin: isManager,
  };
}
function portalPublicMood(row, actor, isManager) {
  return {
    id: row.id,
    authorName: row.author_name,
    content: row.content,
    createdAt: row.created_at,
    canDelete: isManager || row.author_name === actor,
  };
}

async function handlePortalAction(action, request, env, origin) {
  const url = new URL(request.url);

  // ── 讀取：公布欄 / 心情留言板 ────────────────────────────────────────────────
  if (action === 'portalListPosts' || action === 'portalListMoods') {
    const isPosts = action === 'portalListPosts';
    // actor 只用來算每一則的 canDelete/canPin，缺省仍可讀（首頁未選身分時也要看得到公告）。
    const actor = portalClean(url.searchParams.get('actor'));
    const isManager = portalIsManager(actor);
    const days = isPosts ? PORTAL_POST_RETENTION_DAYS : PORTAL_MOOD_RETENTION_DAYS;

    const params = new URLSearchParams();
    params.set('select', isPosts
      ? 'id,author_name,content,is_pinned,created_at'
      : 'id,author_name,content,created_at');
    params.set('deleted_at', 'is.null');
    // 保留期：留言板一律 7 天。公布欄 30 天，但**置頂公告不受保留期限制、永遠顯示**
    // （Joan 2026-07-28 拍板：置頂就是要常駐，不能自己消失）。PostgREST 的 or 語法＝
    // 「is_pinned 為真」OR「發布時間在 30 天內」。
    if (isPosts) {
      params.set('or', `(is_pinned.eq.true,created_at.gte.${portalSinceIso(days)})`);
    } else {
      params.set('created_at', `gte.${portalSinceIso(days)}`);
    }
    params.set('order', isPosts ? 'is_pinned.desc,created_at.desc' : 'created_at.desc');
    params.set('limit', String(isPosts ? PORTAL_POST_LIST_LIMIT : PORTAL_MOOD_LIST_LIMIT));

    const res = await portalSupabase(env, isPosts ? PORTAL_POSTS_TABLE : PORTAL_MOODS_TABLE, { qs: params.toString() });
    if (!res.ok) return jsonResp({ error: res.error }, res.status, origin);
    const rows = Array.isArray(res.data) ? res.data : [];
    const items = rows.map((r) => (isPosts ? portalPublicPost(r, actor, isManager) : portalPublicMood(r, actor, isManager)));
    return jsonResp({
      ok: true,
      [isPosts ? 'posts' : 'moods']: items,
      retentionDays: days,
      // 公布欄專屬：明講「置頂不受 retentionDays 限制」，免得前端看到 retentionDays:30
      // 就以為所有公告都會在 30 天後消失。
      ...(isPosts ? { pinnedNeverExpires: true } : {}),
      viewer: { name: actor, isManager },
    }, 200, origin);
  }

  // ── 以下皆為寫入類，統一先解析 body 與 actor ───────────────────────────────
  let body;
  try { body = await request.json(); } catch { return jsonResp({ error: 'bad_json' }, 400, origin); }
  const actor = portalClean(body?.actor);
  if (!portalValidActor(actor)) return jsonResp({ error: 'invalid_actor' }, 400, origin);
  const isManager = portalIsManager(actor);

  if (action === 'portalCreatePost' || action === 'portalCreateMood') {
    const isPosts = action === 'portalCreatePost';
    // 公布欄限經營階層＋管理部；心情留言板全體同仁。
    if (isPosts && !isManager) return jsonResp({ error: 'forbidden', reason: 'not_manager' }, 403, origin);
    const maxChars = isPosts ? PORTAL_POST_MAX_CHARS : PORTAL_MOOD_MAX_CHARS;
    const content = portalClean(body?.content);
    if (!content) return jsonResp({ error: 'empty_content' }, 400, origin);
    if (content.length > maxChars) return jsonResp({ error: 'content_too_long', max: maxChars }, 400, origin);

    // 欄位白名單：Worker 自己組出要寫的欄位，前端 body 其餘 key 一律丟棄。
    // id / created_at / deleted_at 全部由資料庫或 Worker 決定，前端不得指定。
    const row = isPosts
      ? { author_name: actor, content, is_pinned: body?.isPinned === true }
      : { author_name: actor, content };

    const res = await portalSupabase(env, isPosts ? PORTAL_POSTS_TABLE : PORTAL_MOODS_TABLE, {
      method: 'POST', body: [row], prefer: 'return=representation',
    });
    if (!res.ok) return jsonResp({ error: res.error }, res.status, origin);
    const created = Array.isArray(res.data) ? res.data[0] : null;
    // 讀回驗證，比照 createPaymentReceipt / rqCreate 的「不憑 2xx 就宣稱寫入成功」手法。
    if (!created?.id) return jsonResp({ error: 'write_unverified' }, 502, origin);
    return isPosts
      ? jsonResp({ ok: true, post: portalPublicPost(created, actor, isManager) }, 200, origin)
      : jsonResp({ ok: true, mood: portalPublicMood(created, actor, isManager) }, 200, origin);
  }

  if (action === 'portalPinPost') {
    if (!isManager) return jsonResp({ error: 'forbidden', reason: 'not_manager' }, 403, origin);
    const id = portalClean(body?.id);
    if (!validUuid(id)) return jsonResp({ error: 'invalid_id' }, 400, origin);
    if (typeof body?.isPinned !== 'boolean') return jsonResp({ error: 'invalid_is_pinned' }, 400, origin);

    const qs = new URLSearchParams({ id: `eq.${id}`, deleted_at: 'is.null' }).toString();
    const res = await portalSupabase(env, PORTAL_POSTS_TABLE, {
      method: 'PATCH',
      qs,
      body: { is_pinned: body.isPinned, updated_at: new Date().toISOString() },
      prefer: 'return=representation',
    });
    if (!res.ok) return jsonResp({ error: res.error }, res.status, origin);
    const row = Array.isArray(res.data) ? res.data[0] : null;
    if (!row) return jsonResp({ error: 'not_found' }, 404, origin);
    return jsonResp({ ok: true, post: portalPublicPost(row, actor, isManager) }, 200, origin);
  }

  if (action === 'portalDeletePost' || action === 'portalDeleteMood') {
    const table = action === 'portalDeletePost' ? PORTAL_POSTS_TABLE : PORTAL_MOODS_TABLE;
    const id = portalClean(body?.id);
    if (!validUuid(id)) return jsonResp({ error: 'invalid_id' }, 400, origin);

    // 先讀出這一則的作者，權限在 Worker 端判：本人可刪自己、MANAGERS 可刪任何一則。
    const findQs = new URLSearchParams({ id: `eq.${id}`, deleted_at: 'is.null', select: 'id,author_name' }).toString();
    const found = await portalSupabase(env, table, { qs: findQs });
    if (!found.ok) return jsonResp({ error: found.error }, found.status, origin);
    const target = Array.isArray(found.data) ? found.data[0] : null;
    if (!target) return jsonResp({ error: 'not_found' }, 404, origin);
    if (!isManager && target.author_name !== actor) {
      return jsonResp({ error: 'forbidden', reason: 'not_owner' }, 403, origin);
    }

    // soft delete：留底可追（不當留言要有紀錄可查），前端一律看不到 deleted_at 不為 null 的列。
    const res = await portalSupabase(env, table, {
      method: 'PATCH',
      qs: new URLSearchParams({ id: `eq.${id}`, deleted_at: 'is.null' }).toString(),
      body: { deleted_at: new Date().toISOString(), deleted_by: actor },
      prefer: 'return=representation',
    });
    if (!res.ok) return jsonResp({ error: res.error }, res.status, origin);
    const row = Array.isArray(res.data) ? res.data[0] : null;
    if (!row) return jsonResp({ error: 'not_found' }, 404, origin);
    return jsonResp({ ok: true, id: row.id }, 200, origin);
  }

  return null;
}

function parseDecorTokenConfig(env) {
  let tokens;
  try { tokens = JSON.parse(env.DECOR_TOKENS_JSON || '{}'); } catch { return null; }
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return null;
  const normalized = {};
  for (const [token, role] of Object.entries(tokens)) {
    if (typeof token !== 'string' || !token || !DECOR_ROLES.has(role)) return null;
    normalized[token] = role;
  }
  return normalized;
}

// 失敗一律回 null，呼叫端統一映射同型 not_found 404（不分因由防列舉，比照 v29/v30/P5）
function authenticateDecor(url, env) {
  const tokens = parseDecorTokenConfig(env);
  if (!tokens) return null;
  const token = url.searchParams.get('token') || '';
  const role = tokens[token];
  if (!role) return null;
  return { role, label: DECOR_ROLE_LABELS[role] || role };
}

function decorClean(v) { return String(v ?? '').trim(); }
function decorNum(v) { const s = decorClean(v); return s === '' ? null : Number(s); }

function decorSubtableRows(rec, key) {
  const sub = rec && rec['_subtable_' + key];
  if (!sub || typeof sub !== 'object' || Array.isArray(sub)) return [];
  return Object.entries(sub).filter(([k]) => /^\d+$/.test(k)).map(([, row]) => row);
}

// P2 新增：同上但保留 row key（子表列 Row ID），decorProgressPhoto 與前端照片回看/工項分類
// 需要用它反查正確的子表列。只給 progress 這條路徑用，decorSubtableRows() 既有呼叫處
// （payments/addons）完全不動，符合 additive only。
function decorSubtableRowEntries(rec, key) {
  const sub = rec && rec['_subtable_' + key];
  if (!sub || typeof sub !== 'object' || Array.isArray(sub)) return [];
  return Object.entries(sub).filter(([k]) => /^\d+$/.test(k));
}

// 多檔案上傳欄位讀出值 normalize：單檔是字串、多檔是陣列，統一轉成 token 陣列（過濾空值）。
function decorFileTokens(raw) {
  if (Array.isArray(raw)) return raw.map((v) => decorClean(v)).filter(Boolean);
  const s = decorClean(raw);
  return s ? [s] : [];
}

// 唯讀白名單投影：只手動取用明列欄位組成輸出物件，從不 spread 原始 Ragic record —
// 成本/利潤欄位（1001232/1001233/1001228）與其餘未列欄位在程式碼層面就不可能被回傳。
function decorPublicRecord(rid, rec) {
  // P2：progress 陣列新增 rowId/category/photoCount 三個唯讀欄位（純讀取欄位擴充，比照 v34
  // repairPublicRecord 新增 updatedAt 先例）；startAt/endAt/content 既有欄位值與型別完全不變。
  const progress = decorSubtableRowEntries(rec, DF.progressKey).map(([rowId, row]) => ({
    rowId,
    startAt: decorClean(row[DF.progressStart]),
    endAt: decorClean(row[DF.progressEnd]),
    content: decorClean(row[DF.progressContent]),
    category: decorClean(row[DF.progressCategory]),
    photoCount: decorFileTokens(row[DF.progressPhoto]).length,
  }));
  // 已收/未收無布林欄，以 1000180 匯款時間有無值推導；原始匯款時間/金額/截圖/核帳一律不回傳
  const payments = decorSubtableRows(rec, DF.paymentKey).map((row) => ({
    name: decorClean(row[DF.paymentName]),
    ratio: decorNum(row[DF.paymentRatio]),
    paid: Boolean(decorClean(row[DF.paymentAt])),
  }));
  const addons = decorSubtableRows(rec, DF.addonKey).map((row) => ({
    date: decorClean(row[DF.addonDate]),
    item: decorClean(row[DF.addonItem]),
    amount: decorNum(row[DF.addonAmount]),
  }));
  // P2 補派：合約附件多檔瀏覽（純讀取欄位擴充，比照 progress.photoCount 先例）——hasContract
  // 既有語意（count>0）完全不變，新增 contractFileCount 供前端逐一列出。
  const contractFileCount = decorFileTokens(rec[DF.contractFile]).length;
  const hasContract = contractFileCount > 0;
  return {
    rid: String(rid),
    name: decorClean(rec[DF.name]) || '（未命名案件）',
    status: decorClean(rec[DF.status]),
    supervisor: decorClean(rec[DF.supervisor]),
    assignee: decorClean(rec[DF.assignee]),
    contractTotal: decorNum(rec[DF.contractTotal]),
    startAt: decorClean(rec[DF.startAt]),
    endAt: decorClean(rec[DF.endAt]),
    paidRatio: decorNum(rec[DF.paidRatio]),
    lastUpdateAt: decorClean(rec[DF.lastUpdateAt]),
    lastWorkItem: decorClean(rec[DF.lastWorkItem]),
    hasContract,
    contractFileCount,
    progress,
    payments,
    addons,
  };
}

function decorTodayTaipei() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).reduce((o, x) => { o[x.type] = x.value; return o; }, {});
  return new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
}
function decorParseDateOnly(s) {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(decorClean(s));
  return m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
}
function decorDaysBetween(a, b) { return Math.round((b.getTime() - a.getTime()) / 86400000); }

// 逾期＝訖<今天；起訖任一空值或訖<起（填錯）一律不做逾期判定（比照空狀態表「不得靜默消失
// 但不做逾期判定」規則，避免誤判髒資料——含「起空/訖有值」這種單邊缺漏，不只雙值皆存在時互比）
function decorIsOverdue(c, today) {
  if (c.status !== DECOR_STATUS_ACTIVE) return false;
  const start = decorParseDateOnly(c.startAt);
  const end = decorParseDateOnly(c.endAt);
  if (!start || !end) return false;
  if (end < start) return false;
  return end < today;
}
// 黃燈＝1001241 距今滿 7 天（第 8 個日曆天起）；1001241 空值 fallback 合約起日；兩者皆空不算黃燈
function decorIsStale(c, today) {
  if (c.status !== DECOR_STATUS_ACTIVE) return false;
  const ref = decorParseDateOnly(c.lastUpdateAt) || decorParseDateOnly(c.startAt);
  if (!ref) return false;
  return decorDaysBetween(ref, today) >= DECOR_STALE_DAYS;
}

async function wbParseJsonBody(request, allowedOrigin) {
  let body;
  try { body = await request.json(); } catch { return { error: jsonResp({ error: 'invalid_json' }, 400, allowedOrigin) }; }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: jsonResp({ error: 'invalid_json' }, 400, allowedOrigin) };
  return { body };
}

// 部分更新主表：body 的 key 必須在 whitelist 內，多選欄位（multiFields）值可為陣列，寫入時同一
// fieldId 重複帶出（Ragic 多選 API 格式，逗號串接會被吃成一個不合法選項值，見踩坑速查續20）。
async function wbUpdateMain(env, sheet, rid, body, whitelist, multiFields) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (!whitelist.has(key)) return { error: { error: 'invalid_field', key } };
    if (multiFields.has(key)) {
      const arr = Array.isArray(value) ? value : [value];
      for (const v of arr) {
        if (typeof v !== 'string' || v.length > 200) return { error: { error: 'value_invalid', key } };
        params.append(key, v);
      }
    } else {
      if (typeof value !== 'string' && typeof value !== 'number') return { error: { error: 'value_invalid', key } };
      const strVal = String(value);
      if (strVal.length > 2000) return { error: { error: 'value_too_long', key } };
      params.append(key, strVal);
    }
  }
  if (params.toString() === '') return { error: { error: 'empty_body' } };
  const result = await postUrlEncodedToRagic(env, `${sheet}/${rid}`, params.toString());
  const fail = detectUpstreamFailure(result.upstream, result.data);
  if (fail) return { error: fail, status: 502 };
  return { ok: true, ragicId: result.data?.ragicId || rid };
}

// 子表新增一列：row id 固定用 -1（單列新增），欄位格式 {fieldId}_-1=value（Ragic API 文件「子表格資料修改與刪除」）。
async function wbAddSubRow(env, sheet, rid, subtables, subKey, fields) {
  const config = subtables[subKey];
  if (!config) return { error: { error: 'invalid_subtable', sub: subKey } };
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return { error: { error: 'invalid_fields' } };
  const params = new URLSearchParams();
  for (const [fid, value] of Object.entries(fields)) {
    if (!config.fields.has(fid)) return { error: { error: 'invalid_field', fid } };
    if (typeof value !== 'string' && typeof value !== 'number') return { error: { error: 'value_invalid', fid } };
    const strVal = String(value);
    if (strVal.length > 2000) return { error: { error: 'value_too_long', fid } };
    params.append(`${fid}_-1`, strVal);
  }
  if (params.toString() === '') return { error: { error: 'empty_fields' } };
  const result = await postUrlEncodedToRagic(env, `${sheet}/${rid}`, params.toString());
  const fail = detectUpstreamFailure(result.upstream, result.data);
  if (fail) return { error: fail, status: 502 };
  return { ok: true, ragicId: result.data?.ragicId || rid, sub: subKey, key: config.key };
}

const WB_SUB_ROW_ID_RE = /^\d{1,12}$/;

// 子表修改既有一列：使用 GET 回傳的正數 Row ID，欄位格式 {fieldId}_{rowId}=value（Ragic API
// 文件「子表格資料修改與刪除」，2026-07-20 已對 asset-activation/6 record 11 沙盒列實測
// 驗證）。rowId 必須為正整數字串，與新增用的負數 -1 區分，避免呼叫端誤傳負數改寫成新增。
async function wbUpdateSubRow(env, sheet, rid, subtables, subKey, rowId, fields) {
  const config = subtables[subKey];
  if (!config) return { error: { error: 'invalid_subtable', sub: subKey } };
  const rowIdStr = String(rowId ?? '');
  if (!WB_SUB_ROW_ID_RE.test(rowIdStr)) return { error: { error: 'invalid_row_id' } };
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return { error: { error: 'invalid_fields' } };
  const params = new URLSearchParams();
  for (const [fid, value] of Object.entries(fields)) {
    if (!config.fields.has(fid)) return { error: { error: 'invalid_field', fid } };
    if (typeof value !== 'string' && typeof value !== 'number') return { error: { error: 'value_invalid', fid } };
    const strVal = String(value);
    if (strVal.length > 2000) return { error: { error: 'value_too_long', fid } };
    params.append(`${fid}_${rowIdStr}`, strVal);
  }
  if (params.toString() === '') return { error: { error: 'empty_fields' } };
  const result = await postUrlEncodedToRagic(env, `${sheet}/${rid}`, params.toString());
  const fail = detectUpstreamFailure(result.upstream, result.data);
  if (fail) return { error: fail, status: 502 };
  return { ok: true, ragicId: result.data?.ragicId || rid, sub: subKey, key: config.key, rowId: rowIdStr };
}

// 子表刪除既有一列：DELSUB_{子表格KeyFieldId}={RowId}（Ragic API 文件「子表格資料修改與
// 刪除」，2026-07-20 已對 asset-activation/6 record 11 沙盒列實測驗證：新增→修改→刪除→
// GET 復驗零殘留）。
async function wbDeleteSubRow(env, sheet, rid, subtables, subKey, rowId) {
  const config = subtables[subKey];
  if (!config) return { error: { error: 'invalid_subtable', sub: subKey } };
  const rowIdStr = String(rowId ?? '');
  if (!WB_SUB_ROW_ID_RE.test(rowIdStr)) return { error: { error: 'invalid_row_id' } };
  const params = new URLSearchParams();
  params.append(`DELSUB_${config.key}`, rowIdStr);
  const result = await postUrlEncodedToRagic(env, `${sheet}/${rid}`, params.toString());
  const fail = detectUpstreamFailure(result.upstream, result.data);
  if (fail) return { error: fail, status: 502 };
  return { ok: true, ragicId: result.data?.ragicId || rid, sub: subKey, key: config.key, rowId: rowIdStr };
}

const TENANT_FIELDS_WHITELIST = new Set([
  '1000580','1000581','1000583','1000584','1000585','1000586','1000587','1000588',
  '1000590','1000591','1000592',
  '1000638','1000639','1000640','1000641',
  '1000647','1000648','1000908','1000970',
]);

// ── Group A hardening: 見紅休（設計部+瓊安）週末/國定假日禁止 createLeave 排值日/值班 ──
// 三度誤排事故根治（2026-07-26）：6/13 張瓊安、6/28 呂鴻墀(rid 4768)、7/25 呂鴻墀(rid 5428)，
// 三次都是「一次性資料操作」腳本直接呼叫 createLeave 寫入，繞過 schedule.html 前端的見紅休擋下
// （前端該擋自 2026-03-23 commit 5c7f7185 起就存在且從未失效，問題出在不經前端的腳本寫入）。
// 此處補上 Worker 端伺服器驗證，不管呼叫方是不是瀏覽器都擋得住。
// 與 schedule-common.js 的 SC.GOV_REST_NAMES / SC.HOLIDAYS_2026 保持同步，異動需同時改兩邊。
// 2026-08-02 Joan 更正為四位，補上陳勁豪（原本漏列）。
// ⚠️ 此檔（wuohome-ragic/worker-proxy-src/index.js）是舊複製、非部署來源，改這裡不會生效；
// 真正生效的是 wuohome-ragic-proxy 這個獨立 repo 的 src/index.js，兩邊都要改。
const GOV_REST_NAMES = new Set(['張瓊安', '沈郁雯', '呂鴻墀', '陳勁豪']);
const GOV_HOLIDAYS_2026 = new Set([
  '2026/01/01','2026/02/16','2026/02/17','2026/02/18','2026/02/19','2026/02/20',
  '2026/02/27','2026/04/03','2026/04/06','2026/05/01','2026/06/19','2026/09/25',
  '2026/09/28','2026/10/09','2026/10/26','2026/12/25',
]);
function isGovRestDateStr(dateStr) {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(dateStr || '');
  if (!m) return false;
  const dow = new Date(+m[1], +m[2] - 1, +m[3]).getDay();
  return dow === 0 || dow === 6 || GOV_HOLIDAYS_2026.has(dateStr);
}
// 禁休覆蓋：當天若已有 TYPE=禁休 紀錄，見紅休失效（全員含見紅休 3 人正常上班）
// 查詢失敗一律視為「無覆蓋」（fail closed）：寧可擋下讓人工確認，不要放行造成第四次事故
async function hasNoRestOverride(env, dateStr) {
  try {
    const qs = `naming=EID&where=${encodeURIComponent('1002025,eq,禁休')}&where=${encodeURIComponent('1000963,eq,' + dateStr)}&limit=0,1`;
    const { upstream, data } = await getFromRagic(env, 'ragicforms4/2', qs);
    if (!upstream.ok) return false;
    return Object.keys(data || {}).length > 0;
  } catch { return false; }
}

const LEAVE_FIELDS_WHITELIST = new Set([
  '1000961','1000963','1000964','1000965','1002025','1002026','1000967','1000966',
]);

const ALLOWED_PASSTHROUGH_PARAMS = ['limit', 'subtables', 'naming', 'order'];
const ALLOWED_WHERE_FIELDS = new Set([
  '1000254','1000257','1000260','1000274','1000285',
  '1000772',
  '1000580',
]);

// ── Group F constants ──
const AP16_BASE = 'https://ap16.ragic.com/YongCe';
// Whitelist of field IDs allowed to be returned to the public yongce map.
// Excludes: agent emails/phones (1000052-1000065), entrance method (1000013/14),
// mandate contract no (1000003), syncSrc/peerID (1000115/16),
// team/group/quota fields (1000049/58/59/63/64/65/114),
// internal schedule fields (1000107), and hidden fields.
const YONGCE_PUBLIC_FIELD_IDS = new Set([
  '1000002', // status
  '1000009', // title
  '1000011', // address
  '1000034', // propertyType
  '1000035', // usage
  '1000036', // coordinates
  '1000037', // propertyCategory
  '1000039', // parkingType
  '1000043', // floor
  '1000044', // totalFloors
  '1000047', // layout
  '1000027', // link591
  '1000030', // monthlyRent
  '1000031', // rentIncludes
  '1000032', // deposit
  '1000033', // currentStatus
  '1000050', // specialNote
  '1000072', // water
  '1000074', // electricity
  '1000076', // gas
  '1000077', // cable
  '1000078', // internet
  '1000079', // cooking
  '1000080', // utilityNote
  '1000081', // householdReg
  '1000083', // rentalSubsidy
  '1000085', // pets
  '1000086', // smoking
  '1000097', // mrt
  '1000098', // school
  '1000099', // bus
  '1000100', // park
  '1000101', // market
  '1000102', // shoppingDistrict
]);
// Subtable key for agent data; only NAME + PHONE rows kept, email field (1000053 is display name) ok
const YONGCE_SUBTABLE_KEY = '_subtable_1000109';
// Fields within each subtable row that are allowed public
const YONGCE_SUBTABLE_PUBLIC = new Set(['1000053', '1000054']); // name, phone

// ── Group G constants: wuohome map (ap15) ──
const AP15_OWN_SHEET      = 'property-data-kept/10';
const AP15_ALLIANCE_SHEET = 'property-data-kept/27';

// Sheet 10 (own) public fields whitelist
// EXCLUDES: owner name/ID/phone (1001300/1001302/1001315), key access (1000066),
//   mandate fields (1000248/1000260/1000261), ad flags (1000249/1000923),
//   quota/group/formula fields (1000928/1000878/1001822/1001819/1001301/1000877)
const OWN_PUBLIC_FIELD_IDS = new Set([
  '1000707', // STATUS
  '1000050', // TITLE
  '1000055', // ADDR
  '1000759', // COORD
  '1000076', // PRICE
  '1000079', // rentIncludes
  '1000087', // deposit
  '1000070', // currentCondition
  '1000061', // propertyType
  '1000060', // USAGE
  '1000063', // LAYOUT
  '1000062', // propertyCategory
  '1000113', // LINK_591
  '1000072', // specialNote
  '1000215', // floor
  '1000068', // totalFloors
  '1000054', // buildingAge
  '1000059', // registeredArea
  '1000231', // parkingType
  '1000080', // electricity
  '1000081', // water
  '1000083', // gas
  '1000226', // cable
  '1000242', // internet
  '1000219', // pets
  '1000218', // smoking
  '1000220', // householdReg
  '1000221', // rentalSubsidy
  '1002090', // team/source label (e.g. 享寓) for map coloring; not owner-sensitive
  '1002098', // SHARING (open/internal filter)
  '1000058', // mainArea
]);
const OWN_SUBTABLE_KEY    = '_subtable_1000254';

// -- Group F2: yongce alliance map (ap15 sheet21 + filterId=104) --
// Only 7 main fields + subtable agent name/phone are public; all owner/key/mandate fields excluded.
const AP15_YONGCE_ALLIANCE_SHEET = 'property-data-kept/21';
const YONGCE_ALLIANCE_PUBLIC_FIELD_IDS = new Set([
  '1000050', // title
  '1000055', // addr
  '1000759', // coord
  '1000076', // price
  '1000063', // layout
  '1000060', // usage
  '1000113', // link591
  '1002009', // company (享寓國際 / 窩的家)
]);
const YONGCE_ALLIANCE_SUBTABLE_KEY    = '_subtable_1000254';
const YONGCE_ALLIANCE_SUBTABLE_PUBLIC = new Set(['1000251', '1000252']); // agent name, phone
const OWN_SUBTABLE_PUBLIC = new Set(['1000251', '1000252']); // DEV_NAME, DEV_PHONE

// Sheet 27 (alliance) public fields — no sensitive owner data
const ALLIANCE_PUBLIC_FIELD_IDS = new Set([
  '1001890', // status
  '1001894', // TITLE
  '1001914', // ADDR
  '1001931', // COORD
  '1001896', // PRICE
  '1001895', // LAYOUT
  '1001930', // USAGE
  '1001980', // SIZE
  '1002008', // DEV (agent name)
  '1002012', // PHONE
  '1002009', // company
  '1001929', // propertyType
]);

const SHEET_MAP = {
  listEmployees:  'ragicforms4/20004',
  listStaff:      'ragicforms4/20004',
  listLeaves:     'ragicforms4/2',
  createLeave:    'ragicforms4/2',
  listIntake:     'operation/4',
  listInventory:  'operation/4',
  listPayments:   'payments/2',
  listOutreach:   'property-data-kept/17',
  listCommission: 'property-data-kept/25',
  listClients:    'property-data-kept/8',
  listGoals:      'shanshans/5',
};

const KV_PREFIX = 'submission:earnest:';
const KV_TTL_SECONDS = 7776000; // 90 days

// Telegram webhook path — not in ALLOWED_ACTIONS, handled separately
const TELEGRAM_WEBHOOK_PATH = 'telegram-webhook';

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-WH-Repair-Token',
  'Access-Control-Max-Age': '86400',
});

function jsonResp(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store, no-cache, must-revalidate', ...corsHeaders(origin) },
  });
}

function validUserId(s) { return typeof s === 'string' && /^U[a-f0-9]{32}$/.test(s); }
function validPhone(s)  { return typeof s === 'string' && /^[0-9\-+\s()]{6,20}$/.test(s); }
function validName(s)   { return typeof s === 'string' && s.length >= 1 && s.length <= 30; }
function validRid(s)    { return typeof s === 'string' && /^[0-9]{1,12}$/.test(s); }
function validDateStr(s){ return typeof s === 'string' && /^\d{4}\/\d{2}\/\d{2}$/.test(s); }
// P2 decorProgressAdd：前端 <input type=date> 送出 YYYY-MM-DD，Ragic 日期欄要 YYYY/MM/DD——
// 收 `-` 或 `/` 分隔皆可，正規化失敗回 null 讓呼叫端拒絕。
function decorNormalizeDate(s) {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})[\/-](\d{2})[\/-](\d{2})$/.exec(s.trim());
  if (!m) return null;
  const norm = `${m[1]}/${m[2]}/${m[3]}`;
  return validDateStr(norm) ? norm : null;
}
function validUuid(s)   { return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s); }
// v38 refund hardening: format regex + reject all-zero nil-UUID (known weak-token class,
// see 客戶連結全面修復_2026-07-24 rid 3 incident) + require ≥5 distinct hex chars (rejects
// trivially low-entropy values like all-same-char that would still pass the regex).
// Stricter than the plain validUuid() used by getEarnest/getPaymentReceipt today — only
// applied to refund actions, see v38 banner comment for why existing actions weren't touched.
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
function validHardenedToken(s) {
  if (!validUuid(s)) return false;
  const lower = s.toLowerCase();
  if (lower === NIL_UUID) return false;
  const uniqueHexChars = new Set(lower.replace(/-/g, '')).size;
  return uniqueHexChars >= 5;
}
function getNowIso()    { return new Date().toISOString(); }

function parseRepairTokenConfig(env) {
  let tokens;
  try { tokens = JSON.parse(env.REPAIR_TOKENS_JSON || '{}'); } catch { return null; }
  if (!tokens || typeof tokens !== 'object' || Array.isArray(tokens)) return null;
  const businessNames = new Set();
  const businessStaffRids = new Set();
  const normalized = {};
  for (const [token, raw] of Object.entries(tokens)) {
    if (!token || !raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const role = raw.role;
    const name = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!['business', 'console'].includes(role) || !name) return null;
    if (role === 'business') {
      const staffRid = typeof raw.staffRid === 'number' ? String(raw.staffRid) : String(raw.staffRid || '').trim();
      if (!/^\d{1,12}$/.test(staffRid) || businessNames.has(name) || businessStaffRids.has(staffRid)) return null;
      businessNames.add(name); businessStaffRids.add(staffRid);
      normalized[token] = { ...raw, role, name, staffRid };
    } else normalized[token] = { ...raw, role, name };
  }
  return normalized;
}

function authenticateRepair(request, env) {
  const tokens = parseRepairTokenConfig(env);
  if (!tokens) return null;
  return tokens[request.headers.get('X-WH-Repair-Token') || ''] || null;
}

function requireRepairRole(identity, role) { return Boolean(identity && identity.role === role); }

function taipeiTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).reduce((out, part) => { out[part.type] = part.value; return out; }, {});
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function repairRecords(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  return Object.entries(data).filter(([key, value]) => /^\d+$/.test(key) && value && typeof value === 'object' && !Array.isArray(value));
}

function repairRecordForRid(data, rid) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const requested = String(rid);
  const keyed = data[requested];
  if (keyed && typeof keyed === 'object' && !Array.isArray(keyed)) {
    const keyedRid = keyed._ragicId ?? keyed.ragicId ?? keyed._rid;
    return keyedRid === undefined || String(keyedRid) === requested ? keyed : null;
  }
  const isFlat = RF.ticket in data || RF.owner in data || RF.status in data;
  if (!isFlat) return null;
  const flatRid = data._ragicId ?? data.ragicId ?? data._rid;
  return flatRid === undefined || String(flatRid) === requested ? data : null;
}

function findNestedField(value, fieldId, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 4) return '';
  if (!Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, fieldId)) return value[fieldId];
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = findNestedField(child, fieldId, depth + 1);
    if (found !== '' && found !== null && found !== undefined) return found;
  }
  return '';
}

function repairAttachmentTokens(value, out = []) {
  if (value === null || value === undefined || out.length >= 20) return out;
  if (Array.isArray(value)) { for (const item of value) repairAttachmentTokens(item, out); return out; }
  if (typeof value === 'object') {
    for (const key of ['token', 'f', 'fileToken', 'value']) if (typeof value[key] === 'string') repairAttachmentTokens(value[key], out);
    return out;
  }
  if (typeof value !== 'string') return out;
  const raw = value.trim();
  if (!raw || raw.length > 2000 || /[\u0000-\u001f]/.test(raw)) return out;
  let token = raw;
  if (/^https?:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      if (parsed.origin !== 'https://ap15.ragic.com' || parsed.pathname !== '/sims/file.jsp') return out;
      token = parsed.searchParams.get('f') || '';
    } catch { return out; }
  }
  if (token && !out.includes(token)) out.push(token);
  return out;
}

function repairAttachmentUrls(value) {
  return repairAttachmentTokens(value).map((token) => `https://ap15.ragic.com/sims/file.jsp?a=wuohome&f=${encodeURIComponent(token)}`);
}

function repairPublicRecord(rid, rec, includeConsoleFields = false) {
  const reportedAt = rec[RF.time] || findNestedField(rec, '1001867') || '';
  // v2 工作檯優化：`_update_date` 是 Ragic 內建最後更新時間（GET 帶 info=true 才有，見 fetchRepairPages），
  // 前端用它近似計算「已停留 N 天」，零 schema 變更。
  const out = {
    rid: String(rid), ticketNo: rec[RF.ticket] || '', reportedAt, elapsedDays: rec[RF.elapsedDays] ?? null,
    updatedAt: rec['_update_date'] || '',
    reporter: rec[RF.reporter] || '', status: rec[RF.status] || '', category: rec[RF.category] || '', contactPhone: rec[RF.phone] || '',
    address: rec[RF.address] || '', room: rec[RF.room] || '', availableTime: rec[RF.available] || '', photoUrls: repairAttachmentUrls(rec[RF.photos]),
    description: rec[RF.description] || '', estimateNote: rec[RF.estimateNote] || '', vendorName: rec[RF.vendor] || '',
    scheduledAt: rec[RF.scheduledAt] || '', finishedAt: rec[RF.finishedAt] || '', actualDescription: rec[RF.actualDescription] || '',
    companyCost: rec[RF.companyCost] ?? null, margin: rec[RF.margin] ?? null, total: rec[RF.total] ?? null,
    owner: rec[RF.owner] || '', source: rec[RF.source] || '', paymentStatus: rec[RF.paymentStatus] || '',
    paymentAt: rec[RF.paymentAt] || '', cancelReason: rec[RF.cancelReason] || '',
  };
  if (includeConsoleFields) {
    out.vendorActualCost = rec[RF.vendorActual] ?? null;
    out.companyProfit = rec[RF.companyProfit] ?? null;
    out.paymentProofUrls = repairAttachmentUrls(rec[RF.paymentProof]);
    out.finishedPhotoUrls = repairAttachmentUrls(rec[RF.finishedPhoto]);
    out.acceptance = rec[`_subtable_${RF.acceptKey}`] || rec[RF.acceptKey] || [];
  }
  return out;
}

async function sendRepairNotification(env, ticketNo, status) {
  if (!env.TG_BOT_TOKEN) return null;
  const body = {
    chat_id: env.JOAN_CHAT_ID || '8163308207',
    text: `${env.REPAIR_NOTIFY_PREFIX || ''}工務報修 ${String(ticketNo || '（未編號）')} → ${String(status)}`,
  };
  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!response.ok) return null;
    return response.json().catch(() => null);
  } catch { return null; }
}

function scheduleRepairNotification(ctx, env, ticketNo, status) {
  ctx.waitUntil(sendRepairNotification(env, ticketNo, status));
}

async function parseRepairJson(request, origin) {
  try { return { body: await request.json() }; }
  catch { return { response: jsonResp({ error: 'bad_json' }, 400, origin) }; }
}

async function getRepairByRid(env, rid) {
  const result = await getFromRagic(env, `${REPAIR_SHEET}/${rid}`, 'naming=EID');
  return { ...result, record: repairRecordForRid(result.data, rid) };
}

function validRepairAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value <= 10000000;
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return false;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 && amount <= 10000000;
}

function parseRepairSignedAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 10000000 ? value : null;
  if (typeof value !== 'string' || !/^-?(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d+)?$/.test(value)) return null;
  const amount = Number(value.replace(/,/g, ''));
  return Number.isFinite(amount) && Math.abs(amount) <= 10000000 ? amount : null;
}

function validRepairText(value, max, required = false) {
  if (typeof value !== 'string') return false;
  const length = value.trim().length;
  return length <= max && (!required || length > 0);
}

const REPAIR_IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const REPAIR_PAYMENT_MIMES = new Set([...REPAIR_IMAGE_MIMES, 'application/pdf']);
const REPAIR_CATEGORIES = new Set(['水電', '泥作', '木作', '家電', '門鎖', '其他']);
const REPAIR_URGENCIES = new Set(['一般', '急件', '緊急']);
const REPAIR_TERMINAL_STATUSES = new Set(['已結案', '已取消']);
const REPAIR_QUOTE_TTL = 7 * 24 * 60 * 60;
const REPAIR_QUOTE_STORAGE_KEY = 'gate';

function repairQuoteGateResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export class RepairQuoteGate {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.storage = state.storage;
  }

  async fetch(request) {
    if (request.method !== 'POST') return repairQuoteGateResponse({ ok: false, error: 'method_not_allowed' }, 405);
    const action = new URL(request.url).pathname.replace(/^\/+|\/+$/g, '');
    let body = {};
    if (action !== 'revoke') {
      try { body = await request.json(); }
      catch { return repairQuoteGateResponse({ ok: false, error: 'bad_json' }, 400); }
    }
    const token = typeof body.token === 'string' ? body.token : '';
    const now = Math.floor(Date.now() / 1000);
    try {
      if (action === 'activate') {
        const expiresAt = Number(body.expiresAt);
        if (!token || !Number.isInteger(expiresAt) || expiresAt < 0) {
          return repairQuoteGateResponse({ ok: false, error: 'invalid_gate' }, 400);
        }
        await this.storage.transaction(async (tx) => {
          await tx.put(REPAIR_QUOTE_STORAGE_KEY, { token, expiresAt });
        });
        return repairQuoteGateResponse({ ok: true, activated: true });
      }
      if (action === 'active') {
        if (!token) return repairQuoteGateResponse({ ok: false, error: 'invalid_token' }, 400);
        const active = await this.storage.transaction(async (tx) => {
          const record = await tx.get(REPAIR_QUOTE_STORAGE_KEY);
          if (!record || typeof record.token !== 'string' || !Number.isInteger(record.expiresAt) || record.expiresAt < now) {
            if (record) await tx.delete(REPAIR_QUOTE_STORAGE_KEY);
            return false;
          }
          return record.token === token;
        });
        return repairQuoteGateResponse({ ok: true, active });
      }
      if (action === 'claim') {
        if (!token) return repairQuoteGateResponse({ ok: false, error: 'invalid_token' }, 400);
        const claimed = await this.storage.transaction(async (tx) => {
          const record = await tx.get(REPAIR_QUOTE_STORAGE_KEY);
          if (!record || typeof record.token !== 'string' || !Number.isInteger(record.expiresAt) || record.expiresAt < now) {
            if (record) await tx.delete(REPAIR_QUOTE_STORAGE_KEY);
            return false;
          }
          if (record.token !== token) return false;
          await tx.delete(REPAIR_QUOTE_STORAGE_KEY);
          return true;
        });
        return repairQuoteGateResponse({ ok: true, claimed });
      }
      if (action === 'revoke') {
        await this.storage.transaction(async (tx) => {
          await tx.delete(REPAIR_QUOTE_STORAGE_KEY);
        });
        return repairQuoteGateResponse({ ok: true, revoked: true });
      }
      return repairQuoteGateResponse({ ok: false, error: 'not_found' }, 404);
    } catch {
      return repairQuoteGateResponse({ ok: false, error: 'storage_failed' }, 500);
    }
  }
}

function validRepairFile(file, mimes) {
  return file instanceof File && file.size > 0 && file.size <= 5 * 1024 * 1024 && mimes.has(String(file.type || '').toLowerCase());
}

function normalizeRepairScheduledAt(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})[-/](\d{2})[-/](\d{2})[T ](\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm)));
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() + 1 !== Number(m) || date.getUTCDate() !== Number(d) || Number(hh) > 23 || Number(mm) > 59) return null;
  return `${y}/${m}/${d} ${hh}:${mm}`;
}

async function repairOwnerMatches(env, rid, rec, identity) {
  if (!requireRepairRole(identity, 'business')) return false;
  if (!env.EARNEST_QUEUE || typeof env.EARNEST_QUEUE.get !== 'function') return null;
  let mapped;
  try { mapped = await env.EARNEST_QUEUE.get(`repair:owner:${rid}`); } catch { return null; }
  if (mapped !== null && mapped !== undefined && mapped !== '') return String(mapped) === identity.staffRid;
  return String(rec[RF.owner] || '').trim() === identity.name;
}

async function fetchRepairPages(env, maxRecords = 10000) {
  const pageSize = 500;
  const all = [];
  // v2 工作檯優化：加 info=true 取 Ragic 內建 `_update_date`（最後更新時間），
  // 用來近似計算卡片「已停留 N 天」，零 schema 變更（見規格書「工作檯優化 v2」）。
  for (let offset = 0; offset < maxRecords; offset += pageSize) {
    const result = await getFromRagic(env, REPAIR_SHEET, `naming=EID&ignoreFixedFilter=true&info=true&limit=${offset},${pageSize}`);
    if (!result.upstream.ok || !result.data || typeof result.data !== 'object' || Array.isArray(result.data)) return { error: true, code: result.upstream.status };
    const page = repairRecords(result.data);
    all.push(...page);
    if (page.length < pageSize) return { records: all };
  }
  return { error: true, overflow: true };
}

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value || '')) return null;
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
    const binary = atob(padded); return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch { return null; }
}

async function repairHmacKey(secret, usages) {
  if (!secret) return null;
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usages);
}

async function createRepairQuoteToken(rid, secret) {
  const key = await repairHmacKey(secret, ['sign']);
  if (!key) return null;
  const exp = Math.floor(Date.now() / 1000) + REPAIR_QUOTE_TTL;
  const nonce = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(18)));
  const payload = `${rid}.${exp}.${nonce}`;
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function verifyRepairQuoteToken(token, secret) {
  const match = /^(\d{1,12})\.(\d{10,13})\.([A-Za-z0-9_-]{16,64})\.([A-Za-z0-9_-]{43})$/.exec(token || '');
  if (!match) return null;
  const signature = base64UrlToBytes(match[4]);
  const key = await repairHmacKey(secret, ['verify']);
  if (!key || !signature || bytesToBase64Url(signature) !== match[4]) return null;
  const payload = `${match[1]}.${match[2]}.${match[3]}`;
  const ok = await crypto.subtle.verify('HMAC', key, signature, new TextEncoder().encode(payload));
  if (!ok) return null;
  return { rid: match[1], exp: Number(match[2]) };
}

async function repairQuoteGateRequest(env, rid, action, body = {}) {
  try {
    const namespace = env.REPAIR_QUOTE_GATE;
    if (!namespace || typeof namespace.idFromName !== 'function' || typeof namespace.get !== 'function') return null;
    const id = namespace.idFromName(String(rid));
    const stub = namespace.get(id);
    if (!stub || typeof stub.fetch !== 'function') return null;
    const response = await stub.fetch(`https://repair-quote-gate.internal/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response?.ok) return null;
    const result = await response.json();
    return result?.ok === true ? result : null;
  } catch { return null; }
}

async function activateRepairQuote(env, rid, token) {
  const expiresAt = Number(String(token || '').split('.')[1]);
  if (!Number.isInteger(expiresAt)) return false;
  const result = await repairQuoteGateRequest(env, rid, 'activate', { token, expiresAt });
  return result?.activated === true;
}

async function revokeRepairQuote(env, rid) {
  const result = await repairQuoteGateRequest(env, rid, 'revoke');
  return result?.revoked === true;
}

async function quoteMappingIsActive(env, rid, token) {
  const result = await repairQuoteGateRequest(env, rid, 'active', { token });
  return result === null ? null : result.active === true;
}

async function claimRepairQuote(env, rid, token) {
  const result = await repairQuoteGateRequest(env, rid, 'claim', { token });
  return result === null ? null : result.claimed === true;
}

// ── Group Q validators (service-fee.html) ──
// 上限 60（非 30）：decorating/4 真實廠商名稱慣例常見複合名如「王冠興業有限公司/安長實業有限公司 (沈郁雯)」，30 太窄會誤擋合法名稱
function validSfName(s)     { return typeof s === 'string' && s.trim().length >= 1 && s.trim().length <= 60; }
function validSfIdNumber(s) { return typeof s === 'string' && /^[A-Za-z0-9]{8,12}$/.test(s); }
function validSfAddress(s)  { return typeof s === 'string' && s.trim().length >= 1 && s.trim().length <= 100; }
function validSfAccount(s)  { return typeof s === 'string' && /^[0-9\-]{5,30}$/.test(s); }
function validSfText(s, max){ return typeof s === 'string' && s.trim().length >= 1 && s.trim().length <= max; }
function validSfAmount(s)   { const n = Number(s); return Number.isFinite(n) && n >= 0 && n <= 2000000; }
// 2026-07-13：使用者自然輸入常見「帶空格分段」（存摺帳號常印成「2888 9003 0413」，照抄很自然）或「全形
// 數字/符號」（CJK 輸入法有時預設全形），嚴格 regex（validSfIdNumber/validSfAccount 只收半形數字+連字號）
// 會直接擋下，變成「使用者沒做錯事卻被系統拒絕」（撞名事故後第二個真實上線事故：SUBMIT_invalid_bankAccount）。
// normalize 後再驗證，不要只擋不救。前端已 normalize 過一次，這裡是防止繞過前端直打 API 的第二層防線。
// 全形 ASCII 字元（U+FF01-FF5E，涵蓋數字/字母/連字號等符號）→ 半形，固定 offset 0xFEE0 換算。
function sfNormalizeFullWidth(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}
// 全形轉半形 + 去除所有空白（含全形空格 U+3000，JS \s 已涵蓋）。用於格式嚴格不容許空白的欄位（身分證字號/銀行帳號）。
function sfNormalizeStrict(s) {
  return sfNormalizeFullWidth(s).replace(/\s/g, '');
}
function todayTaipei() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year').value, m = parts.find(p => p.type === 'month').value, d = parts.find(p => p.type === 'day').value;
  return `${y}/${m}/${d}`;
}

// ============ Telegram helpers ============

function escapeHtml(str) {
  if (!str) return '—';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatFailedAt(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${mm}/${dd} ${hh}:${mi}:${ss}`;
  } catch { return iso; }
}

function minutesAgo(iso) {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  return diff > 0 ? `失敗已 ${diff} 分鐘` : '剛剛失敗';
}

function buildFailureMessage(data) {
  const { submission_id, earnest_no, tenant_name, tenant_phone,
          operator_name, last_error, failed_at, retry_count } = data;
  const adminUrl = `https://wuohome.github.io/ragic/earnest-admin.html?id=${submission_id}`;
  const shortId = submission_id ? submission_id.slice(0, 8) : '—';
  const lastErrorStr = last_error
    ? `${escapeHtml(last_error.error || '')} ${last_error.code ? '(HTTP ' + last_error.code + ')' : ''}`.trim()
    : '—';
  const lines = [
    `⚠️ <b>定金單 Ragic 寫入失敗</b>`,
    `單號：${escapeHtml(earnest_no)}`,
    `房客：${escapeHtml(tenant_name)} / ${escapeHtml(tenant_phone)}`,
    `經辦：${escapeHtml(operator_name)} (請瓊安用 LINE 通知)`,
    `失敗原因：${lastErrorStr}`,
    `重試：${retry_count || 0} 次全失敗`,
    `建立時間：${formatFailedAt(failed_at)}`,
    minutesAgo(failed_at),
    '',
    `👉 <a href="${adminUrl}">點此處理</a>`,
    `<code>id: ${escapeHtml(shortId)}...</code>`,
  ];
  return lines.join('\n');
}

async function sendTelegramMessage(env, text, submissionId) {
  const body = {
    chat_id: env.JOAN_CHAT_ID || '8163308207',
    text,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [[
        { text: '一鍵重試', callback_data: `retry:${submissionId}` },
        { text: '改人工處理', callback_data: `manual:${submissionId}` },
      ]],
    },
  };
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    const json = await res.json().catch(() => ({}));
    return json;
  } catch { return null; }
}

async function editTelegramMessage(env, chatId, messageId, newText) {
  try {
    await fetch(
      `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/editMessageText`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, message_id: messageId, text: newText, parse_mode: 'HTML' }),
      }
    );
  } catch {}
}

async function answerCallbackQuery(env, callbackQueryId) {
  try {
    await fetch(
      `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/answerCallbackQuery`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: callbackQueryId }),
      }
    );
  } catch {}
}

// ============ Ragic helpers ============

// Ragic 106 guest-degradation 自動重試（additive, 2026-07-20）。背景：診斷確認 Ragic
// ap15 間歇性把 SYSAdmin Basic-Auth 降級當 guest，對 EVERYONE 無權限的表（如 finance/9）
// 暫時回 body 含 "code":106 的錯誤，稍後自癒。SysAdmin 對 Access Rights 矩陣免疫，106
// 不可能是真權限問題 → 可安全重試一次。這是所有直打 Ragic 的 fetch 呼叫點共用出口，對外
// 行為與原生 fetch 完全等價（回傳一個可再次 .ok/.status/.json()/.text() 的 Response），
// 呼叫端不需要任何改動即可套用；重試後仍是 106，就把第二次的 Response 原樣回傳，讓下游
// 照原本的錯誤路徑處理。
async function ragicFetch(url, options) {
  const first = await fetch(url, options);
  const text = await first.text();
  if (text.includes('"code":106')) {
    console.log(`[ragic-106-retry] retrying ${typeof url === 'string' ? url : url.toString()}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
    return fetch(url, options);
  }
  // body 只能讀一次：first 的 body 已被上面 .text() 消費掉，這裡重建一個等價 Response，
  // 讓呼叫端仍可正常 .text()/.json()，行為與從未讀過 body 的原生 fetch 結果一致。
  return new Response(text, { status: first.status, statusText: first.statusText, headers: first.headers });
}

async function postUrlEncodedToRagic(env, sheetPath, paramsString, extraQuery = '') {
  const qs = extraQuery ? `&${extraQuery}` : '';
  const upstream = await ragicFetch(`${env.RAGIC_BASE}/${sheetPath}?api${qs}`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + env.RAGIC_KEY,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: paramsString,
  });
  const text = await upstream.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { upstream, data };
}

async function getFromRagic(env, sheetPath, queryString) {
  const sep = queryString ? '&' : '';
  const upstream = await ragicFetch(`${env.RAGIC_BASE}/${sheetPath}?api${sep}${queryString || ''}`, {
    headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY },
  });
  const text = await upstream.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { upstream, data };
}

async function deleteFromRagic(env, sheetPath) {
  const upstream = await ragicFetch(`${env.RAGIC_BASE}/${sheetPath}?api`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY },
  });
  const text = await upstream.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { upstream, data };
}

async function processMultipart(request, allowedOrigin, whitelist, signatureFields = new Set(), maxStringBytes = 2000) {
  const ct = request.headers.get('Content-Type') || '';
  if (!ct.toLowerCase().startsWith('multipart/form-data')) {
    return { error: jsonResp({ error: 'expect_multipart' }, 400, allowedOrigin) };
  }
  let form;
  try { form = await request.formData(); } catch { return { error: jsonResp({ error: 'bad_multipart' }, 400, allowedOrigin) }; }
  const entries = Array.from(form.entries());
  if (entries.length === 0) return { error: jsonResp({ error: 'empty_fields' }, 400, allowedOrigin) };
  const newForm = new FormData();
  let rid = null;
  let token = null; // IDOR root-fix 2026-07-16: opt-in meta key, not a Ragic fieldId — stripped from newForm
  for (const [key, value] of entries) {
    if (key === '_rid' || key === 'rid') {
      if (typeof value !== 'string' || !/^\d{1,12}$/.test(value)) {
        return { error: jsonResp({ error: 'invalid_rid' }, 400, allowedOrigin) };
      }
      rid = value;
      continue;
    }
    if (key === 'token') {
      // Not written to Ragic — consumed by caller (submitEarnest/submitEarnestAsync) to
      // cross-validate against the target record's 1002558 before allowing the write.
      // v43: hardened from plain validUuid() — same class of credential as refund token.
      if (typeof value !== 'string' || !validHardenedToken(value)) {
        return { error: jsonResp({ error: 'invalid_token' }, 400, allowedOrigin) };
      }
      token = value;
      continue;
    }
    const m = /^(\d{7})(?:_(\d{1,3}))?$/.exec(key);
    if (!m) return { error: jsonResp({ error: 'invalid_field_format', key }, 400, allowedOrigin) };
    const fid = m[1];
    if (!whitelist.has(fid)) return { error: jsonResp({ error: 'invalid_field', key, fid }, 400, allowedOrigin) };
    if (value instanceof File) {
      if (value.size > 5 * 1024 * 1024) return { error: jsonResp({ error: 'file_too_large', key, size: value.size }, 400, allowedOrigin) };
      newForm.append(key, value, value.name);
    } else {
      const strVal = typeof value === 'string' ? value : String(value);
      const limit = signatureFields.has(fid) ? EARNEST_SIGNATURE_MAX_BYTES : maxStringBytes;
      if (strVal.length > limit) return { error: jsonResp({ error: 'value_too_long', key, len: strVal.length, limit }, 400, allowedOrigin) };
      newForm.append(key, strVal);
    }
  }
  return { form: newForm, rid, token };
}

// IDOR root-fix 2026-07-16: gate for submitEarnest / submitEarnestAsync writes.
// Confirms `token` exactly matches the target payments/1 record's 定金 token (1002558).
// Returns false on ANY failure (missing/malformed token, record not found, empty stored
// token, mismatch, upstream error) — callers must map false to a uniform 404, never
// distinguish reasons, to avoid leaking which rid/token pairs exist (enumeration guard).
async function verifyEarnestToken(env, rid, token) {
  // v43: hardened from plain validUuid() — same class of credential as refund token.
  if (!rid || !token || !validHardenedToken(token)) return false;
  try {
    const { upstream, data } = await getFromRagic(env, `payments/1/${rid}`, 'naming=EID');
    if (!upstream.ok || !data || Object.keys(data).length === 0) return false;
    // Direct-path single-record GET returns wrapped {"<rid>": {fields}} — must unwrap
    // (bug found + fixed 2026-07-16 during IDOR-fix E2E testing: reading data['1002558']
    // directly on the wrapper always returned undefined, so this check ALWAYS failed).
    const rec = data[String(rid)] || Object.values(data)[0] || {};
    const recToken = String(rec['1002558'] || '').trim();
    if (!recToken) return false;
    return recToken.toLowerCase() === token.toLowerCase();
  } catch (e) {
    console.error('verifyEarnestToken exception', String(e));
    return false;
  }
}

// IDOR root-fix 2026-07-16 (payment-receipt): gate for submitPaymentReceipt writes.
// Confirms `token` exactly matches the target payments/2 record's 收款憑單 token (1003029).
// Same uniform-failure contract as verifyEarnestToken above — never distinguish WHY it
// failed, always let callers map to a single record_not_found 404 (enumeration guard).
async function verifyPaymentReceiptToken(env, rid, token) {
  // v43: hardened from plain validUuid() — same class of credential as refund token.
  if (!rid || !token || !validHardenedToken(token)) return false;
  try {
    const { upstream, data } = await getFromRagic(env, `payments/2/${rid}`, 'naming=EID');
    if (!upstream.ok || !data || Object.keys(data).length === 0) return false;
    // Direct-path single-record GET returns wrapped {"<rid>": {fields}} — must unwrap
    // (same class of bug as verifyEarnestToken; fixed proactively here from the start).
    const rec = data[String(rid)] || Object.values(data)[0] || {};
    const recToken = String(rec['1003029'] || '').trim();
    if (!recToken) return false;
    return recToken.toLowerCase() === token.toLowerCase();
  } catch (e) {
    console.error('verifyPaymentReceiptToken exception', String(e));
    return false;
  }
}

// v38 IDOR root-fix (refund): gate for submitRefund writes — payments/5 previously had
// ZERO ownership check on this write path (unlike payments/1/2 which got theirs in v29/v30).
// Confirms `token` exactly matches the target payments/5 record's 退款 token (1003156).
// Same uniform-failure contract as verifyEarnestToken/verifyPaymentReceiptToken — never
// distinguish WHY it failed, always let callers map to a single record_not_found 404.
async function verifyRefundToken(env, rid, token) {
  if (!rid || !token || !validHardenedToken(token)) return false;
  try {
    const { upstream, data } = await getFromRagic(env, `payments/5/${rid}`, 'naming=EID');
    if (!upstream.ok || !data || Object.keys(data).length === 0) return false;
    const rec = data[String(rid)] || Object.values(data)[0] || {};
    const recToken = String(rec['1003156'] || '').trim();
    if (!recToken) return false;
    return recToken.toLowerCase() === token.toLowerCase();
  } catch (e) {
    console.error('verifyRefundToken exception', String(e));
    return false;
  }
}

async function getRagicRecordById(env, sheetPath, rid) {
  const upstream = await ragicFetch(`${env.RAGIC_BASE}/${sheetPath}/${rid}.json?api`, {
    headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY },
  });
  const text = await upstream.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { upstream, data };
}

function detectUpstreamFailure(upstream, data) {
  if (!upstream.ok) return { error: 'upstream_error', code: upstream.status, msg: data?.msg };
  if (data && data.status === 'ERROR') return { error: 'upstream_error', code: data.code, msg: data.msg };
  if (data && data.status === 'INVALID') return { error: 'upstream_invalid', code: data.code, msg: data.msg };
  if (data && data.msg && /not found|invalid|Field id|Form Index/i.test(data.msg)) return { error: 'upstream_silent_fail', msg: data.msg };
  return null;
}

function buildPassthroughQuery(url, options = {}) {
  const params = [];
  const sp = url.searchParams;
  for (const key of ALLOWED_PASSTHROUGH_PARAMS) {
    const vals = sp.getAll(key);
    for (const v of vals) {
      if (typeof v === 'string' && v.length <= 100) params.push(`${key}=${encodeURIComponent(v)}`);
    }
  }
  if (options.allowWhere) {
    const wheres = sp.getAll('where');
    for (const w of wheres) {
      const m = /^(\d{7}),(eq|gte|lte|gt|lt|like),(.+)$/.exec(w);
      if (!m) continue;
      const [, fid, op, val] = m;
      if (!ALLOWED_WHERE_FIELDS.has(fid)) continue;
      if (val.length > 50) continue;
      params.push(`where=${encodeURIComponent(`${fid},${op},${val}`)}`);
    }
  }
  return params.join('&');
}

// ============ Group D helpers ============

async function lookupOperatorName(env, userId) {
  if (!userId || !validUserId(userId)) return null;
  try {
    const { upstream, data } = await getFromRagic(
      env, 'operation/12',
      `naming=EID&where=1002018,eq,${encodeURIComponent(userId)}&limit=0,5`
    );
    if (!upstream.ok) return null;
    const records = Object.values(data || {});
    if (records.length === 0) return null;
    return records[0]['1002019'] || null;
  } catch { return null; }
}

async function submitEarnestToRagic(env, rid, fields) {
  const form = new FormData();
  for (const [fieldId, value] of Object.entries(fields)) {
    if (fieldId === '1001709') {
      // PDF stored as base64 data URI; reconstruct as Blob for multipart upload
      if (value && typeof value === 'string') {
        const base64 = value.includes(',') ? value.split(',')[1] : value;
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: 'application/pdf' });
        form.append(fieldId, blob, 'earnest.pdf');
      }
    } else {
      form.append(fieldId, String(value));
    }
  }
  let upstream, data;
  try {
    upstream = await ragicFetch(`${env.RAGIC_BASE}/payments/1/${rid}?api&v=3`, {
      method: 'POST',
      headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY },
      body: form,
    });
    const text = await upstream.text();
    try { data = JSON.parse(text); } catch { data = null; }
  } catch (e) {
    return { ok: false, error: 'fetch_exception', msg: String(e) };
  }
  const fail = detectUpstreamFailure(upstream, data);
  if (fail) return { ok: false, ...fail };
  return { ok: true, ragicId: data?.ragicId || rid };
}

async function processEarnestSubmission(env, submissionId, rid, fields, operatorName) {
  const kvKey = KV_PREFIX + submissionId;
  const delays = [3000, 8000, 15000]; // 3s+8s+15s = 26s total, fits Workers Free waitUntil ~30s wall limit
  const errorHistory = [];

  for (let attempt = 0; attempt < 3; attempt++) {
    await new Promise(r => setTimeout(r, delays[attempt]));

    // Guard: check if manually resolved between retries
    let kvRaw;
    try { kvRaw = await env.EARNEST_QUEUE.get(kvKey); } catch { kvRaw = null; }
    if (kvRaw) {
      const kvVal = JSON.parse(kvRaw);
      if (kvVal.status === 'manual_processed' || kvVal.status === 'success') return;
    }

    const result = await submitEarnestToRagic(env, rid, fields);

    if (result.ok) {
      try {
        const updated = { ...JSON.parse(kvRaw || '{}'), status: 'success', ragic_id: result.ragicId, completed_at: getNowIso() };
        await env.EARNEST_QUEUE.put(kvKey, JSON.stringify(updated), { expirationTtl: KV_TTL_SECONDS });
      } catch {}
      return;
    }

    const errEntry = { attempt: attempt + 1, error: result.error, code: result.code, msg: result.msg, at: getNowIso() };
    errorHistory.push(errEntry);

    try {
      const currentRaw = await env.EARNEST_QUEUE.get(kvKey);
      const currentVal = currentRaw ? JSON.parse(currentRaw) : {};
      await env.EARNEST_QUEUE.put(kvKey, JSON.stringify({
        ...currentVal, status: 'retrying', retry_count: attempt + 1, last_error: errEntry, error_history: errorHistory,
      }), { expirationTtl: KV_TTL_SECONDS });
    } catch {}
  }

  // All 3 attempts failed
  let finalVal = {};
  try { const fr = await env.EARNEST_QUEUE.get(kvKey); finalVal = fr ? JSON.parse(fr) : {}; } catch {}

  const failedAt = getNowIso();
  const failedPayload = {
    ...finalVal,
    status: 'failed_need_human',
    last_error: errorHistory[errorHistory.length - 1] || null,
    error_history: errorHistory,
    failed_at: failedAt,
  };
  try { await env.EARNEST_QUEUE.put(kvKey, JSON.stringify(failedPayload), { expirationTtl: KV_TTL_SECONDS }); } catch {}

  // Notify Joan via Telegram directly (Worker can reach api.telegram.org public internet)
  const notifyData = {
    submission_id: submissionId,
    earnest_no: finalVal.fields?.['1000796'] || '',
    tenant_name: finalVal.fields?.['1000792'] || '',
    tenant_phone: finalVal.fields?.['1000808'] || '',
    operator_name: operatorName || '',
    last_error: errorHistory[errorHistory.length - 1] || null,
    failed_at: failedAt,
    retry_count: 3,
  };
  const msgText = buildFailureMessage(notifyData);
  await sendTelegramMessage(env, msgText, submissionId);
}

async function handleRepairAction(action, request, env, ctx, identity, origin) {
  const writeMultipart = async (rid, form) => {
    const upstream = await ragicFetch(`${env.RAGIC_BASE}/${REPAIR_SHEET}/${rid}?api&v=3`, {
      method: 'POST', headers: { Authorization: 'Basic ' + env.RAGIC_KEY }, body: form,
    });
    const text = await upstream.text(); let data = null; try { data = JSON.parse(text); } catch {}
    return { fail: detectUpstreamFailure(upstream, data), data };
  };

  if (action === 'repairCreate') {
    if (!requireRepairRole(identity, 'business')) return jsonResp({ error: 'forbidden' }, 403, origin);
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (Number.isFinite(contentLength) && contentLength > 22 * 1024 * 1024) return jsonResp({ error: 'request_too_large' }, 413, origin);
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) return jsonResp({ error: 'expect_multipart' }, 400, origin);
    let input; try { input = await request.formData(); } catch { return jsonResp({ error: 'bad_multipart' }, 400, origin); }
    const textRules = { address: [200, true], room: [50, false], description: [2000, true], contactName: [60, true], contactPhone: [30, true], availableTime: [500, false] };
    for (const [name, [max, required]] of Object.entries(textRules)) {
      const value = input.get(name);
      if (!validRepairText(value, max, required)) return jsonResp({ error: required && !String(value || '').trim() ? 'missing_field' : 'invalid_field', field: name }, 400, origin);
    }
    const category = String(input.get('category') || '');
    const urgency = String(input.get('urgency') || '');
    if (!REPAIR_CATEGORIES.has(category)) return jsonResp({ error: 'invalid_category' }, 400, origin);
    if (!REPAIR_URGENCIES.has(urgency)) return jsonResp({ error: 'invalid_urgency' }, 400, origin);
    const photos = input.getAll('photo');
    if (photos.length < 1 || photos.length > 4) return jsonResp({ error: 'invalid_photo_count' }, 400, origin);
    let totalBytes = 0;
    for (const photo of photos) {
      if (!validRepairFile(photo, REPAIR_IMAGE_MIMES)) return jsonResp({ error: 'invalid_photo' }, 400, origin);
      totalBytes += photo.size;
    }
    if (totalBytes > 20 * 1024 * 1024) return jsonResp({ error: 'files_too_large' }, 400, origin);

    const form = new FormData();
    const named = { address: RF.address, room: RF.room, category: RF.category, description: RF.description, contactName: RF.reporter, contactPhone: RF.phone, availableTime: RF.available };
    for (const [name, fid] of Object.entries(named)) {
      const value = String(input.get(name) || '').trim(); if (value) form.append(fid, value);
    }
    for (const photo of photos) form.append(RF.photos, photo, photo.name || 'repair-photo');
    const timestamp = taipeiTimestamp();
    form.append(RF.status, '新進件'); form.append(RF.source, '業務代報'); form.append(RF.owner, identity.name);
    form.append(RF.paymentStatus, '未收款'); form.append(RF.time, timestamp);
    form.append('1001867_-1', todayTaipei()); form.append('1001873_-1', urgency);
    const upstream = await ragicFetch(`${env.RAGIC_BASE}/${REPAIR_SHEET}?api&v=3`, { method: 'POST', headers: { Authorization: 'Basic ' + env.RAGIC_KEY }, body: form });
    const text = await upstream.text(); let data = null; try { data = JSON.parse(text); } catch {}
    const fail = detectUpstreamFailure(upstream, data); if (fail) return jsonResp(fail, 502, origin);
    const rid = String(data?.ragicId || data?.rv || '');
    if (!rid) return jsonResp({ error: 'no_rid_returned' }, 502, origin);
    let ownerMapping = 'staffRid';
    try { await env.EARNEST_QUEUE.put(`repair:owner:${rid}`, identity.staffRid); }
    catch { ownerMapping = 'unique_name_fallback'; }
    const ticketNo = String(data?.data?.[RF.ticket] || data?.[RF.ticket] || data?.ticketNo || rid);
    scheduleRepairNotification(ctx, env, ticketNo, '新進件');
    return jsonResp({ ok: true, rid, ticketNo, status: '新進件', ownerMapping }, 200, origin);
  }

  if (action === 'repairListMine') {
    if (!requireRepairRole(identity, 'business')) return jsonResp({ error: 'forbidden' }, 403, origin);
    const paged = await fetchRepairPages(env);
    if (paged.error) return jsonResp({ error: paged.overflow ? 'record_limit_exceeded' : 'upstream_error' }, 502, origin);
    const repairs = [];
    for (const [rid, rec] of paged.records) {
      const ownerMatch = await repairOwnerMatches(env, rid, rec, identity);
      if (ownerMatch === null) return jsonResp({ error: 'owner_lookup_failed' }, 502, origin);
      if (ownerMatch) repairs.push(repairPublicRecord(rid, rec));
    }
    // v2 工作檯優化：回傳 viewer 身分供前端角色化標題渲染（移除硬編碼稱呼），零寫入邏輯變動。
    return jsonResp({ ok: true, repairs, viewer: { role: identity.role, name: identity.name } }, 200, origin);
  }

  if (action === 'repairListAll') {
    if (!requireRepairRole(identity, 'console')) return jsonResp({ error: 'forbidden' }, 403, origin);
    const [paged, vendorResult] = await Promise.all([
      fetchRepairPages(env), getFromRagic(env, REPAIR_VENDOR_SHEET, 'naming=EID&ignoreFixedFilter=true&limit=0,500'),
    ]);
    if (paged.error || !vendorResult.upstream.ok) return jsonResp({ error: paged.overflow ? 'record_limit_exceeded' : 'upstream_error' }, 502, origin);
    const repairs = paged.records.map(([rid, rec]) => repairPublicRecord(rid, rec, true));
    const vendors = repairRecords(vendorResult.data).map(([rid, rec]) => ({ rid: String(rid), name: rec['1000279'] || '', category: rec['1000706'] || '', contact: rec['1000287'] || '', phone: rec['1000288'] || '' })).filter((vendor) => vendor.name);
    const month = todayTaipei().slice(0, 7);
    const stats = { month, total: 0, open: 0, closed: 0, byStatus: {}, companyProfit: 0, byOwner: {} };
    for (const repair of repairs) {
      const reportedMonth = String(repair.reportedAt || '').replace(/-/g, '/').slice(0, 7);
      if (reportedMonth !== month) continue;
      stats.total += 1;
      stats.byStatus[repair.status] = (stats.byStatus[repair.status] || 0) + 1;
      if (repair.status === '已結案') stats.closed += 1;
      else if (!REPAIR_TERMINAL_STATUSES.has(repair.status)) stats.open += 1;
      const companyProfit = parseRepairSignedAmount(repair.companyProfit);
      if (companyProfit !== null) stats.companyProfit += companyProfit;
      const owner = repair.owner || '未指派'; stats.byOwner[owner] ||= { count: 0, margin: 0 };
      stats.byOwner[owner].count += 1;
      if (validRepairAmount(repair.margin)) stats.byOwner[owner].margin += Number(repair.margin);
    }
    // v2 工作檯優化：回傳 viewer 身分供前端角色化標題渲染（移除硬編碼「陳勁豪專用」），零寫入邏輯變動。
    return jsonResp({ ok: true, repairs, vendors, stats, viewer: { role: identity.role, name: identity.name } }, 200, origin);
  }

  if (action === 'repairQuoteCost') {
    if (!requireRepairRole(identity, 'console')) return jsonResp({ error: 'forbidden' }, 403, origin);
    const parsed = await parseRepairJson(request, origin); if (parsed.response) return parsed.response;
    const { rid, companyCost, estimateNote, vendorActualCost } = parsed.body || {};
    const ridString = String(rid || '');
    if (!validRid(ridString)) return jsonResp({ error: 'invalid_rid' }, 400, origin);
    if (!validRepairAmount(companyCost)) return jsonResp({ error: 'invalid_companyCost' }, 400, origin);
    if (vendorActualCost !== undefined && !validRepairAmount(vendorActualCost)) return jsonResp({ error: 'invalid_vendorActualCost' }, 400, origin);
    if (estimateNote !== undefined && !validRepairText(estimateNote, 2000)) return jsonResp({ error: 'invalid_estimateNote' }, 400, origin);
    const found = await getRepairByRid(env, ridString);
    if (!found.upstream.ok) return jsonResp({ error: 'upstream_error' }, 502, origin);
    if (!found.record) return jsonResp({ error: 'not_found' }, 404, origin);
    const previous = String(found.record[RF.status] || '');
    if (!new Set(['新進件', '待估價', '已報成本']).has(previous)) return jsonResp({ error: 'invalid_status' }, 409, origin);
    const params = new URLSearchParams({ [RF.companyCost]: String(Number(companyCost)), [RF.status]: '已報成本' });
    if (estimateNote !== undefined) params.set(RF.estimateNote, estimateNote.trim());
    if (vendorActualCost !== undefined) params.set(RF.vendorActual, String(Number(vendorActualCost)));
    const result = await postUrlEncodedToRagic(env, `${REPAIR_SHEET}/${ridString}`, params.toString(), 'doFormula=true');
    const fail = detectUpstreamFailure(result.upstream, result.data); if (fail) return jsonResp(fail, 502, origin);
    const ticketNo = found.record[RF.ticket] || ridString;
    if (previous !== '已報成本') scheduleRepairNotification(ctx, env, ticketNo, '已報成本');
    return jsonResp({ ok: true, rid: ridString, ticketNo, status: '已報成本' }, 200, origin);
  }

  if (action === 'repairSetMargin') {
    if (!requireRepairRole(identity, 'business')) return jsonResp({ error: 'forbidden' }, 403, origin);
    const parsed = await parseRepairJson(request, origin); if (parsed.response) return parsed.response;
    const { rid, margin } = parsed.body || {}; const ridString = String(rid || '');
    if (!validRid(ridString)) return jsonResp({ error: 'invalid_rid' }, 400, origin);
    if (!validRepairAmount(margin)) return jsonResp({ error: 'invalid_margin' }, 400, origin);
    const found = await getRepairByRid(env, ridString);
    if (!found.upstream.ok) return jsonResp({ error: 'upstream_error' }, 502, origin);
    if (!found.record) return jsonResp({ error: 'not_found' }, 404, origin);
    const ownerMatch = await repairOwnerMatches(env, ridString, found.record, identity);
    if (ownerMatch === null) return jsonResp({ error: 'owner_lookup_failed' }, 502, origin);
    if (!ownerMatch) return jsonResp({ error: 'forbidden' }, 403, origin);
    const previous = String(found.record[RF.status] || '');
    if (!new Set(['已報成本', '已報價']).has(previous)) return jsonResp({ error: 'invalid_status' }, 409, origin);
    if (!validRepairAmount(found.record[RF.companyCost])) return jsonResp({ error: 'cost_not_ready' }, 409, origin);
    const quoteToken = await createRepairQuoteToken(ridString, env.REPAIR_QUOTE_SECRET);
    if (!quoteToken) return jsonResp({ error: 'server_config_error' }, 500, origin);
    if (!(await revokeRepairQuote(env, ridString))) return jsonResp({ error: 'quote_store_unavailable' }, 503, origin);
    const params = new URLSearchParams({ [RF.margin]: String(Number(margin)), [RF.status]: '已報價' });
    const result = await postUrlEncodedToRagic(env, `${REPAIR_SHEET}/${ridString}`, params.toString(), 'doFormula=true');
    const fail = detectUpstreamFailure(result.upstream, result.data); if (fail) return jsonResp(fail, 502, origin);
    const ticketNo = found.record[RF.ticket] || ridString;
    const partialSuccess = () => {
      if (previous !== '已報價') scheduleRepairNotification(ctx, env, ticketNo, '已報價');
      return jsonResp({
        ok: true, partial: true, retrySafe: true, status: '已報價', quoteUrl: null,
        message: '報價已儲存，請重新產生報價連結',
      }, 200, origin);
    };
    let fresh;
    try { fresh = await getRepairByRid(env, ridString); }
    catch { return partialSuccess(); }
    if (!fresh.upstream.ok || !fresh.record) return partialSuccess();
    const customerTotal = fresh.record[RF.total];
    if (!validRepairAmount(customerTotal)) return partialSuccess();
    if (!(await activateRepairQuote(env, ridString, quoteToken))) return partialSuccess();
    const quoteUrl = `https://wuohome.github.io/ragic/repair-quote.html?quote=${encodeURIComponent(quoteToken)}`;
    if (previous !== '已報價') scheduleRepairNotification(ctx, env, ticketNo, '已報價');
    return jsonResp({ ok: true, rid: ridString, ticketNo, status: '已報價', customerTotal: Number(customerTotal), quoteUrl }, 200, origin);
  }

  if (action === 'repairQuoteView') {
    const quoteToken = new URL(request.url).searchParams.get('quote') || '';
    const verified = await verifyRepairQuoteToken(quoteToken, env.REPAIR_QUOTE_SECRET);
    if (!verified) return jsonResp({ error: 'forbidden' }, 403, origin);
    const active = await quoteMappingIsActive(env, verified.rid, quoteToken);
    if (active === null) return jsonResp({ error: 'quote_store_failed' }, 502, origin);
    if (!active) return jsonResp({ error: 'forbidden' }, 403, origin);
    const found = await getRepairByRid(env, verified.rid);
    if (!found.upstream.ok) return jsonResp({ error: 'upstream_error' }, 502, origin);
    if (!found.record) return jsonResp({ error: 'not_found' }, 404, origin);
    if (found.record[RF.status] === '已取消') {
      if (!(await revokeRepairQuote(env, verified.rid))) return jsonResp({ error: 'quote_store_failed' }, 502, origin);
      return jsonResp({ error: 'quote_cancelled' }, 410, origin);
    }
    if (!validRepairAmount(found.record[RF.total])) return jsonResp({ error: 'invalid_formula_total' }, 502, origin);
    const claimed = await claimRepairQuote(env, verified.rid, quoteToken);
    if (claimed === null) return jsonResp({ error: 'quote_store_failed' }, 502, origin);
    if (!claimed) return jsonResp({ error: 'forbidden' }, 403, origin);
    return jsonResp({ ok: true, quote: {
      ticketNo: found.record[RF.ticket] || '', item: found.record[RF.category] || '',
      description: found.record[RF.description] || '', total: Number(found.record[RF.total]), companyName: '窩的家',
    } }, 200, origin);
  }

  if (action === 'repairReportPayment') {
    if (!requireRepairRole(identity, 'business')) return jsonResp({ error: 'forbidden' }, 403, origin);
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) return jsonResp({ error: 'expect_multipart' }, 400, origin);
    let input; try { input = await request.formData(); } catch { return jsonResp({ error: 'bad_multipart' }, 400, origin); }
    const rid = String(input.get('rid') || ''); const proof = input.get('proof');
    if (!validRid(rid)) return jsonResp({ error: 'invalid_rid' }, 400, origin);
    if (!validRepairFile(proof, REPAIR_PAYMENT_MIMES)) return jsonResp({ error: 'invalid_proof' }, 400, origin);
    const found = await getRepairByRid(env, rid);
    if (!found.upstream.ok) return jsonResp({ error: 'upstream_error' }, 502, origin);
    if (!found.record) return jsonResp({ error: 'not_found' }, 404, origin);
    const ownerMatch = await repairOwnerMatches(env, rid, found.record, identity);
    if (ownerMatch === null) return jsonResp({ error: 'owner_lookup_failed' }, 502, origin);
    if (!ownerMatch) return jsonResp({ error: 'forbidden' }, 403, origin);
    if (found.record[RF.status] !== '已報價') return jsonResp({ error: 'invalid_status' }, 409, origin);
    const form = new FormData(); form.set(RF.paymentStatus, '已收款'); form.set(RF.paymentAt, taipeiTimestamp());
    form.set(RF.paymentProof, proof, proof.name || 'payment-proof'); form.set(RF.status, '已收款');
    const result = await writeMultipart(rid, form); if (result.fail) return jsonResp(result.fail, 502, origin);
    const ticketNo = found.record[RF.ticket] || rid; scheduleRepairNotification(ctx, env, ticketNo, '已收款');
    return jsonResp({ ok: true, rid, ticketNo, status: '已收款', paymentStatus: '已收款' }, 200, origin);
  }

  if (action === 'repairDispatch') {
    if (!requireRepairRole(identity, 'console')) return jsonResp({ error: 'forbidden' }, 403, origin);
    const parsed = await parseRepairJson(request, origin); if (parsed.response) return parsed.response;
    const { rid, vendorName, scheduledAt } = parsed.body || {}; const ridString = String(rid || '');
    const normalizedAt = normalizeRepairScheduledAt(scheduledAt);
    if (!validRid(ridString)) return jsonResp({ error: 'invalid_rid' }, 400, origin);
    if (!validRepairText(vendorName, 100, true)) return jsonResp({ error: 'invalid_vendorName' }, 400, origin);
    if (!normalizedAt) return jsonResp({ error: 'invalid_scheduledAt' }, 400, origin);
    const found = await getRepairByRid(env, ridString);
    if (!found.upstream.ok) return jsonResp({ error: 'upstream_error' }, 502, origin);
    if (!found.record) return jsonResp({ error: 'not_found' }, 404, origin);
    if (found.record[RF.paymentStatus] !== '已收款' || found.record[RF.status] !== '已收款') return jsonResp({ error: 'payment_required' }, 409, origin);
    const name = vendorName.trim();
    const vendorResult = await getFromRagic(env, REPAIR_VENDOR_SHEET, `naming=EID&ignoreFixedFilter=true&where=1000279,eq,${encodeURIComponent(name)}&limit=0,10`);
    if (!vendorResult.upstream.ok) return jsonResp({ error: 'upstream_error' }, 502, origin);
    if (!repairRecords(vendorResult.data).some(([, rec]) => String(rec['1000279'] || '').trim() === name)) return jsonResp({ error: 'vendor_not_found' }, 400, origin);
    const params = new URLSearchParams({ [RF.vendor]: name, [RF.scheduledAt]: normalizedAt, [RF.status]: '已派工' });
    const result = await postUrlEncodedToRagic(env, `${REPAIR_SHEET}/${ridString}`, params.toString());
    const fail = detectUpstreamFailure(result.upstream, result.data); if (fail) return jsonResp(fail, 502, origin);
    const ticketNo = found.record[RF.ticket] || ridString; scheduleRepairNotification(ctx, env, ticketNo, '已派工');
    return jsonResp({ ok: true, rid: ridString, ticketNo, status: '已派工' }, 200, origin);
  }

  if (action === 'repairComplete') {
    if (!requireRepairRole(identity, 'console')) return jsonResp({ error: 'forbidden' }, 403, origin);
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) return jsonResp({ error: 'expect_multipart' }, 400, origin);
    let input; try { input = await request.formData(); } catch { return jsonResp({ error: 'bad_multipart' }, 400, origin); }
    const rid = String(input.get('rid') || ''); const photos = input.getAll('photo'); const actualDescription = input.get('actualDescription');
    if (!validRid(rid)) return jsonResp({ error: 'invalid_rid' }, 400, origin);
    if (photos.length !== 1 || !validRepairFile(photos[0], REPAIR_IMAGE_MIMES)) return jsonResp({ error: 'invalid_completion_photo' }, 400, origin);
    if (actualDescription !== null && !validRepairText(actualDescription, 2000)) return jsonResp({ error: 'invalid_actualDescription' }, 400, origin);
    const found = await getRepairByRid(env, rid);
    if (!found.upstream.ok) return jsonResp({ error: 'upstream_error' }, 502, origin);
    if (!found.record) return jsonResp({ error: 'not_found' }, 404, origin);
    if (!new Set(['已派工', '施工中']).has(found.record[RF.status])) return jsonResp({ error: 'invalid_status' }, 409, origin);
    const form = new FormData(); form.set(RF.finishedPhoto, photos[0], photos[0].name || 'finished-photo');
    if (String(actualDescription || '').trim()) form.set(RF.actualDescription, String(actualDescription).trim());
    form.set(RF.finishedAt, todayTaipei()); form.set(RF.status, '完工待驗收');
    const result = await writeMultipart(rid, form); if (result.fail) return jsonResp(result.fail, 502, origin);
    const ticketNo = found.record[RF.ticket] || rid; scheduleRepairNotification(ctx, env, ticketNo, '完工待驗收');
    return jsonResp({ ok: true, rid, ticketNo, status: '完工待驗收' }, 200, origin);
  }

  if (action === 'repairAccept' || action === 'repairReject') {
    if (!requireRepairRole(identity, 'console')) return jsonResp({ error: 'forbidden' }, 403, origin);
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().startsWith('multipart/form-data')) return jsonResp({ error: 'expect_multipart' }, 400, origin);
    let input; try { input = await request.formData(); } catch { return jsonResp({ error: 'bad_multipart' }, 400, origin); }
    const rid = String(input.get('rid') || ''); const reason = input.get('reason'); const photo = input.get('photo');
    if (!validRid(rid)) return jsonResp({ error: 'invalid_rid' }, 400, origin);
    if (action === 'repairReject' && !validRepairText(reason, 2000, true)) return jsonResp({ error: 'reason_required' }, 400, origin);
    if (photo instanceof File && photo.size > 0 && !validRepairFile(photo, REPAIR_IMAGE_MIMES)) return jsonResp({ error: 'invalid_photo' }, 400, origin);
    const found = await getRepairByRid(env, rid);
    if (!found.upstream.ok) return jsonResp({ error: 'upstream_error' }, 502, origin);
    if (!found.record) return jsonResp({ error: 'not_found' }, 404, origin);
    if (found.record[RF.status] !== '完工待驗收') return jsonResp({ error: 'invalid_status' }, 409, origin);
    const form = new FormData(); const today = todayTaipei(); form.set(`${RF.acceptDate}_-1`, today);
    let status;
    if (action === 'repairAccept') {
      status = '已結案'; form.set(`${RF.acceptResult}_-1`, '通過'); form.set(RF.status, status);
      if (photo instanceof File && photo.size > 0) form.set(`${RF.acceptPhoto}_-1`, photo, photo.name || 'accept-photo');
    } else {
      status = '施工中'; form.set(`${RF.acceptResult}_-1`, '退回'); form.set(`${RF.acceptReason}_-1`, String(reason).trim()); form.set(RF.status, status);
      if (photo instanceof File && photo.size > 0) form.set(`${RF.acceptPhoto}_-1`, photo, photo.name || 'reject-photo');
    }
    const result = await writeMultipart(rid, form); if (result.fail) return jsonResp(result.fail, 502, origin);
    const ticketNo = found.record[RF.ticket] || rid; scheduleRepairNotification(ctx, env, ticketNo, status);
    return jsonResp({ ok: true, rid, ticketNo, status }, 200, origin);
  }

  if (action === 'repairCancel') {
    const parsed = await parseRepairJson(request, origin); if (parsed.response) return parsed.response;
    const { rid, reason } = parsed.body || {}; const ridString = String(rid || '');
    if (!validRid(ridString)) return jsonResp({ error: 'invalid_rid' }, 400, origin);
    if (!validRepairText(reason, 2000, true)) return jsonResp({ error: 'reason_required' }, 400, origin);
    const found = await getRepairByRid(env, ridString);
    if (!found.upstream.ok) return jsonResp({ error: 'upstream_error' }, 502, origin);
    if (!found.record) return jsonResp({ error: 'not_found' }, 404, origin);
    if (identity.role === 'business') {
      const ownerMatch = await repairOwnerMatches(env, ridString, found.record, identity);
      if (ownerMatch === null) return jsonResp({ error: 'owner_lookup_failed' }, 502, origin);
      if (!ownerMatch) return jsonResp({ error: 'forbidden' }, 403, origin);
    }
    if (REPAIR_TERMINAL_STATUSES.has(found.record[RF.status])) return jsonResp({ error: 'invalid_status' }, 409, origin);
    const params = new URLSearchParams({ [RF.cancelReason]: reason.trim(), [RF.status]: '已取消' });
    const result = await postUrlEncodedToRagic(env, `${REPAIR_SHEET}/${ridString}`, params.toString());
    const fail = detectUpstreamFailure(result.upstream, result.data); if (fail) return jsonResp(fail, 502, origin);
    await revokeRepairQuote(env, ridString);
    const ticketNo = found.record[RF.ticket] || ridString; scheduleRepairNotification(ctx, env, ticketNo, '已取消');
    return jsonResp({ ok: true, rid: ridString, ticketNo, status: '已取消' }, 200, origin);
  }

  return null;
}

// ============================================================================
// Group V: 修繕報價單產生器 → Ragic 化（maintenance-management/15，2026-07-24）
// ============================================================================
// 這張表對 `Authorization: Basic` 一律降級 guest（回 code:106），必須用
// `?api=true&APIKey=<key>` query param 才能以 admin 身份存取（見 BuildSpec / rq-sheet-
// fields.md 認證注意），故不能沿用既有 getFromRagic/postUrlEncodedToRagic（那兩支寫死
// Authorization header）——新增專屬 rqUrl() 走 query param 認證，既有 66 支 action 的
// 兩支共用 helper 完全不動。
const RQ_SHEET = 'maintenance-management/15';
const RQF = Object.freeze({
  quoteNo: '1003157', // 自動編號（唯讀，僅供讀回驗證/回傳，Worker 從不寫入此欄）
  quoteDate: '1003159', validUntil: '1003160', status: '1003161', repairTicketNo: '1003162',
  issuer: '1003163', custName: '1003164', custPhone: '1003165', siteAddress: '1003166',
  siteNote: '1003167', sellerName: '1003168', sellerPhone: '1003169', discountType: '1003170',
  discountValue: '1003171', taxMode: '1003172', customTaxRate: '1003173', subtotal: '1003174',
  discountAmount: '1003175', taxAmount: '1003176', total: '1003177', notes: '1003178',
  shareToken: '1003179', snapshotJson: '1003180',
});
const RQ_ITEM_F = Object.freeze({
  idx: '1003182', category: '1003183', name: '1003184', desc: '1003185',
  qty: '1003186', unit: '1003187', price: '1003188', subtotal: '1003189',
});
const RQ_DISCOUNT_LABELS = { none: '無', amount: '固定金額', percent: '折數' };
const RQ_TAX_LABELS = { included: '內含5%', excluded: '外加5%', exempt: '免稅', custom: '自訂' };
const RQ_MAX_ITEMS = 50;
const RQ_MAX_SNAPSHOT_BYTES = 200 * 1024;

function rqUrl(env, sheet, params) {
  const u = new URL(`${env.RAGIC_BASE}/${sheet}`);
  u.searchParams.set('api', 'true');
  u.searchParams.set('APIKey', env.RAGIC_KEY);
  for (const [k, v] of Object.entries(params || {})) u.searchParams.set(k, String(v));
  return u;
}
function rqStr(v, max) { return String(v === undefined || v === null ? '' : v).trim().slice(0, max); }
function rqNum(v) { const n = Number(v); return Number.isFinite(n) ? Math.max(0, n) : 0; }
function validRqToken(s) { return typeof s === 'string' && /^[0-9a-f]{32}$/.test(s); }
function rqGenToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request, env, ctx) {
    const allowedOrigin = env.ALLOWED_ORIGIN;

    const url = new URL(request.url);
    const path = url.pathname.replace(/^\//, '').replace(/\/$/, '');

    // ============ Telegram webhook: separate from CORS-locked actions ============
    if (path === TELEGRAM_WEBHOOK_PATH) {
      // Always respond 200 immediately to prevent Telegram retries
      const responsePromise = new Response('ok', { status: 200 });
      ctx.waitUntil((async () => {
        let update;
        try { update = await request.json(); } catch { return; }

        const cq = update?.callback_query;
        if (!cq) return;

        await answerCallbackQuery(env, cq.id);

        const callbackData = cq.data || '';
        const messageId = cq.message?.message_id;
        const chatId = cq.message?.chat?.id;
        const originalText = cq.message?.text || '';

        const colonIdx = callbackData.indexOf(':');
        if (colonIdx < 0) return;
        const action = callbackData.slice(0, colonIdx);
        const submissionId = callbackData.slice(colonIdx + 1);

        if (!submissionId || !validUuid(submissionId)) return;

        let resultText = '';

        if (action === 'retry') {
          const kvKey = KV_PREFIX + submissionId;
          let raw, val;
          try { raw = await env.EARNEST_QUEUE.get(kvKey); } catch { return; }
          if (!raw) { resultText = '\n\n❌ submission 不存在'; }
          else {
            try { val = JSON.parse(raw); } catch { return; }
            const { rid, fields } = val;
            if (!rid || !fields) { resultText = '\n\n❌ submission 資料不完整'; }
            else {
              const result = await submitEarnestToRagic(env, rid, fields);
              const now = getNowIso();
              if (result.ok) {
                const updated = { ...val, status: 'success', ragic_id: result.ragicId, completed_at: now };
                try { await env.EARNEST_QUEUE.put(kvKey, JSON.stringify(updated), { expirationTtl: KV_TTL_SECONDS }); } catch {}
                const ts = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
                resultText = `\n\n✅ <b>重試已觸發</b> (${ts})`;
              } else {
                const errEntry = { attempt: 'manual_retry', error: result.error, code: result.code, msg: result.msg, at: now };
                const updated = { ...val, status: 'failed_need_human', last_error: errEntry, error_history: [...(val.error_history || []), errEntry] };
                try { await env.EARNEST_QUEUE.put(kvKey, JSON.stringify(updated), { expirationTtl: KV_TTL_SECONDS }); } catch {}
                resultText = `\n\n❌ <b>重試失敗</b>：${escapeHtml(result.error || String(result.code || ''))}`;
              }
            }
          }
        } else if (action === 'manual') {
          const kvKey = KV_PREFIX + submissionId;
          let raw, val;
          try { raw = await env.EARNEST_QUEUE.get(kvKey); } catch { return; }
          if (!raw) { resultText = '\n\n❌ submission 不存在'; }
          else {
            try { val = JSON.parse(raw); } catch { return; }
            const updated = { ...val, status: 'manual_processed', completed_at: getNowIso() };
            try { await env.EARNEST_QUEUE.put(kvKey, JSON.stringify(updated), { expirationTtl: KV_TTL_SECONDS }); } catch {}
            const ts = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
            resultText = `\n\n📋 <b>已標記為人工處理</b> (${ts})`;
          }
        }

        if (messageId && chatId && resultText) {
          await editTelegramMessage(env, chatId, messageId, originalText + resultText);
        }
      })());
      return responsePromise;
    }

    // ============ Regular CORS-locked actions ============
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) });
    }

    const config = ALLOWED_ACTIONS[path];
    let action = config ? path : null;
    let pathParam = null;

    if (!action) {
      for (const p of PATH_PREFIX) {
        if (path.startsWith(p.prefix)) {
          const seg = path.slice(p.prefix.length);
          if (RID_PATH_OPS.has(p.op)) {
            if (!validRid(seg)) return jsonResp({ error: 'invalid_rid' }, 400, allowedOrigin);
          } else {
            if (!validUuid(seg)) return jsonResp({ error: 'invalid_submission_id' }, 400, allowedOrigin);
          }
          if (request.method !== p.method) return jsonResp({ error: 'method_not_allowed' }, 405, allowedOrigin);
          action = p.op;
          pathParam = seg;
          break;
        }
      }
    }

    if (!action) return jsonResp({ error: 'unknown_action', path }, 404, allowedOrigin);
    if (config && request.method !== config.method) return jsonResp({ error: 'method_not_allowed' }, 405, allowedOrigin);

    let repairIdentity = null;
    if (REPAIR_INTERNAL_ACTIONS.has(action)) {
      repairIdentity = authenticateRepair(request, env);
      if (!repairIdentity) return jsonResp({ error: 'forbidden' }, 403, allowedOrigin);
    }

    // Group S: 資產活化工作檯 P5 — 固定連結 token 驗證。失敗一律同型 404（不分因由防列舉），
    // 比照 payment-receipt v30 / earnest v29 IDOR root-fix 手法（見規格書 § P5 認證）。
    if (WORKBENCH_ACTIONS.has(action)) {
      const wbToken = url.searchParams.get('token');
      if (!wbToken || !env.WORKBENCH_TOKEN || wbToken !== env.WORKBENCH_TOKEN) {
        return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
      }
    }

    // Group T: 設計部工作檯 P1 — 固定連結 token 驗證（token→角色，DECOR_TOKENS_JSON）。
    // 失敗一律同型 404（不分因由防列舉），比照上方 P5 / v29 / v30 手法。
    let decorIdentity = null;
    if (DECOR_ACTIONS.has(action)) {
      decorIdentity = authenticateDecor(url, env);
      if (!decorIdentity) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
    }

    // Group U: 工作日誌 — 固定連結 token 驗證（token→{role,name}，WORKLOG_TOKENS_JSON）。
    // 失敗一律同型 404（不分因由防列舉），比照上方 P5 / Group T / v29 / v30 手法。
    let worklogIdentity = null;
    if (WORKLOG_ACTIONS.has(action)) {
      worklogIdentity = authenticateWorklog(url, env);
      if (!worklogIdentity) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
    }

    // Group X: 零用金請款 — 兩種身分 token gate（同仁 token 反查人事表 / 財務 token 比對
    // PETTY_CASH_FINANCE_TOKENS_JSON，同一支 gate 函式先試 A 再試 B）。角色不符該 action 所需
    // 角色一律同型 404（不回 403，避免洩漏 token 有效性），比照上方 v29/v30/P5/Group T/U 手法。
    let pettyCashIdentity = null;
    if (PETTY_CASH_ACTIONS.has(action)) {
      pettyCashIdentity = await authenticatePettyCash(url, env);
      const requiredRole = PC_STAFF_ACTIONS.has(action) ? 'staff' : 'finance';
      if (!pettyCashIdentity || pettyCashIdentity.role !== requiredRole) {
        return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
      }
    }

    try {
      if (action.startsWith('repair')) {
        const repairResponse = await handleRepairAction(action, request, env, ctx, repairIdentity, allowedOrigin);
        if (repairResponse) return repairResponse;
      }

      if (action.startsWith('worklog')) {
        const worklogResponse = await handleWorklogAction(action, request, env, worklogIdentity, allowedOrigin);
        if (worklogResponse) return worklogResponse;
      }

      if (action.startsWith('pettyCash')) {
        const pettyCashResponse = await handlePettyCashAction(action, request, env, pettyCashIdentity, allowedOrigin);
        if (pettyCashResponse) return pettyCashResponse;
      }

      // Group W: 企業入口 公布欄／心情留言板（Supabase，非 Ragic）。無 token gate——全公司首頁
      // 人人可讀；發文/刪除的權限判定在 handlePortalAction 內以 actor 姓名比對 PORTAL_MANAGERS。
      if (PORTAL_ACTIONS.has(action)) {
        const portalResponse = await handlePortalAction(action, request, env, allowedOrigin);
        if (portalResponse) return portalResponse;
      }

      if (action === 'lookupOperator') {
        const userId = url.searchParams.get('userId');
        if (!validUserId(userId)) return jsonResp({ error: 'invalid_userId' }, 400, allowedOrigin);
        const { upstream, data } = await getFromRagic(env, 'operation/12', `naming=EID&where=1002018,eq,${encodeURIComponent(userId)}&limit=0,5`);
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        const records = Object.entries(data || {}).map(([rid, rec]) => ({ rid, name: rec['1002019'] || null }));
        return jsonResp({ records }, 200, allowedOrigin);
      }

      if (action === 'bindOperator') {
        let body;
        try { body = await request.json(); } catch { return jsonResp({ error: 'bad_json' }, 400, allowedOrigin); }
        const { userId, name, phone } = body || {};
        if (!validUserId(userId)) return jsonResp({ error: 'invalid_userId' }, 400, allowedOrigin);
        if (!validName(name))     return jsonResp({ error: 'invalid_name' }, 400, allowedOrigin);
        if (!validPhone(phone))   return jsonResp({ error: 'invalid_phone' }, 400, allowedOrigin);
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const ts = `${now.getFullYear()}/${pad(now.getMonth()+1)}/${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        const params = new URLSearchParams({ '1002018': userId, '1002019': name, '1002020': phone, '1002021': ts });
        const { upstream, data } = await postUrlEncodedToRagic(env, 'operation/12', params.toString());
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true, ragicId: data?.ragicId }, 200, allowedOrigin);
      }

      if (action === 'submitTenantNeed') {
        let body;
        try { body = await request.json(); } catch { return jsonResp({ error: 'bad_json' }, 400, allowedOrigin); }
        const fields = body?.fields;
        if (!fields || typeof fields !== 'object') return jsonResp({ error: 'missing_fields' }, 400, allowedOrigin);
        const fieldKeys = Object.keys(fields);
        if (fieldKeys.length === 0) return jsonResp({ error: 'empty_fields' }, 400, allowedOrigin);
        for (const k of fieldKeys) {
          if (!TENANT_FIELDS_WHITELIST.has(k)) return jsonResp({ error: 'invalid_field', key: k }, 400, allowedOrigin);
        }
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(fields)) params.append(k, String(v == null ? '' : v));
        const { upstream, data } = await postUrlEncodedToRagic(env, 'property-data-kept/8', params.toString());
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true, ragicId: data?.ragicId }, 200, allowedOrigin);
      }

      if (action === 'bindTenant') {
        let body;
        try { body = await request.json(); } catch { return jsonResp({ error: 'bad_json' }, 400, allowedOrigin); }
        const { userId, name, phone, addressPart, roomPart } = body || {};
        if (!validUserId(userId)) return jsonResp({ error: 'invalid_userId' }, 400, allowedOrigin);
        if (!validName(name))     return jsonResp({ error: 'invalid_name' }, 400, allowedOrigin);
        if (!validPhone(phone))   return jsonResp({ error: 'invalid_phone' }, 400, allowedOrigin);
        if (typeof addressPart !== 'string' || addressPart.length < 1 || addressPart.length > 100) return jsonResp({ error: 'invalid_address' }, 400, allowedOrigin);
        if (typeof roomPart !== 'string' || roomPart.length < 1 || roomPart.length > 50) return jsonResp({ error: 'invalid_room' }, 400, allowedOrigin);
        const combinedRoomInfo = `${addressPart} (${roomPart})`;
        const params = new URLSearchParams({ '1001382': name, '1001379': phone, '1001839': combinedRoomInfo, '1001840': userId, '1001841': '已綁定' });
        const { upstream, data } = await postUrlEncodedToRagic(env, 'lease-management/2', params.toString());
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true, ragicId: data?.ragicId }, 200, allowedOrigin);
      }

      if (action === 'listEmployees') {
        const { upstream, data } = await getFromRagic(env, 'ragicforms4/20004', 'naming=EID&limit=200');
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        // ── SEC-2026-07-28 個資外洩止血：回傳前欄位白名單 ──────────────────────────
        // 本 action 與 listStaff 打同一張人事表 ragicforms4/20004，差別只在 naming=EID
        // （key 是 7 位數欄位 ID 而非中文名）。原本整張原樣回傳，敏感欄位一項不少。
        // 消費端逐行盤點（schedule-common.js 的 SC.F_EMP 常數）：
        //   3000933 姓名 / 3000937 部門 / 3000945 在職狀態 / 3000955 聘雇類別
        //     → schedule.html／schedule-view.html／fairness-dashboard.html 三頁共用的
        //       人員名單與「在職 + 排除經營階層 + 承攬/設計部/社宅部」過濾條件
        //   3000943 到職日期 → schedule.html 與 fairness-dashboard.html 的人員排序
        //   3000954 出生日期 → schedule.html 排班格生日黃框（SC.isBirthday）
        // F_EMP 另外定義但全機零使用的 DISPLAY(1000848)／FL1-3(1002028-30) 不納入
        // （FL 欄位已改由歷史值日紀錄即時計算，見 schedule.html load() 註解）。
        const LIST_EMPLOYEES_PUBLIC_FIELDS = ['3000933', '3000937', '3000945', '3000955', '3000943', '3000954'];
        // 出生日期特別處理：年份改寫為 0000，只留月/日。SC.isBirthday 只取 split('/') 的
        // [1] 月與 [2] 日，功能完全不受影響，但出生年（＝年齡）不再流出到瀏覽器。
        const EMP_BIRTHDAY_FIELD = '3000954';
        const empOut = {};
        for (const [rid, rec] of Object.entries(data || {})) {
          if (!rec || typeof rec !== 'object') continue;
          const slim = {};
          for (const f of LIST_EMPLOYEES_PUBLIC_FIELDS) {
            if (rec[f] === undefined) continue;
            if (f === EMP_BIRTHDAY_FIELD) {
              const p = String(rec[f]).split('/');
              slim[f] = p.length === 3 ? `0000/${p[1]}/${p[2]}` : '';
            } else {
              slim[f] = rec[f];
            }
          }
          empOut[rid] = slim;
        }
        return jsonResp(empOut, 200, allowedOrigin);
      }

      if (action === 'listStaff') {
        const limit = url.searchParams.get('limit') || '200';
        if (!/^\d{1,4}$/.test(limit)) return jsonResp({ error: 'invalid_limit' }, 400, allowedOrigin);
        const { upstream, data } = await getFromRagic(env, 'ragicforms4/20004', `limit=${limit}`);
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        // ── SEC-2026-07-28 個資外洩止血：回傳前欄位白名單 ──────────────────────────
        // 人事表 ragicforms4/20004 含 身分證字號 / 出生日期 / 戶籍與通訊地址 / 銀行·代號·
        // 分行·帳號 / 存摺上傳 / 主要與次要手機 / LINE User ID，以及子表格的緊急聯絡人、
        // 證件檔案、學歷、工作經驗。呼叫端在 GitHub Pages 上且無 token gate，原本整張表
        // 原樣回傳 = 任何人開 F12 就看得到全公司同仁個資。
        // 白名單做在「回傳前過濾」而非 Ragic 端 field 參數，確保任何呼叫路徑都吃得到，
        // 不會因為漏帶參數就整包吐出。子表格與 _ragicId 等 meta 一併移除。
        //   姓名 / 部門 / 在職狀態 → js/shared.js fetchStaffList（選人下拉、部門顯示）
        //                          + staff-dashboard.html 在職名單與離職判定
        //   到職日期              → staff-dashboard.html 年資計算與到職月曲線起點
        //   Email / 員工帳號      → 下一階段 Google 帳號登入的白名單比對
        const LIST_STAFF_PUBLIC_FIELDS = ['姓名', '部門', '在職狀態', '到職日期', 'Email', '員工帳號'];
        const staffOut = {};
        for (const [rid, rec] of Object.entries(data || {})) {
          if (!rec || typeof rec !== 'object') continue;
          const slim = {};
          for (const f of LIST_STAFF_PUBLIC_FIELDS) {
            if (rec[f] !== undefined) slim[f] = rec[f];
          }
          staffOut[rid] = slim;
        }
        return jsonResp(staffOut, 200, allowedOrigin);
      }

      if (action === 'listLeaves') {
        const sp = url.searchParams;
        const year = sp.get('year'); const month = sp.get('month');
        const dateFrom = sp.get('dateFrom'); const dateTo = sp.get('dateTo');
        const type = sp.get('type');
        const parts = ['naming=EID'];
        if (year && month) {
          if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month)) return jsonResp({ error: 'invalid_year_month' }, 400, allowedOrigin);
          parts.push(`where=${encodeURIComponent(`1000964,eq,${year}`)}`);
          parts.push(`where=${encodeURIComponent(`1000965,eq,${month}`)}`);
        } else if (dateFrom && dateTo) {
          if (!validDateStr(dateFrom) || !validDateStr(dateTo)) return jsonResp({ error: 'invalid_date' }, 400, allowedOrigin);
          if (type) {
            if (typeof type !== 'string' || type.length > 10) return jsonResp({ error: 'invalid_type' }, 400, allowedOrigin);
            parts.push(`where=${encodeURIComponent(`1002025,eq,${type}`)}`);
          }
          parts.push(`where=${encodeURIComponent(`1000963,gte,${dateFrom}`)}`);
          parts.push(`where=${encodeURIComponent(`1000963,lte,${dateTo}`)}`);
        } else { return jsonResp({ error: 'missing_query' }, 400, allowedOrigin); }
        const { upstream, data } = await getFromRagic(env, 'ragicforms4/2', parts.join('&'));
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        return jsonResp(data || {}, 200, allowedOrigin);
      }

      if (action === 'createLeave') {
        let body;
        try { body = await request.json(); } catch { return jsonResp({ error: 'bad_json' }, 400, allowedOrigin); }
        if (!body || typeof body !== 'object') return jsonResp({ error: 'missing_fields' }, 400, allowedOrigin);
        const fieldKeys = Object.keys(body);
        if (fieldKeys.length === 0) return jsonResp({ error: 'empty_fields' }, 400, allowedOrigin);
        for (const k of fieldKeys) {
          if (!LEAVE_FIELDS_WHITELIST.has(k)) return jsonResp({ error: 'invalid_field', key: k }, 400, allowedOrigin);
        }
        // 見紅休（設計部+瓊安）週末/國定假日禁止排值日/值班 — 三度誤排事故根治，見上方常數區註解
        const leaveEmp = body['1000961'];
        const leaveDate = body['1000963'];
        const leaveType = body['1002025'];
        if ((leaveType === '值日' || leaveType === '值班') && GOV_REST_NAMES.has(leaveEmp) && isGovRestDateStr(leaveDate)) {
          const overridden = await hasNoRestOverride(env, leaveDate);
          if (!overridden) {
            return jsonResp({ error: 'gov_rest_conflict', msg: `${leaveEmp} 屬見紅休（設計部/瓊安），${leaveDate} 不排${leaveType}` }, 400, allowedOrigin);
          }
        }
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(body)) params.append(k, String(v == null ? '' : v));
        const { upstream, data } = await postUrlEncodedToRagic(env, 'ragicforms4/2', params.toString());
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true, ragicId: data?.ragicId }, 200, allowedOrigin);
      }

      if (action === 'deleteLeave') {
        const { upstream, data } = await deleteFromRagic(env, `ragicforms4/2/${pathParam}`);
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true }, 200, allowedOrigin);
      }

      if (action === 'updateLeave') {
        let body;
        try { body = await request.json(); } catch { return jsonResp({ error: 'bad_json' }, 400, allowedOrigin); }
        if (!body || typeof body !== 'object') return jsonResp({ error: 'missing_fields' }, 400, allowedOrigin);
        const fieldKeys = Object.keys(body);
        if (fieldKeys.length === 0) return jsonResp({ error: 'empty_fields' }, 400, allowedOrigin);
        for (const k of fieldKeys) {
          if (!LEAVE_FIELDS_WHITELIST.has(k)) return jsonResp({ error: 'invalid_field', key: k }, 400, allowedOrigin);
        }
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(body)) params.append(k, String(v == null ? '' : v));
        const { upstream, data } = await postUrlEncodedToRagic(env, `ragicforms4/2/${pathParam}`, params.toString());
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true }, 200, allowedOrigin);
      }

      if (action === 'submitHrOnboarding') {
        const ct = request.headers.get('Content-Type') || '';
        if (!ct.toLowerCase().startsWith('multipart/form-data')) return jsonResp({ error: 'expect_multipart' }, 400, allowedOrigin);
        let form;
        try { form = await request.formData(); } catch { return jsonResp({ error: 'bad_multipart' }, 400, allowedOrigin); }
        const entries = Array.from(form.entries());
        if (entries.length === 0) return jsonResp({ error: 'empty_fields' }, 400, allowedOrigin);
        const newForm = new FormData();
        for (const [key, value] of entries) {
          const m = /^(\d{7})(?:_(\d{1,3}))?$/.exec(key);
          if (!m) return jsonResp({ error: 'invalid_field', key, reason: 'bad_format' }, 400, allowedOrigin);
          const fid = m[1];
          if (!HR_FIELDS_WHITELIST.has(fid)) return jsonResp({ error: 'invalid_field', key, fid, reason: 'not_whitelisted' }, 400, allowedOrigin);
          if (value instanceof File) {
            if (value.size > HR_MAX_FILE_BYTES) return jsonResp({ error: 'file_too_large', key, size: value.size }, 400, allowedOrigin);
            newForm.append(key, value, value.name);
          } else {
            if (typeof value === 'string' && value.length > 2000) return jsonResp({ error: 'value_too_long', key }, 400, allowedOrigin);
            newForm.append(key, value);
          }
        }
        const upstream = await ragicFetch(`${env.RAGIC_BASE}/ragicforms4/20004?api`, {
          method: 'POST', headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY }, body: newForm,
        });
        const text = await upstream.text();
        let data = null; try { data = JSON.parse(text); } catch {}
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true, ragicId: data?.ragicId }, 200, allowedOrigin);
      }

      // ============ Group H2: bcard survey ============
      if (action === 'getBcardStaff') {
        // Returns ONLY { rid, name } pairs for active staff — never exposes full record
        const qs = 'naming=EID&where=3000945,eq,' + encodeURIComponent('在職') + '&limit=0,500';
        const { upstream, data } = await getFromRagic(env, 'ragicforms4/20004', qs);
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        const staff = [];
        for (const [rid, record] of Object.entries(data || {})) {
          if (!/^\d+$/.test(rid)) continue;
          const name = record['3000933'];
          if (!name) continue;
          const bcardTs = record['1002556'];
          if (bcardTs && String(bcardTs).trim() !== '') continue; // already submitted
          staff.push({ rid, name });
        }
        staff.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
        return jsonResp({ staff }, 200, allowedOrigin);
      }

      if (action === 'submitBcardSurvey') {
        const rid = url.searchParams.get('rid');
        if (!rid || !validRid(rid)) return jsonResp({ error: 'invalid_rid' }, 400, allowedOrigin);
        let body;
        try { body = await request.json(); } catch { return jsonResp({ error: 'invalid_json' }, 400, allowedOrigin); }
        const params = new URLSearchParams();
        for (const [key, value] of Object.entries(body)) {
          if (!BCARD_FIELDS_WHITELIST.has(key)) return jsonResp({ error: 'invalid_field', key }, 400, allowedOrigin);
          if (typeof value !== 'string' || value.length > 200) return jsonResp({ error: 'value_invalid', key }, 400, allowedOrigin);
          params.append(key, value);
        }
        if (params.toString() === '') return jsonResp({ error: 'empty_body' }, 400, allowedOrigin);
        const upstream = await ragicFetch(
          env.RAGIC_BASE + '/ragicforms4/20004/' + rid + '?api',
          { method: 'POST', headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() }
        );
        const text = await upstream.text();
        let data = null; try { data = JSON.parse(text); } catch {}
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        // Write bcard survey timestamp server-side (not client-controlled, not in whitelist)
        const now = new Date();
        const tpe = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const tsStr = tpe.getUTCFullYear() + '-'
          + String(tpe.getUTCMonth() + 1).padStart(2, '0') + '-'
          + String(tpe.getUTCDate()).padStart(2, '0') + ' '
          + String(tpe.getUTCHours()).padStart(2, '0') + ':'
          + String(tpe.getUTCMinutes()).padStart(2, '0');
        await ragicFetch(
          env.RAGIC_BASE + '/ragicforms4/20004/' + rid + '?api',
          { method: 'POST', headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: '1002556=' + encodeURIComponent(tsStr) }
        );
        return jsonResp({ ok: true }, 200, allowedOrigin);
      }

      // ============ Group C: earnest + payment-receipt (sync) ============
      if (action === 'getEarnest') {
        // IDOR ROOT-FIX 2026-07-16 (supersedes v21/v22 "optional token" design — see
        // 技術債/規格書 for full incident writeup of why that was still an IDOR).
        // token is now the ONLY standalone credential. code/rid (legacy format, kept for
        // backward compat with pre-2026-07-16 links) now REQUIRE a matching &token= —
        // no exceptions. Every failure path in the code/rid branch (missing token,
        // malformed token, record not found, token mismatch) returns an IDENTICAL 404
        // record_not_found — never distinguishes reasons, to block enumeration attacks.

        const tokenParam = url.searchParams.get('token');
        const codeParam  = url.searchParams.get('code');
        const ridParam   = url.searchParams.get('rid');

        // Branch 1: pure token lookup — no code/rid supplied
        if (tokenParam && !codeParam && !ridParam) {
          if (!validHardenedToken(tokenParam)) return jsonResp({ error: 'invalid_token' }, 400, allowedOrigin); // v43 hardened
          const tokenQs = `naming=EID&where=1002558,eq,${encodeURIComponent(tokenParam)}&limit=0,1`;
          const { upstream: tu, data: td } = await getFromRagic(env, 'payments/1', tokenQs);
          if (!tu.ok) return jsonResp({ error: 'upstream_error', code: tu.status }, 502, allowedOrigin);
          if (Object.keys(td || {}).length === 0) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);
          return jsonResp(td || {}, 200, allowedOrigin);
        }

        // Branch 2: code or rid supplied (legacy format) — MUST also carry a matching token
        if (codeParam || ridParam) {
          if (!tokenParam || !validHardenedToken(tokenParam)) { // v43 hardened
            return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin); // uniform 404, don't hint "you're missing a token"
          }

          // legacy front-end sometimes puts a No.YYYYMMDD-NNN code string into the `rid=` param
          // (deposit.html fallback behavior predates this fix) — detect by shape, not by param name.
          const rawVal = codeParam || ridParam;
          let rec = null;

          if (/^No\.\d{8}-\d{3}$/.test(rawVal)) {
            const lookupQs = `naming=EID&where=1000796,eq,${encodeURIComponent(rawVal)}&limit=0,1`;
            const { upstream: lu, data: ld } = await getFromRagic(env, 'payments/1', lookupQs);
            if (!lu.ok) { console.error('getEarnest code-lookup upstream fail', lu.status); }
            else {
              const vals = Object.values(ld || {});
              if (vals.length > 0) rec = vals[0];
            }
          } else if (validRid(rawVal)) {
            const { upstream: ru, data: rd } = await getFromRagic(env, `payments/1/${rawVal}`, 'naming=EID');
            if (!ru.ok) { console.error('getEarnest rid-lookup upstream fail', ru.status); }
            else if (rd && Object.keys(rd).length > 0) rec = rd; // wrapped {"<rid>": {fields}} — preserved as-is for response (front-end findExactRecord already unwraps this shape)
          }

          if (!rec) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);

          // Token comparison needs the FLAT field bag. code-branch `rec` is already flat
          // (Object.values(ld)[0] above); rid-branch `rec` is wrapped {"<rid>": {fields}}
          // — must unwrap here too (same class of bug fixed in verifyEarnestToken above,
          // caught 2026-07-16 E2E test: cross-validation always 404'd even with correct token).
          const fieldBag = rec['1002558'] !== undefined ? rec : (rec[rawVal] || Object.values(rec)[0] || {});
          const recToken = String(fieldBag['1002558'] || '').trim();
          if (!recToken || recToken.toLowerCase() !== tokenParam.toLowerCase()) {
            return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin); // wrong/no stored token — same 404 as "doesn't exist"
          }
          return jsonResp(rec, 200, allowedOrigin);
        }

        // Neither token, code, nor rid supplied
        return jsonResp({ error: 'missing_param' }, 400, allowedOrigin);
      }

      if (action === 'submitEarnest') {
        const parsed = await processMultipart(request, allowedOrigin, EARNEST_FIELDS_WHITELIST, EARNEST_SIGNATURE_FIELDS);
        if (parsed.error) return parsed.error;
        if (!parsed.rid) return jsonResp({ error: 'missing_rid' }, 400, allowedOrigin);
        // IDOR root-fix 2026-07-16: write requires token cross-validated against the target
        // record's 1002558 — closes the "submit into someone else's record" variant of the hole.
        if (!(await verifyEarnestToken(env, parsed.rid, parsed.token))) {
          return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);
        }
        const upstream = await ragicFetch(`${env.RAGIC_BASE}/payments/1/${parsed.rid}?api&v=3`, {
          method: 'POST', headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY }, body: parsed.form,
        });
        const text = await upstream.text();
        let data = null; try { data = JSON.parse(text); } catch {}
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true, ragicId: data?.ragicId || parsed.rid }, 200, allowedOrigin);
      }

      if (action === 'getPaymentReceipt' || action === 'verifyPaymentReceipt') {
        // IDOR ROOT-FIX 2026-07-16 (mirrors earnest v29 — see 技術債/規格書 for the full incident
        // writeup of why the pre-fix design was a hole). token is now the ONLY standalone
        // credential. Legacy rid/code (numeric ragicId, or 憑單編號 like "202605-032") now
        // REQUIRE a matching &token= — no exceptions. Every failure path (missing token,
        // malformed token, record not found, token mismatch) returns an IDENTICAL 404
        // record_not_found — never distinguishes reasons, to block enumeration attacks.
        //
        // This closes the exact mechanism that leaked the full 236-record table via a single
        // `?rid=1` request: the OLD numeric-rid branch called getRagicRecordById() which hits
        // Ragic with a `.json` suffix — that suffix triggers Ragic's BATCH LIST behavior
        // (returns the whole sheet, not one record) instead of the single-record detail
        // behavior. The fix below never calls getRagicRecordById for payments/2 at all —
        // numeric rid now goes through the same direct-path getFromRagic() used everywhere
        // else in this file, which returns exactly one record.

        const tokenParam = url.searchParams.get('token');
        const ridOrCodeParam = url.searchParams.get('rid') || url.searchParams.get('code');

        // Branch 1: pure token lookup — no rid/code supplied
        if (tokenParam && !ridOrCodeParam) {
          if (!validHardenedToken(tokenParam)) return jsonResp({ error: 'invalid_token' }, 400, allowedOrigin); // v43 hardened
          const tokenQs = `naming=EID&where=1003029,eq,${encodeURIComponent(tokenParam)}&limit=0,1`;
          const { upstream: tu, data: td } = await getFromRagic(env, 'payments/2', tokenQs);
          if (!tu.ok) return jsonResp({ error: 'upstream_error', code: tu.status }, 502, allowedOrigin);
          if (Object.keys(td || {}).length === 0) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);
          return jsonResp(td || {}, 200, allowedOrigin);
        }

        // Branch 2: rid or code supplied (legacy format) — MUST also carry a matching token
        if (ridOrCodeParam) {
          if (!tokenParam || !validHardenedToken(tokenParam)) { // v43 hardened
            return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin); // uniform 404, don't hint "you're missing a token"
          }

          let rec = null;

          if (/^\d{6}-\d{3}$/.test(ridOrCodeParam)) {
            // 憑單編號 format e.g. "202605-032" — lookup by field 1000781
            const lookupQs = `naming=EID&where=1000781,eq,${encodeURIComponent(ridOrCodeParam)}&limit=0,1`;
            const { upstream: lu, data: ld } = await getFromRagic(env, 'payments/2', lookupQs);
            if (!lu.ok) { console.error('getPaymentReceipt code-lookup upstream fail', lu.status); }
            else {
              const vals = Object.values(ld || {});
              if (vals.length > 0) rec = vals[0];
            }
          } else if (validRid(ridOrCodeParam)) {
            // numeric ragicId — direct-path single-record GET (no .json suffix — see comment
            // above; this IS the fix for the 236-record batch leak)
            const { upstream: ru, data: rd } = await getFromRagic(env, `payments/2/${ridOrCodeParam}`, 'naming=EID');
            if (!ru.ok) { console.error('getPaymentReceipt rid-lookup upstream fail', ru.status); }
            else if (rd && Object.keys(rd).length > 0) rec = rd; // wrapped {"<rid>": {fields}} — unwrapped below
          } else {
            return jsonResp({ error: 'invalid_rid' }, 400, allowedOrigin);
          }

          if (!rec) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);

          // Token comparison needs the FLAT field bag. code-branch `rec` is already flat
          // (Object.values(ld)[0] above); rid-branch `rec` is wrapped {"<rid>": {fields}}
          // — must unwrap here too (same class of bug earnest hit and fixed 2026-07-16;
          // avoided proactively here since we know about it up front).
          const fieldBag = rec['1003029'] !== undefined ? rec : (rec[ridOrCodeParam] || Object.values(rec)[0] || {});
          const recToken = String(fieldBag['1003029'] || '').trim();
          if (!recToken || recToken.toLowerCase() !== tokenParam.toLowerCase()) {
            return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin); // wrong/no stored token — same 404 as "doesn't exist"
          }
          return jsonResp(rec, 200, allowedOrigin);
        }

        // Neither token, code, nor rid supplied
        return jsonResp({ error: 'missing_param' }, 400, allowedOrigin);
      }

      if (action === 'getPaymentSource') {
        // IDOR root-fix 2026-07-16: gate behind the SAME payment-receipt token used by
        // getPaymentReceipt. Previously this action accepted an arbitrary client-supplied
        // `where=` clause (any fieldId, any of eq/gte/lte/gt/lt/like, any value up to 50
        // chars) and passed it straight through to operation/8 (屋主 PII: name/phone/ID) or
        // payments/1 (租客 PII) with ZERO auth — a fully independent info-disclosure hole
        // letting an attacker search/dump those sheets without ever touching a valid
        // payment-receipt record. Fix: the Worker now IGNORES any client-supplied `where=`
        // and instead re-derives the lookup code itself from the TOKEN-VERIFIED payments/2
        // record (mirrors payment-receipt.html's sourceConfig: owner→1001705 屋主編號 /
        // tenant→1000789 定金單編號), so the only records reachable are the ones actually
        // linked from the token holder's own receipt.
        const tokenParam = url.searchParams.get('token');
        const sheetKey = url.searchParams.get('sheet');
        const sheetPath = PAYMENT_SOURCE_SHEETS[sheetKey];
        if (!sheetPath) return jsonResp({ error: 'invalid_sheet' }, 400, allowedOrigin);
        if (!tokenParam || !validHardenedToken(tokenParam)) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin); // v43 hardened

        const tokenQs = `naming=EID&where=1003029,eq,${encodeURIComponent(tokenParam)}&limit=0,1`;
        const { upstream: tu, data: td } = await getFromRagic(env, 'payments/2', tokenQs);
        if (!tu.ok) return jsonResp({ error: 'upstream_error', code: tu.status }, 502, allowedOrigin);
        const prVals = Object.values(td || {});
        if (prVals.length === 0) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);
        const prRec = prVals[0];

        const codeFieldId = PAYMENT_SOURCE_CODE_FIELD[sheetKey]; // on payments/2: which field holds the source-sheet code
        const idField = PAYMENT_SOURCE_ID_FIELD[sheetKey];       // on the source sheet: which field to where=eq against
        const code = String(prRec[codeFieldId] || '').trim();
        if (!code) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);

        const { upstream, data } = await getFromRagic(env, sheetPath, `where=${encodeURIComponent(`${idField},eq,${code}`)}&naming=EID&limit=0,10`);
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        return jsonResp(data || {}, 200, allowedOrigin);
      }

      if (action === 'submitPaymentReceipt') {
        const parsed = await processMultipart(request, allowedOrigin, PAYMENT_RECEIPT_FIELDS_WHITELIST, PAYMENT_RECEIPT_SIGNATURE_FIELDS);
        if (parsed.error) return parsed.error;
        if (!parsed.rid) return jsonResp({ error: 'missing_rid' }, 400, allowedOrigin);
        // IDOR root-fix 2026-07-16: write requires token cross-validated against the target
        // record's 1003029 — closes the "submit into someone else's record" variant of the hole.
        if (!(await verifyPaymentReceiptToken(env, parsed.rid, parsed.token))) {
          return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);
        }
        const upstream = await ragicFetch(`${env.RAGIC_BASE}/payments/2/${parsed.rid}?api&v=3`, {
          method: 'POST', headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY }, body: parsed.form,
        });
        const text = await upstream.text();
        let data = null; try { data = JSON.parse(text); } catch {}
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true, ragicId: data?.ragicId || parsed.rid }, 200, allowedOrigin);
      }

      // ============ Group C2: createPaymentReceipt — 業務建立新收款單 ============
      if (action === 'createPaymentReceipt') {
        const ct = request.headers.get('Content-Type') || '';
        if (!ct.toLowerCase().startsWith('multipart/form-data')) {
          return jsonResp({ error: 'expect_multipart' }, 400, allowedOrigin);
        }
        let form;
        try { form = await request.formData(); } catch {
          return jsonResp({ error: 'bad_multipart' }, 400, allowedOrigin);
        }

        // Whitelist: 主表 14 欄 + 子表格兩組 (租客/房東)
        const CREATE_PAYMENT_MAIN_FIELDS = new Set([
          '1000782', // 對象(房東/租客)
          '1000772', // 收款日期
          '1002051', // 選擇分類
          '1000597', // 案名(連結欄)
          '1002052', // 公司件案名
          '1000767', // 地址（直接寫，不等 Link&Load auto-sync）
          '1000773', // 備註（存「經辦：姓名」）
          '1002053', // 公司件地址
          '1000773', // 備註
          '1000602', // 經辦人員(email)
          '1000789', // 定金單編號（連結欄，寫顯示文字 No.YYYYMMDD-NNN）
          '1000599', // 租客姓名（無定金單時手填）
          '1000779', // 租客電話（無定金單時手填）
          '1000785', // 付款方式-租客
          '1000780', // 後五碼-租客
          '1002076', // 付款方式-房東
          '1000603', // 後五碼-房東
          '1000784', // 租客付款證明(檔案)
          '1000650', // 房東匯款截圖(檔案)
        ]);
        // 子表格欄位 (租客收付款明細 key=1000777 + 房東服務費明細 key=1001701)
        const CREATE_PAYMENT_SUBTABLE_FIELD_IDS = new Set([
          '1000774', '1000776', '1000775', // 租客子表格 type/項目/金額
          '1001698', '1001699', '1001700', // 房東子表格 type/項目/金額
        ]);

        const outForm = new FormData();
        for (const [key, value] of form.entries()) {
          // 子表格 key 格式: 1000774_-1, 1000775_-2 ...
          const subtableMatch = key.match(/^(\d{7})_(-\d+)$/);
          if (subtableMatch) {
            const fieldId = subtableMatch[1];
            if (!CREATE_PAYMENT_SUBTABLE_FIELD_IDS.has(fieldId)) {
              return jsonResp({ error: 'invalid_subtable_field', key }, 400, allowedOrigin);
            }
            // 金額欄位只允許數字（防注入）
            if (fieldId === '1000775' || fieldId === '1001700') {
              if (!/^-?\d+(\.\d+)?$/.test(String(value))) {
                return jsonResp({ error: 'invalid_amount', key }, 400, allowedOrigin);
              }
            }
            const strVal = String(value).slice(0, 500);
            outForm.append(key, strVal);
            continue;
          }
          // 主表欄位
          if (!/^\d{7}$/.test(key)) continue; // 跳過 _xxx 非欄位 key
          if (!CREATE_PAYMENT_MAIN_FIELDS.has(key)) {
            return jsonResp({ error: 'invalid_field', key, reason: 'not_whitelisted' }, 400, allowedOrigin);
          }
          // 檔案欄位: 透傳 File object
          if (value instanceof File) {
            if (value.size > 20 * 1024 * 1024) {
              return jsonResp({ error: 'file_too_large', key }, 400, allowedOrigin);
            }
            outForm.append(key, value, value.name);
          } else {
            const strVal = String(value).slice(0, 2000);
            outForm.append(key, strVal);
          }
        }

        // IDOR root-fix 2026-07-16: generate 收款憑單 token (mirrors createDeposit's
        // 定金 token pattern, field 1002558 on payments/1). Written to 1003029 on payments/2
        // at creation time so the business-tool creation path ALWAYS produces a token —
        // getPaymentReceipt/submitPaymentReceipt now require it, no exceptions.
        const paymentReceiptToken = crypto.randomUUID();
        outForm.append('1003029', paymentReceiptToken);

        // POST 新建 record 到 payments/2
        const upstream = await ragicFetch(`${env.RAGIC_BASE}/payments/2?api&v=3&doLinkLoad=first&doFormula=true`, {
          method: 'POST',
          headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY },
          body: outForm,
        });
        const text = await upstream.text();
        let data = null;
        try { data = JSON.parse(text); } catch {}
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);

        const newRid = data?.ragicId || data?.rv;
        if (!newRid) return jsonResp({ error: 'no_rid_returned', raw: text.slice(0, 200) }, 502, allowedOrigin);

        // 讀回新建 record：(1) 取憑單編號(1000781)；(2) 驗對象欄(1000782)有值（Bug 3 防呆）
        let voucherCode = '';
        try {
          const readUpstream = await ragicFetch(
            `${env.RAGIC_BASE}/payments/2/${newRid}?api=true&v=3&naming=EID`,
            { headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY } }
          );
          const readData = await readUpstream.json().catch(() => ({}));
          const rec = readData[String(newRid)];
          if (!rec) {
            return jsonResp({ error: 'verify_failed', reason: 'record_not_found_after_create', ragicId: newRid }, 502, allowedOrigin);
          }
          // 對象欄(1000782)必須有值，否則視為寫入失敗（防謊報成功）
          const subjectVal = rec['1000782'];
          if (!subjectVal || String(subjectVal).trim() === '') {
            return jsonResp({ error: 'verify_failed', reason: '1000782_empty_after_create', ragicId: newRid }, 502, allowedOrigin);
          }
          voucherCode = rec['1000781'] || '';
        } catch (e) {
          return jsonResp({ error: 'verify_read_failed', ragicId: newRid, msg: String(e) }, 502, allowedOrigin);
        }

        return jsonResp({ ok: true, ragicId: newRid, voucherCode, token: paymentReceiptToken }, 200, allowedOrigin);
      }

      if (action === 'submitPaymentSource') {
        // IDOR root-fix 2026-07-16: the target source-sheet _ragicId is now re-derived
        // SERVER-SIDE from a TOKEN-VERIFIED payments/2 record. A client-supplied `_rid` is
        // no longer trusted/accepted at all — previously an attacker (even one holding a
        // valid token for their OWN receipt) could POST an arbitrary `_rid` and overwrite
        // a DIFFERENT owner's/tenant's phone number field. Now the only writable target is
        // the exact source record linked from the token holder's own payments/2 record.
        const ct = request.headers.get('Content-Type') || '';
        if (!ct.toLowerCase().startsWith('multipart/form-data')) return jsonResp({ error: 'expect_multipart' }, 400, allowedOrigin);
        let form;
        try { form = await request.formData(); } catch { return jsonResp({ error: 'bad_multipart' }, 400, allowedOrigin); }
        const sheetKey = form.get('_sheet');
        const tokenParam = form.get('_token');
        const sheetPath = PAYMENT_SOURCE_SHEETS[sheetKey];
        if (!sheetPath) return jsonResp({ error: 'invalid_sheet' }, 400, allowedOrigin);
        if (typeof tokenParam !== 'string' || !validHardenedToken(tokenParam)) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin); // v43 hardened

        const tokenQs = `naming=EID&where=1003029,eq,${encodeURIComponent(tokenParam)}&limit=0,1`;
        const { upstream: tu, data: td } = await getFromRagic(env, 'payments/2', tokenQs);
        if (!tu.ok) return jsonResp({ error: 'upstream_error', code: tu.status }, 502, allowedOrigin);
        const prVals = Object.values(td || {});
        if (prVals.length === 0) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);
        const prRec = prVals[0];

        const codeFieldId = PAYMENT_SOURCE_CODE_FIELD[sheetKey];
        const idField = PAYMENT_SOURCE_ID_FIELD[sheetKey];
        const code = String(prRec[codeFieldId] || '').trim();
        if (!code) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);

        const { upstream: lu, data: ld } = await getFromRagic(env, sheetPath, `naming=EID&where=${encodeURIComponent(`${idField},eq,${code}`)}&limit=0,1`);
        if (!lu.ok) return jsonResp({ error: 'upstream_error', code: lu.status }, 502, allowedOrigin);
        const srcVals = Object.values(ld || {});
        if (srcVals.length === 0) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);
        const rid = srcVals[0]['_ragicId'];
        if (!rid) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);

        const newForm = new FormData();
        for (const [key, value] of form.entries()) {
          if (key === '_sheet' || key === '_rid' || key === '_token') continue; // _rid silently ignored even if a stale client sends it
          if (!/^\d{7}$/.test(key)) return jsonResp({ error: 'invalid_field', key, reason: 'bad_format' }, 400, allowedOrigin);
          if (!PAYMENT_SOURCE_FIELDS_WHITELIST.has(key)) return jsonResp({ error: 'invalid_field', key, reason: 'not_whitelisted' }, 400, allowedOrigin);
          const strVal = typeof value === 'string' ? value : String(value);
          if (strVal.length > 100) return jsonResp({ error: 'value_too_long', key }, 400, allowedOrigin);
          newForm.append(key, strVal);
        }
        const upstream = await ragicFetch(`${env.RAGIC_BASE}/${sheetPath}/${rid}?api&v=3`, {
          method: 'POST', headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY }, body: newForm,
        });
        const text = await upstream.text();
        let data = null; try { data = JSON.parse(text); } catch {}
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true, ragicId: data?.ragicId || rid }, 200, allowedOrigin);
      }

      // ============ Group F: getYongceProperties (ap16, read-only) ============
      if (action === 'getYongceProperties') {
        // Fetch all properties from ap16 YongCe. RAGIC_KEY (wuohome admin)
        // covers ap16 as both tenants share the same Ragic user account.
        // Status filtering (exclude down-listed) is handled by the frontend
        // (map.html already filters EID.STATUS === '下架').
        let upstream, data;
        try {
          const resp = await ragicFetch(
            `${AP16_BASE}/property-data-kept/1?api=true&v=3&naming=EID`,
            { headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY } }
          );
          const text = await resp.text();
          upstream = resp;
          try { data = JSON.parse(text); } catch { data = null; }
        } catch (e) {
          return jsonResp({ error: 'upstream_fetch_failed', msg: String(e) }, 502, allowedOrigin);
        }
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        if (!data || typeof data !== 'object') return jsonResp({ error: 'upstream_bad_json' }, 502, allowedOrigin);

        // Strip all fields not in whitelist. Only expose public info to browser.
        const filtered = {};
        for (const [rid, rec] of Object.entries(data)) {
          if (typeof rec !== 'object' || rec === null) continue;
          // Whitelist: only return genuine YongCe-owned properties.
          // Any non-永策 team (窩的家 mirrors, 享寓 imports, future brands like 心寓) must go
          // through getYongceAllianceProperties. Adding a new brand NEVER requires touching this block.
          if (rec['1000114'] !== '永策') continue;
          const clean = {};
          if (rec._ragicId !== undefined) clean._ragicId = rec._ragicId;
          for (const fid of YONGCE_PUBLIC_FIELD_IDS) {
            if (fid in rec) clean[fid] = rec[fid];
          }
          // Subtable: keep agent name + phone only; strip email/ratio/role/photo
          const subRaw = rec[YONGCE_SUBTABLE_KEY];
          if (subRaw && typeof subRaw === 'object') {
            const cleanSub = {};
            for (const [rowId, row] of Object.entries(subRaw)) {
              if (typeof row !== 'object' || row === null) continue;
              const cleanRow = {};
              for (const sf of YONGCE_SUBTABLE_PUBLIC) {
                if (sf in row) cleanRow[sf] = row[sf];
              }
              cleanSub[rowId] = cleanRow;
            }
            clean[YONGCE_SUBTABLE_KEY] = cleanSub;
          }
          filtered[rid] = clean;
        }
        return jsonResp(filtered, 200, allowedOrigin);
      }

      // ============ Group G: getOwnProperties (ap15 sheet10, read-only) ============
      if (action === 'getOwnProperties') {
        let upstream, data;
        try {
          const resp = await ragicFetch(
            `https://ap15.ragic.com/wuohome/${AP15_OWN_SHEET}?api=true&v=3&naming=EID&filterId=103`,
            { headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY } }
          );
          const text = await resp.text();
          upstream = resp;
          try { data = JSON.parse(text); } catch { data = null; }
        } catch (e) {
          return jsonResp({ error: 'upstream_fetch_failed', msg: String(e) }, 502, allowedOrigin);
        }
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        if (!data || typeof data !== 'object') return jsonResp({ error: 'upstream_bad_json' }, 502, allowedOrigin);

        const filtered = {};
        for (const [rid, rec] of Object.entries(data)) {
          if (typeof rec !== 'object' || rec === null) continue;
          // Skip yongce mirror records (1002093='sync_ap16') - ap16 properties synced into ap15
          // for dual-tenant sync; shown via getYongceProperties to avoid map duplicates.
          if (rec['1002093'] === 'sync_ap16') continue;
          const clean = {};
          if (rec._ragicId !== undefined) clean._ragicId = rec._ragicId;
          for (const fid of OWN_PUBLIC_FIELD_IDS) {
            if (fid in rec) clean[fid] = rec[fid];
          }
          const subRaw = rec[OWN_SUBTABLE_KEY];
          if (subRaw && typeof subRaw === 'object') {
            const cleanSub = {};
            for (const [rowId, row] of Object.entries(subRaw)) {
              if (typeof row !== 'object' || row === null) continue;
              const cleanRow = {};
              for (const sf of OWN_SUBTABLE_PUBLIC) {
                if (sf in row) cleanRow[sf] = row[sf];
              }
              cleanSub[rowId] = cleanRow;
            }
            clean[OWN_SUBTABLE_KEY] = cleanSub;
          }
          filtered[rid] = clean;
        }
        return jsonResp(filtered, 200, allowedOrigin);
      }

      // ============ Group G: getAllianceProperties (ap15 sheet27, read-only) ============
      if (action === 'getAllianceProperties') {
        let upstream, data;
        try {
          const resp = await ragicFetch(
            `https://ap15.ragic.com/wuohome/${AP15_ALLIANCE_SHEET}?api=true&v=3&naming=EID&filterId=103`,
            { headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY } }
          );
          const text = await resp.text();
          upstream = resp;
          try { data = JSON.parse(text); } catch { data = null; }
        } catch (e) {
          return jsonResp({ error: 'upstream_fetch_failed', msg: String(e) }, 502, allowedOrigin);
        }
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        if (!data || typeof data !== 'object') return jsonResp({ error: 'upstream_bad_json' }, 502, allowedOrigin);

        const filtered = {};
        for (const [rid, rec] of Object.entries(data)) {
          if (typeof rec !== 'object' || rec === null) continue;
          const clean = {};
          if (rec._ragicId !== undefined) clean._ragicId = rec._ragicId;
          for (const fid of ALLIANCE_PUBLIC_FIELD_IDS) {
            if (fid in rec) clean[fid] = rec[fid];
          }
          filtered[rid] = clean;
        }
        return jsonResp(filtered, 200, allowedOrigin);
      }

      // ============ Group F2: getYongceAllianceProperties (ap15 sheet21 + filterId=104 + 享寓 merge) ============
      if (action === 'getYongceAllianceProperties') {
        // Helper: clean one record to public fields only
        const cleanAllianceRec = (rid, rec, companyOverride) => {
          const clean = {};
          if (rec._ragicId !== undefined) clean._ragicId = rec._ragicId;
          for (const fid of YONGCE_ALLIANCE_PUBLIC_FIELD_IDS) {
            if (fid in rec) clean[fid] = rec[fid];
          }
          // If company field missing (e.g. 享寓 records in operation/4 lack 1002009),
          // inject override so map.html coloring works correctly.
          if (companyOverride && !clean['1002009']) {
            clean['1002009'] = companyOverride;
          }
          const subRaw = rec[YONGCE_ALLIANCE_SUBTABLE_KEY];
          if (subRaw && typeof subRaw === 'object') {
            const cleanSub = {};
            for (const [rowId, row] of Object.entries(subRaw)) {
              if (typeof row !== 'object' || row === null) continue;
              const cleanRow = {};
              for (const sf of YONGCE_ALLIANCE_SUBTABLE_PUBLIC) {
                if (sf in row) cleanRow[sf] = row[sf];
              }
              cleanSub[rowId] = cleanRow;
            }
            clean[YONGCE_ALLIANCE_SUBTABLE_KEY] = cleanSub;
          }
          return clean;
        };

        // 1. Fetch 窩的家 alliance properties (sheet21 filterId=104)
        let upstream, data;
        try {
          const resp = await ragicFetch(
            `https://ap15.ragic.com/wuohome/${AP15_YONGCE_ALLIANCE_SHEET}?api=true&v=3&naming=EID&filterId=104`,
            { headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY } }
          );
          const text = await resp.text();
          upstream = resp;
          try { data = JSON.parse(text); } catch { data = null; }
        } catch (e) {
          return jsonResp({ error: 'upstream_fetch_failed', msg: String(e) }, 502, allowedOrigin);
        }
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        if (!data || typeof data !== 'object') return jsonResp({ error: 'upstream_bad_json' }, 502, allowedOrigin);

        const filtered = {};
        // address-based dedup set: prevents same property appearing from multiple Steps
        // (cross-Step rid-based dedup is ineffective: ap16/ap15 rids differ for same property)
        const seenAddrs = new Set();

        for (const [rid, rec] of Object.entries(data)) {
          if (typeof rec !== 'object' || rec === null) continue;
          const addr = (rec['1000055'] || '').trim();
          if (!addr) continue; // skip records with no address
          if (seenAddrs.has(addr)) continue;
          seenAddrs.add(addr);
          // Inject '窩的家' company name (1002009 is empty in sh21 filterId=104 records)
          filtered[rid] = cleanAllianceRec(rid, rec, '窩的家');
        }

        // 2. Fetch 享寓 properties from operation/4 (屋主編號=OWN-202606-189)
        // These records are blocked by Row Security in sheet21 listing but accessible via operation/4 where query.
        try {
          const xyResp = await ragicFetch(
            `https://ap15.ragic.com/wuohome/operation/4?api=true&v=3&naming=EID&where=1001301,eq,OWN-202606-189&limit=0,100`,
            { headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY } }
          );
          if (xyResp.ok) {
            const xyText = await xyResp.text();
            let xyData;
            try { xyData = JSON.parse(xyText); } catch { xyData = null; }
            if (xyData && typeof xyData === 'object') {
              for (const [rid, rec] of Object.entries(xyData)) {
                if (typeof rec !== 'object' || rec === null) continue;
                if (String(rid).startsWith('_')) continue;
                // All records fetched via 1001301=OWN-202606-189 are Xiangyu alliance objects.
                if (!rec['1000055']) continue;
                const addr = (rec['1000055'] || '').trim();
                if (seenAddrs.has(addr)) continue; // address-based dedup
                seenAddrs.add(addr);
                filtered[rid] = cleanAllianceRec(rid, rec, '享寓國際');
              }
            }
          }
        } catch (_e) {
          // 享寓 fetch failed — degrade gracefully, return 窩的家 records only
        }

        // 3. Fetch 心寓 properties from ap15 lease-management/5 (sheet27) where 1002009=心寓Room8
        // Sheet27 uses different field IDs than sheet21, so we map fields manually:
        //   1001914 (addr) → 1000055, 1001931 (coord) → 1000759, 1001896 (price) → 1000076
        //   1001894 (title) → 1000050, 1001895 (layout) → 1000063
        try {
          const xyuResp = await ragicFetch(
            `https://ap15.ragic.com/wuohome/lease-management/5?api=true&v=3&naming=EID&where=1002009,eq,心寓Room8&limit=0,50`,
            { headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY } }
          );
          if (xyuResp.ok) {
            const xyuText = await xyuResp.text();
            let xyuData;
            try { xyuData = JSON.parse(xyuText); } catch { xyuData = null; }
            if (xyuData && typeof xyuData === 'object') {
              for (const [rid, rec] of Object.entries(xyuData)) {
                if (typeof rec !== 'object' || rec === null) continue;
                if (String(rid).startsWith('_')) continue;
                const rawAddr = (rec['1001914'] || '').trim();
                if (!rawAddr) continue;
                if (seenAddrs.has(rawAddr)) continue; // address-based dedup
                seenAddrs.add(rawAddr);
                // Map sheet27 field IDs → sheet21 public field IDs for map.html consumption
                const mapped = {
                  '1000055': rawAddr,
                  '1000759': (rec['1001931'] || '').trim(),
                  '1000076': rec['1001896'] || '',
                  '1000050': rec['1001894'] || rawAddr,
                  '1000063': rec['1001895'] || '',
                  '1002009': '心寓Room8', // company override for map coloring
                };
                filtered['xinyu_' + rid] = mapped;
              }
            }
          }
        } catch (_e2) {
          // 心寓 fetch failed — degrade gracefully
        }

        // 4. Fetch 享寓 properties from ap16 YongCe property-data-kept/1 where team=享寓
        // (2026-07-08 fix: these 16 records live in ap16's own sheet alongside 永策,
        // never surfaced anywhere — getYongceProperties only keeps team='永策',
        // and the operation/4 享寓 fetch above (step 2) currently returns 0 rows).
        // ap16 uses its own field ID scheme (same as EID.* in map.html), different from
        // sheet21's public field IDs consumed by ALLIANCE_SOURCES — remap like 心寓 above.
        try {
          const xyu2Resp = await ragicFetch(
            `${AP16_BASE}/property-data-kept/1?api=true&v=3&naming=EID&where=1000114,eq,享寓&where=1000002,eq,代租中&limit=0,200`,
            { headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY } }
          );
          if (xyu2Resp.ok) {
            const xyu2Text = await xyu2Resp.text();
            let xyu2Data;
            try { xyu2Data = JSON.parse(xyu2Text); } catch { xyu2Data = null; }
            if (xyu2Data && typeof xyu2Data === 'object') {
              for (const [rid, rec] of Object.entries(xyu2Data)) {
                if (typeof rec !== 'object' || rec === null) continue;
                if (String(rid).startsWith('_')) continue;
                const rawAddr = (rec['1000011'] || '').trim();
                if (!rawAddr) continue;
                if (seenAddrs.has(rawAddr)) continue; // address-based dedup
                seenAddrs.add(rawAddr);
                // Map ap16 property-data-kept/1 field IDs → sheet21 public field IDs
                const mapped = {
                  '1000055': rawAddr,
                  '1000759': (rec['1000036'] || '').trim(),
                  '1000076': rec['1000030'] || '',
                  '1000050': rec['1000009'] || rawAddr,
                  '1000063': rec['1000047'] || '',
                  '1000060': rec['1000035'] || '',
                  '1000113': rec['1000027'] || '',
                  '1002009': '享寓國際', // company override for map coloring (MARKER_XIANGYU)
                };
                filtered['xiangyu_' + rid] = mapped;
              }
            }
          }
        } catch (_e3) {
          // 享寓 (ap16) fetch failed — degrade gracefully
        }

        return jsonResp(filtered, 200, allowedOrigin);
      }

      // ============ Group B: dashboard read-only ============
      if (SHEET_MAP[action] && action.startsWith('list')) {
        const sheet = SHEET_MAP[action];
        const allowWhere = (action === 'listIntake' || action === 'listPayments');
        const qs = buildPassthroughQuery(url, { allowWhere });
        const { upstream, data } = await getFromRagic(env, sheet, qs);
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        return jsonResp(data || {}, 200, allowedOrigin);
      }

      // ============ Group D: earnest async queue (Phase 1B) ============

      if (action === 'submitEarnestAsync') {
        const parsed = await processMultipart(request, allowedOrigin, EARNEST_FIELDS_WHITELIST, EARNEST_SIGNATURE_FIELDS);
        if (parsed.error) return parsed.error;
        if (!parsed.rid) return jsonResp({ error: 'missing_rid' }, 400, allowedOrigin);
        // IDOR root-fix 2026-07-16: this is the actual submit path earnest.html uses (sync
        // submitEarnest above is legacy/unused by current front-end) — write requires token
        // cross-validated against the target record's 1002558 before ever queuing to KV.
        if (!(await verifyEarnestToken(env, parsed.rid, parsed.token))) {
          return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);
        }

        // Extract fields from validated FormData into plain object for KV storage
        const fieldMap = {};
        for (const [key, value] of parsed.form.entries()) {
          if (value instanceof File) {
            // PDF field 1001709: convert to base64 data URI for KV persistence
            const buf = await value.arrayBuffer();
            const bytes = new Uint8Array(buf);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
            fieldMap[key] = 'data:application/pdf;base64,' + btoa(binary);
          } else {
            fieldMap[key] = value;
          }
        }

        // Best-effort operator name from Ragic earnest record
        let operatorName = null;
        try {
          const { data: rec } = await getRagicRecordById(env, 'payments/1', parsed.rid);
          const recName = rec?.['1000793']; // 經辦人員姓名
          const recUserId = rec?.['1002018']; // LINE userId
          if (recName) {
            operatorName = recName;
          } else if (recUserId) {
            operatorName = await lookupOperatorName(env, recUserId);
          }
        } catch {}

        const submissionId = crypto.randomUUID();
        const kvKey = KV_PREFIX + submissionId;

        const kvValue = {
          type: 'earnest',
          rid: parsed.rid,
          fields: fieldMap,
          operator_name: operatorName,
          status: 'pending',
          ragic_id: null,
          retry_count: 0,
          last_error: null,
          error_history: [],
          created_at: getNowIso(),
          completed_at: null,
        };

        const kvStr = JSON.stringify(kvValue);
        if (kvStr.length > 25 * 1024 * 1024) {
          return jsonResp({ error: 'submission_too_large', size: kvStr.length }, 413, allowedOrigin);
        }

        try {
          await env.EARNEST_QUEUE.put(kvKey, kvStr, { expirationTtl: KV_TTL_SECONDS });
        } catch (e) {
          return jsonResp({ error: 'queue_write_failed', msg: String(e) }, 503, allowedOrigin);
        }

        ctx.waitUntil(
          processEarnestSubmission(env, submissionId, parsed.rid, fieldMap, operatorName)
        );

        return jsonResp({ ok: true, submission_id: submissionId, status: 'queued' }, 200, allowedOrigin);
      }

      if (action === 'getSubmission') {
        const kvKey = KV_PREFIX + pathParam;
        let raw;
        try { raw = await env.EARNEST_QUEUE.get(kvKey); } catch (e) {
          return jsonResp({ error: 'kv_read_failed', msg: String(e) }, 503, allowedOrigin);
        }
        if (!raw) return jsonResp({ error: 'submission_not_found' }, 404, allowedOrigin);
        let val;
        try { val = JSON.parse(raw); } catch { return jsonResp({ error: 'kv_parse_error' }, 500, allowedOrigin); }
        return jsonResp(val, 200, allowedOrigin);
      }

      if (action === 'retrySubmission') {
        const kvKey = KV_PREFIX + pathParam;
        let raw;
        try { raw = await env.EARNEST_QUEUE.get(kvKey); } catch (e) {
          return jsonResp({ error: 'kv_read_failed', msg: String(e) }, 503, allowedOrigin);
        }
        if (!raw) return jsonResp({ error: 'submission_not_found' }, 404, allowedOrigin);
        let val;
        try { val = JSON.parse(raw); } catch { return jsonResp({ error: 'kv_parse_error' }, 500, allowedOrigin); }

        const { rid, fields } = val;
        if (!rid || !fields) return jsonResp({ error: 'submission_data_incomplete' }, 422, allowedOrigin);

        const result = await submitEarnestToRagic(env, rid, fields);
        const now = getNowIso();

        if (result.ok) {
          const updated = { ...val, status: 'success', ragic_id: result.ragicId, completed_at: now };
          try { await env.EARNEST_QUEUE.put(kvKey, JSON.stringify(updated), { expirationTtl: KV_TTL_SECONDS }); } catch {}
          return jsonResp({ ok: true, ragic_id: result.ragicId, status: 'success' }, 200, allowedOrigin);
        } else {
          const errEntry = { attempt: 'manual_retry', error: result.error, code: result.code, msg: result.msg, at: now };
          const updated = {
            ...val, status: 'failed_need_human', last_error: errEntry,
            error_history: [...(val.error_history || []), errEntry],
          };
          try { await env.EARNEST_QUEUE.put(kvKey, JSON.stringify(updated), { expirationTtl: KV_TTL_SECONDS }); } catch {}
          return jsonResp({ ok: false, error: result.error, code: result.code, msg: result.msg, status: 'failed_need_human' }, 200, allowedOrigin);
        }
      }

      if (action === 'markSubmissionManual') {
        const kvKey = KV_PREFIX + pathParam;
        let raw;
        try { raw = await env.EARNEST_QUEUE.get(kvKey); } catch (e) {
          return jsonResp({ error: 'kv_read_failed', msg: String(e) }, 503, allowedOrigin);
        }
        if (!raw) return jsonResp({ error: 'submission_not_found' }, 404, allowedOrigin);
        let val;
        try { val = JSON.parse(raw); } catch { return jsonResp({ error: 'kv_parse_error' }, 500, allowedOrigin); }

        const updated = { ...val, status: 'manual_processed', completed_at: getNowIso() };
        try {
          await env.EARNEST_QUEUE.put(kvKey, JSON.stringify(updated), { expirationTtl: KV_TTL_SECONDS });
        } catch (e) {
          return jsonResp({ error: 'kv_write_failed', msg: String(e) }, 503, allowedOrigin);
        }
        return jsonResp({ ok: true, status: 'manual_processed' }, 200, allowedOrigin);
      }

      if (action === 'listFailedSubmissions') {
        let keys;
        try {
          const listResult = await env.EARNEST_QUEUE.list({ prefix: KV_PREFIX });
          keys = listResult.keys || [];
        } catch (e) {
          return jsonResp({ error: 'kv_list_failed', msg: String(e) }, 503, allowedOrigin);
        }

        const ACTIVE_STATUSES = new Set(['failed_need_human', 'retrying', 'pending']);
        const results = [];

        for (const keyObj of keys) {
          let raw;
          try { raw = await env.EARNEST_QUEUE.get(keyObj.name); } catch { continue; }
          if (!raw) continue;
          let val;
          try { val = JSON.parse(raw); } catch { continue; }
          if (!ACTIVE_STATUSES.has(val.status)) continue;

          const submissionId = keyObj.name.slice(KV_PREFIX.length);
          results.push({
            submission_id: submissionId,
            earnest_no: val.fields?.['1000796'] || '',
            tenant_name: val.fields?.['1000792'] || '',
            operator_name: val.operator_name || '',
            status: val.status,
            last_error: val.last_error || null,
            retry_count: val.retry_count || 0,
            created_at: val.created_at || '',
          });
        }

        results.sort((a, b) => (b.created_at > a.created_at ? 1 : -1));
        return jsonResp({ submissions: results, total: results.length }, 200, allowedOrigin);
      }


      // ============ Group H: submitPerfGoal ============
      if (action === 'perf-goal') {
        let body;
        try { body = await request.json(); } catch { return jsonResp({ error: 'bad_json' }, 400, allowedOrigin); }
        const { name, department, month, goal, cases, lineUserId, submittedAt } = body || {};
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
          return jsonResp({ error: 'missing_name' }, 400, allowedOrigin);
        }
        if (goal === undefined || goal === null || String(goal).trim() === '') {
          return jsonResp({ error: 'missing_goal' }, 400, allowedOrigin);
        }
        // Resolve LINE userId: use frontend-supplied value if present,
        // otherwise look up operation/12 by name (fid 1002019 → fid 1002018).
        // Failure to resolve must NOT block the submission — fall back to empty string.
        let resolvedLineUserId = String(lineUserId || '').trim();
        if (!resolvedLineUserId) {
          try {
            const lookupQs = `naming=EID&where=1002077,eq,${encodeURIComponent(String(name).trim())}&limit=0,1`;
            const { upstream: lu, data: ld } = await getFromRagic(env, 'operation/12', lookupQs);
            if (lu.ok && ld && typeof ld === 'object') {
              const firstRecord = Object.values(ld)[0];
              if (firstRecord && firstRecord['1002018']) {
                resolvedLineUserId = String(firstRecord['1002018']).trim();
              }
            }
          } catch (_e) {
            // lookup failed — continue with empty userId, never block submission
          }
        }
        const params = new URLSearchParams();
        params.append('1002126', String(name).trim());
        params.append('1002127', String(department || '').trim());
        params.append('1002128', String(month || '').trim());
        params.append('1002129', String(goal).trim());
        params.append('1002130', String(cases ?? '').trim());
        params.append('1002131', String(submittedAt || '').trim());
        params.append('1002132', resolvedLineUserId);
        const { upstream, data } = await postUrlEncodedToRagic(env, 'shanshans/5', params.toString());
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp({ error: 'upstream_error', detail: fail, ragic: data }, 500, allowedOrigin);
        return jsonResp({ ok: true, ragic: data }, 200, allowedOrigin);
      }

      // ============ Group I: refund (payments/5) ============

      if (action === 'getRefund' || action === 'verifyRefund') {
        // v38 IDOR root-fix (mirrors v29 earnest / v30 payment-receipt): token is now the
        // ONLY credential. Legacy `?code=` (field 1002099) and `?rid=` are no longer
        // accepted at all — every pre-existing link using them was ALREADY a dead link
        // before this fix (the link-generation formula sends field 1002101's value while
        // this action used to query field 1002099 — the two never matched — see 交付摘要
        // for the full incident note), so there is no live traffic to stay compatible with.
        // This also removes the old rid-branch's call to getRagicRecordById(.json), which
        // is the same BATCH-LIST-leak class of bug v30 fixed for payments/2 (`.json` suffix
        // triggers Ragic's batch behavior, not single-record) — payments/5 never got hit in
        // practice only because the dead-link mismatch above meant nobody could reach it.
        const tokenParam = url.searchParams.get('token');
        if (!tokenParam) return jsonResp({ error: 'missing_param' }, 400, allowedOrigin);
        if (!validHardenedToken(tokenParam)) return jsonResp({ error: 'invalid_token' }, 400, allowedOrigin);
        const tokenQs = `naming=EID&where=1003156,eq,${encodeURIComponent(tokenParam)}&limit=0,1`;
        const { upstream: tu, data: td } = await getFromRagic(env, 'payments/5', tokenQs);
        if (!tu.ok) return jsonResp({ error: 'upstream_error', code: tu.status }, 502, allowedOrigin);
        const keys = Object.keys(td || {});
        if (keys.length === 0) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);
        const rid = String(keys[0]);
        const record = td[rid] || Object.values(td)[0];
        return jsonResp({ _rid: rid, ...record }, 200, allowedOrigin);
      }

      if (action === 'submitRefund') {
        const ct = request.headers.get('Content-Type') || '';
        if (!ct.toLowerCase().startsWith('multipart/form-data')) {
          return jsonResp({ error: 'expect_multipart' }, 400, allowedOrigin);
        }
        let form;
        try { form = await request.formData(); } catch { return jsonResp({ error: 'bad_multipart' }, 400, allowedOrigin); }
        const entries = Array.from(form.entries());
        if (entries.length === 0) return jsonResp({ error: 'empty_fields' }, 400, allowedOrigin);
        let rid = null;
        let token = null;
        const newForm = new FormData();
        for (const [key, value] of entries) {
          if (key === '_rid' || key === 'rid') {
            if (typeof value !== 'string' || !/^\d{1,12}$/.test(value)) {
              return jsonResp({ error: 'invalid_rid' }, 400, allowedOrigin);
            }
            rid = value;
            continue;
          }
          if (key === 'token') {
            // v38 IDOR root-fix: not written to Ragic — consumed below to cross-validate
            // against the target record's 1003156 before allowing the write (mirrors
            // submitEarnest/submitPaymentReceipt's token handling in processMultipart()).
            if (typeof value !== 'string' || !validHardenedToken(value)) {
              return jsonResp({ error: 'invalid_token' }, 400, allowedOrigin);
            }
            token = value;
            continue;
          }
          const m = /^(\d{7})(?:_(\d{1,3}))?$/.exec(key);
          if (!m) return jsonResp({ error: 'invalid_field_format', key }, 400, allowedOrigin);
          const fid = m[1];
          if (!REFUND_FIELDS_WHITELIST.has(fid)) return jsonResp({ error: 'invalid_field', key, fid }, 400, allowedOrigin);
          if (value instanceof File) {
            if (value.size > 5 * 1024 * 1024) return jsonResp({ error: 'file_too_large', key, size: value.size }, 400, allowedOrigin);
            newForm.append(key, value, value.name);
          } else {
            const strVal = typeof value === 'string' ? value : String(value);
            const limit = REFUND_SIGNATURE_FIELDS.has(fid) ? (2 * 1024 * 1024) : 5000;
            if (strVal.length > limit) return jsonResp({ error: 'value_too_long', key, len: strVal.length, limit }, 400, allowedOrigin);
            newForm.append(key, strVal);
          }
        }
        if (!rid) return jsonResp({ error: 'missing_rid' }, 400, allowedOrigin);
        // v38 IDOR root-fix: payments/5 previously had NO ownership check on this write
        // path at all (payments/1/2 got theirs in v29/v30) — closes the "submit into
        // someone else's refund record" hole, which is worse here because the record
        // contains bank account details.
        if (!(await verifyRefundToken(env, rid, token))) {
          return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);
        }
        const ragicUrl = `${env.RAGIC_BASE}/payments/5/${rid}?api&v=3`;
        const upstream = await ragicFetch(ragicUrl, {
          method: 'POST',
          headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY },
          body: newForm,
        });
        const text = await upstream.text();
        let data = null;
        try { data = JSON.parse(text); } catch {}
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true, ragicId: data?.ragicId || rid }, 200, allowedOrigin);
      }

      // ============ Group J: getToss591 — 591拋轉刊登包 (read-only, single record) ============
      if (action === 'getToss591') {
        const rid = url.searchParams.get('rid');
        if (!rid || !validRid(rid)) return jsonResp({ error: 'invalid_rid' }, 400, allowedOrigin);
        // Fetch single record with naming=EID so keys are field IDs
        const tossUpstream = await ragicFetch(
          `${env.RAGIC_BASE}/property-data-kept/10/${rid}?api=true&v=3&naming=EID&subtables=0`,
          { headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY } }
        );
        const tossText = await tossUpstream.text();
        let tossRaw = null;
        try { tossRaw = JSON.parse(tossText); } catch {}
        const upstream = tossUpstream;
        const data = tossRaw;
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        if (!data || Object.keys(data).length === 0) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);
        // Unwrap: Ragic single-record GET returns {"<rid>": {fields}} — must unwrap one level
        const rawRec = data[rid] || data[String(rid)] || Object.values(data)[0] || {};
        // Return only the fields needed for toss591 listing pack
        const TOSS591_FIELDS = [
          '1000050', // 案名
          '1000055', // 地址
          '1000076', // 月租金
          '1000059', // 登記坪數
          '1000058', // 主建坪數
          '1000063', // 格局
          '1000072', // 特色說明
          '1002134', // 591拋轉碼
          '1002135', // 591刊登標題
        ];
        const clean = { _rid: rid };
        for (const fid of TOSS591_FIELDS) {
          if (fid in rawRec) clean[fid] = rawRec[fid];
        }
        return jsonResp(clean, 200, allowedOrigin);
      }

      // ============ Group K: check591Collision â 591æå®é·é (extension, token-gated) ============
      if (action === 'check591Collision') {
        // Token gate
        const token = request.headers.get('X-WH-Token');
        if (!token || token !== env.WH_EXT_TOKEN) {
          return new Response(JSON.stringify({ error: 'forbidden' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        let body591;
        try {
          // Use arrayBuffer + TextDecoder to force UTF-8 decoding (avoids CF json() charset ambiguity)
          const buf = await request.arrayBuffer();
          const text = new TextDecoder('utf-8').decode(buf);
          body591 = JSON.parse(text);
        } catch { return jsonResp({ error: 'bad_json' }, 400, allowedOrigin); }
        const id591 = (body591 && body591.id591 ? String(body591.id591) : '').trim();
        const addr  = (body591 && body591.addr  ? String(body591.addr)  : '').trim();

        if (!id591 || !/^\d{5,12}$/.test(id591)) {
          return jsonResp({ error: 'invalid_id591' }, 400, allowedOrigin);
        }

        const ragicBase = env.RAGIC_BASE;
        const ragicKey  = env.RAGIC_KEY;

        // Build Ragic query URLs using URL object + searchParams to avoid CF fetch URL re-encoding issues.
        // Ragic where format: '1000055,like,value' — searchParams.set encodes the full string correctly.

        function ragicUrl(base, sheet, params) {
          const u = new URL(base + '/' + sheet);
          for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
          return u.toString();
        }

        // Query A: sheet10, 591é£çµ (1000113) like id591 — subtables=0 for full fields
        const urlA = ragicUrl(ragicBase, 'property-data-kept/10', { api: 'true', naming: 'EID', subtables: '0', where: '1000113,like,' + id591 });
        const qA = ragicFetch(urlA, { headers: { Authorization: 'Basic ' + ragicKey } })
          .then(function(r){ return r.json(); }).catch(function(){ return {}; });

        // Query B: sheet10, å°å (1000055) like addr — subtables=0, searchParams handles CJK encoding
        const urlB = addr ? ragicUrl(ragicBase, 'property-data-kept/10', { api: 'true', naming: 'EID', subtables: '0', where: '1000055,like,' + addr }) : null;
        const qB = urlB
          ? ragicFetch(urlB, { headers: { Authorization: 'Basic ' + ragicKey } })
              .then(function(r){ return r.json(); }).catch(function(){ return {}; })
          : Promise.resolve({});

        // Query C: sheet17, ææ591é£çµ (1002233) like id591 — Basic Auth returns 106, use APIKey param
        const urlC = ragicUrl(ragicBase, 'property-data-kept/17', { api: 'true', naming: 'EID', subtables: '0', where: '1002233,like,' + id591, APIKey: ragicKey });
        const qC = ragicFetch(urlC)
          .then(function(r){ return r.json(); }).catch(function(){ return {}; });

        // Query D: sheet17, å½æ´å°å (1000903) like addr
        const urlD = addr ? ragicUrl(ragicBase, 'property-data-kept/17', { api: 'true', naming: 'EID', subtables: '0', where: '1000903,like,' + addr, APIKey: ragicKey }) : null;
        const qD = urlD
          ? ragicFetch(urlD)
              .then(function(r){ return r.json(); }).catch(function(){ return {}; })
          : Promise.resolve({});

        const results = await Promise.all([qA, qB, qC, qD]);
        const resA = results[0], resB = results[1], resC = results[2], resD = results[3];

        // Parse sheet10 â kept[]
        // 1000707=çæ, 1001313=è² è²¬äºº1 email, 1000055=å°å, 1000113=591é£çµ
        const kept = [];
        const seenKeptRid = new Set();
        const sheet10Entries = Object.assign({}, resA, resB);
        for (const rid in sheet10Entries) {
          if (rid === '_total' || rid === '_max') continue;
          const rec = sheet10Entries[rid];
          if (!rec || typeof rec !== 'object') continue;
          if (seenKeptRid.has(rid)) continue;
          seenKeptRid.add(rid);
          const link591 = rec['1000113'] || '';
          const matchType = link591.indexOf(id591) >= 0 ? 'id' : 'addr';
          kept.push({
            match:   matchType,
            status:  rec['1000707'] || '',
            owner:   rec['1001313'] || '',
            address: rec['1000055'] || '',
          });
        }

        // Parse sheet17 â dev[]
        // 1000876=å±ä¸»çæ, 1000897=ä¸»è¦éç¼äºº email, 1000903=å½æ´å°å
        const dev = [];
        const seenDevRid = new Set();
        const sheet17Entries = Object.assign({}, resC, resD);
        for (const rid in sheet17Entries) {
          if (rid === '_total' || rid === '_max') continue;
          const rec = sheet17Entries[rid];
          if (!rec || typeof rec !== 'object') continue;
          if (seenDevRid.has(rid)) continue;
          seenDevRid.add(rid);
          const links591 = rec['1002233'] || '';
          const matchType = links591.indexOf(id591) >= 0 ? 'id' : 'addr';
          dev.push({
            match:       matchType,
            ownerStatus: rec['1000876'] || '',
            developer:   rec['1000897'] || '',
            addresses:   rec['1000903'] || '',
          });
        }

        return jsonResp({ kept, dev }, 200, allowedOrigin);
      }

      // ============ Group L: registerDevelopment — 一鍵登記開發 (token-gated, Joan-only in testing) ============
      if (action === 'registerDevelopment') {
        // Token gate — bare Response (not jsonResp): token-gated path is NOT a CORS path
        const tokenJoan = request.headers.get('X-WH-Token');
        if (!tokenJoan || tokenJoan !== env.WH_EXT_TOKEN_JOAN) {
          return new Response('403 Forbidden', { status: 403 });
        }

        // Parse body (arrayBuffer + TextDecoder — avoids CF json() UTF-8 ambiguity for CJK)
        let rbody;
        try {
          const rbuf = await request.arrayBuffer();
          const rtxt = new TextDecoder('utf-8').decode(rbuf);
          rbody = JSON.parse(rtxt);
        } catch { return new Response('400 bad_json', { status: 400 }); }

        // Field whitelist — only these 5 IDs are accepted
        const ALLOWED_FIELD_IDS_RD = new Set(['1000262', '1001642', '1000897', '1000633_-1', '1000636_-1']);
        const FIELD_ID_RE_RD = /^\d{7}(?:_-?\d{1,3})?$/;

        const { ownerName, phone, developerEmail, link591, address, id591 } = rbody || {};

        // Check required fields
        if (!ownerName || !developerEmail || !link591 || !address || !id591) {
          return new Response(JSON.stringify({ error: 'missing_required_fields' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
          });
        }

        const writeFields = {
          '1000262': String(ownerName).slice(0, 50),        // 屋主名
          '1001642': String(phone || '').slice(0, 30),      // 電話(轉接號)
          '1000897': String(developerEmail).slice(0, 100),  // 開發人 email
          '1000633_-1': String(link591).slice(0, 255),      // 子表: 591連結
          '1000636_-1': String(address).slice(0, 200),      // 子表: 地址
        };

        // Validate field IDs against whitelist (defensive)
        for (const fid of Object.keys(writeFields)) {
          if (!FIELD_ID_RE_RD.test(fid) || !ALLOWED_FIELD_IDS_RD.has(fid)) {
            return new Response(JSON.stringify({ error: 'invalid_field_id', field: fid }), {
              status: 400, headers: { 'Content-Type': 'application/json' }
            });
          }
        }

        const ragicBaseRD = env.RAGIC_BASE;
        const ragicKeyRD  = env.RAGIC_KEY;

        // ── Backend collision self-check (do NOT trust any frontend flag) ──
        function ragicUrlRD(base, sheet, params) {
          const u = new URL(base + '/' + sheet);
          for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
          return u.toString();
        }

        let collisionDeveloper = null;
        try {
          const id591str = String(id591).trim();
          // Check sheet17 dev records (1002233 = 所有591連結 formula col)
          const urlRDC = ragicUrlRD(ragicBaseRD, 'property-data-kept/17', {
            api: 'true', naming: 'EID', subtables: '0',
            where: '1002233,like,' + id591str, APIKey: ragicKeyRD
          });
          // Check sheet10 kept records (1000113 = 591連結)
          const urlRDA = ragicUrlRD(ragicBaseRD, 'property-data-kept/10', {
            api: 'true', naming: 'EID', subtables: '0',
            where: '1000113,like,' + id591str
          });
          const [resRDC, resRDA] = await Promise.all([
            ragicFetch(urlRDC).then(r => r.json()).catch(() => ({})),
            ragicFetch(urlRDA, { headers: { Authorization: 'Basic ' + ragicKeyRD } }).then(r => r.json()).catch(() => ({})),
          ]);
          // sheet17: 1000897 = 開發人 email
          for (const rid in resRDC) {
            if (rid === '_total' || rid === '_max') continue;
            const rec = resRDC[rid];
            if (!rec || typeof rec !== 'object') continue;
            const existingDev = rec['1000897'] || '';
            if (existingDev && existingDev !== developerEmail) {
              collisionDeveloper = existingDev;
              break;
            }
          }
          // sheet10: 1001313 = 負責人1 email
          if (!collisionDeveloper) {
            for (const rid in resRDA) {
              if (rid === '_total' || rid === '_max') continue;
              const rec = resRDA[rid];
              if (!rec || typeof rec !== 'object') continue;
              const existingOwner = rec['1001313'] || '';
              if (existingOwner && existingOwner !== developerEmail) {
                collisionDeveloper = existingOwner;
                break;
              }
            }
          }
        } catch (e) { /* collision check failure is non-fatal, proceed with write */ }

        // ── Write to sheet 17 ──
        // Note: Basic Auth returns 106 for /17; must use URL param APIKey (§3 坑)
        const writeUrlRD = new URL(ragicBaseRD + '/property-data-kept/17');
        writeUrlRD.searchParams.set('api', 'true');
        writeUrlRD.searchParams.set('APIKey', ragicKeyRD);
        const params17 = new URLSearchParams();
        for (const [fid, val] of Object.entries(writeFields)) {
          params17.set(fid, val);
        }

        let ragicId = null;
        let writeOk = false;
        try {
          const writeRes = await ragicFetch(writeUrlRD.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params17.toString(),
          });
          const writeData = await writeRes.json().catch(() => ({}));
          if (writeData && writeData.ragicId) {
            ragicId = String(writeData.ragicId);
            writeOk = true;
          } else if (writeData && writeData.status === 'SUCCESS') {
            writeOk = true;
          }
        } catch (e) {
          return new Response(JSON.stringify({ error: 'write_failed', detail: String(e) }), {
            status: 502, headers: { 'Content-Type': 'application/json' }
          });
        }

        if (!writeOk) {
          return new Response(JSON.stringify({ error: 'ragic_write_failed' }), {
            status: 502, headers: { 'Content-Type': 'application/json' }
          });
        }

        // ── Non-blocking Telegram notification on collision ──
        // Decoupled from write: failure here does NOT roll back registration
        if (collisionDeveloper) {
          const nowRD = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
          const tgLines = [
            '🚨 <b>撞單登記</b>',
            '',
            '登記人：' + escapeHtml(developerEmail),
            '591 連結：' + escapeHtml(link591),
            '地址：' + escapeHtml(address),
            '原開發人：' + escapeHtml(collisionDeveloper),
            '時間：' + nowRD,
          ];
          if (ragicId) tgLines.push('開發募集 ID：' + ragicId);
          const tgTextRD = tgLines.join('\n');
          ctx.waitUntil(
            sendTelegramMessage(env, tgTextRD, ragicId || 'collision').catch(() => {})
          );
        }

        return new Response(JSON.stringify({
          ok: true,
          ragicId,
          collision: collisionDeveloper ? { existingDeveloper: collisionDeveloper } : null,
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }


      // ============ Group M: checkRagicEmail — validate Ragic login email ============
      if (action === 'checkRagicEmail') {
        const emailParam = url.searchParams.get('email');
        if (!emailParam || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailParam) || emailParam.length > 100) {
          return jsonResp({ error: 'invalid_email' }, 400, allowedOrigin);
        }
        // Admin whitelist: Ragic system accounts that are valid but not in ragic-setup/5 staff list
        // ponytail-debt: 將來正式上線時如 JoanDevAgent 仍做測試，考慮加進 ragic-setup/5 staff 表
        const ADMIN_EMAIL_WHITELIST = ['JoanDevAgent@gmail.com'];
        if (ADMIN_EMAIL_WHITELIST.some(e => e.toLowerCase() === emailParam.toLowerCase())) {
          return jsonResp({ valid: true, displayName: 'AI工程師（管理員）' }, 200, allowedOrigin);
        }
        // Query ragic-setup/5 field 1 (Ragic login email = Google email)
        const ragicBase = env.RAGIC_BASE;
        const ragicKey  = env.RAGIC_KEY;
        const u = new URL(ragicBase + '/ragic-setup/5');
        u.searchParams.set('api', 'true');
        u.searchParams.set('naming', 'EID');
        u.searchParams.set('limit', '1');
        u.searchParams.set('where', '1,eq,' + emailParam);
        let setupData = {};
        try {
          const res = await ragicFetch(u.toString(), { headers: { Authorization: 'Basic ' + ragicKey } });
          setupData = await res.json().catch(() => ({}));
        } catch (e) {
          return jsonResp({ error: 'upstream_error' }, 502, allowedOrigin);
        }
        const rids = Object.keys(setupData).filter(k => k !== '_total' && k !== '_max');
        if (rids.length > 0) {
          const rec = setupData[rids[0]];
          const displayName = rec ? (rec['4'] || '') : '';
          return jsonResp({ valid: true, displayName }, 200, allowedOrigin);
        }
        return jsonResp({ valid: false }, 200, allowedOrigin);
      }

      // ============ Group N2: searchStaff — 取在職業務員清單供 payment-create.html 使用 ============
      if (action === 'searchStaff') {
        const u = new URL(env.RAGIC_BASE + '/ragicforms4/20004');
        u.searchParams.set('api', 'true');
        u.searchParams.set('v', '3');
        u.searchParams.set('naming', 'EID');
        u.searchParams.set('limit', '0,200');
        u.searchParams.set('where', '3000945,eq,在職');
        let staffData = {};
        try {
          const res = await ragicFetch(u.toString(), {
            headers: { Authorization: 'Basic ' + env.RAGIC_KEY }
          });
          staffData = await res.json().catch(() => ({}));
        } catch (e) {
          return jsonResp({ error: 'upstream_error' }, 502, allowedOrigin);
        }
        const rids = Object.keys(staffData).filter(k => k !== '_total' && k !== '_max');
        const staff = rids.map(rid => {
          const rec = staffData[rid];
          return {
            rid: Number(rid),
            name: rec['3000933'] || '',
            englishName: rec['3000947'] || '',
            dept: rec["3000937"] || "",
            email: rec["3000976"] || "",
            phone: rec["3000975"] || ""
          };
        }).filter(s => s.name);
        staff.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
        return jsonResp({ ok: true, staff }, 200, allowedOrigin);
      }

      // ============ Group N3: searchDeposits ============
      if (action === 'searchDeposits') {
        const q = (url.searchParams.get('q') || '').trim().slice(0, 50);
        if (!q) return jsonResp({ ok: true, deposits: [] }, 200, allowedOrigin);
        const fetchDep = async (fid, val) => {
          const uu = new URL(env.RAGIC_BASE + '/payments/1');
          uu.searchParams.set('api', 'true');
          uu.searchParams.set('v', '3');
          uu.searchParams.set('naming', 'EID');
          uu.searchParams.set('limit', '0,100');
          uu.searchParams.set('where', fid + ',like,' + val);
          const res = await ragicFetch(uu.toString(), { headers: { Authorization: 'Basic ' + env.RAGIC_KEY } });
          return res.json().catch(() => ({}));
        };
        let dMap = {};
        try {
          const [byNo, byName] = await Promise.all([fetchDep('1000796', q), fetchDep('1000792', q)]);
          for (const src of [byNo, byName]) {
            for (const [rid, rec] of Object.entries(src)) {
              if (rid === '_total' || rid === '_max' || typeof rec !== 'object') continue;
              dMap[rid] = rec;
            }
          }
        } catch (e) {
          return jsonResp({ error: 'upstream_error' }, 502, allowedOrigin);
        }
        const deposits = Object.entries(dMap).map(([rid, rec]) => ({
          rid: Number(rid),
          depositNo:   rec['1000796'] || '',
          caseName:    rec['1000790'] || '',
          tenantName:  rec['1000792'] || '',
          tenantPhone: rec['1000808'] || '',
          earnestAmt:  Number(rec['1000832'] || 0),
        })).filter(d => d.depositNo);
        deposits.sort((a, b) => b.rid - a.rid);
        return jsonResp({ ok: true, deposits }, 200, allowedOrigin);
      }

            // ============ Group N: searchCases — 取在管物件清單供 payment-create.html 使用 ============
      if (action === 'searchCases') {
        const q = (url.searchParams.get('q') || '').trim().slice(0, 50);
        const u = new URL(env.RAGIC_BASE + '/operation/4');
        u.searchParams.set('api', 'true');
        u.searchParams.set('v', '3');
        u.searchParams.set('naming', 'EID');
        u.searchParams.set('limit', '0,200');
        // filter: 狀態=代租中
        u.searchParams.set('where', '1000707,eq,代租中');
        let casesData = {};
        try {
          const res = await ragicFetch(u.toString(), {
            headers: { Authorization: 'Basic ' + env.RAGIC_KEY }
          });
          casesData = await res.json().catch(() => ({}));
        } catch (e) {
          return jsonResp({ error: 'upstream_error' }, 502, allowedOrigin);
        }
        const rids = Object.keys(casesData).filter(k => k !== '_total' && k !== '_max');
        let cases = rids.map(rid => {
          const rec = casesData[rid];
          return {
            rid: Number(rid),
            name: rec['1000050'] || '',
            address: rec['1000055'] || ''
          };
        }).filter(c => c.name);
        // if search query provided, filter client-side
        if (q) {
          const ql = q.toLowerCase();
          cases = cases.filter(c =>
            c.name.toLowerCase().includes(ql) ||
            c.address.toLowerCase().includes(ql)
          );
        }
        cases.sort((a, b) => b.rid - a.rid); // newest first
        return jsonResp({ ok: true, cases }, 200, allowedOrigin);
      }

      // ============ Group O: createDeposit — deposit.html quick-create (payments/1) ============
      if (action === 'createDeposit') {
        let body;
        try { body = await request.json(); } catch { return jsonResp({ error: 'bad_json' }, 400, allowedOrigin); }
        const fields = body?.fields;
        if (!fields || typeof fields !== 'object') return jsonResp({ error: 'missing_fields' }, 400, allowedOrigin);
        const fieldKeys = Object.keys(fields);
        if (fieldKeys.length === 0) return jsonResp({ error: 'empty_fields' }, 400, allowedOrigin);

        // Build URLSearchParams with whitelist-filtered fields only; unknown EIDs are silently dropped.
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(fields)) {
          if (!DEPOSIT_FIELDS_WHITELIST.has(k)) continue; // drop unknown EIDs silently
          const strVal = String(v == null ? '' : v);
          if (strVal.length > 5000) return jsonResp({ error: 'value_too_long', key: k, len: strVal.length }, 400, allowedOrigin);
          params.append(k, strVal);
        }
        if (params.toString().length === 0) return jsonResp({ error: 'no_valid_fields' }, 400, allowedOrigin);

        // Generate UUID token for IDOR fix (2026-06-22)
        // Written to field 1002558 (定金 token). Unguessable, used in getEarnest?token= branch.
        const depositToken = crypto.randomUUID();
        params.append('1002558', depositToken);

        // Force-inject 選擇群組 (1001815) — repeated key = multi-select in Ragic.
        // Never read from frontend; ensures group permission isolation is always set.
        params.append('1001815', 'X-User');
        params.append('1001815', 'X-租賃部');

        // POST to payments/1 (no record id = new record)
        // doLinkLoad=first: execute Link&Load before formula; doFormula=true: compute formula fields (e.g. 1002057) at write time
        const { upstream, data } = await postUrlEncodedToRagic(env, 'payments/1', params.toString(), 'doLinkLoad=first&doFormula=true');
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp({ status: 'ERROR', msg: fail.msg || fail.error || 'upstream_error' }, 502, allowedOrigin);

        const ragicId = data?.ragicId;
        if (!ragicId) return jsonResp({ status: 'ERROR', msg: 'no_ragicId_in_response', raw: data }, 502, allowedOrigin);

        // Read back the new record to get auto-generated 定金單編號 (EID 1000796)
        let depositNo = '';
        try {
          const { upstream: ru, data: rd } = await getFromRagic(env, `payments/1/${ragicId}`, 'naming=EID');
          if (ru.ok && rd && typeof rd === 'object') {
            const rec = rd[String(ragicId)] || Object.values(rd)[0] || {};
            depositNo = String(rec['1000796'] || '');
          }
        } catch { /* depositNo stays '' if read-back fails */ }

        return jsonResp({ status: 'SUCCESS', ragicId, depositNo, depositToken }, 200, allowedOrigin);
      }

      // ============ Group Q: service-fee.html — Esther 自助請款（固定連結） ============
      // GET: 用 token 反查是否已登記過（決定前端顯示完整表單 or 簡易表單）
      if (action === 'getServiceFeeIdentity') {
        const token = url.searchParams.get('token');
        if (!validUuid(token)) return jsonResp({ error: 'invalid_token' }, 400, allowedOrigin);
        const qs = `naming=EID&where=${SERVICE_FEE_TOKEN_FIELD},eq,${encodeURIComponent(token)}&limit=0,1`;
        const { upstream, data } = await getFromRagic(env, SERVICE_FEE_VENDOR_SHEET, qs);
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        const records = Object.values(data || {});
        if (records.length === 0) return jsonResp({ exists: false }, 200, allowedOrigin);
        return jsonResp({ exists: true, name: records[0]['1000279'] || '' }, 200, allowedOrigin);
      }

      // POST multipart: mode=first（首次，含 KYC+銀行）或 mode=recurring（僅金額+期間）
      // 一律：(1) 解析廠商身分 (2) 建/沿用 decorating/4 廠商 (3) 建 finance2/5 訂單+子表+PDF附件
      //       (4) 第二次 POST 補銀行欄位（Link&Load 不會 API write 後自動觸發）(5) 讀回驗證
      if (action === 'createServiceFeeOrder') {
        const ct = request.headers.get('Content-Type') || '';
        if (!ct.toLowerCase().startsWith('multipart/form-data')) {
          return jsonResp({ error: 'expect_multipart' }, 400, allowedOrigin);
        }
        let form;
        try { form = await request.formData(); } catch { return jsonResp({ error: 'bad_multipart' }, 400, allowedOrigin); }

        const token = form.get('token');
        const mode = form.get('mode');
        if (!validUuid(token)) return jsonResp({ error: 'invalid_token' }, 400, allowedOrigin);
        if (mode !== 'first' && mode !== 'recurring') return jsonResp({ error: 'invalid_mode' }, 400, allowedOrigin);

        const itemName = form.get('itemName');
        // 2026-07-14：服務期間改起訖兩欄位（YYYY/MM/DD，比照既有 validDateStr 慣例），伺服器端組成顯示字串，
        // 不再信任前端傳單一 servicePeriod 自由文字（回訪模式簡化，見規格書「回訪模式」段）
        const serviceStartRaw = form.get('serviceStart');
        const serviceEndRaw = form.get('serviceEnd');
        const amountRaw = form.get('amount');
        const taxRaw = form.get('tax');
        const healthRaw = form.get('health');
        const netRaw = form.get('netAmount');
        const nationality = (typeof form.get('nationality') === 'string' && form.get('nationality').trim()) ? form.get('nationality').trim().slice(0, 20) : '中華民國';
        const pdfFile = form.get('pdf');

        if (!validSfText(itemName, 50)) return jsonResp({ error: 'invalid_itemName' }, 400, allowedOrigin);
        if (!validDateStr(serviceStartRaw)) return jsonResp({ error: 'invalid_serviceStart' }, 400, allowedOrigin);
        if (!validDateStr(serviceEndRaw)) return jsonResp({ error: 'invalid_serviceEnd' }, 400, allowedOrigin);
        if (serviceEndRaw.replace(/\//g, '') < serviceStartRaw.replace(/\//g, '')) {
          return jsonResp({ error: 'service_end_before_start' }, 400, allowedOrigin);
        }
        const servicePeriod = `${serviceStartRaw} ~ ${serviceEndRaw}`;
        if (!validSfAmount(amountRaw) || !validSfAmount(taxRaw) || !validSfAmount(healthRaw) || !validSfAmount(netRaw)) {
          return jsonResp({ error: 'invalid_amount' }, 400, allowedOrigin);
        }
        const amount = Number(amountRaw), tax = Number(taxRaw), health = Number(healthRaw), net = Number(netRaw);
        // 輕量一致性檢查（四個數字內部要自洽，防壞資料）
        if (Math.abs((amount - tax - health) - net) > 1) return jsonResp({ error: 'amount_mismatch' }, 400, allowedOrigin);
        // 2026-07-14 P1 稅額規則修復後新增：伺服器端重算稅額規則本身（不只信任前端算得自洽），防同一類
        // 「稅率規則本身算錯」的 bug 未來再度發生卻沒人抓到（2026-07-14 事故：Esther 真實案例 $16,994 被誤扣
        // $1,699，因為錯用「floor(金額*10%)>2000 才免扣」，該用「金額>20,000 才起扣」判斷）。
        // 執行業務所得(9A) 扣繳率10%：給付額>20,000 才起扣，起扣後稅額=round(金額*10%)；
        // 免扣門檻用「給付額」本身判斷，不能用「floor 後的稅額」判斷（否則 20,001~20,009 會被誤判免扣）。
        // 二代健保補充保費2.11%：給付額≥20,000 才扣（此規則本來就對，維持不動）。
        const expectedTax = amount > 20000 ? Math.round(amount * 0.10) : 0;
        const expectedHealth = amount >= 20000 ? Math.round(amount * 0.0211) : 0;
        if (Math.abs(tax - expectedTax) > 1) return jsonResp({ error: 'tax_mismatch', expected: expectedTax, got: tax }, 400, allowedOrigin);
        if (Math.abs(health - expectedHealth) > 1) return jsonResp({ error: 'health_mismatch', expected: expectedHealth, got: health }, 400, allowedOrigin);
        if (!(pdfFile instanceof File)) return jsonResp({ error: 'missing_pdf' }, 400, allowedOrigin);
        if (pdfFile.size > SERVICE_FEE_MAX_PDF_BYTES) return jsonResp({ error: 'file_too_large', size: pdfFile.size }, 400, allowedOrigin);

        // 身分證正反面 + 存摺封面照片：僅 mode=first 需要（KYC 一次性資料，回訪不需要重傳，
        // 銀行/身分資料已在 decorating/4 主檔上）。驗證放在任何寫入動作之前，避免漏傳照片時
        // 已經半途建了廠商/訂單記錄。
        let idFrontPhoto = null, idBackPhoto = null, bankbookPhoto = null;
        if (mode === 'first') {
          idFrontPhoto = form.get('idFrontPhoto');
          idBackPhoto = form.get('idBackPhoto');
          bankbookPhoto = form.get('bankbookPhoto');
          if (!(idFrontPhoto instanceof File)) return jsonResp({ error: 'missing_id_front_photo' }, 400, allowedOrigin);
          if (!(idBackPhoto instanceof File)) return jsonResp({ error: 'missing_id_back_photo' }, 400, allowedOrigin);
          if (!(bankbookPhoto instanceof File)) return jsonResp({ error: 'missing_bankbook_photo' }, 400, allowedOrigin);
          if (idFrontPhoto.size > SERVICE_FEE_MAX_PHOTO_BYTES) return jsonResp({ error: 'file_too_large', key: 'idFrontPhoto', size: idFrontPhoto.size }, 400, allowedOrigin);
          if (idBackPhoto.size > SERVICE_FEE_MAX_PHOTO_BYTES) return jsonResp({ error: 'file_too_large', key: 'idBackPhoto', size: idBackPhoto.size }, 400, allowedOrigin);
          if (bankbookPhoto.size > SERVICE_FEE_MAX_PHOTO_BYTES) return jsonResp({ error: 'file_too_large', key: 'bankbookPhoto', size: bankbookPhoto.size }, 400, allowedOrigin);
        }

        // ---- 解析/建立廠商身分 ----
        let vendorName, bankName = '', branchName = '', bankAccount = '', accountHolder = '';

        if (mode === 'first') {
          // 防重放：token 不可已經對應過廠商（否則會覆蓋別人身分或重複建檔）
          const existQs = `naming=EID&where=${SERVICE_FEE_TOKEN_FIELD},eq,${encodeURIComponent(token)}&limit=0,1`;
          const { upstream: eu, data: ed } = await getFromRagic(env, SERVICE_FEE_VENDOR_SHEET, existQs);
          if (!eu.ok) return jsonResp({ error: 'upstream_error', code: eu.status }, 502, allowedOrigin);
          if (Object.keys(ed || {}).length > 0) return jsonResp({ error: 'token_already_registered' }, 409, allowedOrigin);

          const name = form.get('name');
          // 2026-07-13：idNumber/bankAccount 格式嚴格不容許空白，normalize 去空白+全形轉半形；
          // phone 的 validPhone regex 本來就容許空白分段，只轉全形不去空白（避免不必要改變使用者慣用格式）。
          const idNumberRaw = form.get('idNumber');
          const idNumber = typeof idNumberRaw === 'string' ? sfNormalizeStrict(idNumberRaw) : idNumberRaw;
          const address = form.get('address');
          const phoneRaw = form.get('phone');
          const phone = typeof phoneRaw === 'string' ? sfNormalizeFullWidth(phoneRaw) : phoneRaw;
          bankName = form.get('bankName');
          branchName = (typeof form.get('branchName') === 'string') ? form.get('branchName').slice(0, 30) : '';
          const bankAccountRaw = form.get('bankAccount');
          bankAccount = typeof bankAccountRaw === 'string' ? sfNormalizeStrict(bankAccountRaw) : bankAccountRaw;
          accountHolder = (typeof form.get('accountHolder') === 'string' && form.get('accountHolder').trim()) ? form.get('accountHolder').trim() : name;

          if (!validSfName(name)) return jsonResp({ error: 'invalid_name' }, 400, allowedOrigin);
          if (!validSfIdNumber(idNumber)) return jsonResp({ error: 'invalid_idNumber' }, 400, allowedOrigin);
          if (!validSfAddress(address)) return jsonResp({ error: 'invalid_address' }, 400, allowedOrigin);
          if (!validPhone(phone)) return jsonResp({ error: 'invalid_phone' }, 400, allowedOrigin);
          if (!SERVICE_FEE_BANK_OPTIONS.has(bankName)) return jsonResp({ error: 'invalid_bankName' }, 400, allowedOrigin);
          if (!validSfAccount(bankAccount)) return jsonResp({ error: 'invalid_bankAccount' }, 400, allowedOrigin);
          if (!validSfName(accountHolder)) return jsonResp({ error: 'invalid_accountHolder' }, 400, allowedOrigin);

          // 2026-07-13 P1 修復（SUBMIT_upstream_invalid 事故根因）：
          // decorating/4「廠商名稱」(1000279) 與「證號」(1000282) 兩欄在 Ragic 皆設「不可重複」唯一值約束。
          // 這張表是全公司共用的協力廠商主檔（採購/請款也在用），不是本系統專屬空表——只要填表人真實姓名或
          // 身分證字號剛好撞到既有任何一筆記錄（哪怕跟本系統完全無關），INSERT 新廠商就會被 Ragic 拒絕回
          // status:INVALID（code 202，msg「欄位 X 為 Y 的資料已存在資料庫中」），Worker 的 detectUpstreamFailure
          // 第 3 層會把這個訊息轉成語意不明的 upstream_invalid，前端顯示「送出異常」。
          // 事故重現：2026-07-13 Joan 用真實本名「張瓊安」測試，decorating/4 record 20 早已存在同名廠商
          // （她自己的 Claude 訂閱代墊請款用的廠商列），直接撞名。
          // 修法：INSERT 前先分別查名字/證號是否已被「別的」token 佔用；沒有任何 token 佔用的既有同名/同證號記錄
          // 視為理論上可能撞到的資料完整性衝突（不同真人同名同證號極低機率但財務系統不可賭），一律清楚擋下、
          // 不靜默覆蓋，避免把新填表人的 KYC 資料誤寫進不相干既有廠商列（例如誤蓋 Joan 自己的收款銀行帳戶）。
          const nameCheckQs = `naming=EID&where=1000279,eq,${encodeURIComponent(name.trim())}&limit=0,1`;
          const { upstream: ncu, data: ncd } = await getFromRagic(env, SERVICE_FEE_VENDOR_SHEET, nameCheckQs);
          if (!ncu.ok) return jsonResp({ error: 'upstream_error', code: ncu.status }, 502, allowedOrigin);
          if (Object.keys(ncd || {}).length > 0) {
            const [dupRid, dupRec] = Object.entries(ncd)[0];
            console.error('[createServiceFeeOrder] vendor_name_conflict', { name: name.trim(), dupRid, dupHasToken: !!dupRec[SERVICE_FEE_TOKEN_FIELD] });
            return jsonResp({ error: 'vendor_name_conflict' }, 409, allowedOrigin);
          }
          const idCheckQs = `naming=EID&where=1000282,eq,${encodeURIComponent(idNumber)}&limit=0,1`;
          const { upstream: icu, data: icd } = await getFromRagic(env, SERVICE_FEE_VENDOR_SHEET, idCheckQs);
          if (!icu.ok) return jsonResp({ error: 'upstream_error', code: icu.status }, 502, allowedOrigin);
          if (Object.keys(icd || {}).length > 0) {
            const [dupRid] = Object.entries(icd)[0];
            console.error('[createServiceFeeOrder] vendor_idnumber_conflict', { dupRid });
            return jsonResp({ error: 'vendor_idnumber_conflict' }, 409, allowedOrigin);
          }

          const vendorParams = new URLSearchParams();
          vendorParams.append('1000279', name.trim());
          vendorParams.append('1000280', '自然人');
          vendorParams.append('1000281', '身分證字號');
          vendorParams.append('1000282', idNumber);
          vendorParams.append('1000295', address.trim());
          vendorParams.append('1000288', phone);
          vendorParams.append('1000298', bankName);
          if (branchName) vendorParams.append('1000301', branchName);
          vendorParams.append('1000302', bankAccount);
          vendorParams.append('1000297', accountHolder);
          vendorParams.append(SERVICE_FEE_TOKEN_FIELD, token);

          // 註：doDefaultValueForNewFields 只適用於「對既有 record 補新欄位」的 UPDATE POST（見 SKILL.md），
          // 這裡是 CREATE 新 record，該參數會被 Ragic 回 silent_fail「Field id not found」，故不加。
          const { upstream: vu, data: vd } = await postUrlEncodedToRagic(
            env, SERVICE_FEE_VENDOR_SHEET, vendorParams.toString(),
            'doFormula=true&doDefaultValue=true'
          );
          const vfail = detectUpstreamFailure(vu, vd);
          if (vfail) {
            // 2026-07-13 加：INVALID/ERROR 都先落 log，下次同類事故不必整套重現即可從 wrangler tail / KV 診斷直接看到 Ragic 原始 msg
            console.error('[createServiceFeeOrder] vendor_create_failed', { mode, name: name.trim(), ragicCode: vfail.code, ragicMsg: vfail.msg });
            return jsonResp({ error: 'vendor_create_failed', ...vfail }, 502, allowedOrigin);
          }
          if (!vd?.ragicId) return jsonResp({ error: 'vendor_no_rid_returned' }, 502, allowedOrigin);

          vendorName = name.trim();
        } else {
          const lookupQs = `naming=EID&where=${SERVICE_FEE_TOKEN_FIELD},eq,${encodeURIComponent(token)}&limit=0,1`;
          const { upstream: lu, data: ld } = await getFromRagic(env, SERVICE_FEE_VENDOR_SHEET, lookupQs);
          if (!lu.ok) return jsonResp({ error: 'upstream_error', code: lu.status }, 502, allowedOrigin);
          const records = Object.values(ld || {});
          if (records.length === 0) return jsonResp({ error: 'vendor_not_found_for_token' }, 404, allowedOrigin);
          const rec = records[0];
          vendorName = rec['1000279'] || '';
          bankName = rec['1000298'] || '';
          branchName = rec['1000301'] || '';
          bankAccount = rec['1000302'] || '';
          accountHolder = rec['1000297'] || '';
          if (!vendorName) return jsonResp({ error: 'vendor_incomplete' }, 502, allowedOrigin);
        }

        // ---- 建 finance2/5 主表 + 子表格明細 + PDF 附件（單次 multipart POST）----
        const today = todayTaipei();
        const fmt = (n) => Number(n).toLocaleString('zh-TW');
        const desc = [
          `本次請款為${vendorName}提供之${itemName}（${servicePeriod}），依約定按次／按月申報給付。`,
          ``,
          `給付總額 NT$${fmt(amount)}，執行業務所得扣繳稅額 NT$${fmt(tax)}（給付金額>$20,000 適用，稅率10%），二代健保補充保費 NT$${fmt(health)}（給付金額≥$20,000 適用，費率2.11%），實付金額 NT$${fmt(net)}。`,
          ``,
          `付款方式：匯款。國籍：${nationality}。`,
          ``,
          `本連結為${vendorName}專屬固定申報連結，由本人於${today}自助填寫送出。`,
          ``,
          `—— By 窩的家🧮請款AI助手`,
        ].join('\n');

        const orderForm = new FormData();
        orderForm.append('1000659', vendorName);
        orderForm.append('1000676', 'qiongan0208@gmail.com');
        orderForm.append('1000660', '匯款');
        orderForm.append('1000857', today);
        orderForm.append('1000661', `${vendorName} ${servicePeriod} ${itemName}`.slice(0, 100));
        orderForm.append('1000662', desc);
        orderForm.append('1000672', '0');
        orderForm.append('1000663', pdfFile, pdfFile.name || 'receipt.pdf');
        // 子表格：本行=給付總額；扣繳稅額/二代健保以負數列示，讓 1000671(項目金額合計) 自動算出實付淨額
        orderForm.append('1000664_-1', itemName);
        orderForm.append('1000665_-1', servicePeriod);
        orderForm.append('1000668_-1', '1');
        orderForm.append('1000695_-1', '式');
        orderForm.append('1000669_-1', String(amount));
        let rowIdx = -2;
        if (tax > 0) {
          orderForm.append(`1000664_${rowIdx}`, '減：執行業務所得扣繳稅額');
          orderForm.append(`1000665_${rowIdx}`, '所得稅法第92條');
          orderForm.append(`1000668_${rowIdx}`, '1');
          orderForm.append(`1000695_${rowIdx}`, '式');
          orderForm.append(`1000669_${rowIdx}`, String(-tax));
          rowIdx -= 1;
        }
        if (health > 0) {
          orderForm.append(`1000664_${rowIdx}`, '減：二代健保補充保費');
          orderForm.append(`1000665_${rowIdx}`, '全民健保法第31條');
          orderForm.append(`1000668_${rowIdx}`, '1');
          orderForm.append(`1000695_${rowIdx}`, '式');
          orderForm.append(`1000669_${rowIdx}`, String(-health));
        }

        const orderUpstream = await ragicFetch(`${env.RAGIC_BASE}/${SERVICE_FEE_ORDER_SHEET}?api&v=3&doLinkLoad=first&doFormula=true`, {
          method: 'POST',
          headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY },
          body: orderForm,
        });
        const orderText = await orderUpstream.text();
        let orderData = null; try { orderData = JSON.parse(orderText); } catch {}
        const orderFail = detectUpstreamFailure(orderUpstream, orderData);
        if (orderFail) {
          console.error('[createServiceFeeOrder] order_create_failed', { mode, vendorName, ragicCode: orderFail.code, ragicMsg: orderFail.msg });
          return jsonResp({ error: 'order_create_failed', ...orderFail, vendorCreated: mode === 'first' }, 502, allowedOrigin);
        }
        const newRid = orderData?.ragicId || orderData?.rv;
        if (!newRid) return jsonResp({ error: 'no_rid_returned', raw: orderText.slice(0, 200), vendorCreated: mode === 'first' }, 502, allowedOrigin);

        // ---- 第二次 POST：銀行資訊 + 請款單位/採購日期（Link&Load 隨時同步不會在 API write 後觸發，手動帶入）----
        // 2026-07-16 補：照 SKILL.md「請款」規範，這兩欄本來就要在第二次 POST 手動帶（自動帶入欄位清單），
        // 先前實作漏掉，導致 Joan 建出來的採購單「請款單位」「採購日期」空白（Joan 2026-07-16 回報）。
        const bankParams = new URLSearchParams();
        if (bankName) bankParams.append('1000708', bankName);
        if (branchName) bankParams.append('1000711', branchName);
        if (bankAccount) bankParams.append('1000713', bankAccount);
        if (accountHolder) bankParams.append('1000712', accountHolder);
        const bankCodeMatch = /\((\d{3})\)/.exec(bankName || '');
        if (bankCodeMatch) bankParams.append('1000710', bankCodeMatch[1]);
        // 承辦人(1000676)：第一次 POST 帶 email 實測不會存住（2026-07-13 驗證，335 讀回空白）；
        // 依 SKILL.md 既有經驗，第二次 POST 改帶「姓名」字串才會生效
        bankParams.append('1000676', '張瓊安');
        // 請款單位：SKILL.md 規定預設「管理部」
        bankParams.append('1000657', '管理部');
        // 採購日期：伺服器端當天日期（同 today，不信任前端），SKILL.md 規定格式 yyyy/MM/dd
        bankParams.append('1000656', today);

        let bankWriteOk = true;
        if (bankParams.toString().length > 0) {
          const { upstream: bu, data: bd } = await postUrlEncodedToRagic(
            env, `${SERVICE_FEE_ORDER_SHEET}/${newRid}`, bankParams.toString(), 'doFormula=true&doDefaultValue=true'
          );
          const bfail = detectUpstreamFailure(bu, bd);
          if (bfail) {
            bankWriteOk = false; // 主單已建成功，銀行資訊補寫失敗不視為整筆失敗，回應中標記供人工補
            console.error('[createServiceFeeOrder] bank_write_failed', { newRid, ragicCode: bfail.code, ragicMsg: bfail.msg });
          }
        }

        // ---- 第三次 POST（mode=first 限定）：身分證正反面+存摺封面照片，追加進附件欄位 1000663 ----
        // 2026-07-13 補回舊 GAS 系統原有功能（轉 Ragic 架構時掉的缺口）。跟銀行資訊補寫同一套設計：
        // 主單已建成功，照片是佐證資料非核心欄位，個別上傳失敗不讓整筆送出失敗，回應用 photosUploadOk 標記供人工補。
        // 用「對已存在 record 逐一單獨 POST」而非「建單同一次 multipart 塞 4 個檔案」或「1 次 POST 塞 3 個同 key 檔案」，
        // 是因為只有前者（單檔逐一追加）在 2026-07-13 已有 API 實測驗證「追加不覆蓋、多檔案變陣列」的行為，
        // 後兩種批次寫法未經驗證，財務附件寧可多打幾次 API 也不要賭未驗證行為。
        let photosUploadOk = true;
        if (mode === 'first') {
          const photoUploads = [
            { file: idFrontPhoto, label: '身分證正面' },
            { file: idBackPhoto, label: '身分證反面' },
            { file: bankbookPhoto, label: '存摺封面' },
          ];
          for (const { file, label } of photoUploads) {
            try {
              const ext = (file.name || 'jpg').split('.').pop();
              const photoForm = new FormData();
              photoForm.append('1000663', file, `${label}_${vendorName}.${ext}`);
              const photoUpstream = await ragicFetch(`${env.RAGIC_BASE}/${SERVICE_FEE_ORDER_SHEET}/${newRid}?api&v=3`, {
                method: 'POST',
                headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY },
                body: photoForm,
              });
              const photoText = await photoUpstream.text();
              let photoData = null; try { photoData = JSON.parse(photoText); } catch {}
              const photoFail = detectUpstreamFailure(photoUpstream, photoData);
              if (photoFail) {
                photosUploadOk = false;
                console.error('[createServiceFeeOrder] photo_upload_failed', { newRid, label, ragicCode: photoFail.code, ragicMsg: photoFail.msg });
              }
            } catch (e) {
              photosUploadOk = false;
              console.error('[createServiceFeeOrder] photo_upload_exception', { newRid, label, msg: String(e) });
            }
          }
        }

        // ---- 讀回驗證（防謊報成功）----
        let poNumber = '';
        try {
          const { upstream: ru, data: rd } = await getFromRagic(env, `${SERVICE_FEE_ORDER_SHEET}/${newRid}`, 'naming=EID');
          if (!ru.ok) return jsonResp({ error: 'verify_read_failed', ragicId: newRid }, 502, allowedOrigin);
          const rec = (rd && (rd[String(newRid)] || Object.values(rd)[0])) || null;
          if (!rec) return jsonResp({ error: 'verify_failed', reason: 'record_not_found_after_create', ragicId: newRid }, 502, allowedOrigin);
          if (!rec['1000659'] || String(rec['1000659']).trim() === '') {
            return jsonResp({ error: 'verify_failed', reason: '1000659_empty_after_create', ragicId: newRid }, 502, allowedOrigin);
          }
          poNumber = rec['1001217'] || '';
        } catch (e) {
          return jsonResp({ error: 'verify_read_failed', ragicId: newRid, msg: String(e) }, 502, allowedOrigin);
        }

        return jsonResp({
          ok: true, ragicId: newRid, poNumber, vendorName,
          vendorCreated: mode === 'first', bankWriteOk, photosUploadOk,
          amount, tax, health, net,
        }, 200, allowedOrigin);
      }

      // ============ Group E: client diagnostic ============
      if (action === 'diagnostic') {
        let body;
        try { body = await request.json(); } catch { body = {}; }
        // Sanitize: keep only expected string/number fields, truncate to 2000 chars each
        const safe = {};
        const ALLOWED_KEYS = ['stage','code','errorName','errorMessage','errorStack','userAgent','url','timestamp','referrer'];
        for (const k of ALLOWED_KEYS) {
          const v = body[k];
          if (v !== undefined && v !== null) safe[k] = String(v).slice(0, 2000);
        }
        // console.log visible via wrangler tail
        console.log('[diagnostic]', JSON.stringify(safe));
        // Also persist to KV with 7-day TTL
        const ts = safe.timestamp || new Date().toISOString();
        const rand = Math.random().toString(36).slice(2, 10);
        const kvKey = 'diagnostic:' + ts.replace(/[^0-9T]/g, '').slice(0,15) + '-' + rand;
        try {
          await env.EARNEST_QUEUE.put(kvKey, JSON.stringify(safe), { expirationTtl: 604800 });
        } catch { /* swallow KV error — logging already done */ }
        return jsonResp({ ok: true }, 200, allowedOrigin);
      }

      // ============ Group P: reportBug -- screenshot + description to OPS Telegram ============
      if (action === 'reportBug') {
        let body;
        try { body = await request.json(); } catch { return jsonResp({ error: 'bad_json' }, 400, allowedOrigin); }

        // Extra origin guard (on top of CORS)
        const reqOrigin = request.headers.get('Origin') || '';
        const reqReferer = request.headers.get('Referer') || '';
        const ALLOWED_REPORT_ORIGINS = [
          'https://wuohome.github.io',
          'https://schedule.wuohome.com.tw',
          'https://map.wuohome.com.tw',
          'https://from.wuohome.com.tw',
        ];
        const originOk = ALLOWED_REPORT_ORIGINS.some(function(o) { return reqOrigin.startsWith(o) || reqReferer.startsWith(o); });
        if (!originOk) return jsonResp({ error: 'forbidden_origin' }, 403, allowedOrigin);

        const bugDesc    = body.description;
        const bugType    = body.type;
        const pageUrl    = body.url;
        const pageTitle  = body.title;
        const userAgent  = body.userAgent;
        const screenshot = body.screenshot;
        const uploads    = body.uploads;

        if (!bugDesc || typeof bugDesc !== 'string' || bugDesc.trim().length < 3) {
          return jsonResp({ error: 'description_required' }, 400, allowedOrigin);
        }
        const VALID_TYPES = ['功能異常', '版面問題', '資料錯誤', '建議', '其他'];
        const safeType  = (typeof bugType === 'string' && VALID_TYPES.includes(bugType)) ? bugType : '其他';
        const safeDesc  = bugDesc.trim().slice(0, 1000);
        const safeUrl   = (typeof pageUrl === 'string' ? pageUrl : '').slice(0, 500);
        const safeTitle = (typeof pageTitle === 'string' ? pageTitle : '').slice(0, 200);
        const safeUA    = (typeof userAgent === 'string' ? userAgent : '').slice(0, 300);

        var uaShort = (function() {
          if (!safeUA) return '未知';
          var m = safeUA.match(/\(([^)]+)\)/);
          var platform = m ? m[1].split(';')[0].trim() : '未知平台';
          var browser = safeUA.indexOf('Chrome') >= 0 ? 'Chrome'
                      : safeUA.indexOf('Firefox') >= 0 ? 'Firefox'
                      : safeUA.indexOf('Safari') >= 0 ? 'Safari' : '其他';
          return platform + ' / ' + browser;
        })();

        var nowTW = new Date().toLocaleString('zh-TW', {
          timeZone: 'Asia/Taipei',
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
        });

        var captionParts = [
          '🐛 問題回報',
          '類型：' + safeType,
          '頁面：' + (safeTitle || '（無標題）') + '（' + (safeUrl || '—') + '）',
          '描述：' + safeDesc,
          '裝置：' + uaShort,
          '時間：' + nowTW,
        ];
        var caption = captionParts.join('\n');

        var BOT_TOKEN = env.OPS_BOT_TOKEN;
        if (!BOT_TOKEN) return jsonResp({ error: 'server_config_error' }, 500, allowedOrigin);
        var CHAT_ID = '8163308207';
        var TG_BASE = 'https://api.telegram.org/bot' + BOT_TOKEN;

        var images = [];
        if (screenshot && typeof screenshot === 'string' && screenshot.indexOf('data:image/') === 0) {
          images.push(screenshot);
        }
        if (Array.isArray(uploads)) {
          for (var i = 0; i < Math.min(uploads.length, 5); i++) {
            var up = uploads[i];
            if (up && typeof up === 'string' && up.indexOf('data:image/') === 0) images.push(up);
          }
        }

        function dataUrlToBytes(dataUrl) {
          var b64 = dataUrl.split(',')[1];
          if (!b64) return null;
          var bin = atob(b64);
          var bytes = new Uint8Array(bin.length);
          for (var j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
          return bytes;
        }

        async function sendPhoto(dataUrl, cap) {
          var bytes = dataUrlToBytes(dataUrl);
          if (!bytes || bytes.length > 10 * 1024 * 1024) return { ok: false };
          var form = new FormData();
          form.append('chat_id', CHAT_ID);
          form.append('photo', new Blob([bytes], { type: 'image/jpeg' }), 'screenshot.jpg');
          if (cap) form.append('caption', cap.slice(0, 1024));
          var res = await fetch(TG_BASE + '/sendPhoto', { method: 'POST', body: form });
          return res.json().catch(function() { return { ok: false }; });
        }

        if (images.length === 0) {
          var res = await fetch(TG_BASE + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text: caption }),
          });
          var json = await res.json().catch(function() { return {}; });
          if (!json.ok) return jsonResp({ error: 'telegram_error', detail: json.description }, 502, allowedOrigin);
          return jsonResp({ ok: true }, 200, allowedOrigin);
        }

        var firstResult = await sendPhoto(images[0], caption);
        if (!firstResult.ok) {
          var res2 = await fetch(TG_BASE + '/sendMessage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: CHAT_ID, text: caption + '\n\n⚠️ 截圖上傳失敗' }),
          });
          var json2 = await res2.json().catch(function() { return {}; });
          if (!json2.ok) return jsonResp({ error: 'telegram_error', detail: json2.description }, 502, allowedOrigin);
          return jsonResp({ ok: true, warn: 'screenshot_failed' }, 200, allowedOrigin);
        }
        for (var k = 1; k < images.length; k++) {
          await sendPhoto(images[k], '').catch(function() {});
        }
        return jsonResp({ ok: true }, 200, allowedOrigin);
      }

      // ============ Group S: 資產活化工作檯 P5（asset-workbench.html）============
      if (action === 'wbListInvestors') {
        const { upstream, data } = await getFromRagic(env, WB_INVESTOR_SHEET, 'naming=EID&subtables=1&limit=0,200');
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true, investors: data }, 200, allowedOrigin);
      }

      if (action === 'wbGetInvestor') {
        const { upstream, data } = await getFromRagic(env, `${WB_INVESTOR_SHEET}/${pathParam}`, 'naming=EID&subtables=1');
        if (!upstream.ok || !data || Object.keys(data).length === 0) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        const rec = data[String(pathParam)] || Object.values(data)[0];
        return jsonResp({ ok: true, investor: rec }, 200, allowedOrigin);
      }

      if (action === 'wbUpdateInvestor') {
        const parsed = await wbParseJsonBody(request, allowedOrigin);
        if (parsed.error) return parsed.error;
        const r = await wbUpdateMain(env, WB_INVESTOR_SHEET, pathParam, parsed.body, WB_INVESTOR_MAIN_WHITELIST, WB_INVESTOR_MULTI_FIELDS);
        if (r.error) return jsonResp(r.error, r.status || 400, allowedOrigin);
        return jsonResp(r, 200, allowedOrigin);
      }

      if (action === 'wbAddInvestorSub') {
        const parsed = await wbParseJsonBody(request, allowedOrigin);
        if (parsed.error) return parsed.error;
        const r = await wbAddSubRow(env, WB_INVESTOR_SHEET, pathParam, WB_INVESTOR_SUBTABLES, parsed.body?.sub, parsed.body?.fields);
        if (r.error) return jsonResp(r.error, r.status || 400, allowedOrigin);
        return jsonResp(r, 200, allowedOrigin);
      }

      if (action === 'wbListProperties') {
        const limitRaw = Number(url.searchParams.get('limit'));
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 && limitRaw <= WB_PROPERTY_MAX_LIMIT ? Math.floor(limitRaw) : WB_PROPERTY_DEFAULT_LIMIT;
        const whereParams = [];
        for (const w of url.searchParams.getAll('where')) {
          const m = /^(\d{7}),(eq|like),(.+)$/.exec(w);
          if (!m) continue;
          const [, fid, op, val] = m;
          if (!WB_PROPERTY_WHERE_FIELDS.has(fid) || val.length > 50) continue;
          whereParams.push(`where=${encodeURIComponent(`${fid},${op},${val}`)}`);
        }
        const qs = ['naming=EID', 'subtables=1', `limit=0,${limit}`, ...whereParams].join('&');
        const { upstream, data } = await getFromRagic(env, WB_PROPERTY_SHEET, qs);
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true, properties: data }, 200, allowedOrigin);
      }

      if (action === 'wbGetProperty') {
        const { upstream, data } = await getFromRagic(env, `${WB_PROPERTY_SHEET}/${pathParam}`, 'naming=EID&subtables=1');
        if (!upstream.ok || !data || Object.keys(data).length === 0) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        const rec = data[String(pathParam)] || Object.values(data)[0];
        return jsonResp({ ok: true, property: rec }, 200, allowedOrigin);
      }

      if (action === 'wbUpdateProperty') {
        const parsed = await wbParseJsonBody(request, allowedOrigin);
        if (parsed.error) return parsed.error;
        const r = await wbUpdateMain(env, WB_PROPERTY_SHEET, pathParam, parsed.body, WB_PROPERTY_MAIN_WHITELIST, WB_PROPERTY_MULTI_FIELDS);
        if (r.error) return jsonResp(r.error, r.status || 400, allowedOrigin);
        return jsonResp(r, 200, allowedOrigin);
      }

      if (action === 'wbAddPropertySub') {
        const parsed = await wbParseJsonBody(request, allowedOrigin);
        if (parsed.error) return parsed.error;
        const r = await wbAddSubRow(env, WB_PROPERTY_SHEET, pathParam, WB_PROPERTY_SUBTABLES, parsed.body?.sub, parsed.body?.fields);
        if (r.error) return jsonResp(r.error, r.status || 400, allowedOrigin);
        return jsonResp(r, 200, allowedOrigin);
      }

      // ── Group S.1（2026-07-20）：子表列修改／刪除，補完整 CRUD ──
      if (action === 'wbUpdateInvestorSub') {
        const parsed = await wbParseJsonBody(request, allowedOrigin);
        if (parsed.error) return parsed.error;
        const r = await wbUpdateSubRow(env, WB_INVESTOR_SHEET, pathParam, WB_INVESTOR_SUBTABLES, parsed.body?.sub, parsed.body?.rowId, parsed.body?.fields);
        if (r.error) return jsonResp(r.error, r.status || 400, allowedOrigin);
        return jsonResp(r, 200, allowedOrigin);
      }

      if (action === 'wbDeleteInvestorSub') {
        const parsed = await wbParseJsonBody(request, allowedOrigin);
        if (parsed.error) return parsed.error;
        const r = await wbDeleteSubRow(env, WB_INVESTOR_SHEET, pathParam, WB_INVESTOR_SUBTABLES, parsed.body?.sub, parsed.body?.rowId);
        if (r.error) return jsonResp(r.error, r.status || 400, allowedOrigin);
        return jsonResp(r, 200, allowedOrigin);
      }

      if (action === 'wbUpdatePropertySub') {
        const parsed = await wbParseJsonBody(request, allowedOrigin);
        if (parsed.error) return parsed.error;
        const r = await wbUpdateSubRow(env, WB_PROPERTY_SHEET, pathParam, WB_PROPERTY_SUBTABLES, parsed.body?.sub, parsed.body?.rowId, parsed.body?.fields);
        if (r.error) return jsonResp(r.error, r.status || 400, allowedOrigin);
        return jsonResp(r, 200, allowedOrigin);
      }

      if (action === 'wbDeletePropertySub') {
        const parsed = await wbParseJsonBody(request, allowedOrigin);
        if (parsed.error) return parsed.error;
        const r = await wbDeleteSubRow(env, WB_PROPERTY_SHEET, pathParam, WB_PROPERTY_SUBTABLES, parsed.body?.sub, parsed.body?.rowId);
        if (r.error) return jsonResp(r.error, r.status || 400, allowedOrigin);
        return jsonResp(r, 200, allowedOrigin);
      }

      // ============ Group T: 設計部工作檯 P1（decor-console.html，全唯讀）============
      if (action === 'decorListAll') {
        const { upstream, data } = await getFromRagic(env, DECOR_SHEET, 'naming=EID&subtables=1&limit=0,200');
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        const cases = Object.entries(data || {})
          .filter(([k]) => /^\d+$/.test(k))
          .map(([rid, rec]) => decorPublicRecord(rid, rec));
        const result = { ok: true, role: decorIdentity.role, label: decorIdentity.label, cases };
        if (decorIdentity.role === 'admin') {
          const today = decorTodayTaipei();
          const active = cases.filter((c) => c.status === DECOR_STATUS_ACTIVE);
          result.stats = {
            active: active.length,
            overdue: active.filter((c) => decorIsOverdue(c, today)).length,
            stale: active.filter((c) => decorIsStale(c, today)).length,
          };
        }
        return jsonResp(result, 200, allowedOrigin);
      }

      if (action === 'decorDetail') {
        const { upstream, data } = await getFromRagic(env, `${DECOR_SHEET}/${pathParam}`, 'naming=EID&subtables=1');
        if (!upstream.ok || !data || Object.keys(data).length === 0) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        const rec = data[String(pathParam)] || Object.values(data)[0];
        if (!rec || typeof rec !== 'object') return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        return jsonResp({ ok: true, case: decorPublicRecord(pathParam, rec) }, 200, allowedOrigin);
      }

      // 附件下載代理：僅 rid+token，固定反查該 rid 的 1000179 合約上傳欄，Worker 端 fetch
      // 位元組後串流回傳，Ragic 原始 file.jsp URL/token 完全不對前端曝光；不接受任何其他參數。
      if (action === 'decorFile') {
        const { upstream, data } = await getFromRagic(env, `${DECOR_SHEET}/${pathParam}`, 'naming=EID');
        if (!upstream.ok || !data || Object.keys(data).length === 0) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        const rec = data[String(pathParam)] || Object.values(data)[0];
        if (!rec || typeof rec !== 'object') return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        const raw = rec[DF.contractFile];
        const token = decorClean(Array.isArray(raw) ? raw[0] : raw);
        if (!token) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        let fileUpstream;
        try {
          fileUpstream = await fetch(`https://ap15.ragic.com/sims/file.jsp?a=wuohome&f=${encodeURIComponent(token)}`);
        } catch { return jsonResp({ error: 'upstream_error' }, 502, allowedOrigin); }
        if (!fileUpstream.ok || !fileUpstream.body) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        const filename = token.includes('@') ? token.slice(token.indexOf('@') + 1) : `contract-${pathParam}`;
        return new Response(fileUpstream.body, {
          status: 200,
          headers: {
            'Content-Type': fileUpstream.headers.get('Content-Type') || 'application/octet-stream',
            'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            ...corsHeaders(allowedOrigin),
          },
        });
      }

      // ============ Group T.1: 設計部工作檯 P2（新增進度紀錄，全 3 角色皆可寫）============
      // multipart POST，rid 在路徑（PATH_PREFIX）。欄位白名單=工程時間起訖/工程內容/工項分類/
      // 進度照片，一律用新列語法 `{fieldId}_-1`（Ragic API 子表格新增列慣例，比照 wbAddSubRow）。
      if (action === 'decorProgressAdd') {
        const contentType = request.headers.get('Content-Type') || '';
        if (!contentType.toLowerCase().startsWith('multipart/form-data')) return jsonResp({ error: 'expect_multipart' }, 400, allowedOrigin);
        const contentLength = Number(request.headers.get('Content-Length') || 0);
        if (Number.isFinite(contentLength) && contentLength > 40 * 1024 * 1024) return jsonResp({ error: 'request_too_large' }, 413, allowedOrigin);
        let input;
        try { input = await request.formData(); } catch { return jsonResp({ error: 'bad_multipart' }, 400, allowedOrigin); }

        const startAt = decorNormalizeDate(String(input.get('startAt') || ''));
        const endAtRaw = input.get('endAt');
        const endAt = endAtRaw ? decorNormalizeDate(String(endAtRaw)) : null;
        const content = String(input.get('content') || '').trim();
        const category = String(input.get('category') || '').trim();
        const photos = input.getAll('photo').filter((f) => f instanceof File && f.size > 0);

        if (!startAt) return jsonResp({ error: 'invalid_startAt' }, 400, allowedOrigin);
        if (endAtRaw && !endAt) return jsonResp({ error: 'invalid_endAt' }, 400, allowedOrigin);
        if (!content || content.length > 2000) return jsonResp({ error: 'invalid_content' }, 400, allowedOrigin);
        // 工項分類白名單：Ragic LIST 欄位 API 不驗證選項合法性（踩坑速查續14/20），Worker 必須自擋。
        if (!DECOR_WORK_CATEGORY_SET.has(category)) return jsonResp({ error: 'invalid_category' }, 400, allowedOrigin);
        if (photos.length > DECOR_PHOTO_MAX_COUNT) return jsonResp({ error: 'too_many_photos' }, 400, allowedOrigin);
        for (const f of photos) {
          if (!validRepairFile(f, REPAIR_IMAGE_MIMES)) return jsonResp({ error: 'invalid_photo' }, 400, allowedOrigin);
        }

        // rid 必須是真實存在的 finance/8 案件，避免對不存在案件寫出孤兒子表列。
        const found = await getFromRagic(env, `${DECOR_SHEET}/${pathParam}`, 'naming=EID');
        if (!found.upstream.ok || !found.data || Object.keys(found.data).length === 0) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);

        const form = new FormData();
        form.append(`${DF.progressStart}_-1`, startAt);
        if (endAt) form.append(`${DF.progressEnd}_-1`, endAt);
        form.append(`${DF.progressContent}_-1`, content);
        form.append(`${DF.progressCategory}_-1`, category);
        // 1001240（子表「更新日期」，唯讀，預設 $DATE）實測 API 新增列不會自動觸發（見檔頭 v36
        // 註記兩個行為疑點結論），Worker 顯式補寫，否則主表 1001241（催更黃燈判定源 MAX(G16)）
        // 永遠讀不到值。1000189 記錄人依「禁止硬編碼人名」規則不寫入，維持空白（已知限制）。
        form.append(`${DF.progressUpdatedAt}_-1`, todayTaipei());
        for (const f of photos) {
          form.append(`${DF.progressPhoto}_-1`, f, f.name || 'progress-photo.jpg');
        }
        const upstream = await ragicFetch(`${env.RAGIC_BASE}/${DECOR_SHEET}/${pathParam}?api&doLinkLoad=first&doFormula=true`, {
          method: 'POST', headers: { Authorization: 'Basic ' + env.RAGIC_KEY }, body: form,
        });
        const text = await upstream.text();
        let data = null; try { data = JSON.parse(text); } catch {}
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true, rid: pathParam }, 200, allowedOrigin);
      }

      // 進度照片回看代理：僅 rid+row(子表列 Row ID)+idx(多檔索引)+token，固定反查 finance/8 該
      // rid 該子表列的 1003092 進度照片欄，Worker 端 fetch 位元組後串流回傳；不接受任意 URL/
      // 欄位/sheet 參數（比照 decorFile 從嚴契約）。
      if (action === 'decorProgressPhoto') {
        const rid = url.searchParams.get('rid') || '';
        const rowId = url.searchParams.get('row') || '';
        const idxRaw = url.searchParams.get('idx') || '0';
        if (!validRid(rid) || !WB_SUB_ROW_ID_RE.test(rowId) || !/^\d{1,3}$/.test(idxRaw)) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        const idx = Number(idxRaw);
        const { upstream, data } = await getFromRagic(env, `${DECOR_SHEET}/${rid}`, 'naming=EID&subtables=1');
        if (!upstream.ok || !data || Object.keys(data).length === 0) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        const rec = data[String(rid)] || Object.values(data)[0];
        if (!rec || typeof rec !== 'object') return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        const sub = rec['_subtable_' + DF.progressKey];
        const row = sub && typeof sub === 'object' ? sub[rowId] : null;
        if (!row) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        const tokens = decorFileTokens(row[DF.progressPhoto]);
        const token = tokens[idx];
        if (!token) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        let fileUpstream;
        try {
          fileUpstream = await fetch(`https://ap15.ragic.com/sims/file.jsp?a=wuohome&f=${encodeURIComponent(token)}`);
        } catch { return jsonResp({ error: 'upstream_error' }, 502, allowedOrigin); }
        if (!fileUpstream.ok || !fileUpstream.body) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        const filename = token.includes('@') ? token.slice(token.indexOf('@') + 1) : `progress-${rid}-${rowId}-${idx}`;
        return new Response(fileUpstream.body, {
          status: 200,
          headers: {
            'Content-Type': fileUpstream.headers.get('Content-Type') || 'application/octet-stream',
            'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            ...corsHeaders(allowedOrigin),
          },
        });
      }

      // Group T.2（P2 補派）：合約附件多檔瀏覽代理。僅 rid+idx+token，固定反查 finance/8 該 rid
      // 的 1000179 合約上傳欄，Worker 端 fetch 位元組後串流回傳；不接受任意 URL/欄位/sheet 參數
      // （比照 decorFile／decorProgressPhoto 從嚴契約）。既有 decorFile（回傳第一筆）一行不改，
      // 舊連結行為完全不變——本 action 是新增的「可指定第幾筆」版本，不是取代。
      if (action === 'decorContractFile') {
        const rid = url.searchParams.get('rid') || '';
        const idxRaw = url.searchParams.get('idx') || '0';
        if (!validRid(rid) || !/^\d{1,3}$/.test(idxRaw)) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        const idx = Number(idxRaw);
        const { upstream, data } = await getFromRagic(env, `${DECOR_SHEET}/${rid}`, 'naming=EID');
        if (!upstream.ok || !data || Object.keys(data).length === 0) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        const rec = data[String(rid)] || Object.values(data)[0];
        if (!rec || typeof rec !== 'object') return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        const tokens = decorFileTokens(rec[DF.contractFile]);
        const token = tokens[idx];
        if (!token) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        let fileUpstream;
        try {
          fileUpstream = await fetch(`https://ap15.ragic.com/sims/file.jsp?a=wuohome&f=${encodeURIComponent(token)}`);
        } catch { return jsonResp({ error: 'upstream_error' }, 502, allowedOrigin); }
        if (!fileUpstream.ok || !fileUpstream.body) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        const filename = token.includes('@') ? token.slice(token.indexOf('@') + 1) : `contract-${rid}-${idx}`;
        return new Response(fileUpstream.body, {
          status: 200,
          headers: {
            'Content-Type': fileUpstream.headers.get('Content-Type') || 'application/octet-stream',
            'Content-Disposition': `inline; filename="${encodeURIComponent(filename)}"`,
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            ...corsHeaders(allowedOrigin),
          },
        });
      }

      // ── Group V: 修繕報價單產生器 → Ragic 化 ──────────────────────────────
      if (action === 'rqCreate') {
        let body;
        try { body = await request.json(); } catch { return jsonResp({ error: 'bad_json' }, 400, allowedOrigin); }

        const customerName = rqStr(body?.customerName, 60);
        if (!customerName) return jsonResp({ error: 'invalid_customerName' }, 400, allowedOrigin);

        const quoteDateStr = rqStr(body?.quoteDate, 10);
        const validUntilStr = rqStr(body?.validUntilDate, 10);
        if (!validDateStr(quoteDateStr) || !validDateStr(validUntilStr)) {
          return jsonResp({ error: 'invalid_date', reason: 'expect_yyyy_mm_dd_slash' }, 400, allowedOrigin);
        }

        const items = Array.isArray(body?.items) ? body.items : [];
        if (items.length < 1) return jsonResp({ error: 'invalid_items', reason: 'empty' }, 400, allowedOrigin);
        if (items.length > RQ_MAX_ITEMS) return jsonResp({ error: 'invalid_items', reason: 'too_many' }, 400, allowedOrigin);

        const snapshotRaw = typeof body?.snapshot === 'string' ? body.snapshot : JSON.stringify(body?.snapshot ?? {});
        const snapshotBytes = new TextEncoder().encode(snapshotRaw).length;
        if (snapshotBytes > RQ_MAX_SNAPSHOT_BYTES) {
          return jsonResp({ error: 'invalid_snapshot', reason: 'too_large', bytes: snapshotBytes }, 400, allowedOrigin);
        }

        const discountType = RQ_DISCOUNT_LABELS[body?.discountType] ? body.discountType : 'none';
        const taxMode = RQ_TAX_LABELS[body?.taxMode] ? body.taxMode : 'excluded';
        const shareToken = rqGenToken();

        // 金額四欄（項目小計/折扣金額/稅額/總計）採前端算好的快照值，Worker 不重算不覆寫
        // （報價單是法律性單據快照，見 BuildSpec 設計取捨；金額由前端 computeTotals() 算好送來）。
        const params = new URLSearchParams();
        params.set(RQF.quoteDate, quoteDateStr);
        params.set(RQF.validUntil, validUntilStr);
        params.set(RQF.status, '已開立');
        const repairTicketNo = rqStr(body?.repairTicketNo, 60);
        if (repairTicketNo) params.set(RQF.repairTicketNo, repairTicketNo);
        params.set(RQF.issuer, rqStr(body?.issuer, 60));
        params.set(RQF.custName, customerName);
        params.set(RQF.custPhone, rqStr(body?.customerPhone, 30));
        params.set(RQF.siteAddress, rqStr(body?.siteAddress, 200));
        params.set(RQF.siteNote, rqStr(body?.siteNote, 200));
        params.set(RQF.sellerName, rqStr(body?.sellerName, 60));
        params.set(RQF.sellerPhone, rqStr(body?.sellerPhone, 30));
        params.set(RQF.discountType, RQ_DISCOUNT_LABELS[discountType]);
        params.set(RQF.discountValue, String(rqNum(body?.discountValue)));
        params.set(RQF.taxMode, RQ_TAX_LABELS[taxMode]);
        params.set(RQF.customTaxRate, String(rqNum(body?.customTaxRate)));
        params.set(RQF.subtotal, String(rqNum(body?.subtotal)));
        params.set(RQF.discountAmount, String(rqNum(body?.discountAmount)));
        params.set(RQF.taxAmount, String(rqNum(body?.taxAmount)));
        params.set(RQF.total, String(rqNum(body?.total)));
        params.set(RQF.notes, rqStr(body?.notes, 2000));
        params.set(RQF.shareToken, shareToken);
        params.set(RQF.snapshotJson, snapshotRaw);

        items.slice(0, RQ_MAX_ITEMS).forEach((it, i) => {
          const rk = `_-${i + 1}`;
          params.set(RQ_ITEM_F.idx + rk, String(i + 1));
          params.set(RQ_ITEM_F.category + rk, rqStr(it?.category, 30));
          params.set(RQ_ITEM_F.name + rk, rqStr(it?.name, 150));
          params.set(RQ_ITEM_F.desc + rk, rqStr(it?.desc, 300));
          params.set(RQ_ITEM_F.qty + rk, String(rqNum(it?.qty)));
          params.set(RQ_ITEM_F.unit + rk, rqStr(it?.unit, 20));
          params.set(RQ_ITEM_F.price + rk, String(rqNum(it?.price)));
          params.set(RQ_ITEM_F.subtotal + rk, String(rqNum(it?.subtotal)));
        });

        const createUrl = rqUrl(env, RQ_SHEET, { v: '3' });
        const upstream = await ragicFetch(createUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: params.toString(),
        });
        const text = await upstream.text();
        let data = null;
        try { data = JSON.parse(text); } catch {}
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);

        const newRid = data?.ragicId || data?.rv;
        if (!newRid) return jsonResp({ error: 'no_rid_returned', raw: text.slice(0, 200) }, 502, allowedOrigin);

        // 讀回新記錄驗證自動編號欄（1003157）確實有值，防謊報成功（比照 createPaymentReceipt 手法）
        let quoteNo = '';
        try {
          const readUrl = rqUrl(env, `${RQ_SHEET}/${newRid}`, { naming: 'EID' });
          const readUpstream = await ragicFetch(readUrl.toString());
          const readData = await readUpstream.json().catch(() => ({}));
          const rec = readData?.[String(newRid)];
          if (!rec) return jsonResp({ error: 'verify_failed', reason: 'record_not_found_after_create', ragicId: newRid }, 502, allowedOrigin);
          quoteNo = rec[RQF.quoteNo] || '';
          if (!quoteNo) return jsonResp({ error: 'verify_failed', reason: 'quoteNo_empty_after_create', ragicId: newRid }, 502, allowedOrigin);
        } catch (e) {
          return jsonResp({ error: 'verify_read_failed', ragicId: newRid, msg: String(e) }, 502, allowedOrigin);
        }

        return jsonResp({ ok: true, quoteNo, token: shareToken }, 200, allowedOrigin);
      }

      if (action === 'rqGet') {
        // token-only IDOR 防護：不接受任何形式的 record id 查詢，只認分享token，Worker 自行
        // 反查目標記錄（比照 v29/v30/Group S/T/U 手法），失敗一律同型 404 不分因由防列舉。
        const token = url.searchParams.get('token') || '';
        if (!validRqToken(token)) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);

        const listUrl = rqUrl(env, RQ_SHEET, {
          naming: 'EID', subtables: '0', where: `${RQF.shareToken},eq,${token}`, limit: '0,2',
        });
        const upstream = await ragicFetch(listUrl.toString());
        const data = await upstream.json().catch(() => null);
        if (!upstream.ok || !data) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);

        const rows = Object.entries(data).filter(([rid]) => rid !== '_total' && rid !== '_max');
        if (rows.length !== 1) return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        const [, rec] = rows[0];
        if (!rec || typeof rec !== 'object' || rec[RQF.shareToken] !== token) {
          return jsonResp({ error: 'not_found' }, 404, allowedOrigin);
        }

        let snapshot = null;
        try { snapshot = JSON.parse(rec[RQF.snapshotJson] || '{}'); }
        catch { return jsonResp({ error: 'corrupt_snapshot' }, 502, allowedOrigin); }

        return jsonResp({
          quoteNo: rec[RQF.quoteNo] || '',
          status: rec[RQF.status] || '',
          snapshot,
        }, 200, allowedOrigin);
      }
    } catch (e) {
      return jsonResp({ error: 'internal' }, 500, allowedOrigin);
    }

    return jsonResp({ error: 'not_implemented', action }, 501, allowedOrigin);
  },
};
