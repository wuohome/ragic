/* ===================== 裝修／修繕場勘規劃書產生器 ===================== */

/* ---------- 選項（可自行新增） ---------- */
const OPT = {
  gender:['先生','小姐'],
  projectType:['裝修工程','修繕工程'],
  workItem:['拆除工程','泥作工程','水電工程','木作工程','廚具工程','系統櫃工程','鋁窗工程','油漆工程','衛浴設備','雜項工程','其他'],
  repairCat:['水電','泥作','木作','家電','門鎖','其他'],
  houseAge:['5年內','5-10年','10-20年','20-30年','30年以上'],
  houseCond:['空屋','有傢俱','有住人','剛點交','頂樓加蓋','地下室'],
  elevator:['有電梯','無電梯'],
  waste:['現場廢棄物清運','保護拆除及垃圾清運','大樓集中清運'],
};

/* ---------- 狀態 ---------- */
const DEFAULT_NOTES=[
  '實際施工依照簽名圖面為主，所有材質選擇皆因預算考量，由本公司提供的樣本為主。',
  '本工程不含移動式傢俱、床組及家電，但公司可協助選購事宜。',
  '本工程不含冷氣施做，公司可代為協調現場施工事宜。',
  '壁燈、吊燈部份，由業主提供(亦可公司選購)，公司可代為安裝。',
  '以上工程除特別標示外，均保固一年，系統櫃工程保固五年，系統櫃鉸鍊保固三年。',
  '若有增減事項，均需雙方溝通同意簽名，方可增減，並附加於合約書報價單處。',
];
function defaultState(){ return {
  cover:{ title:'室內設計裝潢工程場勘規劃書', city:'', district:'', name:'', gender:'先生' },
  site:{ city:'', district:'', region:'', addr:'', community:'', pos:'', contact:'', phone:'' },
  device:{ age:'', ping:'', layout:'', floor:'', totalFloor:'', cond:'', elevator:'' },
  power:{ type:'裝修工程', items:'', repairCat:'', area:'', days:'', start:'' },
  install:{ waste:'', wasteQty:'', laborQty:'', protect:'' },
  cpages:[],   // 施工說明頁
  notes: DEFAULT_NOTES.map(t=>({text:t,red:false})),
  bom:{ kW:'室內設計裝潢', work:['拆除工程','泥作工程','水電工程','木作工程','油漆工程','雜項工程'], mat:[] },
}; }
let S = defaultState();
let STEP=0;

const STEPS=[
  {k:'cover',  t:'封面基本資料', s:'縣市區・姓名'},
  {k:'overview',t:'場勘重點一覽表', s:'現場/屋況/範圍/條件'},
  {k:'cpages', t:'施工說明（照片）', s:'拉線標註・可多頁'},
  {k:'notes',  t:'施工注意事項', s:'條列・可紅字'},
  {k:'bom',    t:'工項及材料一覽', s:'自動帶入'},
];

const $=(s,r=document)=>r.querySelector(s);
const el=(h)=>{const d=document.createElement('div');d.innerHTML=h.trim();return d.firstChild;};

/* ---------- 通用欄位 ---------- */
function txt(obj,key,ph=''){return `<input value="${esc(obj[key]||'')}" placeholder="${ph}" oninput="set('${path(obj)}','${key}',this.value)">`;}
function area(obj,key,ph=''){return `<textarea placeholder="${ph}" oninput="set('${path(obj)}','${key}',this.value)">${esc(obj[key]||'')}</textarea>`;}
function sel(obj,key,optKey,addable=true){
  const opts=OPT[optKey]||[];
  const cur=obj[key]||'';
  let h=`<div class="addrow"><select onchange="set('${path(obj)}','${key}',this.value)">`;
  h+=`<option value=""${cur===''?' selected':''}>— 請選擇 —</option>`;
  opts.forEach(o=>h+=`<option${o===cur?' selected':''}>${esc(o)}</option>`);
  if(cur&&!opts.includes(cur))h+=`<option selected>${esc(cur)}</option>`;
  h+='</select>';
  if(addable)h+=`<button class="mini" onclick="addOpt('${optKey}','${path(obj)}','${key}')">＋新增</button>`;
  return h+'</div>';
}
// 縣市／鄉鎮市區連動下拉（原生 select，手機/iPad 即為系統滾輪）
function regionCitySel(obj,cityKey,distKey){
  const cities=Object.keys(window.TW_REGIONS||{});
  const cur=obj[cityKey]||'';
  let h=`<select onchange="setRegionCity('${path(obj)}','${cityKey}','${distKey}',this.value)">`;
  h+=`<option value=""${cur===''?' selected':''}>— 請選擇 —</option>`;
  cities.forEach(c=>h+=`<option${c===cur?' selected':''}>${esc(c)}</option>`);
  if(cur&&!cities.includes(cur))h+=`<option selected>${esc(cur)}</option>`;
  return h+'</select>';
}
function regionDistSel(obj,cityKey,distKey){
  const dists=(window.TW_REGIONS&&window.TW_REGIONS[obj[cityKey]])||[];
  const cur=obj[distKey]||'';
  let h=`<select onchange="set('${path(obj)}','${distKey}',this.value)">`;
  h+=`<option value=""${cur===''?' selected':''}>— 請選擇 —</option>`;
  dists.forEach(d=>h+=`<option${d===cur?' selected':''}>${esc(d)}</option>`);
  if(cur&&!dists.includes(cur))h+=`<option selected>${esc(cur)}</option>`;
  return h+'</select>';
}
function setRegionCity(p,cityKey,distKey,val){ S[p][cityKey]=val; S[p][distKey]=''; render(); }

// path helper: 用名稱對應到 S 的子物件
const OBJMAP=new WeakMap();
function path(obj){
  for(const k of Object.keys(S)) if(S[k]===obj) return k;
  return '?';
}
function set(p,key,val){ S[p][key]=val; }
function addOpt(optKey,p,key){
  const v=prompt('輸入新選項：'); if(!v)return;
  if(!OPT[optKey].includes(v))OPT[optKey].push(v);
  S[p][key]=v; render();
}
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---------- 導覽 ---------- */
function renderNav(){
  const n=$('#nav'); n.innerHTML='';
  STEPS.forEach((s,i)=>{
    n.appendChild(el(`<div class="${i===STEP?'on':''}" onclick="go(${i})">${i+1}. ${s.t}<small>${s.s}</small></div>`));
  });
}
function go(i){ STEP=Math.max(0,Math.min(STEPS.length-1,i)); render(); window.scrollTo(0,0); }
function render(){
  renderNav();
  const m=$('#main');
  ({cover:rCover,overview:rOverview,cpages:rCpages,notes:rNotes,bom:rBom}[STEPS[STEP].k])(m);
  m.appendChild(el(`<div class="foot">
    <button class="prev" onclick="go(${STEP-1})" ${STEP===0?'style=visibility:hidden':''}>← 上一步</button>
    <button class="next" onclick="go(${STEP+1})" ${STEP===STEPS.length-1?'style=visibility:hidden':''}>下一步 →</button>
  </div>`));
  if(window._booted)scheduleSave();
}

/* ---------- 步驟1：封面 ---------- */
function rCover(m){
  m.innerHTML=`<h2 class="sec">封面基本資料</h2><p class="hint">對應規劃書第 1 頁封面。</p>
  <div class="blk"><h3>工程案資訊</h3>
    <div class="grid one"><div class="field"><label class="f">工程案標題</label>${txt(S.cover,'title')}</div></div>
    <div class="grid">
      <div class="field"><label class="f">縣市</label>${regionCitySel(S.cover,'city','district')}</div>
      <div class="field"><label class="f">鄉鎮市區</label>${regionDistSel(S.cover,'city','district')}</div>
      <div class="field"><label class="f">業主姓名（姓）</label>${txt(S.cover,'name','例：陳')}</div>
      <div class="field"><label class="f">稱謂</label>${sel(S.cover,'gender','gender',false)}</div>
    </div>
  </div>`;
}

/* ---------- 步驟2：一覽表 ---------- */
function rOverview(m){
  m.innerHTML=`<h2 class="sec">場勘重點一覽表</h2><p class="hint">對應規劃書第 4 頁核心表格。可手填或下拉，下拉旁「＋新增」可加自訂選項。</p>
  <div class="grid">
    <div class="blk"><h3>現場資訊</h3>
      ${ff('縣市（同封面）',regionCitySel(S.cover,'city','district'))}
      ${ff('鄉鎮市區（同封面）',regionDistSel(S.cover,'city','district'))}
      ${ff('場勘地址',txt(S.site,'addr'))}
      ${ff('社區／大樓名稱',txt(S.site,'community'))}
      ${ff('樓層／戶別',txt(S.site,'pos'))}
      ${ff('業主聯絡人',txt(S.site,'contact'))}
      ${ff('聯絡電話',txt(S.site,'phone'))}
    </div>
    <div class="blk"><h3>屋況資訊</h3>
      ${ff('屋齡',sel(S.device,'age','houseAge'))}
      ${ff('坪數',txt(S.device,'ping'))}
      ${ff('格局',txt(S.device,'layout','例：3房2廳2衛'))}
      ${ff('所在樓層',txt(S.device,'floor'))}
      ${ff('總樓層',txt(S.device,'totalFloor'))}
      ${ff('現況',sel(S.device,'cond','houseCond'))}
      ${ff('電梯',sel(S.device,'elevator','elevator',false))}
    </div>
    <div class="blk"><h3>工程範圍</h3>
      ${ff('工程類型',sel(S.power,'type','projectType',false))}
      ${ff('工項',sel(S.power,'items','workItem'))}
      ${ff('修繕類別',sel(S.power,'repairCat','repairCat'))}
      ${ff('施作範圍',txt(S.power,'area','例：主臥＋衛浴'))}
      ${ff('預計工期（天）',txt(S.power,'days'))}
      ${ff('期望開工日',txt(S.power,'start'))}
    </div>
    <div class="blk"><h3>清運與保護</h3>
      ${ff('廢棄物清運',sel(S.install,'waste','waste'))}
      ${ff('垃圾清運（車）',txt(S.install,'wasteQty','例：3'))}
      ${ff('人工搬運補貼（工）',txt(S.install,'laborQty','例：8'))}
      ${ff('保護工程範圍',txt(S.install,'protect','例：公共走道＋電梯轎廂'))}
    </div>
  </div>`;
}
function ff(label,inner){return `<div class="field"><label class="f">${label}</label>${inner}</div>`;}

/* ---------- 步驟3：施工說明（照片標註） ---------- */
function newCpage(){return {floor:'1F',holes:'',powerSrc:'',breaker:'',routing:'',note:'',objs:[],img:null,_imgEl:null};}
function rCpages(m){
  m.innerHTML=`<h2 class="sec">施工說明（照片標註）</h2><p class="hint">每頁＝一張現場照片＋拉線標註。可新增多頁，對應規劃書第 5~9 頁。</p><div id="cplist"></div>
  <button class="mini gold" style="padding:10px 16px" onclick="addCpage()">＋ 新增一頁施工照片</button>`;
  const list=$('#cplist',m);
  if(!S.cpages.length) list.appendChild(el('<div class="empty">尚無施工頁，點下方新增。</div>'));
  S.cpages.forEach((p,i)=>list.appendChild(buildCpage(p,i)));
}
function addCpage(){ S.cpages.push(newCpage()); render(); }
function delCpage(i){ if(confirm('刪除此頁？')){S.cpages.splice(i,1);render();} }

function buildCpage(p,i){
  const wrap=el(`<div class="cpage">
    <div class="head"><b>施工頁 ${i+1}</b><span class="sp" style="flex:1"></span>
      <button class="mini red" onclick="delCpage(${i})">刪除此頁</button></div>
    <div class="grid">
      ${ff('樓層',`<input value="${esc(p.floor)}" oninput="S.cpages[${i}].floor=this.value;reLabel(${i})">`)}
      ${ff('區域／房間',`<input value="${esc(p.holes)}" oninput="S.cpages[${i}].holes=this.value">`)}
      ${ff('現況問題',`<input value="${esc(p.powerSrc)}" placeholder="例：壁面滲水、磁磚膨拱" oninput="S.cpages[${i}].powerSrc=this.value">`)}
      ${ff('處理方式',`<input value="${esc(p.breaker)}" placeholder="例：打除重做防水層" oninput="S.cpages[${i}].breaker=this.value">`)}
    </div>
    ${ff('施工說明',`<input value="${esc(p.routing)}" placeholder="例：拆除既有磁磚，重做防水後鋪貼" oninput="S.cpages[${i}].routing=this.value">`)}
    ${ff('備註',`<textarea oninput="S.cpages[${i}].note=this.value">${esc(p.note)}</textarea>`)}
    <label class="f" style="margin-top:8px">現場照片＋標註</label>
    <div id="photo-${i}"></div>
  </div>`);
  setTimeout(()=>mountPhoto(p,i),0);
  return wrap;
}

/* ====== Canvas 標註引擎 ====== */
const TOOLS=[
  {k:'select', n:'🖐 選取/移動'},
  {k:'arrow',  n:'➡ 黃箭頭'},
  {k:'darrow', n:'⇢ 黃虛線箭頭'},
  {k:'dist',   n:'▪ 距離標籤(2M)'},
  {k:'red',    n:'🟥 紅重點框'},
  {k:'blue',   n:'🟦 藍說明框'},
  {k:'floor',  n:'⬜ 樓層/標籤'},
  {k:'text',   n:'🅰 純文字'},
];
const editor={};   // i -> {canvas,ctx,tool,img,scale,sel,start}

function mountPhoto(p,i){
  const host=$('#photo-'+i); if(!host)return;
  if(!p.img){
    host.innerHTML=`<div class="drop" onclick="document.getElementById('fi-${i}').click()">📷 點此上傳現場照片<br><small>支援拍照/相簿</small></div>
      <input id="fi-${i}" type="file" accept="image/*" style="display:none" onchange="loadPhoto(${i},this)">`;
    return;
  }
  let tb='<div class="toolbar">';
  TOOLS.forEach(t=>tb+=`<button data-t="${t.k}" onclick="setTool(${i},'${t.k}',this)">${t.n}</button>`);
  tb+=`<button onclick="delObj(${i})" style="color:#DD6650">🗑 刪除選取</button>`;
  tb+=`<button onclick="document.getElementById('fi-${i}').click()">🔄 換照片</button>`;
  tb+='</div>';
  host.innerHTML=tb+`<div class="canvas-wrap"><canvas id="cv-${i}"></canvas></div>
    <input id="fi-${i}" type="file" accept="image/*" style="display:none" onchange="loadPhoto(${i},this)">
    <div class="sub">操作：選工具→在圖上「按住拖曳」畫箭頭；標籤/框點一下放置後輸入文字。選取工具可拖動或刪除。</div>`;
  initCanvas(p,i);
}
function loadPhoto(i,input){
  const f=input.files[0]; if(!f)return;
  const r=new FileReader();
  r.onload=e=>{ S.cpages[i].img=e.target.result; S.cpages[i].objs=[]; mountPhoto(S.cpages[i],i); };
  r.readAsDataURL(f);
}
function initCanvas(p,i){
  const cv=$('#cv-'+i); const img=new Image();
  img.onload=()=>{
    cv.width=img.width; cv.height=img.height;
    // 顯示寬度交給 CSS（width:100%）自適應，但不放大超過原圖
    const wrap=cv.closest('.canvas-wrap'); if(wrap)wrap.style.maxWidth=img.width+'px';
    editor[i]={canvas:cv,ctx:cv.getContext('2d'),img,tool:'arrow',sel:-1,start:null};
    p._imgEl=img;
    bindCanvas(i); drawCanvas(i);
    // default tool highlight
    const b=cv.closest('.cpage').querySelector('[data-t=arrow]'); if(b)b.classList.add('on');
  };
  img.src=p.img;
}
function setTool(i,t,btn){
  editor[i].tool=t; editor[i].sel=-1;
  btn.parentNode.querySelectorAll('button').forEach(b=>b.classList.remove('on'));
  if(btn.dataset.t)btn.classList.add('on');
  drawCanvas(i);
}
function reLabel(i){ drawCanvas(i); }

function evPos(i,e){
  const ed=editor[i],r=ed.canvas.getBoundingClientRect();
  const sx=ed.canvas.width/r.width, sy=ed.canvas.height/r.height;
  const cx=(e.touches?e.touches[0].clientX:e.clientX)-r.left;
  const cy=(e.touches?e.touches[0].clientY:e.clientY)-r.top;
  return {x:cx*sx, y:cy*sy};
}
function bindCanvas(i){
  const ed=editor[i],cv=ed.canvas,p=S.cpages[i];
  const down=e=>{
    e.preventDefault(); const pos=evPos(i,e); const t=ed.tool;
    if(t==='select'){
      ed.sel=hitTest(i,pos); ed.start=pos; drawCanvas(i); return;
    }
    if(t==='arrow'||t==='darrow'){ ed.start=pos; ed._draft={type:t,x1:pos.x,y1:pos.y,x2:pos.x,y2:pos.y}; return; }
    // 點放置型
    if(t==='dist'){ const v=prompt('距離/文字：','2M'); if(v)p.objs.push({type:'dist',x:pos.x,y:pos.y,text:v}); }
    if(t==='red'){ const v=prompt('紅框內容（換行用 Enter）：','現況問題：\n壁面滲水\n磁磚膨拱'); if(v)p.objs.push({type:'red',x:pos.x,y:pos.y,text:v}); }
    if(t==='blue'){ const v=prompt('藍框內容：','處理方式：\n打除重做\n防水層'); if(v)p.objs.push({type:'blue',x:pos.x,y:pos.y,text:v}); }
    if(t==='floor'){ const v=prompt('標籤文字：',p.floor||'1F'); if(v)p.objs.push({type:'floor',x:pos.x,y:pos.y,text:v}); }
    if(t==='text'){ const v=prompt('文字：',''); if(v)p.objs.push({type:'text',x:pos.x,y:pos.y,text:v}); }
    drawCanvas(i);
  };
  const move=e=>{
    if(!ed.start)return;
    if(e.cancelable)e.preventDefault();   // 拖曳時鎖住頁面捲動（iPad）
    const pos=evPos(i,e);
    if(ed._draft){ ed._draft.x2=pos.x; ed._draft.y2=pos.y; drawCanvas(i,ed._draft); }
    else if(ed.tool==='select'&&ed.sel>=0){
      const o=p.objs[ed.sel],dx=pos.x-ed.start.x,dy=pos.y-ed.start.y; ed.start=pos;
      if(o.type==='arrow'||o.type==='darrow'){o.x1+=dx;o.y1+=dy;o.x2+=dx;o.y2+=dy;}
      else {o.x+=dx;o.y+=dy;}
      drawCanvas(i);
    }
  };
  const up=e=>{
    if(ed._draft){
      const d=ed._draft; if(Math.hypot(d.x2-d.x1,d.y2-d.y1)>8)p.objs.push(d);
      ed._draft=null;
    }
    ed.start=null; drawCanvas(i);
  };
  cv.onmousedown=down; cv.onmousemove=move; window.addEventListener('mouseup',up);
  cv.ontouchstart=down; cv.ontouchmove=move; cv.ontouchend=up;
}
function delObj(i){ const ed=editor[i]; if(ed.sel>=0){S.cpages[i].objs.splice(ed.sel,1);ed.sel=-1;drawCanvas(i);} else alert('先用選取工具點選一個標註'); }
function hitTest(i,pos){
  const objs=S.cpages[i].objs;
  for(let k=objs.length-1;k>=0;k--){const o=objs[k];
    if(o.type==='arrow'||o.type==='darrow'){
      const d=distToSeg(pos,{x:o.x1,y:o.y1},{x:o.x2,y:o.y2}); if(d<14)return k;
    }else{ if(Math.abs(pos.x-o.x)<70&&Math.abs(pos.y-o.y)<40)return k; }
  }
  return -1;
}
function distToSeg(p,a,b){const l2=(b.x-a.x)**2+(b.y-a.y)**2;if(!l2)return Math.hypot(p.x-a.x,p.y-a.y);
  let t=((p.x-a.x)*(b.x-a.x)+(p.y-a.y)*(b.y-a.y))/l2;t=Math.max(0,Math.min(1,t));
  return Math.hypot(p.x-(a.x+t*(b.x-a.x)),p.y-(a.y+t*(b.y-a.y)));}

function drawCanvas(i,draft){
  const ed=editor[i];if(!ed)return;const c=ed.ctx,p=S.cpages[i];
  c.clearRect(0,0,ed.canvas.width,ed.canvas.height);
  c.drawImage(ed.img,0,0);
  const all=p.objs.concat(draft?[draft]:[]);
  all.forEach((o,idx)=>drawObj(c,o,ed,idx===ed.sel));
}
function drawObj(c,o,ed,selected){
  const u=ed.img.width/900;           // 比例化字級
  const F=v=>Math.round(v*u);
  c.save();
  if(o.type==='arrow'||o.type==='darrow'){
    c.strokeStyle='#F2CF00';c.lineWidth=F(6);c.lineCap='round';
    if(o.type==='darrow')c.setLineDash([F(14),F(10)]);
    c.beginPath();c.moveTo(o.x1,o.y1);c.lineTo(o.x2,o.y2);c.stroke();c.setLineDash([]);
    // 箭頭
    const ang=Math.atan2(o.y2-o.y1,o.x2-o.x1),h=F(22);
    c.fillStyle='#F2CF00';c.beginPath();
    c.moveTo(o.x2,o.y2);
    c.lineTo(o.x2-h*Math.cos(ang-.4),o.y2-h*Math.sin(ang-.4));
    c.lineTo(o.x2-h*Math.cos(ang+.4),o.y2-h*Math.sin(ang+.4));
    c.closePath();c.fill();
  }else{
    const lines=String(o.text||'').split('\n');
    let bg='rgba(0,0,0,.82)',col='#fff',fs=F(24),pad=F(8),bold=true,border=null;
    if(o.type==='dist'){bg='#000';col='#fff';fs=F(26);}
    if(o.type==='red'){bg='rgba(221,102,80,.92)';fs=F(22);}
    if(o.type==='blue'){bg='rgba(63,82,98,.92)';fs=F(22);}
    if(o.type==='floor'){bg='#fff';col='#26323C';fs=F(28);border='#26323C';}
    if(o.type==='text'){bg='rgba(0,0,0,0)';col='#F2CF00';fs=F(26);}
    c.font=`${bold?'bold ':''}${fs}px "Microsoft JhengHei","PingFang TC",sans-serif`;
    let w=0;lines.forEach(l=>w=Math.max(w,c.measureText(l).width));
    const lh=fs*1.25,bw=w+pad*2,bh=lh*lines.length+pad*1.2;
    if(o.type!=='text'){c.fillStyle=bg;c.fillRect(o.x,o.y,bw,bh);
      if(border){c.strokeStyle=border;c.lineWidth=F(3);c.strokeRect(o.x,o.y,bw,bh);}}
    c.fillStyle=col;c.textBaseline='top';
    lines.forEach((l,k)=>c.fillText(l,o.x+pad,o.y+pad*0.6+k*lh));
    if(selected){c.strokeStyle='#00E5FF';c.lineWidth=F(3);c.setLineDash([F(6),F(4)]);c.strokeRect(o.x-3,o.y-3,bw+6,bh+6);c.setLineDash([]);}
  }
  if(selected&&(o.type==='arrow'||o.type==='darrow')){
    c.fillStyle='#00E5FF';[[o.x1,o.y1],[o.x2,o.y2]].forEach(p=>{c.beginPath();c.arc(p[0],p[1],F(8),0,7);c.fill();});
  }
  c.restore();
}
function exportPhoto(i){   // 回傳烤好標註的 dataURL（隱藏選取框）
  const ed=editor[i];if(!ed)return S.cpages[i].img;
  const off=document.createElement('canvas');off.width=ed.img.width;off.height=ed.img.height;
  const c=off.getContext('2d');c.drawImage(ed.img,0,0);
  S.cpages[i].objs.forEach(o=>drawObj(c,o,ed,false));
  return off.toDataURL('image/jpeg',0.9);
}

/* ---------- 步驟4：注意事項 ---------- */
function rNotes(m){
  m.innerHTML=`<h2 class="sec">施工說明及注意事項</h2><p class="hint">對應規劃書第 10 頁。已預設帶入常用條目，可自行編輯、新增或刪除。勾選「紅字」可標示重點。</p>
  <div class="notes-list" id="nlist"></div>
  <button class="mini gold" style="padding:9px 14px" onclick="S.notes.push({text:'',red:false});render()">＋ 新增一條</button>
  <button class="mini ghost" style="padding:9px 14px;margin-left:8px" onclick="loadDefaultNotes()">↻ 帶入預設條目</button>`;
  const list=$('#nlist',m);
  S.notes.forEach((n,i)=>{
    list.appendChild(el(`<div class="nrow">
      <input value="${esc(n.text)}" placeholder="注意事項…" oninput="S.notes[${i}].text=this.value">
      <label class="chk"><input type="checkbox" ${n.red?'checked':''} onchange="S.notes[${i}].red=this.checked" style="width:auto">紅字</label>
      <button class="mini red" onclick="S.notes.splice(${i},1);render()">✕</button>
    </div>`));
  });
}
// 非破壞式帶入預設：清掉空白列，補上尚未存在的預設條目
function loadDefaultNotes(){
  const has=new Set(S.notes.map(n=>n.text.trim()));
  S.notes=S.notes.filter(n=>n.text.trim());
  DEFAULT_NOTES.forEach(t=>{ if(!has.has(t)) S.notes.push({text:t,red:false}); });
  if(!S.notes.length) S.notes=DEFAULT_NOTES.map(t=>({text:t,red:false}));
  render();
}

/* ---------- 步驟5：工項及材料 ---------- */
function autoMat(){
  const I=S.install,P=S.power,D=S.device;
  const m=[];
  if(P.items)m.push(`${P.items} 1 式`);
  if(P.repairCat)m.push(`${P.repairCat}材料 1 式`);
  if(P.area)m.push(`施作範圍：${P.area}`);
  if(I.protect)m.push(`保護工程拆除及清運（${I.protect}） 1 式`);
  if(I.waste)m.push(`${I.waste}${I.wasteQty?' '+I.wasteQty+' 車':' 1 式'}`);
  if(I.laborQty)m.push(`人工搬運補貼 ${I.laborQty} 工`);
  if(D.ping)m.push(`施工區域初步清潔工程 ${D.ping} 坪`);
  m.push('五金另料');
  return m;
}
function rBom(m){
  if(!S.bom.mat.length)S.bom.mat=autoMat();
  m.innerHTML=`<h2 class="sec">工項及材料一覽</h2><p class="hint">對應規劃書第 11 頁。材料已自動帶入一覽表內容，可增刪。</p>
  <div class="blk"><h3>工程類型</h3>${ff('工程類型',`<input value="${esc(S.bom.kW)}" oninput="S.bom.kW=this.value">`)}
    <button class="mini ghost" onclick="S.bom.mat=autoMat();render()">↻ 依一覽表重新帶入材料</button></div>
  <div class="twocol">
    <div class="blk"><h3>工項</h3><div id="worklist" class="bom-list"></div>
      <button class="mini" onclick="S.bom.work.push('');render()">＋ 工項</button></div>
    <div class="blk"><h3>材料</h3><div id="matlist" class="bom-list"></div>
      <button class="mini" onclick="S.bom.mat.push('');render()">＋ 材料</button></div>
  </div>`;
  const fill=(arr,host,name)=>{const h=$(host,m);arr.forEach((v,i)=>h.appendChild(el(
    `<div class="nrow"><input value="${esc(v)}" oninput="S.bom.${name}[${i}]=this.value">
     <button class="mini red" onclick="S.bom.${name}.splice(${i},1);render()">✕</button></div>`)));};
  fill(S.bom.work,'#worklist','work'); fill(S.bom.mat,'#matlist','mat');
}

/* ============================================================
   產生 PPT（PptxGenJS）— 比照藍白風格
   ============================================================ */
const NAVY='3F5262', WHITE='FFFFFF', GOLD='F2CF00', RED='DD6650', BLUE='556A7C';
let FONT='Adobe 繁黑體 Std';
const W=13.333, H=7.5;

// 偵測系統是否有指定字體（比對量測寬度與 fallback 是否不同）
function hasFont(name){
  const test='裝修修繕0123ABC',size='72px';
  const c=document.createElement('canvas').getContext('2d');
  c.font=`${size} monospace`; const base=c.measureText(test).width;
  c.font=`${size} "${name}", monospace`; const w=c.measureText(test).width;
  return w!==base;
}
// 有 Adobe 繁黑體 Std 就用，否則退回微軟正黑體
function pickFont(){ FONT = hasFont('Adobe 繁黑體 Std') ? 'Adobe 繁黑體 Std' : 'Microsoft JhengHei'; }

function bg(s){ s.background={color:NAVY}; }
function frame(s){ s.addShape('rect',{x:0.22,y:0.22,w:W-0.44,h:H-0.44,line:{color:WHITE,width:1.5},fill:{type:'none'}}); }
function corner(s){ if(window.LOGO_CORNER)s.addImage({data:LOGO_CORNER,x:W-2.9,y:0.32,w:2.45,h:0.93}); }
function watermark(s){ if(window.LOGO_CORNER)s.addImage({data:LOGO_CORNER,x:2.0,y:3.2,w:9.3,h:3.5,transparency:88}); }
function title(s,t){ s.addText(t,{x:0.55,y:0.42,w:9,h:0.9,fontFace:FONT,fontSize:30,bold:true,color:WHITE});
  s.addShape('line',{x:0.6,y:1.3,w:3.2,h:0,line:{color:WHITE,width:1.5}}); }

async function genPPT(){
  try{
  const btn=event?.target; if(btn){btn.disabled=true;btn.textContent='產生中…';}
  pickFont();
  const pptx=new PptxGenJS();
  pptx.defineLayout({name:'W',width:W,height:H}); pptx.layout='W';

  /* 1 封面 */
  let s=pptx.addSlide(); bg(s); frame(s);
  s.addText(S.cover.title,{x:0.9,y:1.5,w:10,h:1,fontFace:FONT,fontSize:36,bold:true,color:WHITE});
  s.addText(`${S.cover.city} ${S.cover.district}`,{x:0.95,y:2.55,w:10,h:0.6,fontFace:FONT,fontSize:22,color:'D9E0E6'});
  s.addText(`${S.cover.name} ${S.cover.gender}`,{x:0.95,y:3.15,w:10,h:0.6,fontFace:FONT,fontSize:22,color:'D9E0E6'});
  if(window.LOGO_CORNER)s.addImage({data:LOGO_CORNER,x:8.4,y:5.4,w:4.2,h:1.6});

  /* 4 一覽表 */
  s=pptx.addSlide(); bg(s); frame(s); corner(s); watermark(s); title(s,'場勘重點一覽表');
  addOverviewTable(s,pptx);

  /* 5.. 施工說明（照片） */
  S.cpages.forEach((p,i)=>{
    s=pptx.addSlide(); bg(s); frame(s); corner(s); watermark(s);
    const data=exportPhoto(i);
    // 左大圖（維持比例置入左 2/3）
    const img=p._imgEl; const boxW=8.4,boxH=6.7,bx=0.45,by=0.45;
    let iw=boxW,ih=boxH;
    if(img){const r=img.width/img.height; if(boxW/boxH>r){iw=boxH*r;}else{ih=boxW/r;}}
    s.addImage({data,x:bx,y:by,w:iw,h:ih});
    s.addShape('rect',{x:bx,y:by,w:iw,h:ih,line:{color:WHITE,width:1},fill:{type:'none'}});
    // 樓層標籤
    if(p.floor)s.addText(p.floor,{x:bx+0.15,y:by+0.15,w:1.1,h:0.5,fontFace:FONT,fontSize:18,bold:true,color:'26323C',fill:{color:WHITE},align:'center'});
    // 右側施工說明
    s.addText('施工說明',{x:9.2,y:1.5,w:3.6,h:0.6,fontFace:FONT,fontSize:24,bold:true,color:WHITE});
    s.addShape('line',{x:9.25,y:2.15,w:3.2,h:0,line:{color:WHITE,width:1}});
    const txtArr=[];
    if(p.powerSrc)txtArr.push({text:'現況問題：\n'+p.powerSrc+'\n\n',options:{}});
    if(p.breaker)txtArr.push({text:'處理方式：\n'+p.breaker+'\n\n',options:{}});
    if(p.routing)txtArr.push({text:p.routing+'\n',options:{}});
    if(p.note)txtArr.push({text:'\n'+p.note,options:{}});
    if(txtArr.length)s.addText(txtArr,{x:9.2,y:2.4,w:3.7,h:4.3,fontFace:FONT,fontSize:15,color:'CBD4DA',valign:'top',lineSpacingMultiple:1.2});
  });

  /* 注意事項 */
  s=pptx.addSlide(); bg(s); frame(s); corner(s); watermark(s); title(s,'施工說明及注意事項');
  const bul=S.notes.filter(n=>n.text.trim()).map(n=>({text:n.text,options:{bullet:{code:'2022'},color:n.red?'DD6650':'FFFFFF',fontSize:18,fontFace:FONT,paraSpaceAfter:12,bold:n.red}}));
  if(bul.length)s.addText(bul,{x:0.9,y:1.7,w:11.5,h:5,valign:'top'});

  /* 工項及材料 */
  s=pptx.addSlide(); bg(s); frame(s); corner(s); watermark(s);
  s.addText([{text:'工項及材料一覽 ',options:{color:WHITE}},{text:S.bom.kW,options:{color:GOLD}}],
    {x:0.55,y:0.42,w:9,h:0.9,fontFace:FONT,fontSize:30,bold:true});
  s.addShape('line',{x:0.6,y:1.3,w:3.2,h:0,line:{color:WHITE,width:1.5}});
  s.addText('工項',{x:1.2,y:1.7,w:5,h:0.5,fontFace:FONT,fontSize:18,bold:true,color:WHITE});
  s.addText('---------------------------------',{x:1.2,y:2.1,w:5,h:0.3,fontFace:FONT,fontSize:14,color:'8A9AA6'});
  s.addText(S.bom.work.filter(x=>x.trim()).map((v,k)=>({text:`${k+1}. ${v}`,options:{fontSize:16,color:'D9E0E6',fontFace:FONT,paraSpaceAfter:14,breakLine:true}})),
    {x:1.2,y:2.5,w:5,h:4.3,valign:'top',lineSpacingMultiple:1.2});
  s.addText('材料',{x:7.0,y:1.7,w:5,h:0.5,fontFace:FONT,fontSize:18,bold:true,color:WHITE});
  s.addText('---------------------------------',{x:7.0,y:2.1,w:5,h:0.3,fontFace:FONT,fontSize:14,color:'8A9AA6'});
  s.addText(S.bom.mat.filter(x=>x.trim()).map((v,k)=>({text:`${k+1}. ${v}`,options:{fontSize:16,color:k===0?GOLD:'D9E0E6',fontFace:FONT,paraSpaceAfter:14,breakLine:true}})),
    {x:7.0,y:2.5,w:5.4,h:4.3,valign:'top',lineSpacingMultiple:1.2});

  const fn=`${S.cover.city}${S.cover.district}-${S.cover.name}${S.cover.gender}-場勘規劃書.pptx`;
  await pptx.writeFile({fileName:fn});
  if(btn){btn.disabled=false;btn.textContent='⬇ 產生規劃書 PPT';}
  }catch(err){ alert('產生失敗：'+err.message); console.error(err);
    const b=event?.target; if(b){b.disabled=false;b.textContent='⬇ 產生規劃書 PPT';} }
}

function addOverviewTable(s,pptx){
  const cellH=0.42;
  const rows=[
    ['現場資訊','縣市區域',[S.cover.city,S.cover.district].filter(Boolean).join(''), '工程範圍','工程類型',S.power.type],
    ['','場勘地址',S.site.addr, '','工項',S.power.items],
    ['','社區／大樓名稱',S.site.community||'N/A', '','修繕類別',S.power.repairCat],
    ['','樓層／戶別',S.site.pos, '','施作範圍',S.power.area],
    ['','業主聯絡人',S.site.contact, '','預計工期',S.power.days?S.power.days+' 天':''],
    ['','聯絡電話',S.site.phone, '','期望開工日',S.power.start],
    ['屋況資訊','屋齡',S.device.age, '清運與保護','廢棄物清運',S.install.waste],
    ['','坪數',S.device.ping?S.device.ping+' 坪':'', '','垃圾清運',S.install.wasteQty?S.install.wasteQty+' 車':''],
    ['','格局',S.device.layout||'N/A', '','人工搬運補貼',S.install.laborQty?S.install.laborQty+' 工':''],
    ['','所在樓層',[S.device.floor,S.device.totalFloor].filter(Boolean).join(' / '), '','保護工程範圍',S.install.protect],
    ['','現況',S.device.cond, '','',''],
    ['','電梯',S.device.elevator, '','','']
  ];
  const baseB={color:'6B7F91',pt:1};
  const tRows=rows.map(r=>r.map((c,ci)=>{
    const isCat=(ci===0||ci===3);
    return {text:c||'', options:{
      fontFace:FONT, fontSize:isCat?13:12, bold:isCat, color:isCat?GOLD:WHITE,
      align:isCat?'center':'left', valign:'middle',
      fill:{color: isCat?'2B3A45':(ci===1||ci===4?'52697C':'3F5262')},
      border:baseB, margin:isCat?2:4 }};
  }));
  s.addTable(tRows,{x:0.45,y:1.6,w:12.4,colW:[1.0,1.5,2.7,1.0,1.65,2.55],rowH:cellH,valign:'middle'});
}

/* ============================================================
   自動存檔 + 多筆草稿（localStorage）
   ============================================================ */
const DRAFTS_KEY='sp_drafts_v1';
let curId=null;

function genId(){ return 'd'+Date.now()+Math.random().toString(36).slice(2,7); }
function loadDrafts(){ try{ return JSON.parse(localStorage.getItem(DRAFTS_KEY)||'[]'); }catch(e){ return []; } }
function saveDrafts(arr){ localStorage.setItem(DRAFTS_KEY, JSON.stringify(arr)); }
// 快照：排除 _imgEl（Image 物件，載入時會由 img 重建）
function snapshot(){ return JSON.parse(JSON.stringify(S,(k,v)=>k==='_imgEl'?undefined:v)); }
function draftName(){
  const c=S.cover;
  const loc=[c.city,c.district].filter(Boolean).join('');
  const who=c.name?(c.name+(c.gender||'')):'';
  return ((loc+' '+who).trim())||'未命名草稿';
}
function fmtTime(ts){ const d=new Date(ts),p=n=>String(n).padStart(2,'0');
  return `${d.getMonth()+1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; }

let _saveT=null;
function scheduleSave(){ clearTimeout(_saveT); _saveT=setTimeout(saveNow,600); }
function saveNow(){
  if(!curId)return;
  const drafts=loadDrafts();
  const rec={ id:curId, name:draftName(), step:STEP, updatedAt:Date.now(), data:snapshot() };
  const i=drafts.findIndex(d=>d.id===curId);
  if(i>=0)drafts[i]=rec; else drafts.push(rec);
  try{ saveDrafts(drafts); setBadge('已自動儲存 '+fmtTime(rec.updatedAt)); }
  catch(e){ setBadge('⚠ 儲存空間已滿（照片過多）',true); }
}
function setBadge(t,warn){ const b=document.getElementById('savebadge'); if(b){b.textContent=t; b.style.color=warn?'#F2CF00':'#CBD4DA';} }

function newDraft(){ S=defaultState(); STEP=0; curId=genId(); window._booted=true; saveNow(); render(); }
function loadDraft(id){
  const d=loadDrafts().find(x=>x.id===id); if(!d)return newDraft();
  S=d.data; STEP=d.step||0; curId=id; window._booted=true; render();
}
function delDraft(id){ saveDrafts(loadDrafts().filter(d=>d.id!==id)); }

/* 草稿挑選畫面（本機） */
function showDraftPicker(){
  let h=`<div id="draftmask" style="position:fixed;inset:0;background:rgba(38,50,60,.55);z-index:200;display:flex;align-items:center;justify-content:center;padding:16px">
    <div style="background:#fff;border-radius:16px;max-width:620px;width:100%;max-height:86vh;overflow:auto;padding:22px">
      <h2 style="margin:0 0 14px;color:#3F5262;font-size:20px">📋 選擇規劃書草稿</h2>
      <div id="localpane">${localPaneHTML()}</div>
    </div></div>`;
  const old=document.getElementById('draftmask'); if(old)old.remove();
  document.body.appendChild(el(h));
}
function localPaneHTML(){
  const drafts=loadDrafts().sort((a,b)=>b.updatedAt-a.updatedAt);
  let h=`<p style="color:#7a879e;font-size:13px;margin:0 0 14px;line-height:1.5">填寫內容會自動儲存在這台裝置。可繼續未完成的，或新建一份新場勘。</p>
    <button onclick="pickNew()" style="width:100%;background:#F2CF00;color:#3F5262;border:0;font-weight:800;padding:14px;border-radius:11px;font-size:16px;cursor:pointer;margin-bottom:16px;min-height:52px">＋ 新建規劃書（新場勘）</button><div>`;
  if(!drafts.length) h+=`<div style="color:#9aa6bc;text-align:center;padding:16px">目前沒有草稿</div>`;
  drafts.forEach(d=>{
    h+=`<div style="display:flex;gap:8px;align-items:center;border:1px solid #e6eaf2;border-radius:11px;padding:12px;margin-bottom:8px">
      <div style="flex:1;min-width:0;cursor:pointer" onclick="pickDraft('${d.id}')">
        <div style="font-weight:700;color:#26323C;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(d.name)}</div>
        <div style="color:#94a0b6;font-size:12px;margin-top:2px">最後編輯 ${fmtTime(d.updatedAt)}</div>
      </div>
      <button onclick="pickDraft('${d.id}')" style="background:#3F5262;color:#fff;border:0;border-radius:9px;padding:11px 15px;font-weight:600;cursor:pointer;min-height:46px">繼續</button>
      <button onclick="delDraftUI('${d.id}')" style="background:#fff;color:#DD6650;border:1px solid #DD6650;border-radius:9px;padding:11px 12px;cursor:pointer;min-height:46px">刪除</button>
    </div>`;
  });
  return h+'</div>';
}
function closePicker(){ const m=document.getElementById('draftmask'); if(m)m.remove(); }
function pickNew(){ closePicker(); newDraft(); }
function pickDraft(id){ closePicker(); loadDraft(id); }
function delDraftUI(id){ if(confirm('確定刪除這份草稿？刪除後無法復原。')){ delDraft(id); showDraftPicker(); } }

/* 頂部狀態列：自動儲存提示 + 草稿按鈕 */
function mountHeaderUI(){
  const genBtn=document.querySelector('header button');
  const badge=el(`<span id="savebadge" style="color:#cdd7ea;font-size:13px;margin-right:12px;white-space:nowrap"></span>`);
  const draftBtn=el(`<button id="draftbtn" onclick="showDraftPicker()" style="background:#556A7C;color:#fff;margin-right:8px">📋 草稿</button>`);
  genBtn.parentNode.insertBefore(badge, genBtn);
  genBtn.parentNode.insertBefore(draftBtn, genBtn);
}

/* ---------- 啟動 ---------- */
function boot(){
  mountHeaderUI();
  document.addEventListener('input', ()=>{ if(window._booted)scheduleSave(); });
  document.addEventListener('change', ()=>{ if(window._booted)scheduleSave(); });
  setInterval(()=>{ if(window._booted)scheduleSave(); }, 10000); // 保險：含圖面標註
  const drafts=loadDrafts();
  if(drafts.length){ showDraftPicker(); }   // 有草稿 → 先讓使用者挑
  else { newDraft(); }                       // 全新 → 直接開一張
}
boot();
