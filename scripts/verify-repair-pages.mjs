#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const pages = {
  request: path.join(root, 'repair-request.html'),
  console: path.join(root, 'repair-console.html'),
  quote: path.join(root, 'repair-quote.html'),
};
let failures = 0;

function check(condition, message) {
  if (condition) console.log(`✓ ${message}`);
  else {
    console.error(`✗ ${message}`);
    failures += 1;
  }
}

function source(name) {
  try { return fs.readFileSync(pages[name], 'utf8'); }
  catch { return ''; }
}

function balancedHtml(text) {
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const scrubbed = text
    .replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, '$1$2')
    .replace(/(<style\b[^>]*>)[\s\S]*?(<\/style>)/gi, '$1$2')
    .replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  for (const match of scrubbed.matchAll(/<(\/)?([a-z][\w:-]*)\b[^>]*>/gi)) {
    const closing = Boolean(match[1]);
    const tag = match[2].toLowerCase();
    if (voidTags.has(tag) || /\/>$/.test(match[0])) continue;
    if (!closing) stack.push(tag);
    else if (stack.pop() !== tag) return false;
  }
  return stack.length === 0;
}

for (const [name, file] of Object.entries(pages)) {
  check(fs.existsSync(file), `${path.basename(file)} 存在`);
}

const html = Object.fromEntries(Object.keys(pages).map((name) => [name, source(name)]));
for (const [name, text] of Object.entries(html)) {
  check(balancedHtml(text), `${path.basename(pages[name])} 基本標籤正確閉合`);
  check(/<meta\s+name=["']referrer["']\s+content=["']no-referrer["']/i.test(text), `${path.basename(pages[name])} 設定 no-referrer`);
}
const internalNames = ['request', 'console'];

for (const name of internalNames) {
  const text = html[name];
  const label = path.basename(pages[name]);
  check(/<!doctype html>/i.test(text) && /<html\b/i.test(text) && /<\/html>/i.test(text), `${label} 有完整 HTML 外框`);
  check(/<head\b/i.test(text) && /<\/head>/i.test(text) && /<body\b/i.test(text) && /<\/body>/i.test(text), `${label} 有完整 head/body`);
  check(text.includes('cdn.tailwindcss.com'), `${label} 載入 Tailwind CDN`);
  check(!/fetch\s*\([^\n]*ap15\.ragic\.com|APIKey|Authorization\s*[:=]\s*['"]?Basic/i.test(text), `${label} 不直打 Ragic API 或夾帶管理憑證`);
  check(text.includes('https://wuohome-ragic-proxy.wuohome.workers.dev'), `${label} 僅使用指定 Worker`);
  check(text.includes(".get('token')") || text.includes('.get("token")'), `${label} 從 URL 讀取 token`);
  check(text.includes('X-WH-Repair-Token'), `${label} 內部 request 帶 X-WH-Repair-Token`);
  check(/function\s+internalFetch|const\s+internalFetch\s*=/.test(text), `${label} 集中由 internalFetch 發送 request`);
  check((text.match(/\bfetch\s*\(/g) || []).length === 1, `${label} 沒有繞過 internalFetch 的 fetch`);
  check(text.includes('連結無效，請聯絡管理員'), `${label} 缺 token 時顯示明確錯誤`);
  check(text.includes('if (!REPAIR_TOKEN)') && /\}\s*else\s*\{/.test(text), `${label} 缺 token 時不啟動 API 載入`);
  check(!/localStorage/.test(text), `${label} 完全不使用 localStorage`);
  check(/sessionStorage\s*\.\s*(getItem|setItem)/.test(text), `${label} 以 sessionStorage 保存 token`);
  check(/history\.replaceState/.test(text), `${label} 讀取 token 後清除 URL query`);
  check(!/\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=/.test(text), `${label} 不用 HTML 字串注入動態資料`);
  check(/min-height\s*:\s*44px|min-h-11/.test(text), `${label} 觸控目標至少 44px`);
}

check(html.request.includes('repairCreate'), '業務頁支援 repairCreate');
check(html.request.includes('repairListMine'), '業務頁支援 repairListMine');
check(html.request.includes('repairSetMargin'), '業務頁支援 repairSetMargin');
check(html.request.includes('repairReportPayment'), '業務頁支援 repairReportPayment');
check(html.request.includes('repairCancel'), '業務頁支援 repairCancel');
check(/internalFetch\s*\(\s*[`'\"]searchCases(?:\?q=)?/.test(html.request), '業務頁透過 internalFetch 載入物件搜尋');
check(/<datalist\b/i.test(html.request), '業務頁提供物件 datalist 輔助且仍可手填');
check(/name="photo"[^>]*required/i.test(html.request), '業務發單照片為必填');
check(/最多\s*4|1[–-]4/.test(html.request) && html.request.includes('5MiB'), '業務頁顯示照片數量與容量限制');
check(html.request.includes('重新產生報價連結'), '已報價案件可重新產生報價連結');
check(html.request.includes('data.partial') && html.request.includes('quoteSlot.replaceChildren'), '報價部分成功可安全恢復且不累積失效連結');
for (const field of ['address', 'room', 'category', 'description', 'contactName', 'contactPhone', 'availableTime', 'urgency', 'photo']) {
  check(html.request.includes(`name="${field}"`), `業務頁含欄位 ${field}`);
}
for (const action of ['repairListAll', 'repairQuoteCost', 'repairDispatch', 'repairComplete', 'repairAccept', 'repairReject', 'repairCancel']) {
  check(html.console.includes(action), `工作台支援 ${action}`);
}
check(html.console.includes('reporter'), '工作台聯絡人讀取 Worker reporter');
check(html.console.includes('paymentProofUrls') && html.console.includes('finishedPhotoUrls'), '工作台顯示安全付款與完工附件');
check(html.console.includes('actualDescription'), '工作台顯示實際施作說明');
check(html.console.includes('byOwner') && html.console.includes('margin'), '工作台讀取統一 byOwner/margin 統計');
check(/rel\s*=\s*['"]noopener noreferrer['"]/.test(html.console) || /\.rel\s*=\s*['"]noopener noreferrer['"]/.test(html.console), '工作台附件連結使用 noopener noreferrer');
for (const id of ['costTodo', 'dispatchTodo', 'acceptTodo', 'monthlyStats']) {
  check(html.console.includes(`id="${id}"`), `工作台含必要區塊 ${id}`);
}

const quote = html.quote;
check(/<!doctype html>/i.test(quote) && /<\/html>/i.test(quote), '客戶頁有完整 HTML 外框');
check(quote.includes('cdn.tailwindcss.com'), '客戶頁載入 Tailwind CDN');
check(!quote.includes('成本') && !quote.includes('利潤'), '客戶頁原始碼不含禁用內部詞彙');
for (const id of ['1003012', '1003013', '1003015', '1003016']) check(!quote.includes(id), `客戶頁不含內部欄位 ${id}`);
const quoteActions = [...quote.matchAll(/repair[A-Z][A-Za-z]+/g)].map((m) => m[0]);
check(quoteActions.length > 0 && quoteActions.every((name) => name === 'repairQuoteView'), '客戶頁只呼叫 repairQuoteView');
check(!quote.includes('X-WH-Repair-Token') && !/searchParams\.get\(['"]token['"]\)/.test(quote), '客戶頁不載入內部 token');
check(!/localStorage/.test(quote), '客戶頁不使用 localStorage');
check(/history\.replaceState/.test(quote), '客戶頁讀取 quote 後清除 URL query');
check(!/\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=/.test(quote), '客戶頁動態資料使用安全 DOM');
for (const id of ['companyName', 'ticketNo', 'item', 'description', 'total']) check(quote.includes(`id="${id}"`), `客戶頁含顯示欄位 ${id}`);

const scriptPattern = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
for (const [name, text] of Object.entries(html)) {
  let match;
  let index = 0;
  while ((match = scriptPattern.exec(text))) {
    index += 1;
    const temp = path.join(os.tmpdir(), `repair-${name}-${process.pid}-${index}.js`);
    fs.writeFileSync(temp, match[1]);
    const result = spawnSync(process.execPath, ['--check', temp], { encoding: 'utf8' });
    fs.unlinkSync(temp);
    check(result.status === 0, `${path.basename(pages[name])} inline JS #${index} 通過 node --check${result.stderr ? `：${result.stderr.trim()}` : ''}`);
  }
  check(index > 0, `${path.basename(pages[name])} 有 inline JS 可驗證`);
}

if (failures) {
  console.error(`\n靜態驗證失敗：${failures} 項`);
  process.exit(1);
}
console.log('\n靜態驗證通過。');
