/**
 * Monte Carlo Matchup & Synergy Discovery Simulator
 * Simulates turn-by-turn matches between the user's deck and meta archetypes.
 * Tracks combo assembly, combo execution win-rates, and identifies
 * which card pairings come out on top as strongest together.
 */

// Meta Gauntlet Benchmark Decks
const META_GAUNTLET_DECKS = {
  'Team Toguro Aggro': {
    name: 'Team Toguro Discard Aggro',
    team: 'Team Toguro',
    icon: '💪',
    slots: {
      1: 'GF-ST8',   // Younger Toguro (4000 DEF)
      2: 'GF-ST38',  // Elder Toguro (4000 DEF)
      3: 'DT-S19',   // Younger Toguro, Transformed (6000 DEF)
      4: 'DT-C48'    // Elder Toguro, Puppet Master (4000 DEF)
    },
    mainDeck: {
      'GF-ST101': 3, // No Mercy (+4000 ATK)
      'GF-R89': 1,   // Overwhelming Kill (4 wounds)
      'GF-R84': 3,   // All For One and One For All (+3 SE)
      'GF-ST97': 3,  // Feast of Souls (+2 SE)
      'GF-C57': 3,   // Efflux (+3000 ATK)
      'GF-C60': 3,   // Flurry of Blows
      'GF-R86': 3,   // Kitty Love
      'GF-ST134': 2, // Rose Whip
      'GF-C65': 3,   // Improvised Weapon
      'GF-C56': 3,   // Defensive Posture
      'GF-R124': 3,  // Shadow Sword
      'GF-ST170': 3, // Shibattou Shining Sword
      'GF-C52': 3,   // Abnormal Endurance
      'GF-R91': 2,   // Signature Moves
      'DT-R27': 1,   // Empowered Emotions
      'GF-G178': 1   // Burst of Power
    }
  },
  'Team Urameshi Ramp': {
    name: 'Team Urameshi Spirit Ramp',
    team: 'Team Urameshi',
    icon: '⚡',
    slots: {
      1: 'GF-R5',    // Yusuke, Resurrected (4000 DEF)
      2: 'GF-R35',   // Kuwabara, Street Fighter (4000 DEF)
      3: 'GF-ST41',  // Kurama (4000 DEF)
      4: 'GF-R32'    // Hiei, the Swordsman (4000 DEF)
    },
    mainDeck: {
      'GF-C63': 3,   // Heroic Team
      'GF-C53': 3,   // Alley Fight for Eikichi
      'GF-R84': 3,   // All For One and One For All
      'GF-ST134': 3, // Rose Whip
      'GF-ST173': 3, // Spirit Sword Monster Beast Donut
      'GF-C56': 3,   // Defensive Posture
      'GF-C57': 3,   // Efflux
      'GF-R86': 3,   // Kitty Love
      'GF-C64': 3,   // Hiei's Sword Mastery
      'GF-R124': 3,  // Shadow Sword
      'GF-C153': 3,  // Shotgun
      'GF-R162': 3,  // Spirit Sword Double
      'GF-C52': 3,   // Abnormal Endurance
      'DT-S21': 1    // Yusuke, Unleashed
    }
  },
  'Team Genkai Voltron': {
    name: 'Team Genkai Technique Toolbox',
    team: 'Team Genkai',
    icon: '🥋',
    slots: {
      1: 'DT-S14',   // Genkai, the Mentor (4500 DEF)
      2: 'DT-C46',   // Asato Kido, Shadow Master (4500 DEF)
      3: 'GF-R5',    // Yusuke
      4: 'GF-ST41'   // Kurama
    },
    mainDeck: {
      'GF-C62': 3,   // Guru of Engagement
      'GF-C153': 3,  // Shotgun
      'GF-R162': 3,  // Spirit Sword Double
      'GF-ST173': 3, // Spirit Sword Monster Beast Donut
      'GF-C56': 3,   // Defensive Posture
      'GF-R84': 3,   // All For One
      'GF-C57': 3,   // Efflux
      'GF-R86': 3,   // Kitty Love
      'DT-R43': 3,   // Desperate Assault
      'DT-C112': 3,  // Kurama's Whip Deception
      'GF-C52': 3,   // Abnormal Endurance
      'GF-C60': 3,   // Flurry of Blows
      'GF-C66': 3,   // Kidnapping
      'GF-G178': 1   // Burst of Power
    }
  },
  'Team Saint Beasts Control': {
    name: 'Team Saint Beasts Draw Control',
    team: 'Team Saint Beasts',
    icon: '🐉',
    slots: {
      1: 'GF-U11',   // Suzaku, Makai Master (4000 DEF)
      2: 'DT-R24',   // Genbu, Master of Stone (5500 DEF)
      3: 'GF-U10',   // Chu, the Team Captain (4000 DEF)
      4: 'GF-C1'     // Risho (5000 DEF)
    },
    mainDeck: {
      'GF-R84': 3,   // All For One and One For All
      'GF-C56': 3,   // Defensive Posture
      'GF-S138': 3,  // Armor of Clay
      'GW-TC13': 3,  // Allure
      'GF-C67': 3,   // Zombies on the Hunt
      'GF-C66': 3,   // Kidnapping
      'GF-C55': 3,   // Deadly Attack
      'GF-R86': 3,   // Kitty Love
      'GF-C57': 3,   // Efflux
      'GF-C52': 3,   // Abnormal Endurance
      'DT-R27': 1,   // Empowered Emotions
      'DT-R33': 2,   // Stand Off
      'GF-G178': 1   // Burst of Power
    }
  }
};

/**
 * Executes Monte Carlo Matchup Simulations
 * @param {object} playerDeckState - { slots, mainDeck, activeTeamBonus }
 * @param {Map|object} cardMap - Card lookup
 * @param {Array} comboCatalog - Array of combo definitions from combos.json
 * @param {number} runsPerMatchup - Number of simulation runs per opponent deck (e.g. 250 = 1000 total)
 * @returns {object} Simulation results including win rates, pairing strengths, and combo stats
 */
function simulateDeckMatchups(playerDeckState, cardMap, comboCatalog = [], runsPerMatchup = 250) {
  const getCard = (id) => cardMap instanceof Map ? cardMap.get(id) : cardMap[id];

  // Flatten player's main deck into card array
  const playerDeckList = [];
  for (const [id, qty] of Object.entries(playerDeckState.mainDeck || {})) {
    const card = getCard(id);
    if (card) {
      for (let i = 0; i < qty; i++) {
        playerDeckList.push(card);
      }
    }
  }

  // Pre-index player combos
  const playerCardNames = new Set();
  Object.values(playerDeckState.slots || {}).filter(Boolean).forEach(id => {
    const c = getCard(id);
    if (c) playerCardNames.add(c.name.toLowerCase());
  });
  playerDeckList.forEach(c => playerCardNames.add(c.name.toLowerCase()));

  // Active combos available in player deck
  const activeDeckCombos = (comboCatalog || []).filter(combo => {
    const primInDeck = playerCardNames.has(combo.primaryCard.toLowerCase());
    const anyPartnerInDeck = (combo.partnerCards || []).some(p => playerCardNames.has(p.toLowerCase()));
    return primInDeck && anyPartnerInDeck;
  });

  // Track global card pairing stats: key = "CardA||CardB"
  const pairingStats = new Map();
  // Track combo execution stats: key = comboId
  const comboStats = new Map();
  activeDeckCombos.forEach(cb => {
    comboStats.set(cb.id, {
      combo: cb,
      assembledCount: 0,
      executedCount: 0,
      executedWins: 0,
      totalGamesAvailable: 0
    });
  });

  const matchupResults = [];
  let totalPlayerWins = 0;
  let totalSimulations = 0;

  // Run against each opponent in the meta gauntlet
  for (const [opponentKey, opponentDeck] of Object.entries(META_GAUNTLET_DECKS)) {
    const opponentDeckList = [];
    for (const [id, qty] of Object.entries(opponentDeck.mainDeck || {})) {
      const card = getCard(id);
      if (card) {
        for (let i = 0; i < qty; i++) {
          opponentDeckList.push(card);
        }
      }
    }

    let pWins = 0;
    let oWins = 0;
    let totalTurnsAccum = 0;

    for (let run = 0; run < runsPerMatchup; run++) {
      totalSimulations++;
      const gameResult = simulateSingleMatch(
        playerDeckState,
        playerDeckList,
        opponentDeck,
        opponentDeckList,
        activeDeckCombos,
        cardMap
      );

      if (gameResult.playerWon) {
        pWins++;
        totalPlayerWins++;
      } else {
        oWins++;
      }
      totalTurnsAccum += gameResult.turns;

      // Record combo executions
      gameResult.combosTriggered.forEach(cbId => {
        const cs = comboStats.get(cbId);
        if (cs) {
          cs.executedCount++;
          if (gameResult.playerWon) cs.executedWins++;
        }
      });

      // Record card pairings drawn/played together
      const cardsInGame = Array.from(gameResult.playerCardsPlayed);
      for (let i = 0; i < cardsInGame.length; i++) {
        for (let j = i + 1; j < cardsInGame.length; j++) {
          const nameA = cardsInGame[i];
          const nameB = cardsInGame[j];
          const pairKey = nameA < nameB ? `${nameA}|||${nameB}` : `${nameB}|||${nameA}`;
          if (!pairingStats.has(pairKey)) {
            pairingStats.set(pairKey, { cardA: nameA, cardB: nameB, gamesTogether: 0, winsTogether: 0 });
          }
          const pair = pairingStats.get(pairKey);
          pair.gamesTogether++;
          if (gameResult.playerWon) pair.winsTogether++;
        }
      }
    }

    const winRatePct = Math.round((pWins / runsPerMatchup) * 100);
    const avgTurns = +(totalTurnsAccum / runsPerMatchup).toFixed(1);

    matchupResults.push({
      opponentKey,
      opponentName: opponentDeck.name,
      icon: opponentDeck.icon,
      runs: runsPerMatchup,
      playerWins: pWins,
      opponentWins: oWins,
      winRatePct,
      avgTurns
    });
  }

  const overallWinRatePct = totalSimulations > 0 ? Math.round((totalPlayerWins / totalSimulations) * 100) : 0;

  // Process top card pairings (sorted by games together and win rate)
  const rankedPairings = Array.from(pairingStats.values())
    .filter(p => p.gamesTogether >= Math.max(5, Math.floor(totalSimulations * 0.08)))
    .map(p => {
      const winRate = Math.round((p.winsTogether / p.gamesTogether) * 100);
      const liftDelta = winRate - overallWinRatePct;
      return {
        cardA: p.cardA,
        cardB: p.cardB,
        gamesTogether: p.gamesTogether,
        winRate,
        liftDelta
      };
    })
    .sort((a, b) => b.winRate - a.winRate || b.gamesTogether - a.gamesTogether)
    .slice(0, 8);

  // Process top combos
  const rankedCombos = Array.from(comboStats.values())
    .map(cs => {
      const execRatePct = Math.round((cs.executedCount / totalSimulations) * 100);
      const winRateWhenExecuted = cs.executedCount > 0 ? Math.round((cs.executedWins / cs.executedCount) * 100) : 0;
      const rating = cs.combo.rating?.overallScore || 80;
      const tier = cs.combo.rating?.tier || 'A-Tier';
      return {
        id: cs.combo.id,
        name: cs.combo.name,
        archetype: cs.combo.archetype,
        primaryCard: cs.combo.primaryCard,
        partnerCards: cs.combo.partnerCards,
        rating,
        tier,
        damagePotential: cs.combo.damagePotential,
        executedCount: cs.executedCount,
        execRatePct,
        winRateWhenExecuted
      };
    })
    .sort((a, b) => (b.winRateWhenExecuted * b.execRatePct) - (a.winRateWhenExecuted * a.execRatePct) || b.rating - a.rating);

  // Calculate composite Deck Synergy Rating (0–100)
  let synergyScore = 50;
  if (rankedCombos.length > 0) {
    const avgComboScore = rankedCombos.reduce((acc, c) => acc + c.rating, 0) / rankedCombos.length;
    const bestComboWinRate = rankedCombos[0]?.winRateWhenExecuted || overallWinRatePct;
    synergyScore = Math.min(99, Math.round((avgComboScore * 0.4) + (overallWinRatePct * 0.4) + (Math.min(100, rankedCombos.length * 10) * 0.2)));
  } else {
    synergyScore = Math.round(overallWinRatePct * 0.7);
  }

  return {
    totalSimulations,
    totalPlayerWins,
    overallWinRatePct,
    synergyScore,
    matchups: matchupResults,
    rankedPairings,
    rankedCombos
  };
}

/**
 * Simulates a single 4-match game between player and opponent
 */
function simulateSingleMatch(playerDeckState, playerDeckList, opponentDeckState, opponentDeckList, activeCombos, cardMap) {
  const getCard = (id) => cardMap instanceof Map ? cardMap.get(id) : cardMap[id];

  // 1. Setup Starting Characters
  const pSlots = [1, 2, 3, 4].map(s => getCard(playerDeckState.slots?.[s])).filter(Boolean);
  const oSlots = [1, 2, 3, 4].map(s => getCard(opponentDeckState.slots?.[s])).filter(Boolean);

  let pCurrentCharIdx = 0;
  let oCurrentCharIdx = 0;

  let pWounds = 0; // wounds on current active character (2 = KO)
  let oWounds = 0;

  // 2. Shuffle Decks
  const pDeck = shuffle([...playerDeckList]);
  const oDeck = shuffle([...opponentDeckList]);

  // 3. Opening Hands (4 cards)
  const pHand = pDeck.splice(0, Math.min(4, pDeck.length));
  const oHand = oDeck.splice(0, Math.min(4, oDeck.length));

  let pSE = 0;
  let oSE = 0;

  const isPUrameshi = playerDeckState.activeTeamBonus === 'Team Urameshi';
  const isOUrameshi = opponentDeckState.team === 'Team Urameshi';
  const isPToguro = playerDeckState.activeTeamBonus === 'Team Toguro';
  const isOToguro = opponentDeckState.team === 'Team Toguro';
  const isPSaintBeasts = playerDeckState.activeTeamBonus === 'Team Saint Beasts';
  const isOSaintBeasts = opponentDeckState.team === 'Team Saint Beasts';

  const playerCardsPlayed = new Set();
  const combosTriggered = new Set();

  let turn = 0;
  const maxTurns = 8;

  while (turn < maxTurns && pCurrentCharIdx < pSlots.length && oCurrentCharIdx < oSlots.length) {
    turn++;

    // === PLAYER TURN ===
    // Draw Step
    pSE += isPUrameshi ? 2 : 1;
    if (pDeck.length > 0) pHand.push(pDeck.pop());
    if (isPSaintBeasts && pDeck.length > 0) pHand.push(pDeck.pop());

    // Main Step: Play events, ramp, and assemble combos
    const pHandNames = new Set(pHand.map(c => c.name.toLowerCase()));
    pHand.forEach(c => playerCardsPlayed.add(c.name));

    // Ramp cards
    for (let i = pHand.length - 1; i >= 0; i--) {
      const card = pHand[i];
      if (card.name === 'All For One and One For All' && pSE >= 0) {
        pSE += 3;
        pHand.splice(i, 1);
        if (pDeck.length > 0) pHand.push(pDeck.pop());
      } else if (card.name === 'Feast of Souls') {
        pSE += 2;
        pHand.splice(i, 1);
      }
    }

    // Check combos
    let playerComboBonusAtk = 0;
    let playerDamageMultiplier = 1;
    let playerInstantKill = false;

    activeCombos.forEach(combo => {
      const primInHand = pHandNames.has(combo.primaryCard.toLowerCase());
      const partnerInHand = (combo.partnerCards || []).find(p => pHandNames.has(p.toLowerCase()));
      if (primInHand && partnerInHand) {
        combosTriggered.add(combo.id);

        if (combo.id === 'CMB-BURST-01') { // Overwhelming 4-wound KO
          playerDamageMultiplier = 2;
          playerComboBonusAtk += 8000;
        } else if (combo.id === 'CMB-BURST-03') { // Alley Fight
          playerComboBonusAtk += pSE * 1000;
        } else if (combo.id === 'CMB-BURST-04') { // Rose Whip
          playerDamageMultiplier = 2;
        } else if (combo.id === 'CMB-BURST-05') { // Hiei Sword
          playerComboBonusAtk += 6000;
        } else if (combo.id === 'CMB-BURST-07') { // Guru Technique
          playerComboBonusAtk += 4000;
        } else if (combo.id === 'CMB-ALLURE-02') { // Allure 4-card draw
          for (let d = 0; d < 4 && pDeck.length > 0; d++) pHand.push(pDeck.pop());
        }
      }
    });

    // Attack Step
    const pFighter = pSlots[pCurrentCharIdx];
    const oFighter = oSlots[oCurrentCharIdx];

    let pAttackVal = 3500;
    if (pFighter?.attacks?.length > 0) {
      const bestAtk = pFighter.attacks.reduce((max, a) => (typeof a.damage === 'number' && a.damage > max ? a.damage : max), 3000);
      pAttackVal = bestAtk;
    }

    // Add Toguro discard pump
    if (isPToguro && pHand.length >= 2) {
      pHand.splice(0, 2);
      pAttackVal += 6000;
    }

    pAttackVal += playerComboBonusAtk;

    // Apply vs Opponent DEF
    const oDef = (oFighter?.defense || 4000);
    if (pAttackVal >= oDef * 2) {
      oWounds += 2 * playerDamageMultiplier;
    } else if (pAttackVal >= oDef) {
      oWounds += 1 * playerDamageMultiplier;
    }

    if (oWounds >= 2) {
      oCurrentCharIdx++;
      oWounds = 0;
      if (oCurrentCharIdx >= oSlots.length) break; // Player won!
    }

    // === OPPONENT TURN ===
    oSE += isOUrameshi ? 2 : 1;
    if (oDeck.length > 0) oHand.push(oDeck.pop());
    if (isOSaintBeasts && oDeck.length > 0) oHand.push(oDeck.pop());

    // Opponent Attack
    let oAttackVal = 4000;
    const curOFighter = oSlots[oCurrentCharIdx];
    if (curOFighter?.attacks?.length > 0) {
      oAttackVal = curOFighter.attacks.reduce((max, a) => (typeof a.damage === 'number' && a.damage > max ? a.damage : max), 3500);
    }

    if (isOToguro && oHand.length >= 2) {
      oHand.splice(0, 2);
      oAttackVal += 6000;
    }

    const pDef = (pFighter?.defense || 4000);
    if (oAttackVal >= pDef * 2) {
      pWounds += 2;
    } else if (oAttackVal >= pDef) {
      pWounds += 1;
    }

    if (pWounds >= 2) {
      pCurrentCharIdx++;
      pWounds = 0;
      if (pCurrentCharIdx >= pSlots.length) break; // Opponent won!
    }
  }

  const playerWon = oCurrentCharIdx >= oSlots.length;
  return {
    playerWon,
    turns: turn,
    playerCardsPlayed,
    combosTriggered
  };
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    simulateDeckMatchups,
    META_GAUNTLET_DECKS
  };
}
