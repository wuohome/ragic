// bug-report.js — 問題回報＋意見回饋 widget（共用，任何頁面加 <script src="bug-report.js"></script> 即可）
// Worker endpoint — 日後改位置只動這一行
const BUG_REPORT_ENDPOINT = 'https://wuohome-ragic-proxy.wuohome.workers.dev/reportBug';

// 其他網站的 bug-report.js 只是一支載入器，本體都在這裡；設定走 window.WH_BUG_REPORT：
//   endpoint 回報網址、screenshot 是否自動截圖、guard／hideWhen 右下角避讓
var WH_BUG_SELF = (document.currentScript && document.currentScript.src) || '';

(function () {
  'use strict';

  var WH_CFG = window.WH_BUG_REPORT || {};
  // 自動截圖只開給內部頁（有員工登入或明確設定）：客戶頁的畫面常有姓名、電話、簽名，預設不截，需要時客戶自己上傳
  function autoShotAllowed() { return WH_CFG.screenshot === true || !!window.StaffGate; }
  function staffEmail() { try { return (window.StaffGate && window.StaffGate.email && window.StaffGate.email()) || ''; } catch (e) { return ''; } }

  // 記下頁面最近的錯誤：客戶頁不截圖，打不開時只能靠這個判斷原因（只留錯誤訊息，網址參數遮掉）
  var pageErrors = [];
  function noteError(msg) {
    var m = String(msg || '').replace(/(token|t|key|apikey)=[^&\s]*/gi, '$1=***').slice(0, 200);
    if (m) { pageErrors.push(m); if (pageErrors.length > 3) pageErrors.shift(); }
  }
  window.addEventListener('error', function (e) { if (e.message) noteError(e.message); });
  window.addEventListener('unhandledrejection', function (e) { noteError(e.reason && e.reason.message || e.reason); });

  // 案件編號：網址通行碼會遮掉，要靠頁面上的編號才查得到是哪一筆；頁面可用 caseSelector 指定元素
  function caseRef() {
    try {
      var el = document.querySelector(WH_CFG.caseSelector || '#show_no');
      var t = el ? el.textContent.trim() : '';
      return t && t !== '-' ? t.slice(0, 60) : '';
    } catch (e) { return ''; }
  }

  // 回報裡不能帶同仁的專屬通行碼（?token=…），只保留其他參數
  function safeSearch() {
    try {
      var q = new URLSearchParams(location.search);
      ['token', 't', 'key'].forEach(function (k) { if (q.has(k)) q.set(k, '***'); });
      var s = q.toString();
      return s ? '?' + s : '';
    } catch (e) { return ''; } // ponytail-debt: 網址解析失敗就不附參數，寧可少資訊也不外洩通行碼
  }

  // ── 防重複掛載 ──
  if (document.getElementById('wh-bug-report-btn')) return;

  // ── 全域 style ──
  var style = document.createElement('style');
  style.textContent = [
    '#wh-bug-report-btn{',
      'position:fixed;right:20px;bottom:24px;z-index:99990;',
      'width:48px;height:48px;border-radius:50%;',
      'background:#ff6b35;color:#fff;border:none;cursor:pointer;',
      'box-shadow:0 4px 14px rgba(255,107,53,.45);',
      'display:flex;align-items:center;justify-content:center;',
      'font-size:20px;transition:transform .15s,box-shadow .15s;',
      'outline:none;',
    '}',
    '#wh-bug-report-btn:hover{transform:scale(1.1);box-shadow:0 6px 20px rgba(255,107,53,.55);}',
    '#wh-bug-report-btn:active{transform:scale(.97);}',
    '#wh-bug-report-btn title{display:none;}',

    // Tooltip
    '#wh-bug-report-btn::after{',
      'content:"問題回報・意見回饋";',
      'position:absolute;right:56px;top:50%;transform:translateY(-50%);',
      'background:rgba(30,30,30,.88);color:#fff;font-size:12px;',
      'padding:4px 10px;border-radius:6px;white-space:nowrap;',
      'pointer-events:none;opacity:0;transition:opacity .15s;font-family:sans-serif;',
    '}',
    '#wh-bug-report-btn:hover::after{opacity:1;}',

    // Backdrop
    '#wh-bug-backdrop{',
      'display:none;position:fixed;inset:0;z-index:99991;',
      'background:rgba(0,0,0,.45);backdrop-filter:blur(2px);',
    '}',
    '#wh-bug-backdrop.wh-open{display:block;}',

    // Modal
    '#wh-bug-modal{',
      'display:none;position:fixed;z-index:99992;',
      'top:50%;left:50%;transform:translate(-50%,-48%) scale(.97);',
      'background:#fff;border-radius:16px;',
      'box-shadow:0 20px 60px rgba(0,0,0,.18);',
      'width:min(520px, calc(100vw - 32px));max-height:calc(100vh - 48px);',
      'overflow-y:auto;transition:transform .2s, opacity .2s;opacity:0;',
      'font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;',
    '}',
    '#wh-bug-modal.wh-open{',
      'display:block;transform:translate(-50%,-50%) scale(1);opacity:1;',
    '}',

    '.wh-modal-header{',
      'padding:20px 24px 12px;border-bottom:1px solid #f0f0f0;',
    '}',
    '.wh-modal-title{font-size:17px;font-weight:700;color:#1a1a1a;margin:0 0 2px;}',
    '.wh-modal-sub{font-size:13px;color:#666;margin:0;}',

    '.wh-modal-body{padding:16px 24px 20px;}',

    '.wh-section{margin-bottom:14px;}',
    '.wh-label{font-size:13px;font-weight:600;color:#444;margin-bottom:6px;display:block;}',
    '.wh-required{color:#e05a2b;}',

    // Screenshot preview
    '#wh-screenshot-wrap{',
      'border:2px dashed #d9e2f0;border-radius:10px;',
      'min-height:80px;display:flex;align-items:center;justify-content:center;',
      'overflow:hidden;position:relative;background:#f8faff;',
    '}',
    '#wh-screenshot-img{max-width:100%;max-height:160px;object-fit:contain;display:none;}',
    '#wh-screenshot-placeholder{color:#aab4c8;font-size:13px;text-align:center;padding:16px;}',
    '#wh-screenshot-actions{',
      'position:absolute;top:6px;right:6px;display:flex;gap:6px;',
    '}',
    '.wh-ss-btn{',
      'font-size:11px;padding:3px 8px;border-radius:6px;border:none;cursor:pointer;',
      'background:rgba(255,255,255,.9);color:#444;box-shadow:0 1px 4px rgba(0,0,0,.15);',
      'transition:background .12s;',
    '}',
    '.wh-ss-btn:hover{background:#fff;}',

    // Upload
    '#wh-upload-area{',
      'border:2px dashed #d9e2f0;border-radius:10px;padding:12px 16px;',
      'cursor:pointer;text-align:center;background:#f8faff;',
      'transition:border-color .15s;',
    '}',
    '#wh-upload-area:hover{border-color:#6aabf7;}',
    '#wh-upload-input{display:none;}',
    '#wh-upload-count{font-size:12px;color:#888;margin-top:4px;}',
    '#wh-upload-thumbs{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}',
    '.wh-thumb{',
      'width:56px;height:56px;border-radius:6px;object-fit:cover;',
      'border:1px solid #e0e0e0;',
    '}',

    // Path field
    '#wh-page-path{',
      'width:100%;box-sizing:border-box;',
      'padding:8px 10px;border:1px solid #d9e2f0;border-radius:8px;',
      'background:#f5f5f5;color:#888;font-size:12px;font-family:monospace;',
      'cursor:default;outline:none;',
    '}',

    // Select
    '#wh-bug-type{',
      'width:100%;box-sizing:border-box;',
      'padding:8px 10px;border:1px solid #d9e2f0;border-radius:8px;',
      'background:#fff;font-size:14px;color:#222;outline:none;cursor:pointer;',
      'appearance:none;-webkit-appearance:none;',
      'background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'8\'%3E%3Cpath d=\'M0 0l6 8 6-8\' fill=\'%23888\'/%3E%3C/svg%3E");',
      'background-repeat:no-repeat;background-position:right 12px center;',
    '}',
    '#wh-bug-type:focus{border-color:#6aabf7;}',

    // Textarea
    '#wh-bug-desc{',
      'width:100%;box-sizing:border-box;',
      'padding:10px 12px;border:1px solid #d9e2f0;border-radius:8px;',
      'font-size:14px;color:#222;resize:vertical;min-height:90px;outline:none;',
      'font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;',
      'transition:border-color .15s;',
    '}',
    '#wh-bug-desc:focus{border-color:#6aabf7;}',
    '#wh-desc-err{font-size:12px;color:#e05a2b;margin-top:4px;display:none;}',

    // Footer
    '.wh-modal-footer{',
      'padding:0 24px 20px;display:flex;justify-content:flex-end;gap:10px;',
    '}',
    '.wh-btn-cancel{',
      'padding:9px 20px;border-radius:8px;border:1px solid #d9e2f0;',
      'background:#fff;color:#555;font-size:14px;cursor:pointer;',
      'transition:background .12s;font-weight:500;',
    '}',
    '.wh-btn-cancel:hover{background:#f5f7fa;}',
    '.wh-btn-submit{',
      'padding:9px 22px;border-radius:8px;border:none;',
      'background:#ff6b35;color:#fff;font-size:14px;cursor:pointer;',
      'font-weight:600;transition:background .12s, opacity .15s;',
    '}',
    '.wh-btn-submit:hover{background:#e85c28;}',
    '.wh-btn-submit:disabled{opacity:.6;cursor:default;}',

    // 問題回報／意見回饋切換
    '.wh-tabs{display:flex;gap:6px;margin-bottom:10px;}',
    '.wh-tab{flex:1;padding:9px 0;border-radius:8px;border:1px solid #d9e2f0;background:#fff;color:#555;font-size:15px;font-weight:600;cursor:pointer;}',
    '.wh-tab.wh-on{background:#ff6b35;border-color:#ff6b35;color:#fff;}',

    // 框選畫面
    '#wh-mark{display:none;position:fixed;inset:0;z-index:99995;background:#111;color:#fff;flex-direction:column;',
      'font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei",sans-serif;}',
    '#wh-mark.wh-open{display:flex;}',
    '.wh-mark-top{padding:12px 16px;text-align:center;font-size:17px;font-weight:700;}',
    '.wh-mark-top small{display:block;font-size:13px;font-weight:400;color:#bbb;margin-top:2px;}',
    '.wh-mark-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;padding:0 12px;}',
    '#wh-mark-canvas{max-width:100%;max-height:100%;touch-action:none;cursor:crosshair;background:#fff;}',
    '.wh-mark-bar{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;padding:12px 16px calc(12px + env(safe-area-inset-bottom,0px));}',
    '.wh-mark-btn{padding:10px 16px;border-radius:8px;border:1px solid #555;background:#222;color:#fff;font-size:15px;cursor:pointer;}',
    '.wh-mark-btn.wh-primary{background:#ff6b35;border-color:#ff6b35;font-weight:700;}',

    // Toast
    '#wh-toast{',
      'position:fixed;bottom:32px;left:50%;transform:translateX(-50%) translateY(20px);',
      'z-index:99999;background:#222;color:#fff;font-size:14px;',
      'padding:10px 20px;border-radius:10px;',
      'opacity:0;transition:opacity .3s, transform .3s;pointer-events:none;white-space:nowrap;',
    '}',
    '#wh-toast.wh-show{opacity:1;transform:translateX(-50%) translateY(0);}',

    // Loading spinner in button
    '.wh-spinner{',
      'display:inline-block;width:14px;height:14px;',
      'border:2px solid rgba(255,255,255,.4);border-top-color:#fff;',
      'border-radius:50%;animation:wh-spin .7s linear infinite;vertical-align:middle;margin-right:6px;',
    '}',
    '@keyframes wh-spin{to{transform:rotate(360deg)}}',

    // RWD
    '@media(max-width:540px){',
      '#wh-bug-modal{width:calc(100vw - 24px);}',
      '.wh-modal-body{padding:12px 16px 16px;}',
      '.wh-modal-footer{padding:0 16px 16px;}',
    '}',
  ].join('');
  document.head.appendChild(style);

  // ── HTML ──
  var backdrop = document.createElement('div');
  backdrop.id = 'wh-bug-backdrop';
  document.body.appendChild(backdrop);

  var modal = document.createElement('div');
  modal.id = 'wh-bug-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', '問題回報與意見回饋');
  modal.innerHTML = [
    '<div class="wh-modal-header">',
      '<div class="wh-tabs">',
        '<button type="button" class="wh-tab wh-on" id="wh-tab-bug">🐛 問題回報</button>',
        '<button type="button" class="wh-tab" id="wh-tab-idea">💡 意見回饋</button>',
      '</div>',
      '<p class="wh-modal-sub" id="wh-modal-sub">請告訴我們哪裡有問題，我們會協助處理。</p>',
    '</div>',
    '<div class="wh-modal-body">',

      // Screenshot
      '<div class="wh-section">',
        '<span class="wh-label" id="wh-shot-label">📷 自動截圖</span>',
        '<div id="wh-screenshot-wrap">',
          '<div id="wh-screenshot-placeholder">截圖擷取中…</div>',
          '<img id="wh-screenshot-img" alt="截圖預覽">',
          '<div id="wh-screenshot-actions" style="display:none">',
            '<button class="wh-ss-btn" id="wh-mark-btn">框選問題 ✏️</button>',
            '<button class="wh-ss-btn" id="wh-retake-btn">重新截圖 🔄</button>',
            '<button class="wh-ss-btn" id="wh-remove-ss-btn">移除 ✕</button>',
          '</div>',
        '</div>',
      '</div>',

      // Upload
      '<div class="wh-section">',
        '<span class="wh-label" id="wh-upload-label">🖼️ 上傳圖片 (<span id="wh-upload-cnt">0</span>/5)</span>',
        '<div id="wh-upload-area" tabindex="0" role="button" aria-label="點擊上傳圖片">',
          '<span style="font-size:13px;color:#888">點擊上傳（每張最大 5MB，最多 5 張）</span>',
        '</div>',
        '<input type="file" id="wh-upload-input" accept="image/*" multiple>',
        '<div id="wh-upload-thumbs"></div>',
      '</div>',

      // Path
      '<div class="wh-section">',
        '<span class="wh-label">📍 頁面位置</span>',
        '<input id="wh-page-path" type="text" readonly tabindex="-1">',
      '</div>',

      // Type
      '<div class="wh-section" id="wh-type-section">',
        '<span class="wh-label">問題類型</span>',
        '<select id="wh-bug-type">',
          '<option value="功能異常">🐛 功能異常</option>',
          '<option value="版面問題">🖼️ 版面問題</option>',
          '<option value="資料錯誤">📊 資料錯誤</option>',
          '<option value="其他">📝 其他</option>',
        '</select>',
      '</div>',

      // Reporter：員工登入頁自動帶入，其他頁選填
      '<div class="wh-section" id="wh-reporter-section">',
        '<span class="wh-label">您的姓名或電話（選填，方便我們聯絡您）</span>',
        '<input id="wh-bug-reporter" maxlength="80" autocomplete="name" style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #d6dbe6;border-radius:8px;font-size:16px;">',
      '</div>',

      // Description
      '<div class="wh-section">',
        '<span class="wh-label"><span id="wh-desc-label">問題描述</span> <span class="wh-required" id="wh-desc-star">*</span></span>',
        '<textarea id="wh-bug-desc" placeholder="寫一句就好，例如：這顆按鈕壞了" maxlength="1000"></textarea>',
        '<div id="wh-desc-err">請寫一句話，或在截圖上框出問題</div>',
      '</div>',

    '</div>',// end body
    '<div class="wh-modal-footer">',
      '<button class="wh-btn-cancel" id="wh-cancel-btn">取消</button>',
      '<button class="wh-btn-submit" id="wh-submit-btn">送出回報</button>',
    '</div>',
  ].join('');
  document.body.appendChild(modal);

  var toast = document.createElement('div');
  toast.id = 'wh-toast';
  document.body.appendChild(toast);

  // 框選畫面：截圖一好就直接進來，同仁把壞掉的地方框起來就好
  var markEl = document.createElement('div');
  markEl.id = 'wh-mark';
  markEl.innerHTML = [
    '<div class="wh-mark-top">用手指或滑鼠，把有問題的地方框起來<small>點一下也可以，會在那裡放一個框</small></div>',
    '<div class="wh-mark-stage"><canvas id="wh-mark-canvas"></canvas></div>',
    '<div class="wh-mark-bar">',
      '<button type="button" class="wh-mark-btn" id="wh-mark-undo">復原</button>',
      '<button type="button" class="wh-mark-btn" id="wh-mark-idea">我是要給意見</button>',
      '<button type="button" class="wh-mark-btn" id="wh-mark-skip">不框，直接寫</button>',
      '<button type="button" class="wh-mark-btn wh-primary" id="wh-mark-done">框好了</button>',
    '</div>',
  ].join('');
  document.body.appendChild(markEl);

  // Trigger button
  var btn = document.createElement('button');
  btn.id = 'wh-bug-report-btn';
  btn.title = '問題回報';
  btn.setAttribute('aria-label', '問題回報');
  btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M11 15h2v2h-2v-2zm0-8h2v6h-2V7zm1-5C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>';
  document.body.appendChild(btn);

  // ── State ──
  var screenshotDataUrl = null;
  var baseShot = null;    // 沒框過的原圖，重新框選時用
  var baseImage = null;
  var marks = [];         // 框選的位置，單位是原圖像素
  var drag = null;
  var mode = 'bug';       // bug 問題回報、idea 意見回饋
  var uploadFiles = []; // array of dataURL strings
  var html2canvasLoaded = false;
  var isSubmitting = false;

  // ── Helpers ──
  function showToast(msg, duration) {
    toast.textContent = msg;
    toast.classList.add('wh-show');
    setTimeout(function () { toast.classList.remove('wh-show'); }, duration || 3000);
  }

  function setMode(next) {
    mode = next;
    var idea = next === 'idea';
    document.getElementById('wh-tab-bug').classList.toggle('wh-on', !idea);
    document.getElementById('wh-tab-idea').classList.toggle('wh-on', idea);
    document.getElementById('wh-type-section').style.display = idea ? 'none' : '';
    document.getElementById('wh-modal-sub').textContent = idea ? '想新增什麼、哪裡可以更好用，都可以寫。' : '請告訴我們哪裡有問題，我們會協助處理。';
    document.getElementById('wh-desc-label').textContent = idea ? '你的意見' : '問題描述';
    document.getElementById('wh-bug-desc').placeholder = idea ? '例如：希望這裡可以多一個搜尋' : '寫一句就好，例如：這顆按鈕壞了';
    document.getElementById('wh-shot-label').textContent = idea ? '📷 截圖（用不到可以按移除）' : '📷 自動截圖';
    document.getElementById('wh-submit-btn').textContent = idea ? '送出意見' : '送出回報';
    document.getElementById('wh-desc-err').style.display = 'none';
  }

  function setScreenshot(dataUrl) {
    screenshotDataUrl = dataUrl;
    baseShot = dataUrl;
    marks = [];
    showShot(dataUrl);
  }

  function showShot(dataUrl) {
    var img = document.getElementById('wh-screenshot-img');
    var placeholder = document.getElementById('wh-screenshot-placeholder');
    var actions = document.getElementById('wh-screenshot-actions');
    if (dataUrl) {
      img.src = dataUrl;
      img.style.display = 'block';
      placeholder.style.display = 'none';
      actions.style.display = 'flex';
    } else {
      img.src = '';
      img.style.display = 'none';
      placeholder.style.display = 'block';
      placeholder.textContent = '截圖已移除（仍可送出純文字回報）';
      actions.style.display = 'none';
    }
  }

  // ── 框選 ──
  function drawMarks() {
    var c = document.getElementById('wh-mark-canvas');
    var ctx = c.getContext('2d');
    ctx.drawImage(baseImage, 0, 0);
    ctx.lineWidth = Math.max(4, c.width / 250);
    ctx.strokeStyle = '#e8112d';
    marks.concat(drag ? [drag] : []).forEach(function (m) { ctx.strokeRect(m.x, m.y, m.w, m.h); });
  }

  function openMark() {
    if (!baseShot) return;
    var img = new Image();
    img.onload = function () {
      baseImage = img;
      var c = document.getElementById('wh-mark-canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      drawMarks();
      markEl.classList.add('wh-open');
    };
    img.src = baseShot;
  }

  function closeMark() { markEl.classList.remove('wh-open'); }

  function finishMark() {
    closeMark();
    if (!marks.length) { screenshotDataUrl = baseShot; showShot(baseShot); return; }
    var c = document.getElementById('wh-mark-canvas');
    compressImage(c.toDataURL('image/jpeg', 0.92), 1600, 0.8, function (done) {
      screenshotDataUrl = done;
      showShot(done);
    });
  }

  function canvasPoint(c, e) {
    var r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height, scale: c.width / r.width };
  }

  (function () {
    var c = document.getElementById('wh-mark-canvas');
    var start = null;
    c.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      start = canvasPoint(c, e);
      drag = { x: start.x, y: start.y, w: 0, h: 0 };
      try { c.setPointerCapture(e.pointerId); } catch (err) { /* 舊瀏覽器沒有也能畫 */ }
    });
    c.addEventListener('pointermove', function (e) {
      if (!start) return;
      var p = canvasPoint(c, e);
      drag = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
      drawMarks();
    });
    function end() {
      if (!start) return;
      var m = drag, s = start;
      start = null; drag = null;
      // 只點一下：在那裡放一個框，手指比較好用
      var min = 12 * s.scale;
      if (m.w < min && m.h < min) {
        var b = 90 * s.scale;
        m = { x: s.x - b / 2, y: s.y - b / 2, w: b, h: b };
      }
      marks.push(m);
      drawMarks();
    }
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  })();

  document.getElementById('wh-mark-undo').addEventListener('click', function () { marks.pop(); drawMarks(); });
  document.getElementById('wh-mark-skip').addEventListener('click', function () { marks = []; finishMark(); });
  document.getElementById('wh-mark-done').addEventListener('click', finishMark);
  document.getElementById('wh-mark-idea').addEventListener('click', function () { marks = []; finishMark(); setMode('idea'); });
  document.getElementById('wh-mark-btn').addEventListener('click', openMark);
  document.getElementById('wh-tab-bug').addEventListener('click', function () { setMode('bug'); });
  document.getElementById('wh-tab-idea').addEventListener('click', function () { setMode('idea'); });

  function updateUploadCount() {
    document.getElementById('wh-upload-cnt').textContent = uploadFiles.length;
  }

  function renderThumbs() {
    var wrap = document.getElementById('wh-upload-thumbs');
    wrap.innerHTML = '';
    uploadFiles.forEach(function (dataUrl, i) {
      var img = document.createElement('img');
      img.className = 'wh-thumb';
      img.src = dataUrl;
      img.alt = '附圖 ' + (i + 1);
      img.style.cursor = 'pointer';
      img.title = '點擊移除';
      img.addEventListener('click', function () {
        uploadFiles.splice(i, 1);
        updateUploadCount();
        renderThumbs();
      });
      wrap.appendChild(img);
    });
  }

  // Compress image to JPEG, max longEdge px, quality 0-1
  function compressImage(dataUrl, maxLongEdge, quality, cb) {
    var img = new Image();
    img.onload = function () {
      var w = img.naturalWidth, h = img.naturalHeight;
      if (Math.max(w, h) > maxLongEdge) {
        var ratio = maxLongEdge / Math.max(w, h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      cb(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = function () { cb(dataUrl); }; // fallback: use original
    img.src = dataUrl;
  }

  // Lazy-load html2canvas
  function loadHtml2canvas(cb) {
    if (html2canvasLoaded && window.html2canvas) { cb(); return; }
    var s = document.createElement('script');
    s.src = new URL('vendor/html2canvas.min.js', WH_BUG_SELF || location.href).href; // 自家託管 1.4.1，不在金流頁載第三方程式
    s.onload = function () { html2canvasLoaded = true; cb(); };
    s.onerror = function () { cb(new Error('html2canvas load failed')); };
    document.head.appendChild(s);
  }

  function takeScreenshot(cb) {
    loadHtml2canvas(function (err) {
      if (err) { cb(null); return; } // graceful: no screenshot
      // ponytail-debt: html2canvas 對跨域圖片預設失敗，useCORS:true 嘗試但不保證；
      // 若頁面有跨域圖片截圖會有空白區塊，可接受（仍傳其他部分）。
      // 只截眼前這個畫面：整頁長圖縮小後根本框不到按鈕
      window.html2canvas(document.body, {
        x: window.scrollX, y: window.scrollY, width: window.innerWidth, height: window.innerHeight,
        useCORS: true,
        allowTaint: false,
        logging: false,
        scale: Math.min(window.devicePixelRatio || 1, 2),
        // 忽略高 z-index 的 bug report UI（截圖時 modal 未開，按鈕本身 z-index 較高但 small）
        ignoreElements: function (el) {
          return el.id === 'wh-bug-report-btn' || el.id === 'wh-mark';
        },
      }).then(function (canvas) {
        compressImage(canvas.toDataURL('image/jpeg', 1), 1600, 0.8, function (compressed) {
          cb(compressed);
        });
      }).catch(function () { cb(null); });
    });
  }

  // ── Open / Close ──
  function openModal() {
    backdrop.classList.add('wh-open');
    // Small rAF to trigger CSS transition
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        modal.classList.add('wh-open');
      });
    });
    document.getElementById('wh-page-path').value = location.pathname + safeSearch();
    document.getElementById('wh-bug-desc').value = '';
    document.getElementById('wh-desc-err').style.display = 'none';
    document.getElementById('wh-bug-type').value = '功能異常';
    setMode('bug');
    document.getElementById('wh-reporter-section').style.display = staffEmail() ? 'none' : '';
    try { document.getElementById('wh-bug-reporter').value = localStorage.getItem('wh_bug_reporter') || ''; } catch (e) { /* 無痕模式：留空 */ }
    uploadFiles = [];
    updateUploadCount();
    renderThumbs();
    document.getElementById('wh-screenshot-placeholder').textContent = '截圖擷取中…';
    setScreenshot(null);
    document.getElementById('wh-screenshot-actions').style.display = 'none';
    document.getElementById('wh-screenshot-img').style.display = 'none';
    document.getElementById('wh-screenshot-placeholder').style.display = 'block';
  }

  function closeModal() {
    modal.classList.remove('wh-open');
    backdrop.classList.remove('wh-open');
  }

  // ── Events ──
  btn.addEventListener('click', function () {
    // 1. Capture first, then open modal
    if (!autoShotAllowed()) {
      openModal();
      document.getElementById('wh-screenshot-placeholder').textContent = '此頁不自動截圖，以保護個人資料；需要的話可在下方自行上傳';
      return;
    }
    btn.style.pointerEvents = 'none';
    takeScreenshot(function (dataUrl) {
      btn.style.pointerEvents = '';
      openModal();
      if (dataUrl) {
        setScreenshot(dataUrl);
        openMark();
      } else {
        document.getElementById('wh-screenshot-placeholder').textContent = '截圖失敗（仍可送出純文字回報）';
      }
    });
  });

  document.getElementById('wh-cancel-btn').addEventListener('click', closeModal);
  backdrop.addEventListener('click', closeModal);

  document.getElementById('wh-retake-btn').addEventListener('click', function () {
    document.getElementById('wh-screenshot-placeholder').textContent = '重新截圖中…';
    setScreenshot(null);
    document.getElementById('wh-screenshot-placeholder').style.display = 'block';
    takeScreenshot(function (dataUrl) {
      if (dataUrl) { setScreenshot(dataUrl); openMark(); }
      else document.getElementById('wh-screenshot-placeholder').textContent = '截圖失敗';
    });
  });

  document.getElementById('wh-remove-ss-btn').addEventListener('click', function () {
    setScreenshot(null);
  });

  // Upload
  var uploadArea = document.getElementById('wh-upload-area');
  var uploadInput = document.getElementById('wh-upload-input');

  function handleFiles(files) {
    Array.from(files).forEach(function (file) {
      if (uploadFiles.length >= 5) return;
      if (!file.type.startsWith('image/')) return;
      if (file.size > 5 * 1024 * 1024) { showToast('圖片超過 5MB 限制'); return; }
      var reader = new FileReader();
      reader.onload = function (e) {
        compressImage(e.target.result, 1600, 0.8, function (compressed) {
          if (uploadFiles.length < 5) {
            uploadFiles.push(compressed);
            updateUploadCount();
            renderThumbs();
          }
        });
      };
      reader.readAsDataURL(file);
    });
  }

  uploadArea.addEventListener('click', function () { uploadInput.click(); });
  uploadArea.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') uploadInput.click(); });
  uploadInput.addEventListener('change', function () { handleFiles(this.files); this.value = ''; });

  // Drag & drop on upload area
  uploadArea.addEventListener('dragover', function (e) { e.preventDefault(); uploadArea.style.borderColor = '#6aabf7'; });
  uploadArea.addEventListener('dragleave', function () { uploadArea.style.borderColor = ''; });
  uploadArea.addEventListener('drop', function (e) {
    e.preventDefault();
    uploadArea.style.borderColor = '';
    if (e.dataTransfer && e.dataTransfer.files) handleFiles(e.dataTransfer.files);
  });

  // Submit
  document.getElementById('wh-submit-btn').addEventListener('click', function () {
    if (isSubmitting) return;
    var desc = document.getElementById('wh-bug-desc').value.trim();
    // 同仁常常只框起來、寫「壞了」，這樣就夠修了
    if (!desc && marks.length) desc = '（已在截圖框出問題位置）';
    if (!desc) {
      document.getElementById('wh-desc-err').style.display = 'block';
      document.getElementById('wh-bug-desc').focus();
      return;
    }
    document.getElementById('wh-desc-err').style.display = 'none';
    isSubmitting = true;

    var submitBtn = document.getElementById('wh-submit-btn');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="wh-spinner"></span>送出中…';

    var reporter = staffEmail() || document.getElementById('wh-bug-reporter').value.trim();
    if (!staffEmail() && reporter) { try { localStorage.setItem('wh_bug_reporter', reporter); } catch (e) { /* 存不了就下次重填 */ } }
    var isCustomerPage = !autoShotAllowed();

    var payload = {
      description: desc,
      reporter: reporter,
      caseRef: caseRef(),
      errors: pageErrors.slice(),
      audience: isCustomerPage ? 'customer' : 'staff',
      type: mode === 'idea' ? '意見回饋' : document.getElementById('wh-bug-type').value,
      url: location.origin + location.pathname + safeSearch() + location.hash.replace(/token=[^&]*/gi, 'token=***'),
      title: document.title,
      userAgent: navigator.userAgent,
      screenshot: screenshotDataUrl || '',
      uploads: uploadFiles.slice(0, 5),
    };

    fetch(WH_CFG.endpoint || BUG_REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'idea' ? '送出意見' : '送出回報';
        if (json.ok) {
          closeModal();
          showToast(mode === 'idea' ? '已收到你的意見，謝謝' : isCustomerPage ? '已收到，我們會盡快處理；急件請直接聯絡您的業務' : '已送出，謝謝回報 🎉', 4500);
        } else {
          showToast(json.error === 'rate_limited' ? '回報次數太多，請一小時後再試' : '送出失敗：' + (json.error || '未知錯誤') + '，請再試一次', 4000);
        }
      })
      .catch(function (err) {
        isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'idea' ? '送出意見' : '送出回報';
        showToast('網路錯誤，請再試一次', 3500);
      });
  });

  // ESC to close
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (markEl.classList.contains('wh-open')) { marks = []; finishMark(); return; }
    if (modal.classList.contains('wh-open')) closeModal();
  });

  // ── 避讓：右下角有可操作元件時，回報鈕縮成右側中段的靠邊小標籤（不藏起來，否則短頁的「下一步」會讓它永遠看不到）──
  // 標籤只有在壓到簽名板時才整個藏起；hideWhen 符合時也整個藏起
  // 頁面可在載入本檔「之前」設定 window.WH_BUG_REPORT = { guard: '額外選擇器', hideWhen: '符合時整個藏起的選擇器' }
  (function () {
    var opts = WH_CFG;
    var BAND_X = 88;  // 按鈕 48 + 右距 20 + 餘裕
    var BAND_Y = 96;  // 按鈕 48 + 底距 24 + 餘裕
    var SEL = 'button,input,select,textarea,canvas,[role="button"],[type="submit"],[class*="btn"],[class*="button"]' +
      (opts.guard ? ',' + opts.guard : '');
    var scheduled = false, last = 0, state = 'full';
    var HIDE_LIMIT = 8000, startedAt = Date.now(); // hideWhen 只在開頁前 8 秒有效：載入卡住或失敗時，客戶才按得到回報
    var TAB_W = 24, TAB_H = 52;

    function inWidget(el) { return el.closest && el.closest('#wh-bug-report-btn,#wh-bug-modal,#wh-bug-backdrop,#wh-toast,#wh-mark'); }

    function nextState() {
      try {
        if (opts.hideWhen && Date.now() - startedAt < HIDE_LIMIT) {
          var o = document.querySelectorAll(opts.hideWhen);
          for (var k = 0; k < o.length; k++) { if (o[k].getClientRects().length) return 'hide'; }
        }
      } catch (e) { /* 選擇器寫錯就略過 */ }
      var vw = window.innerWidth, vh = window.innerHeight;
      var tabTop = vh / 2 - TAB_H / 2, pads = document.querySelectorAll('canvas');
      for (var c = 0; c < pads.length; c++) {
        var pr = pads[c].getBoundingClientRect();
        if (pr.width >= 4 && pr.right > vw - TAB_W && pr.top < tabTop + TAB_H && pr.bottom > tabTop && cornerBusy()) return 'hide';
      }
      return cornerBusy() ? 'tab' : 'full';
    }

    function cornerBusy() {
      var vw = window.innerWidth, vh = window.innerHeight;
      var list = document.querySelectorAll(SEL);
      for (var i = 0; i < list.length; i++) {
        var el = list[i];
        var r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.height > 220) continue;                  // 看不見或是大容器
        if (r.right < vw - BAND_X || r.left > vw || r.bottom < vh - BAND_Y || r.top > vh) continue; // 不在右下角
        if (inWidget(el)) continue;
        var cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none') continue;
        // 被其他東西完整蓋住（例如登入覆蓋層、關著的抽屜）不算
        var cx = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), vh - 1);
        var top = document.elementFromPoint(cx, cy);
        if (top && !inWidget(top) && top !== el && !el.contains(top) && !top.contains(el)) continue;
        return true;
      }
      return false;
    }

    function update() {
      scheduled = false; last = Date.now();
      var n = nextState();
      if (n !== state) {
        state = n;
        btn.classList.toggle('wh-guard-hide', n === 'hide');
        btn.classList.toggle('wh-guard-tab', n === 'tab');
      }
    }

    function schedule() {
      if (scheduled) return;
      scheduled = true;
      var wait = Math.max(0, 150 - (Date.now() - last));
      setTimeout(function () { requestAnimationFrame(update); }, wait);
    }

    var st = document.createElement('style');
    st.textContent = '#wh-bug-report-btn.wh-guard-hide{display:none!important}' +
      '#wh-bug-report-btn.wh-guard-tab{right:0;bottom:auto;top:calc(50% - ' + (TAB_H / 2) + 'px);width:' + TAB_W + 'px;height:' + TAB_H + 'px;' +
      'border-radius:10px 0 0 10px;font-size:13px;box-shadow:-2px 2px 8px rgba(255,107,53,.4)}' +
      '#wh-bug-report-btn.wh-guard-tab:hover{transform:none}';
    document.head.appendChild(st);

    window.addEventListener('scroll', schedule, { passive: true, capture: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('load', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('transitionend', schedule, true);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) { if (!inWidget(muts[i].target.nodeType === 1 ? muts[i].target : muts[i].target.parentNode || document.body)) { schedule(); return; } }
    }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'disabled', 'open'] });
    schedule();
    setTimeout(schedule, HIDE_LIMIT + 200);
  })();
})();
