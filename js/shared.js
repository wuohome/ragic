/**
 * 窩的家｜租賃部業務系統 — 共用模組
 * API 封裝、人名統一、人員驗證、UI 元件、地址工具
 */

// ════════════════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════════════════

export const API_KEY = 'VEZsOEwzYzVJdWdoWXRDM3ptS2YwRytLV21BaWhPTDRLWXhPb2FLZ3VBUm1BZE90VzJtZzlTNjVlbCszRnZkRw==';
export const API_BASE = 'https://ap15.ragic.com/wuohome';

export const MANAGERS = new Set(['吳彥廷', '韓珊珊', '張瓊安', '蕭靜芳']);
export const EXCLUDE_DEVS = new Set(['張瓊安', 'minor', '孟書', '廖崇勝', '陳泳竹']);
export const EXCLUDE_KEYWORDS = ['測試'];

export const NAME_ALIASES = {
  'TINA':'蕭靜芳','TINA（蕭靜芳）':'蕭靜芳',
  '蕭眞儀':'張忠豪&蕭眞儀','眞儀':'張忠豪&蕭眞儀','張忠豪':'張忠豪&蕭眞儀','忠豪':'張忠豪&蕭眞儀',
  '忠豪&眞儀':'張忠豪&蕭眞儀','張忠豪、蕭眞儀':'張忠豪&蕭眞儀','蕭眞儀、張忠豪':'張忠豪&蕭眞儀',
  '宣佑':'林宣佑','惠慈':'吳惠慈','張傳':'詹張傳','小碩':'劉子碩','小鐘':'鐘晟鈺',
  '炫儒':'吳炫儒','佳燕':'林佳燕','心瑜':'陳心瑜','則泓':'張則泓','薇雅':'陳薇雅',
  '卓威':'李卓威','小方':'方鼎文','馬丁':'關宗宇','小吳哥':'吳彥廷',
};

// ════════════════════════════════════════════════════════════════
// RAGIC API
// ════════════════════════════════════════════════════════════════

export async function ragicGet(path, params = '') {
  const sep = params ? '&' : '';
  const url = `${API_BASE}/${path}?api${sep}${params}&APIKey=${encodeURIComponent(API_KEY)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Ragic API ${res.status}: ${path}`);
  return res.json();
}

export async function ragicPost(path, data = {}) {
  const url = `${API_BASE}/${path}?api&v=3&APIKey=${encodeURIComponent(API_KEY)}`;
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null) body.append(k, v);
  }
  const res = await fetch(url, { method: 'POST', body });
  if (!res.ok) throw new Error(`Ragic POST ${res.status}: ${path}`);
  return res.json();
}

// ════════════════════════════════════════════════════════════════
// NAME UTILS
// ════════════════════════════════════════════════════════════════

export function normalizeName(name) {
  return NAME_ALIASES[name] || name;
}

export function isExcluded(name) {
  return EXCLUDE_DEVS.has(name) || EXCLUDE_KEYWORDS.some(k => name.includes(k));
}

// ════════════════════════════════════════════════════════════════
// AUTH / USER SESSION
// ════════════════════════════════════════════════════════════════

const LS_KEY = 'wuohome_current_user';

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY));
  } catch { return null; }
}

export function setCurrentUser(user) {
  localStorage.setItem(LS_KEY, JSON.stringify(user));
}

export function clearCurrentUser() {
  localStorage.removeItem(LS_KEY);
}

export function isManager(name) {
  return MANAGERS.has(name);
}

export async function fetchStaffList() {
  const key = 'wuohome_staff_list';
  const cached = sessionStorage.getItem(key);
  if (cached) return JSON.parse(cached);

  const raw = await ragicGet('ragicforms4/20004', 'limit=200');
  const list = [];
  for (const rec of Object.values(raw)) {
    const name = (rec['姓名'] || '').trim();
    const dept = (rec['部門'] || '').trim();
    const status = (rec['在職狀態'] || rec['狀態'] || '').trim();
    if (name && status === '在職') {
      list.push({ name, dept, isManager: isManager(name) });
    }
  }
  list.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
  sessionStorage.setItem(key, JSON.stringify(list));
  return list;
}

/**
 * Show login picker if no user selected. Returns current user.
 * @param {HTMLElement} container - Element to render picker into
 */
export async function ensureAuth(container) {
  let user = getCurrentUser();
  if (user) return user;

  const staff = await fetchStaffList();

  return new Promise(resolve => {
    container.innerHTML = `
      <div class="min-h-screen flex items-center justify-center bg-slate-50">
        <div class="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
          <div class="text-center mb-6">
            <div class="text-3xl mb-2">🏠</div>
            <h1 class="text-xl font-bold text-slate-900">窩的家 租賃部系統</h1>
            <p class="text-slate-500 text-sm mt-1">請選擇您的姓名</p>
          </div>
          <select id="staffSelect" class="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            <option value="">— 選擇人員 —</option>
            ${staff.map(s => `<option value='${JSON.stringify(s).replace(/'/g, "&#39;")}'>${s.name}（${s.dept}）</option>`).join('')}
          </select>
          <button id="loginBtn" disabled class="w-full mt-4 bg-blue-600 text-white rounded-lg px-4 py-3 text-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition">進入系統</button>
        </div>
      </div>`;

    const sel = document.getElementById('staffSelect');
    const btn = document.getElementById('loginBtn');
    sel.addEventListener('change', () => { btn.disabled = !sel.value; });
    btn.addEventListener('click', () => {
      const u = JSON.parse(sel.value);
      setCurrentUser(u);
      resolve(u);
    });
  });
}

/**
 * Render user badge in top-right corner with switch option
 */
export function renderUserBadge(headerEl, user) {
  const badge = document.createElement('div');
  badge.className = 'flex items-center gap-2 text-sm';
  badge.innerHTML = `
    <span class="text-slate-600">${user.name}</span>
    <button id="switchUser" class="text-slate-400 hover:text-slate-600 text-xs underline">切換</button>`;
  headerEl.appendChild(badge);
  document.getElementById('switchUser').addEventListener('click', () => {
    clearCurrentUser();
    location.reload();
  });
}

// ════════════════════════════════════════════════════════════════
// ADDRESS UTILS
// ════════════════════════════════════════════════════════════════

export const TW_DISTRICTS = {
  '臺北市': ['中正區','大同區','中山區','松山區','大安區','萬華區','信義區','士林區','北投區','內湖區','南港區','文山區'],
  '新北市': ['三重區','蘆洲區','新莊區','板橋區','中和區','永和區','新店區','土城區','樹林區','鶯歌區','三峽區','淡水區','汐止區','瑞芳區','五股區','泰山區','林口區','深坑區','石碇區','坪林區','三芝區','石門區','八里區','平溪區','雙溪區','貢寮區','金山區','萬里區','烏來區'],
  '桃園市': ['桃園區','中壢區','平鎮區','八德區','楊梅區','蘆竹區','大溪區','龍潭區','龜山區','大園區','觀音區','新屋區','復興區'],
  '臺中市': ['中區','東區','南區','西區','北區','西屯區','南屯區','北屯區','豐原區','東勢區','大甲區','清水區','沙鹿區','梧棲區','后里區','神岡區','潭子區','大雅區'],
  '臺南市': ['中西區','東區','南區','北區','安平區','安南區','永康區','歸仁區','新化區','仁德區','關廟區','麻豆區','佳里區','新營區','善化區'],
  '高雄市': ['楠梓區','左營區','鼓山區','三民區','鹽埕區','前金區','新興區','苓雅區','前鎮區','旗津區','小港區','鳳山區','林園區','大寮區','大樹區','仁武區','鳥松區','岡山區','橋頭區'],
};

export function checkAddressCompleteness(addr) {
  if (!addr || !addr.trim()) return 'red';
  const hasCity = /[市縣]/.test(addr);
  const hasDistrict = /[區鎮鄉]/.test(addr);
  const hasRoad = /[路街]/.test(addr) || addr.includes('大道');
  const hasNumber = /號/.test(addr);
  if (hasCity && hasDistrict && hasRoad && hasNumber) return 'green';
  return 'yellow';
}

export function completenessEmoji(level) {
  return { green: '🟢', yellow: '🟡', red: '🔴' }[level] || '🔴';
}

/**
 * Render city+district+street structured address input
 * @returns {{ getAddress: () => string, setAddress: (addr) => void }}
 */
export function renderAddressInput(container, initialAddr = '') {
  container.innerHTML = `
    <div class="grid grid-cols-3 gap-2">
      <select class="addr-city border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500">
        <option value="">縣市</option>
        ${Object.keys(TW_DISTRICTS).map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <select class="addr-dist border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" disabled>
        <option value="">鄉鎮市區</option>
      </select>
      <input class="addr-street border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" placeholder="路街+門牌號" />
    </div>`;

  const cityEl = container.querySelector('.addr-city');
  const distEl = container.querySelector('.addr-dist');
  const streetEl = container.querySelector('.addr-street');

  cityEl.addEventListener('change', () => {
    const city = cityEl.value;
    const dists = TW_DISTRICTS[city] || [];
    distEl.innerHTML = '<option value="">鄉鎮市區</option>' + dists.map(d => `<option value="${d}">${d}</option>`).join('');
    distEl.disabled = !city;
  });

  // Parse initial address
  if (initialAddr) {
    for (const city of Object.keys(TW_DISTRICTS)) {
      if (initialAddr.includes(city)) {
        cityEl.value = city;
        cityEl.dispatchEvent(new Event('change'));
        for (const dist of TW_DISTRICTS[city]) {
          if (initialAddr.includes(dist)) {
            distEl.value = dist;
            const rest = initialAddr.replace(city, '').replace(dist, '');
            streetEl.value = rest.trim();
            break;
          }
        }
        break;
      }
    }
    if (!cityEl.value) streetEl.value = initialAddr;
  }

  return {
    getAddress() {
      return `${cityEl.value}${distEl.value}${streetEl.value}`.trim();
    },
    setAddress(addr) {
      if (addr) {
        initialAddr = addr;
        cityEl.dispatchEvent(new Event('change'));
      }
    },
    getCompleteness() {
      return checkAddressCompleteness(this.getAddress());
    }
  };
}

// ════════════════════════════════════════════════════════════════
// UI UTILS
// ════════════════════════════════════════════════════════════════

export function showToast(msg, type = 'success') {
  const colors = {
    success: 'bg-emerald-600',
    error: 'bg-red-600',
    warning: 'bg-amber-600',
    info: 'bg-blue-600',
  };
  const el = document.createElement('div');
  el.className = `fixed top-4 right-4 ${colors[type] || colors.info} text-white px-6 py-3 rounded-xl shadow-lg z-50 transition-all duration-300 text-sm font-medium`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
}

export function showLoading(container, msg = '載入中...') {
  container.innerHTML = `
    <div class="flex items-center justify-center py-20">
      <div class="text-center">
        <div class="inline-block w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
        <div class="text-slate-500 text-sm">${msg}</div>
      </div>
    </div>`;
}

export async function confirmDialog(msg) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
        <p class="text-slate-800 text-base mb-6">${msg}</p>
        <div class="flex gap-3 justify-end">
          <button id="dlgCancel" class="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition">取消</button>
          <button id="dlgOk" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">確定</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#dlgCancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
    overlay.querySelector('#dlgOk').addEventListener('click', () => { overlay.remove(); resolve(true); });
  });
}

export function escHtml(s) {
  const d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}
