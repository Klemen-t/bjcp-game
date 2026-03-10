// ═══════════════════════════════════════════════════════════════
//  GAME.JS  —  Firebase logic & state management
// ═══════════════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCyjOE5Vde2bfJtbA-puVUa9V0_3Dfqgmc",
  authDomain: "bjcp-7d159.firebaseapp.com",
  databaseURL: "https://bjcp-7d159-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "bjcp-7d159",
  storageBucket: "bjcp-7d159.firebasestorage.app",
  messagingSenderId: "754125445664",
  appId: "1:754125445664:web:db5345a08428b8996bfa45"
};

// ── Action card definitions ─────────────────────────────────────
// Players DO see names & descriptions (they own them)
const ACTION_CARD_TYPES = [
  {
    id: 'yes_no',
    name: 'Sí o No',
    icon: '❓',
    desc: 'Envia una pregunta al Master. El Master respon "Sí" o "No".',
    playerAction: 'question' // player types question → master sees it and presses Sí/No
  },
  {
    id: 'lie',
    name: 'Carta Mentida',
    icon: '🤥',
    desc: 'Activa la mentida per a aquesta ronda. Si un equip rival demana info (IBU, ABV, color…), la app els donarà dades falses.',
    playerAction: 'activate' // just activate, app handles lies automatically
  },
  {
    id: 'cancel',
    name: 'Anul·lar Ajuda',
    icon: '🚫',
    desc: 'Activa l\'escut. Si un equip rival usa una carta d\'info (IBU, ABV…) durant aquesta ronda, la seva carta queda anul·lada i no reben res.',
    playerAction: 'activate'
  },
  {
    id: 'ibu',
    name: 'Info IBU',
    icon: '🌿',
    desc: 'Revela immediatament el rang d\'IBU de la cervesa d\'aquesta ronda.',
    playerAction: 'auto' // executes instantly, no master input needed
  },
  {
    id: 'abv',
    name: 'Info Alcohol',
    icon: '🍺',
    desc: 'Revela immediatament el grau d\'alcohol (ABV) de la cervesa.',
    playerAction: 'auto'
  },
  {
    id: 'srm',
    name: 'Info Color',
    icon: '🎨',
    desc: 'Revela immediatament el rang de color SRM de la cervesa.',
    playerAction: 'auto'
  },
  {
    id: 'category',
    name: 'Revelar Categoria',
    icon: '📂',
    desc: 'Revela immediatament el número de categoria (ex: 21), però no la lletra (A, B, C…).',
    playerAction: 'auto'
  },
  {
    id: 'sensory',
    name: 'Pista Sensorial',
    icon: '🌾',
    desc: 'El Master t\'envia una pista escrita sobre ingredients, llevats, bacteris o envelliment.',
    playerAction: 'request' // master types and sends the clue
  },
  {
    id: 'steal',
    name: 'Robar Carta',
    icon: '🦝',
    desc: 'Roba de forma aleatòria una carta d\'acció d\'un equip rival. Tots dos equips seran notificats.',
    playerAction: 'auto'
  },
  {
    id: 'eliminate',
    name: 'Descartar la Meitat',
    icon: '✂️',
    desc: 'La meitat de les teves cartes "possibles" que NO corresponen a la cervesa es marquen en vermell automàticament.',
    playerAction: 'auto'
  },
  {
    id: 'wildcard',
    name: 'Comodí Trucada',
    icon: '📞',
    desc: 'Sense efecte mecànic. El Master rebrà un avís per preparar una broma o sorpresa!',
    playerAction: 'auto'
  },
];

const SESSION_KEY = 'bjcp_session_v3';

// ═══════════════════════════════════════════════════════════════
class BJCPGame {
  constructor() {
    this.db         = null;
    this.gameRef    = null;
    this.gameCode   = null;
    this.role       = null;
    this.teamId     = null;
    this.playerName = null;
  }

  async initFirebase() {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    this.db = firebase.database();
  }

  // ── Session ──────────────────────────────────────────────────
  saveSession() {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      gameCode: this.gameCode, role: this.role,
      teamId: this.teamId, playerName: this.playerName
    }));
  }
  loadSession()   { try { return JSON.parse(localStorage.getItem(SESSION_KEY)||'null'); } catch { return null; } }
  clearSession()  { localStorage.removeItem(SESSION_KEY); }

  async restoreSession(s) {
    await this.initFirebase();
    Object.assign(this, { gameCode: s.gameCode, role: s.role, teamId: s.teamId, playerName: s.playerName });
    this.gameRef = this.db.ref(`games/${this.gameCode}`);
    const snap = await this.gameRef.once('value');
    if (!snap.exists()) { this.clearSession(); return null; }
    return snap.val();
  }

  // ── Helpers ───────────────────────────────────────────────────
  generateCode() {
    const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({length:5}, () => c[Math.floor(Math.random()*c.length)]).join('');
  }
  async checkGameExists(code) {
    await this.initFirebase();
    return (await this.db.ref(`games/${code.toUpperCase()}`).once('value')).exists();
  }
  async getTeamsForCode(code) {
    await this.initFirebase();
    const s = await this.db.ref(`games/${code.toUpperCase()}/teams`).once('value');
    return s.val() || {};
  }

  // ── Lie helper: generate a plausible but WRONG value ──────────
  _lieValue(type, realBeer) {
    const rnd = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const fakeRange = (realMin, realMax, scaleMin, scaleMax) => {
      // Pick a range that does NOT overlap with the real one
      let a, b, tries = 0;
      do {
        a = rnd(scaleMin, scaleMax - 5);
        b = a + rnd(3, Math.min(15, scaleMax - a));
        tries++;
      } while (tries < 30 && !(b < realMin - 2 || a > realMax + 2));
      return [a, b];
    };

    if (type === 'ibu') {
      const min = realBeer.ibuMin ?? 20, max = realBeer.ibuMax ?? 40;
      const [a,b] = fakeRange(min, max, 5, 100);
      return `${a}–${b} IBU`;
    }
    if (type === 'abv') {
      const min = (realBeer.abvMin ?? 5) * 10, max = (realBeer.abvMax ?? 7) * 10;
      const [a,b] = fakeRange(min, max, 10, 130);
      return `${(a/10).toFixed(1)}–${(b/10).toFixed(1)}%`;
    }
    if (type === 'srm') {
      const min = realBeer.srmMin ?? 5, max = realBeer.srmMax ?? 15;
      const [a,b] = fakeRange(min, max, 1, 38);
      return `SRM ${a}–${b}`;
    }
    if (type === 'category') {
      const allNums = [...new Set(BJCP_CARDS.map(c => c.categoryNumber))].filter(n => n !== realBeer.categoryNumber);
      return `Categoria ${allNums[Math.floor(Math.random() * allNums.length)] ?? '?'}`;
    }
    return 'N/A';
  }

  // ── Create / Join ─────────────────────────────────────────────
  async createGame(masterName) {
    await this.initFirebase();
    this.gameCode   = this.generateCode();
    this.role       = 'master';
    this.playerName = masterName;
    this.gameRef    = this.db.ref(`games/${this.gameCode}`);
    // activeCardIds: null means ALL cards visible
    await this.gameRef.set({
      code: this.gameCode, master: masterName,
      status: 'lobby', cardsLocked: true,
      currentRound: 0, totalRounds: 6,
      currentBeer: null, teams: {}, rounds: {}, messages: {}, roundReset: 0,
      activeLieTeam: null, cancelShieldTeam: null,
      activeCardIds: null,   // null = all cards; array = restricted list
      createdAt: Date.now()
    });
    this.saveSession();
    return this.gameCode;
  }

  async joinGame(code, playerName, teamId) {
    await this.initFirebase();
    this.gameCode = code.toUpperCase();
    this.playerName = playerName;
    this.teamId     = teamId;
    this.role       = 'team';
    this.gameRef    = this.db.ref(`games/${this.gameCode}`);
    const snap = await this.gameRef.once('value');
    if (!snap.exists()) throw new Error('Partida no trobada');
    const ts = await this.gameRef.child(`teams/${teamId}`).once('value');
    if (!ts.val()?.name) {
      await this.gameRef.child(`teams/${teamId}`).set({ name: teamId, points: 0, actionCards: [], players: {} });
    }
    await this.gameRef.child(`teams/${teamId}/players/${playerName}`).set({
      name: playerName, joinedAt: Date.now(),
      points: 0, correctGuesses: 0, actionCardsReceived: 0, cardStates: {}
    });
    this.saveSession();
    return snap.val();
  }

  // ── Master: game flow ─────────────────────────────────────────
  async startGame() {
    await this.gameRef.update({ status: 'playing', currentRound: 1, cardsLocked: true });
  }

  async setCurrentBeer(beerData) {
    const clean = Object.fromEntries(Object.entries(beerData).filter(([,v]) => v !== undefined && v !== null));
    await this.gameRef.child('currentBeer').set({
      ...clean,
      revealedInfo: {}, startedAt: Date.now(),
      revealed: false, roundPointsGiven: false,
      winnerTeam: null, winnerPlayer: null, guesses: {},
      pendingQuestion: null, pendingAction: null
    });
    await this.gameRef.update({ cardsLocked: false, activeLieTeam: null, cancelShieldTeam: null });
  }

  async nextRound() {
    const state = (await this.gameRef.once('value')).val();
    const next  = (state.currentRound || 0) + 1;

    if (next > (state.totalRounds || 6)) {
      await this.gameRef.child('status').set('finished');
    } else {
      // Clear all player cardStates so new round starts fresh
      const updates = {
        currentRound: next, currentBeer: null, cardsLocked: true,
        roundReset: Date.now(), activeLieTeam: null, cancelShieldTeam: null
      };
      const teams = state.teams || {};
      Object.entries(teams).forEach(([tid, t]) => {
        Object.keys(t.players || {}).forEach(pName => {
          updates[`teams/${tid}/players/${pName}/cardStates`] = null;
        });
      });
      await this.gameRef.update(updates);
    }
  }

  // ── Card management: actionCards is now array of {id, type} ──
  async grantCard(teamId, playerName, cardType) {
    const state = (await this.gameRef.once('value')).val();
    const curCards = state.teams[teamId]?.players?.[playerName]?.actionCards || [];
    const newCard  = { id: `card_${Date.now()}`, type: cardType };
    await this.gameRef.child(`teams/${teamId}/players/${playerName}/actionCards`)
      .set([...curCards, newCard]);
    const rcv = state.teams[teamId]?.players?.[playerName]?.actionCardsReceived || 0;
    await this.gameRef.child(`teams/${teamId}/players/${playerName}/actionCardsReceived`).set(rcv + 1);
    // Notify via message — marked pendingReveal so UI hides until master reveals
    const ts = Date.now();
    const def = ACTION_CARD_TYPES.find(a => a.type === cardType || a.id === cardType);
    await this.gameRef.child(`messages/${ts}`).set({
      from: 'Sistema', fromRole: 'system',
      toTeam: teamId, toPlayer: playerName,
      text: `🃏 Has rebut la carta: ${def?.icon||'🃏'} ${def?.name||cardType} — ${def?.desc||''}`,
      ts, isCardGrant: true, pendingReveal: true
    });
  }

  // Remove a specific card from a player's hand (move to usedCards history)
  async consumeCard(teamId, playerName, cardInstanceId) {
    // Use transaction to avoid race conditions
    const playerRef = this.gameRef.child(`teams/${teamId}/players/${playerName}`);
    const snap = await playerRef.once('value');
    const pData = snap.val() || {};
    const cards = pData.actionCards || [];
    const card  = cards.find(c => c.id === cardInstanceId);
    if (!card) return; // already consumed
    const updated  = cards.filter(c => c.id !== cardInstanceId);
    const usedCards = pData.usedCards || [];
    await playerRef.update({
      actionCards: updated,
      usedCards: [...usedCards, { ...card, usedAt: Date.now() }]
    });
  }

  // ── Judge guess ───────────────────────────────────────────────
  // ── Check if team used any info card this round ─────────────
  _teamUsedHelp(state, teamId) {
    // Team info reveals are stored under currentBeer/teamInfo/{teamId}
    const teamInfo = state.currentBeer?.teamInfo?.[teamId] || {};
    return Object.keys(teamInfo).length > 0;
  }

  async judgeGuess(guessKey, teamId, playerName, guessId, cardTypeToGrant) {
    const snap  = await this.gameRef.once('value');
    const state = snap.val();
    const beer  = state.currentBeer;
    const correct = (guessId === beer.id);

    // Auto-calculate points based on rules:
    // Correct + no help = 3pts | Correct + help = 1pt
    // Wrong + help = -1pt      | Wrong + no help = 0pts
    const usedHelp = this._teamUsedHelp(state, teamId);
    let pts = 0;
    if (correct)  pts = usedHelp ? 1 : 3;
    else          pts = usedHelp ? -1 : 0;

    const updates = {};
    updates[`currentBeer/guesses/${guessKey}/judged`]  = true;
    updates[`currentBeer/guesses/${guessKey}/correct`] = correct;
    updates[`currentBeer/guesses/${guessKey}/points`]  = pts;

    // Award points to player and team (every correct guesser gets their points)
    const teamPts   = (state.teams[teamId]?.points||0) + pts;
    const pp        = state.teams[teamId]?.players?.[playerName] || {};
    updates[`teams/${teamId}/points`] = Math.max(0, teamPts); // team never goes below 0
    updates[`teams/${teamId}/players/${playerName}/points`] = Math.max(0, (pp.points||0) + pts);
    if (correct) {
      updates[`teams/${teamId}/players/${playerName}/correctGuesses`] = (pp.correctGuesses||0) + 1;
    }

    // Track first winner for animation (only if not already set)
    if (correct && !beer.winnerTeam) {
      updates['currentBeer/winnerTeam']   = teamId;
      updates['currentBeer/winnerPlayer'] = playerName;
    }

    await this.gameRef.update(updates);

    // Card grant for every correct guesser
    if (correct && cardTypeToGrant) {
      await this.grantCard(teamId, playerName, cardTypeToGrant);
    }
    return { correct, pts };
  }

  // ── Master manually triggers reveal to all players ────────────
  async revealResult() {
    await this.gameRef.child('currentBeer').update({ revealed: true, resultsVisible: true });
    // Flip all pendingReveal messages to visible
    const msgsSnap = await this.gameRef.child('messages').orderByChild('pendingReveal').equalTo(true).once('value');
    const updates = {};
    msgsSnap.forEach(child => { updates[`messages/${child.key}/pendingReveal`] = false; });
    if (Object.keys(updates).length) await this.gameRef.update(updates);
  }

  // ── Reveal info (with lie support) ───────────────────────────
  async revealInfo(infoType, value, forTeam = null) {
    // forTeam: if set, only that team sees the info (in their team-specific channel)
    if (forTeam) {
      await this.gameRef.child(`currentBeer/teamInfo/${forTeam}/${infoType}`).set(value);
    } else {
      await this.gameRef.child(`currentBeer/revealedInfo/${infoType}`).set(value);
    }
  }

  // ── Action card execution (called by USE on team side) ────────
  // Returns { ok, message } 
  async useCard(teamId, playerName, cardInstanceId, cardType, extraData) {
    extraData = extraData || {};
    const state = (await this.gameRef.once('value')).val();
    const beer  = state.currentBeer;
    const canUseWithoutBeer = ['cancel','lie'].includes(cardType);
    if (!beer && !canUseWithoutBeer) {
      throw new Error('Esperant la cervesa de la ronda');
    }
    // Block if round is already over (beer revealed) — but NOT cancel/lie which work between rounds
    if (beer?.revealed && !canUseWithoutBeer) {
      throw new Error('La ronda ja ha acabat. Espera la pròxima ronda.');
    }

    const cancelShield = state.cancelShieldTeam;
    const lieTeam      = state.activeLieTeam;

    // Check if this card is blocked by cancel shield (rival used cancel)
    // Shield blocks ANY card (except cancel/lie which are meta-cards)
    const infoTypes = ['ibu','abv','srm','category'];
    const blockableByShield = !['cancel','lie'].includes(cardType);
    if (blockableByShield && cancelShield && cancelShield !== teamId) {
      await this.consumeCard(teamId, playerName, cardInstanceId);
      await this.gameRef.child('cancelShieldTeam').set(null); // shield consumed
      const allLabels = {
        ibu: '🌿 IBU', abv: '🍺 Alcohol', srm: '🎨 Color SRM', category: '📂 Categoria',
        yes_no: '❓ Sí o No', sensory: '🌾 Pista Sensorial', steal: '🦝 Robar Carta',
        eliminate: '🃏 Descartar la Meitat', wildcard: '📞 Comodí Trucada'
      };
      const cardLabel = allLabels[cardType] || cardType;
      const ts = Date.now();
      await this.gameRef.child(`messages/${ts}`).set({
        from: 'Sistema', fromRole: 'system', toTeam: teamId, toPlayer: null,
        text: `🚫 La vostra carta ${cardLabel} ha estat ANUL·LADA per l'equip rival!`,
        ts, isSystemAlert: true
      });
      await this.gameRef.child(`messages/${ts + 1}`).set({
        from: 'Sistema', fromRole: 'system', toTeam: cancelShield, toPlayer: null,
        text: `✅ Escut activat! Has blocat la carta ${cardLabel} de l'equip ${teamId}.`,
        ts: ts + 1, isSystemAlert: true
      });
      return { ok: false, message: '🚫 Carta bloquejada per l\'escut rival!' };
    }

    // Determine if we must lie (lie card active for a different team that requested info)
    const mustLie = lieTeam && lieTeam !== teamId && infoTypes.includes(cardType);

    await this.consumeCard(teamId, playerName, cardInstanceId);

    switch (cardType) {

      case 'ibu':
      case 'abv':
      case 'srm': {
        await this.gameRef.child('currentBeer/pendingAction').set({
          type: cardType,
          teamId,
          playerName,
          requestedAt: Date.now(),
          resolved: false,
          mustLie: mustLie === true
        });
        const labels = { ibu: 'IBU', abv: 'Alcohol', srm: 'Color SRM' };
        return { ok: true, message: `Sol·licitud ${labels[cardType]} enviada al Master!` };
      }

      case 'category': {
        // Auto-resolves — no master needed
        const beer = state.currentBeer;
        const catNum = beer?.categoryNumber ?? beer?.categorynumber ?? '?';
        const catName = beer?.category ?? '?';
        const val = mustLie ? this._lieValue('category', beer) : `${catNum} — ${catName}`;
        await this.revealInfo('category', val, teamId);
        const ts = Date.now();
        await this.gameRef.child(`messages/${ts}`).set({
          from: 'Sistema', fromRole: 'system', toTeam: teamId, toPlayer: null,
          text: `📂 Categoria: ${val}${mustLie ? ' 🤥' : ''}`,
          ts, isInfoReveal: true
        });
        if (mustLie) {
          // notify lie team
          const savedLie = state.activeLieTeam;
          await this.gameRef.child('activeLieTeam').set(null);
          if (savedLie) {
            await this.gameRef.child(`messages/${ts+1}`).set({
              from: 'Sistema', fromRole: 'system', toTeam: savedLie, toPlayer: null,
              text: `🤡 Mentida enviada! Han rebut: "Categoria: ${val}" (FALS!)`,
              ts: ts+1, isSystemAlert: true
            });
          }
        }
        return { ok: true, message: `📂 Categoria revelada: ${val}` };
      }

      case 'lie': {
        await this.gameRef.child('activeLieTeam').set(teamId);
        // NO public broadcast — rivals must not know a lie is active
        // Only notify own team silently
        const ts = Date.now();
        await this.gameRef.child(`messages/${ts}`).set({
          from: 'Sistema', fromRole: 'system', toTeam: teamId, toPlayer: null,
          text: `🤡 Carta Mentida activada! Si un equip rival demana info aquesta ronda, rebran dades FALSES.`,
          ts, isSystemAlert: true
        });
        return { ok: true, message: '🤡 Carta Mentida activada silenciosament!' };
      }

      case 'cancel': {
        await this.gameRef.child('cancelShieldTeam').set(teamId);
        const ts = Date.now();
        // Notify own team
        await this.gameRef.child(`messages/${ts}`).set({
          from: 'Sistema', fromRole: 'system', toTeam: teamId, toPlayer: null,
          text: `🛡️ Escut activat! La pròxima carta que tiri qualsevol equip rival quedarà bloquejada.`,
          ts, isSystemAlert: true
        });
        // Notify all rival teams that an annul card is active
        const allTeams = Object.keys(state.teams || {});
        let notifTs = ts + 1;
        for (const tid of allTeams) {
          if (tid === teamId) continue;
          await this.gameRef.child(`messages/${notifTs}`).set({
            from: 'Sistema', fromRole: 'system', toTeam: tid, toPlayer: null,
            text: `⚠️ L'equip rival ha activat una Carta d'Anul·lació. La propera carta que tireu serà bloquejada!`,
            ts: notifTs, isSystemAlert: true
          });
          notifTs++;
        }
        return { ok: true, message: '🛡️ Escut activat! Els rivals ja saben que estan en perill.' };
      }

      case 'yes_no': {
        // Place a pending question for master to answer
        await this.gameRef.child('currentBeer/pendingQuestion').set({
          teamId, playerName, question: extraData.question || '',
          cardInstanceId, askedAt: Date.now(), answered: false
        });
        return { ok: true, message: 'Pregunta enviada al Master!' };
      }

      case 'sensory': {
        // Request a sensory clue — master must type and send
        await this.gameRef.child('currentBeer/pendingAction').set({
          type: 'sensory', teamId, playerName, requestedAt: Date.now(), resolved: false
        });
        return { ok: true, message: 'Pista Sensorial sol·licitada al Master!' };
      }

      case 'steal': {
        // Re-read fresh state to avoid stale data
        const freshSnap = await this.gameRef.once('value');
        const freshState = freshSnap.val();
        const teams = freshState.teams || {};
        const rivals = [];
        Object.entries(teams).forEach(([tid, t]) => {
          if (tid === teamId) return;
          Object.entries(t.players||{}).forEach(([pName, pd]) => {
            const cards = pd.actionCards || [];
            if (cards.length > 0) rivals.push({ tid, pName, cards });
          });
        });

        if (!rivals.length) {
          return { ok: false, message: 'Cap rival té cartes per robar.' };
        }
        const victim     = rivals[Math.floor(Math.random() * rivals.length)];
        const stolenCard = victim.cards[Math.floor(Math.random() * victim.cards.length)];

        const updates2 = {};
        const victimCards = victim.cards.filter(c => c.id !== stolenCard.id);
        updates2[`teams/${victim.tid}/players/${victim.pName}/actionCards`] = victimCards;
        const thiefCards  = freshState.teams[teamId]?.players?.[playerName]?.actionCards || [];
        updates2[`teams/${teamId}/players/${playerName}/actionCards`] =
          [...thiefCards, { ...stolenCard, id: `stolen_${Date.now()}` }];
        await this.gameRef.update(updates2);

        const ts1 = Date.now();
        const def = ACTION_CARD_TYPES.find(a => a.id === stolenCard.type);
        await this.gameRef.child(`messages/${ts1}`).set({
          from: 'Sistema', fromRole: 'system', toTeam: teamId, toPlayer: null,
          text: `🦝 Has robat "${def?.icon||'🃏'} ${def?.name||stolenCard.type}" de ${victim.pName} (${victim.tid})!`,
          ts: ts1, isSystemAlert: true
        });
        await this.gameRef.child(`messages/${ts1+1}`).set({
          from: 'Sistema', fromRole: 'system', toTeam: victim.tid, toPlayer: victim.pName,
          text: `🦝 ${teamId} t'ha robat "${def?.icon||'🃏'} ${def?.name||stolenCard.type}"!`,
          ts: ts1+1, isSystemAlert: true
        });
        return { ok: true, message: `Has robat una carta de ${victim.pName}!` };
      }

      case 'eliminate': {
        // Discard half of team's 'possible' cards that DON'T match the beer
        const myTeamData = state.teams[teamId] || {};
        const players    = myTeamData.players || {};
        const beerId     = beer.id;

        // Gather all 'possible' cards across all team members
        const possibleMap = {}; // cardId → [playerNames]
        Object.entries(players).forEach(([pName, pData]) => {
          Object.entries(pData.cardStates||{}).forEach(([cardId, st]) => {
            if (st === 'possible') {
              if (!possibleMap[cardId]) possibleMap[cardId] = [];
              possibleMap[cardId].push(pName);
            }
          });
        });
        // Wrong ones = possible but not the correct beer
        const wrong = Object.keys(possibleMap).filter(id => id !== beerId);
        // Discard half (random selection)
        const toDiscard = wrong.sort(() => Math.random()-.5).slice(0, Math.max(1, Math.floor(wrong.length/2)));

        if (!toDiscard.length) {
          return { ok: false, message: 'No hi ha cartes possibles incorrectes per descartar.' };
        }
        const updates = {};
        Object.keys(players).forEach(pName => {
          toDiscard.forEach(cardId => {
            updates[`teams/${teamId}/players/${pName}/cardStates/${cardId}`] = 'discarded';
          });
        });
        await this.gameRef.update(updates);
        const ts = Date.now();
        await this.gameRef.child(`messages/${ts}`).set({
          from: 'Sistema', fromRole: 'system', toTeam: teamId, toPlayer: null,
          text: `✂️ ${toDiscard.length} cartes preferides incorrectes han estat descartades!`,
          ts, isSystemAlert: true
        });
        return { ok: true, message: `${toDiscard.length} cartes descartades!` };
      }

      case 'wildcard': {
        const ts = Date.now();
        await this.gameRef.child(`messages/${ts}`).set({
          from: 'Sistema', fromRole: 'system', toTeam: 'master', toPlayer: null,
          text: `📞 COMODÍ TRUCADA! L'equip ${teamId} (${playerName}) ha usat el Comodí. Prepara la broma!`,
          ts, isSystemAlert: true, forMasterOnly: true
        });
        // Open phone dialer on player's device
        return { ok: true, message: '📞 Comodí!', dialPhone: '699286930' };
      }

      default:
        return { ok: false, message: 'Carta desconeguda' };
    }
  }

  // ── Master answers info card (ibu/abv/srm/category) ─────────
  async answerInfoCard(infoType, value) {
    const state = (await this.gameRef.once('value')).val();
    const pa    = state.currentBeer?.pendingAction;
    if (!pa) throw new Error('No hi ha cap sol·licitud pendent');
    if (pa.resolved) throw new Error('Ja resolta');
    const mustLie = !!pa.mustLie;
    const rawVal  = mustLie ? this._lieValue(pa.type, state.currentBeer) : value.trim();
    // Sanitize: replace any undefined/null with fallback
    const finalVal = (rawVal && rawVal !== 'undefined' && rawVal !== 'null') ? rawVal : null;
    if (!finalVal) throw new Error('Valor invàlid o no disponible per a aquest estil');
    // Mark as resolved, clear lie card (single use)
    const savedLieTeam = state.activeLieTeam; // save before clearing
    const infoUpdates = {};
    infoUpdates['currentBeer/pendingAction/resolved'] = true;
    infoUpdates['currentBeer/pendingAction/answer']   = finalVal;
    if (mustLie) infoUpdates['activeLieTeam'] = null; // consume the lie card
    await this.gameRef.update(infoUpdates);
    await this.revealInfo(pa.type, finalVal, pa.teamId);
    // Notify lie-team what false value was sent (private, only they see it)
    if (mustLie && savedLieTeam) {
      const lieLabels = { ibu: 'IBU', abv: 'Alcohol', srm: 'Color SRM', category: 'Categoria' };
      const lieTs = Date.now() + 2;
      await this.gameRef.child(`messages/${lieTs}`).set({
        from: 'Sistema', fromRole: 'system', toTeam: savedLieTeam, toPlayer: null,
        text: `🤡 Mentida enviada! Han rebut: "${lieLabels[pa.type]||pa.type}: ${finalVal}" (FALS!)`,
        ts: lieTs, isSystemAlert: true
      });
    }
    const ts = Date.now();
    const labels = { ibu: '🌿 IBU', abv: '🍺 Alcohol', srm: '🎨 Color SRM', category: '📂 Categoria' };
    await this.gameRef.child(`messages/${ts}`).set({
      from: 'Master', fromRole: 'master', toTeam: pa.teamId, toPlayer: null,
      text: `${labels[pa.type] || pa.type}: ${finalVal}${mustLie ? ' 🤥' : ''}`,
      ts, isInfoReveal: true
    });
  }

  // ── Master answers yes/no question ───────────────────────────
  async answerYesNo(answer) {
    const pq = (await this.gameRef.once('value')).val()?.currentBeer?.pendingQuestion;
    if (!pq) return;
    await this.gameRef.child('currentBeer/pendingQuestion/answered').set(true);
    await this.gameRef.child('currentBeer/pendingQuestion/answer').set(answer);
    const ts = Date.now();
    await this.gameRef.child(`messages/${ts}`).set({
      from: 'Master', fromRole: 'master', toTeam: pq.teamId, toPlayer: null,
      text: `❓ Resposta del Master a "${pq.question}": ${answer ? '✅ SÍ' : '❌ NO'}`,
      ts, isSystemAlert: true
    });
  }

  // ── Master sends sensory clue ────────────────────────────────
  async sendSensoryClue(clue) {
    const state = (await this.gameRef.once('value')).val();
    const pa    = state.currentBeer?.pendingAction;
    if (!pa || pa.type !== 'sensory') return;
    await this.gameRef.child('currentBeer/pendingAction/resolved').set(true);
    await this.revealInfo('sensory', `🌾 ${clue}`, pa.teamId);
    const ts = Date.now();
    await this.gameRef.child(`messages/${ts}`).set({
      from: 'Master', fromRole: 'master', toTeam: pa.teamId, toPlayer: null,
      text: `🌾 Pista Sensorial: ${clue}`,
      ts, isInfoReveal: true
    });
  }

  // ── Card states ───────────────────────────────────────────────
  async saveCardState(cardId, state) {
    if (!this.gameRef || !this.teamId || !this.playerName) return;
    await this.gameRef
      .child(`teams/${this.teamId}/players/${this.playerName}/cardStates/${cardId}`)
      .set(state === 'normal' ? null : state);
  }

  // ── Submit guess ─────────────────────────────────────────────
  async submitGuess(guessId, guessName) {
    // Check if this player already has a PENDING (not judged) guess
    const snap  = await this.gameRef.child('currentBeer/guesses').once('value');
    const guesses = snap.val() || {};
    const myPending = Object.entries(guesses).find(
      ([, g]) => g.teamId === this.teamId && g.playerName === this.playerName && !g.judged
    );
    if (myPending) throw new Error('ALREADY_GUESSED:' + myPending[0]);

    const ts  = Date.now();
    const key = `${this.teamId}__${this.playerName}__${ts}`;
    await this.gameRef.child(`currentBeer/guesses/${key}`).set({
      teamId: this.teamId, playerName: this.playerName,
      guessId, guess: guessName, submittedAt: ts, judged: false, correct: null
    });
    return key;
  }

  // ── Retract guess (before judged) ────────────────────────────
  async retractGuess(guessKey) {
    await this.gameRef.child(`currentBeer/guesses/${guessKey}`).remove();
  }

  // ── Messages ─────────────────────────────────────────────────
  async sendMessage(toTeam, toPlayer, text) {
    const ts = Date.now();
    await this.gameRef.child(`messages/${ts}`).set({
      from: this.playerName, fromRole: this.role,
      toTeam: toTeam||'all', toPlayer: toPlayer||null, text, ts
    });
  }

  // ── Active card set management (master) ──────────────────────
  async setActiveCards(cardIds) {
    // null = all cards; array = restricted set
    await this.gameRef.child('activeCardIds').set(cardIds || null);
  }

  // ── Terminate game session (master logout → all players get kicked) ──
  async terminateSession() {
    if (this.gameRef) {
      await this.gameRef.child('terminated').set(Date.now());
    }
    this.clearSession();
  }
}

const game = new BJCPGame();
