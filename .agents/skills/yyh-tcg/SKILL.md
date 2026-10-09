---
name: yyh-tcg
description: >-
  Domain knowledge, official rules, and deck building logic for the 2003 Score Yu Yu Hakusho Trading Card Game (YYH TCG).
  Use whenever working with YYH TCG card data, searching cards, validating decks, or implementing game mechanics.
---

# 2003 Score Yu Yu Hakusho TCG Reference & Guide

This skill provides comprehensive rules, deck building constraints, team bonus mechanics, card taxonomy, and data schema for the 2003 Score Entertainment Yu Yu Hakusho Trading Card Game.

---

## 1. Sets & Release Information

1. **Ghost Files** (Sept 2003) - Base set. 176 main cards (`C1`–`U176`, `G177`–`G180`), Tournament Promos (`TC1`–`TG23`), Promos (`P1`–`P3`), VHS/DVD Promos (`V1`–`V4`), and Epic Tales (`G1/0`).
2. **Dark Tournament** (Dec 2003) - Expansion. Cards `G1`–`C121`, Spirit Pack promos (`TG1`–`TC23`), Team Bonus cards (`TB01`–`TB09`), League cards (`L1`–`L10`), Promos (`P1`–`P3`, `R1`, `TP1`), and `G0` The Dark One.
3. **Gateway** (April 2004) - Expansion. Cards `G1`–`C121`, Spirit Pack promos (`TG1`–`TC23`), League cards (`L1`–`L10`), Team Bonus cards (`TB01`–`TB11`), Promos (`P1`–`P3`, `R2`, `SK1`, `X0`, `X1`, `TP2`).
   - Introduced 4 distinct foil patterns: **C** (Cloudy), **J** (Jagged), **L** (Lined), and **SR / DR** (Single / Double Rainbow).
4. *Later sets* (Exile, Betrayal, Alliance) follow the same core rules.

---

## 2. Deck Construction Rules (Rulebook p. 40)

* **Starting Characters**: Exactly **4 starting characters** (1 for each match slot 1 to 4).
  * Must be 4 **unique** characters (strictly 1 copy of each starting character).
  * Characters have alignments (Hero, Villain, Hero / Villain, Neutral) and can have the **Team Leader** trait.
* **Main Deck Size**: Minimum of **40 cards**.
* **Minimum Total Deck Size**: **44 cards** (4 starting characters + 40 main deck cards). There is no maximum deck size.
* **Copy Restrictions**:
  * Maximum **3 copies** of any individual card in the main deck.
  * Cards with the rule text **"Limit 1 per Deck"** can only have a maximum of **1 copy** in the entire deck.
* **Card Types in Deck**:
  * **Characters**: Extra characters placed in the deck (for Sideline switching or replacement).
  * **Techniques**: Attached to characters to grant new attacks during the Attack Step.
  * **Items**: Attached to characters to provide active or passive benefits.
  * **Events**: Instant-speed or phase-specific spells played and resolved, then sent to the Discard Pile or Winner's Circle.

---

## 3. Team Bonus Rules

If all 4 starting characters share the same Team Symbol, the player activates that team's specific Team Bonus:

| Team | Activation & In-Game Bonus |
| :--- | :--- |
| **Team Urameshi** | Gain +1 extra Spirit Energy during your Draw Step. When paying attack costs, discarded cards go to the bottom of your deck instead of the discard pile. |
| **Team Toguro** | When you declare an attack, you may discard up to 2 cards from your hand. That attack gains +3000 Attack Value for each card discarded. |
| **Team Saint Beasts** | At the end of your turn, draw an extra card. |
| **Team Masho** | During setup after revealing 4 starting characters, search your deck for a 5th character and place 4 in hidden facedown slots, revealing only 1. |
| **Team Rokuyukai** | Unique dice/token and attack manipulation bonuses. |
| **Team Uraotogi** | Item and item-attachment advantage mechanics. |
| **Team Sensui** | Domain and territory manipulation mechanics. |
| **Team Koenma / Genkai** | Special event and draw recycling mechanics. |

---

## 4. Card Anatomy & Parsing Schema

A normalized card object follows this schema:

```typescript
interface YYHCard {
  id: string;               // e.g. "GF-001", "DT-005", "GW-G01"
  cardNumber: string;       // e.g. "C1/176", "G1", "U5", "TG1", "P1"
  name: string;             // e.g. "Risho", "Wind Shinobi"
  set: string;              // "Ghost Files" | "Dark Tournament" | "Gateway"
  cardType: "Character" | "Technique" | "Item" | "Event";
  alignment?: "Hero" | "Villain" | "Hero / Villain" | "Neutral";
  isTeamLeader: boolean;    // true if card has Team Leader trait
  team: string | null;      // e.g. "Team Masho", "Team Urameshi", or null
  defense: number | null;   // Character DEF (e.g. 5000)
  seCost: number | null;    // Spirit Energy cost for Events/Items/Techniques
  attacks: {
    cost: number;           // Discard / Attack cost
    damage: number | string;// Attack Value (e.g. 4000, "X")
    name: string;           // Attack name
    text?: string;          // Special attack effect text
  }[];
  effects: {
    type: string;           // "Effect" | "Sideline Effect" | "Team Leader Effect"
    text: string;
  }[];
  limitPerDeck: number;     // 3 (default) or 1 if "Limit 1 per Deck"
  text: string;             // Full body / effect text
  images: {
    primary: string;        // Path to primary scan (e.g. "YYH TCG Ghost Files/001.jpg")
    variants: {
      name: string;         // e.g. "Cloudy Foil", "Team Leader", "Signed"
      filename: string;
      path: string;
    }[];
  };
}
```

---

## 5. Deck Validation Checklist

When evaluating or saving a deck:
1. `characters.length === 4` (starting characters).
2. Each starting character must have a unique `name`.
3. `mainDeck.length >= 40`.
4. `totalCards >= 44`.
5. For every card `c` in `mainDeck`: `count <= c.limitPerDeck` (typically 3, or 1 if restricted).
6. Starting characters cannot exceed 1 copy total across slots.
7. Active Team Bonus computed: Check if all 4 starting characters have matching non-null `team`.
