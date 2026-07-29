/**
 * 窩的家企業入口 — 心情留言板模組
 *
 * 契約：窩的家/系統部/規格書/窩的家企業入口_前端契約_公布欄與留言板
 *   action：portalListMoods / portalCreateMood / portalDeleteMood
 *   與公布欄的差別：陣列 key 是 moods 不是 posts、7 天保留、無置頂、上限 500 字。
 *
 * 視覺：沿用彣錩車可充入口頁的 .mood / .msg / .av / .react / .policy，不自創 class。
 *
 * 權限：發言全體同仁；刪除本人可刪自己的、管理層可刪任何一則
 *      （Joan 指定：一則不當留言沒人能刪會變成事故）。
 *      canDelete 只決定按鈕畫不畫，真正裁決在 Worker。
 */

import { escHtml, showToast, confirmDialog } from './shared.js';
import { portalGet, portalPost, errText, fmtTime } from './portal-api.js';

const ERR = {
  'forbidden:not_owner': '只能刪除自己的留言',
  not_found:             '這則留言已被刪除',
};

const MAX_LEN = 500;

let root = null;
let actor = '';

/**
 * @param {HTMLElement} el - 掛載點（index.html 的 #portal-moods）
 * @param {{name: string}} user - ensureAuth() 的回傳
 */
export async function mountMoods(el, user) {
  root = el;
  actor = user.name;

  root.innerHTML = `
    <h3><span class="e">💬</span>心情留言板<span class="note">全體同仁</span></h3>
    <div class="mood">
      <input id="pmInput" maxlength="${MAX_LEN}" placeholder="想說點什麼？">
      <button id="pmSend">送出</button>
    </div>
    <div class="scrollbox" id="pmList"><div class="empty">載入中⋯⋯</div></div>
    <div class="policy">💬 留言自動保留 7 天</div>`;

  const input = root.querySelector('#pmInput');
  root.querySelector('#pmSend').addEventListener('click', submit);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  root.querySelector('#pmList').addEventListener('click', onListClick);

  await reload();
}

// ════════════════════════════════════════════════════════════════
// 讀取與渲染
// ════════════════════════════════════════════════════════════════

async function reload() {
  const list = root.querySelector('#pmList');
  const res = await portalGet('portalListMoods', { actor });

  if (!res.ok) {
    list.innerHTML = `<div class="empty">${escHtml(errText(res, ERR))}</div>`;
    return;
  }

  const moods = res.data?.moods || [];
  list.innerHTML = moods.length
    ? moods.map(moodHtml).join('')
    : '<div class="empty">還沒有人留言，當第一個吧！</div>';
}

function moodHtml(m) {
  const name = String(m.authorName ?? '');
  const id = escHtml(m.id);
  return `
    <div class="msg">
      <div class="av">${escHtml(name.slice(0, 1) || '?')}</div>
      <div style="flex:1">
        <b>${escHtml(name)}</b>
        <p style="white-space:pre-wrap">${escHtml(m.content)}</p>
        <small>${fmtTime(m.createdAt)}</small>
        ${m.canDelete ? `<div class="react"><button data-act="del" data-id="${id}">🗑️ 刪除</button></div>` : ''}
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════
// 發言 / 刪除
// ════════════════════════════════════════════════════════════════

async function submit() {
  const input = root.querySelector('#pmInput');
  const btn = root.querySelector('#pmSend');
  const content = input.value;

  if (!content.trim()) { showToast('請輸入內容', 'warning'); input.focus(); return; }
  if (content.length > MAX_LEN) { showToast(`內容太長，上限 ${MAX_LEN} 字`, 'warning'); input.focus(); return; }

  btn.disabled = true;
  input.disabled = true;

  const res = await portalPost('portalCreateMood', { actor, content });

  btn.disabled = false;
  input.disabled = false;

  if (!res.ok) { showToast(errText(res, ERR), 'error'); return; }

  input.value = '';
  await reload();
  input.focus();
}

async function onListClick(e) {
  const btn = e.target.closest('button[data-act="del"]');
  if (!btn) return;

  const ok = await confirmDialog('確定要刪除這則留言嗎？');
  if (!ok) return;

  const res = await portalPost('portalDeleteMood', { actor, id: btn.dataset.id });
  if (!res.ok) showToast(errText(res, ERR), 'error');
  else showToast('留言已刪除');

  await reload();
}
