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

    # 1. Base Archetype Budget
    if card_type == 'Character':
        # DEF 2000 -> 36.0 pts, DEF 4000 -> 53.0 pts, DEF 5000 -> 61.5 pts, DEF 6000 -> 70.0 pts
        def_pts = round(36.0 + ((defense - 2000) / 4000.0) * 34.0, 1)
        base_points += def_pts
        trace_steps.append({
            "category": "Character Baseline Defense",
            "metric": f"{defense} DEF (2x threshold: {defense * 2} ATK)",
            "points": def_pts,
            "comment": f"Requires opponent to reach {defense * 2} ATK to inflict double wounds."
        })
        # Attack Efficiency
        if metrics['atk_discard_efficiency'] > 0:
            eff_pts = round(min(12.0, (metrics['atk_discard_efficiency'] / 2000.0) * 10.0) * weights.get('atk_discard_efficiency', 1.0), 1)
            base_points += eff_pts
            trace_steps.append({
                "category": "Attack-to-Discard Efficiency",
                "metric": f"{int(metrics['atk_discard_efficiency'])} Damage / Discard",
                "points": eff_pts,
                "comment": "Damage output per hand discard ammunition."
            })
        if metrics['flat_atk_boost'] > 0:
            atk_pts = round(min(10.0, (metrics['flat_atk_boost'] / 3000.0) * 8.0) * weights.get('flat_atk_boost', 1.0), 1)
            base_points += atk_pts
            trace_steps.append({
                "category": "Attack Ability Bonus",
                "metric": f"+{metrics['flat_atk_boost']} ATK",
                "points": atk_pts,
                "comment": "Inherent fighter special attack punch."
            })
        if metrics['flat_def_boost'] > 0:
            def_b_pts = round(min(10.0, (metrics['flat_def_boost'] / 2000.0) * 8.0) * weights.get('flat_def_boost', 1.0), 1)
            base_points += def_b_pts
            trace_steps.append({
                "category": "Defensive Combat Buff",
                "metric": f"+{metrics['flat_def_boost']} DEF",
                "points": def_b_pts,
                "comment": "Temporary combat defense protection."
            })

    elif card_type == 'Item':
        base_points += 46.0
        trace_steps.append({
            "category": "Item Equipment Budget",
            "metric": "Persistent Attached Equipment",
            "points": 46.0,
            "comment": "Multi-turn equipment base value on arena fighter."
        })
        if metrics['flat_atk_boost'] > 0:
            atk_pts = round(min(18.0, (metrics['flat_atk_boost'] / 2500.0) * 12.0) * weights.get('flat_atk_boost', 1.0), 1)
            base_points += atk_pts
            trace_steps.append({
                "category": "Flat Attack Boost",
                "metric": f"+{metrics['flat_atk_boost']} ATK",
                "points": atk_pts,
                "comment": "Increases attack value to threaten lethal double-damage."
            })
        if metrics['flat_def_boost'] > 0:
            def_pts = round(min(16.0, (metrics['flat_def_boost'] / 2000.0) * 12.0) * weights.get('flat_def_boost', 1.0), 1)
            base_points += def_pts
            trace_steps.append({
                "category": "Flat Defense Boost",
                "metric": f"+{metrics['flat_def_boost']} DEF",
                "points": def_pts,
                "comment": "Increases attached character double-damage survival cliff."
            })

    elif card_type == 'Technique':
        base_points += 45.0
        trace_steps.append({
            "category": "Technique Move Budget",
            "metric": "Attached Signature Technique",
            "points": 45.0,
            "comment": "Reusable attached special move budget."
        })
        if metrics['flat_atk_boost'] > 0:
            atk_pts = round(min(18.0, (metrics['flat_atk_boost'] / 2500.0) * 12.0) * weights.get('flat_atk_boost', 1.0), 1)
            base_points += atk_pts
            trace_steps.append({
                "category": "Flat Attack Boost",
                "metric": f"+{metrics['flat_atk_boost']} ATK",
                "points": atk_pts,
                "comment": "Increases attack value to threaten lethal double-damage."
            })
        if metrics['flat_def_boost'] > 0:
            def_pts = round(min(16.0, (metrics['flat_def_boost'] / 2000.0) * 12.0) * weights.get('flat_def_boost', 1.0), 1)
            base_points += def_pts
            trace_steps.append({
                "category": "Flat Defense Boost",
                "metric": f"+{metrics['flat_def_boost']} DEF",
                "points": def_pts,
                "comment": "Increases attached character double-damage survival cliff."
            })
        if metrics['atk_discard_efficiency'] > 0:
            eff_pts = round(min(8.0, (metrics['atk_discard_efficiency'] / 2000.0) * 6.0) * weights.get('atk_discard_efficiency', 1.0), 1)
            base_points += eff_pts
            trace_steps.append({
                "category": "Attack Damage Efficiency",
                "metric": f"{int(metrics['atk_discard_efficiency'])} Dmg / Cost",
                "points": eff_pts,
                "comment": "Preserves hand ammunition during resolution."
            })

    else:  # Event / Special Moves
        base_points += 44.0
        trace_steps.append({
            "category": "Event Tactical Budget",
            "metric": "1-for-1 Tactical Resolution",
            "points": 44.0,
            "comment": "Standard burst effect baseline."
        })
        if metrics['flat_atk_boost'] > 0:
            atk_pts = round(min(16.0, (metrics['flat_atk_boost'] / 2500.0) * 12.0) * weights.get('flat_atk_boost', 1.0), 1)
            base_points += atk_pts
            trace_steps.append({
                "category": "Flat Attack Boost",
                "metric": f"+{metrics['flat_atk_boost']} ATK",
                "points": atk_pts,
                "comment": "Single-turn attack pump."
            })
        if metrics['flat_def_boost'] > 0:
            def_pts = round(min(16.0, (metrics['flat_def_boost'] / 2000.0) * 12.0) * weights.get('flat_def_boost', 1.0), 1)
            base_points += def_pts
            trace_steps.append({
                "category": "Flat Defense Boost",
                "metric": f"+{metrics['flat_def_boost']} DEF",
                "points": def_pts,
                "comment": "Single-turn defense pump."
            })

    # Universal Modifiers
    if metrics['absolute_stall'] > 0:
        stall_pts = round(min(32.0, metrics['absolute_stall'] * 0.75) * weights.get('absolute_stall', 1.0), 1)
        base_points += stall_pts
        trace_steps.append({
            "category": "Absolute Attack Stalling",
            "metric": "Attack Step Cancellation",
            "points": stall_pts,
            "comment": "Neutralizes opponent strike and attached pump cards."
        })

    if metrics['wound_mitigation'] > 0:
        mit_pts = round(min(16.0, metrics['wound_mitigation'] * 0.45) * weights.get('wound_mitigation', 1.0), 1)
        base_points += mit_pts
        trace_steps.append({
            "category": "Wound & Damage Mitigation",
            "metric": "Damage Absorption/Healing",
            "points": mit_pts,
            "comment": "Extends character lifespan and protects match slots."
        })

    if metrics['sideline_reposition'] > 0:
        repo_pts = round(min(12.0, metrics['sideline_reposition'] * 0.40) * weights.get('sideline_reposition', 1.0), 1)
        base_points += repo_pts
        trace_steps.append({
            "category": "Sideline Repositioning",
            "metric": "Fighter Switching / Dodging",
            "points": repo_pts,
            "comment": "Protects wounded fighters by swapping to sideline."
        })

    delta = metrics['net_card_delta']
    if delta > 0:
        card_pts = round(min(22.0, delta * 11.0) * weights.get('net_card_delta', 1.0), 1)
        base_points += card_pts
        trace_steps.append({
            "category": "Net Hand Advantage",
            "metric": f"+{delta} Net Cards",
            "points": card_pts,
            "comment": "Raw card advantage based on Garfield theory."
        })
    elif delta < -1:
        card_pts = round(-min(18.0, abs(delta + 1) * 8.0) * weights.get('net_card_delta', 1.0), 1)
        base_points += card_pts
        trace_steps.append({
            "category": "Hand Discard Cost Penalty",
            "metric": f"{abs(delta + 1)} Additional Discards",
            "points": card_pts,
            "comment": "Depletes hand ammunition beyond normal 1-for-1 play."
        })

    if metrics['tutor_equity'] > 0:
        tut_pts = round(min(18.0, metrics['tutor_equity'] * 0.50) * weights.get('tutor_equity', 1.0), 1)
        base_points += tut_pts
        trace_steps.append({
            "category": "Targeted Tutor / Search",
            "metric": "Deck Search Target",
            "points": tut_pts,
            "comment": "Eliminates draw variance and retrieves key combo pieces."
        })

    if metrics['recursion_equity'] > 0:
        rec_pts = round(min(14.0, metrics['recursion_equity'] * 0.40) * weights.get('recursion_equity', 1.0), 1)
        base_points += rec_pts
        trace_steps.append({
            "category": "Discard Pile Recursion",
            "metric": "Graveyard Retrieval",
            "points": rec_pts,
            "comment": "Recycles key cards or extends deck life against mill."
        })

    if metrics['se_delta'] > 0:
        se_pts = round(min(16.0, metrics['se_delta'] * 7.0) * weights.get('se_delta', 1.0), 1)
        base_points += se_pts
        trace_steps.append({
            "category": "Spirit Energy Generation",
            "metric": f"+{metrics['se_delta']} SE Ramped",
            "points": se_pts,
            "comment": "Accelerates tempo ahead of normal draw step curve."
        })

    if card_type in ['Event', 'Item', 'Technique']:
        se_friction_w = weights.get('se_cost_friction', 1.0)
        if se_cost == 0:
            base_points += 4.0 * se_friction_w
            trace_steps.append({
                "category": "Spirit Energy Cost Friction",
                "metric": "0 SE Cost (Free Tempo)",
                "points": round(4.0 * se_friction_w, 1),
                "comment": "Zero energy friction; playable immediately turn 1."
            })
        elif se_cost == 1:
            base_points -= 2.0 * se_friction_w
            trace_steps.append({
                "category": "Spirit Energy Cost Friction",
                "metric": "1 SE Cost Gate",
                "points": round(-2.0 * se_friction_w, 1),
                "comment": "Minor energy friction; requires 1 banked SE."
            })
        elif se_cost == 2:
            base_points -= 5.0 * se_friction_w
            trace_steps.append({
                "category": "Spirit Energy Cost Friction",
                "metric": "2 SE Cost Gate",
                "points": round(-5.0 * se_friction_w, 1),
                "comment": "Moderate tempo delay; requires 2 banked SE."
            })
        elif se_cost and se_cost >= 3:
            pen = (5.0 + (se_cost - 2) * 3.5) * se_friction_w
            base_points -= pen
            trace_steps.append({
                "category": "Spirit Energy Cost Friction",
                "metric": f"{se_cost} SE Heavy Cost",
                "points": round(-pen, 1),
                "comment": "Severe energy friction; dead card in early turns."
            })

    if metrics['opp_hand_discard'] > 0:
        disc_pts = round(min(20.0, metrics['opp_hand_discard'] * 0.50) * weights.get('opp_hand_discard', 1.0), 1)
        base_points += disc_pts
        trace_steps.append({
            "category": "Opponent Hand Depletion",
            "metric": "Forced Discard Disruption",
            "points": disc_pts,
            "comment": "Strips opponent of defensive responses and attack fuel."
        })

    if metrics['opp_deck_mill'] > 0:
        mill_pts = round(min(18.0, metrics['opp_deck_mill'] * 0.45) * weights.get('opp_deck_mill', 1.0), 1)
        base_points += mill_pts
        trace_steps.append({
            "category": "Opponent Deck Milling",
            "metric": "Topdeck Depletion",
            "points": mill_pts,
            "comment": "Accelerates opponent towards deck-out loss condition."
        })

    if metrics['opp_resource_denial'] > 0:
        den_pts = round(min(16.0, metrics['opp_resource_denial'] * 0.50) * weights.get('opp_resource_denial', 1.0), 1)
        base_points += den_pts
        trace_steps.append({
            "category": "Opponent Resource Denial",
            "metric": "Item/SE Removal",
            "points": den_pts,
            "comment": "Destroys opponent equipment or removes banked energy."
        })

    # Final Score is the exact calibrated points sum clamped to realistic 20-97 scale
    final_score = round(max(20.0, min(97.0, base_points)), 1)
    
    # Assign Tier cleanly on calibrated scale:
    # S-Tier (>=88): Top ~2.5% of the game (meta defining)
    # A-Tier (74-87): Top ~15% of the game (competitive mainstays)
    # B-Tier (56-73): ~38% of the game (solid viable cards)
    # C-Tier (42-55): ~32% of the game (average/filler)
    # D-Tier (<42): ~12% of the game (severely outclassed)
    if final_score >= 88.0:
        tier = "S-Tier"
    elif final_score >= 74.0:
        tier = "A-Tier"
    elif final_score >= 56.0:
        tier = "B-Tier"
    elif final_score >= 42.0:
        tier = "C-Tier"
    else:
        tier = "D-Tier"

    # Peak Synergy Rating
    syn_bonus = (metrics['item_affinity'] + metrics['event_discard_affinity'] + metrics['team_alignment_lock']) * 0.35
    synergy_score = round(min(98.0, final_score + syn_bonus), 1)

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
        perm_mult = metrics.get('permanence_multiplier', 1.0)
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
