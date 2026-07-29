/**
 * 窩的家企業入口 — portal action 共用薄封裝
 *
 * 契約：窩的家/系統部/規格書/窩的家企業入口_前端契約_公布欄與留言板（介面凍結點）
 *
 * 為什麼不直接用 shared.js 的 workerGet：
 *   workerGet 在非 200 時直接 throw Error，機器錯誤碼被包進字串裡拿不回來，
 *   對不上契約的錯誤總表。這裡一律回 { ok, status, data, error }，不 throw。
 *
 * 為什麼公布欄與留言板共用這一支：
 *   錯誤總表只有一份。兩支模組各留一份字典，日後改一邊就會 drift。
 */

import { WORKER_BASE, workerPostJson } from './shared.js';

/** 讀（GET）。參數走 query string。 */
export async function portalGet(action, params = {}) {
  const qs = new URLSearchParams(params).toString();
  try {
    const res = await fetch(`${WORKER_BASE}/${action}${qs ? '?' + qs : ''}`);
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    return { ok: res.ok, status: res.status, data, error: res.ok ? null : (data?.error || 'network_error') };
  } catch {
    return { ok: false, status: 0, data: null, error: 'network_error' };
  }
}

/** 寫（POST，JSON body）。 */
export async function portalPost(action, payload = {}) {
  const r = await workerPostJson(action, payload);
  return { ...r, error: r.ok ? null : (r.data?.error || 'network_error') };
}

// 契約 § 錯誤總表「前端該怎麼講」那一欄。
// forbidden 與 content_too_long 要看附帶欄位，另外處理，不放在這裡。
const ERR_TEXT = {
  bad_json:                '送出失敗，請重試',
  invalid_actor:           '請先在右上角選擇你是誰',
  empty_content:           '請輸入內容',
  invalid_id:              '這則已不存在，請重新整理',
  invalid_is_pinned:       '系統內部錯誤，請通知管理部',
  not_found:               '這則已被刪除',
  method_not_allowed:      '系統內部錯誤，請通知管理部',
  supabase_not_configured: '系統維護中，請通知管理部',
  supabase_error:          '暫時無法載入，稍後再試',
  supabase_unreachable:    '暫時無法載入，稍後再試',
  write_unverified:        '送出結果不明，請重新整理確認',
  network_error:           '連線失敗，請檢查網路後重試',
};

/**
 * 把 portalGet / portalPost 的結果轉成給同仁看的中文訊息。
 * @param {{error: string|null, data: any}} res
 * @param {Record<string,string>} [overrides] - 模組專屬用語，
 *        例如 { 'forbidden:not_manager': '只有管理層可以發布公告' }
 */
export function errText(res, overrides = {}) {
  const code = res.error;

  if (code === 'content_too_long') {
    const max = res.data?.max;
    return max ? `內容太長，上限 ${max} 字` : '內容太長';
  }

  if (code === 'forbidden') {
    const reason = res.data?.reason;
    return overrides[`forbidden:${reason}`] || overrides.forbidden || '沒有權限執行這個動作';
  }

  return overrides[code] || ERR_TEXT[code] || '發生未預期的錯誤，請重新整理';
}

/**
 * createdAt 是 UTC ISO-8601，顯示前一律轉台北時間（契約 § 前端必須自己做的四件事 第 2 點）。
 * @param {string} utcIso
 */
export function fmtTime(utcIso) {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
