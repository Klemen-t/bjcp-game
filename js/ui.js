// ═══════════════════════════════════════════════════════════════
//  UI.JS  —  Interface & interaction logic
// ═══════════════════════════════════════════════════════════════

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

// ═══ CREATE ═══════════════════════════════════════════════════════
// Password hash (SHA-256 of 'merderada' as hex) – computed at build time
// sha256('merderada') = computed below at runtime once
const MASTER_PW_HASH = 'a7b3c4f9e2d1a6e8c5f0b2d4a9e7c3f1b8d6a2e5c0f4b1d7a3e9c2f6b0d8a4e1'; // placeholder, replaced at runtime

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
  ['round','ranking','teams','messages'].forEach(t => {
    el('mtab-'+t) && (el('mtab-'+t).style.display = t===tab?'block':'none');
    el('mnav-'+t)?.classList.toggle('active', t===tab);
  });
  if (tab==='messages') { unreadMsgs=0; updMsgBadge(); }
}

// ═══ TEAM VIEW ════════════════════════════════════════════════════
function initTeamView(s) {
  if (teamViewInited) return;
  teamViewInited = true;
  buildGuessOptions();
  game.gameRef.child('messages').on('value', snap => renderMessages(snap.val(), 'team'));
}

function updateTeamView(s) {
  if (!s) return;
  const myTeam  = s.teams?.[game.teamId]||{};
  const myPlayer = myTeam.players?.[game.playerName]||{};
  const myCards  = myPlayer.actionCards || [];  // array of {id, type}
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
  renderBeerCards();
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

  // Find all winners (correct guesses with pts > 0)
  const winners = guesses.filter(g => g.correct && (g.points||0) > 0);
  const myGuess = guesses.find(g => g.playerName === game.playerName && g.teamId === game.teamId);
  const myTeamWinners = winners.filter(g => g.teamId === game.teamId);
  const iWon    = myGuess?.correct && (myGuess?.points||0) > 0;
  const myTeamWon = myTeamWinners.length > 0;
  const rivalWon  = winners.some(g => g.teamId !== game.teamId);

  // State logic:
  // GREEN  = my team won (regardless of rivals) AND I personally won
  // YELLOW = my team won but I didn't, OR I won but a rival also won (split)
  // RED    = my team lost (no correct guess) or only rivals won

  let state, emoji, title;
  if (iWon && myTeamWon && !rivalWon) {
    // Pure win: my team correct, no rival won
    state = 'result-win'; emoji = '🥳';
    const pts = myGuess?.points || 0;
    title = `Has encertat! +${pts}pt${pts!==1?'s':''}`;
  } else if (myTeamWon && !iWon && !rivalWon) {
    // Teammate won, I didn't guess or was wrong
    state = 'result-team'; emoji = '🎉';
    const w = myTeamWinners[0];
    title = `${w.playerName} del teu equip ha encertat!`;
  } else if (iWon && rivalWon) {
    // I won but rival also won → yellow (split round)
    state = 'result-team'; emoji = '🤝';
    const pts = myGuess?.points || 0;
    title = `Has encertat! (+${pts}pt) — però un rival també!`;
  } else if (myTeamWon && rivalWon) {
    // Team won but rival also won
    state = 'result-team'; emoji = '🤝';
    title = `El teu equip ha encertat, però un rival també!`;
  } else if (!myTeamWon && !rivalWon) {
    // Nobody won
    state = 'result-lose'; emoji = '😶';
    title = 'Ningú ha encertat aquesta ronda';
  } else {
    // Rival won, my team didn't
    state = 'result-lose'; emoji = '😔';
    const rival = winners.find(g => g.teamId !== game.teamId);
    title = `Ha guanyat ${rival?.playerName||'un rival'} (${rival?.teamId||''})`;
  }

  overlay.style.display = 'flex';
  overlay.className = 'result-overlay ' + state;
  setEl('res-emoji', emoji);
  setEl('res-title', title);
  setEl('res-beer', `🍺 ${beer?.name||'—'}`);
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
        // Open phone dialer
        setTimeout(() => { window.location.href = `tel:${result.dialPhone}`; }, 400);
      }
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

function getRevealStatus(card, info, teamInfo) {
  const combined = { ...info, ...teamInfo };
  const checks = [];
  if (combined.ibu) {
    const [a,b] = combined.ibu.split('–').map(Number);
    if (card.ibuMin!=null) checks.push(card.ibuMax>=a && card.ibuMin<=b);
  }
  if (combined.abv) {
    const [a,b] = combined.abv.replace('%','').split('–').map(Number);
    if (card.abvMin!=null) checks.push(card.abvMax>=a && card.abvMin<=b);
  }
  if (combined.srm) {
    const [a,b] = combined.srm.replace('SRM ','').split('–').map(Number);
    if (card.srmMin!=null) checks.push(card.srmMax>=a && card.srmMin<=b);
  }
  if (combined.category) {
    const num = combined.category.replace(/\D/g,'');
    checks.push(String(card.categoryNumber)===num);
  }
  if (!checks.length) return null;
  return checks.every(Boolean)?'match':checks.some(v=>v===false)?'nomatch':null;
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
    // Show cards marked possible by ME or any teammate
    const teamPossible = new Set(
      Object.values(gameState?.teams?.[game.teamId]?.players||{})
        .flatMap(p => Object.entries(p.cardStates||{}).filter(([,st])=>st==='possible').map(([id])=>id))
    );
    cards = cards.filter(c => teamPossible.has(c.id));
  } else if (cardFilter==='discarded') {
    // Show cards discarded by ME or any teammate
    const teamDiscarded = new Set(
      Object.values(gameState?.teams?.[game.teamId]?.players||{})
        .flatMap(p => Object.entries(p.cardStates||{}).filter(([,st])=>st==='discarded').map(([id])=>id))
    );
    cards = cards.filter(c => teamDiscarded.has(c.id));
  }
  // 'all' shows everything (default)

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

  let cls='beer-card', sty='';
  if (myState==='discarded') cls+=' discarded';
  else if (myState==='possible') cls+=' possible';
  else {
    if (revStatus==='match')   sty='border-color:#3D8B4E;box-shadow:0 0 14px rgba(61,139,78,.25)';
    if (revStatus==='nomatch') sty='border-color:#8B2020;opacity:.4';
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

function filterCards() { cardSearch=el('card-search')?.value||''; renderBeerCards(); }
function setFilter(btn, f) {
  cardFilter = f;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderBeerCards();
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
    el('reveal-panel').style.display='block';
    renderRevealButtons(card);
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
  updateRanking(s,'master-team-ranking','master-player-ranking');
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
    el('reveal-panel').style.display='none';
    document.querySelectorAll('.beer-item').forEach(e=>e.classList.remove('selected'));
    el('btn-set-beer').disabled=true;
    renderMasterBeerGrid(); // refresh with current card pool
    showToast('⏭️ Pròxima ronda!');
  } catch(e) { showToast('❌ '+e.message); }
}

// ── Teams detail ─────────────────────────────────────────────────
function renderTeamsDetail(s) {
  const g=el('teams-detail'); if (!g) return;
  g.innerHTML=Object.entries(s.teams||{}).map(([tid,t])=>{
    const players=Object.values(t.players||{});
    return `<div class="card mb-12">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div class="sec-title" style="margin:0">🍻 ${tid}</div>
        <div style="font-family:'Cormorant Garamond',serif;font-size:1.4rem;color:var(--amber-l)">${t.points||0}pt</div>
      </div>
      ${players.map(p=>`
        <div class="player-row">
          <div class="p-avatar">${p.name[0].toUpperCase()}</div>
          <div style="flex:1">
            <div style="font-weight:700">${p.name}</div>
            <div class="muted" style="font-size:.68rem">${p.correctGuesses||0} encerts · ${p.actionCardsReceived||0} cartes rebudes</div>
            ${(p.actionCards||[]).length?`<div style="font-size:.65rem;margin-top:3px">${(p.actionCards||[]).map(c=>{const d=ACTION_CARD_TYPES.find(a=>a.id===c.type)||{}; return `${d.icon||'🃏'} ${d.name||c.type}`;}).join(', ')}</div>`:''}
          </div>
          <div style="font-family:'Cormorant Garamond',serif;font-size:1.2rem;color:var(--amber-l)">${p.points||0}pt</div>
        </div>`).join('')}
    </div>`;
  }).join('')||emptyState('👥','Cap equip');
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

function renderMessages(msgs, viewRole) {
  const cId=viewRole==='master'?'master-msgs':'team-msgs';
  const g=el(cId); if (!g) return;
  const list=Object.values(msgs||{}).sort((a,b)=>a.ts-b.ts);

  // Master sees ALL messages; team sees only theirs
  const filtered = viewRole==='master' ? list : list.filter(m => {
    if (m.forMasterOnly) return false;
    if (m.pendingReveal) return false; // hidden until master reveals result
    if (!m.toTeam||m.toTeam==='all') return true;
    if (m.toTeam===game.teamId&&(!m.toPlayer||m.toPlayer===game.playerName)) return true;
    return false;
  });

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
  const restored = await tryRestoreSession();
  if (!restored) showScreen('screen-welcome');
});
