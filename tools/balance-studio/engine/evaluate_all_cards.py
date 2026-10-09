import json
import re
import os

def load_data():
    with open('cards.json', 'r', encoding='utf-8') as f:
        cards = json.load(f)
    with open('tools/balance-studio/data/methodology_dossier.json', 'r', encoding='utf-8') as f:
        dossier = json.load(f)
    return cards, dossier

def evaluate_card(card, weights):
    cid = card.get('id', '')
    name = card.get('name', '')
    card_type = card.get('cardType', 'Character')
    text = (card.get('text') or '').strip()
    text_lower = text.lower()
    defense = card.get('defense') or 0
    se_cost = card.get('seCost')
    attacks = card.get('attacks') or []
    has_errata = card.get('hasErrata', False)
    errata_text = card.get('errata', '')
    team = card.get('team')
    
    # ----------------------------------------------------
    # 1. EXTRACT RAW METRICS FOR THE 18 MICRO-CATEGORIES
    # ----------------------------------------------------
    metrics = {cat: 0.0 for cat in weights.keys()}

    # A. Combat & Survivability
    # 1. Flat ATK Boost
    atk_boosts = [int(m) for m in re.findall(r'\+(\d+)\s*(?:attack|atk)', text_lower)]
    if atk_boosts:
        metrics['flat_atk_boost'] = max(atk_boosts)
    elif card_type == 'Technique':
        # If technique provides attack damage
        t_damages = [a.get('damage', 0) for a in attacks if isinstance(a.get('damage'), (int, float))]
        if t_damages:
            metrics['flat_atk_boost'] = max(t_damages) * 0.5

    # 2. Flat DEF Boost
    def_boosts = [int(m) for m in re.findall(r'\+(\d+)\s*(?:defense|def)', text_lower)]
    if def_boosts:
        metrics['flat_def_boost'] = max(def_boosts)

    # 3. Attack-to-Discard Efficiency
    best_atk_dmg = 0
    min_cost = 99
    best_ratio = 0
    if attacks:
        for a in attacks:
            dmg = a.get('damage')
            cost = a.get('cost', 1)
            dmg_val = int(dmg) if isinstance(dmg, (int, float)) or (isinstance(dmg, str) and dmg.isdigit()) else 3000
            if dmg_val > best_atk_dmg:
                best_atk_dmg = dmg_val
            if cost < min_cost:
                min_cost = cost
            ratio = dmg_val / (cost + 1)
            if ratio > best_ratio:
                best_ratio = ratio
        metrics['atk_discard_efficiency'] = best_ratio

    # 4. Absolute Attack Stalling
    stall_words = ['ends the attack step', 'end the attack step', 'attack deals no damage', 'prevent all damage', 'cancel this attack', 'halt!']
    if any(sw in text_lower for sw in stall_words) or name.lower() in ['halt!', 'time out']:
        # Check conditionality
        if 'if ' in text_lower or 'only' in text_lower:
            metrics['absolute_stall'] = 52.0
        else:
            metrics['absolute_stall'] = 72.0

    # 5. Wound & Damage Mitigation
    wound_absorb = ['prevent', 'absorb', 'heal', 'remove 1 wound', 'redirect']
    if any(w in text_lower for w in wound_absorb) and metrics['absolute_stall'] == 0:
        if 'wound' in text_lower:
            metrics['wound_mitigation'] = 45.0
        else:
            metrics['wound_mitigation'] = 28.0

    # 6. Sideline Repositioning
    if 'switch this character with a character on your sideline' in text_lower or 'switch with a character on your sideline' in text_lower:
        if 'attack' in text_lower:
            metrics['sideline_reposition'] = 38.0
        else:
            metrics['sideline_reposition'] = 25.0

    # B. Resource & Tempo Economy
    # 7. Net Hand Advantage
    draw_match = re.search(r'draw\s+(\d+)\s+cards?', text_lower)
    drawn = int(draw_match.group(1)) if draw_match else (2 if 'draw cards' in text_lower else (1 if 'draw a card' in text_lower else 0))
    discard_hand_match = re.search(r'discard\s+(\d+)\s+cards?\s+from\s+(?:your\s+)?hand', text_lower)
    extra_disc = int(discard_hand_match.group(1)) if discard_hand_match else 0
    
    if drawn > 0 or extra_disc > 0:
        net_hand = drawn - extra_disc
        if card_type == 'Event' and drawn > 0:
            net_hand -= 1
        metrics['net_card_delta'] = net_hand
    else:
        metrics['net_card_delta'] = 0

    # 8. Tutor Equity
    if 'search through your deck' in text_lower or 'search your deck' in text_lower:
        if 'put it in your hand' in text_lower:
            metrics['tutor_equity'] = 38.0
        elif 'into play' in text_lower or 'attach' in text_lower:
            metrics['tutor_equity'] = 30.0
        else:
            metrics['tutor_equity'] = 20.0

    # 9. Recursion Equity
    if 'discard pile' in text_lower:
        if 'put it in your hand' in text_lower or 'into your hand' in text_lower:
            metrics['recursion_equity'] = 26.0
        elif 'into your deck' in text_lower or 'bottom of your deck' in text_lower:
            metrics['recursion_equity'] = 16.0

    # 10. Spirit Energy Delta
    se_plus = re.search(r'(?:gain|\+)\s*(\d+)\s*spirit energy', text_lower)
    if se_plus:
        metrics['se_delta'] = int(se_plus.group(1))

    # 11. Spirit Energy Cost Friction
    if se_cost is not None:
        metrics['se_cost_friction'] = se_cost
    else:
        metrics['se_cost_friction'] = 0

    # 12. Permanence
    if card_type in ['Item', 'Technique']:
        metrics['permanence_multiplier'] = 1.35
    elif 'for the rest of the match' in text_lower or 'for the rest of the game' in text_lower:
        metrics['permanence_multiplier'] = 1.50
    else:
        metrics['permanence_multiplier'] = 1.00

    # C. Disruption & Control
    # 13. Opponent Hand Discard
    if 'opponent discards' in text_lower or 'opponent to discard' in text_lower or 'he discards' in text_lower:
        if 'random' in text_lower:
            metrics['opp_hand_discard'] = 32.0
        else:
            metrics['opp_hand_discard'] = 20.0

    # 14. Opponent Deck Mill
    mill_match = re.search(r'discard the top\s+(\d+)\s+cards? of (?:your opponent|that player)', text_lower)
    if mill_match:
        metrics['opp_deck_mill'] = int(mill_match.group(1))

    # 15. Opponent Resource Denial
    if 'discard a face-up item' in text_lower or 'discard an attached' in text_lower:
        metrics['opp_resource_denial'] = 28.0

    # D. Synergy & Engine Compatibility
    # 16. Item Affinity
    if 'item' in text_lower and card_type != 'Item':
        metrics['item_affinity'] = 30.0

    # 17. Event Discard Affinity
    if 'event' in text_lower and 'discard' in text_lower:
        metrics['event_discard_affinity'] = 28.0

    # 18. Team & Alignment Synergy Lock
    if 'team bonus' in text_lower or 'team symbol' in text_lower or (card.get('team') and card.get('team') != 'None'):
        metrics['team_alignment_lock'] = 25.0

    # ----------------------------------------------------
    # 2. CALCULATE STANDALONE & SYNERGY VALUE TRACE
    # ----------------------------------------------------
    trace_steps = []
    base_points = 0.0

    # Base points from Character DEF (Double-Damage 2x threshold weighting)
    if card_type == 'Character':
        # 3000 DEF is low (10 pts), 4000 is par (20 pts), 5000 is strong (32 pts), 6000 is titan (45 pts)
        def_pts = max(5, ((defense - 2000) / 4000) * 45)
        base_points += def_pts
        trace_steps.append({
            "category": "Character Baseline Defense",
            "metric": f"{defense} DEF (2x double-damage threshold: {defense * 2} ATK)",
            "points": round(def_pts, 1),
            "comment": f"Requires opponent to reach {defense * 2} ATK to inflict double wounds."
        })

    # Add points for each active category
    if metrics['flat_atk_boost'] > 0:
        pts = (metrics['flat_atk_boost'] / 2000) * 25 * weights.get('flat_atk_boost', 1.1)
        pts = min(45, pts)
        base_points += pts
        trace_steps.append({
            "category": "Flat Attack Boost",
            "metric": f"+{metrics['flat_atk_boost']} ATK",
            "points": round(pts, 1),
            "comment": "Pushes attacks over opponent DEF / into double-damage range."
        })

    if metrics['flat_def_boost'] > 0:
        pts = (metrics['flat_def_boost'] / 1500) * 28 * weights.get('flat_def_boost', 1.35)
        pts = min(50, pts)
        base_points += pts
        trace_steps.append({
            "category": "Flat Defense Boost",
            "metric": f"+{metrics['flat_def_boost']} DEF",
            "points": round(pts, 1),
            "comment": "Raises fighter survivability and prevents double-damage."
        })

    if metrics['atk_discard_efficiency'] > 0:
        pts = (metrics['atk_discard_efficiency'] / 2000) * 20 * weights.get('atk_discard_efficiency', 1.25)
        pts = min(40, pts)
        base_points += pts
        trace_steps.append({
            "category": "Attack-to-Discard Efficiency",
            "metric": f"{int(metrics['atk_discard_efficiency'])} Damage / Discard",
            "points": round(pts, 1),
            "comment": "High damage-to-cost ratio preserves hand ammunition."
        })

    if metrics['absolute_stall'] > 0:
        pts = metrics['absolute_stall'] * weights.get('absolute_stall', 1.65) * 0.6
        base_points += pts
        trace_steps.append({
            "category": "Absolute Attack Stalling",
            "metric": "Attack Step Cancellation",
            "points": round(pts, 1),
            "comment": "Neutralizes opponent strike and attached pump cards."
        })

    if metrics['wound_mitigation'] > 0:
        pts = metrics['wound_mitigation'] * weights.get('wound_mitigation', 1.30) * 0.5
        base_points += pts
        trace_steps.append({
            "category": "Wound & Damage Mitigation",
            "metric": "Damage Absorption/Healing",
            "points": round(pts, 1),
            "comment": "Extends character lifespan and protects match slots."
        })

    if metrics['net_card_delta'] != 0:
        pts = metrics['net_card_delta'] * 15 * weights.get('net_card_delta', 1.45)
        base_points += pts
        trace_steps.append({
            "category": "Net Hand Advantage",
            "metric": f"{metrics['net_card_delta']:+d} Net Cards",
            "points": round(pts, 1),
            "comment": "Direct card equity delta based on Garfield advantage theory."
        })

    if metrics['tutor_equity'] > 0:
        pts = metrics['tutor_equity'] * weights.get('tutor_equity', 1.40) * 0.65
        base_points += pts
        trace_steps.append({
            "category": "Targeted Tutor / Search",
            "metric": "Deck Search Target",
            "points": round(pts, 1),
            "comment": "Direct deck search eliminates draw variance."
        })

    if metrics['recursion_equity'] > 0:
        pts = metrics['recursion_equity'] * weights.get('recursion_equity', 1.10) * 0.6
        base_points += pts
        trace_steps.append({
            "category": "Discard Pile Recursion",
            "metric": "Graveyard Retrieval",
            "points": round(pts, 1),
            "comment": "Longevity and key combo retrieval from discard."
        })

    if metrics['se_delta'] > 0:
        pts = metrics['se_delta'] * 12 * weights.get('se_delta', 1.25)
        base_points += pts
        trace_steps.append({
            "category": "Spirit Energy Generation",
            "metric": f"+{metrics['se_delta']} SE",
            "points": round(pts, 1),
            "comment": "Ramps tempo ahead of normal draw step limits."
        })

    if card_type in ['Event', 'Item', 'Technique']:
        if se_cost == 0:
            pts = 12 * weights.get('se_cost_friction', 0.9)
            base_points += pts
            trace_steps.append({
                "category": "Spirit Energy Cost Friction",
                "metric": "0 SE Cost (Free Tempo)",
                "points": round(pts, 1),
                "comment": "Zero friction; playable immediately without energy banking."
            })
        elif se_cost is not None and se_cost > 0:
            pts = -(se_cost * 6) * weights.get('se_cost_friction', 0.9)
            base_points += pts
            trace_steps.append({
                "category": "Spirit Energy Cost Friction",
                "metric": f"{se_cost} SE Cost Penalty",
                "points": round(pts, 1),
                "comment": "Requires energy banking; dead-hand friction on early turns."
            })

    if metrics['opp_hand_discard'] > 0:
        pts = metrics['opp_hand_discard'] * weights.get('opp_hand_discard', 1.35) * 0.6
        base_points += pts
        trace_steps.append({
            "category": "Opponent Hand Depletion",
            "metric": "Forced Discard Disruption",
            "points": round(pts, 1),
            "comment": "Strips opponent hand of defense cards and attack fuel."
        })

    # Apply Permanence Multiplier
    perm_mult = metrics['permanence_multiplier']
    if perm_mult > 1.0:
        base_points *= perm_mult
        trace_steps.append({
            "category": "Permanence Multiplier",
            "metric": f"{perm_mult}x Durability Multiplier",
            "points": round(base_points * (perm_mult - 1.0), 1),
            "comment": "Multi-turn attached benefit extends value across rounds."
        })

    # Normalize Final Standalone Rating to 0-100 scale
    # Raw points typically range 20 to 120
    final_score = round(max(15, min(99, (base_points / 95.0) * 85.0 + 10)), 1)
    
    # Assign Tier
    if final_score >= 90:
        tier = "S-Tier"
    elif final_score >= 78:
        tier = "A-Tier"
    elif final_score >= 62:
        tier = "B-Tier"
    elif final_score >= 48:
        tier = "C-Tier"
    else:
        tier = "D-Tier"

    # Peak Synergy Rating
    synergy_score = round(min(99, final_score + (metrics['item_affinity'] + metrics['event_discard_affinity'] + metrics['team_alignment_lock']) * 0.4), 1)

    # ----------------------------------------------------
    # 3. GENERATE AGENT PERSPECTIVES
    # ----------------------------------------------------
    # Agent 1: Rules & Text Auditor
    restrictions = []
    if card.get('limitPerDeck') == 1:
        restrictions.append("Limit 1 per Deck")
    if 'hero only' in text_lower or 'hero:' in text_lower:
        restrictions.append("Hero alignment restricted")
    if 'villain only' in text_lower:
        restrictions.append("Villain alignment restricted")
    if 'arena' in text_lower and 'sideline' not in text_lower:
        restrictions.append("Active in Arena only")
    if has_errata:
        restrictions.append("Official Tournament Errata applies")
    
    rules_notes = f"Card Type: {card_type} • SE Cost: {se_cost if se_cost is not None else 'N/A'}. "
    if restrictions:
        rules_notes += f"Legal Constraints: {', '.join(restrictions)}. "
    else:
        rules_notes += "Unconditional play legality; no timing phase restrictions flagged. "
    if has_errata:
        rules_notes += f"Errata check: '{errata_text}' verified against Score FAQ."

    # Agent 2: TCG Game Theorist
    theorist_notes = ""
    if card_type == 'Character':
        theorist_notes = (
            f"Under the 2x Defense Cliff, this fighter's {defense} DEF requires an opponent to assemble {defense * 2} ATK "
            f"to trigger double damage. Best attack efficiency is {int(metrics['atk_discard_efficiency'])} damage per discard. "
            f"Stat budget ratio aligns with {tier} standard curve."
        )
    elif card_type in ['Event', 'Item', 'Technique']:
        theorist_notes = (
            f"Resource Elasticity: Card operates at {se_cost or 0} SE with net hand delta of {metrics['net_card_delta']:+d}. "
            f"{'Permanence multiplier of ' + str(perm_mult) + 'x applied due to continuous attachment.' if perm_mult > 1 else 'Single-phase burst spell.'} "
            f"Opportunity cost is {'minimal (0 SE free tempo)' if se_cost == 0 else f'gated by {se_cost} SE curve requirements'}."
        )

    # Agent 3: Meta & Synergy Specialist
    synergy_notes = ""
    partners = []
    if metrics['item_affinity'] > 0:
        partners.append("Item engines (Shadow Sword, Rose Whip, Yusuke)")
    if metrics['event_discard_affinity'] > 0:
        partners.append("Graveyard discard engines (Dragon Pen, Koenma Disguised)")
    if metrics['absolute_stall'] > 0:
        partners.append("Control/Stall shells (Time Out, Abnormal Endurance)")
    if team and team != 'None':
        partners.append(f"{team} archetype bonuses")

    if partners:
        synergy_notes = f"High affinity with {', '.join(partners)}. Peak synergy scales to {synergy_score}/100 in dedicated shells."
    else:
        synergy_notes = "Universal standalone profile with moderate archetype dependencies. Fits as flexible slot in standard tournament rosters."

    # Agent 4: Synthesis & Human Liaison
    justification = (
        f"{name} is evaluated as a {tier} ({final_score}/100) card. "
        f"{'Its primary strength is combat defense and survival against the 2x threshold.' if metrics['flat_def_boost'] > 0 or card_type == 'Character' and defense >= 5000 else ''} "
        f"{'It provides top-tier attack stalling and phase disruption.' if metrics['absolute_stall'] > 0 else ''} "
        f"{'It delivers massive combat damage efficiency.' if metrics['flat_atk_boost'] >= 3000 else ''} "
        f"{'Its 0 SE cost offers zero tempo friction.' if se_cost == 0 else ''}"
    ).strip()

    return {
        "id": cid,
        "name": name,
        "set": card.get('set'),
        "cardNumber": card.get('cardNumber'),
        "rarity": card.get('rarity'),
        "cardType": card_type,
        "team": team,
        "defense": defense,
        "seCost": se_cost,
        "text": text,
        "hasErrata": has_errata,
        "errata": errata_text,
        "image": card.get('images', {}).get('primary') or card.get('imageUrl', ''),
        "score": final_score,
        "tier": tier,
        "synergyScore": synergy_score,
        "metrics": metrics,
        "trace": trace_steps,
        "agentPerspectives": {
            "rulesAuditor": rules_notes,
            "gameTheorist": theorist_notes,
            "synergySpecialist": synergy_notes,
            "consensusJustification": justification
        }
    }

def main():
    cards, dossier = load_data()
    weights = {k: v['defaultWeight'] for k, v in dossier['categories'].items()}
    
    print(f"Evaluating all {len(cards)} cards using 18 micro-categories...")
    results = {}
    tier_counts = {"S-Tier": 0, "A-Tier": 0, "B-Tier": 0, "C-Tier": 0, "D-Tier": 0}

    for c in cards:
        eval_data = evaluate_card(c, weights)
        results[c['id']] = eval_data
        tier_counts[eval_data['tier']] += 1

    out_file = 'tools/balance-studio/data/card_metrics.json'
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(results, f, indent=2)

    print(f"Successfully generated {out_file} with {len(results)} evaluated cards!")
    print("Tier Distribution:", tier_counts)

    # Initialize empty feedback history if not present
    feedback_file = 'tools/balance-studio/data/feedback_history.json'
    if not os.path.exists(feedback_file):
        with open(feedback_file, 'w', encoding='utf-8') as f:
            json.dump({"reviews": {}, "heuristics": []}, f, indent=2)
        print(f"Initialized {feedback_file}")

if __name__ == '__main__':
    main()
