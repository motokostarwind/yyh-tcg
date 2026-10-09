/**
 * Combat Breakpoint & Damage Evaluator for 2003 Score Yu Yu Hakusho TCG
 * Evaluates probability of hitting 1-wound (>= 1x DEF) and 2-wound KO (>= 2x DEF)
 * against standard opponent defense tiers: 5,000, 6,000, 7,000, and 8,000 DEF.
 */

const DEFENSE_TIERS = [
  { tier: '5k', name: 'Lightweight (5,000 DEF)', def: 5000 },
  { tier: '6k', name: 'Standard (6,000 DEF)', def: 6000 },
  { tier: '7k', name: 'Heavyweight (7,000 DEF)', def: 7000 },
  { tier: '8k', name: 'Boss / Fortified (8,000 DEF)', def: 8000 }
];

/**
 * Computes combat breakpoint probabilities for a given deck
 * @param {object} deckState - { slots: {1: cardId, ...}, mainDeck: {cardId: count}, activeTeamBonus: string }
 * @param {Map|object} cardMap - Card lookup map
 * @returns {object} Breakpoint analysis across all 4 defense tiers
 */
function evaluateCombatBreakpoints(deckState, cardMap) {
  const getCard = (id) => cardMap instanceof Map ? cardMap.get(id) : cardMap[id];
  
  // 1. Gather Starting Fighters
  const startingChars = Object.values(deckState.slots || {})
    .filter(Boolean)
    .map(getCard)
    .filter(Boolean);

  if (startingChars.length === 0) {
    return {
      tiers: DEFENSE_TIERS.map(t => ({
        ...t,
        oneWoundPct: 0,
        twoWoundKOPct: 0,
        maxPotentialAtk: 0
      })),
      strongestFighter: null,
      recommendationSummary: 'Assign starting characters to evaluate combat breakpoints.'
    };
  }

  // 2. Identify Attacks & Base Potentials
  let teamAtkBonus = 0;
  if (deckState.activeTeamBonus === 'Team Toguro') {
    teamAtkBonus = 6000; // Can discard up to 2 cards for +3000 ATK each
  }

  // 3. Count in-deck Combat Pumps and Techniques
  let combatPumpCopies = 0;
  let techniqueAttacks = [];

  for (const [cardId, count] of Object.entries(deckState.mainDeck || {})) {
    const card = getCard(cardId);
    if (!card) continue;
    if (card.strategicRoles && card.strategicRoles.includes('atk_pump')) {
      combatPumpCopies += count;
    }
    if (card.cardType === 'Technique' && card.attacks && card.attacks.length > 0) {
      card.attacks.forEach(atk => {
        if (typeof atk.damage === 'number') {
          techniqueAttacks.push({ name: atk.name, damage: atk.damage, cardName: card.name });
        }
      });
    }
  }

  // 4. Calculate for each starting fighter
  const fighterBreakdowns = startingChars.map(char => {
    let charBaseMax = 0;
    (char.attacks || []).forEach(atk => {
      if (typeof atk.damage === 'number' && atk.damage > charBaseMax) {
        charBaseMax = atk.damage;
      }
    });

    const maxTechDamage = techniqueAttacks.reduce((max, t) => Math.max(max, t.damage), 0);
    const effectiveBaseAtk = Math.max(charBaseMax, maxTechDamage);
    const fullyBuffedAtk = effectiveBaseAtk + teamAtkBonus + (combatPumpCopies > 0 ? 3000 : 0);

    return {
      id: char.id,
      name: char.name,
      baseMaxAtk: charBaseMax,
      effectiveBaseAtk,
      fullyBuffedAtk
    };
  });

  const primaryFighter = fighterBreakdowns.reduce((best, f) => 
    (!best || f.fullyBuffedAtk > best.fullyBuffedAtk) ? f : best, null);

  // 5. Evaluate Probability of Hitting Breakpoints across DEF Tiers
  // P(hitting breakpoint) factors in base attacks + probability of drawing a combat pump card
  const totalCards = Object.values(deckState.mainDeck || {}).reduce((a, b) => a + b, 0);
  const pumpDrawProb = totalCards >= 40 && combatPumpCopies > 0
    ? (1 - Math.exp(-combatPumpCopies * 6 / totalCards)) // approx draw by Turn 1
    : 0;

  const tiers = DEFENSE_TIERS.map(t => {
    const req1Wound = t.def;
    const req2Wound = t.def * 2;

    // How many starting characters can naturally hit 1 wound / 2 wounds?
    let canHit1Natural = 0;
    let canHit2Natural = 0;
    let canHit1Buffed = 0;
    let canHit2Buffed = 0;

    fighterBreakdowns.forEach(f => {
      const base = f.effectiveBaseAtk + (deckState.activeTeamBonus === 'Team Toguro' ? 3000 : 0);
      const buffed = f.fullyBuffedAtk;

      if (base >= req1Wound) canHit1Natural++;
      if (base >= req2Wound) canHit2Natural++;
      if (buffed >= req1Wound) canHit1Buffed++;
      if (buffed >= req2Wound) canHit2Buffed++;
    });

    const charCount = startingChars.length;
    // Composite probability estimates:
    const base1Pct = (canHit1Natural / charCount);
    const buff1Pct = (canHit1Buffed / charCount);
    const oneWoundPct = Math.round(Math.min(100, (base1Pct * 0.7 + buff1Pct * 0.3 * (1 + pumpDrawProb))) * 100);

    const base2Pct = (canHit2Natural / charCount);
    const buff2Pct = (canHit2Buffed / charCount);
    const twoWoundKOPct = Math.round(Math.min(100, (base2Pct * 0.6 + buff2Pct * 0.4 * (pumpDrawProb || 0.5))) * 100);

    return {
      tier: t.tier,
      name: t.name,
      def: t.def,
      threshold1Wound: req1Wound,
      threshold2WoundKO: req2Wound,
      oneWoundPct: Math.min(100, Math.max(0, oneWoundPct)),
      twoWoundKOPct: Math.min(100, Math.max(0, twoWoundKOPct)),
      maxPotentialAtk: primaryFighter ? primaryFighter.fullyBuffedAtk : 0
    };
  });

  return {
    tiers,
    primaryFighter,
    fighterBreakdowns,
    combatPumpCopies,
    hasToguroBurst: deckState.activeTeamBonus === 'Team Toguro'
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFENSE_TIERS,
    evaluateCombatBreakpoints
  };
}
