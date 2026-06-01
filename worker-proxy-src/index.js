// wuohome-ragic-proxy v12 — add getToss591 endpoint for 591拋轉 MVP
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
  submitHrOnboarding: { method: 'POST' },
  // Group C: earnest + payment-receipt (sync, kept for 60-day observation)
  getEarnest:            { method: 'GET' },
  submitEarnest:         { method: 'POST' },
  getPaymentReceipt:     { method: 'GET' },
  verifyPaymentReceipt:  { method: 'GET' },
  getPaymentSource:      { method: 'GET' },
  submitPaymentReceipt:  { method: 'POST' },
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
};

const PAYMENT_SOURCE_SHEETS = {
  ownerSource:  'operation/8',
  tenantSource: 'payments/1',
};

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

const PATH_PREFIX = [
  { prefix: 'deleteLeave/',          method: 'DELETE', op: 'deleteLeave' },
  { prefix: 'updateLeave/',          method: 'POST',   op: 'updateLeave' },
  { prefix: 'getSubmission/',        method: 'GET',    op: 'getSubmission' },
  { prefix: 'retrySubmission/',      method: 'POST',   op: 'retrySubmission' },
  { prefix: 'markSubmissionManual/', method: 'POST',   op: 'markSubmissionManual' },
];

const TENANT_FIELDS_WHITELIST = new Set([
  '1000580','1000581','1000583','1000584','1000585','1000586','1000587','1000588',
  '1000590','1000591','1000592',
  '1000638','1000639','1000640','1000641',
  '1000647','1000648','1000908','1000970',
]);

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
};

const KV_PREFIX = 'submission:earnest:';
const KV_TTL_SECONDS = 7776000; // 90 days

// Telegram webhook path — not in ALLOWED_ACTIONS, handled separately
const TELEGRAM_WEBHOOK_PATH = 'telegram-webhook';

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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
function validUuid(s)   { return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s); }
function getNowIso()    { return new Date().toISOString(); }

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

async function postUrlEncodedToRagic(env, sheetPath, paramsString) {
  const upstream = await fetch(`${env.RAGIC_BASE}/${sheetPath}?api`, {
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
  const upstream = await fetch(`${env.RAGIC_BASE}/${sheetPath}?api${sep}${queryString || ''}`, {
    headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY },
  });
  const text = await upstream.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { upstream, data };
}

async function deleteFromRagic(env, sheetPath) {
  const upstream = await fetch(`${env.RAGIC_BASE}/${sheetPath}?api`, {
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
  for (const [key, value] of entries) {
    if (key === '_rid' || key === 'rid') {
      if (typeof value !== 'string' || !/^\d{1,12}$/.test(value)) {
        return { error: jsonResp({ error: 'invalid_rid' }, 400, allowedOrigin) };
      }
      rid = value;
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
  return { form: newForm, rid };
}

async function getRagicRecordById(env, sheetPath, rid) {
  const upstream = await fetch(`${env.RAGIC_BASE}/${sheetPath}/${rid}.json?api`, {
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
    upstream = await fetch(`${env.RAGIC_BASE}/payments/1/${rid}?api&v=3`, {
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
          if (p.op === 'deleteLeave' || p.op === 'updateLeave') {
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

    try {
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
        return jsonResp(data || {}, 200, allowedOrigin);
      }

      if (action === 'listStaff') {
        const limit = url.searchParams.get('limit') || '200';
        if (!/^\d{1,4}$/.test(limit)) return jsonResp({ error: 'invalid_limit' }, 400, allowedOrigin);
        const { upstream, data } = await getFromRagic(env, 'ragicforms4/20004', `limit=${limit}`);
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        return jsonResp(data || {}, 200, allowedOrigin);
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
        const upstream = await fetch(`${env.RAGIC_BASE}/ragicforms4/20004?api`, {
          method: 'POST', headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY }, body: newForm,
        });
        const text = await upstream.text();
        let data = null; try { data = JSON.parse(text); } catch {}
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true, ragicId: data?.ragicId }, 200, allowedOrigin);
      }

      // ============ Group C: earnest + payment-receipt (sync) ============
      if (action === 'getEarnest') {
        let rid = url.searchParams.get('rid');
        if (!rid) return jsonResp({ error: 'invalid_rid' }, 400, allowedOrigin);
        if (!validRid(rid)) {
          if (!/^No\.\d{8}-\d{3}$/.test(rid)) return jsonResp({ error: 'invalid_rid' }, 400, allowedOrigin);
          const lookupQs = `naming=EID&where=1000796,eq,${encodeURIComponent(rid)}&limit=0,1`;
          const { upstream: lu, data: ld } = await getFromRagic(env, 'payments/1', lookupQs);
          if (!lu.ok) return jsonResp({ error: 'upstream_error', code: lu.status }, 502, allowedOrigin);
          const keys = Object.keys(ld || {});
          if (keys.length === 0) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);
          const numericRid = String(keys[0]);
          if (!validRid(numericRid)) return jsonResp({ error: 'invalid_rid' }, 400, allowedOrigin);
          rid = numericRid;
        }
        const { upstream, data } = await getRagicRecordById(env, 'payments/1', rid);
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        return jsonResp(data || {}, 200, allowedOrigin);
      }

      if (action === 'submitEarnest') {
        const parsed = await processMultipart(request, allowedOrigin, EARNEST_FIELDS_WHITELIST, EARNEST_SIGNATURE_FIELDS);
        if (parsed.error) return parsed.error;
        if (!parsed.rid) return jsonResp({ error: 'missing_rid' }, 400, allowedOrigin);
        const upstream = await fetch(`${env.RAGIC_BASE}/payments/1/${parsed.rid}?api&v=3`, {
          method: 'POST', headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY }, body: parsed.form,
        });
        const text = await upstream.text();
        let data = null; try { data = JSON.parse(text); } catch {}
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true, ragicId: data?.ragicId || parsed.rid }, 200, allowedOrigin);
      }

      if (action === 'getPaymentReceipt' || action === 'verifyPaymentReceipt') {
        let rid = url.searchParams.get('rid');
        if (!rid) return jsonResp({ error: 'invalid_rid' }, 400, allowedOrigin);
        if (!validRid(rid)) {
          // rid may be a 憑單編號 like "202605-032" — look it up by field 1000781
          if (!/^\d{6}-\d{3}$/.test(rid)) return jsonResp({ error: 'invalid_rid' }, 400, allowedOrigin);
          const lookupQs = `naming=EID&where=1000781,eq,${encodeURIComponent(rid)}&limit=0,1`;
          const { upstream: lu, data: ld } = await getFromRagic(env, 'payments/2', lookupQs);
          if (!lu.ok) return jsonResp({ error: 'upstream_error', code: lu.status }, 502, allowedOrigin);
          const keys = Object.keys(ld || {});
          if (keys.length === 0) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);
          // Return the record directly from lookup result — avoids getRagicRecordById .json offset bug
          return jsonResp(ld || {}, 200, allowedOrigin);
        }
        const { upstream, data } = await getRagicRecordById(env, 'payments/2', rid);
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        return jsonResp(data || {}, 200, allowedOrigin);
      }

      if (action === 'getPaymentSource') {
        const sheetKey = url.searchParams.get('sheet');
        const where = url.searchParams.get('where');
        const sheetPath = PAYMENT_SOURCE_SHEETS[sheetKey];
        if (!sheetPath) return jsonResp({ error: 'invalid_sheet' }, 400, allowedOrigin);
        if (!where || !/^\d{7},(eq|gte|lte|gt|lt|like),.{1,50}$/.test(where)) return jsonResp({ error: 'invalid_where' }, 400, allowedOrigin);
        const { upstream, data } = await getFromRagic(env, sheetPath, `where=${encodeURIComponent(where)}&naming=EID&limit=0,10`);
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        return jsonResp(data || {}, 200, allowedOrigin);
      }

      if (action === 'submitPaymentReceipt') {
        const parsed = await processMultipart(request, allowedOrigin, PAYMENT_RECEIPT_FIELDS_WHITELIST, PAYMENT_RECEIPT_SIGNATURE_FIELDS);
        if (parsed.error) return parsed.error;
        if (!parsed.rid) return jsonResp({ error: 'missing_rid' }, 400, allowedOrigin);
        const upstream = await fetch(`${env.RAGIC_BASE}/payments/2/${parsed.rid}?api&v=3`, {
          method: 'POST', headers: { 'Authorization': 'Basic ' + env.RAGIC_KEY }, body: parsed.form,
        });
        const text = await upstream.text();
        let data = null; try { data = JSON.parse(text); } catch {}
        const fail = detectUpstreamFailure(upstream, data);
        if (fail) return jsonResp(fail, 502, allowedOrigin);
        return jsonResp({ ok: true, ragicId: data?.ragicId || parsed.rid }, 200, allowedOrigin);
      }

      if (action === 'submitPaymentSource') {
        const ct = request.headers.get('Content-Type') || '';
        if (!ct.toLowerCase().startsWith('multipart/form-data')) return jsonResp({ error: 'expect_multipart' }, 400, allowedOrigin);
        let form;
        try { form = await request.formData(); } catch { return jsonResp({ error: 'bad_multipart' }, 400, allowedOrigin); }
        const sheetKey = form.get('_sheet');
        const rid = form.get('_rid');
        const sheetPath = PAYMENT_SOURCE_SHEETS[sheetKey];
        if (!sheetPath) return jsonResp({ error: 'invalid_sheet' }, 400, allowedOrigin);
        if (typeof rid !== 'string' || !/^\d{1,12}$/.test(rid)) return jsonResp({ error: 'invalid_rid' }, 400, allowedOrigin);
        const newForm = new FormData();
        for (const [key, value] of form.entries()) {
          if (key === '_sheet' || key === '_rid') continue;
          if (!/^\d{7}$/.test(key)) return jsonResp({ error: 'invalid_field', key, reason: 'bad_format' }, 400, allowedOrigin);
          if (!PAYMENT_SOURCE_FIELDS_WHITELIST.has(key)) return jsonResp({ error: 'invalid_field', key, reason: 'not_whitelisted' }, 400, allowedOrigin);
          const strVal = typeof value === 'string' ? value : String(value);
          if (strVal.length > 100) return jsonResp({ error: 'value_too_long', key }, 400, allowedOrigin);
          newForm.append(key, strVal);
        }
        const upstream = await fetch(`${env.RAGIC_BASE}/${sheetPath}/${rid}?api&v=3`, {
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
          const resp = await fetch(
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
          // Skip wuohome mirror records (1000114='窩的家') - ap15 properties synced into ap16
          // for dual-tenant sync; shown via getYongceAllianceProperties to avoid map duplicates.
          if (rec['1000114'] === '窩的家') continue;
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
          const resp = await fetch(
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
          const resp = await fetch(
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

      // ============ Group F2: getYongceAllianceProperties (ap15 sheet21 + filterId=104, read-only) ============
      if (action === 'getYongceAllianceProperties') {
        let upstream, data;
        try {
          const resp = await fetch(
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
        for (const [rid, rec] of Object.entries(data)) {
          if (typeof rec !== 'object' || rec === null) continue;
          const clean = {};
          if (rec._ragicId !== undefined) clean._ragicId = rec._ragicId;
          for (const fid of YONGCE_ALLIANCE_PUBLIC_FIELD_IDS) {
            if (fid in rec) clean[fid] = rec[fid];
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
          filtered[rid] = clean;
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
        let rid = url.searchParams.get('rid');
        const code = url.searchParams.get('code');
        if (!rid && !code) return jsonResp({ error: 'missing_rid_or_code' }, 400, allowedOrigin);
        if (rid && !validRid(rid)) return jsonResp({ error: 'invalid_rid' }, 400, allowedOrigin);
        if (!rid && code) {
          if (typeof code !== 'string' || code.length > 50) return jsonResp({ error: 'invalid_code' }, 400, allowedOrigin);
          const lookupQs = `naming=EID&where=1002099,eq,${encodeURIComponent(code)}&limit=0,1`;
          const { upstream: lu, data: ld } = await getFromRagic(env, 'payments/5', lookupQs);
          if (!lu.ok) return jsonResp({ error: 'upstream_error', code: lu.status }, 502, allowedOrigin);
          const keys = Object.keys(ld || {});
          if (keys.length === 0) return jsonResp({ error: 'record_not_found' }, 404, allowedOrigin);
          const numericRid = String(keys[0]);
          if (!validRid(numericRid)) return jsonResp({ error: 'invalid_rid' }, 400, allowedOrigin);
          rid = numericRid;
          const record = ld[rid] || Object.values(ld)[0];
          return jsonResp({ _rid: rid, ...record }, 200, allowedOrigin);
        }
        const { upstream, data } = await getRagicRecordById(env, 'payments/5', rid);
        if (!upstream.ok) return jsonResp({ error: 'upstream_error', code: upstream.status }, 502, allowedOrigin);
        return jsonResp({ _rid: rid, ...data }, 200, allowedOrigin);
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
        const newForm = new FormData();
        for (const [key, value] of entries) {
          if (key === '_rid' || key === 'rid') {
            if (typeof value !== 'string' || !/^\d{1,12}$/.test(value)) {
              return jsonResp({ error: 'invalid_rid' }, 400, allowedOrigin);
            }
            rid = value;
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
        const ragicUrl = `${env.RAGIC_BASE}/payments/5/${rid}?api&v=3`;
        const upstream = await fetch(ragicUrl, {
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
        const tossUpstream = await fetch(
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

    } catch (e) {
      return jsonResp({ error: 'internal' }, 500, allowedOrigin);
    }

    return jsonResp({ error: 'not_implemented', action }, 501, allowedOrigin);
  },
};
