/**
 * Web Worker & Synergy Calculation Engine for 2003 Score Yu Yu Hakusho TCG
 * Computes deterministic simulations, combat breakpoints, team matchups,
 * archetype classification, and context-aware card recommendations.
 */

// If running in Worker, import scripts or execute inline
if (typeof importScripts === 'function') {
  try {
    importScripts('../math/hypergeometric.js');
    importScripts('../math/combat_breakpoints.js');
    importScripts('../math/se_simulator.js');
    importScripts('../math/matchup_simulator.js');
    importScripts('matchup_evaluator.js');
  } catch (e) {
    console.warn('Worker importScripts fallback to bundled functions');
  }
}

/**
 * Evaluates the dominant archetype of the current deck
 */
function detectDeckArchetype(deckState, cardMap) {
  const getCard = (id) => cardMap instanceof Map ? cardMap.get(id) : cardMap[id];
  
  let roleScores = {
    burst_aggro: 0,
    defensive_control: 0,
    technique_voltron: 0,
    deck_mill: 0,
    spirit_battery: 0
  };

  if (deckState.activeTeamBonus === 'Team Toguro') roleScores.burst_aggro += 15;
  if (deckState.activeTeamBonus === 'Team Genkai') roleScores.technique_voltron += 15;
  if (deckState.activeTeamBonus === 'Team Urameshi') roleScores.spirit_battery += 15;

  for (const [id, count] of Object.entries(deckState.mainDeck || {})) {
    const card = getCard(id);
    if (!card) continue;
    const roles = card.strategicRoles || [];

    if (roles.includes('atk_pump')) roleScores.burst_aggro += count * 2;
    if (roles.includes('damage_finisher')) roleScores.burst_aggro += count * 3;
    if (roles.includes('def_buff') || roles.includes('anti_meta_tech')) roleScores.defensive_control += count * 2;
    if (card.cardType === 'Technique') roleScores.technique_voltron += count * 2;
    if (roles.includes('deck_mill')) roleScores.deck_mill += count * 3;
    if (roles.includes('se_battery')) roleScores.spirit_battery += count * 2;
  }

  const sorted = Object.entries(roleScores).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];

  const ARCHETYPE_META = {
    burst_aggro: {
      name: 'Burst Aggro / Breakpoint KO',
      icon: '⚡',
      desc: 'Focuses on high attack values and explosive combat pumps to hit double-damage KO breakpoints.'
    },
    defensive_control: {
      name: 'Defensive Control / Attrition',
      icon: '🛡️',
      desc: 'Relies on high starting DEF, damage mitigation shields, and anti-meta lockouts.'
    },
    technique_voltron: {
      name: 'Technique Toolbox / Voltron',
      icon: '🥋',
      desc: 'Equips versatile technique cards to adapt attack ranges and trigger powerful special techniques.'
    },
    deck_mill: {
      name: 'Deck Mill & Resource Starvation',
      icon: '🌀',
      desc: 'Pressures the opponent by exhausting their deck cards and restricting hand resources.'
    },
    spirit_battery: {
      name: 'Spirit Ramp & High-Cost Finishers',
      icon: '🔋',
      desc: 'Rapidly accelerates Spirit Energy accumulation to fuel heavy turn 2-3 game-winning events.'
    }
  };

  return ARCHETYPE_META[top[0]] || ARCHETYPE_META.burst_aggro;
}

/**
 * Identifies missing strategic role gaps in the deck
 */
function analyzeRoleGaps(deckState, cardMap, seViability, combatBreakpoints) {
  const getCard = (id) => cardMap instanceof Map ? cardMap.get(id) : cardMap[id];
  const gaps = [];

  const mainCounts = {
    card_draw: 0,
    atk_pump: 0,
    def_buff: 0,
    damage_finisher: 0,
    anti_meta_tech: 0,
    se_battery: 0
  };

  let totalCards = 0;
  for (const [id, count] of Object.entries(deckState.mainDeck || {})) {
    const card = getCard(id);
    if (!card) continue;
    totalCards += count;
    (card.strategicRoles || []).forEach(r => {
      if (mainCounts[r] !== undefined) mainCounts[r] += count;
    });
  }

  if (totalCards >= 10) {
    // 1. Card draw check
    if (mainCounts.card_draw === 0) {
      gaps.push({
        role: 'card_draw',
        title: 'Need Card Draw Engine',
        desc: 'Your deck has 0 card draw spells. Attack discard costs create high hand starvation risk. Recommend adding 2-3 draw cards.',
        urgency: 'high'
      });
    }

    // 2. Combat pump check
    const tier6kKO = combatBreakpoints?.tiers?.find(t => t.tier === '6k')?.twoWoundKOPct || 0;
    if (tier6kKO < 30 && mainCounts.atk_pump < 3) {
      gaps.push({
        role: 'atk_pump',
        title: 'Low Double-Damage KO Frequency',
        desc: 'Less than 30% chance of reaching double-damage against standard 6,000 DEF opponents. Recommend adding 2-3 combat pump cards.',
        urgency: 'high'
      });
    }

    // 3. Finisher check
    if (mainCounts.atk_pump >= 4 && mainCounts.damage_finisher === 0) {
      gaps.push({
        role: 'damage_finisher',
        title: 'Capitalize with Finisher Cards',
        desc: 'Your deck has strong combat pumps. Adding finisher cards like "Overwhelming Kill" or "Tag Team" converts high attack spikes into 4-wound match wins!',
        urgency: 'medium'
      });
    }

    // 4. Heavy curve check
    if (seViability?.deadHandPct > 20) {
      gaps.push({
        role: 'se_battery',
        title: 'Heavy SE Curve / Stall Risk',
        desc: `High probability (${seViability.deadHandPct}%) of stalling in opening hand. Recommend 0-1 cost openers or SE battery cards like "All For One".`,
        urgency: 'high'
      });
    }
  }

  return gaps;
}

/**
 * Scores candidate cards against the current deck and selects top recommendations
 */
function generateCardRecommendations(deckState, cardMap, allCards, gaps, activeTeam) {
  const getCard = (id) => cardMap instanceof Map ? cardMap.get(id) : cardMap[id];
  const deckCardIds = new Set(Object.keys(deckState.mainDeck || {}));
  const deckCardNames = new Set();
  
  // Starting characters
  const startingChars = Object.values(deckState.slots || {}).filter(Boolean).map(getCard).filter(Boolean);
  startingChars.forEach(c => deckCardNames.add(c.name.toLowerCase()));

  for (const id of deckCardIds) {
    const c = getCard(id);
    if (c) deckCardNames.add(c.name.toLowerCase());
  }

  const gapRoles = new Set(gaps.map(g => g.role));
  const scored = [];

  allCards.forEach(candidate => {
    // Skip if already at max copies in deck
    const currentCount = (deckState.mainDeck || {})[candidate.id] || 0;
    if (currentCount >= (candidate.limitPerDeck || 3)) return;

    // Hard prerequisite check: if card requires a team bonus that differs from active team, do NOT recommend!
    let hasUnmetPrereq = false;
    (candidate.prerequisites || []).forEach(p => {
      if (p.isHardRequirement && p.type === 'team_bonus' && p.target !== activeTeam) {
        hasUnmetPrereq = true;
      }
    });
    if (hasUnmetPrereq) return;

    // Do NOT recommend anti-X tech to someone running Team X!
    if (activeTeam && candidate.counterplayAffinities?.strongAgainstTeams?.includes(activeTeam)) {
      return;
    }

    let score = 0;
    const reasons = [];
    let detailedWhy = '';

    // 1. Team Bonus Affinity
    if (candidate.team && activeTeam && candidate.team === activeTeam) {
      score += 30;
      reasons.push(`Matches ${activeTeam}`);
      detailedWhy = `Matches your active ${activeTeam} team bonus, maintaining team cohesion and triggering team trait benefits.`;
    }

    // 2. Prerequisite match
    (candidate.prerequisites || []).forEach(p => {
      if (p.type === 'team_bonus' && p.target === activeTeam) {
        score += 35;
        reasons.push(`Unlocks full power with ${activeTeam}`);
        detailedWhy = `Specifically designed for ${activeTeam}; unleashes maximum card effects when this team bonus is active.`;
      }
      if (p.type === 'card_name' && deckCardNames.has(p.target.toLowerCase())) {
        score += 45;
        reasons.push(`Synergizes with "${p.target}"`);
        detailedWhy = `Forms a powerful direct synergy with "${p.target}" already placed in your deck.`;
      }
    });

    // 3. Fulfills a strategic role gap
    (candidate.strategicRoles || []).forEach(r => {
      if (gapRoles.has(r)) {
        score += 25;
        if (r === 'card_draw') {
          reasons.push('Fills Card Draw Gap');
          if (!detailedWhy) detailedWhy = 'Addresses your deck’s card draw shortage by providing reliable hand refill to fund attack discard costs.';
        }
        if (r === 'atk_pump') {
          reasons.push('Boosts KO Breakpoint');
          if (!detailedWhy) detailedWhy = 'Provides decisive combat attack pumps (+2,000 to +3,000 ATK) to cross the double-damage KO threshold against standard 6,000 DEF fighters.';
        }
        if (r === 'damage_finisher') {
          reasons.push('Provides Lethal Finisher');
          if (!detailedWhy) detailedWhy = 'Converts high attack values into 2 to 4 wounds in a single turn to secure immediate match victories.';
        }
        if (r === 'se_battery') {
          reasons.push('Smooths SE Curve');
          if (!detailedWhy) detailedWhy = 'Accelerates Spirit Energy generation, smoothing out heavy Turn 1-2 costs and preventing resource starvation.';
        }
        if (r === 'def_buff') {
          reasons.push('Defense Reinforcement');
          if (!detailedWhy) detailedWhy = 'Boosts defense to protect your key fighters from opposing Turn 1 burst attacks.';
        }
      }
    });

    // 4. Universal Combo Lines match
    (candidate.comboLines || []).forEach(combo => {
      const partnerInDeck = (combo.partnerCards || []).find(p => deckCardNames.has(p.toLowerCase()));
      if (partnerInDeck) {
        score += 50;
        reasons.push(`Combos with "${partnerInDeck}"`);
        detailedWhy = `Combos directly with "${partnerInDeck}" in your deck (${combo.comboName}): ${combo.tacticalExplanation || combo.explanation}`;
      }
    });

    // 5. Team-specific strategic archetype synergy
    if (activeTeam === 'Team Genkai' && candidate.cardType === 'Technique') {
      score += 20;
      reasons.push('Genkai Technique Synergy');
      if (!detailedWhy) detailedWhy = 'Provides an additional versatile technique attack, maximizing Team Genkai’s technique mastery and duplication tools.';
    } else if (activeTeam === 'Team Toguro' && (candidate.strategicRoles || []).includes('atk_pump')) {
      score += 20;
      reasons.push('Toguro Burst Stacking');
      if (!detailedWhy) detailedWhy = 'Stacks combat attack value alongside Toguro’s +6,000 ATK discard bonus for overwhelming 2-wound match KOs.';
    } else if (activeTeam === 'Team Urameshi' && (candidate.seCost >= 2 || (candidate.attacks || []).some(a => a.cost >= 2))) {
      score += 15;
      reasons.push('Urameshi Resource Synergy');
      if (!detailedWhy) detailedWhy = 'Capitalizes on Team Urameshi’s +1 extra Spirit Energy per turn and bottom-deck attack cost recursion.';
    }

    if (score > 15) {
      scored.push({
        card: candidate,
        score,
        primaryReason: reasons[0] || 'Strong synergy fit',
        allReasons: reasons,
        detailedWhy: detailedWhy || 'Strong overall fit that improves deck efficiency, combat thresholds, and consistency.'
      });
    }
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 12);
}

/**
 * Main Calculation Controller
 */
function processSynergyEngine(deckState, allCards, combosCatalog = []) {
  const cardMap = new Map();
  allCards.forEach(c => cardMap.set(c.id, c));

  // 1. Resource Viability Simulation (2,500 Monte Carlo runs)
  const seViability = simulateResourceViability(deckState, cardMap, 2500);

  // 2. Combat Breakpoint Evaluation (vs 5k, 6k, 7k, 8k DEF)
  const combatBreakpoints = evaluateCombatBreakpoints(deckState, cardMap);

  // 3. Team Matchup Power Scale (vs 9 teams)
  const teamMatchups = evaluateAllMatchups(deckState, cardMap, combatBreakpoints);

  // 4. Deck Archetype Detection
  const archetype = detectDeckArchetype(deckState, cardMap);

  // 5. Strategic Role Gap Analysis
  const roleGaps = analyzeRoleGaps(deckState, cardMap, seViability, combatBreakpoints);

  // 6. Context-Aware Card Recommendations
  const recommendations = generateCardRecommendations(
    deckState,
    cardMap,
    allCards,
    roleGaps,
    deckState.activeTeamBonus
  );

  // 7. Draw timeline for key roles
  const totalDeckCards = Object.values(deckState.mainDeck || {}).reduce((a, b) => a + b, 0);
  const drawTimelines = {
    card_draw: calculateDrawTimeline(totalDeckCards, countRoleCards(deckState, cardMap, 'card_draw')),
    atk_pump: calculateDrawTimeline(totalDeckCards, countRoleCards(deckState, cardMap, 'atk_pump')),
    anti_meta_tech: calculateDrawTimeline(totalDeckCards, countRoleCards(deckState, cardMap, 'anti_meta_tech'))
  };

  // 8. Monte Carlo Deck Matchup Simulation & Synergy Discovery (1,000 matches)
  let matchupSimulation = null;
  if (typeof simulateDeckMatchups === 'function') {
    try {
      matchupSimulation = simulateDeckMatchups(deckState, cardMap, combosCatalog || [], 250);
    } catch (simErr) {
      console.warn('Matchup simulation error:', simErr);
    }
  }

  return {
    seViability,
    combatBreakpoints,
    teamMatchups,
    archetype,
    roleGaps,
    recommendations,
    drawTimelines,
    matchupSimulation
  };
}

function countRoleCards(deckState, cardMap, role) {
  const getCard = (id) => cardMap instanceof Map ? cardMap.get(id) : cardMap[id];
  let count = 0;
  for (const [id, qty] of Object.entries(deckState.mainDeck || {})) {
    const card = getCard(id);
    if (card && card.strategicRoles && card.strategicRoles.includes(role)) {
      count += qty;
    }
  }
  return count;
}

// Worker message handling
const isDedicatedWorker = (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) ||
                          (typeof importScripts === 'function' && typeof window === 'undefined');
if (isDedicatedWorker && typeof self.postMessage === 'function') {
  self.onmessage = function(e) {
    const { deckState, allCards, combosCatalog } = e.data;
    try {
      const results = processSynergyEngine(deckState, allCards, combosCatalog);
      self.postMessage({ success: true, results });
    } catch (err) {
      self.postMessage({ success: false, error: err.message });
    }
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    detectDeckArchetype,
    analyzeRoleGaps,
    generateCardRecommendations,
    processSynergyEngine
  };
}
