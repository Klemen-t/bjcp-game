// ═══════════════════════════════════════════════════════════════
//  UI.JS  —  Interface & interaction logic
// ═══════════════════════════════════════════════════════════════
const APP_VERSION = 'v2026.23 · 23/03/2026';

// ═══ THEME TOGGLE ════════════════════════════════════════════
function toggleTheme() {
  const isLight = document.body.classList.toggle('light-mode');
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = isLight ? '🌙' : '☀';
  try { localStorage.setItem('bjcp-theme', isLight ? 'light' : 'dark'); } catch(e){}
  // Redraw map with new background
  if (currentCardView === 'map') renderMapView();
}



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
// Map viewport: x and y in 0-100 poster space, with zoom/pan
const _mapVP = { x0:0, x1:100, y0:0, y1:100 };

const _CARD_COORDS = {"American Barleywine":[6,8],"English Barley Wine":[8,12],"Wheatwine":[10,8],"Wee Heavy":[5,22],"British Strong Ale":[11,22],"Old Ale":[18,16],"American Strong Ale":[16,8],"Scottish Light":[4,28],"Scottish Heavy":[4,32],"Scottish Export":[6,36],"Double IPA":[10,28],"American IPA":[14,34],"English IPA":[16,40],"Hazy IPA":[10,38],"Specialty IPA":[12,44],"American Pale Ale":[28,20],"British Golden Ale":[26,28],"Ordinary Bitter":[20,36],"Best Bitter":[22,42],"Strong Bitter":[16,46],"Australian Sparkling Ale":[30,34],"Blonde Ale":[38,16],"Cream Ale":[34,26],"American Wheat Beer":[44,12],"Dark Mild":[36,32],"Irish Red Ale":[32,40],"American Amber Ale":[44,22],"American Brown Ale":[42,28],"British Brown Ale":[40,34],"Historical Beer: London Brown Ale":[38,40],"English Porter":[20,50],"American Porter":[22,56],"Historical Beer: Pre-Prohibition Porter":[18,56],"Irish Stout":[8,54],"Irish Extra Stout":[8,58],"Foreign Extra Stout":[12,60],"American Stout":[22,62],"Imperial Stout":[8,68],"Sweet Stout":[18,68],"Oatmeal Stout":[10,76],"Tropical Stout":[14,72],"Baltic Porter":[6,80],"Historical Beer: Kentucky Common":[28,68],"California Common":[26,72],"Rauchbier":[30,82],"Classic Style Smoked Beer":[24,80],"Specialty Smoked Beer":[20,80],"Wood-Aged Beer":[16,84],"Specialty Wood-Aged Beer":[14,84],"Lambic":[60,22],"Gueuze":[68,18],"Fruit Lambic":[76,18],"Straight Sour Beer":[60,28],"Mixed-Fermentation Sour Beer":[62,32],"Brett Beer":[58,34],"Wild Specialty Beer":[64,28],"Witbier":[54,22],"Oud Bruin":[70,26],"Flanders Red Ale":[76,28],"Saison":[78,22],"Bière de Garde":[82,26],"Belgian Single":[80,34],"Belgian Pale Ale":[84,34],"Belgian Blond Ale":[82,40],"Belgian Dark Strong Ale":[82,50],"Belgian Golden Strong Ale":[88,44],"Belgian Tripel":[88,52],"Belgian Dubbel":[78,46],"Kolsch":[66,52],"Altbier":[60,52],"Historical Beer: Roggenbier":[66,58],"Weissbier":[80,58],"Dunkles Weissbier":[74,62],"Weizenbock":[70,66],"Berliner Weisse":[84,66],"Gose":[88,62],"Historical Beer: Lichtenhainer":[82,72],"Historical Beer: Piwo Grodziskie":[76,72],"Historical Beer: Sahti":[68,72],"German Pils":[42,80],"Czech Pale Lager":[48,82],"Czech Premium Pale Lager":[50,86],"Czech Amber Lager":[54,82],"Czech Dark Lager":[58,86],"American Lager":[26,78],"American Light Lager":[18,84],"Historical Beer: Pre-Prohibition Lager":[22,76],"German Leichtbier":[38,86],"International Pale Lager":[58,78],"International Amber Lager":[62,78],"International Dark Lager":[64,84],"Munich Helles":[76,82],"Festbier":[80,78],"German Helles Exportbier":[72,76],"Historical Beer: Kellerbier":[70,78],"Marzen":[80,84],"Vienna Lager":[74,88],"Munich Dunkel":[82,90],"Schwarzbier":[84,86],"Helles Bock":[76,72],"Dunkles Bock":[84,76],"Doppelbock":[90,80],"Eisbock":[92,84],"Fruit Beer":[48,42],"Specialty Fruit Beer":[50,46],"Fruit and Spice Beer":[52,42],"Spice, Herb, or Vegetable Beer":[52,48],"Specialty Spice Beer":[54,46],"Autumn Seasonal Beer":[48,52],"Winter Seasonal Beer":[44,52],"Grape Ale":[54,34],"Experimental Beer":[46,56],"Mixed-Style Beer":[48,58],"Commercial Specialty Beer":[50,60],"Alternative Grain Beer":[44,60],"Alternative Sugar Beer":[46,64]};

// BJCP num + category lookup
const _CARD_META = {"Altbier":["7B","Amber Bitter European Beer"],"Alternative Grain Beer":["31A","Alternative Fermentables Beer"],"Alternative Sugar Beer":["31B","Alternative Fermentables Beer"],"American Amber Ale":["19A","Amber And Brown American Beer"],"American Barleywine":["22C","Strong American Ale"],"American Brown Ale":["19C","Amber And Brown American Beer"],"American IPA":["21A","IPA"],"American Lager":["1B","Standard American Beer"],"American Light Lager":["1A","Standard American Beer"],"American Pale Ale":["18B","Pale American Ale"],"American Porter":["20A","American Porter And Stout"],"American Stout":["20B","American Porter And Stout"],"American Strong Ale":["22B","Strong American Ale"],"American Wheat Beer":["1D","Standard American Beer"],"Australian Sparkling Ale":["12B","Pale Commonwealth Beer"],"Autumn Seasonal Beer":["30B","Spiced Beer"],"Baltic Porter":["9C","Strong European Beer"],"Belgian Blond Ale":["25A","Strong Belgian Ale"],"Belgian Dark Strong Ale":["26D","Monastic Ale"],"Belgian Dubbel":["26B","Monastic Ale"],"Belgian Golden Strong Ale":["25C","Strong Belgian Ale"],"Belgian Pale Ale":["24B","Belgian Ale"],"Belgian Single":["26A","Monastic Ale"],"Belgian Tripel":["26C","Monastic Ale"],"Berliner Weisse":["23A","European Sour Ale"],"Best Bitter":["11B","British Bitter"],"Bière de Garde":["24C","Belgian Ale"],"Blonde Ale":["18A","Pale American Ale"],"Brett Beer":["28A","American Wild Ale"],"British Brown Ale":["13B","Brown British Beer"],"British Golden Ale":["12A","Pale Commonwealth Beer"],"British Strong Ale":["17A","Strong British Ale"],"California Common":["19B","Amber And Brown American Beer"],"Classic Style Smoked Beer":["32A","Smoked Beer"],"Commercial Specialty Beer":["34A","Specialty Beer"],"Cream Ale":["1C","Standard American Beer"],"Czech Amber Lager":["3C","Czech Lager"],"Czech Dark Lager":["3D","Czech Lager"],"Czech Pale Lager":["3A","Czech Lager"],"Czech Premium Pale Lager":["3B","Czech Lager"],"Dark Mild":["13A","Brown British Beer"],"Doppelbock":["9A","Strong European Beer"],"Double IPA":["22A","Strong American Ale"],"Dunkles Bock":["6C","Amber Malty European Lager"],"Dunkles Weissbier":["10B","German Wheat Beer"],"Eisbock":["9B","Strong European Beer"],"English Barley Wine":["17D","Strong British Ale"],"English IPA":["12C","Pale Commonwealth Beer"],"English Porter":["13C","Brown British Beer"],"Experimental Beer":["34C","Specialty Beer"],"Festbier":["4B","Pale Malty European Lager"],"Flanders Red Ale":["23B","European Sour Ale"],"Foreign Extra Stout":["16D","Dark British Beer"],"Fruit Beer":["29A","Fruit Beer"],"Fruit Lambic":["23F","European Sour Ale"],"Fruit and Spice Beer":["29B","Fruit Beer"],"German Helles Exportbier":["5C","Pale Bitter European Beer"],"German Leichtbier":["5A","Pale Bitter European Beer"],"German Pils":["5D","Pale Bitter European Beer"],"Gose":["23G","European Sour Ale"],"Grape Ale":["29D","Fruit Beer"],"Gueuze":["23E","European Sour Ale"],"Hazy IPA":["21C","IPA"],"Helles Bock":["4C","Pale Malty European Lager"],"Historical Beer: Kellerbier":["27A","Historical Beer"],"Historical Beer: Kentucky Common":["27B","Historical Beer"],"Historical Beer: Lichtenhainer":["27C","Historical Beer"],"Historical Beer: London Brown Ale":["27D","Historical Beer"],"Historical Beer: Piwo Grodziskie":["27E","Historical Beer"],"Historical Beer: Pre-Prohibition Lager":["27F","Historical Beer"],"Historical Beer: Pre-Prohibition Porter":["27G","Historical Beer"],"Historical Beer: Roggenbier":["27H","Historical Beer"],"Historical Beer: Sahti":["27I","Historical Beer"],"Imperial Stout":["20C","American Porter And Stout"],"International Amber Lager":["2B","International Lager"],"International Dark Lager":["2C","International Lager"],"International Pale Lager":["2A","International Lager"],"Irish Extra Stout":["15C","Irish Beer"],"Irish Red Ale":["15A","Irish Beer"],"Irish Stout":["15B","Irish Beer"],"Kolsch":["5B","Pale Bitter European Beer"],"Lambic":["23D","European Sour Ale"],"Marzen":["6A","Amber Malty European Lager"],"Mixed-Fermentation Sour Beer":["28B","American Wild Ale"],"Mixed-Style Beer":["34B","Specialty Beer"],"Munich Dunkel":["8A","Dark European Lager"],"Munich Helles":["4A","Pale Malty European Lager"],"Oatmeal Stout":["16B","Dark British Beer"],"Old Ale":["17B","Strong British Ale"],"Ordinary Bitter":["11A","British Bitter"],"Oud Bruin":["23C","European Sour Ale"],"Rauchbier":["6B","Amber Malty European Lager"],"Saison":["25B","Strong Belgian Ale"],"Schwarzbier":["8B","Dark European Lager"],"Scottish Export":["14C","Scottish Ale"],"Scottish Heavy":["14B","Scottish Ale"],"Scottish Light":["14A","Scottish Ale"],"Specialty Fruit Beer":["29C","Fruit Beer"],"Specialty IPA":["21B","IPA"],"Specialty Smoked Beer":["32B","Smoked Beer"],"Specialty Spice Beer":["30D","Spiced Beer"],"Specialty Wood-Aged Beer":["33B","Wood Beer"],"Spice, Herb, or Vegetable Beer":["30A","Spiced Beer"],"Straight Sour Beer":["28D","American Wild Ale"],"Strong Bitter":["11C","British Bitter"],"Sweet Stout":["16A","Dark British Beer"],"Tropical Stout":["16C","Dark British Beer"],"Vienna Lager":["7A","Amber Bitter European Beer"],"Wee Heavy":["17C","Strong British Ale"],"Weissbier":["10A","German Wheat Beer"],"Weizenbock":["10C","German Wheat Beer"],"Wheatwine":["22D","Strong American Ale"],"Wild Specialty Beer":["28C","American Wild Ale"],"Winter Seasonal Beer":["30C","Spiced Beer"],"Witbier":["24A","Belgian Ale"],"Wood-Aged Beer":["33A","Wood Beer"]};

// Cluster definitions: index → {fill, dot, name}
const _MAP_CL = {
  0:{fill:'rgba(91,157,74,.11)',  dot:'#5b9d4a', name:'Ale'},
  1:{fill:'rgba(74,127,193,.11)', dot:'#4a7fc1', name:'Lager'},
  2:{fill:'rgba(193,122,58,.11)', dot:'#c17a3a', name:'Belga / Sour'},
  3:{fill:'rgba(143,91,181,.11)', dot:'#8f5bb5', name:'Weizen / Ale alemanya'},
  4:{fill:'rgba(193,74,74,.12)',  dot:'#c14a4a', name:'Stout / Porter'},
  5:{fill:'rgba(106,171,181,.11)',dot:'#6aabb5', name:'Lager alemanya'},
  6:{fill:'rgba(136,136,136,.09)',dot:'#888',    name:'Especialitats'},
};

// Card positions with cluster assignment: [name, x, y, cluster]
const _MAP_CARDS = [
  ["American Barleywine",6,8,0],["English Barley Wine",8,12,0],["Wheatwine",10,8,0],
  ["Wee Heavy",5,22,0],["British Strong Ale",11,22,0],["Old Ale",18,16,0],
  ["American Strong Ale",16,8,0],["Scottish Light",4,28,0],["Scottish Heavy",4,32,0],
  ["Scottish Export",6,36,0],["Double IPA",10,28,0],["American IPA",14,34,0],
  ["English IPA",16,40,0],["Hazy IPA",10,38,0],["Specialty IPA",12,44,0],
  ["American Pale Ale",28,20,0],["British Golden Ale",26,28,0],
  ["Ordinary Bitter",20,36,0],["Best Bitter",22,42,0],["Strong Bitter",16,46,0],
  ["Australian Sparkling Ale",30,34,0],["Blonde Ale",38,16,0],["Cream Ale",34,26,0],
  ["American Wheat Beer",44,12,0],["Dark Mild",36,32,0],["Irish Red Ale",32,40,0],
  ["American Amber Ale",44,22,0],["American Brown Ale",42,28,0],
  ["British Brown Ale",40,34,0],["Historical Beer: London Brown Ale",38,40,0],
  ["English Porter",20,50,4],["American Porter",22,56,4],
  ["Historical Beer: Pre-Prohibition Porter",18,56,4],
  ["Irish Stout",8,54,4],["Irish Extra Stout",8,58,4],
  ["Foreign Extra Stout",12,60,4],["American Stout",22,62,4],
  ["Imperial Stout",8,68,4],["Sweet Stout",18,68,4],
  ["Oatmeal Stout",10,76,4],["Tropical Stout",14,72,4],["Baltic Porter",6,80,4],
  ["Historical Beer: Kentucky Common",28,68,0],["California Common",26,72,0],
  ["Rauchbier",30,82,6],["Classic Style Smoked Beer",24,80,6],
  ["Specialty Smoked Beer",20,80,6],["Wood-Aged Beer",16,84,6],
  ["Specialty Wood-Aged Beer",14,84,6],
  ["Lambic",60,22,2],["Gueuze",68,18,2],["Fruit Lambic",76,18,2],
  ["Straight Sour Beer",60,28,2],["Mixed-Fermentation Sour Beer",62,32,2],
  ["Brett Beer",58,34,2],["Wild Specialty Beer",64,28,2],
  ["Witbier",54,22,2],["Oud Bruin",70,26,2],["Flanders Red Ale",76,28,2],
  ["Saison",78,22,2],["Bière de Garde",82,26,2],
  ["Belgian Single",80,34,2],["Belgian Pale Ale",84,34,2],
  ["Belgian Blond Ale",82,40,2],["Belgian Dark Strong Ale",82,50,2],
  ["Belgian Golden Strong Ale",88,44,2],["Belgian Tripel",88,52,2],
  ["Belgian Dubbel",78,46,2],
  ["Kolsch",66,52,3],["Altbier",60,52,3],
  ["Historical Beer: Roggenbier",66,58,3],
  ["Weissbier",80,58,3],["Dunkles Weissbier",74,62,3],
  ["Weizenbock",70,66,3],["Berliner Weisse",84,66,3],["Gose",88,62,3],
  ["Historical Beer: Lichtenhainer",82,72,3],
  ["Historical Beer: Piwo Grodziskie",76,72,3],["Historical Beer: Sahti",68,72,3],
  ["German Pils",42,80,1],["Czech Pale Lager",48,82,1],
  ["Czech Premium Pale Lager",50,86,1],["Czech Amber Lager",54,82,1],
  ["Czech Dark Lager",58,86,1],["American Lager",26,78,1],
  ["American Light Lager",18,84,1],
  ["Historical Beer: Pre-Prohibition Lager",22,76,1],
  ["German Leichtbier",38,86,1],["International Pale Lager",58,78,1],
  ["International Amber Lager",62,78,1],["International Dark Lager",64,84,1],
  ["Munich Helles",76,82,5],["Festbier",80,78,5],
  ["German Helles Exportbier",72,76,5],["Historical Beer: Kellerbier",70,78,5],
  ["Marzen",80,84,5],["Vienna Lager",74,88,5],["Munich Dunkel",82,90,5],
  ["Schwarzbier",84,86,5],["Helles Bock",76,72,5],["Dunkles Bock",84,76,5],
  ["Doppelbock",90,80,5],["Eisbock",92,84,5],
  ["Fruit Beer",48,42,6],["Specialty Fruit Beer",50,46,6],
  ["Fruit and Spice Beer",52,42,6],["Spice, Herb, or Vegetable Beer",52,48,6],
  ["Specialty Spice Beer",54,46,6],["Autumn Seasonal Beer",48,52,6],
  ["Winter Seasonal Beer",44,52,6],["Grape Ale",54,34,6],
  ["Experimental Beer",46,56,6],["Mixed-Style Beer",48,58,6],
  ["Commercial Specialty Beer",50,60,6],
  ["Alternative Grain Beer",44,60,6],["Alternative Sugar Beer",46,64,6],
];
const _MAP_IDX = {};
_MAP_CARDS.forEach(([n],i) => _MAP_IDX[n] = i);

// Zone polygons
const _MAP_ZONES = [
  {cl:0, pts:[[0,0],[50,0],[50,65],[35,65],[30,50],[0,50]]},
  {cl:1, pts:[[0,65],[70,65],[70,75],[35,75],[35,100],[0,100]]},
  {cl:5, pts:[[70,65],[100,65],[100,100],[35,100],[35,75],[70,75]]},
  {cl:2, pts:[[50,0],[100,0],[100,60],[65,60],[65,65],[50,65]]},
  {cl:3, pts:[[65,45],[100,45],[100,75],[65,75]]},
  {cl:4, pts:[[0,45],[30,45],[30,85],[0,85]]},
  {cl:6, pts:[[35,35],[65,35],[65,68],[35,68]]},
];

// Cluster labels
const _MAP_LBLS = [
  {x:22,y:18,cl:0,t:'ALE'},       {x:16,y:88,cl:1,t:'LAGER'},
  {x:76,y:8, cl:2,t:'BELGA / SOUR'},{x:82,y:55,cl:3,t:'WEIZEN'},
  {x:10,y:60,cl:4,t:'STOUT'},     {x:83,y:85,cl:5,t:'LAGER ALEMANYA'},
  {x:50,y:50,cl:6,t:'ESPECIAL.'},
];

// Subestil connections [a, b]
const _MAP_LINKS = [
  ["English Barley Wine","Old Ale"],["American Barleywine","English Barley Wine"],
  ["Wheatwine","American Barleywine"],["British Strong Ale","Old Ale"],
  ["Wee Heavy","Scottish Export"],["Scottish Light","Scottish Heavy"],
  ["Scottish Heavy","Scottish Export"],["American IPA","Double IPA"],
  ["American IPA","Hazy IPA"],["English IPA","American IPA"],
  ["Specialty IPA","American IPA"],["Ordinary Bitter","Best Bitter"],
  ["Best Bitter","Strong Bitter"],["American Pale Ale","American IPA"],
  ["British Golden Ale","Best Bitter"],["American Amber Ale","American Pale Ale"],
  ["American Brown Ale","American Amber Ale"],["British Brown Ale","Dark Mild"],
  ["Historical Beer: London Brown Ale","British Brown Ale"],
  ["Dark Mild","Irish Red Ale"],["Irish Red Ale","American Amber Ale"],
  ["English Porter","American Porter"],
  ["Historical Beer: Pre-Prohibition Porter","American Porter"],
  ["Baltic Porter","English Porter"],["American Porter","American Stout"],
  ["Irish Stout","Irish Extra Stout"],["Irish Extra Stout","Foreign Extra Stout"],
  ["Irish Stout","American Stout"],["American Stout","Imperial Stout"],
  ["Sweet Stout","Oatmeal Stout"],["Sweet Stout","Tropical Stout"],
  ["Irish Stout","Sweet Stout"],["California Common","Cream Ale"],
  ["Classic Style Smoked Beer","Rauchbier"],
  ["Specialty Smoked Beer","Classic Style Smoked Beer"],
  ["Wood-Aged Beer","Specialty Wood-Aged Beer"],
  ["Lambic","Gueuze"],["Lambic","Fruit Lambic"],
  ["Straight Sour Beer","Lambic"],
  ["Mixed-Fermentation Sour Beer","Straight Sour Beer"],
  ["Brett Beer","Mixed-Fermentation Sour Beer"],
  ["Wild Specialty Beer","Brett Beer"],
  ["Belgian Single","Belgian Blond Ale"],["Belgian Pale Ale","Belgian Single"],
  ["Belgian Blond Ale","Belgian Golden Strong Ale"],
  ["Belgian Dubbel","Belgian Tripel"],
  ["Belgian Tripel","Belgian Golden Strong Ale"],
  ["Belgian Dark Strong Ale","Belgian Dubbel"],
  ["Oud Bruin","Flanders Red Ale"],["Saison","Bière de Garde"],
  ["Kolsch","Altbier"],
  ["Weissbier","Dunkles Weissbier"],["Dunkles Weissbier","Weizenbock"],
  ["Berliner Weisse","Gose"],
  ["Historical Beer: Lichtenhainer","Berliner Weisse"],
  ["Historical Beer: Piwo Grodziskie","Berliner Weisse"],
  ["Czech Pale Lager","Czech Premium Pale Lager"],
  ["Czech Premium Pale Lager","Czech Amber Lager"],
  ["Czech Amber Lager","Czech Dark Lager"],
  ["German Pils","Czech Premium Pale Lager"],
  ["German Leichtbier","German Pils"],
  ["American Light Lager","American Lager"],
  ["American Lager","Historical Beer: Pre-Prohibition Lager"],
  ["International Pale Lager","American Lager"],
  ["International Amber Lager","International Pale Lager"],
  ["International Dark Lager","International Amber Lager"],
  ["Munich Helles","Festbier"],["Munich Helles","German Helles Exportbier"],
  ["Historical Beer: Kellerbier","Munich Helles"],
  ["Vienna Lager","Marzen"],["Munich Dunkel","Schwarzbier"],
  ["Munich Helles","Munich Dunkel"],["Helles Bock","Munich Helles"],
  ["Dunkles Bock","Helles Bock"],["Doppelbock","Dunkles Bock"],
  ["Eisbock","Doppelbock"],
];

function renderMapView() {
  const canvas = el('map-cv'); if (!canvas) return;
  const W = canvas.parentElement.clientWidth || 320;
  const H = Math.round(W * 0.88);
  canvas.width  = W * devicePixelRatio;
  canvas.height = H * devicePixelRatio;
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.scale(devicePixelRatio, devicePixelRatio);

  function toX(px) { return (px - _mapVP.x0) / (_mapVP.x1 - _mapVP.x0) * W; }
  function toY(py) { return (py - _mapVP.y0) / (_mapVP.y1 - _mapVP.y0) * H; }

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);

  // Zones
  _MAP_ZONES.forEach(z => {
    const pts = z.pts.map(([px,py]) => [toX(px), toY(py)]);
    ctx.beginPath();
    pts.forEach(([x,y],i) => i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y));
    ctx.closePath();
    ctx.fillStyle = _MAP_CL[z.cl].fill; ctx.fill();
    ctx.strokeStyle = _MAP_CL[z.cl].dot + '44';
    ctx.lineWidth = 0.75; ctx.setLineDash([3,4]); ctx.stroke(); ctx.setLineDash([]);
  });

  // ALE/LAGER divider
  const dy = toY(65);
  if (dy > 0 && dy < H) {
    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 1;
    ctx.setLineDash([5,6]);
    ctx.beginPath(); ctx.moveTo(0, dy); ctx.lineTo(W, dy); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Links (drawn before dots)
  const vpW = _mapVP.x1 - _mapVP.x0;
  const pos = {};
  _MAP_CARDS.forEach(([n,px,py]) => { pos[n] = [toX(px), toY(py)]; });

  _MAP_LINKS.forEach(([a, b]) => {
    const ai = _MAP_IDX[a], bi = _MAP_IDX[b];
    if (ai === undefined || bi === undefined) return;
    const [apx,apy] = _MAP_CARDS[ai].slice(1,3);
    const [bpx,bpy] = _MAP_CARDS[bi].slice(1,3);
    if (apx<_mapVP.x0-5||apx>_mapVP.x1+5||apy<_mapVP.y0-5||apy>_mapVP.y1+5) return;
    if (bpx<_mapVP.x0-5||bpx>_mapVP.x1+5||bpy<_mapVP.y0-5||bpy>_mapVP.y1+5) return;
    const [ax,ay] = pos[a], [bx,by] = pos[b];
    const clA = _MAP_CARDS[ai][3], clB = _MAP_CARDS[bi][3];
    ctx.beginPath(); ctx.moveTo(ax,ay); ctx.lineTo(bx,by);
    ctx.strokeStyle = clA===clB ? _MAP_CL[clA].dot+'55' : 'rgba(255,255,255,.18)';
    ctx.lineWidth = Math.max(0.5, 0.8*(100/vpW));
    ctx.stroke();
  });

  // Cluster labels
  _MAP_LBLS.forEach(lb => {
    const lx = toX(lb.x), ly = toY(lb.y);
    if (lx < -30 || lx > W+30 || ly < -20 || ly > H+20) return;
    const sz = Math.min(11, Math.max(7, Math.round(9*(100/vpW))));
    ctx.font = `500 ${sz}px Barlow Condensed,sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = _MAP_CL[lb.cl].dot + '99';
    ctx.fillText(lb.t, lx, ly);
  });

  // Get cards to show
  let cards = getVisibleCards();
  if (cardFilter === 'possible') {
    const tp = new Set(Object.values(gameState?.teams?.[game.teamId]?.players||{})
      .flatMap(p => Object.entries(p.cardStates||{}).filter(([,st])=>st==='possible').map(([id])=>id)));
    cards = cards.filter(c => tp.has(c.id));
  } else if (cardFilter === 'discarded') {
    const td = new Set(Object.values(gameState?.teams?.[game.teamId]?.players||{})
      .flatMap(p => Object.entries(p.cardStates||{}).filter(([,st])=>st==='discarded').map(([id])=>id)));
    cards = cards.filter(c => td.has(c.id));
  }
  if (cardSearch) {
    const q = cardSearch.toLowerCase();
    cards = cards.filter(c => c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q));
  }

  // Score + sort worst-first so best appear on top
  const scored = cards.map(c => ({ c, pct: explorerScoreCard(c) }));
  scored.sort((a, b) => a.pct - b.pct);

  _mapHits = [];

  scored.forEach(({c, pct}) => {
    const mc_entry = _MAP_CARDS.find(e => e[0] === c.name);
    if (!mc_entry) return;
    const [, px, py, cl] = mc_entry;
    if (px < _mapVP.x0-2 || px > _mapVP.x1+2 || py < _mapVP.y0-2 || py > _mapVP.y1+2) return;

    const cx = toX(px), cy = toY(py);
    const myState = cardStates[c.id] || 'normal';
    const isDisc  = myState === 'discarded';
    const isPoss  = myState === 'possible';
    const mc = matchClass(pct, isDisc);
    const scale = 100 / vpW;
    const r = Math.max(3, Math.min(5.5, 4.5 * scale));

    // Probability ring
    if (pct >= 0) {
      const rr = r + Math.max(2, 2.5*scale);
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, Math.PI*2);
      ctx.strokeStyle = mc.color;
      ctx.lineWidth = Math.max(1, 1.5*scale);
      ctx.globalAlpha = Math.max(0.25, pct/100);
      ctx.stroke(); ctx.globalAlpha = 1;
    }

    // Dot fill
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.fillStyle = isPoss ? 'rgba(200,150,10,.9)' : _MAP_CL[cl].dot;
    ctx.globalAlpha = isDisc ? 0.25 : !EF.active ? 0.82 : Math.max(0.3, pct<0 ? 0.6 : pct/100*0.9+0.1);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Possible: gold ring
    if (isPoss) {
      ctx.beginPath(); ctx.arc(cx, cy, r+2.5, 0, Math.PI*2);
      ctx.strokeStyle = '#E8C040'; ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.85; ctx.stroke(); ctx.globalAlpha = 1;
    }

    // BJCP number label when zoomed in
    if (vpW < 30) {
      const meta = _CARD_META[c.name];
      const lbl = meta ? meta[0] : c.number || '';
      const sz = Math.min(8, Math.round(7*scale));
      ctx.font = `500 ${sz}px Barlow Condensed,sans-serif`;
      ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.fillText(lbl, cx, cy - r - 2);
    }

    _mapHits.push({ c, pct, cx, cy, r: r+7, cl, state: myState });
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
      for (const h of _mapHits) { if(Math.hypot(mx-h.cx,my-h.cy)<=h.r){found=h;break;} }
      if (found && tt) {
        el('mtt-name').textContent = found.c.name;
        const _m = _CARD_META[found.c.name] || [found.c.number||'', found.c.category||''];
        const _mnum = el('mtt-num'); if(_mnum) _mnum.textContent = _m[0];
        el('mtt-cat').textContent  = _m[1];
        const _mfam = el('mtt-fam'); if(_mfam) _mfam.textContent = _MAP_CL[found.cl]?.name||'';
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
    // ── Helpers: pixel ↔ data coords ────────────────────────────
    function pxToData(px, py) {
      const cvW = canvas.offsetWidth;
      const cvH = canvas.offsetHeight;
      return {
        ibu: _mapVP.x0 + Math.max(0, Math.min(1, px / cvW)) * (_mapVP.x1 - _mapVP.x0),
        abv: _mapVP.y0 + Math.max(0, Math.min(1, py / cvH)) * (_mapVP.y1 - _mapVP.y0)
      };
    }

    function zoomAround(centerX, centerY, factor) {
      const xR0 = _mapVP.x1 - _mapVP.x0;
      const yR0 = _mapVP.y1 - _mapVP.y0;
      const xR1 = Math.min(102, Math.max(8,  xR0 / factor));
      const yR1 = Math.min(102, Math.max(8,  yR0 / factor));
      const fx = xR0 > 0 ? (centerX - _mapVP.x0) / xR0 : 0.5;
      const fy = yR0 > 0 ? (centerY - _mapVP.y0) / yR0 : 0.5;
      _mapVP.x0 = Math.max(-1,  Math.min(101 - xR1, centerX - fx * xR1));
      _mapVP.x1 = _mapVP.x0 + xR1;
      _mapVP.y0 = Math.max(-1,  Math.min(101 - yR1, centerY - fy * yR1));
      _mapVP.y1 = _mapVP.y0 + yR1;
      renderMapView();
    }

    // ── Touch state ───────────────────────────────────────────
    let _pinch0 = null;  // { dist, ibu, abv }  — set on 2-finger start
    let _pan0   = null;  // { startIbu, startAbv, vpSnap } — set on 1-finger start
    let _didGesture = false; // true if touchmove fired → suppress click

    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      _didGesture = false;
      const rect = canvas.getBoundingClientRect();
      if (e.touches.length === 2) {
        const t1 = e.touches[0], t2 = e.touches[1];
        const midX = (t1.clientX + t2.clientX) / 2 - rect.left;
        const midY = (t1.clientY + t2.clientY) / 2 - rect.top;
        const center = pxToData(midX, midY);
        _pinch0 = {
          dist:   Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
          ibu:    center.ibu,  // actually x in poster space
          abv:    center.abv,  // actually y in poster space
          vpSnap: { ..._mapVP },
        };
        _pan0 = null;
      } else if (e.touches.length === 1) {
        const d = pxToData(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
        _pan0 = { startIbu: d.ibu, startAbv: d.abv, vpSnap: { ..._mapVP } };
        _pinch0 = null;
      }
    }, {passive:false});

    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      _didGesture = true;
      const rect = canvas.getBoundingClientRect();

      if (e.touches.length === 2 && _pinch0) {
        const t1 = e.touches[0], t2 = e.touches[1];
        const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        if (_pinch0.dist < 1) return;
        // Use snapshot each time so zoom is stable (no drift)
        Object.assign(_mapVP, _pinch0.vpSnap);
        zoomAround(_pinch0.ibu, _pinch0.abv, dist / _pinch0.dist);

      } else if (e.touches.length === 1 && _pan0) {
        const cur  = pxToData(e.touches[0].clientX - rect.left, e.touches[0].clientY - rect.top);
        const snap = _pan0.vpSnap;
        const xR = snap.x1 - snap.x0;
        const yR = snap.y1 - snap.y0;
        const dx = _pan0.startIbu - cur.ibu;
        const dy = _pan0.startAbv - cur.abv;
        _mapVP.x0 = Math.max(-1,  Math.min(101 - xR, snap.x0 + dx));
        _mapVP.x1 = _mapVP.x0 + xR;
        _mapVP.y0 = Math.max(-1,  Math.min(101 - yR, snap.y0 + dy));
        _mapVP.y1 = _mapVP.y0 + yR;
        renderMapView();
      }
    }, {passive:false});

    canvas.addEventListener('touchend', e => {
      if (e.touches.length < 2) _pinch0 = null;
      if (e.touches.length === 0) _pan0 = null;
    });

    // Tap to open card (only if no gesture happened)
    let _lastTap = 0;
    canvas.addEventListener('touchend', e => {
      if (e.changedTouches.length !== 1) return;
      const now = Date.now();
      // Double-tap: reset zoom
      if (now - _lastTap < 350 && !_didGesture) {
        _mapVP.x0=0; _mapVP.x1=100; _mapVP.y0=0; _mapVP.y1=100;
        renderMapView();
        _lastTap = 0;
        return;
      }
      _lastTap = now;
      if (_didGesture) return; // gesture ended — don't open card
      // Single tap: find nearest bubble
      const rect = canvas.getBoundingClientRect();
      const t = e.changedTouches[0];
      const scaleX = canvas.width / devicePixelRatio / rect.width;
      const scaleY = canvas.height / devicePixelRatio / rect.height;
      const mx = (t.clientX - rect.left) * scaleX;
      const my = (t.clientY - rect.top)  * scaleY;
      for (const h of _mapHits) {
        if (Math.hypot(mx - h.cx, my - h.cy) <= h.r + 6) {
          showQuickCardModal(h.c); break;
        }
      }
    });

    // Click (desktop mouse — always safe, no gesture ambiguity)
    canvas.addEventListener('click', e => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / devicePixelRatio / rect.width;
      const scaleY = canvas.height / devicePixelRatio / rect.height;
      const mx = (e.clientX - rect.left) * scaleX;
      const my = (e.clientY - rect.top)  * scaleY;
      for (const h of _mapHits) {
        if (Math.hypot(mx - h.cx, my - h.cy) <= h.r + 4) {
          showQuickCardModal(h.c); break;
        }
      }
    });

    // Mouse wheel zoom (desktop)
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const d = pxToData(e.clientX - rect.left, e.clientY - rect.top);
      zoomAround(d.ibu, d.abv, e.deltaY < 0 ? 1.3 : 0.77);
    }, {passive:false});
  }
  function retry(){ const cv=el('map-cv'); if(cv) setupMapEvents(); else setTimeout(retry,500); }
  setTimeout(retry,300);
})();

// Quick card modal (shared by map tap + grid cell tap)
function showQuickCardModal(c) {
  const pct  = explorerScoreCard(c);
  const mc   = matchClass(pct, cardStates[c.id]==='discarded');
  const meta = _CARD_META[c.name] || [c.number||'', c.category||''];

  const abvTxt = c.abvMin!=null ? `${c.abvMin}–${c.abvMax}%` : '—';
  const ibuTxt = c.ibuMin!=null ? `${c.ibuMin}–${c.ibuMax}` : '—';
  const srmMid = c.srmMin!=null ? (c.srmMin+c.srmMax)/2 : null;
  const srmCol = srmMid ? srmToColor(srmMid) : '#444';
  const srmTxt = c.srmMin!=null ? `${c.srmMin}–${c.srmMax}` : '—';

  const pctBlock = pct>=0
    ? `<div style="background:var(--k3);padding:10px 8px;text-align:center">
         <div style="font-family:var(--fd);font-size:1.5rem;color:${mc.color};line-height:1;margin-bottom:2px">${pct}%</div>
         <div style="font-family:var(--fu);font-size:.58rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--m)">Coincid.</div>
       </div>`
    : '';

  showModal(`${meta[0]} — ${c.name}`, `
    <div style="font-family:var(--fu);font-size:.65rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--r);margin-bottom:12px">${meta[1]}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr${pct>=0?' 1fr':''};gap:6px">
      <div style="background:var(--k3);padding:9px 6px;text-align:center">
        <div style="font-family:var(--fd);font-size:1.05rem;color:var(--sl)">${abvTxt}</div>
        <div style="font-family:var(--fu);font-size:.56rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--m);margin-top:3px">ABV</div>
      </div>
      <div style="background:var(--k3);padding:9px 6px;text-align:center">
        <div style="font-family:var(--fd);font-size:1.05rem;color:var(--sl)">${ibuTxt}</div>
        <div style="font-family:var(--fu);font-size:.56rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--m);margin-top:3px">IBU</div>
      </div>
      <div style="background:var(--k3);padding:9px 6px;text-align:center">
        <div style="display:flex;align-items:center;justify-content:center;gap:4px">
          <div style="width:12px;height:12px;background:${srmCol};flex-shrink:0;border:1px solid rgba(255,255,255,.1)"></div>
          <span style="font-family:var(--fd);font-size:1.05rem;color:var(--sl)">${srmTxt}</span>
        </div>
        <div style="font-family:var(--fu);font-size:.56rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--m);margin-top:3px">SRM</div>
      </div>
      ${pctBlock}
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
      <span class="card-num">${card.number}</span>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:baseline;gap:6px;flex-wrap:wrap">
          <div class="card-name">${card.name}</div>
          ${EF.active && matchScore>=0 ? `<span class="match-pct-badge ${mc.badge}">${matchScore}%</span>` : ''}
        </div>
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
  // Restore saved theme
  try {
    const saved = localStorage.getItem('bjcp-theme');
    if (saved === 'light') {
      document.body.classList.add('light-mode');
      const btn = document.getElementById('theme-toggle');
      if (btn) btn.textContent = '🌙';
    }
  } catch(e){}
  // Show version
  const vEl = el('app-version');
  if (vEl) vEl.textContent = APP_VERSION;
  const restored = await tryRestoreSession();
  if (!restored) showScreen('screen-welcome');
});
