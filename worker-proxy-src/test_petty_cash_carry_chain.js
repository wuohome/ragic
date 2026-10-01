// 零用金結轉鏈補正：用 mock Ragic 驗證邏輯（從 index.js 文字抽出函式執行，不需任何測試框架）。
// 用法：在 worker-proxy-src 目錄執行 `node test_petty_cash_carry_chain.js [path/to/index.js]`，預設測同目錄 index.js。
const fs = require('fs');
const src = fs.readFileSync(process.argv[2] || 'index.js', 'utf8');
function grab(startMarker, endMarker) {
  const a = src.indexOf(startMarker); const b = src.indexOf(endMarker, a);
  if (a < 0 || b < 0) throw new Error('marker not found ' + startMarker);
  return src.slice(a, b);
}
const code = [
  "const SS_SHEET = 'shanshans/1'; const SS_SUBTABLE_KEY = '1000730';",
  grab('const SSM = Object.freeze', 'const SS = Object.freeze'),
  grab('function pcVal', '// 台北時間日期時間字串'),
  grab('function ssShiftMonthStart', '// GET shanshans/1'),
  grab('async function ssFindMonthRecord', '// 決策1：當月主表記錄'),
  grab('const SS_CHAIN_MONTHS_BACK', '  // 上個月根本沒開帳'),
  "  return { balance: 'FALLBACK' }; }",
  'return { ssMonthBalance };',
].join('\n');
const detectUpstreamFailure = (u, d) => (!u.ok ? { error: 'upstream_error' } : (d && d.status === 'ERROR' ? { error: 'x' } : null));

function mkEnv(months, opts = {}) {
  // months: { '2026/07/01': {rid, p, dep, exp} } ; 721 = p+dep-exp 公式
  const db = {}; const log = { gets: 0, posts: [] };
  for (const [ms, m] of Object.entries(months)) db[m.rid] = { ms, ...m };
  const rec = (m) => ({ '1000717': m.ms, '1000719': m.p === null ? '' : String(m.p), '1000731': String(m.dep || 0), '1000732': String(m.exp || 0), '1000721': String(m.p + (m.dep || 0) - (m.exp || 0)) });
  const getFromRagic = async (env, path, qs) => {
    log.gets++;
    if (opts.failGetMonth && qs.includes(encodeURIComponent(opts.failGetMonth))) return { upstream: { ok: false, status: 500 }, data: null };
    const w = /1000717,eq,([^&]+)/.exec(qs);
    if (w) {
      const ms = decodeURIComponent(w[1]); const out = {};
      for (const m of Object.values(db)) if (m.ms === ms) out[m.rid] = rec(m);
      return { upstream: { ok: true }, data: out };
    }
    const rid = path.split('/').pop(); const m = db[rid];
    if (opts.readbackBad && log.posts.length) return { upstream: { ok: true }, data: { [rid]: { ...rec(m), '1000721': '999' } } };
    return { upstream: { ok: true }, data: { [rid]: rec(m) } };
  };
  const postUrlEncodedToRagic = async (env, path, body, extra) => {
    const rid = path.split('/').pop(); const p = new URLSearchParams(body);
    log.posts.push({ rid, fields: [...p.keys()], extra });
    if (opts.failPost) return { upstream: { ok: false, status: 500 }, data: null };
    db[rid].p = Number(p.get('1000719'));
    return { upstream: { ok: true }, data: { status: 'SUCCESS' } };
  };
  return { db, log, getFromRagic, postUrlEncodedToRagic, rec, env: {} };
}
async function run(months, cur, opts) {
  const h = mkEnv(months, opts);
  const f = new Function('getFromRagic', 'postUrlEncodedToRagic', 'detectUpstreamFailure', code);
  const { ssMonthBalance } = f(h.getFromRagic, h.postUrlEncodedToRagic, detectUpstreamFailure);
  const m = months[cur];
  const r = await ssMonthBalance({}, h.rec(m), cur, m.rid);
  return { r, h };
}
let fail = 0; const ok = (c, msg) => { if (!c) { fail++; console.log('FAIL', msg); } else console.log('ok  ', msg); };
const M = (rid, p, dep, exp) => ({ rid: String(rid), p, dep, exp });
(async () => {
  // 事故重現：八月補 50000（八月 721=50976），九月 719 停在 976，十月抄 -44012
  const acc = () => ({ '2026/08/01': M(37, 0, 50976, 0), '2026/09/01': M(38, 976, 0, 45988), '2026/10/01': M(39, -44012, 0, 700) });
  // 八月: 期初0+存入50976 → 721=50976 ; 九月 p=976 支出45988 → -45012? 用精確數字另算
  let { r, h } = await run(acc(), '2026/10/01');
  const aug = 50976, sepWant = aug + 0 - 45988, octWant = sepWant - 700;
  ok(r.balance === octWant && !r.uncertain, `兩層斷鏈依序補正 balance=${r.balance} want=${octWant}`);
  ok(h.log.posts.length === 2 && h.log.posts[0].rid === '38' && h.log.posts[1].rid === '39', '先補九月再補十月');
  ok(h.log.posts.every((p) => p.fields.length === 1 && p.fields[0] === '1000719' && p.extra === 'doFormula=true'), '只寫 1000719 單欄且帶 doFormula');
  ok(r.refreshed === true, 'refreshed=true');
  // 已正確 → 無寫入
  ({ r, h } = await run({ '2026/08/01': M(37, 0, 50976, 0), '2026/09/01': M(38, 50976, 0, 45988), '2026/10/01': M(39, 4988, 0, 700) }, '2026/10/01'));
  ok(h.log.posts.length === 0 && r.balance === 4288 && r.refreshed === false, `無斷鏈不寫入 balance=${r.balance} gets=${h.log.gets}`);
  ok(h.log.gets === 3, '穩態只有 3 次讀取');
  // 讀回不符
  ({ r, h } = await run(acc(), '2026/10/01', { readbackBad: true }));
  ok(r.uncertain === true && r.balance === null && r.reason === 'carry_heal_failed', '讀回不符 fail-closed');
  ok(h.log.posts.length === 1, '讀回不符即停，不繼續下一月');
  // 寫入失敗
  ({ r, h } = await run(acc(), '2026/10/01', { failPost: true }));
  ok(r.uncertain === true && r.reason === 'carry_heal_failed', '寫入失敗 fail-closed');
  // 讀取失敗（遠月）
  ({ r } = await run(acc(), '2026/10/01', { failGetMonth: '2026/07/01' }));
  ok(r.uncertain === true && r.reason === 'prev_month_lookup_failed', '任一月讀取失敗 fail-closed');
  // 跳月：沒有九月 → 十月無上月 → fallback，不補八月
  ({ r, h } = await run({ '2026/08/01': M(37, 0, 50976, 0), '2026/10/01': M(39, -44012, 0, 700) }, '2026/10/01'));
  ok(r.balance === 'FALLBACK' && h.log.posts.length === 0, '上月查無不補');
  // 跳月在中間：七月、九月、十月，缺八月 → 九月無鏈基準 → 只用九月為底補十月，不補九月
  ({ r, h } = await run({ '2026/07/01': M(36, 0, 100, 0), '2026/09/01': M(38, 5, 0, 0), '2026/10/01': M(39, 7, 0, 0) }, '2026/10/01'));
  ok(h.log.posts.length === 1 && h.log.posts[0].rid === '39' && r.balance === 5, `跳月停在斷點，九月不被七月補正 balance=${r.balance}`);
  console.log(fail ? `FAILED ${fail}` : 'ALL PASS'); process.exit(fail ? 1 : 0);
})();
