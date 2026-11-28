/* 同仁 Google 登入閘（2026-10-21）
 * 給 payment-create.html／deposit.html 用：searchStaff／searchDeposits 回租客姓名電話與同仁手機信箱，
 * Worker 端改要登入才給（wuohome-ragic-proxy 的 staffSession／staffLogout）。
 * 做法照工作日誌看板（worklog.html）：Google 只負責第一次證明身分，換成 Worker 自家 30 天 session，
 * 之後開頁零互動；session 失效才回登入畫面。
 *
 * 用法：
 *   <script src="js/staff-gate.js"></script>
 *   StaffGate.init('https://wuohome-ragic-proxy.wuohome.workers.dev');
 *   StaffGate.require();                       // 開頁就先登入（沒有 session 才會出現登入畫面）
 *   const res = await StaffGate.fetch('/searchStaff');   // 自動帶 Authorization；過期會重登後重打一次
 *   StaffGate.email();                         // 目前登入者的 email（小寫），未登入回 ''
 *   StaffGate.passwordDialog();                // 已登入者自己設定／更改帳號密碼（2026-11-26）
 *
 * 2026-11-26 加帳號密碼登入（瓊安：iPhone 無痕每次都要 Google 重登）：登入畫面 Google 按鈕下面多一組
 * Email＋密碼表單（Worker staffPasswordLogin，發同一種 session）。密碼由同仁登入後自己設，
 * 表單用 autocomplete=username／current-password／new-password，iPhone 鑰匙圈會記住、下次一點就填。
 *
 * 2026-11-28 帳密那組也收 Ragic 密碼（黃雅芬 Ice 沒有 Google 帳號，原本「先 Google 登入才能設密碼」是死路）：
 * Worker staffPasswordLogin 先比自設密碼，再去問 Ragic，第一次登入不用另設密碼。
 */
(function () {
  'use strict';
  var CLIENT_ID = '18499630691-mi617tp07ptq943nlkhslf7bfu27j6cn.apps.googleusercontent.com';
  var SESS_KEY = 'wuohome_staff_session_v1';
  var GID_KEY = 'wuohome_gid_v1'; // 全公司系統共用的舊 ID token 快取：只讀（有效就直接換 session，零互動）
  var base = '', session = '', mail = '';
  var waiters = [];            // 等登入完成的 resolve
  var exchanging = false, gsiReady = false, noPrompt = false, gateKind = '';
  var el = null, dlg = null;
  var INPUT_CSS = 'display:block;width:100%;box-sizing:border-box;margin-bottom:10px;padding:11px 12px;border:1px solid #ccc;border-radius:8px;font-size:16px;font-family:inherit;';
  var BTN_CSS = 'display:block;width:100%;padding:11px;border:0;border-radius:8px;background:#1a73e8;color:#fff;font-size:15px;font-weight:600;font-family:inherit;';

  function readSess() { try { var o = JSON.parse(localStorage.getItem(SESS_KEY) || 'null'); return o && o.session ? o : null; } catch (e) { return null; } } // ponytail-debt: 無痕模式讀不到就退回按按鈕登入
  function saveSess(s, m) { try { localStorage.setItem(SESS_KEY, JSON.stringify({ session: s, email: m })); } catch (e) { /* ponytail-debt: 寫不進去只是下次開頁要重新登入 */ } }
  function clearSess() { session = ''; mail = ''; try { localStorage.removeItem(SESS_KEY); } catch (e) { /* ponytail-debt: 同上 */ } }
  function readGid() { try { var g = JSON.parse(localStorage.getItem(GID_KEY) || 'null'); return g && g.idToken && g.exp ? g : null; } catch (e) { return null; } } // ponytail-debt: 讀不到舊快取就改按按鈕登入
  function jwtEmail(t) { try { return String(JSON.parse(atob(String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email || '').toLowerCase(); } catch (e) { return ''; } } // ponytail-debt: 解不開只是少顯示 email，驗證仍由 Worker 把關

  function flush() { var w = waiters; waiters = []; w.forEach(function (f) { f(); }); }

  // ---- 登入畫面 ----
  function ensureEl() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'staffGate';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(255,255,255,.97);display:none;align-items:center;justify-content:center;padding:24px;font-family:"Noto Sans TC",system-ui,sans-serif';
    el.innerHTML = '<div style="max-width:340px;width:100%;text-align:center">' +
      '<div style="font-size:20px;font-weight:700;margin-bottom:8px" id="sgTitle"></div>' +
      '<div style="font-size:14px;line-height:1.7;color:#555;margin-bottom:18px" id="sgMsg"></div>' +
      '<div id="sgBtn" style="display:flex;justify-content:center;min-height:44px"></div>' +
      '<form id="sgPwForm" style="margin-top:18px;padding-top:16px;border-top:1px solid #e5e5e5;text-align:left">' +
      '<div style="font-size:13px;color:#555;text-align:center;margin-bottom:10px">沒有 Google 帳號？用 Ragic 的帳號密碼登入</div>' +
      '<input id="sgEmail" name="username" type="email" autocomplete="username" inputmode="email" required placeholder="公司登記的 Email" style="' + INPUT_CSS + '">' +
      '<input id="sgPw" name="password" type="password" autocomplete="current-password" required placeholder="密碼" style="' + INPUT_CSS + '">' +
      '<button type="submit" id="sgPwBtn" style="' + BTN_CSS + '">登入</button>' +
      '<div id="sgPwMsg" role="alert" style="min-height:20px;margin-top:8px;font-size:13px;color:#c5221f;text-align:center"></div>' +
      '<div style="font-size:12px;line-height:1.6;color:#777;text-align:center">就是你在 Ragic 看行程、物件、房客用的那組 Email 和密碼。忘記密碼請到 <a href="https://ap15.ragic.com/wuohome" target="_blank" rel="noopener" style="color:#1a73e8">Ragic 登入畫面</a>按「忘記密碼」。</div>' +
      '</form>' +
      '<div id="sgExtra" style="margin-top:14px;font-size:13px;line-height:1.7"></div></div>';
    document.body.appendChild(el);
    document.getElementById('sgPwForm').addEventListener('submit', function (e) {
      e.preventDefault();
      pwLogin(document.getElementById('sgEmail').value, document.getElementById('sgPw').value);
    });
    return el;
  }
  function show(kind, emailShown) {
    gateKind = kind;
    ensureEl();
    var T = {
      out: ['請先登入', '窩的家同仁請用公司登記的 Google 帳號，或下面用 Ragic 的 Email＋密碼登入。登入一次後，30 天內開這個頁面不用再登入。'],
      expired: ['登入已過期', '請再登入一次。'],
      fail: ['登入沒有成功', '請再試一次；如果一直失敗，請重新整理頁面。'],
      denied: ['這個帳號不在使用名單', (emailShown ? emailShown + ' ' : '') + '不在窩的家在職同仁名單內。沒有公司登記的 Google 帳號，請直接在下面用 Ragic 的 Email＋密碼登入；還是不行，請聯絡管理部確認人事資料的 Email。']
    }[kind] || ['請先登入', ''];
    document.getElementById('sgTitle').textContent = T[0];
    document.getElementById('sgMsg').textContent = T[1];
    document.getElementById('sgPwMsg').textContent = '';
    document.getElementById('sgPw').value = '';
    var extra = document.getElementById('sgExtra');
    extra.innerHTML = '';
    // LINE 內建瀏覽器擋 Google 登入：引導用手機瀏覽器開（LINE 支援 openExternalBrowser=1）
    if (/Line\//i.test(navigator.userAgent) && !/[?&]openExternalBrowser=1/.test(location.search)) {
      var u = location.href + (location.search ? '&' : '?') + 'openExternalBrowser=1';
      var a = document.createElement('a');
      a.href = u; a.textContent = '在 LINE 裡登入不了？改用手機瀏覽器開啟';
      a.style.cssText = 'color:#1a73e8;text-decoration:underline';
      extra.appendChild(a);
    }
    if (kind === 'denied') {
      var b = document.createElement('button');
      b.textContent = '登出，換帳號再試';
      b.style.cssText = 'margin-top:8px;padding:10px 18px;border:1px solid #ccc;border-radius:8px;background:#fff;font-size:14px';
      b.onclick = function () { noPrompt = true; if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect(); show('out'); renderBtn(0); };
      extra.appendChild(b);
    }
    el.style.display = 'flex';
    initGsi(0);
    renderBtn(0);
  }
  function hide() { if (el) el.style.display = 'none'; gateKind = ''; }

  // ---- Google Identity Services ----
  function loadGsi() {
    if (document.getElementById('gsiScript')) return;
    var s = document.createElement('script');
    s.id = 'gsiScript'; s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
    document.head.appendChild(s);
  }
  function initGsi(n) {
    if (gsiReady) return;
    loadGsi();
    if (!(window.google && google.accounts && google.accounts.id)) { if (n < 150) setTimeout(function () { initGsi(n + 1); }, 200); return; }
    google.accounts.id.initialize({ client_id: CLIENT_ID, auto_select: true, use_fedcm_for_prompt: true, callback: onCred });
    gsiReady = true;
    if (!session && !noPrompt && gateKind && gateKind !== 'denied') google.accounts.id.prompt();
  }
  function renderBtn(n) {
    var b = document.getElementById('sgBtn');
    if (!b || gateKind === 'denied') { if (b) b.innerHTML = ''; return; }
    if (gsiReady) { b.innerHTML = ''; google.accounts.id.renderButton(b, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'zh_TW' }); return; }
    if (n < 60) setTimeout(function () { renderBtn(n + 1); }, 200);
    else b.textContent = 'Google 登入載入失敗，請重新整理頁面';
  }
  function onCred(resp) {
    var t = resp && resp.credential;
    if (!t || session) return;
    noPrompt = false;
    exchange(t);
  }

  // ---- Google ID token → Worker session ----
  function exchange(idToken) {
    if (exchanging) return Promise.resolve();
    exchanging = true;
    var m = jwtEmail(idToken);
    return fetch(base + '/staffSession', { method: 'POST', headers: { Authorization: 'Bearer ' + idToken } })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; }); })
      .then(function (r) {
        exchanging = false;
        if (r.status === 200 && r.json && r.json.session) {
          session = r.json.session; mail = m || String((r.json.viewer || {}).email || '').toLowerCase();
          saveSess(session, mail); hide(); flush(); return;
        }
        if (r.status === 403) { show('denied', m); return; }
        show('fail');
      })
      .catch(function () { exchanging = false; show('fail'); });
  }

  // ---- 帳號密碼 → Worker session ----
  function pwLogin(email, password) {
    var msg = document.getElementById('sgPwMsg'), btn = document.getElementById('sgPwBtn');
    email = String(email || '').trim().toLowerCase();
    if (!email || !password) { msg.textContent = '請填 Email 和密碼'; return Promise.resolve(); }
    msg.textContent = ''; btn.disabled = true; btn.textContent = '登入中…';
    var done = function () { btn.disabled = false; btn.textContent = '登入'; };
    return fetch(base + '/staffPasswordLogin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: email, password: password }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; }); })
      .then(function (r) {
        done();
        if (r.status === 200 && r.json && r.json.session) {
          session = r.json.session; mail = String((r.json.viewer || {}).email || email).toLowerCase();
          saveSess(session, mail); hide(); flush(); return;
        }
        if (r.status === 429) { msg.textContent = '錯太多次，請 ' + (r.json.retryAfterMin || 15) + ' 分鐘後再試，或改用 Google 登入。'; return; }
        if (r.status === 401) { msg.textContent = 'Email 或密碼不對。請用你登入 Ragic 的那組；忘記密碼請到 Ragic 登入畫面按「忘記密碼」。'; return; }
        msg.textContent = '登入沒有成功，請再試一次。';
      })
      .catch(function () { done(); msg.textContent = '連不上伺服器，請確認網路後再試。'; });
  }

  // ---- 設定／更改密碼（已登入才用）----
  function passwordDialog() {
    if (!dlg) {
      dlg = document.createElement('div');
      dlg.id = 'staffPwDialog';
      dlg.style.cssText = 'position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.35);display:none;align-items:center;justify-content:center;padding:24px;font-family:"Noto Sans TC",system-ui,sans-serif';
      dlg.innerHTML = '<form id="spForm" style="max-width:340px;width:100%;background:#fff;color:#222;border-radius:12px;padding:22px;text-align:left">' +
        '<div style="font-size:18px;font-weight:700;margin-bottom:6px">設定登入密碼</div>' +
        '<div id="spWho" style="font-size:13px;line-height:1.7;color:#555;margin-bottom:12px"></div>' +
        '<input id="spUser" name="username" type="email" autocomplete="username" readonly style="' + INPUT_CSS + 'background:#f5f5f5;color:#555">' +
        '<input id="spPw" name="new-password" type="password" autocomplete="new-password" required minlength="8" placeholder="新密碼（至少 8 個字）" style="' + INPUT_CSS + '">' +
        '<input id="spPw2" type="password" autocomplete="new-password" required minlength="8" placeholder="再輸入一次" style="' + INPUT_CSS + '">' +
        '<div id="spMsg" role="alert" style="min-height:20px;margin-bottom:8px;font-size:13px;line-height:1.6;color:#c5221f"></div>' +
        '<button type="submit" id="spSave" style="' + BTN_CSS + '">儲存密碼</button>' +
        '<button type="button" id="spClose" style="' + BTN_CSS + 'background:#fff;color:#333;border:1px solid #ccc;margin-top:8px">關閉</button>' +
        '</form>';
      document.body.appendChild(dlg);
      document.getElementById('spClose').onclick = function () { dlg.style.display = 'none'; };
      document.getElementById('spForm').addEventListener('submit', function (e) {
        e.preventDefault();
        var p1 = document.getElementById('spPw').value, p2 = document.getElementById('spPw2').value, m = document.getElementById('spMsg'), b = document.getElementById('spSave');
        m.style.color = '#c5221f';
        if (p1.length < 8) { m.textContent = '密碼至少 8 個字'; return; }
        if (p1 !== p2) { m.textContent = '兩次輸入的不一樣'; return; }
        b.disabled = true; m.textContent = '';
        sfetch('/staffPasswordSet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: p1 }) })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, json: j }; }); })
          .then(function (r) {
            b.disabled = false;
            if (r.status === 200) {
              m.style.color = '#188038';
              m.textContent = '已儲存。之後可以用 Email＋這組密碼登入；iPhone 問要不要存到鑰匙圈，按「儲存」，下次一點就自動填好。';
              document.getElementById('spPw').value = ''; document.getElementById('spPw2').value = '';
              return;
            }
            m.textContent = r.json.error === 'password_too_short' ? '密碼至少 8 個字' : '沒有存成功，請再試一次。';
          })
          .catch(function () { b.disabled = false; m.textContent = '連不上伺服器，請確認網路後再試。'; });
      });
    }
    document.getElementById('spUser').value = mail;
    document.getElementById('spWho').textContent = '帳號是你的公司 Email：' + (mail || '') + '。設好後，無痕模式或換手機也能用 Email＋密碼登入。';
    document.getElementById('spMsg').textContent = '';
    dlg.style.display = 'flex';
    setTimeout(function () { document.getElementById('spPw').focus(); }, 0);
  }

  // ---- 對外 API ----
  function start() {
    if (session) return;
    var sv = readSess();
    if (sv) { session = sv.session; mail = sv.email || ''; return; }
    var g = readGid();
    if (g && g.exp - Date.now() > 2 * 60 * 1000) { exchange(g.idToken); initGsi(0); return; } // 舊快取還有效：零互動換 session
    show('out');
  }
  function ready() {
    if (!session) start(); // 已存 session 會同步載好；原本先排隊再 start，載好了卻沒人叫醒（第一次呼叫就卡住）
    if (session) return Promise.resolve();
    return new Promise(function (resolve) { waiters.push(resolve); });
  }
  function sfetch(path, opts) {
    return ready().then(function () {
      var o = Object.assign({}, opts || {});
      o.headers = Object.assign({}, o.headers || {}, { Authorization: 'Bearer ' + session });
      return fetch(base + path, o);
    }).then(function (res) {
      if (res.status !== 401 && res.status !== 403) return res;
      // session 失效（過期／被撤銷）或沒資格：清掉、回登入畫面，登入後重打一次
      var denied = res.status === 403;
      clearSess();
      var p = new Promise(function (resolve) { waiters.push(resolve); });
      show(denied ? 'denied' : 'expired', denied ? mail : '');
      return p.then(function () {
        var o = Object.assign({}, opts || {});
        o.headers = Object.assign({}, o.headers || {}, { Authorization: 'Bearer ' + session });
        return fetch(base + path, o);
      });
    });
  }
  window.addEventListener('storage', function (e) { // 別的分頁登出
    if (e.key === SESS_KEY && !e.newValue && session) { session = ''; mail = ''; show('out'); }
  });
  window.StaffGate = {
    init: function (workerBase) { base = String(workerBase || '').replace(/\/$/, ''); },
    require: function () { return ready(); },
    fetch: sfetch,
    email: function () { return mail; },
    passwordDialog: passwordDialog,
    logout: function () {
      var t = session; clearSess(); noPrompt = true;
      if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
      if (t) fetch(base + '/staffLogout', { method: 'POST', headers: { Authorization: 'Bearer ' + t } }).catch(function () { /* ponytail-debt: 撤銷通知失敗只是 session 多活到自然過期（30 天），下次登入會換新的 */ });
      show('out');
    }
  };
})();
