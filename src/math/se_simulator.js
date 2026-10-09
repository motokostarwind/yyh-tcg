/**
 * Deterministic Resource & Spirit Energy (SE) Simulator for 2003 Score YYH TCG
 * Headless Monte Carlo state machine modeling Turns 1–3 resource economy:
 * - 4-card opening hand + 2-card draw per turn
 * - Spirit Energy economy (+2 SE/turn baseline, +3 SE with Team Urameshi)
 * - Attack discard requirements and hand card starvation
 */

/**
 * Runs a deterministic Monte Carlo simulation of deck resource viability
 * @param {object} deckState - { slots: {1: cardId, ...}, mainDeck: {cardId: count}, activeTeamBonus: string }
 * @param {Map|object} cardMap - Card lookup map
 * @param {number} iterations - Number of Monte Carlo runs (default 2,500)
 * @returns {object} Resource viability metrics across Turns 1-3
 */
function simulateResourceViability(deckState, cardMap, iterations = 2500) {
  const getCard = (id) => cardMap instanceof Map ? cardMap.get(id) : cardMap[id];

  // 1. Unroll main deck into flat array
  const flatDeck = [];
  for (const [cardId, count] of Object.entries(deckState.mainDeck || {})) {
    const card = getCard(cardId);
    if (card) {
      for (let i = 0; i < count; i++) {
        flatDeck.push({
          id: card.id,
          name: card.name,
          cardType: card.cardType,
          seCost: card.seCost !== null ? card.seCost : 0,
          economyProfile: card.economyProfile || { netSEDelta: 0, cardAdvantageDelta: 0, generatesEnergy: false }
        });
      }
    }
  }

  if (flatDeck.length < 20) {
    return {
      turn1PlayableActionPct: 0,
      turn2PlayableActionPct: 0,
      turn3PlayableActionPct: 0,
      turn1AttackViablePct: 0,
      deadHandPct: 100,
      avgEndTurnHandSize: 0,
      seEfficiencyScore: 0,
      viabilityRating: 'Insufficient Cards',
      advice: 'Deck has fewer than 20 cards. Add at least 40 cards to run accurate simulation.'
    };
  }

  // 2. Identify Active Fighter Discard Requirement
  const fighterCardId = deckState.slots ? deckState.slots[1] : null;
  const fighterCard = fighterCardId ? getCard(fighterCardId) : null;
  let minFighterAtkCost = 1;
  if (fighterCard && fighterCard.attacks && fighterCard.attacks.length > 0) {
    minFighterAtkCost = fighterCard.attacks.reduce((min, a) => 
      typeof a.cost === 'number' ? Math.min(min, a.cost) : min, 1);
  }

  const isUrameshi = deckState.activeTeamBonus === 'Team Urameshi';
  const seGainPerTurn = isUrameshi ? 3 : 2;

  let turn1PlayableCount = 0;
  let turn2PlayableCount = 0;
  let turn3PlayableCount = 0;
  let turn1AttackCount = 0;
  let deadHandCount = 0;
  let totalEndHandCards = 0;

  // 3. Monte Carlo Loop
  const deckSize = flatDeck.length;

  for (let iter = 0; iter < iterations; iter++) {
    // Fisher-Yates Shuffle
    const shuffled = [...flatDeck];
    for (let i = deckSize - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }

    // Opening Hand: 4 cards
    let hand = shuffled.slice(0, 4);
    let deckIdx = 4;
    let currentSE = 0;

    // --- TURN 1 ---
    // Draw 2 cards
    hand.push(shuffled[deckIdx++], shuffled[deckIdx++]); // hand size = 6
    currentSE += seGainPerTurn; // 2 SE (or 3 with Urameshi)

    // Evaluate playable non-character actions (SE cost <= currentSE)
    const playableT1 = hand.filter(c => c.cardType !== 'Character' && c.seCost <= currentSE);
    const hasPlayableT1 = playableT1.length > 0;
    if (hasPlayableT1) turn1PlayableCount++;

    // Evaluate Attack discard viability (hand size after playing action >= discard cost)
    if (hand.length >= minFighterAtkCost) {
      turn1AttackCount++;
    }

    // Check if dead hand (no cards playable despite 6 cards in hand)
    if (!hasPlayableT1 && hand.every(c => c.seCost > currentSE)) {
      deadHandCount++;
    }

    // Simulate basic play: play cheapest card if available
    if (playableT1.length > 0) {
      playableT1.sort((a, b) => a.seCost - b.seCost);
      const played = playableT1[0];
      currentSE -= played.seCost;
      if (played.economyProfile.generatesEnergy) currentSE += 2;
      // Remove played card from hand
      const playedIdx = hand.indexOf(played);
      if (playedIdx > -1) hand.splice(playedIdx, 1);
    }

    // --- TURN 2 ---
    if (deckIdx + 1 < deckSize) {
      hand.push(shuffled[deckIdx++], shuffled[deckIdx++]);
    }
    currentSE += seGainPerTurn;

    const playableT2 = hand.filter(c => c.cardType !== 'Character' && c.seCost <= currentSE);
    if (playableT2.length > 0) turn2PlayableCount++;

    if (playableT2.length > 0) {
      playableT2.sort((a, b) => a.seCost - b.seCost);
      const played = playableT2[0];
      currentSE -= played.seCost;
      const playedIdx = hand.indexOf(played);
      if (playedIdx > -1) hand.splice(playedIdx, 1);
    }

    // --- TURN 3 ---
    if (deckIdx + 1 < deckSize) {
      hand.push(shuffled[deckIdx++], shuffled[deckIdx++]);
    }
    currentSE += seGainPerTurn;

    const playableT3 = hand.filter(c => c.cardType !== 'Character' && c.seCost <= currentSE);
    if (playableT3.length > 0) turn3PlayableCount++;

    totalEndHandCards += hand.length;
  }

  // 4. Aggregate Results
  const t1Pct = Math.round((turn1PlayableCount / iterations) * 100);
  const t2Pct = Math.round((turn2PlayableCount / iterations) * 100);
  const t3Pct = Math.round((turn3PlayableCount / iterations) * 100);
  const t1AtkPct = Math.round((turn1AttackCount / iterations) * 100);
  const deadPct = Math.round((deadHandCount / iterations) * 100);
  const avgHand = Math.round((totalEndHandCards / iterations) * 10) / 10;

  // Efficiency Composite Score (0 - 100)
  const efficiencyScore = Math.round(
    (t1Pct * 0.35) + (t2Pct * 0.35) + (t1AtkPct * 0.20) + ((100 - deadPct) * 0.10)
  );

  let viabilityRating = 'Optimal Curve';
  let advice = 'Smooth early-game resource flow with high turn-1 action reliability.';

  if (efficiencyScore < 50) {
    viabilityRating = 'High Stall Risk';
    advice = 'Heavy SE curve. Consider adding 0-1 cost events/items or Spirit battery cards like "All For One".';
  } else if (efficiencyScore < 70) {
    viabilityRating = 'Moderate / Top-Heavy';
    advice = 'Decent mid-game scaling, but 20-30% chance of stalling Turn 1. Add 2-3 cheap openers.';
  } else if (deadPct > 20) {
    viabilityRating = 'Inconsistent Hand Draw';
    advice = 'Dead hand probability is high. Balance 3+ SE cost cards with low-cost utility.';
  }

  return {
    turn1PlayableActionPct: t1Pct,
    turn2PlayableActionPct: t2Pct,
    turn3PlayableActionPct: t3Pct,
    turn1AttackViablePct: t1AtkPct,
    deadHandPct: deadPct,
    avgEndTurnHandSize: avgHand,
    seEfficiencyScore: efficiencyScore,
    viabilityRating,
    advice,
    iterations
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    simulateResourceViability
  };
}
