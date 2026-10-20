// 每日工作行程：每位同仁今年累計業績／月均業績（資料來源 data/perf.md，與 staff-dashboard.html 同一份）
// 解析規則沿用 staff-dashboard.html 的 parsePerfMd（取各月主表「業績」欄、同月同人取最大值去重、小表「個人續約／代管」不算），
// 差別：「—」／空白／0 一律當沒有資料，不退而讀「業務獎金」欄（staff-dashboard 的 fallback 會讀 cols[3]，這裡不要）。
// ponytail-debt: 別名表是 staff-dashboard.html NAME_ALIASES 的子集複製；日後兩邊該抽成共用檔，避免新增暱稱時漏改一邊。
(function (root) {
  const YEAR_ROC = 115; // 民國 115 年 = 2026
  const ALIASES = {
    '小方': '方鼎文', '心瑜': '陳心瑜', 'kelly': '陳心瑜', 'Kelly': '陳心瑜', '馬丁': '關宗宇', '張傳': '詹張傳', '宣佑': '林宣佑',
    '小碩': '劉子碩', '惠慈': '吳惠慈', '炫儒': '吳炫儒', 'TINA': '蕭靜芳', '蕭靜芳(TINA)': '蕭靜芳', 'TINA（蕭靜芳）': '蕭靜芳',
    '則泓': '張則泓', '佳燕': '林佳燕', '卓威': '李卓威', '恩廷': '葉恩廷', '欣宜': '白欣宜', '小鐘': '鐘晟鈺', '薇雅': '陳薇雅', '兆傑': '劉兆傑', '忠豪&眞儀': '張忠豪&蕭頤臻', '忠豪&真儀': '張忠豪&蕭頤臻',
  };
  const norm = n => { n = (n || '').replace(/\*/g, '').trim(); return ALIASES[n] || n; };
  const num = s => { const v = parseInt(parseFloat((s || '').replace(/,/g, '').replace(/\*/g, '').trim()), 10); return v > 0 ? v : 0; };

  // 回傳 { byName: {姓名: {total, avg, months, firstYm}}, lastYm, rows: [{ym,name,perf}] }
  function parse(text) {
    const raw = []; let cur = null, lastMonth = 0;
    for (const line of String(text || '').split('\n')) {
      const m = line.match(/^##\s+(\d{3})\/(\d{2})\s*$/);
      if (m) { cur = +m[1] === YEAR_ROC ? +m[2] : null; if (cur && cur > lastMonth) lastMonth = cur; continue; }
      if (!cur || !line.startsWith('|')) continue;
      const cols = line.split('|').map(c => c.trim());
      if (cols.length < 5 || !/^\d+$/.test(cols[1].replace(/\*/g, ''))) continue; // 只吃主表有編號的列（合計列、小表都略過）
      const name = norm(cols[2]);
      if (!name || name === '合計') continue;
      raw.push({ ym: cur, name, perf: num(cols[4]) });
    }
    const dedup = {}; // 同月同人（別名合併後）取最大值，避免「馬丁 22,000」與「關宗宇 35,125」重複計
    for (const r of raw) { const k = r.ym + '|' + r.name; if (dedup[k] === undefined || r.perf > dedup[k]) dedup[k] = r.perf; }
    const first = {}, total = {};
    for (const [k, perf] of Object.entries(dedup)) {
      const [ym, name] = k.split('|'); const mo = +ym;
      if (perf > 0) { total[name] = (total[name] || 0) + perf; if (!first[name] || mo < first[name]) first[name] = mo; }
    }
    const byName = {};
    for (const name of Object.keys(total)) {
      const months = lastMonth - first[name] + 1; // 從第一個有數字的月份算到最新月份
      byName[name] = { total: total[name], months, avg: Math.round(total[name] / months), firstYm: first[name] };
    }
    return { byName, lastYm: lastMonth };
  }

  const fmtWan = v => v >= 10000 ? (Math.round(v / 1000) / 10).toFixed(1) + '萬' : v.toLocaleString('en-US');

  async function load(url) {
    try {
      const r = await fetch(url || 'data/perf.md', { cache: 'no-cache' });
      if (!r.ok) return null;
      const p = parse(await r.text());
      return Object.keys(p.byName).length ? p : null;
    } catch (e) { return null; } // ponytail-debt: 抓不到就不顯示數字，看板其他功能照常；不回報給後端
  }

  const api = { parse, fmtWan, load };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WorklogPerf = api;
})(typeof window !== 'undefined' ? window : globalThis);
