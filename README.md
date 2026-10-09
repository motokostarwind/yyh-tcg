# Yu Yu Hakusho TCG Database & Deck Builder (2003 Score Entertainment)

An interactive, searchable card database and deck construction application for the 2003 Score Yu Yu Hakusho Trading Card Game.

---

## 🌟 Key Features

### 1. Complete Card Database (533 Cards & 963 Images)
* **Comprehensive Set Coverage**:
  * **Ghost Files** (211 cards): Base set, Tournament Promos, VHS Promos, Epic Tales.
  * **Dark Tournament** (160 cards): Expansion, Team Bonus cards, League cards, The Dark One.
  * **Gateway** (162 cards): Expansion with full foil finish indexing (Cloudy, Jagged, Lined, Single Rainbow, Double Rainbow).
* **High-Speed Filtering & Search**:
  * Real-time text search across card names, rules text, attack names, and card codes.
  * Filters for **Set**, **Card Type** (Character, Technique, Item, Event), **Alignment** (Hero, Villain, Neutral, Team Leader), and **Team Symbol** (Team Urameshi, Team Toguro, Team Masho, etc.).
  * Sort by Name, Set/Number, Defense Value, Spirit Energy Cost, or Attack Power.
  * Toggle between **Visual Card Grid** and **Compact Table View**.
* **High-Resolution Card Modal & Foil Variant Selector**:
  * Zoom and inspect high-resolution card scans.
  * Switch between foil finishes (Cloudy Foil, Jagged Foil, Lined Foil, Double Rainbow, Single Rainbow, Team Leader variants).
  * Full breakdown of Defense, Spirit Energy, Attack Costs, Damage, Attack Effects, and Sideline/Floating abilities.

### 2. Tournament-Legal Deck Builder
* **Match Slots (1–4)**:
  * Assign 4 starting characters to match slots with duplicate prevention.
  * Designate your active **Team Leader**.
* **Main Deck Management**:
  * Minimum 40 cards required (44 total minimum deck size).
  * Grouped into **Techniques**, **Events**, **Items**, and **Characters**.
  * Strict copy enforcement (max 3 copies per card, max 1 copy for "Limit 1 per Deck" cards).
* **Automatic Team Bonus Detection**:
  * Live evaluation of team synergy across your 4 starting characters.
  * Displays active glowing banner and exact in-game rules text for **Team Urameshi**, **Team Toguro**, **Team Masho**, **Team Saint Beasts**, **Team Rokuyukai**, **Team Uraotogi**, **Team Genkai**, **Team Koenma**, and **Team Sensui**.
* **Visual Deck Analytics**:
  * **Spirit Energy (SE) Cost Curve**: Visual distribution of 0, 1, 2, 3, 4+ SE costs.
  * **Deck Composition Ratio**: Real-time breakdown of Techniques, Events, Items, and Characters.
  * **Live Rule Validation Checklist**: Instantly indicates if your deck meets official tournament requirements.

### 3. Deck Library, Import & Export
* **Deck Library**: Save unlimited custom decks to disk (`decks/*.json`) or browser storage.
* **Pre-Loaded Starter Decks**:
  * *Team Urameshi Starter Deck* (Yusuke, Kuwabara, Kurama, Hiei)
  * *Team Toguro Heavy Beatdown* (Younger Toguro, Elder Toguro, Karasu, Bui)
  * *Team Masho Shadow Ninjas* (Risho, Gama, Touya, Jin)
* **Tournament Text Export**: Export clean decklists ready for forum posting or tournament registration.
* **JSON Export / Import**: Easily share deck files with other players or load external deck configurations.

---

## 🚀 How to Run

### Quick Start (Windows)
Double-click **`start_app.bat`** in the project folder. It will start the local server and automatically open the application in your default web browser at:
```
http://localhost:8000
```

### Manual Command Line
From PowerShell or Command Prompt:
```powershell
python server.py 8000
```
Then navigate to `http://localhost:8000` in your web browser.

---

## 🛠 Project Structure

* **`index.html`**: Main single-page application structure.
* **`app.js`**: Frontend reactive logic, filtering, deck validation engine, and analytics.
* **`style.css`**: Spirit-energy themed responsive stylesheet.
* **`server.py`**: Lightweight local Python server and deck storage REST API.
* **`extract_cards.py`**: Automated extraction pipeline that parses the raw PDFs into structured data.
* **`cards.json`**: Extracted JSON database of all 533 cards and indexed image paths.
* **`decks/`**: Storage directory for saved decks in JSON format.
* **`.agents/skills/yyh-tcg/SKILL.md`**: Custom Antigravity skill containing game rules, validation logic, and schema reference.
* **`YYH TCG Ghost Files/`**: 213 card scans.
* **`YYH TCG Dark Tournament/`**: 279 card scans.
* **`YYH TCG Gateway/`**: 545 card scans (including foil finish variations).
