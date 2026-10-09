/**
 * Team Matchup & Meta Evaluation Engine for 2003 Score Yu Yu Hakusho TCG
 * Evaluates the deck's relative power scale (1–100%) against all 9 official team archetypes,
 * identifying tactical vulnerabilities, strengths, and add/remove card suggestions.
 */

const TEAM_PROFILES = {
  'Team Toguro': {
    name: 'Team Toguro',
    icon: '💪',
    archetype: 'Discard Hyper-Aggro / Burst KO',
    desc: 'Discards up to 2 cards per attack for +3000 ATK each (+6k burst), aiming for Turn 1-2 critical KOs.',
    vulnerableTo: ['damage_prevention', 'anti_discard', 'high_def'],
    counters: ['low_def', 'slow_ramp']
  },
  'Team Genkai': {
    name: 'Team Genkai',
    icon: '🥋',
    archetype: 'Technique Voltron / Mastery',
    desc: 'Spamming and duplicating techniques (Rubber Slam) to build unassailable attack and defense stacks.',
    vulnerableTo: ['anti_technique', 'technique_removal', 'hand_disrupt'],
    counters: ['item_heavy', 'low_def']
  },
  'Team Saint Beasts': {
    name: 'Team Saint Beasts',
    icon: '🐉',
    archetype: 'End-Turn Draw Engine / Card Advantage',
    desc: 'Draws +1 extra card at the end of every turn, creating relentless hand advantage and filtering.',
    vulnerableTo: ['hand_punish', 'speed_burst', 'deck_mill'],
    counters: ['cards_requiring_hand_superiority', 'attrition']
  },
  'Team Urameshi': {
    name: 'Team Urameshi',
    icon: '⚡',
    archetype: 'Spirit Ramp & Recursive Bottoming',
    desc: 'Gains +1 extra Spirit Energy per turn; discarded attack costs return to bottom of deck instead of graveyard.',
    vulnerableTo: ['anti_discard', 'deck_mill', 'turn1_burst'],
    counters: ['slow_control', 'low_se']
  },
  'Team Uraotogi': {
    name: 'Team Uraotogi',
    icon: '⚔️',
    archetype: 'Item Toolbox & Weapon Attachments',
    desc: 'Equips multiple powerful items across match slots for continuous passive stat boosts and effects.',
    vulnerableTo: ['anti_item', 'item_removal', 'raw_def'],
    counters: ['itemless_builds', 'slow_finishers']
  },
  'Team Masho': {
    name: 'Team Masho',
    icon: '🥷',
    archetype: 'Facedown Ambush & 5th Character Setup',
    desc: 'Sets up 5 characters with 4 hidden facedown slots, executing surprise swaps and hidden triggers.',
    vulnerableTo: ['faceup_reveals', 'sideline_targeting', 'fixed_damage'],
    counters: ['blind_aggro', 'single_target_control']
  },
  'Team Rokuyukai': {
    name: 'Team Rokuyukai',
    icon: '🎲',
    archetype: 'Dice Variance & Suiken Damage Immunity',
    desc: 'Manipulates attack costs and rolls dice. Chu’s Suiken grants complete immunity to 1-cost attacks.',
    vulnerableTo: ['high_cost_attacks', 'piercing_damage', 'fixed_modifiers'],
    counters: ['1_cost_pure_attacks', 'unbuffed_fighters']
  },
  'Team Sensui': {
    name: 'Team Sensui',
    icon: '🌀',
    archetype: 'Domain / Territory Lockout',
    desc: 'Territory cards and dual Hero/Villain status creating domain rules that restrict opponent options.',
    vulnerableTo: ['pre_territory_tempo', 'early_burst_ko'],
    counters: ['mono_alignment_tech', 'slow_setup']
  },
  'Team Koenma': {
    name: 'Team Koenma',
    icon: '👑',
    archetype: 'Event Recycling & Discard Manipulation',
    desc: 'Recycles powerful events from the discard pile, re-triggering removal and utility.',
    vulnerableTo: ['graveyard_lock', 'anti_meta_tech', 'tempo_aggro'],
    counters: ['telegraph_strategies']
  }
};

/**
 * Evaluates deck matchup ratings against all 9 teams
 * @param {object} deckState - { slots, mainDeck, activeTeamBonus }
 * @param {Map|object} cardMap - Card lookup
 * @param {object} combatBreakpoints - Precomputed combat breakpoints
 * @returns {object} Matchup results array and universal advice
 */
function evaluateAllMatchups(deckState, cardMap, combatBreakpoints) {
  const getCard = (id) => cardMap instanceof Map ? cardMap.get(id) : cardMap[id];

  // 1. Gather Deck Characteristics
  const startingChars = Object.values(deckState.slots || {})
    .filter(Boolean)
    .map(getCard)
    .filter(Boolean);

  const mainDeckCards = [];
  let totalCards = 0;
  for (const [id, count] of Object.entries(deckState.mainDeck || {})) {
    const card = getCard(id);
    if (card) {
      mainDeckCards.push({ card, count });
      totalCards += count;
    }
  }

  const avgDef = startingChars.length > 0 
    ? startingChars.reduce((sum, c) => sum + (c.defense || 5000), 0) / startingChars.length 
    : 5500;

  // Tally tech counters in deck
  const techCounts = {
    anti_item: 0,
    anti_technique: 0,
    anti_discard: 0,
    damage_prevention: 0,
    hand_punish: 0,
    deck_mill: 0,
    atk_pump: 0,
    card_draw: 0
  };

  mainDeckCards.forEach(({ card, count }) => {
    const aff = card.counterplayAffinities || {};
    if (aff.techType && techCounts[aff.techType] !== undefined) {
      techCounts[aff.techType] += count;
    }
    (card.strategicRoles || []).forEach(r => {
      if (techCounts[r] !== undefined) techCounts[r] += count;
    });
  });

  // 2. Evaluate Each Team Matchup
  const results = [];
  const universalNeeds = {};

  for (const [teamName, profile] of Object.entries(TEAM_PROFILES)) {
    let powerScore = 50; // Neutral baseline
    const strengths = [];
    const vulnerabilities = [];
    const addSuggestions = [];
    const removeSuggestions = [];

    // --- Team Toguro (Burst Aggro) ---
    if (teamName === 'Team Toguro') {
      if (avgDef >= 7000) {
        powerScore += 18;
        strengths.push('High starting DEF (>=7,000) naturally resists Toguro’s +6,000 ATK burst attacks.');
      } else if (avgDef < 6000) {
        powerScore -= 18;
        vulnerabilities.push('Average starting DEF (<6,000) is in danger of Turn 1-2 double-damage KOs.');
        addSuggestions.push('"Defensive Posture": Grants +3,000 DEF to survive Toguro’s +6,000 burst attack without taking a 2-wound lethal KO.');
        addSuggestions.push('"Halt!": Stops opponent combat events, shutting down burst damage modifiers.');
        removeSuggestions.push('Low DEF fighters (<6,000 DEF) without protection that get one-shot by Toguro burst attacks.');
      }
      if (techCounts.damage_prevention > 0) {
        powerScore += 16;
        strengths.push('Damage mitigation tech stops lethal burst attacks.');
      } else {
        addSuggestions.push('"Spirit Cuffs": Imposes -2,000 ATK penalty to keep Toguro under double-damage thresholds.');
      }
      if (techCounts.anti_discard > 0) {
        powerScore += 14;
        strengths.push('Anti-discard tech restricts Toguro hand discard synergies.');
      }
    }

    // --- Team Genkai (Technique Heavy) ---
    else if (teamName === 'Team Genkai') {
      if (techCounts.anti_technique > 0) {
        powerScore += 25;
        strengths.push('Technique removal directly dismantles Genkai’s primary win condition.');
      } else {
        powerScore -= 12;
        vulnerabilities.push('Zero technique counters; vulnerable to Rubber Slam duplication voltrons.');
        addSuggestions.push('"The Genkai Bunch": Discards face-up techniques in play to shatter Rubber Slam duplication stacks.');
        addSuggestions.push('"Sabotage": Forces opponent to discard key techniques before declaring attacks.');
        addSuggestions.push('"Botan\'s Calling": Specifically targets opponents using Genkai Team Bonus to discard 2 techniques and heal 2 damage.');
        removeSuggestions.push('Heavy weapon/item attachments with no technique defense, giving Genkai free tempo.');
      }
    }

    // --- Team Saint Beasts (Card Draw Heavy) ---
    else if (teamName === 'Team Saint Beasts') {
      let hasWeakVsHand = false;
      mainDeckCards.forEach(({ card }) => {
        if (card.counterplayAffinities?.weakAgainstTeams?.includes('Team Saint Beasts')) {
          hasWeakVsHand = true;
          removeSuggestions.push(`"${card.name}": Dead card here (requires hand size superiority, but Saint Beasts draws +1 extra card every turn).`);
        }
      });
      if (hasWeakVsHand) powerScore -= 15;

      if (techCounts.hand_punish > 0) {
        powerScore += 22;
        strengths.push('Hand-punishing tech chokes opponent draw advantage.');
      } else {
        addSuggestions.push('"Sabotage": Forces opponent to discard cards from hand, neutralizing Saint Beasts’ +1 card draw bonus.');
        addSuggestions.push('"Overwhelming Kill": Deals 4 damage in one turn to win before opponent card filtering accumulates.');
      }
    }

    // --- Team Urameshi (Spirit Ramp & Bottoming) ---
    else if (teamName === 'Team Urameshi') {
      if (techCounts.deck_mill > 0) {
        powerScore += 18;
        strengths.push('Deck mill disrupts Urameshi bottom-deck attack cost recursion.');
      }
      if (techCounts.anti_discard > 0) {
        powerScore += 15;
        strengths.push('Stand Off shuts down opponent deck manipulation.');
      } else {
        addSuggestions.push('"Stand Off": Shuts down deck manipulation & bottom-deck cycling, forcing Urameshi to expend real resources.');
        addSuggestions.push('"Mistaken Fatality": Matches and drains opposing Spirit Energy, neutralizing Urameshi’s energy ramp.');
        removeSuggestions.push('Passive stall decks that give Urameshi free turns to ramp Spirit Energy.');
      }
    }

    // --- Team Uraotogi (Item Toolbox) ---
    else if (teamName === 'Team Uraotogi') {
      if (techCounts.anti_item > 0) {
        powerScore += 26;
        strengths.push('Item removal (Test of Champions) completely wipes their weapon attachments.');
      } else {
        powerScore -= 10;
        vulnerabilities.push('Vulnerable to multiple equipped items boosting opponent fighters.');
        addSuggestions.push('"Test of Champions": Limit 1 per deck that destroys all items in the Arena, dismantling Uraotogi’s item engine.');
        addSuggestions.push('"M2, Ryo": Discards an equipped face-up item on attack, removing weapon stat buffs.');
        removeSuggestions.push('Item-dependent strategies that lack removal, losing in head-to-head weapon trades against Uraotogi.');
      }
    }

    // --- Team Masho (Facedown Ambush & 5th Character) ---
    else if (teamName === 'Team Masho') {
      addSuggestions.push('"Demon Compass": Scouts and reveals facedown characters to prevent surprise ambushes.');
      addSuggestions.push('"I\'m Callin\' You Out!": Drags hidden sideline characters directly into combat, shutting down swap tricks.');
      removeSuggestions.push('High-cost single-target attacks vulnerable to Masho’s hidden sideline replacement triggers.');
    }

    // --- Team Rokuyukai (Suiken 1-Cost Immunity) ---
    else if (teamName === 'Team Rokuyukai') {
      let only1CostAttacks = true;
      startingChars.forEach(c => {
        (c.attacks || []).forEach(a => {
          if (a.cost > 1) only1CostAttacks = false;
        });
      });
      if (only1CostAttacks) {
        powerScore -= 20;
        vulnerabilities.push('Heavy reliance on 1-cost attacks will be completely negated by Chu’s Suiken Technique.');
        addSuggestions.push('"Buzz Attack": Modulates attack costs up or down by 1, bypassing Chu’s 1-cost attack immunity.');
        addSuggestions.push('2-Cost or 3-Cost Techniques ("Dragon of the Darkness Flame", "Spirit Gun Double"): Deal heavy unblockable damage that ignores Suiken.');
        removeSuggestions.push('1-Cost basic attacks (e.g. Spirit Palm Blast, Basic Strike) which deal 0 damage against Suiken Chu.');
      } else {
        powerScore += 12;
        strengths.push('Diverse attack costs can bypass 1-cost damage negation.');
      }
    }

    // --- Team Sensui (Domain / Territory Lockout) ---
    else if (teamName === 'Team Sensui') {
      addSuggestions.push('"Time Out": Cancels active phase events and territory setup, resetting domain advantages.');
      addSuggestions.push('"Rush": Allows immediate follow-up attacks to KO Sensui fighters before they establish multi-personality domains.');
      removeSuggestions.push('Narrow Hero-only or Villain-only tech that fails against Sensui’s dual alignment status.');
    }

    // --- Team Koenma (Event Recycling) ---
    else if (teamName === 'Team Koenma') {
      addSuggestions.push('"Backyard Dummy": Counters and redirects powerful recycled events.');
      addSuggestions.push('"Sabotage": Forces hand discards before Koenma can resolve and recycle events from the graveyard.');
      removeSuggestions.push('Telegraphed plays without event protection, leaving you vulnerable to recycled removal spells.');
    }

    // Clamp score 15 - 95
    powerScore = Math.min(95, Math.max(15, powerScore));

    let status = 'Balanced';
    if (powerScore >= 65) status = 'Favorable';
    else if (powerScore < 45) status = 'Unfavorable';

    // Track cross-matchup suggestions
    if (powerScore < 50 && addSuggestions.length > 0) {
      addSuggestions.forEach(s => {
        universalNeeds[s] = (universalNeeds[s] || 0) + 1;
      });
    }

    results.push({
      teamName,
      icon: profile.icon,
      archetype: profile.archetype,
      desc: profile.desc,
      powerScore,
      status,
      strengths,
      vulnerabilities,
      addSuggestions,
      removeSuggestions
    });
  }

  // Determine Universal Suggestion
  let universalSuggestion = 'Deck demonstrates a well-rounded baseline across all major team matchups.';
  const sortedNeeds = Object.entries(universalNeeds).sort((a, b) => b[1] - a[1]);
  if (sortedNeeds.length > 0 && sortedNeeds[0][1] >= 2) {
    universalSuggestion = `Key Tech Recommendation: ${sortedNeeds[0][0]} (Improves win rate against ${sortedNeeds[0][1]} team matchups).`;
  }

  return {
    matchups: results,
    universalSuggestion,
    overallMetaRating: Math.round(results.reduce((sum, r) => sum + r.powerScore, 0) / results.length)
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TEAM_PROFILES,
    evaluateAllMatchups
  };
}
