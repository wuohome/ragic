// 每日工作行程「清單填寫」模式：照搬 2026-07-26 V2 上線～2026-10-12 看板化前（wuohome/ragic 63590c44^）同仁實際用了兩個多月的
// 「我的日誌」填寫畫面，長相、文案、配色、排版都照舊（深藍主色、白底按鈕格、時間覆蓋條、卡片展開編輯）。
// 舊版沒有、現在必填的「人在哪」「做什麼」「地點」用舊版表單的視覺風格補上。
// 隔離：舊版靠 Tailwind，這裡只在第一次進清單模式時才載入 Tailwind CDN，並用 important:'#listmode' 把所有樣式鎖在清單容器內、
// 關掉 preflight（改用下面 BASE_CSS 的容器內版本），所以不會影響格子看板的任何樣式。
// 對外只有 window.WLList.show(host, deps)／hide()；身分、API、項目清單、必填規則由頁面（worklog.html）以 deps 傳入。
(function () {
  'use strict';

  const TW_CONFIG = {
    important: '#listmode',
    corePlugins: { preflight: false },
    theme: { extend: { colors: {
      ink: '#1F3A44', inkdeep: '#12262E', inkmuted: '#4B6570', inkfaint: '#7C9298',
      paper: '#F0F8FA', line: '#C3D6DB',
      coral: '#004C8C', coraldark: '#003864', coraltint: '#E1EEF8',
      submitted: '#146C2E',
      pending: '#8A5A00', pendingtint: '#FBF0DC', pendingdark: '#634100',
      overlap: '#C81E1E', overlapdark: '#8F1414', overlaptint: '#FBE3E3',
    } } },
  };

  // 舊版 <style>，每條選擇器都加上 #listmode 前綴；再加上 Tailwind preflight 的容器內最小版（只含這個畫面用得到的）
  const BASE_CSS = `
#listmode{font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC","Segoe UI",sans-serif;font-size:16px;line-height:1.5;color:#1F3A44;background:#fff;border-radius:16px;padding:20px 16px;color-scheme:light;
  --c-gap-a:#E1EEF8;--c-gap-b:#C3DCF0;--c-gap-a-hover:#CFE3F5;--c-gap-b-hover:#A9CDE9}
#listmode *,#listmode ::before,#listmode ::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:#e5e7eb}
#listmode h2,#listmode h3,#listmode p{margin:0}
#listmode h2,#listmode h3{font-size:inherit;font-weight:inherit}
#listmode button,#listmode input,#listmode select,#listmode textarea{font-family:inherit;font-size:100%;line-height:inherit;color:inherit;margin:0;padding:0}
#listmode button{background-color:transparent;background-image:none;cursor:pointer;text-transform:none;-webkit-appearance:button}
#listmode button:disabled{cursor:default}
#listmode svg{display:block;vertical-align:middle}
#listmode label{display:block}
#listmode select,#listmode textarea,#listmode input:not([type="checkbox"]){
  min-height:52px;font-size:17px!important;padding:12px 14px!important;border-width:2px!important;border-radius:12px!important;
  background-color:#FFFFFF!important;border-color:#B9CBD1!important;color:#1F3A44!important;width:100%}
#listmode select:focus,#listmode textarea:focus,#listmode input:not([type="checkbox"]):focus{border-color:#004C8C!important;outline:none;box-shadow:0 0 0 4px rgba(0,76,140,.18)}
#listmode .tnum{font-variant-numeric:tabular-nums}
#listmode .tap44{min-height:44px}
#listmode .wl-loading{text-align:center;color:#4B6570;padding:48px 0;font-size:15px}
#listmode select.time-part{padding:12px 4px!important;text-align:center;font-variant-numeric:tabular-nums}
#listmode .accordion{transition:grid-template-rows 200ms cubic-bezier(.23,1,.32,1)}
#listmode .accordion-inner{overflow:hidden}
#listmode .timeline-track{display:flex;width:100%;height:38px;border-radius:10px;overflow:hidden;border:2px solid #C3D6DB;background:#fff}
#listmode .timeline-seg{position:relative;height:100%;min-width:3px}
#listmode .timeline-seg-gap{background-image:repeating-linear-gradient(135deg,var(--c-gap-a) 0 7px,var(--c-gap-b) 7px 14px);cursor:pointer;border:none;padding:0}
#listmode .timeline-seg-gap:hover,#listmode .timeline-seg-gap:focus-visible{background-image:repeating-linear-gradient(135deg,var(--c-gap-a-hover) 0 7px,var(--c-gap-b-hover) 7px 14px)}
#listmode .timeline-seg-block{cursor:pointer;border:none;padding:0}
#listmode .timeline-seg-submitted{background:#146C2E}
#listmode .timeline-seg-pending{background:#FBF0DC;box-shadow:inset 0 0 0 2px #8A5A00}
#listmode .timeline-seg-overlap{background:#C81E1E}
#listmode .timeline-seg-overdue{background:repeating-linear-gradient(135deg,#FBF0DC 0 6px,#C81E1E 6px 12px);box-shadow:inset 0 0 0 2px #8A5A00}
#listmode .timeline-now-marker{position:absolute;top:-5px;bottom:-5px;width:2px;background:#1F3A44;z-index:5;pointer-events:none}
#listmode .timeline-now-dot{position:absolute;top:-12px;height:6px;width:6px;border-radius:999px;background:#1F3A44;transform:translateX(-2px);pointer-events:none}
#listmode .wl-toast{transition:opacity 200ms ease-out}
`;

  const CATEGORY_TONES = {
    field: 'border-[#6FC3AC] bg-[#D9F2EA] text-[#0A5A46]', contact: 'border-[#93A6EE] bg-[#E4E9FB] text-[#2A3C96]',
    deal: 'border-[#C297DC] bg-[#F0E4F8] text-[#632E86]', office: 'border-[#9FB6BF] bg-[#E6EDF0] text-[#35525E]',
    off: 'border-[#EFAF77] bg-[#FCE9D9] text-[#8A4200]', learn: 'border-[#DB9BD0] bg-[#F7E3F2] text-[#7A2168]',
    other: 'border-line bg-paper text-inkmuted',
  };
  const CATEGORY_TONE_OF = {
    場勘: 'field', 帶看: 'field', 驗收: 'field', 修繕: 'field', 退租點交: 'field', 拜訪屋主: 'field',
    租客聯繫: 'contact', 屋主聯繫: 'contact', 廠商聯繫: 'contact', 開發: 'contact', 電話開發: 'contact', 委託: 'contact', 議價: 'contact',
    報價: 'deal', 簽約: 'deal', 續約: 'deal',
    內部會議: 'office', 文書作業: 'office', 上廣告: 'office', '例會／開會': 'office', '文書／資料整理': 'office',
    請假: 'off', 休假: 'off', 上課: 'learn', 活動: 'learn',
  };

  let D = null;            // 頁面傳進來的 deps：{ api, viewer(), categories, defaultLoc, placeJunk(s), other, onSaved, onFail }
  let root = null, view = null;
  let ready = false, loading = false, stale = false, lastRO = false;
  let SELECTED_OFFSET = 0, EXPANDED_BLOCKS = new Set(), toastTimer = null, dateReq = 0;
  const LOADED = new Set();
  const NAV_MIN_OFFSET = -90, NAV_MAX_OFFSET = 1, STEP_MINUTES = 15;

  // ---------- 小工具（舊版原樣） ----------
  const pad = (n) => String(n).padStart(2, '0');
  function make(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  const byId = (id) => document.getElementById(id);
  function uid() { return 'x' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4); }
  function timeToMinutes(t) { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  function minutesToTime(mins) { mins = ((Math.round(mins) % 1440) + 1440) % 1440; return `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`; }
  function roundToStep(mins) { return Math.round(mins / STEP_MINUTES) * STEP_MINUTES; }
  const floorHour = (m) => Math.floor(m / 60) * 60, ceilHour = (m) => Math.ceil(m / 60) * 60;
  function nowMinutes() { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); }
  function formatDuration(mins) { const h = Math.floor(mins / 60), m = mins % 60; return h === 0 ? `${m} 分鐘` : m === 0 ? `${h} 小時` : `${h} 小時 ${m} 分`; }
  function dateStrForOffset(o) { const d = new Date(); d.setDate(d.getDate() + o); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function dateDisplayForOffset(o) { const d = new Date(); d.setDate(d.getDate() + o); return `${d.getMonth() + 1}/${d.getDate()}（${['日', '一', '二', '三', '四', '五', '六'][d.getDay()]}）`; }
  const selectedDateStr = () => dateStrForOffset(SELECTED_OFFSET);
  const selectedDateDisplay = () => dateDisplayForOffset(SELECTED_OFFSET);

  // ---------- 本機資料：依登入姓名分開存（共用電腦不會看到別人沒送出的草稿） ----------
  const storeKey = () => 'wuohome_worklog_list_v1:' + ((D.viewer() && D.viewer().name) || '');
  const RECENT_KEY = 'wuohome_worklog_list_recent_v1';
  function loadAllState() { try { return JSON.parse(localStorage.getItem(storeKey())) || {}; } catch { return {}; } } // ponytail-debt: 讀壞了就當沒有本機草稿，真相在伺服器
  function saveAllState(s) { try { localStorage.setItem(storeKey(), JSON.stringify(s)); } catch { /* ponytail-debt: 存不進去（無痕模式）只是沒有草稿保護，不影響送出 */ } }
  function getDayState(dateStr) { const all = loadAllState(); return all[dateStr] || { blocks: {} }; }
  function setDayState(dateStr, day) { const all = loadAllState(); all[dateStr] = day; saveAllState(all); }
  function loadRecentCats() { try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; } } // ponytail-debt: 同上，只是沒有「最近用過的排前面」
  function pushRecentCat(name) { if (!name) return; try { localStorage.setItem(RECENT_KEY, JSON.stringify([name, ...loadRecentCats().filter((x) => x !== name)].slice(0, 6))); } catch { /* ponytail-debt: 同上 */ } }
  function orderedCategories() {
    const base = D.categories;
    const recent = loadRecentCats().filter((c) => base.includes(c));
    return [...recent, ...base.filter((c) => !recent.includes(c))];
  }

  // ---------- Block ----------
  const OTHER = () => D.other;
  function blankBlock() { return { id: uid(), rid: null, start: '', end: '', category: '', otherCategoryText: '', location: '', caseName: '', repairReason: '', plannedSchedule: '', note: '', synced: false, saveError: null, isLegacy: false, legacyHourLabel: null }; }
  const isBlockFilled = (b) => !!(b && b.category);
  const blocksList = (day) => Object.values(day.blocks);
  function legacyHourSortHint(l) { return l === '0900之前' ? -1 : l === '19:00之後' ? 24 * 60 + 1 : 24 * 60; }
  function blockSortMinutes(b) { const m = timeToMinutes(b.start); return m != null ? m : (b.isLegacy ? legacyHourSortHint(b.legacyHourLabel) : 0); }
  const sortedBlocks = (day) => blocksList(day).slice().sort((a, b) => blockSortMinutes(a) - blockSortMinutes(b));
  function isOverdueUnrecorded(dateStr, block) {
    if (D.readOnly || block.isLegacy) return false;
    if (dateStr !== dateStrForOffset(0)) return false;
    if (!block.end || block.note || !block.category) return false;
    return timeToMinutes(block.end) < nowMinutes();
  }
  function suggestedStartTime(day) {
    const filled = blocksList(day).filter((b) => b.start && b.end);
    if (filled.length) return minutesToTime(Math.min(Math.max(...filled.map((b) => timeToMinutes(b.end))), 23 * 60 + 45));
    if (SELECTED_OFFSET === 0) return minutesToTime(Math.min(roundToStep(nowMinutes()), 23 * 60 + 45));
    return '09:00';
  }
  const suggestedEndTime = (st) => minutesToTime(Math.min(timeToMinutes(st) + 60, 23 * 60 + 45));
  function findOverlaps(day, blockId, start, end) {
    const s = timeToMinutes(start), e = timeToMinutes(end);
    if (s == null || e == null || e <= s) return [];
    return blocksList(day).filter((b) => b.id !== blockId && b.start && b.end).map((b) => {
      const os = Math.max(s, timeToMinutes(b.start)), oe = Math.min(e, timeToMinutes(b.end));
      return oe > os ? { block: b, minutes: oe - os } : null;
    }).filter(Boolean);
  }
  const blockHasOverlap = (day, block) => !!(block.start && block.end) && findOverlaps(day, block.id, block.start, block.end).length > 0;
  const labelOf = (b) => b.category === OTHER() ? (b.otherCategoryText || '其他') : (b.category || '未填項目');

  // ---------- Toast ----------
  function showToast(msg) {
    let t = byId('wl-toast');
    if (!t) { t = make('div', 'wl-toast fixed inset-x-0 bottom-24 z-[60] mx-auto w-fit max-w-[90vw] rounded-full bg-ink px-4 py-2 text-center text-sm font-bold text-white shadow-lg'); t.id = 'wl-toast'; t.style.opacity = '0'; root.append(t); }
    t.textContent = msg; t.style.opacity = '1'; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.style.opacity = '0'; }, 2400);
  }
  const emptyNote = (text) => make('div', 'rounded-xl border border-line bg-white p-4 text-center text-sm text-inkmuted', text);

  const CHEVRON_DOWN = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  const CHEVRON_UP = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
  function expandHintPill(expanded, filled) {
    let cls, text;
    if (expanded) { cls = 'border-line bg-paper text-ink'; text = '收合'; } else if (filled) { cls = 'border-line bg-white text-ink'; text = '查看'; } else { cls = 'border-coral bg-white text-coraldark'; text = '填寫'; }
    const pill = make('span', `flex shrink-0 items-center gap-1 rounded-full border-2 px-2.5 py-1 text-xs font-black ${cls}`);
    pill.append(make('span', '', text));
    const ic = make('span', 'flex h-4 w-4 shrink-0 items-center justify-center'); ic.innerHTML = expanded ? CHEVRON_UP : CHEVRON_DOWN; pill.append(ic);
    return pill;
  }
  const fieldLabel = (text) => make('label', 'block text-xs font-bold text-inkmuted', text);

  // ---------- 時間軸（舊版原樣） ----------
  function computeTimelineWindow(blocks) {
    const f = blocks.filter((b) => b.start && b.end);
    const st = f.map((b) => timeToMinutes(b.start)), en = f.map((b) => timeToMinutes(b.end));
    return { start: floorHour(st.length ? Math.min(...st, 7 * 60) : 7 * 60), end: ceilHour(en.length ? Math.max(...en, 20 * 60) : 20 * 60) };
  }
  function buildTimelineSegments(blocks, win) {
    const sorted = blocks.filter((b) => b.start && b.end).slice().sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
    const segs = []; let cursor = win.start;
    sorted.forEach((b) => {
      const s = Math.max(timeToMinutes(b.start), win.start, cursor), e = Math.min(timeToMinutes(b.end), win.end);
      if (e <= s) return;
      if (s > cursor) segs.push({ type: 'gap', start: cursor, end: s });
      segs.push({ type: 'block', start: s, end: e, block: b }); cursor = Math.max(cursor, e);
    });
    if (cursor < win.end) segs.push({ type: 'gap', start: cursor, end: win.end });
    return segs;
  }
  function legendDot(cls, style) { const d = make('span', `inline-block h-3 w-3 shrink-0 rounded-[3px] ${cls}`); if (style) Object.assign(d.style, style); return d; }
  function renderTimelineLegend() {
    const wrap = make('div', 'mt-2 flex flex-wrap gap-x-4 gap-y-1.5');
    [
      { dot: legendDot('bg-submitted'), label: '已送出' },
      { dot: legendDot('bg-pendingtint', { boxShadow: 'inset 0 0 0 2px #8A5A00' }), label: '尚未送出' },
      { dot: legendDot('bg-overlap'), label: '時間重疊' },
      { dot: legendDot('', { backgroundImage: 'repeating-linear-gradient(135deg, #FBF0DC 0 4px, #C81E1E 4px 8px)' }), label: '已排定・尚未補紀錄' },
      { dot: legendDot('', { backgroundImage: 'repeating-linear-gradient(135deg, var(--c-gap-a) 0 4px, var(--c-gap-b) 4px 8px)' }), label: '空檔（可點擊新增）' },
    ].forEach((it) => { const row = make('span', 'inline-flex items-center gap-1.5 text-[11px] font-bold text-inkmuted'); row.append(it.dot, make('span', '', it.label)); wrap.append(row); });
    return wrap;
  }
  function renderTimelineBar(dateStr, day, blocks) {
    const win = computeTimelineWindow(blocks), segs = buildTimelineSegments(blocks, win), totalMin = Math.max(win.end - win.start, 1);
    const wrap = make('div', 'mb-4'), track = make('div', 'timeline-track');
    segs.forEach((seg) => {
      const dur = Math.max(seg.end - seg.start, 1);
      if (seg.type === 'gap') {
        const btn = make('button', 'timeline-seg timeline-seg-gap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink');
        btn.type = 'button'; btn.style.flex = `${dur} 0 0%`; if (D.readOnly) { btn.disabled = true; btn.classList.add('pointer-events-none'); }
        btn.setAttribute('aria-label', `${minutesToTime(seg.start)}–${minutesToTime(seg.end)} 沒有紀錄，點擊新增`);
        if (!D.readOnly) btn.addEventListener('click', () => addBlock(dateStr, { start: minutesToTime(seg.start), end: minutesToTime(seg.end) }));
        track.append(btn);
      } else {
        const hasOverlap = blockHasOverlap(day, seg.block), overdue = isOverdueUnrecorded(dateStr, seg.block);
        const stateCls = overdue ? 'timeline-seg-overdue' : hasOverlap ? 'timeline-seg-overlap' : (seg.block.synced ? 'timeline-seg-submitted' : 'timeline-seg-pending');
        const stateText = overdue ? '（已排定・尚未補紀錄）' : hasOverlap ? '（時間重疊）' : seg.block.synced ? '（已送出）' : '（尚未送出）';
        const btn = make('button', `timeline-seg timeline-seg-block ${stateCls} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink`);
        btn.type = 'button'; btn.style.flex = `${dur} 0 0%`; if (D.readOnly) { btn.disabled = true; btn.classList.add('pointer-events-none'); }
        btn.setAttribute('aria-label', `${seg.block.start}–${seg.block.end} ${labelOf(seg.block)}${stateText}${seg.block.isLegacy ? '（舊版格式）' : ''}`);
        if (!D.readOnly) btn.addEventListener('click', () => {
          if (!seg.block.isLegacy) EXPANDED_BLOCKS.add(seg.block.id);
          renderView();
          requestAnimationFrame(() => { const el = byId(`row-block-${seg.block.id}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
        });
        track.append(btn);
      }
    });
    if (SELECTED_OFFSET === 0) {
      const now = nowMinutes();
      if (now >= win.start && now <= win.end) {
        const pct = ((now - win.start) / totalMin) * 100;
        const marker = make('div', 'timeline-now-marker'); marker.style.left = `${pct}%`;
        const dot = make('div', 'timeline-now-dot'); dot.style.left = `${pct}%`;
        const mw = make('div', 'relative'); mw.append(track, marker, dot);
        wrap.append(mw, renderTimelineLegend()); return wrap;
      }
    }
    wrap.append(track, renderTimelineLegend()); return wrap;
  }

  // ---------- 時間選擇（24 小時制「時：分」下拉）＋ 快速調整 ----------
  function timeSelectField(value, onCommit) {
    const wrap = make('div', 'mt-1 flex items-center gap-1');
    const hourSel = make('select', 'time-part min-w-0 flex-1'), minSel = make('select', 'time-part min-w-0 flex-1');
    const addOpt = (sel, val, label) => { const o = make('option', null, label); o.value = val; sel.append(o); };
    const cur = /^\d{1,2}:\d{2}$/.test(value || '') ? value.split(':') : ['', ''];
    const curHour = cur[0] ? pad(Number(cur[0])) : '', curMin = cur[1] ? pad(Number(cur[1])) : '';
    addOpt(hourSel, '', '時'); for (let h = 0; h < 24; h++) addOpt(hourSel, pad(h), pad(h));
    addOpt(minSel, '', '分'); for (let m = 0; m < 60; m += STEP_MINUTES) addOpt(minSel, pad(m), pad(m));
    if (curMin && Number(curMin) % STEP_MINUTES !== 0) addOpt(minSel, curMin, curMin);
    hourSel.value = curHour; minSel.value = curMin;
    function emit() {
      if (!hourSel.value) { if (!minSel.value) onCommit(''); return; }
      if (!minSel.value) minSel.value = '00';
      onCommit(`${hourSel.value}:${minSel.value}`);
    }
    hourSel.addEventListener('change', emit); minSel.addEventListener('change', emit);
    wrap.append(hourSel, make('span', 'shrink-0 text-sm font-bold text-inkmuted', ':'), minSel);
    return wrap;
  }
  function timeAdjustRow(getEnd, setEnd, rerender) {
    const row = make('div', 'mt-1.5 flex flex-wrap gap-1.5');
    [15, 30, 60].forEach((mins) => {
      const btn = make('button', 'tap44 rounded-lg border border-line px-2.5 text-xs font-bold text-ink transition-transform hover:bg-paper active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink', `+${mins < 60 ? mins + '分' : (mins / 60) + '小時'}`);
      btn.type = 'button';
      btn.addEventListener('click', () => { setEnd(minutesToTime(Math.min(timeToMinutes(getEnd()) + mins, 23 * 60 + 45))); rerender(); });
      row.append(btn);
    });
    const nowBtn = make('button', 'tap44 rounded-lg border border-line px-2.5 text-xs font-bold text-coraldark transition-transform hover:bg-paper active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink', '到現在');
    nowBtn.type = 'button';
    nowBtn.addEventListener('click', () => { setEnd(minutesToTime(roundToStep(nowMinutes()))); rerender(); });
    row.append(nowBtn); return row;
  }

  // ---------- 伺服器資料 ↔ Block ----------
  // 「其他」寫了什麼：新紀錄放在紀錄內容最前面的【做什麼】；舊紀錄（10/19 前）是把字寫在案名／地址欄
  function buildNoteForSubmit(b) { return b.category === OTHER() && b.otherCategoryText ? `【${b.otherCategoryText}】${b.note || ''}`.trim() : (b.note || ''); }
  function parseApiEntry(rec) {
    const isLegacy = !(rec.startTime && rec.endTime);
    let start = rec.startTime || '', end = rec.endTime || '', legacyHourLabel = null;
    if (isLegacy) {
      const m = /^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/.exec((rec.hour || '').trim());
      if (m) { start = `${m[1]}:${m[2]}`; end = `${m[3]}:${m[4]}`; } else legacyHourLabel = rec.hour || '';
    }
    const category = rec.category || '';
    let otherCategoryText = '', note = rec.note || '', caseName = rec.caseName || '';
    if (category === OTHER()) {
      const m = /^【([^】]*)】([\s\S]*)$/.exec(note);
      if (m) { otherCategoryText = m[1]; note = m[2]; } else if (!D.whatJunk.includes(caseName.trim())) { otherCategoryText = caseName; caseName = ''; }
    }
    // 舊紀錄沒有「人在哪」時，先帶項目的預設值（同仁可改）；開發／簽約分不出來，留空要他自己選
    const location = rec.location || (category && !['開發', '簽約'].includes(category) ? D.defaultLoc(category) : '');
    return { id: 'r' + rec.rid, rid: rec.rid, start, end, category, otherCategoryText, location, note, caseName,
      repairReason: rec.repairReason || '', plannedSchedule: rec.plannedSchedule || '', synced: true, saveError: null, isLegacy, legacyHourLabel };
  }
  // 2026-07-24 事故教訓：伺服器有的（有 rid）採用；本機沒有 rid 但已填的草稿保留，用「尚未送出」徽章讓使用者看得到
  function applyMineData(json, dateStr) {
    const existing = getDayState(dateStr), day = { blocks: {} };
    (json.entries || []).forEach((rec) => { const b = parseApiEntry(rec); day.blocks[b.id] = b; });
    if (!D.readOnly) Object.entries(existing.blocks || {}).forEach(([id, b]) => { if (!b.rid && isBlockFilled(b) && !day.blocks[id]) day.blocks[id] = { ...b, synced: false }; });
    setDayState(dateStr, day);
  }
  // 讀自己的紀錄：走 worklogBoard（任何登入方式——通行碼或 Google——都能用）再挑出填寫人是自己的那幾筆，所以 Worker 不必另開 action
  async function loadMineFromApi(dateStr) {
    const c = D.cachedBoard && D.cachedBoard(dateStr); // 頁面剛讀過同一天就直接用，不再打一次 Worker（2026-10-28 提速）
    const r = c ? { status: 200, json: c } : await D.api(`worklogBoard?date=${encodeURIComponent(dateStr)}`);
    if (r.status !== 200 || !r.json || r.json.ok !== true) return { ok: false, status: r.status };
    const me = D.viewer() && D.viewer().name;
    const mine = (r.json.entries || []).filter((e) => e.reporter === me && (e.source !== 'timetree' || D.readOnly));
    // TimeTree 行事曆帶入的行程（標題與顏色由 Worker 決定）轉成唯讀卡片；kind=out 算外出，away（請假）不標人在哪，其餘店內
    return { ok: true, json: { entries: mine.map((e) => e.source === 'timetree' ? { rid: String(e.rid), startTime: e.startTime, endTime: e.endTime, category: e.title || '行程', location: e.kind === 'out' ? '外出' : e.kind === 'away' ? '' : '店內' } : e) } };
  }
  async function switchSelectedDate(offset) {
    offset = Math.max(NAV_MIN_OFFSET, Math.min(NAV_MAX_OFFSET, offset));
    if (SELECTED_OFFSET === offset) return;
    const my = ++dateReq; SELECTED_OFFSET = offset; EXPANDED_BLOCKS = new Set();
    if (!LOADED.has(offset)) {
      renderView();
      const res = await loadMineFromApi(selectedDateStr());
      if (my !== dateReq) return;
      if (res.ok) { LOADED.add(offset); applyMineData(res.json, selectedDateStr()); }
    }
    renderView();
  }

  // ---------- 必填規則（與格子填寫同一套；Worker 另有雙重擋） ----------
  function blockProblem(b) {
    if (!b.category) return '先選一個項目。';
    if (!D.categories.includes(b.category) && b.category === '開發') return '「開發」已拆成電話開發和拜訪屋主，請選一個。';
    if (!b.location) return '選一下人是在店內還是外出。';
    if (b.category === OTHER() && !(b.otherCategoryText || '').trim()) return '選「其他」要寫一句做什麼。';
    if (b.location === '外出' && D.placeJunk.includes((b.caseName || '').trim())) return '外出要寫地點。';
    const s = timeToMinutes(b.start), e = timeToMinutes(b.end);
    if (s == null || e == null) return '請填寫開始與結束時間。';
    if (e <= s) return '結束時間必須晚於開始時間。';
    return '';
  }
  const ERR_TEXT = { not_on_board: '你不在名單上，這頁只能看', invalid_session: '登入已過期，請重新整理頁面再登入一次', not_whitelisted: '這個帳號沒有寫入權限', date_locked_past: '過去的日期不能再填寫', record_locked_cross_day: '這一筆是過去的紀錄，不能再改', not_found: '找不到這一筆（可能已被改動），請重新整理頁面', invalid_category: '這個項目目前不能存，請改選別的項目', value_too_long: '案名或地址太長了，請縮短', location_required: '頁面是舊版，請重新整理頁面再填', invalid_location: '請重新整理頁面再填', other_text_required: '選「其他」要寫一句做什麼', place_required: '外出要寫地點' };

  async function saveBlock(dateStr, blockId, btn) {
    if (D.readOnly) return; // 預覽：任何情況都不送出
    const day = getDayState(dateStr), block = day.blocks[blockId];
    if (!block) return;
    const pr = blockProblem(block);
    if (pr) { showToast(pr); return; }
    btn.disabled = true; btn.textContent = '儲存中…'; block.saveError = null;
    const entry = { startTime: block.start, endTime: block.end, category: block.category, location: block.location,
      caseName: block.caseName || '', repairReason: block.repairReason || '', plannedSchedule: block.plannedSchedule || '', note: buildNoteForSubmit(block) };
    if (block.rid) entry.rid = block.rid;
    const r = await D.api('worklogCreate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entries: [entry], date: dateStr, mode: 'list' }) }); // mode：後台記錄這次是用哪種填法存的
    const res = r.json && Array.isArray(r.json.results) ? r.json.results[0] : null;
    if (r.status !== 200 || !res || !res.ok) {
      const code = (res && res.error) || (r.json && r.json.error) || '';
      block.saveError = r.status === 0 ? '連線失敗，請檢查網路後重試（內容仍保留在草稿中，未遺失）' : `送出失敗：${ERR_TEXT[code] || code || '請稍後再試或截圖回報'}`;
      block.synced = false; setDayState(dateStr, day); renderView(); return;
    }
    block.rid = res.rid || block.rid; block.synced = true; block.saveError = null;
    setDayState(dateStr, day); EXPANDED_BLOCKS.delete(blockId); renderView();
    if (D.onSaved) D.onSaved();
  }
  function deleteBlock(dateStr, blockId) { const day = getDayState(dateStr); delete day.blocks[blockId]; setDayState(dateStr, day); EXPANDED_BLOCKS.delete(blockId); renderView(); }
  function addBlock(dateStr, prefill) {
    if (D.readOnly) return;
    const day = getDayState(dateStr), b = blankBlock();
    const start = (prefill && prefill.start) || suggestedStartTime(day);
    Object.assign(b, { start, end: (prefill && prefill.end) || suggestedEndTime(start) });
    day.blocks[b.id] = b; setDayState(dateStr, day); EXPANDED_BLOCKS.add(b.id); renderView();
    requestAnimationFrame(() => { const el = byId(`row-block-${b.id}`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  }
  function addFullDayBlock(dateStr) { addBlock(dateStr, { start: '09:00', end: '18:00' }); showToast('已建立整天區塊（09:00–18:00），可依實際情況調整起訖時間'); }

  // 按鈕格（舊版白底按鈕樣式）：項目與「人在哪」共用
  function buttonGrid(options, activeVal, onPick, cols, legacyExtra) {
    const grid = make('div', `mt-1.5 grid ${cols}`.trim() + ' gap-2');
    const list = legacyExtra && !options.includes(legacyExtra) ? [...options, legacyExtra] : options;
    list.forEach((name) => {
      const isActive = activeVal === name, isLegacy = name === legacyExtra && !options.includes(name);
      const btn = make('button', `tap44 rounded-xl border-2 px-2 py-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${isActive ? 'border-coral bg-coral text-white' : 'border-line bg-white text-ink hover:border-coral'}`, isLegacy ? `${name}（舊）` : name);
      btn.type = 'button'; btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.addEventListener('click', () => onPick(name)); grid.append(btn);
    });
    return grid;
  }
  function overlapWarningBox(day, block) {
    const overlaps = findOverlaps(day, block.id, block.start, block.end);
    if (!overlaps.length) return null;
    const box = make('div', 'rounded-lg border-2 border-overlap bg-overlaptint px-3 py-2');
    box.append(make('p', 'text-xs font-black text-overlapdark', `⚠ 時間跟其他紀錄重疊：${overlaps.map((o) => `${o.block.start}–${o.block.end}（${labelOf(o.block)}）重疊 ${formatDuration(o.minutes)}`).join('、')}`));
    box.append(make('p', 'mt-0.5 text-[11px] text-inkmuted', '仍可以送出——工作本來就可能交錯（例如中途被打斷去處理別的事），這裡只是提醒你確認一下是不是打錯時間。'));
    return box;
  }
  const INPUT_CLS = 'mt-1 block w-full rounded-lg border border-line px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink';

  function renderBlockRow(dateStr, day, block) {
    const filled = isBlockFilled(block), expanded = EXPANDED_BLOCKS.has(block.id), hasOverlap = blockHasOverlap(day, block), overdue = isOverdueUnrecorded(dateStr, block);
    const wrap = make('div', 'rounded-xl border border-line bg-white'); wrap.id = `row-block-${block.id}`;
    const headerBtn = make('button', `tap44 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-paper active:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${expanded ? 'rounded-t-xl' : 'rounded-xl'}`);
    headerBtn.type = 'button'; headerBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    const timeCol = make('div', 'w-[104px] shrink-0');
    timeCol.append(make('p', 'tnum text-sm font-black text-ink', block.start && block.end ? `${block.start}–${block.end}` : '（未設定時間）'));
    if (block.start && block.end) timeCol.append(make('p', 'tnum text-[10px] text-inkfaint', formatDuration(timeToMinutes(block.end) - timeToMinutes(block.start))));
    headerBtn.append(timeCol);
    const previewCol = make('div', 'min-w-0 flex-1');
    if (filled) {
      const line = make('p', 'flex flex-wrap items-center gap-1.5');
      line.append(make('span', 'inline-block shrink-0 rounded-full bg-paper px-2 py-0.5 text-xs font-bold text-inkmuted', labelOf(block)));
      if (block.location) line.append(make('span', `inline-block shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold ${block.location === '外出' ? 'border-coral bg-coraltint text-coraldark' : 'border-line bg-white text-inkmuted'}`, block.location));
      line.append(block.synced ? make('span', 'inline-flex shrink-0 items-center gap-0.5 rounded-full bg-submitted px-2 py-0.5 text-xs font-bold text-white', '✓ 已送出') : make('span', 'inline-block shrink-0 rounded-full border-2 border-pending bg-pendingtint px-2 py-0.5 text-xs font-bold text-pendingdark', '尚未送出'));
      if (overdue) line.append(make('span', 'inline-block shrink-0 rounded-full border-2 border-overlap bg-overlaptint px-2 py-0.5 text-xs font-bold text-overlapdark', '⏰ 已排定・尚未補紀錄'));
      if (hasOverlap) {
        const ov = findOverlaps(day, block.id, block.start, block.end);
        line.append(make('span', 'inline-block shrink-0 rounded-full border-2 border-overlap bg-overlaptint px-2 py-0.5 text-xs font-bold text-overlapdark', `⚠ 與 ${ov.length === 1 ? labelOf(ov[0].block) : `${ov.length} 筆`} 重疊`));
      }
      if (block.caseName) line.append(make('span', 'truncate text-sm font-bold text-ink', block.caseName));
      previewCol.append(line);
      if (block.plannedSchedule && !block.note) previewCol.append(make('p', 'mt-0.5 truncate text-xs text-inkmuted', `預計：${block.plannedSchedule}`));
      if (block.repairReason) previewCol.append(make('p', 'mt-0.5 truncate text-xs text-inkmuted', `報修原因：${block.repairReason}`));
    } else previewCol.append(make('p', 'text-sm text-inkmuted', '尚未填寫項目'));
    headerBtn.append(previewCol, expandHintPill(expanded, filled));
    headerBtn.addEventListener('click', () => { if (EXPANDED_BLOCKS.has(block.id)) EXPANDED_BLOCKS.delete(block.id); else EXPANDED_BLOCKS.add(block.id); renderView(); });
    wrap.append(headerBtn);
    if (!expanded) return wrap;

    const form = make('div', 'space-y-3 border-t border-line px-3 pb-3 pt-3');
    const mut = (fn) => { const d = getDayState(dateStr); const b = d.blocks[block.id]; if (b) { fn(b); setDayState(dateStr, d); } };
    const commitTime = (field, val) => mut((b) => { b[field] = val ? minutesToTime(roundToStep(timeToMinutes(val))) : ''; });
    const timeRow = make('div', 'grid grid-cols-2 gap-4');
    const startWrap = make('div'); startWrap.append(fieldLabel('開始時間'), timeSelectField(block.start, (v) => { commitTime('start', v); renderView(); }));
    const endWrap = make('div'); endWrap.append(fieldLabel('結束時間'), timeSelectField(block.end, (v) => { commitTime('end', v); renderView(); }));
    timeRow.append(startWrap, endWrap); form.append(timeRow);
    form.append(timeAdjustRow(() => getDayState(dateStr).blocks[block.id].end || block.start, (v) => commitTime('end', v), renderView));
    const overlapBox = overlapWarningBox(getDayState(dateStr), getDayState(dateStr).blocks[block.id]); if (overlapBox) form.append(overlapBox);

    form.append(fieldLabel('項目'));
    form.append(buttonGrid(orderedCategories(), block.category, (name) => {
      mut((b) => { b.category = name; if (name !== OTHER()) b.otherCategoryText = ''; b.location = D.defaultLoc(name); }); // 選項目自動帶入人在哪，可以再改
      pushRecentCat(name); renderView();
    }, 'grid-cols-2 sm:grid-cols-3', block.category && block.category !== '開發' ? block.category : ''));

    form.append(fieldLabel('人在哪（選了項目會自動帶入，可以改）'));
    form.append(buttonGrid(['店內', '外出'], block.location, (loc) => { mut((b) => { b.location = loc; }); renderView(); }, 'grid-cols-2'));

    const otherWrap = make('div', 'accordion grid'); otherWrap.style.gridTemplateRows = block.category === OTHER() ? '1fr' : '0fr';
    const otherInner = make('div', 'accordion-inner');
    const otherLabelEl = make('label', 'block pt-2 text-xs font-bold text-inkmuted', '做什麼（必填，請簡短說明）');
    const otherInput = make('input', INPUT_CLS); otherInput.type = 'text'; otherInput.maxLength = 60; otherInput.placeholder = '例如：整理買賣資料、搬運材料'; otherInput.value = block.otherCategoryText || '';
    otherLabelEl.append(otherInput); otherInner.append(otherLabelEl); otherWrap.append(otherInner); form.append(otherWrap);

    const outNow = block.location === '外出';
    const caseLabelEl = fieldLabel(outNow ? '地點（外出必填）' : '案名/地址（選填）');
    const caseInput = make('input', INPUT_CLS); caseInput.type = 'text'; caseInput.maxLength = 200; caseInput.setAttribute('list', 'worklogCaseList');
    caseInput.placeholder = outNow ? '例如：化成路764巷4樓' : '輸入案名或地址，沒有可留空'; caseInput.value = block.caseName || '';
    caseLabelEl.append(caseInput); form.append(caseLabelEl);

    const planLabelEl = fieldLabel('預先排定行程（選填・建議上午先填）');
    const planInput = make('input', INPUT_CLS); planInput.type = 'text'; planInput.placeholder = '例如：原本排定 10 點去王公館驗收'; planInput.value = block.plannedSchedule || '';
    planLabelEl.append(planInput); form.append(planLabelEl);

    const noteLabelEl = fieldLabel('紀錄內容（選填・建議下班前補齊，簡短就好）');
    const noteTextarea = make('textarea', 'mt-1 block w-full rounded-lg border border-line px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink');
    noteTextarea.rows = 2; noteTextarea.maxLength = 150; noteTextarea.placeholder = '這段時間實際發生的細節，例如：完成客廳插座配線'; noteTextarea.value = block.note || '';
    const counter = make('p', 'tnum mt-1 text-right text-[11px] text-inkfaint', `${noteTextarea.value.length}/150`);
    noteLabelEl.append(noteTextarea); form.append(noteLabelEl, counter);

    if (block.saveError) {
      const errBox = make('div', 'rounded-lg border-2 border-red-300 bg-red-50 px-3 py-2');
      errBox.append(make('p', 'text-xs font-black text-red-700', '上次儲存失敗，內容還在，請確認後重試'), make('p', 'mt-0.5 text-xs text-red-600', block.saveError));
      form.append(errBox);
    }
    const problemP = make('p', 'text-xs font-bold text-pendingdark'); problemP.setAttribute('aria-live', 'polite'); form.append(problemP);
    const actionsRow = make('div', 'flex flex-wrap items-center gap-2 pt-1');
    const saveBtn = make('button', 'tap44 rounded-xl bg-coral px-4 text-sm font-black text-white transition-transform hover:bg-coraldark active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:opacity-50', block.saveError ? '重試儲存' : (block.synced ? '重新儲存' : '儲存這筆'));
    saveBtn.type = 'button'; saveBtn.addEventListener('click', () => saveBlock(dateStr, block.id, saveBtn)); actionsRow.append(saveBtn);
    const refreshProblem = () => { const pr = blockProblem(getDayState(dateStr).blocks[block.id] || block); problemP.textContent = pr; saveBtn.disabled = !!pr; };
    otherInput.addEventListener('input', () => { mut((b) => { b.otherCategoryText = otherInput.value; }); refreshProblem(); });
    caseInput.addEventListener('input', () => { mut((b) => { b.caseName = caseInput.value; }); refreshProblem(); });
    planInput.addEventListener('input', () => mut((b) => { b.plannedSchedule = planInput.value; }));
    noteTextarea.addEventListener('input', () => { mut((b) => { b.note = noteTextarea.value; }); counter.textContent = `${noteTextarea.value.length}/150`; });
    refreshProblem();
    if (!block.synced) {
      const delBtn = make('button', 'tap44 rounded-lg border border-line px-3 text-xs font-bold text-inkmuted hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink', '刪除這筆');
      delBtn.type = 'button'; delBtn.addEventListener('click', () => { if (confirm('刪除這筆尚未送出的草稿？')) deleteBlock(dateStr, block.id); }); actionsRow.append(delBtn);
    }
    actionsRow.append(make('span', 'flex-1'));
    const collapseBtn = make('button', 'tap44 rounded-lg px-3 text-xs font-bold text-inkmuted hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink', '收合');
    collapseBtn.type = 'button'; collapseBtn.addEventListener('click', () => { EXPANDED_BLOCKS.delete(block.id); renderView(); }); actionsRow.append(collapseBtn);
    form.append(actionsRow); wrap.append(form); return wrap;
  }

  // 唯讀卡片：過去日期、舊小時格式紀錄
  function categoryToneClass(label) { return CATEGORY_TONES[CATEGORY_TONE_OF[label]] || CATEGORY_TONES.other; }
  function memberEntryLine(dateStr, b) {
    const wrap = make('div', 'rounded-lg bg-paper p-2.5 text-sm'); wrap.id = `row-block-${b.id}`;
    const top = make('p', 'flex flex-wrap items-center gap-1.5');
    top.append(make('span', 'tnum text-xs font-bold text-inkfaint', (b.start && b.end) ? `${b.start}–${b.end}` : (b.isLegacy && b.legacyHourLabel) ? b.legacyHourLabel : '（時段未知）'));
    top.append(make('span', `rounded-full border px-2 py-0.5 text-xs font-bold ${categoryToneClass(labelOf(b))}`, labelOf(b)));
    if (b.location) top.append(make('span', 'rounded-full border border-line bg-white px-2 py-0.5 text-xs font-bold text-inkmuted', b.location));
    if (b.isLegacy) top.append(make('span', 'rounded-full border border-inkfaint/50 bg-white px-2 py-0.5 text-[10px] font-bold text-inkfaint', '舊版格式'));
    if (isOverdueUnrecorded(dateStr, b)) top.append(make('span', 'rounded-full border-2 border-overlap bg-overlaptint px-2 py-0.5 text-xs font-bold text-overlapdark', '⏰ 已排定・尚未補紀錄'));
    if (b.caseName) top.append(make('span', 'text-ink', b.caseName));
    wrap.append(top);
    if (b.repairReason) wrap.append(make('p', 'mt-1 text-xs text-inkmuted', `報修原因：${b.repairReason}`));
    if (b.plannedSchedule) wrap.append(make('p', 'mt-0.5 text-xs text-inkmuted', `預先排定：${b.plannedSchedule}`));
    if (b.note) wrap.append(make('p', 'mt-0.5 text-xs text-ink', b.note));
    return wrap;
  }

  function dateNavRow(offset, onChange) {
    const wrap = make('div', 'mb-4 flex flex-wrap items-center gap-2');
    const atMin = offset <= NAV_MIN_OFFSET;
    const prevBtn = make('button', `tap44 rounded-lg border-2 border-line px-3 text-sm font-bold text-ink hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink${atMin ? ' cursor-not-allowed opacity-40' : ''}`, '‹ 前一天');
    prevBtn.type = 'button'; prevBtn.disabled = atMin; if (atMin) prevBtn.title = `最多只能往回看 ${-NAV_MIN_OFFSET} 天`;
    prevBtn.addEventListener('click', () => onChange(offset - 1)); wrap.append(prevBtn);
    wrap.append(make('span', 'tnum rounded-lg bg-paper px-3 py-2 text-sm font-black text-ink', dateDisplayForOffset(offset)));
    const atMax = offset >= NAV_MAX_OFFSET;
    const nextBtn = make('button', `tap44 rounded-lg border-2 border-line px-3 text-sm font-bold text-ink hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink${atMax ? ' cursor-not-allowed opacity-40' : ''}`, '後一天 ›');
    nextBtn.type = 'button'; nextBtn.disabled = atMax; if (atMax) nextBtn.title = '目前只開放排到明天';
    nextBtn.addEventListener('click', () => onChange(offset + 1)); wrap.append(nextBtn);
    const pillGroup = make('div', 'inline-flex gap-1 rounded-xl border-2 border-line bg-white p-1');
    [{ off: 0, label: '今天' }, { off: 1, label: '明天' }].forEach((opt) => {
      const btn = make('button', `tap44 rounded-lg px-3 text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink ${offset === opt.off ? 'bg-coral text-white' : 'text-inkmuted hover:bg-paper'}`, opt.label);
      btn.type = 'button'; btn.addEventListener('click', () => onChange(opt.off)); pillGroup.append(btn);
    });
    wrap.append(pillGroup);
    if (offset !== 0) { const t = make('button', 'tap44 rounded-lg bg-ink px-3 text-sm font-black text-white hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink', '回到今天'); t.type = 'button'; t.addEventListener('click', () => onChange(0)); wrap.append(t); }
    return wrap;
  }

  function renderView() {
    if (!view) return;
    view.replaceChildren();
    const dateStr = selectedDateStr(), day = getDayState(dateStr), isTomorrow = SELECTED_OFFSET === 1, isPast = SELECTED_OFFSET < 0;
    const head = make('div', 'mb-4');
    head.append(make('p', 'text-xs font-bold tracking-wide text-coraldark', '窩的家・自訂起訖時間'));
    head.append(make('h2', 'text-xl font-black text-ink sm:text-2xl', isPast ? `${selectedDateDisplay()} 的紀錄` : isTomorrow ? '明天，你打算做什麼？' : '今天，你在忙什麼？'));
    head.append(make('p', 'mt-1 text-sm text-inkmuted', isPast ? `${selectedDateDisplay()}・這天已鎖定不可修改，僅供查看。`
      : isTomorrow ? `${selectedDateDisplay()}・先列幾筆明天的計畫（填「預先排定行程」即可），時間到了再回來補實際紀錄。`
      : `${selectedDateDisplay()}・想幾點記就幾點記；早上先排大概行程（填「預先排定行程」），下班前回來把「紀錄內容」補齊——同一筆補、不用重填。`));
    view.append(head, dateNavRow(SELECTED_OFFSET, switchSelectedDate));
    if (D.readOnly) view.append(make('div', 'mb-4 rounded-xl border-2 border-coral bg-coraltint px-4 py-2.5 text-sm font-black text-coraldark', `預覽：這是同仁看到的清單填寫畫面。${D.readOnlyReason || '你這天不能填。'}`));
    if (isPast) { // 過去日期：後端只收今天或未來，前端同步鎖成純唯讀（不顯示任何輸入欄位）
      view.append(make('div', 'mb-4 rounded-xl border-2 border-line bg-paper px-4 py-2.5 text-sm font-black text-ink', `🔒 這是 ${selectedDateDisplay()} 的紀錄，已鎖定不可修改`));
      const list = make('div', 'space-y-2'), blocks = sortedBlocks(day);
      if (!blocks.length) list.append(emptyNote(`${selectedDateDisplay()} 這天沒有紀錄。`)); else blocks.forEach((b) => list.append(memberEntryLine(dateStr, b)));
      view.append(list); return;
    }
    if (D.readOnly) { // 預覽：只看時間條與唯讀卡片，沒有任何寫入入口
      const pb = blocksList(day), pl = make('div', 'space-y-2');
      view.append(renderTimelineBar(dateStr, day, pb), make('h3', 'mb-2 text-sm font-black text-ink', isTomorrow ? '明天的紀錄' : '今天的紀錄'));
      if (!pb.length) pl.append(emptyNote('這一排沒有紀錄。')); else sortedBlocks(day).forEach((b) => pl.append(memberEntryLine(dateStr, b)));
      view.append(pl); return;
    }
    const unsynced = blocksList(day).filter((b) => isBlockFilled(b) && !b.synced);
    if (unsynced.length) view.append(make('div', 'mb-4 rounded-xl border-2 border-pending bg-pendingtint px-4 py-2.5 text-sm font-black text-pendingdark', `⚠ 你有 ${unsynced.length} 筆已經填寫但還沒送出成功，展開後按「儲存這筆」才會真的存進系統`));
    const overdueList = blocksList(day).filter((b) => isOverdueUnrecorded(dateStr, b));
    if (!isTomorrow && overdueList.length) view.append(make('div', 'mb-4 rounded-xl border-2 border-overlap bg-overlaptint px-4 py-2.5 text-sm font-black text-overlapdark', `⏰ 有 ${overdueList.length} 筆時段已過但「紀錄內容」還空著，記得回頭補一下`));
    const quickRow = make('div', 'mb-4 flex flex-wrap gap-2');
    const addBtn = make('button', 'tap44 rounded-xl bg-coral px-4 text-sm font-black text-white transition-transform hover:bg-coraldark active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink', '+ 新增一筆');
    addBtn.type = 'button'; addBtn.addEventListener('click', () => addBlock(dateStr));
    const fullDayBtn = make('button', 'tap44 rounded-xl border-2 border-line px-4 text-sm font-bold text-ink hover:bg-paper focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink', '整天都在忙同一件事');
    fullDayBtn.type = 'button'; fullDayBtn.addEventListener('click', () => addFullDayBlock(dateStr));
    quickRow.append(addBtn, fullDayBtn); view.append(quickRow);
    const blocks = blocksList(day);
    view.append(renderTimelineBar(dateStr, day, blocks), make('h3', 'mb-2 text-sm font-black text-ink', isTomorrow ? '明天的紀錄' : '今天的紀錄'));
    const list = make('div', 'space-y-2');
    if (!blocks.length) list.append(emptyNote('還沒有任何紀錄，點上面「+ 新增一筆」開始。'));
    else sortedBlocks(day).forEach((b) => list.append(b.isLegacy ? memberEntryLine(dateStr, b) : renderBlockRow(dateStr, day, b)));
    view.append(list);
    const still = blocksList(day).filter((b) => isBlockFilled(b) && !b.synced);
    if (still.length) {
      view.append(make('div', 'h-4'));
      const bar = make('div', 'rounded-xl border-2 border-pending bg-white px-4 py-3'), row = make('div', 'flex items-center justify-between gap-3');
      row.append(make('p', 'text-sm font-bold text-pendingdark', `還有 ${still.length} 筆尚未送出成功`));
      const retry = make('button', 'tap44 shrink-0 rounded-xl bg-ink px-4 text-sm font-black text-white hover:bg-ink/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink', '全部重試送出');
      retry.type = 'button';
      retry.addEventListener('click', async () => { retry.disabled = true; retry.textContent = '送出中…'; for (const b of still) await saveBlock(dateStr, b.id, retry); renderView(); }); // eslint-disable-line no-await-in-loop
      row.append(retry); bar.append(row); view.append(bar);
    }
  }

  // ---------- 載入（第一次顯示才載 Tailwind、才抓資料） ----------
  let twLoad = null; // 同一個載入只發一次（warm() 可能先開始載）
  function ensureTailwind(cb, fail) {
    if (window.tailwind && window.tailwind.__wl) { cb(); return; }
    if (!twLoad) twLoad = new Promise((ok, no) => {
      const s = document.createElement('script'); s.src = 'https://cdn.tailwindcss.com';
      s.onload = () => { window.tailwind.config = TW_CONFIG; window.tailwind.__wl = true; ok(); };
      s.onerror = () => { twLoad = null; no(); }; document.head.append(s);
    });
    twLoad.then(cb, fail);
  }
  function warm() { ensureTailwind(() => {}, () => {}); } // 上次用清單模式的人：頁面一打開就先載樣式，跟讀資料同時進行
  async function firstLoad() {
    loading = true;
    const res = await loadMineFromApi(dateStrForOffset(0));
    if (res.ok) { LOADED.add(0); applyMineData(res.json, dateStrForOffset(0)); }
    loading = false; ready = true; renderView();
    const ld = root.querySelector('.wl-loading'); if (ld) ld.remove(); view.hidden = false; // Tailwind 產生樣式需要一個 frame，畫完才顯示，免得閃一下沒樣式的畫面
  }
  function show(host, deps) {
    D = deps; root = host; root.hidden = false;
    if (ready) { if (stale || lastRO !== !!D.readOnly) { stale = false; lastRO = !!D.readOnly; reload(); } else if (!view.childNodes.length) renderView(); return; }
    if (loading || root.dataset.init) return;
    root.dataset.init = '1'; lastRO = !!D.readOnly;
    root.id = 'listmode';
    const st = document.createElement('style'); st.textContent = BASE_CSS; document.head.append(st);
    root.innerHTML = '<p class="wl-loading">載入中…</p><datalist id="worklogCaseList"></datalist><section id="view-worklog" class="mx-auto max-w-2xl" hidden></section>';
    view = byId('view-worklog'); // 樣式（Tailwind CDN）與資料都到齊前先秀「載入中…」，免得手機網路慢時按了切換只看到一片空白
    ensureTailwind(() => { renderView(); setTimeout(firstLoad, 120); }, () => { root.dataset.init = ''; root.hidden = true; if (D.onFail) D.onFail(); });
  }
  async function reload() { // 切換模式回來：格子那邊可能已經存過東西，重抓目前這天
    LOADED.clear(); const res = await loadMineFromApi(selectedDateStr());
    if (res.ok) { LOADED.add(SELECTED_OFFSET); applyMineData(res.json, selectedDateStr()); }
    renderView();
  }
  function hide() { if (root) root.hidden = true; }
  function invalidate() { stale = true; }
  window.WLList = { show, hide, invalidate, warm };
})();
