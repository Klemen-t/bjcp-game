// ═══════════════════════════════════════════════════════════════
//  UI.JS  —  Interface & interaction logic
// ═══════════════════════════════════════════════════════════════
const APP_VERSION = 'v2026.16 · 15/03/2026';

// Add popup slide-up animation
const _popupStyle = document.createElement('style');
_popupStyle.textContent = '@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:none;opacity:1}}';
document.head && document.head.appendChild(_popupStyle);

// ── Local state ────────────────────────────────────────────────
let cardFilter    = 'all';
let cardSearch    = '';
let cardStates    = {};   // local mirror of Firebase cardStates
let selectedBeer  = null;
let gameState     = null;
let lastRoundReset   = 0;
let lastRevealedId   = null;
let teamViewInited   = false;
let masterViewInited = false;
let unreadMsgs       = 0;
let activeCardIds    = null;  // null = all; array = restricted pool


// ═══════════════════════════════════════════════════════════════
//  EXPLORER — filtres sensorials + vistes llista/mapa
// ═══════════════════════════════════════════════════════════════

// ── Card metadata cache ────────────────────────────────────────
let _cardMeta = null;
function getCardMeta() {
  if (_cardMeta) return _cardMeta;
  _cardMeta = {};
  BJCP_CARDS.forEach(c => {
    const tags = (c.tags||'').split(',').map(t=>t.trim());
    const mf   = (c.mouthfeel||'').toLowerCase();
    const fl   = (c.flavor||'').toLowerCase();
    const ar   = (c.aroma||'').toLowerCase();
    const all  = [mf, fl, ar, (c.overallImpression||'').toLowerCase(), (c.tags||'').toLowerCase()].join(' ');

    // Fermentation type
    let ferm = 'hybrid';
    if (tags.includes('top-fermented') && !tags.includes('bottom-fermented') && !tags.includes('lagered')) ferm='ale';
    else if (tags.includes('bottom-fermented') || (tags.includes('lagered') && !tags.includes('top-fermented'))) ferm='lager';
    else if (tags.includes('wild-fermented')||tags.includes('wild-fermentation')) ferm='wild';
    else if (tags.includes('top-fermented') && tags.includes('lagered')) ferm='hybrid';

    // Body from mouthfeel
    let body = 'medium';
    if (/cos lleuger|cos molt lleuger|cos baix|light[- ]bod|thin/.test(mf)) body='light';
    else if (/cos (mitjà[- ])?ple|cos (mig )?ple|cos (sencer|complet)|full[- ]bod|heavy/.test(mf)) body='full';

    // Dry finish: "final sec", "sequedat", "sec i refrescant", "crisp and dry"
    const dry = /final sec|sequedat|sec i |cruixent i sec|sec\.|\bdry\b|\bcrisp\b/.test(mf+' '+fl);

    // Sweet/residual: clear residual sweetness in flavor/mouthfeel
    const sweet = /dolçor res|dolçor final|dolçor de malt|residual sweet|residual dolç|final dolç|sweet finish|sweet malt|malt sweet|sweet resid|\bsweet\b/.test(fl+' '+mf)
                  || tags.includes('sweet');

    // Fruity: esters, fruit notes
    const fruity = /afruitat|fruites|fruita|fruit|èsters|ester[a-z]|estèric|notes de fruita|afruïts/.test(all);

    // Spice/herbal
    const spice = /espèci|especiat|spice|spicy|herbal|herbes|pepper|pebr|fenòlic|fenolic/.test(all)
                  || tags.includes('spice');

    // Smoke
    const smoke = tags.includes('smoke') || /fumat|\bfum\b|smoke|smoked/.test(all);

    // High carbonation
    const hicarb = /molt alta carbonac|alta carbonac.*molt|molt carbonat|efervesc|highly carb|very carb|very highly/.test(mf);

    _cardMeta[c.id] = {
      ferm, body, dry, sweet, fruity, spice, smoke, hicarb,
      malty:  tags.includes('malty'),
      hoppy:  tags.includes('hoppy'),
      roasty: tags.includes('roasty'),
      sour:   tags.includes('sour') || tags.includes('wild-fermented') || tags.includes('wild-fermentation'),
    };
  });
  return _cardMeta;
}

// ── Filter state ───────────────────────────────────────────────
const EF = {
  srmMin:1, srmMax:40,
  abvMin:0, abvMax:15,
  ibuMin:0, ibuMax:100,
  ferm: new Set(),
  body: new Set(),
  chars: new Set(),
  active: false,
};

// ── Score: returns 0-100 (%), or -1 if no filters active ───────
function explorerScoreCard(c) {
  if (!EF.active) return -1;
  let score=0, total=0;
  const meta = getCardMeta()[c.id] || {};

  if (EF.srmMin>1 || EF.srmMax<40) {
    total += 2;
    const cMin=c.srmMin||1, cMax=c.srmMax||40;
    const ov=Math.max(0, Math.min(EF.srmMax,cMax) - Math.max(EF.srmMin,cMin));
    score += 2 * Math.min(1, (ov / Math.max(1, EF.srmMax-EF.srmMin)) * 1.5);
  }
  if (EF.abvMin>0 || EF.abvMax<15) {
    total += 2;
    const cMin=c.abvMin||0, cMax=c.abvMax||15;
    const ov=Math.max(0, Math.min(EF.abvMax,cMax) - Math.max(EF.abvMin,cMin));
    score += 2 * Math.min(1, (ov / Math.max(0.5, EF.abvMax-EF.abvMin)) * 1.5);
  }
  if (EF.ibuMin>0 || EF.ibuMax<100) {
    total += 2;
    if (c.ibuMin == null) { score += 0.5; }
    else {
      const ov=Math.max(0, Math.min(EF.ibuMax,c.ibuMax) - Math.max(EF.ibuMin,c.ibuMin));
      score += 2 * Math.min(1, (ov / Math.max(1, EF.ibuMax-EF.ibuMin)) * 1.5);
    }
  }
  if (EF.ferm.size > 0) {
    total += 2;
    if (EF.ferm.has(meta.ferm)) score += 2;
  }
  if (EF.body.size > 0) {
    total += 1.5;
    if (EF.body.has(meta.body)) score += 1.5;
  }
  EF.chars.forEach(ch => {
    total += 1;
    if (meta[ch]) score += 1;
  });
  // Note: dry/sweet/fruity/spice/smoke/hicarb are all in meta[ch] via the new getCardMeta()

  if (total === 0) return -1;
  return Math.round((score / total) * 100);
}

// ── Color coding: continuous gradient verd→taronja→vermell ─────
function matchClass(pct, isDiscarded) {
  if (isDiscarded) return { card:'mc-grey', badge:'mpb-grey', color:'#555' };
  if (pct < 0)     return { card:'', badge:'', color:'rgba(255,255,255,.22)' }; // no filter

  // Interpolate: 0%=dark red → 40%=orange-red → 70%=yellow-green → 100%=bright green
  let r, g, b;
  if (pct >= 70) {
    // 70–100: yellow-green (#8BC34A) → bright green (#2E8040)
    const t = (pct - 70) / 30;
    r = Math.round(139 - (139-46)  * t);
    g = Math.round(195 - (195-128) * t);
    b = Math.round(74  - (74-64)   * t);
  } else if (pct >= 40) {
    // 40–70: orange (#D4700A) → yellow-green (#8BC34A)
    const t = (pct - 40) / 30;
    r = Math.round(212 - (212-139) * t);
    g = Math.round(112 + (195-112) * t);
    b = Math.round(10  + (74-10)   * t);
  } else {
    // 0–40: dark red (#5A0A12) → orange (#D4700A)
    const t = pct / 40;
    r = Math.round(90  + (212-90)  * t);
    g = Math.round(10  + (112-10)  * t);
    b = Math.round(18  + (10-18)   * t);
  }
  const color = `rgb(${r},${g},${b})`;

  // CSS class buckets (for background tints)
  let card, badge;
  if (pct >= 70) { card='mc-green';  badge='mpb-green'; }
  else if (pct >= 40) { card='mc-yellow'; badge='mpb-yellow'; }
  else { card='mc-red'; badge='mpb-red'; }
  return { card, badge, color };
}

// ── SRM color helper ───────────────────────────────────────────
function srmToColor(srm) {
  const map=[[2,'#F8F753'],[3,'#F6F513'],[4,'#ECE61A'],[5,'#D5BC26'],[6,'#BEA337'],
    [7,'#A88C3E'],[8,'#977A3F'],[9,'#856B3D'],[10,'#745D3B'],[11,'#644F36'],
    [12,'#554330'],[13,'#46382A'],[14,'#392D23'],[15,'#2D231C'],[16,'#231A14'],
    [17,'#1A110D'],[18,'#140D09'],[19,'#0F0A06'],[20,'#0C0705'],[25,'#080503'],
    [30,'#060302'],[40,'#040101']];
  if (!srm) return '#444';
  for (let i=1;i<map.length;i++) if(srm<=map[i][0]) return map[i][1];
  return map[map.length-1][1];
}

// ── Build SRM bar ──────────────────────────────────────────────
function buildSrmBar() {
  const bar = el('sf-srm-bar'); if (!bar || bar.dataset.built) return;
  bar.dataset.built = '1';
  for (let i=1;i<=40;i++) {
    const d=document.createElement('div');
    d.className='sf-srm-cell'; d.style.background=srmToColor(i); d.dataset.srm=i;
    bar.appendChild(d);
  }
  updateSrmOverlay();
}

function updateSrmOverlay() {
  const bar = el('sf-srm-bar'); if (!bar) return;
  let ov = bar.querySelector('.sf-srm-overlay');
  if (!ov) { ov=document.createElement('div'); ov.className='sf-srm-overlay'; bar.appendChild(ov); }
  if (EF.srmMin>1 || EF.srmMax<40) {
    const pL = ((EF.srmMin-1)/39*100).toFixed(1);
    const pW = ((EF.srmMax-EF.srmMin)/39*100).toFixed(1);
    ov.style.left=pL+'%'; ov.style.width=pW+'%'; ov.style.display='block';
  } else {
    ov.style.display='none';
  }
}

// ── Update filters ─────────────────────────────────────────────
function explorerUpdateFilters() {
  EF.active = EF.srmMin>1 || EF.srmMax<40 || EF.abvMin>0 || EF.abvMax<15 ||
              EF.ibuMin>0 || EF.ibuMax<100 || EF.ferm.size>0 ||
              EF.body.size>0 || EF.chars.size>0;
  updateSrmOverlay();
  // Active count badge
  let count = 0;
  if (EF.srmMin>1||EF.srmMax<40) count++;
  if (EF.abvMin>0||EF.abvMax<15) count++;
  if (EF.ibuMin>0||EF.ibuMax<100) count++;
  EF.ferm.forEach(()=>count++); EF.body.forEach(()=>count++); EF.chars.forEach(()=>count++);
  const ct = el('sf-active-count');
  if (ct) {
    ct.style.display = count>0 ? 'inline' : 'none';
    ct.textContent = count + (count===1?' filtre actiu':' filtres actius');
  }
  renderCurrentCardView();
}

function explorerResetFilters() {
  EF.srmMin=1; EF.srmMax=40; EF.abvMin=0; EF.abvMax=15;
  EF.ibuMin=0; EF.ibuMax=100;
  EF.ferm.clear(); EF.body.clear(); EF.chars.clear(); EF.active=false;
  document.querySelectorAll('.sf-pill').forEach(p=>p.classList.remove('on'));
  updateSrmOverlay();
  const ct=el('sf-active-count'); if(ct) ct.style.display='none';
  renderCurrentCardView();
}

// ── Init pills (called once) ───────────────────────────────────
function initExplorerPills() {
  buildSrmBar();

  document.querySelectorAll('.sf-pill[data-esrm]').forEach(p => {
    p.addEventListener('click', () => {
      const [mn,mx] = p.dataset.esrm.split(',').map(Number);
      EF.srmMin=mn; EF.srmMax=mx;
      document.querySelectorAll('.sf-pill[data-esrm]').forEach(x=>x.classList.remove('on'));
      p.classList.add('on'); explorerUpdateFilters();
    });
  });
  document.querySelectorAll('.sf-pill[data-eferm]').forEach(p => {
    p.addEventListener('click', () => {
      const v=p.dataset.eferm;
      if(EF.ferm.has(v)){EF.ferm.delete(v);p.classList.remove('on');}
      else{EF.ferm.add(v);p.classList.add('on');}
      explorerUpdateFilters();
    });
  });
  document.querySelectorAll('.sf-pill[data-ebody]').forEach(p => {
    p.addEventListener('click', () => {
      const v=p.dataset.ebody;
      if(EF.body.has(v)){EF.body.delete(v);p.classList.remove('on');}
      else{EF.body.add(v);p.classList.add('on');}
      explorerUpdateFilters();
    });
  });
  document.querySelectorAll('.sf-pill[data-echar]').forEach(p => {
    p.addEventListener('click', () => {
      const v=p.dataset.echar;
      if(EF.chars.has(v)){EF.chars.delete(v);p.classList.remove('on');}
      else{EF.chars.add(v);p.classList.add('on');}
      explorerUpdateFilters();
    });
  });
  document.querySelectorAll('.sf-pill[data-eabv]').forEach(p => {
    p.addEventListener('click', () => {
      const [mn,mx] = p.dataset.eabv.split(',').map(Number);
      EF.abvMin=mn; EF.abvMax=mx;
      document.querySelectorAll('.sf-pill[data-eabv]').forEach(x=>x.classList.remove('on'));
      p.classList.add('on'); explorerUpdateFilters();
    });
  });
  document.querySelectorAll('.sf-pill[data-eibu]').forEach(p => {
    p.addEventListener('click', () => {
      const [mn,mx] = p.dataset.eibu.split(',').map(Number);
      EF.ibuMin=mn; EF.ibuMax=mx;
      document.querySelectorAll('.sf-pill[data-eibu]').forEach(x=>x.classList.remove('on'));
      p.classList.add('on'); explorerUpdateFilters();
    });
  });
}

// ── View state ─────────────────────────────────────────────────
let currentCardView = 'list';
function setCardView(v) {
  currentCardView = v;
  const lp = el('cards-view-list'), mp = el('cards-view-map');
  if (lp) lp.style.display = v==='list' ? 'block' : 'none';
  if (mp) mp.style.display = v==='map'  ? 'block' : 'none';
  el('vstab-list')?.classList.toggle('active', v==='list');
  el('vstab-map')?.classList.toggle('active',  v==='map');
  renderCurrentCardView();
}

function renderCurrentCardView() {
  if (currentCardView === 'list') renderBeerCards();
  else renderMapView();
}

// ── MAP VIEW ──────────────────────────────────────────────────
let _mapHits = [];
// Map viewport (for pinch zoom + pan)
const _mapVP = { ibuMin:0, ibuMax:100, abvMin:2, abvMax:12 };

function renderMapView() {
  const canvas = el('map-cv'); if (!canvas) return;
  const W = canvas.parentElement.clientWidth || 320;
  const H = 360;
  canvas.width  = W * devicePixelRatio;
  canvas.height = H * devicePixelRatio;
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);

  const MAP_IBU_MIN = _mapVP.ibuMin, MAP_IBU_MAX = _mapVP.ibuMax;
  const MAP_ABV_MIN = _mapVP.abvMin, MAP_ABV_MAX = _mapVP.abvMax;
  const PAD = { l:36, r:10, t:14, b:28 };
  const CW = W-PAD.l-PAD.r, CH = H-PAD.t-PAD.b;

  function ibuToX(ibu) { return PAD.l + (Math.min(Math.max(ibu,MAP_IBU_MIN),MAP_IBU_MAX)-MAP_IBU_MIN)/(MAP_IBU_MAX-MAP_IBU_MIN)*CW; }
  function abvToY(abv) { return PAD.t + CH - (Math.min(Math.max(abv,MAP_ABV_MIN),MAP_ABV_MAX)-MAP_ABV_MIN)/(MAP_ABV_MAX-MAP_ABV_MIN)*CH; }

  ctx.fillStyle='#0f0f0f'; ctx.fillRect(0,0,W,H);

  // Grid
  ctx.strokeStyle='rgba(255,255,255,.05)'; ctx.lineWidth=1;
  for (const ibu of [0,10,20,30,40,50,60,70,80,90,100]) {
    const x=ibuToX(ibu);
    ctx.beginPath(); ctx.moveTo(x,PAD.t); ctx.lineTo(x,PAD.t+CH); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.22)'; ctx.font='bold 7px Barlow Condensed,sans-serif';
    ctx.textAlign='center'; ctx.fillText(ibu, x, PAD.t+CH+11);
  }
  for (const abv of [2,3,4,5,6,7,8,9,10,11,12]) {
    const y=abvToY(abv);
    ctx.beginPath(); ctx.moveTo(PAD.l,y); ctx.lineTo(PAD.l+CW,y); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.22)'; ctx.font='bold 7px Barlow Condensed,sans-serif';
    ctx.textAlign='right'; ctx.fillText(abv+'%', PAD.l-3, y+3);
  }
  ctx.fillStyle='rgba(200,200,200,.25)'; ctx.font='bold 9px Barlow Condensed,sans-serif';
  ctx.textAlign='center'; ctx.fillText('IBU', PAD.l+CW/2, H-3);

  // Filter zone highlight
  if (EF.active && (EF.ibuMin>MAP_IBU_MIN||EF.ibuMax<MAP_IBU_MAX||EF.abvMin>MAP_ABV_MIN||EF.abvMax<MAP_ABV_MAX)) {
    const x1=ibuToX(EF.ibuMin), x2=ibuToX(EF.ibuMax);
    const y1=abvToY(EF.abvMax), y2=abvToY(EF.abvMin);
    ctx.fillStyle='rgba(255,255,255,.04)'; ctx.fillRect(x1,y1,x2-x1,y2-y1);
    ctx.strokeStyle='rgba(255,255,255,.15)'; ctx.lineWidth=1; ctx.strokeRect(x1,y1,x2-x1,y2-y1);
  }

  // Get visible cards (respects filter + state filter)
  let cards = getVisibleCards();
  if (cardFilter==='possible') {
    const tp=new Set(Object.values(gameState?.teams?.[game.teamId]?.players||{})
      .flatMap(p=>Object.entries(p.cardStates||{}).filter(([,st])=>st==='possible').map(([id])=>id)));
    cards=cards.filter(c=>tp.has(c.id));
  } else if (cardFilter==='discarded') {
    const td=new Set(Object.values(gameState?.teams?.[game.teamId]?.players||{})
      .flatMap(p=>Object.entries(p.cardStates||{}).filter(([,st])=>st==='discarded').map(([id])=>id)));
    cards=cards.filter(c=>td.has(c.id));
  }
  if (cardSearch) {
    const q=cardSearch.toLowerCase();
    cards=cards.filter(c=>c.name.toLowerCase().includes(q)||c.category.toLowerCase().includes(q));
  }

  _mapHits = [];
  const meta = getCardMeta();
  // Sort: high match on top (drawn last = visible)
  const scored = cards.map(c=>({c, pct:explorerScoreCard(c)}));
  scored.sort((a,b) => a.pct - b.pct); // draw worst first, best on top

  scored.forEach(({c, pct}) => {
    const myState = cardStates[c.id] || 'normal';
    const isDisc  = myState === 'discarded';
    const isPoss  = myState === 'possible';
    const mc = matchClass(pct, isDisc);

    const ibu = c.ibuMin!=null ? (c.ibuMin+c.ibuMax)/2 : 35;
    const abv = c.abvMin!=null ? (c.abvMin+c.abvMax)/2 : 5;
    const m   = meta[c.id]||{};
    const r   = m.body==='full'?8 : m.body==='light'?4 : 6;

    const x = ibuToX(ibu);
    const y = abvToY(abv);

    // Fill
    const alpha = isDisc ? .3 : (!EF.active ? .7 : (pct<0?.6:Math.max(.3, pct/100)));
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fillStyle = mc.color;
    ctx.globalAlpha = alpha;
    ctx.fill();

    // Possible ring
    if (isPoss) {
      ctx.beginPath(); ctx.arc(x,y,r+2.5,0,Math.PI*2);
      ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.globalAlpha=.8; ctx.stroke();
    }
    ctx.globalAlpha=1;

    // Label for high-match
    if (!isDisc && EF.active && pct>=70 && r>=5) {
      ctx.fillStyle='rgba(255,255,255,.7)';
      ctx.font='bold 7px Barlow Condensed,sans-serif';
      ctx.textAlign='center';
      ctx.fillText(c.number, x, y-r-2);
    }

    _mapHits.push({c, pct, x, y, r: r+6, state: myState});
  });
}

// Map events (set up once)
(function(){
  function setupMapEvents() {
    const canvas = el('map-cv');
    if (!canvas || canvas._eventsSet) return;
    canvas._eventsSet = true;
    const tt = el('map-tooltip');

    function showTip(cx, cy) {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / devicePixelRatio / rect.width;
      const scaleY = canvas.height / devicePixelRatio / rect.height;
      const mx = (cx-rect.left)*scaleX, my = (cy-rect.top)*scaleY;
      let found = null;
      for (const h of _mapHits) { if(Math.hypot(mx-h.x,my-h.y)<=h.r){found=h;break;} }
      if (found && tt) {
        el('mtt-name').textContent = found.c.number+' — '+found.c.name;
        el('mtt-cat').textContent  = found.c.category;
        const pctEl = el('mtt-pct');
        if (pctEl) {
          if (found.pct < 0) { pctEl.textContent=''; }
          else {
            const mc = matchClass(found.pct, found.state==='discarded');
            pctEl.textContent = found.pct+'%';
            pctEl.style.color = mc.color;
          }
        }
        let tx = cx-rect.left+12, ty = cy-rect.top-70;
        if (tx+200>rect.width)  tx = cx-rect.left-205;
        if (ty < 0)             ty = 8;
        tt.style.left=tx+'px'; tt.style.top=ty+'px';
        tt.classList.add('show');
      } else if (tt) { tt.classList.remove('show'); }
    }
    let _tipTimer;
    canvas.addEventListener('mousemove', e=>showTip(e.clientX,e.clientY));
    canvas.addEventListener('mouseleave', ()=>tt?.classList.remove('show'));
    canvas.addEventListener('touchstart', e=>{
      e.preventDefault();
      const t=e.touches[0]; showTip(t.clientX,t.clientY);
      clearTimeout(_tipTimer); _tipTimer=setTimeout(()=>tt?.classList.remove('show'),2000);
    },{passive:false});
    canvas.addEventListener('click', e=>{
      const rect=canvas.getBoundingClientRect();
      const scaleX=canvas.width/devicePixelRatio/rect.width;
      const scaleY=canvas.height/devicePixelRatio/rect.height;
      const mx=(e.clientX-rect.left)*scaleX, my=(e.clientY-rect.top)*scaleY;
      for (const h of _mapHits) {
        if (Math.hypot(mx-h.x,my-h.y)<=h.r) {
          showQuickCardModal(h.c); break;
        }
      }
    });

    // ── Pinch-zoom + pan ─────────────────────────────────────────
    let _pinch0 = null, _pan0 = null;

    // Convert canvas CSS-pixel position → data (ibu, abv)
    function pxToData(px, py) {
      const PADm = {l:36, r:10, t:14, b:28};
      const cvW  = canvas.offsetWidth  - PADm.l - PADm.r;
      const cvH  = canvas.offsetHeight - PADm.t - PADm.b;
      const ibu  = _mapVP.ibuMin + Math.max(0, Math.min(1, (px - PADm.l) / cvW))
                   * (_mapVP.ibuMax - _mapVP.ibuMin);
      const abv  = _mapVP.abvMin + Math.max(0, Math.min(1, 1 - (py - PADm.t) / cvH))
                   * (_mapVP.abvMax - _mapVP.abvMin);
      return {ibu, abv};
    }

    function applyZoom(centerIbu, centerAbv, factor) {
      // factor > 1 = zoom in (smaller range), factor < 1 = zoom out
      const curIbuR = _mapVP.ibuMax - _mapVP.ibuMin;
      const curAbvR = _mapVP.abvMax - _mapVP.abvMin;
      const newIbuR = Math.min(105, Math.max(12, curIbuR / factor));
      const newAbvR = Math.min(11,  Math.max(1.2, curAbvR / factor));
      // Keep the center data point fixed on screen
      const ibuFrac = curIbuR > 0 ? (centerIbu - _mapVP.ibuMin) / curIbuR : 0.5;
      const abvFrac = curAbvR > 0 ? (centerAbv - _mapVP.abvMin) / curAbvR : 0.5;
      _mapVP.ibuMin = Math.max(-2,  centerIbu - ibuFrac * newIbuR);
      _mapVP.ibuMax = Math.min(102, _mapVP.ibuMin + newIbuR);
      _mapVP.abvMin = Math.max(0,   centerAbv - abvFrac * newAbvR);
      _mapVP.abvMax = Math.min(15,  _mapVP.abvMin + newAbvR);
      renderMapView();
    }

    // ── Touch: pinch-to-zoom + 1-finger pan ───────────────────
    let _pinch0 = null, _pan0 = null;

    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      if (e.touches.length === 2) {
        const t1=e.touches[0], t2=e.touches[1];
        const rect=canvas.getBoundingClientRect();
        const midX = (t1.clientX+t2.clientX)/2 - rect.left;
        const midY = (t1.clientY+t2.clientY)/2 - rect.top;
        _pinch0 = {
          dist: Math.hypot(t2.clientX-t1.clientX, t2.clientY-t1.clientY),
          center: pxToData(midX, midY),
          vp: { ..._mapVP },
        };
        _pan0 = null;
      } else if (e.touches.length === 1) {
        const rect=canvas.getBoundingClientRect();
        _pan0 = {
          start: pxToData(e.touches[0].clientX-rect.left, e.touches[0].clientY-rect.top),
          vp: { ..._mapVP },
        };
        _pinch0 = null;
      }
    }, {passive:false});

    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const rect=canvas.getBoundingClientRect();

      if (e.touches.length === 2 && _pinch0) {
        const t1=e.touches[0], t2=e.touches[1];
        const dist = Math.hypot(t2.clientX-t1.clientX, t2.clientY-t1.clientY);
        if (_pinch0.dist < 1) return;
        // Restore snapshot, then apply new zoom from it
        Object.assign(_mapVP, _pinch0.vp);
        applyZoom(_pinch0.center.ibu, _pinch0.center.abv, dist / _pinch0.dist);

      } else if (e.touches.length === 1 && _pan0) {
        const cur = pxToData(e.touches[0].clientX-rect.left, e.touches[0].clientY-rect.top);
        const dibu = _pan0.start.ibu - cur.ibu;
        const dabv = _pan0.start.abv - cur.abv;
        const ibuR = _pan0.vp.ibuMax - _pan0.vp.ibuMin;
        const abvR = _pan0.vp.abvMax - _pan0.vp.abvMin;
        _mapVP.ibuMin = Math.max(-2,  Math.min(102-ibuR, _pan0.vp.ibuMin + dibu));
        _mapVP.ibuMax = _mapVP.ibuMin + ibuR;
        _mapVP.abvMin = Math.max(0,   Math.min(15-abvR,  _pan0.vp.abvMin + dabv));
        _mapVP.abvMax = _mapVP.abvMin + abvR;
        renderMapView();
      }
    }, {passive:false});

    canvas.addEventListener('touchend', e => {
      if (e.touches.length < 2) _pinch0 = null;
      if (e.touches.length < 1) _pan0 = null;
    });

    // Double-tap: reset zoom
    let _lastTap = 0;
    canvas.addEventListener('touchend', e => {
      if (e.changedTouches.length !== 1) return;
      const now = Date.now();
      if (now - _lastTap < 350) {
        _mapVP.ibuMin=0; _mapVP.ibuMax=100; _mapVP.abvMin=2; _mapVP.abvMax=12;
        renderMapView();
      }
      _lastTap = now;
    });

    // Mouse wheel zoom (desktop/tablet amb ratolí)
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const rect=canvas.getBoundingClientRect();
      const d = pxToData(e.clientX-rect.left, e.clientY-rect.top);
      applyZoom(d.ibu, d.abv, e.deltaY < 0 ? 1.25 : 0.8);
    }, {passive:false});
  }
  function retry(){ const cv=el('map-cv'); if(cv) setupMapEvents(); else setTimeout(retry,500); }
  setTimeout(retry,300);
})();

// Quick card modal (shared by map tap + grid cell tap)
function showQuickCardModal(c) {
  const st = cardStates[c.id]||'normal';
  const pct = explorerScoreCard(c);
  const mc  = matchClass(pct, st==='discarded');
  const gI  = gameState?.currentBeer?.revealedInfo||{};
  const tI  = gameState?.currentBeer?.teamInfo?.[game.teamId]||{};
  const pctTxt = pct>=0
    ? `<span style="font-family:var(--fd);font-size:1.2rem;color:${mc.color}">${pct}%</span> <span style="font-family:var(--fu);font-size:.7rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--m)">coincidència</span><br><br>`
    : '';
  showModal(c.number+' — '+c.name, `
    <div style="font-family:var(--fu);font-size:.68rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--r);margin-bottom:10px">${c.category}</div>
    <div style="margin-bottom:10px">${pctTxt}</div>
    <div style="font-size:.8rem;color:var(--m);line-height:1.65;margin-bottom:12px">${c.overallImpression||''}</div>
    ${cardStatsHTML(c,gI,tI)}
    ${c.commercialExamples?`<div style="font-family:var(--fu);font-size:.7rem;color:var(--rl);margin-top:8px;padding-top:8px;border-top:1px solid var(--k4)">🏪 ${c.commercialExamples}</div>`:''}
    <div style="display:flex;gap:8px;margin-top:14px">
      <button class="btn btn-sm" style="flex:1;background:${st==='possible'?'rgba(196,18,48,.2)':'rgba(255,255,255,.05)'};border:1px solid ${st==='possible'?'var(--r)':'var(--k4)'};color:${st==='possible'?'var(--rl)':'var(--t)'}"
        onclick="closeModal();setCardState('${c.id}','possible')">⭐ Possible</button>
      <button class="btn btn-sm" style="flex:1;background:${st==='discarded'?'rgba(122,28,28,.2)':'rgba(255,255,255,.05)'};border:1px solid ${st==='discarded'?'var(--rd)':'var(--k4)'};color:${st==='discarded'?'#d44':'var(--t)'}"
        onclick="closeModal();setCardState('${c.id}','discarded')">✕ Descartar</button>
      ${st==='possible'?`<button class="btn btn-success btn-sm" style="flex:1" onclick="closeModal();proposeCard('${c.id}','${c.name.replace(/'/g,"\\'")}')">🎯 Proposar</button>`:''}
    </div>`);
}

// ═══ UTILS ══════════════════════════════════════════════════════
const el    = id => document.getElementById(id);
const v     = id => (el(id)?.value||'').trim();
const setEl = (id, t) => { const e=el(id); if(e) e.textContent=t; };
const setHTML = (id, h) => { const e=el(id); if(e) e.innerHTML=h; };
const emptyState = (icon, msg, sub='') =>
  `<div class="empty-state"><span class="empty-icon">${icon}</span><p>${msg}</p>${sub?`<p class="muted" style="font-size:.72rem;margin-top:4px">${sub}</p>`:''}</div>`;
const playerItem = (name, team) =>
  `<div class="player-row"><div class="p-avatar">${name[0].toUpperCase()}</div>
  <div><div style="font-weight:700">${name}</div><div class="muted" style="font-size:.7rem">${team}</div></div></div>`;

// ═══ SCREEN ══════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  el(id)?.classList.add('active');
}

// ═══ TOAST ═══════════════════════════════════════════════════════
function showToast(msg, dur=2800) {
  const t = el('toast');
  t.innerHTML = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), dur);
}

// ═══ MODAL ═══════════════════════════════════════════════════════
function showModal(title, body, hideClose=false) {
  el('modal-title').textContent = title;
  el('modal-body').innerHTML    = body;
  el('modal-close').style.display = hideClose ? 'none' : 'block';
  el('modal').classList.remove('hidden');
}
function closeModal() { el('modal').classList.add('hidden'); }

// ═══ ROLE ═════════════════════════════════════════════════════════
function selectRole(role) {
  document.querySelectorAll('.role-card').forEach(c => c.classList.remove('selected'));
  el('role-'+role).classList.add('selected');
  ['master','team'].forEach(r => el('form-'+r).style.display = r===role?'block':'none');
}

// ═══ CREATE / REJOIN ══════════════════════════════════════════════
const MASTER_PW_HASH = 'placeholder';

function setMasterMode(mode) {
  const isRejoin = mode === 'rejoin';
  el('master-rejoin-section').style.display = isRejoin ? 'block' : 'none';
  el('master-create-section').style.display = isRejoin ? 'none'  : 'block';
  // Toggle button styles
  const amber = 'var(--amber)', dark = '#1a0f00', muted = 'var(--muted)';
  const btnC = el('btn-mode-create'), btnR = el('btn-mode-rejoin');
  if (btnC) { btnC.style.background = isRejoin ? 'transparent' : amber; btnC.style.color = isRejoin ? muted : dark; }
  if (btnR) { btnR.style.background = isRejoin ? amber : 'transparent'; btnR.style.color = isRejoin ? dark : muted; }
}

async function loadExistingGames() {
  const pw = v('master-password');
  if (!pw) return showToast('⚠️ Introdueix la contrassenya primer');
  const ok = await _checkMasterPassword(pw);
  if (!ok) return showToast('❌ Contrassenya incorrecta');
  const listEl = el('existing-games-list');
  listEl.innerHTML = '<p class="muted" style="font-size:.75rem;text-align:center">⏳ Cercant…</p>';
  try {
    await game.initFirebase();
    const snap = await game.db.ref('games').once('value');
    const all  = snap.val() || {};
    const active = Object.entries(all)
      .filter(([, g]) => g && !g.terminated && g.status !== 'finished')
      .sort(([, a], [, b]) => (b.createdAt || 0) - (a.createdAt || 0));
    if (!active.length) {
      listEl.innerHTML = '<p class="muted" style="font-size:.75rem;text-align:center">Cap partida activa trobada</p>';
      return;
    }
    listEl.innerHTML = active.map(([code, g]) => {
      const dt   = g.createdAt ? new Date(g.createdAt) : null;
      const date = dt ? dt.toLocaleDateString('ca',{day:'2-digit',month:'2-digit'}) + ' ' +
                        dt.toLocaleTimeString('ca',{hour:'2-digit',minute:'2-digit'}) : '—';
      const teams  = Object.keys(g.teams || {}).join(', ') || 'Sense equips';
      const round  = g.currentRound || 1;
      const status = g.status === 'playing' ? `Ronda ${round}` : g.status || '?';
      return `<div style="display:flex;gap:6px;margin-bottom:6px;align-items:stretch">
        <button onclick="pickExistingGame('${code}')"
          style="flex:1;text-align:left;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);
                 border-radius:9px;padding:10px 12px;cursor:pointer;transition:.15s"
          onmouseover="this.style.borderColor='var(--amber)'" onmouseout="this.style.borderColor='rgba(255,255,255,.1)'">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <span style="font-family:'Cormorant Garamond',serif;font-size:1.3rem;font-weight:700;color:var(--amber);letter-spacing:3px">${code}</span>
            <span class="muted" style="font-size:.68rem">${date}</span>
          </div>
          <div style="font-size:.72rem;color:var(--muted);margin-top:2px">${teams} · ${status}</div>
        </button>
        <button onclick="deleteGame('${code}')"
          style="background:rgba(139,32,32,.25);border:1px solid rgba(139,32,32,.4);border-radius:9px;
                 padding:0 12px;cursor:pointer;color:#e07070;font-size:1rem;flex-shrink:0"
          title="Esborrar partida">🗑️</button>
      </div>`;
    }).join('');
  } catch(e) { listEl.innerHTML = `<p class="muted" style="font-size:.75rem">Error: ${e.message}</p>`; }
}

async function deleteGame(code) {
  if (!confirm(`Segur que vols esborrar la partida ${code}? Aquesta acció no es pot desfer.`)) return;
  try {
    await game.initFirebase();
    await game.db.ref('games/' + code).remove();
    showToast('🗑️ Partida ' + code + ' esborrada');
    loadExistingGames(); // refresh list
  } catch(e) { showToast('❌ ' + e.message); }
}

function pickExistingGame(code) {
  const inp = el('master-rejoin-input');
  if (inp) inp.value = code;
  // Highlight selected
  el('existing-games-list').querySelectorAll('button').forEach(b => {
    b.style.borderColor = b.textContent.includes(code) ? 'var(--amber)' : 'rgba(255,255,255,.1)';
    b.style.background  = b.textContent.includes(code) ? 'rgba(200,130,26,.12)' : 'rgba(255,255,255,.05)';
  });
  showToast('Seleccionat: ' + code);
}

async function _checkMasterPassword(input) {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  // sha256('merderada')
  return hex === '84a0a5b8837983314b166079f7af613a57031c0b9b1283b86a1d714d7e8baef9';
}

async function createGame() {
  const name = v('master-name');
  const pw   = v('master-password');
  if (!name) return showToast('⚠️ Introdueix el teu nom');
  if (!pw)   return showToast('⚠️ Introdueix la contrassenya del Master');
  const ok = await _checkMasterPassword(pw);
  if (!ok) return showToast('❌ Contrassenya incorrecta');
  try {
    showToast('⏳ Creant partida…');
    const code = await game.createGame(name);
    setEl('display-code', code);
    showScreen('screen-lobby-master');
    listenLobby();
    showToast('✅ Partida creada! Codi: '+code);
  } catch(e) { showToast('❌ '+e.message); console.error(e); }
}

// ═══ JOIN ═════════════════════════════════════════════════════════
async function rejoinAsMaster() {
  const name = v('master-name');
  const pw   = v('master-password');
  const code = (v('master-rejoin-input')||'').toUpperCase().trim();
  if (!name) return showToast('⚠️ Introdueix el teu nom');
  if (!pw)   return showToast('⚠️ Introdueix la contrassenya');
  if (code.length !== 5) return showToast('⚠️ Codi de 5 caràcters');
  const ok = await _checkMasterPassword(pw);
  if (!ok) return showToast('❌ Contrassenya incorrecta');
  try {
    showToast('⏳ Recuperant partida…');
    await game.initFirebase();
    if (!await game.checkGameExists(code)) return showToast('❌ Partida no trobada: ' + code);
    // Reconnect as master
    game.gameCode   = code;
    game.role       = 'master';
    game.playerName = name;
    game.teamId     = null;
    game.gameRef    = game.db.ref('games/' + code);
    game.saveSession();
    // Load current state to decide which screen
    const snap  = await game.gameRef.once('value');
    const state = snap.val();
    gameState   = state;
    setEl('display-code', code);
    if (!state || state.status === 'lobby') {
      showScreen('screen-lobby-master');
      listenLobby();
    } else {
      showScreen('screen-game-master');
      listenLobby();
      initMasterView();
    }
    showToast('✅ Partida ' + code + ' recuperada!');
  } catch(e) { showToast('❌ ' + e.message); console.error(e); }
}

async function loadTeamsForJoin() {
  const code = v('join-code').toUpperCase();
  const name = v('player-name');
  if (code.length !== 5) return showToast('⚠️ Codi de 5 caràcters');
  if (!name)             return showToast('⚠️ Introdueix el teu nom');
  try {
    if (!await game.checkGameExists(code)) return showToast('❌ Partida no trobada');
    const teams = await game.getTeamsForCode(code);
    const names = Object.keys(teams);
    const existingHTML = names.map(t => `
      <button onclick="pickTeam('${t}')" class="team-pick-btn">
        <span style="font-size:1.2rem">🍻</span>
        <div style="text-align:left">
          <div style="font-weight:700">${t}</div>
          <div style="font-size:.7rem;color:var(--muted)">${Object.keys(teams[t].players||{}).length} jugadors</div>
        </div>
      </button>`).join('');
    showModal('Selecciona equip', `
      ${names.length ? `<p class="muted mb-8" style="font-size:.78rem">Uneix-te a un equip existent:</p>${existingHTML}<hr class="divider">` : ''}
      <div class="ig"><label>O crea un equip nou</label>
        <input type="text" id="modal-team" placeholder="Nom del nou equip…" maxlength="20"></div>
      <button class="btn btn-primary" onclick="confirmJoin()">✓ Entrar</button>`);
  } catch(e) { showToast('❌ '+e.message); }
}
function pickTeam(name) {
  const inp = el('modal-team'); if(inp) inp.value = name;
  document.querySelectorAll('.team-pick-btn').forEach(b => b.classList.remove('selected'));
  event?.target?.closest('.team-pick-btn')?.classList.add('selected');
}
async function confirmJoin() {
  const code = v('join-code').toUpperCase();
  const name = v('player-name');
  const team = el('modal-team')?.value.trim();
  if (!team) return showToast('⚠️ Selecciona o escriu un equip');
  closeModal();
  try {
    showToast('⏳ Connectant…');
    await game.joinGame(code, name, team);
    setEl('lobby-team-info', `${team} · ${name}`);
    showScreen('screen-lobby-team');
    listenGameState();
    showToast('✅ Benvingut/da, '+name+'!');
  } catch(e) { showToast('❌ '+e.message); }
}

// ═══ SESSION RESTORE ══════════════════════════════════════════════
async function tryRestoreSession() {
  const s = game.loadSession();
  if (!s) return false;
  try {
    const state = await game.restoreSession(s);
    if (!state) { showToast('⚠️ Sessió caducada'); return false; }
    gameState = state;
    if (s.role === 'master') {
      setEl('display-code', s.gameCode);
      if (state.status === 'lobby') { showScreen('screen-lobby-master'); listenLobby(); }
      else { showScreen('screen-game-master'); listenLobby(); initMasterView(); }
    } else {
      setEl('lobby-team-info', `${s.teamId} · ${s.playerName}`);
      if (state.status === 'lobby') { showScreen('screen-lobby-team'); listenGameState(); }
      else { showScreen('screen-game-team'); listenGameState(); initTeamView(state); updateTeamView(state); }
    }
    showToast('✅ Sessió restaurada!');
    return true;
  } catch(e) { console.error('Restore failed', e); return false; }
}

// ═══ SETTINGS ════════════════════════════════════════════════════
function showSettings() {
  const code = game.gameCode || '—';
  showModal('⚙️ Configuració', `
    <div class="settings-code-box">
      <div class="muted" style="font-size:.62rem;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">Codi de partida</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:2.5rem;font-weight:700;color:var(--amber-l);letter-spacing:12px">${code}</div>
      <button class="btn btn-secondary btn-sm mt-8" onclick="cpCode('${code}')">📋 Copiar codi</button>
    </div>
    <div class="settings-row"><span class="muted">Master</span><strong>${game.playerName||'—'}</strong></div>
    <div class="ig mt-12"><label>Total de rondes</label>
      <input type="number" id="cfg-rounds" value="${gameState?.totalRounds||6}" min="1" max="20"></div>
    <button class="btn btn-primary" onclick="saveSettings()">💾 Guardar</button>
    ${game.role==='master'
      ? `<button class="btn btn-danger mt-8" onclick="terminateMasterSession()">🚪 Tancar sessió (tots els jugadors)</button>`
      : `<button class="btn btn-secondary mt-8" onclick="game.clearSession();location.reload()">🚪 Sortir de la partida</button>`
    }`);
}
async function saveSettings() {
  const r = parseInt(el('cfg-rounds')?.value)||6;
  if (game.gameRef) await game.gameRef.child('totalRounds').set(r);
  closeModal(); showToast('✅ Guardat');
}

async function terminateMasterSession() {
  if (!confirm('Tancar la sessió per a TOTS els jugadors? Aquesta acció no es pot desfer.')) return;
  await game.terminateSession();
  location.reload();
}
function cpCode(c) {
  try { navigator.clipboard.writeText(c); } catch {
    const e2 = Object.assign(document.createElement('textarea'),{value:c});
    document.body.appendChild(e2); e2.select(); document.execCommand('copy'); e2.remove();
  }
  showToast('📋 Codi copiat: '+c);
}

// ═══ CARD POOL MANAGER (master) ═══════════════════════════════════
function openCardPoolManager() {
  const current = gameState?.activeCardIds || null; // null = all
  const allIds  = BJCP_CARDS.map(c => c.id);
  const selected = current ? new Set(current) : new Set(allIds);

  const rows = BJCP_CARDS.map(c => {
    const on = selected.has(c.id);
    return `<label class="pool-row ${on?'pool-on':'pool-off'}" id="pool-${c.id}">
      <input type="checkbox" value="${c.id}" ${on?'checked':''} onchange="poolToggle(this)">
      <span class="pool-num">${c.number}</span>
      <span class="pool-name">${c.name}</span>
      <span class="pool-cat">${c.category}</span>
    </label>`;
  }).join('');

  showModal('🎴 Gestionar Cartes Visibles', `
    <p class="muted mb-12" style="font-size:.78rem">Tria quines cartes poden veure els participants. Es mantenen entre rondes fins que les canvies.</p>
    <div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">
      <button class="btn btn-secondary btn-sm" onclick="poolSelectAll(true)">✅ Totes</button>
      <button class="btn btn-secondary btn-sm" onclick="poolSelectAll(false)">☐ Cap</button>
      <span class="muted" style="font-size:.75rem;align-self:center" id="pool-count">${selected.size}/${allIds.length} seleccionades</span>
    </div>
    <div class="pool-search-wrap">
      <input type="text" id="pool-search" placeholder="🔍 Filtrar…" oninput="poolFilter()" style="margin-bottom:8px">
    </div>
    <div class="pool-list" id="pool-list">${rows}</div>
    <button class="btn btn-primary mt-12" onclick="saveCardPool()">💾 Guardar selecció</button>`);
}

function poolToggle(cb) {
  const currentBeerId = gameState?.currentBeer?.id;
  if (!cb.checked && cb.value === currentBeerId) {
    cb.checked = true;
    showToast('⚠️ No pots desactivar la carta de la ronda actual');
    return;
  }
  const row = cb.closest('.pool-row');
  row.classList.toggle('pool-on', cb.checked);
  row.classList.toggle('pool-off', !cb.checked);
  updatePoolCount();
}
function poolSelectAll(on) {
  el('pool-list')?.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.checked = on;
    const row = cb.closest('.pool-row');
    row.classList.toggle('pool-on', on);
    row.classList.toggle('pool-off', !on);
  });
  updatePoolCount();
}
function updatePoolCount() {
  const checked = el('pool-list')?.querySelectorAll('input:checked').length || 0;
  setEl('pool-count', `${checked}/${BJCP_CARDS.length} seleccionades`);
}
function poolFilter() {
  const q = el('pool-search')?.value.toLowerCase()||'';
  el('pool-list')?.querySelectorAll('.pool-row').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}
async function saveCardPool() {
  const checked = [...(el('pool-list')?.querySelectorAll('input:checked')||[])].map(cb => cb.value);
  const allIds  = BJCP_CARDS.map(c => c.id);
  const toSave  = checked.length === allIds.length ? null : checked;
  await game.setActiveCards(toSave);
  activeCardIds = toSave;
  closeModal();
  // Re-render master beer grid with new card pool
  renderMasterBeerGrid();
  // Reset selected beer if it's no longer in the pool
  if (selectedBeer && toSave && !toSave.includes(selectedBeer)) {
    selectedBeer = null;
    el('btn-set-beer').disabled = true;
  }
  setEl('pool-info', toSave ? `🎴 ${checked.length} cartes actives` : `🎴 Totes (${allIds.length}) les cartes`);
  showToast(`✅ Cartes actualitzades: ${checked.length} visibles`);
}

// ═══ LISTENERS ════════════════════════════════════════════════════
function listenLobby() {
  game.gameRef.on('value', snap => {
    const s = snap.val(); if(!s) return;
    gameState = s;
    activeCardIds = s.activeCardIds || null;
    updateLobbyMaster(s);
    if (s.status==='playing')  { showScreen('screen-game-master'); initMasterView(); }
    if (s.status==='finished') { showScreen('screen-finished'); renderFinalRanking(s); }
  });
}
function listenGameState() {
  game.gameRef.on('value', snap => {
    const s = snap.val(); if(!s) return;

    // Master has terminated the session → kick all players
    if (s.terminated) {
      game.clearSession();
      showModal('👋 Sessió tancada', `
        <p style="margin-bottom:14px">El Master ha tancat la sessió de joc.</p>
        <button class="btn btn-primary" onclick="location.reload()">🔄 Tornar a l'inici</button>`, true);
      return;
    }

    if (s.roundReset && s.roundReset !== lastRoundReset) {
      lastRoundReset = s.roundReset;
      cardStates = {}; lastRevealedId = null;
      cardSearch = '';
      cardFilter = 'all';
      const searchInp = el('card-search');
      if (searchInp) searchInp.value = '';
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      document.querySelector('.chip')?.classList.add('active');
      const wrap = el('team-guesses-wrap');
      if (wrap) wrap.style.display = 'none';
      showToast('🔄 Nova ronda — cartes reiniciades!');
      renderCurrentCardView();
    }
    activeCardIds = s.activeCardIds || null;
    gameState = s;
    if (s.status==='lobby')    updateLobbyTeam(s);
    if (s.status==='playing')  { showScreen('screen-game-team'); initTeamView(s); updateTeamView(s); }
    if (s.status==='finished') { showScreen('screen-finished'); renderFinalRanking(s); }
  });
}

// ═══ LOBBY ════════════════════════════════════════════════════════
function updateLobbyMaster(s) {
  const teams = s.teams||{};
  let html='', total=0;
  Object.entries(teams).forEach(([tid,t]) =>
    Object.values(t.players||{}).forEach(p => { total++; html += playerItem(p.name, tid); }));
  setHTML('lobby-players-list', html || emptyState('⏳','Esperant jugadors…'));
  el('btn-start').disabled = total===0;
}
function updateLobbyTeam(s) {
  const teams = s.teams||{};
  let html='';
  Object.entries(teams).forEach(([tid,t]) =>
    Object.values(t.players||{}).forEach(p => { html += playerItem(p.name, tid); }));
  setHTML('lobby-team-list', html);
}
async function startGame() {
  try { await game.startGame(); } catch(e) { showToast('❌ '+e.message); }
}

// ═══ TAB NAV ══════════════════════════════════════════════════════
function switchTab(tab) {
  ['cards','actions','ranking','messages'].forEach(t => {
    el('tab-'+t)  && (el('tab-'+t).style.display  = t===tab?'block':'none');
    el('nav-'+t)?.classList.toggle('active', t===tab);
  });
  if (tab==='messages') { unreadMsgs=0; updMsgBadge(); }
}
function switchMasterTab(tab) {
  ['round','ranking','teams','messages','log'].forEach(t => {
    el('mtab-'+t) && (el('mtab-'+t).style.display = t===tab?'block':'none');
    el('mnav-'+t)?.classList.toggle('active', t===tab);
  });
  if (tab==='messages') { unreadMsgs=0; updMsgBadge(); }
  if (tab==='log') renderMasterLog(gameState);
}

// ═══ TEAM VIEW ════════════════════════════════════════════════════
function initTeamView(s) {
  if (teamViewInited) return;
  teamViewInited = true;
  buildGuessOptions();
  initExplorerPills();
  // Listen for new messages — show popup for shield alerts
  game.gameRef.child('messages').on('value', snap => {
    const msgs = snap.val() || {};
    renderMessages(msgs, 'team');
    // Check for new shield alert directed at my team
    const now = Date.now();
    Object.values(msgs).forEach(m => {
      if (m.isShieldAlert && m.toTeam === game.teamId && m.ts > (window._lastShieldCheck||0)) {
        window._lastShieldCheck = now;
        // Show prominent popup
        showModal('🃏🤡 Carta Anul·lada!', `
          <div style="text-align:center;padding:10px 0">
            <div style="font-size:3rem;margin-bottom:10px">🃏🤡</div>
            <div style="font-size:.9rem;line-height:1.6;color:var(--text)">${m.text}</div>
            <button class="btn btn-primary mt-12" onclick="closeModal()">Entès</button>
          </div>`);
      }
    });
  });
}

function updateTeamView(s) {
  if (!s) return;
  const myTeam  = s.teams?.[game.teamId]||{};
  const myPlayer = myTeam.players?.[game.playerName]||{};
  const allMyCards = myPlayer.actionCards || [];
  // Filter out cards that are pending reveal (not yet shown to player)
  // A card is pending if there's a pendingReveal message for this player
  const pendingMsgs = Object.values(s.messages || {}).filter(
    m => m.pendingReveal && m.toTeam === game.teamId &&
         (!m.toPlayer || m.toPlayer === game.playerName) && m.isCardGrant
  );
  // Cards granted after the latest pending message are not yet revealed
  // Simple heuristic: if ANY pendingReveal card grant exists, hide the newest card
  const hiddenCount = pendingMsgs.length;
  const myCards = hiddenCount > 0
    ? allMyCards.slice(0, Math.max(0, allMyCards.length - hiddenCount))
    : allMyCards;
  const round    = s.currentRound||1;
  const total    = s.totalRounds||6;

  setEl('player-strip', `👤 ${game.playerName}  ·  🍻 ${game.teamId}`);
  setEl('cards-strip',  `🃏 ${myPlayer.actionCardsReceived||0} cartes rebudes`);
  el('round-bar')?.style && (el('round-bar').style.display='block');
  setEl('round-display', `Ronda ${round}/${total}`);
  setEl('action-count',  myCards.length);
  setEl('action-count2', myCards.length);
  // Show total active card count
  const totalCards = activeCardIds ? activeCardIds.length : BJCP_CARDS.length;
  setEl('pool-count-display', `🎴 ${totalCards} estils en joc`);

  // Action badge
  const badge = el('action-badge');
  if (badge) { badge.style.display=myCards.length>0?'flex':'none'; badge.textContent=myCards.length; }

  // Lock banner
  el('cards-lock-banner')?.style && (el('cards-lock-banner').style.display=s.cardsLocked?'flex':'none');
  // Lie warning
  el('lie-warning')?.style && (el('lie-warning').style.display=
    (s.activeLieTeam && s.activeLieTeam!==game.teamId)?'block':'none');
  // Cancel shield active (own team)
  el('cancel-shield-info')?.style && (el('cancel-shield-info').style.display=
    (s.cancelShieldTeam && s.cancelShieldTeam===game.teamId)?'block':'none');

  renderActionCards(myCards, myPlayer.usedCards||[]);
  renderRevealedBar(s.currentBeer?.revealedInfo||{}, s.currentBeer?.teamInfo?.[game.teamId]||{});
  renderCurrentCardView();
  renderTeamGuesses(s);
  updateRanking(s,'team-ranking','player-ranking');

  // Pending yes/no answer
  const pq = s.currentBeer?.pendingQuestion;
  if (pq?.answered && pq.teamId === game.teamId && !el('pq-shown-'+pq.askedAt)) {
    const div = document.createElement('div'); div.id = 'pq-shown-'+pq.askedAt;
    document.body.appendChild(div);
    showToast(`❓ Resposta del Master: ${pq.answer ? '✅ SÍ' : '❌ NO'}`, 5000);
  }

  // Result animation — only show when master explicitly reveals
  const beer = s.currentBeer;
  if (beer?.resultsVisible && beer.id !== lastRevealedId) {
    lastRevealedId = beer.id;
    showResultOverlay(s);
  }
}

function showResultOverlay(s) {
  const beer    = s.currentBeer;
  const guesses = Object.values(beer?.guesses || {});
  const overlay = el('result-overlay');
  if (!overlay) return;

  const judged    = guesses.filter(g => g.judged);
  const myGuess   = judged.find(g => g.playerName === game.playerName && g.teamId === game.teamId);
  const iWon      = myGuess?.correct === true;
  const iLost     = myGuess && !myGuess.correct;
  const myPts     = myGuess?.points ?? null;

  // ── Personal half ─────────────────────────────────────────────
  let persIcon, persTitle, persDetail, persClass;
  if (iWon) {
    persIcon  = '🎯';
    persTitle = 'Has encertat!';
    persDetail = myPts !== null ? `+${myPts} punt${myPts!==1?'s':''}` : '';
    persClass = 'res-pers-win';
  } else if (iLost) {
    persIcon  = '❌';
    persTitle = 'No has encertat';
    const myCard = BJCP_CARDS.find(c => c.id === myGuess.guessId);
    const correctCard = BJCP_CARDS.find(c => c.id === beer?.id);
    persDetail = `Has triat: ${myCard?.name || myGuess.guess || '?'}<br>Cervesa correcta: <strong>${correctCard?.name || beer?.name || '?'}</strong>`;
    persClass = 'res-pers-lose';
  } else {
    persIcon  = '⏸️';
    persTitle = 'No has fet proposta';
    persDetail = `Cervesa: ${beer?.name || '?'}`;
    persClass = 'res-pers-lose';
  }

  // ── Team half ─────────────────────────────────────────────────
  // Compare team pts before and after this round using all judged guesses
  const myTeamGuesses  = judged.filter(g => g.teamId === game.teamId);
  const rivTeamGuesses = judged.filter(g => g.teamId !== game.teamId);
  const myTeamPts   = myTeamGuesses.reduce((s,g) => s + (g.points||0), 0);
  const rivTeamPts  = rivTeamGuesses.reduce((s,g) => s + (g.points||0), 0);
  const myTeamWon   = myTeamGuesses.some(g => g.correct);
  const rivalWon    = rivTeamGuesses.some(g => g.correct);

  let teamIcon, teamTitle, teamDetail, teamClass;
  if (myTeamPts > rivTeamPts) {
    teamIcon  = '🏆'; teamClass = 'res-team-win';
    teamTitle = `Victòria d'equip!`;
  } else if (myTeamPts === rivTeamPts && myTeamPts > 0) {
    teamIcon  = '🤝'; teamClass = 'res-team-tie';
    teamTitle = `Empat!`;
  } else if (myTeamPts === rivTeamPts && myTeamPts === 0) {
    teamIcon  = '😶'; teamClass = 'res-team-tie';
    teamTitle = `Ningú ha puntuat`;
  } else {
    teamIcon  = '😔'; teamClass = 'res-team-lose';
    teamTitle = `L'equip rival ha guanyat`;
  }

  // Detail: pts breakdown
  const myWinners  = myTeamGuesses.filter(g=>g.correct).map(g=>`${g.playerName} (+${g.points}pt)`).join(', ');
  const rivWinners = rivTeamGuesses.filter(g=>g.correct).map(g=>`${g.playerName} (${g.teamId})`).join(', ');
  teamDetail = '';
  if (myTeamPts !== 0)  teamDetail += `El teu equip: <strong>${myTeamPts >= 0 ? '+' : ''}${myTeamPts}pt</strong>`;
  if (myWinners)        teamDetail += `<br>${myWinners}`;
  if (rivalWon)         teamDetail += `<br><span style="opacity:.7">Rivals: ${rivWinners}</span>`;

  // Apply to DOM — use setHTML for fields that may contain markup
  overlay.style.display = 'flex';
  overlay.className = `result-overlay ${persClass} ${teamClass}`;
  setHTML('res-personal-icon',   persIcon);
  setEl ('res-personal-title',   persTitle);
  setHTML('res-personal-detail', persDetail);
  el('res-personal-icon')?.classList.toggle('res-bounce', iWon);
  setHTML('res-team-icon',   teamIcon);
  setEl ('res-team-title',   teamTitle);
  setHTML('res-team-detail', teamDetail);
  setEl ('res-beer', `🍺 ${beer?.name||'—'}`);
  clearTimeout(overlay._t);
}

// ── Render action cards with full descriptions ──────────────────
function renderActionCards(cards) {
  const container = el('team-action-cards');
  if (!container) return;
  if (!cards.length) {
    container.innerHTML = emptyState('🃏','No tens cartes d\'acció','S\'aconsegueixen encertant rondes');
    return;
  }
  container.innerHTML = cards.map(card => {
    const def = ACTION_CARD_TYPES.find(a => a.id === card.type)||{name:card.type, icon:'🃏', desc:''};
    return `<div class="action-card-full" onclick="openUseCard('${card.id}','${card.type}')">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
        <span style="font-size:1.8rem">${def.icon}</span>
        <div><div style="font-weight:800;font-size:.9rem">${def.name}</div>
          <div class="muted" style="font-size:.65rem;text-transform:uppercase;letter-spacing:.5px">Carta d'Acció</div></div>
      </div>
      <div style="font-size:.78rem;color:var(--muted);line-height:1.5">${def.desc}</div>
      <div style="margin-top:10px;text-align:center">
        <span style="font-size:.7rem;color:var(--amber-l);font-weight:700;text-transform:uppercase;letter-spacing:.5px">Toca per usar ▶</span>
      </div>
    </div>`;
  }).join('');
}

function openUseCard(cardInstanceId, cardType) {
  const def = ACTION_CARD_TYPES.find(a => a.id === cardType)||{};
  if (!gameState?.currentBeer && !['cancel','lie'].includes(cardType))
    return showToast('⚠️ Esperant la cervesa de la ronda');

  if (cardType === 'yes_no') {
    // Player must type a question first
    showModal(`${def.icon} ${def.name}`, `
      <p class="muted mb-12" style="font-size:.8rem">${def.desc}</p>
      <div class="ig"><label>La teva pregunta (el Master respondrà Sí o No)</label>
        <textarea id="yn-question" rows="3" placeholder="Escriu la teva pregunta…"></textarea></div>
      <button class="btn btn-primary" onclick="confirmUseCard('${cardInstanceId}','${cardType}')">📨 Enviar pregunta</button>`);
  } else if (cardType === 'sensory') {
    showModal(`${def.icon} ${def.name}`, `
      <p class="muted mb-12" style="font-size:.8rem">${def.desc}</p>
      <p style="font-size:.85rem">El Master rebrà la sol·licitud i t'enviarà una pista per escrit.</p>
      <button class="btn btn-primary mt-12" onclick="confirmUseCard('${cardInstanceId}','${cardType}')">📨 Sol·licitar Pista Sensorial</button>`);
  } else {
    showModal(`${def.icon} ${def.name}`, `
      <p class="muted mb-12" style="font-size:.82rem">${def.desc}</p>
      <button class="btn btn-primary" onclick="confirmUseCard('${cardInstanceId}','${cardType}')">⚡ Usar aquesta carta</button>`);
  }
}

async function confirmUseCard(cardInstanceId, cardType) {
  const extra = {};
  if (cardType === 'yes_no') {
    const q = el('yn-question')?.value.trim();
    if (!q) return showToast('⚠️ Escriu la pregunta');
    extra.question = q;
  }
  closeModal();
  try {
    const result = await game.useCard(game.teamId, game.playerName, cardInstanceId, cardType, extra);
    if (result.ok) {
      showToast('✅ ' + (result.message || 'Carta usada!'), 3500);
      if (result.dialPhone) {
        setTimeout(() => { window.location.href = `tel:${result.dialPhone}`; }, 400);
      }
    } else if (result.shieldBlock) {
      showModal('🃏 Carta Bloquejada!', `
        <div style="text-align:center;padding:12px 0">
          <div style="font-size:3rem;margin-bottom:10px">🃏</div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:1.2rem;font-weight:700;color:var(--amber-l);margin-bottom:10px">L'equip rival ha anulat la teva carta!</div>
          <p class="muted" style="font-size:.82rem;line-height:1.6">Tenien activada la Carta Anular Ajuda en secret.<br>La teva carta s'ha consumit sense efecte.</p>
        </div>`);
    } else {
      showToast('⚠️ ' + (result.message || "No s'ha pogut usar"), 3500);
    }
  } catch(e) { showToast('❌ ' + e.message); }
}

function renderRevealedBar(globalInfo, teamInfo) {
  const bar = el('revealed-bar');
  if (!bar) return;
  const combined = { ...globalInfo, ...teamInfo };
  const labels = {
    ibu:'🌿 IBU', abv:'🍺 ABV', srm:'🎨 Color', category:'📂 Cat',
    fermentation:'🔬 Ferm', origin:'🌍 Origen', sensory:'🌾 Pista',
    yes_no:'❓ Sí/No', lie:'🤥 Mentida', cancel:'🚫 Escut',
    eliminate:'✂️ Descart', wildcard:'📞 Trucada', steal:'🦝 Robada'
  };
  bar.innerHTML = Object.entries(combined)
    .map(([k,v]) => `<span class="info-pill">${labels[k]||k}: <strong>${v}</strong></span>`)
    .join('');
}

// ═══ BEER CARDS ═══════════════════════════════════════════════════
function getVisibleCards() {
  if (!activeCardIds) return [...BJCP_CARDS];
  return BJCP_CARDS.filter(c => activeCardIds.includes(c.id));
}

// populateGuessSelect replaced by buildGuessOptions

function buildTeamCardMap() {
  const out = {};
  const myTeam = gameState?.teams?.[game.teamId]||{};
  Object.entries(myTeam.players||{}).forEach(([pName, pData]) => {
    Object.entries(pData.cardStates||{}).forEach(([cardId, st]) => {
      if (!out[cardId]) out[cardId] = { possible:[], discarded:[] };
      if (st==='possible')  out[cardId].possible.push(pName);
      if (st==='discarded') out[cardId].discarded.push(pName);
    });
  });
  return out;
}

// Parse a revealed info string into a numeric range [min, max]
// Handles: "35", "35 IBU", "30–45", "30–45 IBU", "8.5%", "4.4–5.8%", "SRM 19", "SRM 8–14"
function parseInfoRange(str) {
  if (!str) return null;
  const clean = str.replace(/IBU|SRM|%/gi,'').trim();
  const parts = clean.split(/[–-]/).map(s => parseFloat(s.trim()));
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) return [parts[0], parts[1]];
  if (parts.length === 1 && !isNaN(parts[0])) return [parts[0], parts[0]]; // single value
  return null;
}

// Check if a card's range overlaps with a revealed value/range
function rangeOverlaps(cardMin, cardMax, revMin, revMax) {
  return cardMax >= revMin && cardMin <= revMax;
}

function getRevealStatus(card, info, teamInfo) {
  const combined = { ...info, ...teamInfo };
  const checks = [];

  if (combined.ibu) {
    const r = parseInfoRange(combined.ibu);
    if (r && card.ibuMin != null) checks.push(rangeOverlaps(card.ibuMin, card.ibuMax, r[0], r[1]));
    else if (!r && card.ibuMin == null) checks.push(true); // unknown field, no check
  }
  if (combined.abv) {
    const r = parseInfoRange(combined.abv);
    if (r && card.abvMin != null) checks.push(rangeOverlaps(card.abvMin, card.abvMax, r[0], r[1]));
    else if (!r && card.abvMin == null) checks.push(true);
  }
  if (combined.srm) {
    const r = parseInfoRange(combined.srm);
    if (r && card.srmMin != null) checks.push(rangeOverlaps(card.srmMin, card.srmMax, r[0], r[1]));
    else if (!r && card.srmMin == null) checks.push(true);
  }
  if (combined.category) {
    const num = parseInt(combined.category.replace(/\D/g,''), 10);
    if (!isNaN(num)) checks.push(card.categoryNumber === num);
  }

  if (!checks.length) return null;
  return checks.every(Boolean) ? 'match' : 'nomatch';
}

function renderBeerCards() {
  const container = el('cards-container');
  if (!container) return;
  const locked = gameState?.cardsLocked;
  if (locked) { container.innerHTML=''; return; }

  const globalInfo = gameState?.currentBeer?.revealedInfo||{};
  const teamInfo   = gameState?.currentBeer?.teamInfo?.[game.teamId]||{};
  const teamCS     = buildTeamCardMap();
  let cards        = getVisibleCards();

  // Sync local cardStates with Firebase
  const myPlayer = gameState?.teams?.[game.teamId]?.players?.[game.playerName];
  if (myPlayer?.cardStates) {
    Object.entries(myPlayer.cardStates).forEach(([id,st]) => { cardStates[id] = st; });
  }

  if (cardFilter==='possible') {
    const teamPossible = new Set(
      Object.values(gameState?.teams?.[game.teamId]?.players||{})
        .flatMap(p => Object.entries(p.cardStates||{}).filter(([,st])=>st==='possible').map(([id])=>id))
    );
    cards = cards.filter(c => teamPossible.has(c.id));
  } else if (cardFilter==='discarded') {
    const teamDiscarded = new Set(
      Object.values(gameState?.teams?.[game.teamId]?.players||{})
        .flatMap(p => Object.entries(p.cardStates||{}).filter(([,st])=>st==='discarded').map(([id])=>id))
    );
    cards = cards.filter(c => teamDiscarded.has(c.id));
  }

  if (cardSearch) {
    const q = cardSearch.toLowerCase();
    cards = cards.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q) ||
      (c.aroma||'').toLowerCase().includes(q) ||
      (c.appearance||'').toLowerCase().includes(q) ||
      (c.flavor||'').toLowerCase().includes(q) ||
      (c.overallImpression||'').toLowerCase().includes(q) ||
      (c.tags||'').toLowerCase().includes(q) ||
      (c.commercialExamples||'').toLowerCase().includes(q)
    );
  }

  // Always sort: by match % when filters active, else by categoryNumber + name
  if (EF.active) {
    cards = cards
      .map(c => ({ c, pct: explorerScoreCard(c) }))
      .sort((a, b) => b.pct - a.pct)
      .map(x => x.c);
  } else {
    cards = cards.slice().sort((a, b) =>
      (a.categoryNumber - b.categoryNumber) || a.name.localeCompare(b.name, 'ca')
    );
  }

  if (!cards.length) {
    const msg = cardFilter==='possible' ? '⭐ Cap carta marcada com a possible (ni tu ni el teu equip)'
              : cardFilter==='discarded' ? '✕ Cap carta descartada encara'
              : 'Cap carta trobada';
    container.innerHTML=emptyState('🔍', msg); return;
  }
  container.innerHTML = cards.map(c => beerCardHTML(c, globalInfo, teamInfo, teamCS)).join('');
}

function beerCardHTML(card, globalInfo, teamInfo, teamCS) {
  const myState   = cardStates[card.id]||'normal';
  const revStatus = getRevealStatus(card, globalInfo, teamInfo);
  const tcs       = teamCS[card.id]||{possible:[],discarded:[]};
  const matchScore = explorerScoreCard(card);

  // Base classes
  const isDisc = myState==='discarded';
  const isPoss = myState==='possible';
  const mc = matchClass(matchScore, isDisc);
  let cls='beer-card';
  if (isPoss)  cls += ' possible';
  if (isDisc)  cls += ' discarded';
  // Add match color class only when filters active and not already possible/discarded
  if (!isPoss && !isDisc && EF.active && matchScore>=0) cls += ' ' + mc.card;
  // Override with reveal status (range match from info cards)
  let sty='';
  if (!isDisc && !isPoss) {
    if (revStatus==='match')   sty='border-color:#3D8B4E;box-shadow:0 0 14px rgba(61,139,78,.25)';
    if (revStatus==='nomatch') sty='opacity:.4';
  }

  const otherPossible  = tcs.possible.filter(n=>n!==game.playerName);
  const otherDiscarded = tcs.discarded.filter(n=>n!==game.playerName);
  const teamTagsHTML   = [
    ...otherPossible.map(n  => `<span class="team-tag tag-possible">⭐${n}</span>`),
    ...otherDiscarded.map(n => `<span class="team-tag tag-discarded">✕${n}</span>`)
  ].join('');
  const revIcon = revStatus==='match'?'<span class="rev-icon">✅</span>':revStatus==='nomatch'?'<span class="rev-icon">❌</span>':'';

  return `
  <div class="${cls}" id="bc-${card.id}" style="${sty}">
    <div class="card-hdr" onclick="toggleCard('${card.id}')">
      ${revIcon}
      ${EF.active && matchScore>=0 ? `<div class="card-match-dot" style="background:${['rgba(30,30,30,.5)','rgba(140,120,20,.6)','rgba(196,100,20,.7)','rgba(200,60,20,.8)','rgba(220,30,30,.85)','rgba(230,20,48,.95)'][matchScore]};width:8px;height:8px"></div>` : ''}
      <span class="card-num">${card.number}</span>
      <div style="flex:1;min-width:0">
        <div class="card-name">${card.name}</div>
        <div class="card-cat">${card.category}</div>
        ${teamTagsHTML?`<div class="team-tags">${teamTagsHTML}</div>`:''}
      </div>
      <div class="card-btns" onclick="event.stopPropagation()">
        <button class="mini-btn ${myState==='possible'?'mb-star-on':'mb-star'}"
          onclick="setCardState('${card.id}','possible')" title="Possible">⭐</button>
        <button class="mini-btn ${myState==='discarded'?'mb-x-on':'mb-x'}"
          onclick="setCardState('${card.id}','discarded')" title="Descartar">✕</button>
        ${myState==='possible'
          ? '<button class="mini-btn mb-propose" onclick="proposeCard(\''+card.id+'\',\''+card.name.replace(/\'/g,'\\\'')+'\')" title="Proposar">🎯</button>'
          : '<button class="mini-btn mb-exp" id="exp-'+card.id+'">▼</button>'}
      </div>
    </div>
    <div class="card-body" id="cbody-${card.id}">
      ${cardStatsHTML(card, globalInfo, teamInfo)}
      <div class="desc-tabs">
        <span class="desc-tab active" onclick="showDesc(event,'impression','${card.id}')">Impressió</span>
        <span class="desc-tab" onclick="showDesc(event,'aroma','${card.id}')">Aroma</span>
        <span class="desc-tab" onclick="showDesc(event,'appearance','${card.id}')">Aspecte</span>
        <span class="desc-tab" onclick="showDesc(event,'flavor','${card.id}')">Sabor</span>
      </div>
      <div class="desc-text" id="dcont-${card.id}">${card.overallImpression||''}</div>
      ${card.commercialExamples?`<div class="commercial">🏪 ${card.commercialExamples}</div>`:''}
    </div>
  </div>`;
}

function cardStatsHTML(card, globalInfo={}, teamInfo={}) {
  const combined = {...globalInfo,...teamInfo};
  return `<div class="stats-block">
    ${card.abvMin!=null?rangeBar('ABV','%',card.abvMin,card.abvMax,0,14,'#C8821A',combined.abv):''}
    ${card.ibuMin!=null?rangeBar('IBU','', card.ibuMin,card.ibuMax,0,120,'#4A90D9',combined.ibu):''}
    ${card.srmMin!=null?srmBarHTML(card.srmMin,card.srmMax,combined.srm):''}
  </div>`;
}

function rangeBar(lbl,unit,min,max,sMin,sMax,color,revealed) {
  const range=sMax-sMin;
  const l=((min-sMin)/range*100).toFixed(1);
  const w=Math.max(((max-min)/range*100),1.5).toFixed(1);
  let ov='';
  if (revealed) {
    const [a,b]=revealed.replace('%','').split('–').map(Number);
    const rl=((a-sMin)/range*100).toFixed(1), rw=Math.max(((b-a)/range*100),2).toFixed(1);
    ov=`<div style="position:absolute;top:-2px;left:${rl}%;width:${rw}%;height:calc(100%+4px);border:2px dashed rgba(255,255,255,.65);border-radius:3px;pointer-events:none"></div>`;
  }
  return `<div>
    <div style="display:flex;justify-content:space-between;margin-bottom:3px">
      <span class="stat-lbl">${lbl}</span><span class="stat-val">${min}–${max}${unit}</span></div>
    <div style="position:relative;height:8px;background:rgba(255,255,255,.07);border-radius:4px;overflow:visible">
      ${ov}<div style="position:absolute;top:0;left:${l}%;width:${w}%;height:100%;background:${color};border-radius:4px;opacity:.85"></div></div>
    <div style="display:flex;justify-content:space-between;font-size:.58rem;color:rgba(255,255,255,.2);margin-top:2px"><span>${sMin}</span><span>${sMax}${unit}</span></div>
  </div>`;
}

function srmBarHTML(min,max,revealed) {
  const C=['#FFE699','#FFD878','#FFCA5A','#FFBF42','#FBB123','#F8A600','#F39C00','#EA8F00','#E58500','#DE7C00','#D77200','#CF6900','#CB6400','#C36000','#BB5900','#B45300','#AD4D00','#A54700','#9E4200','#973D00','#8F3800','#883300','#822E00','#7B2A00','#742600','#6D2200','#661E00','#601A00','#591700','#521400','#4C1100','#450E00','#3F0C00','#380900','#320700','#2C0500','#260400','#200200','#1A0100','#140000'];
  const bars=C.map((c,i)=>`<div style="flex:1;height:100%;background:${c};opacity:${i+1>=min&&i+1<=max?1:.18}"></div>`).join('');
  let ov='';
  if (revealed) {
    const [a,b]=revealed.replace('SRM ','').split('–').map(Number);
    const l=((a-1)/40*100).toFixed(1),w=((b-a+1)/40*100).toFixed(1);
    ov=`<div style="position:absolute;top:-2px;left:${l}%;width:${w}%;height:calc(100%+4px);border:2px dashed rgba(255,255,255,.7);border-radius:2px;pointer-events:none"></div>`;
  }
  return `<div>
    <div style="display:flex;justify-content:space-between;margin-bottom:3px">
      <span class="stat-lbl">Color SRM</span><span class="stat-val">SRM ${min}–${max}</span></div>
    <div style="position:relative;display:flex;height:16px;border-radius:6px;overflow:visible;border:1px solid rgba(255,255,255,.08)">${bars}${ov}</div>
    <div style="display:flex;justify-content:space-between;font-size:.58rem;color:rgba(255,255,255,.2);margin-top:2px"><span>1 Pàl·lid</span><span>40 Negre</span></div>
  </div>`;
}

function toggleCard(id) {
  const b=el('cbody-'+id), btn=el('exp-'+id);
  if (!b) return;
  const open=b.classList.toggle('open');
  if (btn) btn.textContent=open?'▲':'▼';
}

async function setCardState(cardId, newState) {
  const prev = cardStates[cardId]||'normal';
  cardStates[cardId] = prev===newState?'normal':newState;
  await game.saveCardState(cardId, cardStates[cardId]);
  const card=BJCP_CARDS.find(c=>c.id===cardId), cardEl=el('bc-'+cardId);
  const gI=gameState?.currentBeer?.revealedInfo||{};
  const tI=gameState?.currentBeer?.teamInfo?.[game.teamId]||{};
  if (card && cardEl) {
    const tmp=document.createElement('div');
    tmp.innerHTML=beerCardHTML(card,gI,tI,buildTeamCardMap());
    cardEl.replaceWith(tmp.firstElementChild);
  }
}

function showDesc(evt, type, cardId) {
  const card=BJCP_CARDS.find(c=>c.id===cardId); if (!card) return;
  const texts={
    impression: card.overallImpression||'',
    aroma:      card.aroma||'',
    appearance: card.appearance||'',
    flavor:     (card.flavor||'')+(card.mouthfeel?`<br><br><strong>Sensació:</strong> ${card.mouthfeel}`:'')
  };
  const cont=el('dcont-'+cardId); if (cont) cont.innerHTML=texts[type]||'';
  evt.target.closest('.desc-tabs')?.querySelectorAll('.desc-tab').forEach(t=>t.classList.remove('active'));
  evt.target.classList.add('active');
}

function filterCards() { cardSearch=el('card-search')?.value||''; renderCurrentCardView(); }
function setFilter(btn, f) {
  cardFilter = f;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderCurrentCardView();
  // Show sent proposals when viewing possibles
  const wrap = el('team-guesses-wrap');
  if (wrap) wrap.style.display = f === 'possible' ? 'block' : 'none';
}

// ═══ GUESS ════════════════════════════════════════════════════════
function buildGuessOptions() {
  // Only show cards marked as 'possible' by the player; fallback to all visible if none marked
  const visible = getVisibleCards();
  const possible = visible.filter(c => (cardStates[c.id]||'normal') === 'possible');
  const list = possible.length > 0 ? possible : visible;
  const sel = el('guess-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Selecciona un estil —</option>' +
    list.map(c => `<option value="${c.id}">${c.name} (${c.number})</option>`).join('');
  if (possible.length === 0 && visible.length > 0) {
    sel.innerHTML = '<option value="" disabled>— Marca ⭐ possibles primer (o tria aquí) —</option>' +
      visible.map(c => `<option value="${c.id}">${c.name} (${c.number})</option>`).join('');
  }
}

// Called from 🎯 button on a possible card
function proposeCard(cardId, cardName) {
  if (gameState?.cardsLocked) return showToast('⚠️ Esperant que el Master seleccioni la cervesa');
  if (gameState?.currentBeer?.revealed) return showToast('⚠️ La ronda ja ha acabat');
  // Check if already guessed
  const guesses = gameState?.currentBeer?.guesses || {};
  const myPending = Object.entries(guesses).find(
    ([,g]) => g.teamId === game.teamId && g.playerName === game.playerName && !g.judged
  );
  if (myPending) {
    return showToast('⚠️ Ja has fet una proposta. Usa ↩️ Desfer per canviar-la.');
  }
  // Confirm dialog
  showModal('🎯 Confirmar proposta', `
    <div style="text-align:center;padding:10px 0">
      <div style="font-size:2rem;margin-bottom:8px">🍺</div>
      <div class="muted" style="font-size:.75rem;margin-bottom:6px">Proposes que la cervesa és:</div>
      <div style="font-family:'Cormorant Garamond',serif;font-size:1.3rem;font-weight:700;color:var(--amber-l);margin-bottom:16px">${cardName}</div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" style="flex:1" onclick="closeModal()">Cancel·lar</button>
        <button class="btn btn-success btn-sm" style="flex:1" onclick="closeModal();submitGuessById('${cardId}','${cardName.replace(/'/g,"\'")}')">✅ Sí, proposo!</button>
      </div>
    </div>`);
}

async function submitGuessById(id, nm) {
  if (gameState?.cardsLocked) return showToast('⚠️ Esperant que el Master seleccioni la cervesa');
  if (gameState?.currentBeer?.revealed) return showToast('⚠️ La ronda ja ha acabat');
  try {
    await game.submitGuess(id, nm);
    showToast('✅ Proposta enviada!');
    renderTeamGuesses(gameState);
  } catch(e) {
    if (e.message.startsWith('ALREADY_GUESSED:')) {
      showToast('⚠️ Ja has enviat una proposta. Usa ↩️ Desfer per canviar-la.');
      renderTeamGuesses(gameState);
    } else { showToast('❌ '+e.message); }
  }
}

// submitGuess kept for compatibility — proposals now via proposeCard(id, name)
async function submitGuess() { /* no-op: use proposeCard() */ }

async function retractGuess(guessKey) {
  if (!confirm('Retirar la proposta?')) return;
  try {
    await game.retractGuess(guessKey);
    showToast('↩️ Proposta retirada');
  } catch(e) { showToast('❌ '+e.message); }
}

function renderTeamGuesses(s) {
  const container=el('team-guesses'); if (!container) return;
  const guesses = s?.currentBeer?.guesses || {};
  const resultsVisible = s?.currentBeer?.resultsVisible; // only true after master clicks "Revelar"
  const list = Object.entries(guesses).filter(([,g])=>g.teamId===game.teamId);
  const myPending = list.find(([,g])=>g.playerName===game.playerName&&!g.judged);

  // Only show wrap + content if there are actual guesses — no empty state
  const wrap = el('team-guesses-wrap');
  if (!list.length) {
    container.innerHTML = '';
    if (wrap) wrap.style.display = 'none';
    return;
  }

  container.innerHTML = list.map(([key,g]) => {
    const icon = resultsVisible
      ? (g.judged ? (g.correct?'✅':'❌') : '⏳')
      : (g.judged ? '🔍' : '⏳');
    const isMyPending = g.playerName===game.playerName && !g.judged;
    return `<div class="guess-row">
      <div style="flex:1"><div class="guess-who">${g.playerName}</div>
        <div class="guess-what">${icon} ${g.guess}</div>
      </div>
      ${isMyPending && !s.currentBeer?.revealed
        ? `<button class="btn btn-danger btn-sm" style="width:auto" onclick="retractGuess('${key}')">↩️ Desfer</button>`
        : ''}
    </div>`;
  }).join('');

  if (wrap && cardFilter === 'possible') wrap.style.display = 'block';
}

// ═══ MASTER VIEW ══════════════════════════════════════════════════
function initMasterView() {
  if (masterViewInited) return;
  masterViewInited = true;
  // If a beer is already active when master loads, hide "Iniciar ronda"
  if (gameState?.currentBeer && !gameState.currentBeer.revealed) {
    const sb = el('btn-set-beer'); if (sb) sb.style.display = 'none';
    const hint = el('round-active-hint'); if (hint) hint.style.display = 'block';
    // reveal-panel removed
  }
  renderMasterBeerGrid();
  game.gameRef.on('value', snap => {
    const s=snap.val(); if(!s) return;
    gameState=s; activeCardIds=s.activeCardIds||null;
    updateMasterView(s);
  });
  game.gameRef.child('messages').on('value', snap => renderMessages(snap.val(),'master'));
}

function renderMasterBeerGrid() {
  const g = el('beer-grid'); if (!g) return;
  const cards = getVisibleCards(); // respects activeCardIds filter
  g.innerHTML = cards.length
    ? cards.map(c =>
        `<div class="beer-item ${selectedBeer===c.id?'selected':''}" id="mbs-${c.id}" onclick="selectBeer('${c.id}')">
          <div class="bsn">${c.name}</div>
          <div class="bsnum">${c.number} · ${c.category}</div>
        </div>`).join('')
    : `<p class="muted" style="padding:14px;text-align:center;font-size:.8rem">Cap carta en joc. Configura el pool amb el botó "🎴 Cartes".</p>`;
}

function filterMasterBeers() {
  const q=el('master-search')?.value.toLowerCase()||'';
  getVisibleCards().forEach(c => {
    const e=el('mbs-'+c.id);
    if (e) e.style.display=(c.name.toLowerCase().includes(q)||c.category.toLowerCase().includes(q))?'':'none';
  });
}

function selectBeer(id) {
  selectedBeer=id;
  document.querySelectorAll('.beer-item').forEach(e=>e.classList.remove('selected'));
  el('mbs-'+id)?.classList.add('selected');
  el('btn-set-beer').disabled=false;
}

async function setCurrentBeer() {
  if (!selectedBeer) return;
  const card=BJCP_CARDS.find(c=>c.id===selectedBeer); if (!card) return;
  try {
    await game.setCurrentBeer(card);
    showToast('🍺 '+card.name+' seleccionada!');
  } catch(e) { showToast('❌ '+e.message); }
}

function renderRevealButtons(card) {
  const g=el('reveal-btns'); if (!g) return;
  const items=[];
  if (card.ibuMin!=null) items.push({k:'ibu',  lbl:'🌿 Revelar IBU',    v:`${card.ibuMin}–${card.ibuMax}`});
  if (card.abvMin!=null) items.push({k:'abv',  lbl:'🍺 Revelar ABV',    v:`${card.abvMin}–${card.abvMax}%`});
  if (card.srmMin!=null) items.push({k:'srm',  lbl:'🎨 Revelar Color',  v:`SRM ${card.srmMin}–${card.srmMax}`});
  items.push({k:'category', lbl:'📂 Revelar Categoria', v:`Categoria ${card.categoryNumber}`});
  g.innerHTML=items.map(r=>`<button class="btn btn-info btn-sm" onclick="doReveal('${r.k}','${r.v}')">${r.lbl}</button>`).join('');
}

function getOrigin(tags) {
  if (tags.includes('northamerica')||tags.includes('north-america')) return 'Nord-amèrica';
  if (tags.includes('western-europe'))  return 'Europa Occ.';
  if (tags.includes('eastern-europe'))  return 'Europa Or.';
  if (tags.includes('central-europe'))  return 'Europa Cent.';
  if (tags.includes('pacific'))         return 'Pacífic';
  if (tags.includes('british')||tags.includes('english')) return 'Gran Bretanya';
  return 'Internacional';
}

async function doReveal(k,v) {
  try { await game.revealInfo(k,v); showToast('👁️ Revelat: '+v); }
  catch(e) { showToast('❌ '+e.message); }
}

let _lastActiveCardIds = undefined;
function updateMasterView(s) {
  setEl('master-round', `Ronda ${s.currentRound||1}/${s.totalRounds||6}`);
  renderTeamScores(s);
  renderPendingItems(s);
  renderMasterGuesses(s);
  renderTeamsDetail(s);
  // Re-render beer grid if card pool changed
  const newIds = JSON.stringify(s.activeCardIds||null);
  if (newIds !== _lastActiveCardIds) {
    _lastActiveCardIds = newIds;
    activeCardIds = s.activeCardIds || null;
    renderMasterBeerGrid();
  }
  const poolInfo = s.activeCardIds ? `🎴 ${s.activeCardIds.length} cartes actives` : `🎴 Totes (${BJCP_CARDS.length}) les cartes`;
  setEl('pool-info', poolInfo);
}

function renderTeamScores(s) {
  const g=el('team-scores'); if (!g) return;
  g.innerHTML=Object.entries(s.teams||{}).map(([id,t])=>
    `<div class="score-box">
      <div class="score-name">${id}</div>
      <div class="score-pts">${t.points||0}</div>
      <div class="muted" style="font-size:.62rem">${Object.keys(t.players||{}).length}👤 · ${countTeamCards(t)}🃏</div>
    </div>`).join('')||'<p class="muted">Cap equip</p>';
}

function countTeamCards(team) {
  return Object.values(team.players||{}).reduce((s, p) => s+(p.actionCards||[]).length, 0);
}

// ── Pending items (yes/no + sensory) ────────────────────────────
function renderPendingItems(s) {
  const pq = s.currentBeer?.pendingQuestion;
  const pa = s.currentBeer?.pendingAction;
  const ynEl    = el('pending-yn-banner');
  const sensEl  = el('pending-sensory-banner');
  const infoEl  = el('pending-info-banner');

  // Yes/No question
  if (pq && !pq.answered) {
    if (ynEl) { ynEl.style.display='block'; setEl('pending-yn-text', `"${pq.playerName}" (${pq.teamId}) pregunta: "${pq.question}"`); }
  } else { if (ynEl) ynEl.style.display='none'; }

  // Sensory clue
  if (pa && pa.type==='sensory' && !pa.resolved) {
    if (sensEl) { sensEl.style.display='block'; setEl('pending-sensory-text', `"${pa.playerName}" (${pa.teamId}) demana Pista Sensorial`); }
  } else { if (sensEl) sensEl.style.display='none'; }

  // Info card (ibu/abv/srm/category) — master types the actual value
  const infoTypes = ['ibu','abv','srm','category'];
  if (pa && infoTypes.includes(pa.type) && !pa.resolved) {
    const labels = { ibu:'🌿 IBU', abv:'🍺 Alcohol (ABV)', srm:'🎨 Color (SRM)', category:'📂 Categoria' };
    const beer   = BJCP_CARDS.find(c => c.id === s.currentBeer?.id);
    const hint   = pa.mustLie ? '🤥 Dona una resposta FALSA (Carta Mentida activa)' : `Valor real: ${getRealValue(pa.type, beer)}`;
    if (infoEl) {
      infoEl.style.display='block';
      setEl('pending-info-title', `${labels[pa.type]||pa.type} — ${pa.playerName} (${pa.teamId})`);
      setEl('pending-info-hint', hint);
      // Set the input placeholder
      const inp = el('pending-info-input');
      if (inp) {
        inp.placeholder = pa.type==='ibu' ? 'Ex: 35' : pa.type==='abv' ? 'Ex: 8.5%' : pa.type==='srm' ? 'Ex: SRM 19' : 'Ex: 21';
        inp.dataset.infoType = pa.type;
      }
    }
  } else { if (infoEl) infoEl.style.display='none'; }
}

function getRealValue(type, beer) {
  if (!beer) return 'N/A';
  if (type==='ibu')      return beer.ibuMin!=null ? `${beer.ibuMin}–${beer.ibuMax} IBU` : 'N/A';
  if (type==='abv')      return beer.abvMin!=null ? `${beer.abvMin}–${beer.abvMax}%` : 'N/A';
  if (type==='srm')      return beer.srmMin!=null ? `SRM ${beer.srmMin}–${beer.srmMax}` : 'N/A';
  if (type==='category') return `Categoria ${beer.categoryNumber}`;
  return 'N/A';
}

async function sendInfoAnswer() {
  const inp  = el('pending-info-input');
  const val  = inp?.value.trim();
  const type = gameState?.currentBeer?.pendingAction?.type;
  if (!val) return showToast('⚠️ Escriu el valor');
  if (!type) return showToast('⚠️ No hi ha sol·licitud activa');
  try {
    await game.answerInfoCard(type, val);
    inp.value='';
    showToast('✅ Resposta enviada!');
  } catch(e) { showToast('❌ '+e.message); }
}

async function answerYesNo(ans) {
  try { await game.answerYesNo(ans); showToast(ans?'✅ Resposta: SÍ':'❌ Resposta: NO'); }
  catch(e) { showToast('❌ '+e.message); }
}

function openSensoryClue() {
  const pa = gameState?.currentBeer?.pendingAction;
  showModal('🌾 Pista Sensorial', `
    <p class="muted mb-12" style="font-size:.8rem">Envia una pista a ${pa?.playerName} (${pa?.teamId}) sobre ingredients, llevats, bacteris o envelliment.</p>
    <div class="ig"><label>La teva pista</label>
      <textarea id="sensory-text" rows="3" placeholder="Ex: Notes de vainilla i roure, fermentació amb llevat de blat belga…"></textarea></div>
    <button class="btn btn-primary" onclick="sendSensoryClue()">📨 Enviar Pista</button>`);
}

async function sendSensoryClue() {
  const clue = el('sensory-text')?.value.trim();
  if (!clue) return showToast('⚠️ Escriu la pista');
  closeModal();
  try { await game.sendSensoryClue(clue); showToast('🌾 Pista enviada!'); }
  catch(e) { showToast('❌ '+e.message); }
}

// ── Guesses ──────────────────────────────────────────────────────
function renderMasterGuesses(s) {
  const g=el('master-guesses'); if (!g) return;
  const beer = s.currentBeer;
  const entries=Object.entries(beer?.guesses||{});
  if (!entries.length) { g.innerHTML=emptyState('⏳','Esperant propostes…'); return; }
  const alreadyPts=beer?.roundPointsGiven;
  const allJudged = entries.every(([,gs])=>gs.judged);
  const revealed  = beer?.revealed;

  g.innerHTML=entries.map(([key,gs]) => {
    const correct=gs.guessId===beer?.id;
    const icon=gs.judged?(gs.correct?'✅':'❌'):'⏳';
    return `<div class="guess-row">
      <div style="flex:1">
        <div class="guess-who">${gs.teamId} · ${gs.playerName}</div>
        <div class="guess-what">${icon} ${gs.guess}</div>
      </div>
      ${!gs.judged?`<button class="btn btn-success btn-sm"
        onclick="openJudge('${key}','${gs.teamId}','${gs.playerName}','${gs.guessId}')">Jutjar</button>`:''}
    </div>`;
  }).join('');

  // Show reveal button once all judged and not yet revealed
  const revealBtn = el('btn-reveal-result');
  if (revealBtn) {
    revealBtn.style.display = (allJudged && !revealed) ? 'block' : 'none';
  }
  // Show "already revealed" hint
  const revealedHint = el('result-revealed-hint');
  if (revealedHint) revealedHint.style.display = revealed ? 'block' : 'none';
}

async function revealResult() {
  try { await game.revealResult(); showToast('📢 Resultat revelat a tots!'); }
  catch(e) { showToast('❌ '+e.message); }
}

function openJudge(key, teamId, playerName, guessId) {
  const correct    = guessId===gameState?.currentBeer?.id;
  const guessName  = BJCP_CARDS.find(c=>c.id===guessId)?.name||guessId;
  const alreadyPts = gameState?.currentBeer?.roundPointsGiven;

  // Points section: only for first correct guesser
  const ptsSection = correct && !alreadyPts ? `
    <p class="muted mb-8" style="font-size:.78rem">Punts a assignar:</p>
    <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:14px">
      ${[1,2,3].map(p=>`<button class="btn btn-primary btn-sm pts-btn" id="ptsb-${p}" onclick="selectPts(${p})">${p} pt${p>1?'s':''}</button>`).join('')}
    </div>` : (correct && alreadyPts ? `<p class="muted mb-12" style="font-size:.78rem">⚠️ Punts ja assignats (1er encert). Pots donar carta.</p>` : '');

  // Card section: available for ANY correct guess
  // Card grant always available for correct guess (even if points already given to another team)
  const cardSection = correct ? `
    <p class="muted mb-8" style="font-size:.78rem">Carta d'acció per donar a ${playerName}:</p>
    <select id="card-grant" style="width:100%;background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:9px;padding:11px;color:var(--text);font-family:'Syne',sans-serif;font-size:.85rem;margin-bottom:14px">
      <option value="">Cap carta</option>
      ${ACTION_CARD_TYPES.map(ac=>`<option value="${ac.id}">${ac.icon} ${ac.name}</option>`).join('')}
    </select>` : '';

  showModal(`🎯 Jutjar proposta de ${playerName}`, `
    <div class="judge-card ${correct?'judge-correct':'judge-wrong'}">
      <div class="muted" style="font-size:.7rem;margin-bottom:3px">Proposta de ${teamId}</div>
      <div style="font-weight:700">${guessName}</div>
      <div style="font-size:1.6rem;margin-top:6px">${correct?'✅ CORRECTA':'❌ INCORRECTA'}</div>
    </div>
    ${ptsSection}${cardSection}
    <button class="btn btn-primary" onclick="confirmJudge('${key}','${teamId}','${playerName}','${guessId}')">
      ✅ ${correct?'Confirmar':'Marcar incorrecta'}
    </button>`);
  window._judgePts = alreadyPts ? 0 : 3;
  if (!alreadyPts) setTimeout(()=>selectPts(3), 50);
}

function selectPts(p) {
  window._judgePts=p;
  document.querySelectorAll('.pts-btn').forEach(b=>b.style.opacity='.5');
  el('ptsb-'+p) && (el('ptsb-'+p).style.opacity='1');
}

async function confirmJudge(key, teamId, playerName, guessId) {
  const cardType = el('card-grant')?.value || '';
  closeModal();
  try {
    const { correct, pts } = await game.judgeGuess(key, teamId, playerName, guessId, cardType||null);
    const def = ACTION_CARD_TYPES.find(a => a.id === cardType);
    const ptsLabel = pts > 0 ? `+${pts}pt${pts>1?'s':''}` : pts < 0 ? `${pts}pt` : '0pts';
    showToast(correct
      ? `🎉 ${teamId} ${ptsLabel}!` + (cardType ? ` + ${def?.icon||'🃏'} ${def?.name||''}` : '')
      : pts < 0
        ? `❌ ${teamId} ${ptsLabel} (havia usat ajuda)`
        : '❌ Resposta incorrecta jutjada');
  } catch(e) { showToast('❌ '+e.message); }
}

async function nextRound() {
  try {
    await game.nextRound();
    selectedBeer=null;
    // reveal-panel removed
    document.querySelectorAll('.beer-item').forEach(e=>e.classList.remove('selected'));
    // Show "Iniciar ronda" again for the new round
    el('btn-set-beer').style.display = 'block';
    el('btn-set-beer').disabled = true;
    const hint = el('round-active-hint'); if (hint) hint.style.display = 'none';
    renderMasterBeerGrid();
    showToast('⏭️ Pròxima ronda!');
  } catch(e) { showToast('❌ '+e.message); }
}

// ── Teams detail ─────────────────────────────────────────────────
function renderTeamsDetail(s) {
  const g=el('teams-detail'); if (!g) return;
  // Sort teams by points descending
  const sorted = Object.entries(s.teams||{}).sort(([,a],[,b])=>(b.points||0)-(a.points||0));
  g.innerHTML = sorted.map(([tid,t], ti) => {
    const medal = ['🥇','🥈','🥉'][ti] || '';
    // Sort players by pts
    const players = Object.entries(t.players||{}).sort(([,a],[,b])=>(b.points||0)-(a.points||0));
    return `<div class="card mb-10">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:1.3rem">${medal}</span>
          <div class="sec-title" style="margin:0">🍻 ${tid}</div>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <button onclick="adjustPoints('team','${tid}',null,-1)" style="background:rgba(139,32,32,.3);border:1px solid rgba(180,50,50,.4);border-radius:5px;width:24px;height:24px;color:#e07070;cursor:pointer;font-size:.9rem">−</button>
          <span style="font-family:'Cormorant Garamond',serif;font-size:1.4rem;color:var(--amber-l);min-width:32px;text-align:center">${t.points||0}pt</span>
          <button onclick="adjustPoints('team','${tid}',null,+1)" style="background:rgba(32,100,50,.3);border:1px solid rgba(50,160,80,.4);border-radius:5px;width:24px;height:24px;color:#6DBF7E;cursor:pointer;font-size:.9rem">+</button>
        </div>
      </div>
      ${players.map(([pName,p])=>`
        <div class="player-row" style="padding:7px 0;border-top:1px solid rgba(255,255,255,.05)">
          <div class="p-avatar">${pName[0].toUpperCase()}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:.88rem">${pName}</div>
            <div class="muted" style="font-size:.67rem">${p.correctGuesses||0} encerts · ${p.actionCardsReceived||0} cartes rebudes</div>
            ${(p.actionCards||[]).length ? `<div style="font-size:.63rem;margin-top:2px;color:var(--amber)">${(p.actionCards||[]).map(c=>{const d=ACTION_CARD_TYPES.find(a=>a.id===c.type)||{}; return `${d.icon||'🃏'} ${d.name||c.type}`;}).join(' · ')}</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:5px;flex-shrink:0">
            <button onclick="adjustPoints('player','${tid}','${pName}',-1)" style="background:rgba(139,32,32,.3);border:1px solid rgba(180,50,50,.4);border-radius:5px;width:22px;height:22px;color:#e07070;cursor:pointer;font-size:.8rem">−</button>
            <span style="font-family:'Cormorant Garamond',serif;font-size:1.1rem;color:var(--amber-l);min-width:28px;text-align:center">${p.points||0}</span>
            <button onclick="adjustPoints('player','${tid}','${pName}',+1)" style="background:rgba(32,100,50,.3);border:1px solid rgba(50,160,80,.4);border-radius:5px;width:22px;height:22px;color:#6DBF7E;cursor:pointer;font-size:.8rem">+</button>
          </div>
        </div>`).join('')}
    </div>`;
  }).join('') || emptyState('👥','Cap equip');
}

async function adjustPoints(type, teamId, playerName, delta) {
  try {
    const s    = gameState;
    const team = s?.teams?.[teamId];
    if (!team) return;
    const updates = {};
    if (type === 'team') {
      const cur = team.points || 0;
      updates[`teams/${teamId}/points`] = Math.max(0, cur + delta);
    } else {
      const p   = team.players?.[playerName] || {};
      const cur = p.points || 0;
      updates[`teams/${teamId}/players/${playerName}/points`] = Math.max(0, cur + delta);
      // Keep team total in sync
      const newTeamPts = Object.entries(team.players||{}).reduce((sum,[pn,pd])=>{
        return sum + (pn===playerName ? Math.max(0, (pd.points||0)+delta) : (pd.points||0));
      }, 0);
      updates[`teams/${teamId}/points`] = Math.max(0, newTeamPts);
    }
    await game.gameRef.update(updates);
  } catch(e) { showToast('❌ '+e.message); }
}


// ═══ MASTER LOG ═══════════════════════════════════════════════════
function renderMasterLog(s) {
  const g = el('master-log'); if (!g) return;
  if (!s) { g.innerHTML = emptyState('📋','Cap dada de partida'); return; }

  const teams = s.teams || {};
  const rounds = []; // collect all round snapshots from guesses history

  // Build round log from guesses (grouped by round — we use submittedAt order)
  const allGuesses = Object.values(s.currentBeer?.guesses || {});

  // We use messages to reconstruct history (card grants, info reveals, actions)
  const allMsgs = Object.values(s.messages || {}).sort((a,b)=>a.ts-b.ts);

  // ── Current round summary ──────────────────────────────────────
  const beer = s.currentBeer;
  let html = '';

  if (beer) {
    html += `<div class="card mb-10" style="border-color:var(--amber)">
      <div class="sec-title" style="margin-bottom:8px">🍺 Ronda actual — ${beer.name||'?'}</div>`;

    // Proposals
    const guesses = Object.values(beer.guesses||{}).sort((a,b)=>a.submittedAt-b.submittedAt);
    if (guesses.length) {
      html += `<div style="font-size:.75rem;font-weight:700;margin-bottom:5px;color:var(--amber)">📨 Propostes</div>`;
      html += guesses.map(g => {
        const icon = !g.judged ? '⏳' : g.correct ? '✅' : '❌';
        const pts  = g.judged ? ` (${g.points>=0?'+':''}${g.points}pt)` : '';
        return `<div style="font-size:.76rem;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)">
          ${icon} <strong>${g.playerName}</strong> <span class="muted">(${g.teamId})</span> → ${g.guess}${pts}</div>`;
      }).join('');
    }

    // Info revealed this round
    const revInfo = {...(beer.revealedInfo||{})};
    const teamInfos = beer.teamInfo || {};
    const allRevs = [];
    Object.entries(revInfo).forEach(([k,v])=>allRevs.push({k,v,who:'Tots'}));
    Object.entries(teamInfos).forEach(([tid,info])=>Object.entries(info).forEach(([k,v])=>allRevs.push({k,v,who:tid})));
    if (allRevs.length) {
      html += `<div style="font-size:.75rem;font-weight:700;margin:8px 0 5px;color:var(--amber)">👁️ Info revelada</div>`;
      html += allRevs.map(r=>`<div style="font-size:.74rem;padding:2px 0"><span class="muted">${r.who}:</span> ${r.k.toUpperCase()} = ${r.v}</div>`).join('');
    }
    html += `</div>`;
  }

  // ── Card activity log from messages ───────────────────────────
  const cardMsgs = allMsgs.filter(m => m.isCardGrant || m.isInfoReveal || m.isSystemAlert);
  if (cardMsgs.length) {
    html += `<div class="card mb-10">
      <div class="sec-title" style="margin-bottom:8px">📜 Activitat de cartes</div>`;
    html += cardMsgs.slice(-40).reverse().map(m => {
      const t  = new Date(m.ts).toLocaleTimeString('ca',{hour:'2-digit',minute:'2-digit'});
      const who = m.toPlayer ? `${m.toPlayer} (${m.toTeam})` : m.toTeam || 'Tots';
      return `<div style="font-size:.73rem;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)">
        <span class="muted" style="font-size:.66rem">${t}</span>
        <span style="margin-left:5px;color:var(--muted)">→ ${who}:</span>
        <span style="margin-left:4px">${m.text}</span></div>`;
    }).join('');
    html += `</div>`;
  }

  // ── Player card inventory ──────────────────────────────────────
  html += `<div class="card mb-10">
    <div class="sec-title" style="margin-bottom:8px">🃏 Inventari de cartes per jugador</div>`;
  Object.entries(teams).forEach(([tid, t]) => {
    Object.entries(t.players||{}).forEach(([pName, p]) => {
      const active = (p.actionCards||[]).map(c=>{const d=ACTION_CARD_TYPES.find(a=>a.id===c.type)||{}; return `${d.icon||'🃏'} ${d.name||c.type}`;});
      const used   = (p.usedCards||[]).map(c=>{const d=ACTION_CARD_TYPES.find(a=>a.id===c.type)||{}; return `${d.icon||'🃏'} ${d.name||c.type}`;});
      html += `<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)">
        <div style="font-size:.78rem;font-weight:700">${pName} <span class="muted" style="font-weight:400">(${tid})</span></div>
        <div style="font-size:.68rem;margin-top:2px">
          ${active.length ? `✅ Actives: ${active.join(', ')}` : '<span class="muted">Sense cartes actives</span>'}
        </div>
        ${used.length ? `<div style="font-size:.67rem;color:var(--muted)">Usades: ${used.join(', ')}</div>` : ''}
      </div>`;
    });
  });
  html += `</div>`;

  g.innerHTML = html || emptyState('📋','Sense activitat encara');
}
// ═══ MESSAGING ════════════════════════════════════════════════════
function openSendMessage() {
  const teams=Object.keys(gameState?.teams||{});
  const players=[];
  Object.entries(gameState?.teams||{}).forEach(([tid,t])=>Object.keys(t.players||{}).forEach(pn=>players.push({name:pn,team:tid})));
  showModal('📩 Enviar Missatge', `
    <div class="ig"><label>Destinatari</label>
      <select id="msg-to">
        <option value="all|null">📢 Tots</option>
        ${teams.map(t=>`<option value="${t}|null">🍻 Equip: ${t}</option>`).join('')}
        ${players.map(p=>`<option value="${p.team}|${p.name}">👤 ${p.name} (${p.team})</option>`).join('')}
      </select></div>
    <div class="ig"><label>Missatge</label>
      <textarea id="msg-text" rows="3" placeholder="Escriu el missatge…"></textarea></div>
    <button class="btn btn-primary" onclick="sendMsg()">📨 Enviar</button>`);
}

async function sendMsg() {
  const [toT,toP]=(el('msg-to')?.value||'all|null').split('|');
  const txt=el('msg-text')?.value.trim();
  if (!txt) return showToast('⚠️ Missatge buit');
  closeModal();
  await game.sendMessage(toT==='all'?null:toT, toP==='null'?null:toP, txt);
  showToast('✅ Enviat!');
}

let _lastMsgTs = 0;

function showMsgPopup(text, icon) {
  const existing = el('msg-popup');
  if (existing) existing.remove();
  const d = document.createElement('div');
  d.id = 'msg-popup';
  d.style.cssText = 'position:fixed;bottom:80px;left:12px;right:12px;z-index:9999;' +
    'background:linear-gradient(135deg,rgba(23,19,12,.98),rgba(15,12,8,.99));' +
    'border:1px solid var(--amber);border-radius:13px;padding:14px 16px;' +
    'box-shadow:0 8px 40px rgba(0,0,0,.8),0 0 20px rgba(200,130,26,.2);' +
    'animation:slideUp .25s ease;display:flex;align-items:flex-start;gap:10px;max-width:480px;margin:0 auto;';
  d.innerHTML =
    '<span style="font-size:1.3rem;flex-shrink:0">'+(icon||'📢')+'</span>' +
    '<div style="flex:1;font-size:.82rem;line-height:1.5;color:var(--text)">'+text+'</div>' +
    '<button onclick="this.parentElement.remove()" style="background:none;border:none;' +
    'color:var(--muted);font-size:1.1rem;cursor:pointer;flex-shrink:0;padding:0 0 0 8px;line-height:1">✕</button>';
  document.body.appendChild(d);
}

function renderMessages(msgs, viewRole) {
  const cId=viewRole==='master'?'master-msgs':'team-msgs';
  const g=el(cId); if (!g) return;
  const list=Object.values(msgs||{}).sort((a,b)=>a.ts-b.ts);

  // Master sees ALL messages; team sees only theirs
  const filtered = viewRole==='master' ? list : list.filter(m => {
    if (m.forMasterOnly) return false;
    if (m.pendingReveal) return false;
    if (m.deliverNextRound) return false;
    if (!m.toTeam||m.toTeam==='all') return true;
    if (m.toTeam===game.teamId&&(!m.toPlayer||m.toPlayer===game.playerName)) return true;
    return false;
  });

  // Popup for new messages (team only)
  if (viewRole !== 'master' && filtered.length > 0) {
    const newest = filtered[filtered.length - 1];
    if (newest.ts > _lastMsgTs) {
      _lastMsgTs = newest.ts;
      const icon = newest.isCardGrant ? '🃏' : newest.isInfoReveal ? '🔍'
        : newest.isSystemAlert ? '⚠️' : newest.fromRole==='master' ? '👑' : '💬';
      showMsgPopup(newest.text, icon);
    }
  }

  // Master also sees wildcard + system alerts
  const masterFiltered = viewRole==='master' ? list : filtered;

  g.innerHTML = filtered.length
    ? filtered.map(m => {
        const t=new Date(m.ts).toLocaleTimeString('ca',{hour:'2-digit',minute:'2-digit'});
        const to=m.toPlayer?`→ ${m.toPlayer}`:m.toTeam&&m.toTeam!=='all'?`→ ${m.toTeam}`:'→ Tots';
        const isSystem=m.fromRole==='system';
        const borderColor=isSystem?'var(--amber)':'rgba(255,255,255,.2)';
        return `<div class="msg-bubble" style="border-left-color:${borderColor}">
          <div style="display:flex;justify-content:space-between;margin-bottom:3px">
            <span class="msg-from">${isSystem?'🤖 Sistema':m.from} <span class="muted">${to}</span></span>
            <span class="muted" style="font-size:.65rem">${t}</span></div>
          <div style="font-size:.86rem">${m.text}</div>
        </div>`;
      }).join('')
    : emptyState('💬','Sense missatges');

  const activeNav=document.querySelector('.nav-btn.active')?.id||'';
  if (!activeNav.includes('message')) { unreadMsgs=filtered.length; updMsgBadge(); }
}

function updMsgBadge() {
  ['msg-badge','master-msg-badge'].forEach(id=>{
    const b=el(id); if (!b) return;
    b.style.display=unreadMsgs>0?'flex':'none';
    b.textContent=unreadMsgs>9?'!':String(unreadMsgs);
  });
}

// ═══ RANKING ══════════════════════════════════════════════════════
function updateRanking(s, teamEId, playerEId) {
  const teams=s.teams||{};
  const tEl=el(teamEId);
  if (tEl) {
    const sorted=Object.entries(teams).map(([id,t])=>({id,pts:t.points||0,n:Object.keys(t.players||{}).length})).sort((a,b)=>b.pts-a.pts);
    tEl.innerHTML=sorted.map((t,i)=>`<div class="rank-row">
      <div class="rank-pos ${['first','second','third'][i]||''}">${['🥇','🥈','🥉'][i]||i+1}</div>
      <div class="rank-info"><div class="rank-name">${t.id}</div><div class="muted rank-sub">${t.n} jugadors</div></div>
      <div class="rank-pts">${t.pts}</div></div>`).join('')||emptyState('🏆','Cap equip');
  }
  const pEl=el(playerEId);
  if (pEl) {
    let all=[];
    Object.entries(teams).forEach(([tid,t])=>Object.values(t.players||{}).forEach(p=>all.push({...p,team:tid})));
    all.sort((a,b)=>(b.points||0)-(a.points||0));
    pEl.innerHTML=all.map((p,i)=>`<div class="rank-row">
      <div class="rank-pos ${['first','second','third'][i]||''}">${['🥇','🥈','🥉'][i]||i+1}</div>
      <div class="rank-info"><div class="rank-name">${p.name}</div>
        <div class="muted rank-sub">${p.team} · ${p.correctGuesses||0} encerts · ${p.actionCardsReceived||0}🃏</div></div>
      <div class="rank-pts">${p.points||0}</div></div>`).join('')||emptyState('👤','Cap jugador');
  }
}

function renderFinalRanking(s) { updateRanking(s,'final-team-ranking','final-player-ranking'); }

// ── Player settings / logout ─────────────────────────────────────
function showPlayerSettings() {
  showModal('⚙️ Opcions', `
    <div class="settings-row"><span class="muted">Nom</span><strong>${game.playerName||'—'}</strong></div>
    <div class="settings-row"><span class="muted">Equip</span><strong>${game.teamId||'—'}</strong></div>
    <div class="settings-row"><span class="muted">Partida</span><strong>${game.gameCode||'—'}</strong></div>
    <button class="btn btn-secondary mt-12" onclick="game.clearSession();location.reload()">🚪 Sortir de la partida</button>
    <p class="muted mt-8" style="font-size:.7rem;text-align:center">Podràs tornar a entrar amb el mateix codi</p>`);
}

// ═══ INIT ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // Show version
  const vEl = el('app-version');
  if (vEl) vEl.textContent = APP_VERSION;
  const restored = await tryRestoreSession();
  if (!restored) showScreen('screen-welcome');
});
