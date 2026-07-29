/**
 * 窩的家企業入口 — 公布欄模組
 *
 * 契約：窩的家/系統部/規格書/窩的家企業入口_前端契約_公布欄與留言板
 *   action：portalListPosts / portalCreatePost / portalPinPost / portalDeletePost
 *
 * 視覺：沿用彣錩車可充入口頁的 .post / .dot / .t / .m / .meta / .react / .addbtn / .policy，
 *      不自創 class（見 移植12系統_視覺基準 § 鐵律 1）。
 *
 * 契約 § 前端必須自己做的四件事，在本檔的落點：
 *   1. escape  → 所有 content / authorName 一律過 escHtml()
 *   2. 時區    → fmtTime() 轉 Asia/Taipei
 *   3. 權限    → canDelete / canPin 只決定按鈕畫不畫，真正裁決在 Worker
 *   4. 重拉    → 發布／置頂／刪除成功後一律 reload()，不做本地 patch
 */

import { escHtml, showToast, confirmDialog } from './shared.js';
import { portalGet, portalPost, errText, fmtTime } from './portal-api.js';

// 本模組專屬用語（覆蓋 portal-api.js 的通用字典）
const ERR = {
  'forbidden:not_manager': '只有管理層可以發布公告',
  'forbidden:not_owner':   '只能刪除自己發布的公告',
  not_found:               '這則公告已被刪除',
};

let root = null;   // 掛載點
let actor = '';    // ensureAuth() 回傳的 user.name 原字串，不加工

/**
 * @param {HTMLElement} el - 掛載點（index.html 的 #portal-board）
 * @param {{name: string}} user - ensureAuth() 的回傳
 */
export async function mountBoard(el, user) {
  root = el;
  actor = user.name;

  root.innerHTML = `
    <h3><span class="e">📌</span>公司公布欄<span class="note">管理層發布</span></h3>
    <div class="scrollbox" id="pbList"><div class="empty">載入中⋯⋯</div></div>
    <button class="addbtn" id="pbAdd" hidden>＋ 發布新公告</button>
    <div class="policy">📌 一般公告保留 30 天，置頂公告永遠顯示</div>`;

  root.querySelector('#pbAdd').addEventListener('click', openCompose);
  root.querySelector('#pbList').addEventListener('click', onListClick);

  await reload();
}

// ════════════════════════════════════════════════════════════════
// 讀取與渲染
// ════════════════════════════════════════════════════════════════

async function reload() {
  const list = root.querySelector('#pbList');
  const res = await portalGet('portalListPosts', { actor });

  if (!res.ok) {
    list.innerHTML = `<div class="empty">${escHtml(errText(res, ERR))}</div>`;
    return;
  }

  const posts = res.data?.posts || [];
  // 發布權限以 Worker 回的 viewer.isManager 為準，前端不另外維護一份管理層名單
  root.querySelector('#pbAdd').hidden = !res.data?.viewer?.isManager;

  list.innerHTML = posts.length
    ? posts.map(postHtml).join('')
    : '<div class="empty">目前沒有公告</div>';
}

function postHtml(p) {
  // content 是單一純文字欄位（契約沒有 title）。沿用原檔 .t／.m 兩段式版面：
  // 第一行當標題，其餘當內文；只有一行就不畫 .m。
  const lines = String(p.content ?? '').split('\n');
  const head = lines[0];
  const rest = lines.slice(1).join('\n').trim();

  const id = escHtml(p.id);
  const btns = [];
  if (p.canPin) {
    btns.push(`<button data-act="pin" data-id="${id}" data-pinned="${p.isPinned ? '1' : '0'}"${p.isPinned ? ' class="on"' : ''}>📌 ${p.isPinned ? '取消置頂' : '置頂'}</button>`);
  }
  if (p.canDelete) {
    btns.push(`<button data-act="del" data-id="${id}">🗑️ 刪除</button>`);
  }

  return `
    <div class="post">
      <div class="dot"${p.isPinned ? '' : ' style="background:var(--line)"'}></div>
      <div style="flex:1">
        <div class="t" style="white-space:pre-wrap">${p.isPinned ? '📌 ' : ''}${escHtml(head)}</div>
        ${rest ? `<div class="m" style="white-space:pre-wrap">${escHtml(rest)}</div>` : ''}
        <div class="meta">${escHtml(p.authorName)} · ${fmtTime(p.createdAt)}${p.isPinned ? ' · 置頂中' : ''}</div>
        ${btns.length ? `<div class="react">${btns.join('')}</div>` : ''}
      </div>
    </div>`;
}

// ════════════════════════════════════════════════════════════════
// 置頂 / 刪除
// ════════════════════════════════════════════════════════════════

async function onListClick(e) {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const { act, id } = btn.dataset;
  if (act === 'pin') await togglePin(btn, id);
  if (act === 'del') await removePost(id);
}

async function togglePin(btn, id) {
  // isPinned 必須是真 boolean，傳字串 "true" 會回 400 invalid_is_pinned
  const next = btn.dataset.pinned !== '1';
  btn.disabled = true;

  const res = await portalPost('portalPinPost', { actor, id, isPinned: next });
  if (!res.ok) {
    showToast(errText(res, ERR), 'error');
    if (res.error !== 'not_found') { btn.disabled = false; return; }
  } else {
    showToast(next ? '已置頂' : '已取消置頂');
  }
  await reload();
}

async function removePost(id) {
  const ok = await confirmDialog('確定要刪除這則公告嗎？刪除後同仁就看不到了。');
  if (!ok) return;

  const res = await portalPost('portalDeletePost', { actor, id });
  if (!res.ok) showToast(errText(res, ERR), 'error');
  else showToast('公告已刪除');

  await reload();
}

// ════════════════════════════════════════════════════════════════
// 發布
// ════════════════════════════════════════════════════════════════

const MAX_LEN = 2000;

function openCompose() {
  const ov = document.createElement('div');
  ov.className = 'ov show';
  ov.innerHTML = `
    <div class="modal">
      <button class="x" data-act="close" aria-label="關閉">×</button>
      <h2><span>📌</span>發布公告</h2>
      <div class="desc">第一行會顯示成標題，其餘為內文。全公司同仁都看得到。</div>
      <div class="field">
        <label for="pbContent">公告內容<span id="pbCount" style="float:right;font-weight:500">0 / ${MAX_LEN}</span></label>
        <textarea id="pbContent" rows="6" placeholder="例：本週五全公司大掃除&#10;下午 3 點開始，請各部門先清空自己的桌面。"></textarea>
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600">
          <input type="checkbox" id="pbPin" style="width:auto;margin:0">
          置頂（置頂的公告不受 30 天限制，會一直顯示）
        </label>
      </div>
      <button class="pbtn" data-act="submit">送出公告</button>
    </div>`;
  document.body.appendChild(ov);

  const ta = ov.querySelector('#pbContent');
  const count = ov.querySelector('#pbCount');
  const close = () => ov.remove();

  ta.addEventListener('input', () => {
    count.textContent = `${ta.value.length} / ${MAX_LEN}`;
    count.style.color = ta.value.length > MAX_LEN ? 'var(--coral)' : '';
  });

  ov.addEventListener('click', (e) => {
    if (e.target === ov || e.target.closest('[data-act="close"]')) { close(); return; }
    if (e.target.closest('[data-act="submit"]')) submit();
  });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  ta.focus();

  async function submit() {
    const content = ta.value;
    if (!content.trim()) { showToast('請輸入內容', 'warning'); ta.focus(); return; }
    if (content.length > MAX_LEN) { showToast(`內容太長，上限 ${MAX_LEN} 字`, 'warning'); ta.focus(); return; }

    const btn = ov.querySelector('.pbtn');
    btn.disabled = true;
    btn.textContent = '送出中⋯⋯';

    const res = await portalPost('portalCreatePost', {
      actor,
      content,
      isPinned: ov.querySelector('#pbPin').checked,  // 真 boolean
    });

    if (!res.ok) {
      showToast(errText(res, ERR), 'error');
      btn.disabled = false;
      btn.textContent = '送出公告';
      return;
    }

    close();
    showToast('公告已發布');
    await reload();
  }
}
