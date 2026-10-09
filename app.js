/**
 * Yu Yu Hakusho TCG - Database & Deck Builder Frontend Logic
 * Supports 2003 Score YYH TCG rules, card search, deck construction, and analytics.
 */

// Global State
const state = {
  cards: [],
  filteredCards: [],
  cardMap: new Map(),
  activeTab: 'catalog',
  currentView: 'grid', // 'grid' | 'table'
  activeModalCard: null,
  
  // Deck State
  currentDeck: {
    id: 'starter_urameshi',
    name: 'Team Urameshi Starter',
    author: 'Score Entertainment',
    slots: {
      1: null, // Card ID
      2: null,
      3: null,
      4: null
    },
    leaderSlot: 1,
    mainDeck: {} // { [cardId]: count }
  },
  
  savedDecks: []
};

// Team Bonus Descriptions Dictionary
const TEAM_BONUSES = {
  'Team Urameshi': {
    title: 'Team Urameshi Bonus Active',
    desc: 'Gain 1 extra Spirit Energy during your Draw Step. When you pay the Attack Cost of an attack, discarded cards go to the bottom of your Deck in any order instead of being discarded.'
  },
  'Team Toguro': {
    title: 'Team Toguro Bonus Active',
    desc: 'When you use an attack, you may discard up to 2 cards from your hand. That attack gains +3000 Attack Value for this turn for each card discarded.'
  },
  'Team Saint Beasts': {
    title: 'Team Saint Beasts Bonus Active',
    desc: 'At the end of your turn, draw an extra card from your Deck.'
  },
  'Team Masho': {
    title: 'Team Masho Bonus Active',
    desc: 'During Setup, after revealing 4 starting characters, search your Deck for a 5th character. Place 1 in the Arena face-up and the other 4 facedown in Match Slots. Characters only flip face-up when affected by a card or entering the Arena.'
  },
  'Team Rokuyukai': {
    title: 'Team Rokuyukai Bonus Active',
    desc: 'Special dice and bonus tokens apply to attack values and sideline recovery.'
  },
  'Team Uraotogi': {
    title: 'Team Uraotogi Bonus Active',
    desc: 'Special item manipulation and weapon equipping advantages apply across match slots.'
  },
  'Team Genkai': {
    title: 'Team Genkai Bonus Active',
    desc: 'Spiritual mastery and technique enhancement bonuses apply.'
  },
  'Team Koenma': {
    title: 'Team Koenma Bonus Active',
    desc: 'Event recycling and investigative spirit realm bonuses apply.'
  },
  'Team Sensui': {
    title: 'Team Sensui Bonus Active',
    desc: 'Territory domain effects and multi-personality tactical adjustments apply.'
  }
};

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupFilterListeners();
  setupModalListeners();
  setupDeckActions();
  await loadCards();
  await loadSavedDecks();
  loadInitialDeck();
  initSynergyWorker();
  renderDeckBuilder();
});

// 1. Data Fetching
async function loadCards() {
  try {
    const res = await fetch('cards.json');
    if (!res.ok) throw new Error('Failed to load cards.json');
    state.cards = await res.json();
    
    // Map cards by ID for instant lookup
    state.cards.forEach(card => {
      state.cardMap.set(card.id, card);
    });

    state.filteredCards = [...state.cards];
    renderCards();
    updateFilteredCount();
  } catch (err) {
    console.error('Error loading cards:', err);
    showToast('Failed to load card database. Make sure cards.json exists.');
  }
}

// 2. Navigation Tabs
function setupNavigation() {
  const tabs = document.querySelectorAll('.nav-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      state.activeTab = target;

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      const activePane = document.getElementById(`tab-${target}`);
      if (activePane) activePane.classList.add('active');

      if (target === 'deckbuilder') {
        renderDeckBuilder();
      } else if (target === 'saved-decks') {
        renderSavedDecks();
      }
    });
  });

  // View mode toggle
  document.getElementById('viewGridBtn').addEventListener('click', () => {
    state.currentView = 'grid';
    document.getElementById('viewGridBtn').classList.add('active');
    document.getElementById('viewTableBtn').classList.remove('active');
    document.getElementById('cardsGrid').style.display = 'grid';
    document.getElementById('cardsTable').style.display = 'none';
  });

  document.getElementById('viewTableBtn').addEventListener('click', () => {
    state.currentView = 'table';
    document.getElementById('viewTableBtn').classList.add('active');
    document.getElementById('viewGridBtn').classList.remove('active');
    document.getElementById('cardsGrid').style.display = 'none';
    document.getElementById('cardsTable').style.display = 'block';
  });
}

// 3. Search & Filter Handlers
function normalizeSearchText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[\u2018\u2019'"]/g, '') // strip apostrophes & quotes
    .replace(/[-_]/g, ' ')            // convert hyphens/underscores to spaces
    .replace(/\s+/g, ' ')
    .trim();
}

function setupFilterListeners() {
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const filterSet = document.getElementById('filterSet');
  const filterType = document.getElementById('filterType');
  const filterAlignment = document.getElementById('filterAlignment');
  const filterTeam = document.getElementById('filterTeam');
  const filterErrata = document.getElementById('filterErrata');
  const filterStrategicRole = document.getElementById('filterStrategicRole');
  const sortBy = document.getElementById('sortBy');
  const btnReset = document.getElementById('btnResetFilters');

  const applyFilters = () => {
    const rawQuery = searchInput.value.trim();
    const normalizedQuery = normalizeSearchText(rawQuery);
    const tokens = normalizedQuery.split(' ').filter(Boolean);

    const setVal = filterSet.value;
    const typeVal = filterType.value;
    const alignVal = filterAlignment.value;
    const teamVal = filterTeam.value;
    const errataVal = filterErrata ? filterErrata.value : 'all';
    const roleVal = filterStrategicRole ? filterStrategicRole.value : 'all';
    const sortVal = sortBy.value;

    state.filteredCards = state.cards.filter(c => {
      // 1. Multi-token Search across all fields
      if (tokens.length > 0) {
        // Pre-normalized search index on card
        const cardIndex = c.searchIndex || normalizeSearchText(
          `${c.name} ${c.cardNumber} ${c.set} ${c.cardType} ${c.alignment || ''} ${c.team || ''} ${c.rarity} ${c.text || ''}`
        );
        const allMatch = tokens.every(token => cardIndex.includes(token));
        if (!allMatch) return false;
      }

      // 2. Set filter
      if (setVal !== 'all' && c.set !== setVal) return false;

      // 3. Card Type filter
      if (typeVal !== 'all' && c.cardType !== typeVal) return false;

      // 4. Alignment filter
      if (alignVal !== 'all') {
        if (alignVal === 'Leader') {
          if (!c.isTeamLeader) return false;
        } else {
          if (c.alignment !== alignVal) return false;
        }
      }

      // 5. Team filter
      if (teamVal !== 'all' && c.team !== teamVal) return false;

      // 6. Errata / Rulings filter
      if (errataVal === 'errata' && !c.hasErrata) return false;
      if (errataVal === 'standard' && c.hasErrata) return false;

      // 7. Strategic Role filter
      if (roleVal !== 'all') {
        if (!c.strategicRoles || !c.strategicRoles.includes(roleVal)) return false;
      }

      return true;
    });

    // Sort
    state.filteredCards.sort((a, b) => {
      if (sortVal === 'name-asc') return a.name.localeCompare(b.name);
      if (sortVal === 'name-desc') return b.name.localeCompare(a.name);
      if (sortVal === 'set-code') return (a.set + a.cardNumber).localeCompare(b.set + b.cardNumber);
      if (sortVal === 'defense-desc') return (b.defense || 0) - (a.defense || 0);
      if (sortVal === 'se-asc') return (a.seCost ?? 999) - (b.seCost ?? 999);
      if (sortVal === 'power-desc') {
        const maxA = a.attacks?.length ? Math.max(...a.attacks.map(atk => typeof atk.damage === 'number' ? atk.damage : 0)) : 0;
        const maxB = b.attacks?.length ? Math.max(...b.attacks.map(atk => typeof atk.damage === 'number' ? atk.damage : 0)) : 0;
        return maxB - maxA;
      }
      return 0;
    });

    renderCards();
    updateFilteredCount();
  };

  searchInput.addEventListener('input', applyFilters);
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    applyFilters();
  });
  filterSet.addEventListener('change', applyFilters);
  filterType.addEventListener('change', applyFilters);
  filterAlignment.addEventListener('change', applyFilters);
  filterTeam.addEventListener('change', applyFilters);
  if (filterErrata) filterErrata.addEventListener('change', applyFilters);
  if (filterStrategicRole) filterStrategicRole.addEventListener('change', applyFilters);
  sortBy.addEventListener('change', applyFilters);

  btnReset.addEventListener('click', () => {
    searchInput.value = '';
    filterSet.value = 'all';
    filterType.value = 'all';
    filterAlignment.value = 'all';
    filterTeam.value = 'all';
    if (filterErrata) filterErrata.value = 'all';
    if (filterStrategicRole) filterStrategicRole.value = 'all';
    sortBy.value = 'name-asc';
    applyFilters();
  });
}

function updateFilteredCount() {
  document.getElementById('filteredCount').textContent = state.filteredCards.length;
}

// 4. Render Cards (Grid & Table)
function renderCards() {
  renderCardGrid();
  renderCardTable();
}

function renderCardGrid() {
  const container = document.getElementById('cardsGrid');
  container.innerHTML = '';

  const displayLimit = 200; // Limit initial render for speed
  const cardsToShow = state.filteredCards.slice(0, displayLimit);

  cardsToShow.forEach(c => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card-item' + (c.hasErrata ? ' card-has-errata' : '');

    const currentDeckCount = state.currentDeck.mainDeck[c.id] || 0;
    const isStartingChar = Object.values(state.currentDeck.slots).includes(c.id);

    // Badges
    let typeClass = 'badge-type';
    if (c.cardType === 'Technique') typeClass = 'badge-tech';
    else if (c.cardType === 'Item') typeClass = 'badge-item';
    else if (c.cardType === 'Event') typeClass = 'badge-event';

    let badgesHtml = `<span class="badge ${typeClass}">${c.cardType}</span>`;
    if (c.team) badgesHtml += `<span class="badge badge-team">${c.team.replace('Team ', '')}</span>`;
    if (c.defense) badgesHtml += `<span class="badge badge-def">DEF ${c.defense}</span>`;
    if (c.seCost !== null) badgesHtml += `<span class="badge badge-se">SE ${c.seCost}</span>`;
    if (c.hasErrata) badgesHtml += `<span class="badge badge-errata" title="Official Tournament Ruling / Errata">⚖️ Errata</span>`;
    if (c.comboLines && c.comboLines.length > 0) {
      badgesHtml += `<span class="badge badge-combo" data-id="${c.id}" title="${c.comboLines.length} Combo Recipe(s) Available">💥 ${c.comboLines.length} Combo${c.comboLines.length > 1 ? 's' : ''}</span>`;
    }

    let limitHtml = '';
    if (c.limitPerDeck === 1) limitHtml = `<div class="card-limit-tag">Limit 1</div>`;
    else if (c.limitPerDeck === 2) limitHtml = `<div class="card-limit-tag limit-2">Limit 2</div>`;

    let errataHtml = c.hasErrata ? `<div class="card-errata-tag" style="top: ${c.limitPerDeck < 3 ? '32px' : '8px'}" title="Official Tournament Errata / Updated Ruling">⚖️ RULING</div>` : '';

    const slotButtons = c.cardType === 'Character' ? `
      <div class="slot-btn-group">
        <button class="btn-slot-quick" data-id="${c.id}" data-slot="1">S1</button>
        <button class="btn-slot-quick" data-id="${c.id}" data-slot="2">S2</button>
        <button class="btn-slot-quick" data-id="${c.id}" data-slot="3">S3</button>
        <button class="btn-slot-quick" data-id="${c.id}" data-slot="4">S4</button>
      </div>
    ` : '';

    cardEl.innerHTML = `
      <div class="card-img-container" data-id="${c.id}">
        <img class="card-img" src="${c.images.primary}" alt="${c.name}" loading="lazy" onerror="this.src='https://placehold.co/240x336/131b2e/38bdf8?text=YYH+TCG'">
        <div class="card-rarity-tag">${c.rarity}</div>
        ${limitHtml}
        ${errataHtml}
      </div>
      <div class="card-info">
        <div class="card-title" data-id="${c.id}" title="${c.name}">${c.name}</div>
        <div class="card-code-row">
          <span>${c.cardNumber}</span>
          <span>${c.set}</span>
        </div>
        <div class="card-meta-badges">
          ${badgesHtml}
        </div>
        <div class="card-quick-actions">
          <div class="card-action-row">
            <button class="btn btn-add-main" data-id="${c.id}">
              + Main (${currentDeckCount}/${c.limitPerDeck})
            </button>
            <button class="btn btn-combo-inspect" data-id="${c.id}" title="Inspect Combos & Synergies">⚡ Combos</button>
          </div>
          ${slotButtons}
        </div>
      </div>
    `;

    // Click on artwork or title opens modal
    cardEl.querySelector('.card-img-container').addEventListener('click', () => openCardModal(c));
    cardEl.querySelector('.card-title').addEventListener('click', () => openCardModal(c));

    // Combo inspector button and badge
    cardEl.querySelectorAll('.btn-combo-inspect, .badge-combo').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        inspectCardCombos(c);
      });
    });

    // Add to main deck
    cardEl.querySelector('.btn-add-main').addEventListener('click', (e) => {
      e.stopPropagation();
      addCardToMainDeck(c.id);
    });

    // Slot buttons
    cardEl.querySelectorAll('.btn-slot-quick').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        assignCardToSlot(parseInt(b.dataset.slot), c.id);
      });
    });

    container.appendChild(cardEl);
  });

  if (state.filteredCards.length > displayLimit) {
    const moreNotice = document.createElement('div');
    moreNotice.className = 'grid-more-notice';
    moreNotice.style.gridColumn = '1 / -1';
    moreNotice.style.textAlign = 'center';
    moreNotice.style.padding = '20px';
    moreNotice.style.color = 'var(--text-dim)';
    moreNotice.textContent = `Showing first ${displayLimit} of ${state.filteredCards.length} cards. Use search/filters to narrow results.`;
    container.appendChild(moreNotice);
  }
}

function renderCardTable() {
  const tbody = document.getElementById('cardsTableBody');
  tbody.innerHTML = '';

  const displayLimit = 200;
  const cardsToShow = state.filteredCards.slice(0, displayLimit);

  cardsToShow.forEach(c => {
    const tr = document.createElement('tr');
    if (c.hasErrata) tr.className = 'table-row-errata';
    const errataTag = c.hasErrata ? ` <span class="badge badge-errata" title="Official Tournament Errata">⚖️ Ruling</span>` : '';
    const limitTag = c.limitPerDeck < 3 ? ` <span class="badge" style="background:${c.limitPerDeck === 1 ? '#dc2626' : '#ea580c'};color:#fff">Limit ${c.limitPerDeck}</span>` : '';
    const comboTag = (c.comboLines && c.comboLines.length > 0) ? ` <span class="badge badge-combo btn-combo-table" data-id="${c.id}" style="cursor:pointer;" title="View Combos">💥 Combos</span>` : '';

    tr.innerHTML = `
      <td>
        <img class="table-card-thumb" src="${c.images.primary}" alt="${c.name}" loading="lazy">
      </td>
      <td><strong>${c.name}</strong>${limitTag}${errataTag}${comboTag}</td>
      <td>${c.set} <br><small class="text-dim">${c.cardNumber}</small></td>
      <td><span class="badge badge-type">${c.cardType}</span></td>
      <td>${c.team ? c.team.replace('Team ', '') : '-'}</td>
      <td>${c.defense || '-'}</td>
      <td>${c.seCost !== null ? c.seCost : '-'}</td>
      <td><small>${c.text.substring(0, 80)}${c.text.length > 80 ? '...' : ''}</small></td>
      <td>
        <button class="btn btn-secondary btn-sm table-add-btn" data-id="${c.id}">+ Add</button>
      </td>
    `;

    tr.querySelector('.table-card-thumb').addEventListener('click', () => openCardModal(c));
    tr.querySelector('.table-add-btn').addEventListener('click', () => addCardToMainDeck(c.id));
    const tableComboBtn = tr.querySelector('.btn-combo-table');
    if (tableComboBtn) {
      tableComboBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        inspectCardCombos(c);
      });
    }
    tbody.appendChild(tr);
  });
}

// 5. Card Modal Logic
function setupModalListeners() {
  const modal = document.getElementById('cardModal');
  const closeBtn = document.getElementById('cardModalClose');

  closeBtn.addEventListener('click', () => modal.style.display = 'none');
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  const inspectorCloseBtn = document.getElementById('inspectorCloseBtn');
  if (inspectorCloseBtn) {
    inspectorCloseBtn.addEventListener('click', () => {
      const inspector = document.getElementById('cardComboInspector');
      if (inspector) inspector.style.display = 'none';
    });
  }

  // Modal actions
  document.getElementById('modalBtnAddMain').addEventListener('click', () => {
    if (state.activeModalCard) {
      addCardToMainDeck(state.activeModalCard.id);
    }
  });

  const slotDropdownBtn = document.getElementById('modalBtnAddSlot');
  const slotDropdown = document.getElementById('modalSlotDropdown');

  slotDropdownBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    slotDropdown.classList.toggle('show');
  });

  slotDropdown.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      if (state.activeModalCard && state.activeModalCard.cardType === 'Character') {
        assignCardToSlot(parseInt(item.dataset.slot), state.activeModalCard.id);
        slotDropdown.classList.remove('show');
      }
    });
  });

  document.addEventListener('click', () => slotDropdown.classList.remove('show'));

  // Variant selector
  document.getElementById('modalVariantSelect').addEventListener('change', (e) => {
    const selectedPath = e.target.value;
    document.getElementById('modalCardImg').src = selectedPath;
  });
}

function openCardModal(card) {
  state.activeModalCard = card;
  const modal = document.getElementById('cardModal');

  document.getElementById('modalCardName').textContent = card.name;
  document.getElementById('modalCardImg').src = card.images.primary;

  // Variants dropdown
  const variantSelect = document.getElementById('modalVariantSelect');
  variantSelect.innerHTML = '';
  if (card.images.variants && card.images.variants.length > 0) {
    document.getElementById('modalVariantSection').style.display = 'flex';
    card.images.variants.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.path;
      opt.textContent = `${v.label} (${v.path.split('/').pop()})`;
      variantSelect.appendChild(opt);
    });
  } else {
    document.getElementById('modalVariantSection').style.display = 'none';
  }

  // Badges
  const badgesContainer = document.getElementById('modalCardBadges');
  badgesContainer.innerHTML = `
    <span class="badge badge-type">${card.cardType}</span>
    <span class="badge">${card.set}</span>
    <span class="badge">${card.cardNumber}</span>
    <span class="badge" style="color:#fbbf24">${card.rarity}</span>
  `;
  if (card.alignment) badgesContainer.innerHTML += `<span class="badge">${card.alignment}</span>`;
  if (card.isTeamLeader) badgesContainer.innerHTML += `<span class="badge" style="background:#f59e0b;color:#000">Team Leader</span>`;
  if (card.team) badgesContainer.innerHTML += `<span class="badge badge-team">${card.team}</span>`;
  if (card.limitPerDeck === 1) badgesContainer.innerHTML += `<span class="badge" style="background:#dc2626;color:#fff">Limit 1 per Deck</span>`;
  else if (card.limitPerDeck === 2) badgesContainer.innerHTML += `<span class="badge" style="background:#ea580c;color:#fff">Limit 2 per Deck</span>`;
  if (card.hasErrata) badgesContainer.innerHTML += `<span class="badge badge-errata">⚖️ Tournament Errata</span>`;

  // Stats banner
  const statsBanner = document.getElementById('modalStatsBanner');
  let statsHtml = '';
  if (card.defense) {
    statsHtml += `<div class="stat-pill"><span class="stat-pill-label">Defense Value</span><span class="stat-pill-val def">${card.defense}</span></div>`;
  }
  if (card.seCost !== null) {
    statsHtml += `<div class="stat-pill"><span class="stat-pill-label">Spirit Energy Cost</span><span class="stat-pill-val se">${card.seCost}</span></div>`;
  }
  statsBanner.innerHTML = statsHtml || '<span class="text-dim">No numerical DEF / SE cost</span>';

  // Attacks
  const attacksList = document.getElementById('modalAttacksList');
  attacksList.innerHTML = '';
  if (card.attacks && card.attacks.length > 0) {
    document.getElementById('modalAttacksSection').style.display = 'block';
    card.attacks.forEach((atk, idx) => {
      const atkDiv = document.createElement('div');
      atkDiv.className = 'attack-entry';
      const formattedDmg = typeof atk.damage === 'number' ? atk.damage.toLocaleString() : atk.damage;
      atkDiv.innerHTML = `
        <div class="attack-head-row">
          <span class="attack-badge">ATTACK ${idx + 1}</span>
          <span class="attack-name-title">${atk.name || 'Unnamed Attack'}</span>
        </div>
        <div class="attack-stats-pills">
          <div class="attack-stat-item">
            <span class="attack-stat-lbl">Attack Cost:</span>
            <span class="attack-cost-badge">${atk.cost} Discard</span>
          </div>
          <div class="attack-stat-item">
            <span class="attack-stat-lbl">Attack Value:</span>
            <span class="attack-damage-badge">${formattedDmg} ATK</span>
          </div>
        </div>
        <div class="attack-description-wrapper">
          <span class="attack-desc-lbl">Attack Description / Effect:</span>
          ${atk.text ? `<p class="attack-desc-text">${atk.text}</p>` : `<span class="attack-no-desc-text">No additional attack effect</span>`}
        </div>
      `;
      attacksList.appendChild(atkDiv);
    });
  } else {
    document.getElementById('modalAttacksSection').style.display = 'none';
  }

  // Non-Attack Effects & Passives
  const effectsSection = document.getElementById('modalEffectsSection');
  const effectsTitle = document.getElementById('modalEffectsTitle');
  const effectsBody = document.getElementById('modalEffectsBody');
  effectsBody.innerHTML = '';

  const hasNonAtk = card.hasNonAttackEffects && card.nonAttackEffects && card.nonAttackEffects.length > 0;

  if (card.cardType === 'Character') {
    if (hasNonAtk) {
      effectsSection.style.display = 'block';
      effectsTitle.textContent = 'Passives & Sideline Effects';
      effectsBody.innerHTML = card.nonAttackEffects.map(eff => `
        <div class="non-attack-eff-item">
          <span class="eff-type-tag">${eff.type || 'Passive Effect'}</span>
          ${eff.name ? `<strong>${eff.name}:</strong> ` : ''}
          <span>${eff.text}</span>
        </div>
      `).join('');
    } else {
      // Pure attack character (e.g. Yusuke, Resurrected) - completely hide bottom effect section
      effectsSection.style.display = 'none';
    }
  } else {
    // Non-character cards (Item, Event, Technique)
    if (hasNonAtk) {
      effectsSection.style.display = 'block';
      effectsTitle.textContent = card.cardType === 'Item' ? 'Item Effect & Rules' : 
                                 card.cardType === 'Event' ? 'Event Effect & Rules' : 'Card Effect & Rules';
      effectsBody.innerHTML = card.nonAttackEffects.map(eff => `
        <div class="non-attack-eff-item">
          ${eff.type ? `<span class="eff-type-tag">${eff.type}</span>` : ''}
          ${eff.name ? `<strong>${eff.name}:</strong> ` : ''}
          <span>${eff.text}</span>
        </div>
      `).join('');
    } else if (card.text) {
      effectsSection.style.display = 'block';
      effectsTitle.textContent = 'Card Effect & Rules';
      effectsBody.innerHTML = `<div class="non-attack-eff-item"><span>${card.text}</span></div>`;
    } else {
      effectsSection.style.display = 'none';
    }
  }

  // Dedicated Errata & Updated Tournament Rulings
  const errataSection = document.getElementById('modalErrataSection');
  if (card.hasErrata && card.errata) {
    errataSection.style.display = 'flex';
    document.getElementById('modalErrataSource').textContent = card.errata.source || 'Score CRD v4.04.05 (April 4, 2005)';
    document.getElementById('modalErrataDate').textContent = card.errata.effectiveDate ? `Effective: ${card.errata.effectiveDate}` : 'CRD v4.04.05';
    document.getElementById('modalErrataOld').textContent = card.errata.oldEffect || 'N/A';
    document.getElementById('modalErrataNew').textContent = card.errata.newEffect || 'N/A';

    const clarifBox = document.getElementById('modalErrataClarifBox');
    const clarifText = document.getElementById('modalErrataClarif');
    if (card.errata.clarification) {
      clarifBox.style.display = 'block';
      clarifText.textContent = card.errata.clarification;
    } else {
      clarifBox.style.display = 'none';
    }
  } else {
    errataSection.style.display = 'none';
  }

  // Universal Combo Recipes Section
  const combosSection = document.getElementById('modalCombosSection');
  const combosList = document.getElementById('modalCombosList');
  const deckSynergies = computeActiveDeckSynergies(card);
  const hasCombos = card.comboLines && card.comboLines.length > 0;

  if (hasCombos || deckSynergies.length > 0) {
    combosSection.style.display = 'flex';
    combosList.innerHTML = '';

    if (hasCombos) {
      card.comboLines.forEach(combo => {
        const box = document.createElement('div');
        box.className = 'combo-recipe-box';
        box.innerHTML = `
          <div class="combo-recipe-header">
            <span class="combo-recipe-title">${combo.comboName}</span>
            <span class="combo-dmg-badge">${combo.damagePotential || 'Tactical Synergy'}</span>
          </div>
          <div class="partner-tags-row">
            <span class="partner-label">Key Partners:</span>
            ${(combo.partnerCards || []).map(p => `
              <span class="combo-partner-tag" data-partner="${p}">
                ${p}
                <button class="partner-quick-add-btn" data-partner="${p}" title="Add ${p} to Deck">➕</button>
              </span>
            `).join('')}
          </div>
          <p class="combo-explanation">${combo.tacticalExplanation || combo.explanation || ''}</p>
        `;

        // Partner tag search action
        box.querySelectorAll('.combo-partner-tag').forEach(tag => {
          tag.onclick = (e) => {
            if (e.target.classList.contains('partner-quick-add-btn')) return;
            e.stopPropagation();
            const partnerName = tag.dataset.partner;
            closeCardModal();
            const catalogTabBtn = document.querySelector('.nav-tab[data-tab="catalog"]');
            if (catalogTabBtn) catalogTabBtn.click();
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
              searchInput.value = partnerName;
              searchInput.dispatchEvent(new Event('input'));
            }
          };
        });

        // Partner tag quick-add action
        box.querySelectorAll('.partner-quick-add-btn').forEach(btn => {
          btn.onclick = (e) => {
            e.stopPropagation();
            const pName = btn.dataset.partner;
            const pCard = state.cards.find(c => c.name.toLowerCase() === pName.toLowerCase());
            if (pCard) {
              addCardToMainDeck(pCard.id);
            } else {
              showToast(`Card "${pName}" not found in catalog.`);
            }
          };
        });

        combosList.appendChild(box);
      });
    }

    if (deckSynergies.length > 0) {
      const synHeader = document.createElement('div');
      synHeader.style.fontSize = '0.75rem';
      synHeader.style.fontWeight = '700';
      synHeader.style.textTransform = 'uppercase';
      synHeader.style.color = '#34d399';
      synHeader.style.marginTop = hasCombos ? '10px' : '0';
      synHeader.textContent = '🤝 Synergies with Active Deck';
      combosList.appendChild(synHeader);

      deckSynergies.forEach(syn => {
        const synBox = document.createElement('div');
        synBox.className = 'combo-recipe-box';
        synBox.style.borderLeft = '3px solid #10b981';
        synBox.innerHTML = `
          <div class="combo-recipe-header">
            <span class="combo-recipe-title">${syn.partnerCard.name}</span>
            <span class="combo-dmg-badge" style="background: rgba(16, 185, 129, 0.2); color: #34d399; border-color: #10b981;">${syn.synergyType}</span>
          </div>
          <p class="combo-explanation">${syn.reason}</p>
        `;
        combosList.appendChild(synBox);
      });
    }
  } else {
    combosSection.style.display = 'none';
  }

  // Enable/disable match slot assignment depending on character type
  const slotBtn = document.getElementById('modalBtnAddSlot');
  if (card.cardType === 'Character') {
    slotBtn.style.display = 'block';
  } else {
    slotBtn.style.display = 'none';
  }

  modal.style.display = 'flex';
}

function closeCardModal() {
  const modal = document.getElementById('cardModal');
  if (modal) modal.style.display = 'none';
  state.activeModalCard = null;
}

// 5b. Card Combo & Synergy Inspector
function inspectCardCombos(card) {
  const inspector = document.getElementById('cardComboInspector');
  if (!inspector) return;

  inspector.style.display = 'block';

  // Preview & Meta
  const thumb = document.getElementById('inspectorThumb');
  if (thumb) {
    thumb.src = card.images?.primary || '';
    thumb.onerror = () => { thumb.src = 'https://placehold.co/240x336/131b2e/38bdf8?text=YYH+TCG'; };
  }

  const nameEl = document.getElementById('inspectorCardName');
  if (nameEl) nameEl.textContent = card.name;

  const subEl = document.getElementById('inspectorCardSub');
  if (subEl) {
    let subParts = [card.set, card.cardNumber];
    if (card.team) subParts.push(card.team);
    if (card.defense) subParts.push(`DEF ${card.defense}`);
    if (card.seCost !== null) subParts.push(`SE ${card.seCost}`);
    subEl.textContent = subParts.join(' • ');
  }

  const typeBadge = document.getElementById('inspectorTypeBadge');
  if (typeBadge) {
    typeBadge.textContent = card.cardType;
    typeBadge.className = `badge badge-${card.cardType.toLowerCase()}`;
  }

  const comboCount = (card.comboLines || []).length;
  const comboBadge = document.getElementById('inspectorComboBadge');
  if (comboBadge) comboBadge.textContent = `💥 ${comboCount} Combo Recipe${comboCount !== 1 ? 's' : ''}`;

  const btnAdd = document.getElementById('inspectorBtnAddDeck');
  if (btnAdd) {
    btnAdd.onclick = () => {
      addCardToMainDeck(card.id);
    };
  }

  // Combos & Partner Cards List
  const combosContainer = document.getElementById('inspectorCombosList');
  combosContainer.innerHTML = '';

  if (card.comboLines && card.comboLines.length > 0) {
    card.comboLines.forEach(combo => {
      const box = document.createElement('div');
      box.className = 'inspector-combo-card';

      let partnerChipsHtml = '';
      if (combo.partnerCards && combo.partnerCards.length > 0) {
        partnerChipsHtml = combo.partnerCards.map(pName => {
          return `
            <span class="partner-chip">
              <strong>${pName}</strong>
              <span class="partner-chip-actions">
                <button class="partner-chip-btn btn-add-partner" data-partner="${pName}" title="Add ${pName} to Deck">➕</button>
                <button class="partner-chip-btn btn-find-partner" data-partner="${pName}" title="Find ${pName} in Catalog">🔍</button>
              </span>
            </span>
          `;
        }).join('');
      }

      box.innerHTML = `
        <div class="inspector-combo-head">
          <span class="inspector-combo-name">${combo.comboName}</span>
          <span class="combo-dmg-badge">${combo.damagePotential || 'Synergy'}</span>
        </div>
        ${partnerChipsHtml ? `<div class="inspector-partner-chips"><span class="partner-label">Partners:</span> ${partnerChipsHtml}</div>` : ''}
        <p class="inspector-combo-desc">${combo.tacticalExplanation || combo.explanation || ''}</p>
      `;

      box.querySelectorAll('.btn-add-partner').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const pName = btn.dataset.partner;
          const pCard = state.cards.find(c => c.name.toLowerCase() === pName.toLowerCase());
          if (pCard) {
            addCardToMainDeck(pCard.id);
          } else {
            showToast(`Card "${pName}" not found in database.`);
          }
        };
      });

      box.querySelectorAll('.btn-find-partner').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const pName = btn.dataset.partner;
          const searchInput = document.getElementById('searchInput');
          if (searchInput) {
            searchInput.value = pName;
            searchInput.dispatchEvent(new Event('input'));
          }
        };
      });

      combosContainer.appendChild(box);
    });
  } else {
    // Dynamically generate tactical suggestions
    const dynamicPartners = generateDynamicPartnerAdvice(card);
    if (dynamicPartners.length > 0) {
      dynamicPartners.forEach(advice => {
        const box = document.createElement('div');
        box.className = 'inspector-combo-card';
        box.innerHTML = `
          <div class="inspector-combo-head">
            <span class="inspector-combo-name">${advice.title}</span>
            <span class="combo-dmg-badge">${advice.tag}</span>
          </div>
          ${advice.partnerCard ? `
            <div class="inspector-partner-chips">
              <span class="partner-label">Recommended Partner:</span>
              <span class="partner-chip">
                <strong>${advice.partnerCard.name}</strong>
                <span class="partner-chip-actions">
                  <button class="partner-chip-btn btn-add-partner" data-partner="${advice.partnerCard.name}" title="Add to Deck">➕</button>
                  <button class="partner-chip-btn btn-find-partner" data-partner="${advice.partnerCard.name}" title="Find in Catalog">🔍</button>
                </span>
              </span>
            </div>
          ` : ''}
          <p class="inspector-combo-desc">${advice.why}</p>
        `;

        box.querySelectorAll('.btn-add-partner').forEach(btn => {
          btn.onclick = (e) => {
            e.stopPropagation();
            if (advice.partnerCard) addCardToMainDeck(advice.partnerCard.id);
          };
        });

        box.querySelectorAll('.btn-find-partner').forEach(btn => {
          btn.onclick = (e) => {
            e.stopPropagation();
            if (advice.partnerCard) {
              const searchInput = document.getElementById('searchInput');
              if (searchInput) {
                searchInput.value = advice.partnerCard.name;
                searchInput.dispatchEvent(new Event('input'));
              }
            }
          };
        });

        combosContainer.appendChild(box);
      });
    } else {
      combosContainer.innerHTML = '<div class="inspector-empty-msg">No dedicated combo line found. This card operates effectively as a flexible tactical tech choice.</div>';
    }
  }

  // Active Deck Synergies List
  const deckSynergiesContainer = document.getElementById('inspectorDeckSynergiesList');
  deckSynergiesContainer.innerHTML = '';
  const deckSynergies = computeActiveDeckSynergies(card);

  const deckBadge = document.getElementById('inspectorDeckBadge');
  if (deckBadge) deckBadge.textContent = `🤝 ${deckSynergies.length} Deck Synerg${deckSynergies.length === 1 ? 'y' : 'ies'}`;

  if (deckSynergies.length > 0) {
    deckSynergies.forEach(syn => {
      const synDiv = document.createElement('div');
      synDiv.className = 'inspector-synergy-item';
      synDiv.innerHTML = `
        <img class="inspector-synergy-thumb" src="${syn.partnerCard.images.primary}" alt="${syn.partnerCard.name}" loading="lazy">
        <div class="inspector-synergy-content">
          <div class="inspector-synergy-title-row">
            <span class="inspector-synergy-name">${syn.partnerCard.name}</span>
            <span class="inspector-synergy-badge">${syn.synergyType}</span>
          </div>
          <p class="inspector-synergy-desc">${syn.reason}</p>
        </div>
      `;

      synDiv.querySelector('.inspector-synergy-thumb').onclick = () => openCardModal(syn.partnerCard);
      synDiv.querySelector('.inspector-synergy-name').onclick = () => openCardModal(syn.partnerCard);
      deckSynergiesContainer.appendChild(synDiv);
    });
  } else {
    deckSynergiesContainer.innerHTML = '<div class="inspector-empty-msg">No direct synergies identified with your current deck. Adding team members or combo partners will unlock pairings!</div>';
  }

  // Scroll smoothly to inspector
  inspector.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function computeActiveDeckSynergies(card) {
  if (!card) return [];
  const synergies = [];
  const seenPartnerIds = new Set();

  const deckCardIds = new Set();
  if (state.currentDeck?.slots) {
    Object.values(state.currentDeck.slots).forEach(id => {
      if (id) deckCardIds.add(id);
    });
  }
  if (state.currentDeck?.mainDeck) {
    Object.keys(state.currentDeck.mainDeck).forEach(id => {
      if (id && state.currentDeck.mainDeck[id] > 0) deckCardIds.add(id);
    });
  }

  for (const id of deckCardIds) {
    if (id === card.id) continue;
    const partnerCard = state.cardMap.get(id);
    if (!partnerCard || seenPartnerIds.has(partnerCard.id)) continue;

    // 1. Explicit Combo Partner match
    let comboPartnerMatch = false;
    let comboName = '';
    let comboExpl = '';

    if (card.comboLines && card.comboLines.length > 0) {
      for (const line of card.comboLines) {
        if ((line.partnerCards || []).some(p => p.toLowerCase() === partnerCard.name.toLowerCase())) {
          comboPartnerMatch = true;
          comboName = line.comboName;
          comboExpl = line.tacticalExplanation || line.explanation || '';
          break;
        }
      }
    }
    if (!comboPartnerMatch && partnerCard.comboLines && partnerCard.comboLines.length > 0) {
      for (const line of partnerCard.comboLines) {
        if ((line.partnerCards || []).some(p => p.toLowerCase() === card.name.toLowerCase())) {
          comboPartnerMatch = true;
          comboName = line.comboName;
          comboExpl = line.tacticalExplanation || line.explanation || '';
          break;
        }
      }
    }

    if (comboPartnerMatch) {
      synergies.push({
        partnerCard,
        synergyType: '💥 Combo Partner',
        priority: 100,
        reason: comboExpl ? `Combos into "${comboName}": ${comboExpl}` : `Direct partner in "${comboName}" combo line!`
      });
      seenPartnerIds.add(partnerCard.id);
      continue;
    }

    // 2. Team Bonus Synergy
    if (card.team && partnerCard.team && card.team === partnerCard.team && card.team !== 'None') {
      const isSlot = Object.values(state.currentDeck.slots || {}).includes(partnerCard.id);
      synergies.push({
        partnerCard,
        synergyType: '🤝 Team Synergy',
        priority: 80,
        reason: isSlot
          ? `Shares ${card.team} with starting character ${partnerCard.name}, unlocking active team bonuses.`
          : `Shares ${card.team} bonus synergies with ${partnerCard.name}.`
      });
      seenPartnerIds.add(partnerCard.id);
      continue;
    }

    // 3. Team Prerequisite match
    if (card.prerequisites && card.prerequisites.includes(partnerCard.team) && partnerCard.team !== 'None') {
      synergies.push({
        partnerCard,
        synergyType: '🔑 Team Enabler',
        priority: 75,
        reason: `${partnerCard.name} satisfies this card's ${card.prerequisites} requirement.`
      });
      seenPartnerIds.add(partnerCard.id);
      continue;
    }

    // 4. Resource / Mechanics Synergies
    if ((card.seCost >= 3 || (card.attacks || []).some(a => a.damage >= 8000)) &&
        (partnerCard.strategicRoles?.includes('resource_ramp') || partnerCard.name.includes('Spirit Cuffs') || partnerCard.name.includes('Backyard Dummy'))) {
      synergies.push({
        partnerCard,
        synergyType: '⚡ Energy Enabler',
        priority: 60,
        reason: `${partnerCard.name} banks Spirit Energy, ensuring you can afford ${card.name}'s high-cost abilities.`
      });
      seenPartnerIds.add(partnerCard.id);
      continue;
    }

    if ((card.attacks || []).some(a => a.cost >= 2) &&
        (partnerCard.strategicRoles?.includes('draw_engine') || partnerCard.name.includes('Kitty Love') || partnerCard.name.includes('Heroic Team'))) {
      synergies.push({
        partnerCard,
        synergyType: '🃏 Draw Fuel',
        priority: 55,
        reason: `${partnerCard.name} draws cards to feed ${card.name}'s multi-card attack discard cost.`
      });
      seenPartnerIds.add(partnerCard.id);
      continue;
    }

    if (card.cardType === 'Technique' && (partnerCard.name.includes('Genkai') || partnerCard.team === 'Team Genkai')) {
      synergies.push({
        partnerCard,
        synergyType: '📜 Technique Engine',
        priority: 50,
        reason: `${partnerCard.name} specializes in technique execution and cost-effective technique recycling.`
      });
      seenPartnerIds.add(partnerCard.id);
      continue;
    }
  }

  synergies.sort((a, b) => b.priority - a.priority);
  return synergies.slice(0, 5);
}

function generateDynamicPartnerAdvice(card) {
  const suggestions = [];

  if (card.team && card.team !== 'None') {
    const teamMates = state.cards.filter(c => c.id !== card.id && c.team === card.team && c.cardType === 'Character');
    if (teamMates.length > 0) {
      const mate = teamMates[0];
      suggestions.push({
        title: `${card.team} Roster Pairing`,
        tag: 'Team Synergy',
        partnerCard: mate,
        why: `Pairs with ${mate.name} to maximize ${card.team} team bonus activations and team-locked attack synergies.`
      });
    }
  }

  const maxAtkCost = Math.max(0, ...(card.attacks || []).map(a => a.cost || 0));
  const maxAtkDmg = Math.max(0, ...(card.attacks || []).map(a => typeof a.damage === 'number' ? a.damage : 0));

  if (card.seCost >= 3 || maxAtkDmg >= 8000) {
    const cuffCard = state.cards.find(c => c.name.toLowerCase() === 'spirit cuffs') ||
                     state.cards.find(c => c.name.toLowerCase() === 'backyard dummy');
    if (cuffCard) {
      suggestions.push({
        title: 'Spirit Energy Acceleration',
        tag: 'Resource Fuel',
        partnerCard: cuffCard,
        why: `Run ${cuffCard.name} to bank Spirit Energy early, guaranteeing reliable turn-to-turn activation for high-cost attacks.`
      });
    }
  }

  if (maxAtkCost >= 2) {
    const drawCard = state.cards.find(c => c.name.toLowerCase() === 'kitty love') ||
                     state.cards.find(c => c.name.toLowerCase() === 'heroic team');
    if (drawCard) {
      suggestions.push({
        title: 'Hand Size Sustain & Draw',
        tag: 'Discard Fuel',
        partnerCard: drawCard,
        why: `${drawCard.name} maintains healthy hand size to pay ${card.name}'s ${maxAtkCost}-card discard costs without exhausting your options.`
      });
    }
  }

  if (card.cardType === 'Technique') {
    const genkaiCard = state.cards.find(c => c.name.toLowerCase().includes('genkai') && c.cardType === 'Character');
    if (genkaiCard) {
      suggestions.push({
        title: 'Technique Mastery',
        tag: 'Archetype Synergy',
        partnerCard: genkaiCard,
        why: `${genkaiCard.name} provides superior technique synergy, unlocking lower activation costs and expanded tactical options.`
      });
    }
  }

  if (card.cardType === 'Character' && card.defense && card.defense < 6000) {
    const defCard = state.cards.find(c => c.name.toLowerCase() === 'defensive posture') ||
                    state.cards.find(c => c.name.toLowerCase() === 'armor of clay');
    if (defCard) {
      suggestions.push({
        title: 'Burst Damage Protection',
        tag: 'Survival Tech',
        partnerCard: defCard,
        why: `With ${card.defense} DEF, ${card.name} is vulnerable to 2-wound KOs; ${defCard.name} boosts defense to survive incoming attacks.`
      });
    }
  }

  return suggestions.slice(0, 3);
}

// 6. Deck Building Core Operations
function assignCardToSlot(slotNum, cardId) {
  const card = state.cardMap.get(cardId);
  if (!card) return;
  if (card.cardType !== 'Character') {
    showToast('Only Character cards can be placed in Match Slots!');
    return;
  }

  // Check unique character constraint
  for (let s = 1; s <= 4; s++) {
    if (s !== slotNum && state.currentDeck.slots[s] === cardId) {
      showToast(`Each of the 4 starting characters must be unique! (${card.name} is already in Slot ${s})`);
      return;
    }
  }

  state.currentDeck.slots[slotNum] = cardId;
  showToast(`Assigned ${card.name} to Match Slot ${slotNum}`);
  updateDeckState();
}

function removeSlotCharacter(slotNum) {
  state.currentDeck.slots[slotNum] = null;
  updateDeckState();
}

function addCardToMainDeck(cardId) {
  const card = state.cardMap.get(cardId);
  if (!card) return;

  const currentCount = state.currentDeck.mainDeck[cardId] || 0;
  if (currentCount >= card.limitPerDeck) {
    showToast(`Maximum ${card.limitPerDeck} copies of ${card.name} allowed per deck!`);
    return;
  }

  state.currentDeck.mainDeck[cardId] = currentCount + 1;
  showToast(`Added ${card.name} (${state.currentDeck.mainDeck[cardId]}/${card.limitPerDeck})`);
  updateDeckState();
}

function removeCardFromMainDeck(cardId) {
  if (state.currentDeck.mainDeck[cardId]) {
    state.currentDeck.mainDeck[cardId]--;
    if (state.currentDeck.mainDeck[cardId] <= 0) {
      delete state.currentDeck.mainDeck[cardId];
    }
    updateDeckState();
  }
}

function deleteCardFromMainDeck(cardId) {
  delete state.currentDeck.mainDeck[cardId];
  updateDeckState();
}

// 7. Deck State & Validation Engine
function updateDeckState() {
  saveCurrentDeckToLocalStorage();
  renderDeckBuilder();
  renderCards(); // update counters on catalog
}

function renderDeckBuilder() {
  // 1. Starting Match Slots
  for (let s = 1; s <= 4; s++) {
    const cardId = state.currentDeck.slots[s];
    const dropzone = document.getElementById(`slotZone${s}`);
    const leaderBtn = document.querySelector(`.slot-leader-btn[data-slot="${s}"]`);

    if (state.currentDeck.leaderSlot === s) {
      leaderBtn.classList.add('active');
    } else {
      leaderBtn.classList.remove('active');
    }

    if (cardId && state.cardMap.has(cardId)) {
      const card = state.cardMap.get(cardId);
      dropzone.innerHTML = `
        <div class="slot-assigned-view">
          <img class="slot-char-img" src="${card.images.primary}" alt="${card.name}">
          <div class="slot-char-name">${card.name}</div>
          <div class="slot-char-meta">
            <span>${card.team ? card.team.replace('Team ', '') : 'Neutral'}</span>
            <span class="slot-char-def">DEF ${card.defense || 0}</span>
          </div>
          <button class="slot-remove-btn" data-slot="${s}">Remove</button>
        </div>
      `;
      dropzone.querySelector('.slot-remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        removeSlotCharacter(s);
      });
      dropzone.onclick = () => openCardModal(card);
    } else {
      dropzone.innerHTML = `
        <div class="slot-empty-state">
          <span class="empty-icon">➕</span>
          <p>Assign Character</p>
        </div>
      `;
      dropzone.onclick = () => {
        state.activeTab = 'catalog';
        document.querySelector('[data-tab="catalog"]').click();
        document.getElementById('filterType').value = 'Character';
        document.getElementById('filterType').dispatchEvent(new Event('change'));
      };
    }
  }

  // Leader Button Toggle Handlers
  document.querySelectorAll('.slot-leader-btn').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const s = parseInt(btn.dataset.slot);
      state.currentDeck.leaderSlot = s;
      updateDeckState();
    };
  });

  // 2. Main Deck Categories
  renderDeckCategory('Technique', 'itemsTechs', 'countTechs');
  renderDeckCategory('Event', 'itemsEvents', 'countEvents');
  renderDeckCategory('Item', 'itemsItems', 'countItems');
  renderDeckCategory('Character', 'itemsChars', 'countChars');

  // 3. Count Totals & Validation
  const startingCharsCount = Object.values(state.currentDeck.slots).filter(Boolean).length;
  const mainDeckCount = Object.values(state.currentDeck.mainDeck).reduce((a, b) => a + b, 0);
  const totalCardsCount = startingCharsCount + mainDeckCount;

  document.getElementById('charCountDisplay').textContent = `${startingCharsCount} / 4`;
  document.getElementById('mainCountDisplay').textContent = `${mainDeckCount} / 40 min`;
  document.getElementById('totalCountDisplay').textContent = `${totalCardsCount} / 44 min`;
  document.getElementById('headerDeckCount').textContent = `${totalCardsCount}/44`;

  // Validation Flags
  const has4Chars = startingCharsCount === 4;
  const assignedCharIds = Object.values(state.currentDeck.slots).filter(Boolean);
  const hasUniqueChars = new Set(assignedCharIds).size === assignedCharIds.length;
  const hasMinMain = mainDeckCount >= 40;
  const hasMinTotal = totalCardsCount >= 44;

  let copyLimitsRespected = true;
  for (const [id, count] of Object.entries(state.currentDeck.mainDeck)) {
    const card = state.cardMap.get(id);
    if (card && count > card.limitPerDeck) {
      copyLimitsRespected = false;
      break;
    }
  }

  const isDeckLegal = has4Chars && hasUniqueChars && hasMinMain && hasMinTotal && copyLimitsRespected;

  // Validation Checklist UI
  setCheckItem('checkStartingChars', has4Chars, '4 Starting Characters placed');
  setCheckItem('checkUniqueChars', hasUniqueChars, 'Starting characters are distinct');
  setCheckItem('checkMainDeckSize', hasMinMain, 'Minimum 40 Main Deck cards');
  setCheckItem('checkTotalDeckSize', hasMinTotal, 'Minimum 44 Total cards');
  setCheckItem('checkCopyLimits', copyLimitsRespected, 'Copy limits respected (max 3, Limit 1 respected)');

  const badge = document.getElementById('deckLegalBadge');
  if (isDeckLegal) {
    badge.className = 'deck-badge badge-success';
    badge.textContent = 'Legal Tournament Deck ✓';
  } else {
    badge.className = 'deck-badge badge-warning';
    badge.textContent = 'Incomplete Deck ⚠️';
  }

  // 4. Team Bonus Evaluation
  evaluateTeamBonus();

  // 5. Analytics (SE Curve and Composition)
  renderAnalytics(mainDeckCount);

  // 6. Competitive Synergy & Machine Evaluation Engine
  triggerSynergyCalculation();
}

function renderDeckCategory(cardType, containerId, countId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  const matchingEntries = Object.entries(state.currentDeck.mainDeck).filter(([id]) => {
    const card = state.cardMap.get(id);
    return card && card.cardType === cardType;
  });

  const totalCatCount = matchingEntries.reduce((sum, [, count]) => sum + count, 0);
  document.getElementById(countId).textContent = `(${totalCatCount})`;

  if (matchingEntries.length === 0) {
    container.innerHTML = `<div class="empty-type-msg">No ${cardType.toLowerCase()}s added yet.</div>`;
    return;
  }

  matchingEntries.forEach(([id, count]) => {
    const card = state.cardMap.get(id);
    const row = document.createElement('div');
    row.className = 'deck-card-row';

    row.innerHTML = `
      <div class="deck-card-left">
        <img class="deck-row-thumb" src="${card.images.primary}" alt="${card.name}">
        <div class="deck-row-info">
          <span class="deck-row-name">${card.name}</span>
          <span class="deck-row-sub">
            <span>${card.cardNumber}</span> •
            <span>${card.defense ? `DEF ${card.defense}` : (card.seCost !== null ? `SE ${card.seCost}` : '')}</span>
          </span>
        </div>
      </div>
      <div class="deck-card-controls">
        <button class="qty-btn btn-minus" data-id="${id}">-</button>
        <span class="qty-display">${count}</span>
        <button class="qty-btn btn-plus" data-id="${id}">+</button>
        <button class="deck-row-remove" data-id="${id}" title="Remove card">✕</button>
      </div>
    `;

    row.querySelector('.deck-card-left').onclick = () => openCardModal(card);
    row.querySelector('.btn-minus').onclick = () => removeCardFromMainDeck(id);
    row.querySelector('.btn-plus').onclick = () => addCardToMainDeck(id);
    row.querySelector('.deck-row-remove').onclick = () => deleteCardFromMainDeck(id);

    container.appendChild(row);
  });
}

function setCheckItem(id, pass, text) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `check-item ${pass ? 'check-pass' : 'check-fail'}`;
  el.innerHTML = `<span class="check-icon">${pass ? '✓' : '✕'}</span> ${text}`;
}

function evaluateTeamBonus() {
  const banner = document.getElementById('teamBonusBanner');
  const title = document.getElementById('teamBonusTitle');
  const desc = document.getElementById('teamBonusDesc');

  const charCards = Object.values(state.currentDeck.slots)
    .filter(Boolean)
    .map(id => state.cardMap.get(id))
    .filter(Boolean);

  if (charCards.length === 4) {
    const teams = charCards.map(c => c.team).filter(Boolean);
    if (teams.length === 4 && new Set(teams).size === 1) {
      const activeTeam = teams[0];
      const bonusInfo = TEAM_BONUSES[activeTeam] || {
        title: `${activeTeam} Bonus Active!`,
        desc: `All 4 starting characters belong to ${activeTeam}. Team synergy bonus activated.`
      };

      banner.className = 'team-bonus-banner active';
      title.textContent = bonusInfo.title;
      desc.textContent = bonusInfo.desc;
      return;
    }
  }

  banner.className = 'team-bonus-banner inactive';
  title.textContent = 'Team Bonus Inactive';
  desc.textContent = 'Include 4 starting characters with the same Team Symbol to unlock that team\'s special game bonus!';
}

function renderAnalytics(mainDeckCount) {
  // 1. SE Curve Chart
  const curveChart = document.getElementById('seCurveChart');
  curveChart.innerHTML = '';

  const seBuckets = { 0: 0, 1: 0, 2: 0, 3: 0, '4+': 0 };
  let maxBucket = 1;

  for (const [id, count] of Object.entries(state.currentDeck.mainDeck)) {
    const card = state.cardMap.get(id);
    if (card && card.seCost !== null) {
      const cost = card.seCost;
      if (cost >= 4) seBuckets['4+'] += count;
      else seBuckets[cost] = (seBuckets[cost] || 0) + count;
    }
  }

  for (const count of Object.values(seBuckets)) {
    if (count > maxBucket) maxBucket = count;
  }

  for (const [label, count] of Object.entries(seBuckets)) {
    const col = document.createElement('div');
    col.className = 'curve-col';
    const heightPercent = Math.max(8, (count / maxBucket) * 100);

    col.innerHTML = `
      <span class="curve-count">${count}</span>
      <div class="curve-bar-container">
        <div class="curve-bar" style="height: ${heightPercent}%"></div>
      </div>
      <span class="curve-cost-label">${label} SE</span>
    `;
    curveChart.appendChild(col);
  }

  // 2. Deck Composition Bars
  if (mainDeckCount > 0) {
    const getCount = (type) => Object.entries(state.currentDeck.mainDeck)
      .filter(([id]) => state.cardMap.get(id)?.cardType === type)
      .reduce((sum, [, count]) => sum + count, 0);

    const techP = Math.round((getCount('Technique') / mainDeckCount) * 100);
    const eventP = Math.round((getCount('Event') / mainDeckCount) * 100);
    const itemP = Math.round((getCount('Item') / mainDeckCount) * 100);
    const charP = Math.round((getCount('Character') / mainDeckCount) * 100);

    document.getElementById('barTech').style.width = `${techP}%`;
    document.getElementById('labelBarTech').textContent = `${techP}%`;

    document.getElementById('barEvent').style.width = `${eventP}%`;
    document.getElementById('labelBarEvent').textContent = `${eventP}%`;

    document.getElementById('barItem').style.width = `${itemP}%`;
    document.getElementById('labelBarItem').textContent = `${itemP}%`;

    document.getElementById('barChar').style.width = `${charP}%`;
    document.getElementById('labelBarChar').textContent = `${charP}%`;
  } else {
    ['Tech', 'Event', 'Item', 'Char'].forEach(k => {
      document.getElementById(`bar${k}`).style.width = '0%';
      document.getElementById(`labelBar${k}`).textContent = '0%';
    });
  }
}

// ==========================================================================
// 8. Competitive Synergy & Machine Evaluation Engine Integration
// ==========================================================================

let synergyWorker = null;
let debounceSynergyTimeout = null;

function initSynergyWorker() {
  if (typeof Worker !== 'undefined') {
    try {
      synergyWorker = new Worker('src/engine/synergy-worker.js');
      synergyWorker.onmessage = (e) => {
        if (e.data && e.data.success) {
          renderSynergyAnalytics(e.data.results);
        }
      };
      synergyWorker.onerror = (err) => {
        console.warn('Synergy Web Worker error, switching to direct execution:', err);
        synergyWorker = null;
      };
    } catch (e) {
      console.warn('Synergy Web Worker blocked (e.g. file:// protocol), using direct execution fallback:', e);
      synergyWorker = null;
    }
  }
}

function getActiveTeamBonusName() {
  const charCards = Object.values(state.currentDeck.slots)
    .filter(Boolean)
    .map(id => state.cardMap.get(id))
    .filter(Boolean);
  if (charCards.length === 4) {
    const teams = charCards.map(c => c.team).filter(Boolean);
    if (teams.length === 4 && new Set(teams).size === 1) {
      return teams[0];
    }
  }
  return null;
}

function triggerSynergyCalculation() {
  clearTimeout(debounceSynergyTimeout);
  debounceSynergyTimeout = setTimeout(() => {
    runSynergyCalculation();
  }, 100);
}

function runSynergyCalculation() {
  if (!state.cards || state.cards.length === 0) return;

  const activeBonusTeam = getActiveTeamBonusName();
  const deckPayload = {
    slots: { ...state.currentDeck.slots },
    mainDeck: { ...state.currentDeck.mainDeck },
    activeTeamBonus: activeBonusTeam
  };

  if (synergyWorker) {
    synergyWorker.postMessage({
      deckState: deckPayload,
      allCards: state.cards
    });
  } else if (typeof processSynergyEngine === 'function') {
    try {
      const results = processSynergyEngine(deckPayload, state.cards);
      renderSynergyAnalytics(results);
    } catch (err) {
      console.error('Direct synergy evaluation error:', err);
    }
  }
}

function renderSynergyAnalytics(results) {
  if (!results) return;
  renderDeckArchetype(results.archetype);
  renderResourceViability(results.seViability);
  renderCombatBreakpoints(results.combatBreakpoints);
  renderTeamMatchups(results.teamMatchups);
  renderRoleGapsAndRecommendations(results.roleGaps, results.recommendations);
}

function renderDeckArchetype(archetype) {
  if (!archetype) return;
  const iconEl = document.getElementById('archetypeIcon');
  const nameEl = document.getElementById('archetypeName');
  const descEl = document.getElementById('archetypeDesc');
  if (iconEl) iconEl.textContent = archetype.icon || '⚡';
  if (nameEl) nameEl.textContent = archetype.name || 'Custom Archetype';
  if (descEl) descEl.textContent = archetype.desc || '';
}

function renderResourceViability(viability) {
  if (!viability) return;
  const badge = document.getElementById('seViabilityBadge');
  const t1Act = document.getElementById('valT1Action');
  const t2Act = document.getElementById('valT2Action');
  const t1Atk = document.getElementById('valT1Attack');
  const deadH = document.getElementById('valDeadHand');
  const advice = document.getElementById('resourceViabilityAdvice');

  if (badge) {
    badge.textContent = viability.viabilityRating || 'Optimal';
    badge.className = 'badge badge-se-rating';
    const ratingLower = (viability.viabilityRating || '').toLowerCase();
    if (ratingLower.includes('optimal')) badge.classList.add('rating-optimal');
    else if (ratingLower.includes('balanced') || ratingLower.includes('stable')) badge.classList.add('rating-balanced');
    else if (ratingLower.includes('high') || ratingLower.includes('heavy')) badge.classList.add('rating-high-cost');
    else badge.classList.add('rating-starvation-risk');
  }

  if (t1Act) t1Act.textContent = `${viability.turn1PlayableActionPct ?? 0}%`;
  if (t2Act) t2Act.textContent = `${viability.turn2PlayableActionPct ?? 0}%`;
  if (t1Atk) t1Atk.textContent = `${viability.turn1AttackViablePct ?? 0}%`;
  if (deadH) deadH.textContent = `${viability.deadHandPct ?? 0}%`;
  if (advice) advice.textContent = viability.advice || '';
}

function renderCombatBreakpoints(breakpoints) {
  const primaryFighterEl = document.getElementById('breakpointPrimaryFighter');
  const tiersListEl = document.getElementById('breakpointTiersList');
  if (!tiersListEl) return;

  if (primaryFighterEl) {
    primaryFighterEl.textContent = breakpoints?.strongestFighter ? `Primary: ${breakpoints.strongestFighter}` : 'Primary: --';
  }

  tiersListEl.innerHTML = '';
  if (!breakpoints || !breakpoints.tiers) return;

  breakpoints.tiers.forEach(tier => {
    const row = document.createElement('div');
    row.className = 'tier-row';
    const oneWPct = tier.oneWoundPct || 0;
    const twoWPct = tier.twoWoundKOPct || 0;

    row.innerHTML = `
      <div class="tier-header">
        <span class="tier-name">${tier.name}</span>
        <div class="tier-stats">
          <span class="stat-1w" title="Probability of dealing >= 1x DEF (1 Wound)">1-Wound: ${oneWPct}%</span>
          <span class="stat-2w" title="Probability of dealing >= 2x DEF (2 Wounds / Match KO)">2-Wound KO: ${twoWPct}%</span>
        </div>
      </div>
      <div class="tier-bar-track">
        <div class="tier-fill-1w" style="width: ${Math.max(0, oneWPct - twoWPct)}%"></div>
        <div class="tier-fill-2w" style="width: ${twoWPct}%"></div>
      </div>
    `;
    tiersListEl.appendChild(row);
  });
}

function renderTeamMatchups(matchupsData) {
  const metaRatingEl = document.getElementById('overallMetaRating');
  const techTextEl = document.getElementById('universalTechText');
  const container = document.getElementById('matchupBarsContainer');
  if (!container || !matchupsData) return;

  if (metaRatingEl) {
    metaRatingEl.textContent = `Meta Rating: ${matchupsData.overallMetaRating || 50}%`;
  }
  if (techTextEl) {
    techTextEl.textContent = matchupsData.universalSuggestion || matchupsData.universalTechRecommendation || 'Deck balanced across archetypes.';
  }

  container.innerHTML = '';
  (matchupsData.matchups || []).forEach(m => {
    const row = document.createElement('div');
    row.className = 'matchup-row';

    const team = m.teamName || m.team || 'Unknown Team';
    const pwr = m.powerScore ?? m.relativePowerPct ?? 50;
    let statusClass = 'val-balanced';
    let barClass = 'bar-balanced';
    if (pwr >= 65) {
      statusClass = 'val-favorable';
      barClass = 'bar-favorable';
    } else if (pwr < 45) {
      statusClass = 'val-unfavorable';
      barClass = 'bar-unfavorable';
    }

    const adds = m.addSuggestions || m.suggestedAdditions || [];
    const cuts = m.removeSuggestions || m.suggestedRemovals || [];

    row.innerHTML = `
      <div class="matchup-header" data-team="${team}">
        <div class="matchup-team-info">
          <span class="matchup-team-icon">${m.icon || '⚔️'}</span>
          <span class="matchup-team-name">${team}</span>
          <span class="matchup-archetype-tag">${m.archetype || ''}</span>
        </div>
        <div class="matchup-power-group">
          <span class="matchup-power-val ${statusClass}">${pwr}%</span>
          <button class="matchup-toggle-btn" title="Toggle tactical matchup drilldown">▼</button>
        </div>
      </div>
      <div class="matchup-bar-track">
        <div class="matchup-bar-fill ${barClass}" style="width: ${pwr}%"></div>
      </div>
      <div class="matchup-drilldown">
        <p class="matchup-threat-desc">${m.desc || m.threatAssessment || ''}</p>
        <div class="matchup-advice-cols">
          <div class="advice-col advice-add">
            <span class="advice-title">Recommended Additions</span>
            ${adds.length > 0 ? adds.map(item => `<span class="advice-item">+ ${item}</span>`).join('') : '<span class="advice-item text-dim">None needed</span>'}
          </div>
          <div class="advice-col advice-remove">
            <span class="advice-title">Suggested Cuts</span>
            ${cuts.length > 0 ? cuts.map(item => `<span class="advice-item">- ${item}</span>`).join('') : '<span class="advice-item text-dim">None needed</span>'}
          </div>
        </div>
      </div>
    `;

    // Click header to toggle drilldown
    const header = row.querySelector('.matchup-header');
    const drilldown = row.querySelector('.matchup-drilldown');
    const toggleBtn = row.querySelector('.matchup-toggle-btn');
    header.onclick = () => {
      const isOpen = drilldown.classList.toggle('open');
      toggleBtn.textContent = isOpen ? '▲' : '▼';
    };

    container.appendChild(row);
  });
}

function renderRoleGapsAndRecommendations(roleGaps, recommendations) {
  const gapsContainer = document.getElementById('roleGapsContainer');
  const recsContainer = document.getElementById('recommendationsList');
  if (!gapsContainer || !recsContainer) return;

  // 1. Role gaps
  gapsContainer.innerHTML = '';
  if (roleGaps && roleGaps.length > 0) {
    roleGaps.forEach(gap => {
      const gapDiv = document.createElement('div');
      const isHigh = gap.urgency === 'high';
      gapDiv.className = `gap-alert-item ${isHigh ? 'gap-urgency-high' : 'gap-urgency-medium'}`;
      gapDiv.innerHTML = `
        <span class="gap-alert-icon">${isHigh ? '⚠️' : '💡'}</span>
        <div class="gap-alert-body">
          <strong>${gap.title}</strong>
          <span>${gap.desc}</span>
        </div>
      `;
      gapsContainer.appendChild(gapDiv);
    });
  }

  // 2. Recommendations
  recsContainer.innerHTML = '';
  if (!recommendations || recommendations.length === 0) {
    recsContainer.innerHTML = '<div class="empty-type-msg">No strategic card recommendations at this time. Deck looks well-rounded!</div>';
    return;
  }

  recommendations.forEach(rec => {
    const card = rec.card;
    const item = document.createElement('div');
    item.className = 'rec-card-item';

    item.innerHTML = `
      <div class="rec-card-header-row">
        <div class="rec-card-left">
          <img class="rec-thumb" src="${card.images.primary}" alt="${card.name}">
          <div class="rec-info">
            <span class="rec-name">${card.name}</span>
            <div class="rec-sub">
              <span>${card.cardType}</span>
              <span class="rec-reason-badge">${rec.primaryReason}</span>
            </div>
          </div>
        </div>
        <button class="rec-add-btn" data-id="${card.id}">+ Add</button>
      </div>
      ${rec.detailedWhy ? `<p class="rec-why-desc">${rec.detailedWhy}</p>` : ''}
    `;

    item.querySelector('.rec-card-left').onclick = () => openCardModal(card);
    item.querySelector('.rec-add-btn').onclick = (e) => {
      e.stopPropagation();
      addCardToMainDeck(card.id);
    };

    recsContainer.appendChild(item);
  });
}

// 9. Deck Saving & Library Integration
function setupDeckActions() {
  document.getElementById('deckNameInput').addEventListener('input', (e) => {
    state.currentDeck.name = e.target.value;
    saveCurrentDeckToLocalStorage();
  });

  document.getElementById('deckAuthorInput').addEventListener('input', (e) => {
    state.currentDeck.author = e.target.value;
    saveCurrentDeckToLocalStorage();
  });

  document.getElementById('btnSaveDeck').addEventListener('click', saveDeck);
  document.getElementById('btnClearDeck').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the entire deck?')) {
      state.currentDeck.slots = { 1: null, 2: null, 3: null, 4: null };
      state.currentDeck.mainDeck = {};
      updateDeckState();
      showToast('Deck cleared.');
    }
  });

  document.getElementById('btnNewDeck').addEventListener('click', () => {
    state.currentDeck = {
      id: 'deck_' + Date.now(),
      name: 'New Custom Deck',
      author: 'Player',
      slots: { 1: null, 2: null, 3: null, 4: null },
      leaderSlot: 1,
      mainDeck: {}
    };
    document.getElementById('deckNameInput').value = state.currentDeck.name;
    document.getElementById('deckAuthorInput').value = state.currentDeck.author;
    updateDeckState();
    state.activeTab = 'deckbuilder';
    document.querySelector('[data-tab="deckbuilder"]').click();
  });

  // Export / Import Modals
  setupExportModal();
}

async function saveDeck() {
  const deck = {
    ...state.currentDeck,
    updatedAt: new Date().toISOString()
  };

  // 1. Try local server API
  try {
    const res = await fetch('/api/decks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deck)
    });
    if (res.ok) {
      showToast(`Saved "${deck.name}" to disk!`);
      await loadSavedDecks();
      return;
    }
  } catch (e) {
    // API not available, fall back to LocalStorage
  }

  // 2. LocalStorage fallback
  const library = JSON.parse(localStorage.getItem('yyh_saved_decks') || '[]');
  const idx = library.findIndex(d => d.id === deck.id);
  if (idx >= 0) library[idx] = deck;
  else library.push(deck);

  localStorage.setItem('yyh_saved_decks', JSON.stringify(library));
  showToast(`Saved "${deck.name}" to browser storage!`);
  await loadSavedDecks();
}

async function loadSavedDecks() {
  let decks = [];
  try {
    const res = await fetch('/api/decks');
    if (res.ok) {
      decks = await res.json();
    }
  } catch (e) {}

  if (!decks || decks.length === 0) {
    decks = JSON.parse(localStorage.getItem('yyh_saved_decks') || '[]');
  }

  // Ensure starter decks exist
  if (decks.length === 0) {
    decks = getStarterDecks();
    localStorage.setItem('yyh_saved_decks', JSON.stringify(decks));
  }

  state.savedDecks = decks;
}

function renderSavedDecks() {
  const container = document.getElementById('savedDecksGrid');
  container.innerHTML = '';

  state.savedDecks.forEach(deck => {
    const card = document.createElement('div');
    card.className = 'deck-library-card';

    // Char thumbs
    let thumbsHtml = '';
    for (let s = 1; s <= 4; s++) {
      const cId = deck.slots[s];
      const charCard = state.cardMap.get(cId);
      if (charCard) {
        thumbsHtml += `<img class="library-thumb" src="${charCard.images.primary}" title="${charCard.name}">`;
      }
    }

    const mainCount = Object.values(deck.mainDeck || {}).reduce((a, b) => a + b, 0);

    card.innerHTML = `
      <div class="library-card-header">
        <div>
          <div class="library-deck-name">${deck.name}</div>
          <div class="library-deck-author">By ${deck.author || 'Anonymous'}</div>
        </div>
      </div>
      <div class="library-char-previews">
        ${thumbsHtml || '<span class="text-dim">No starting characters</span>'}
      </div>
      <div class="library-deck-stats">
        <span>Main Deck: ${mainCount} cards</span>
      </div>
      <div class="library-actions">
        <button class="btn btn-primary btn-sm btn-load-deck">Load Deck</button>
        <button class="btn btn-secondary btn-sm btn-del-deck">Delete</button>
      </div>
    `;

    card.querySelector('.btn-load-deck').onclick = () => {
      state.currentDeck = JSON.parse(JSON.stringify(deck));
      document.getElementById('deckNameInput').value = deck.name;
      document.getElementById('deckAuthorInput').value = deck.author || '';
      updateDeckState();
      state.activeTab = 'deckbuilder';
      document.querySelector('[data-tab="deckbuilder"]').click();
      showToast(`Loaded deck: ${deck.name}`);
    };

    card.querySelector('.btn-del-deck').onclick = async () => {
      if (confirm(`Delete deck "${deck.name}"?`)) {
        try {
          await fetch(`/api/decks/${deck.filename || deck.id + '.json'}`, { method: 'DELETE' });
        } catch (e) {}

        const lib = JSON.parse(localStorage.getItem('yyh_saved_decks') || '[]').filter(d => d.id !== deck.id);
        localStorage.setItem('yyh_saved_decks', JSON.stringify(lib));
        await loadSavedDecks();
        renderSavedDecks();
        showToast('Deck deleted.');
      }
    };

    container.appendChild(card);
  });
}

// 9. Export & Import Dialog
function setupExportModal() {
  const modal = document.getElementById('exportModal');
  const closeBtn = document.getElementById('exportModalClose');
  const btnExport = document.getElementById('btnExportDeck');
  const btnImport = document.getElementById('btnImportDeck');
  const btnCopy = document.getElementById('btnCopyExport');
  const btnDownload = document.getElementById('btnDownloadExport');
  const btnApply = document.getElementById('btnApplyImport');
  const textArea = document.getElementById('exportTextArea');
  let currentFormat = 'text';

  btnExport.onclick = () => {
    document.getElementById('exportModalTitle').textContent = 'Export Decklist';
    btnApply.style.display = 'none';
    btnCopy.style.display = 'block';
    btnDownload.style.display = 'block';
    updateExportText();
    modal.style.display = 'flex';
  };

  btnImport.onclick = () => {
    document.getElementById('exportModalTitle').textContent = 'Import Deck (Text or JSON)';
    btnApply.style.display = 'block';
    btnCopy.style.display = 'none';
    btnDownload.style.display = 'none';
    textArea.value = '';
    textArea.placeholder = 'Paste Tournament Deck text list or JSON here...';
    modal.style.display = 'flex';
  };

  closeBtn.onclick = () => modal.style.display = 'none';
  modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

  document.querySelectorAll('.export-tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.export-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFormat = btn.dataset.format;
      updateExportText();
    };
  });

  function updateExportText() {
    if (currentFormat === 'text') {
      textArea.value = generateTournamentText();
    } else {
      textArea.value = JSON.stringify(state.currentDeck, null, 2);
    }
  }

  btnCopy.onclick = () => {
    navigator.clipboard.writeText(textArea.value);
    showToast('Decklist copied to clipboard!');
  };

  btnDownload.onclick = () => {
    const ext = currentFormat === 'text' ? 'txt' : 'json';
    const blob = new Blob([textArea.value], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.currentDeck.name.replace(/[^a-z0-9]/gi, '_')}.${ext}`;
    a.click();
  };

  btnApply.onclick = () => {
    const text = textArea.value.trim();
    if (!text) return;
    try {
      // Try JSON first
      if (text.startsWith('{')) {
        const parsed = JSON.parse(text);
        if (parsed.slots && parsed.mainDeck) {
          state.currentDeck = parsed;
          document.getElementById('deckNameInput').value = parsed.name || 'Imported Deck';
          updateDeckState();
          modal.style.display = 'none';
          showToast('Deck imported successfully!');
          return;
        }
      }

      // Parse text format
      parseTournamentText(text);
      modal.style.display = 'none';
      showToast('Deck imported successfully from text list!');
    } catch (err) {
      alert('Error parsing deck data: ' + err.message);
    }
  };
}

function generateTournamentText() {
  const d = state.currentDeck;
  let lines = [];
  lines.push(`Deck Name: ${d.name}`);
  lines.push(`Author: ${d.author || 'Anonymous'}`);
  lines.push(`Game: Yu Yu Hakusho TCG (2003 Score)`);
  lines.push('');
  lines.push('--- STARTING CHARACTERS ---');
  for (let s = 1; s <= 4; s++) {
    const cId = d.slots[s];
    const c = state.cardMap.get(cId);
    const leaderTag = d.leaderSlot === s ? ' [LEADER]' : '';
    lines.push(`Slot ${s}: ${c ? `${c.name} (${c.cardNumber})` : 'None'}${leaderTag}`);
  }
  lines.push('');
  lines.push('--- MAIN DECK ---');
  for (const [id, count] of Object.entries(d.mainDeck)) {
    const c = state.cardMap.get(id);
    if (c) lines.push(`${count}x ${c.name} (${c.cardNumber})`);
  }
  return lines.join('\n');
}

function parseTournamentText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const newSlots = { 1: null, 2: null, 3: null, 4: null };
  const newMain = {};

  lines.forEach(line => {
    // Match starting slots: Slot 1: Name (Code)
    const slotMatch = line.match(/^Slot\s*([1-4]):\s*([^(]+)(?:\(([^)]+)\))?/i);
    if (slotMatch) {
      const slotNum = parseInt(slotMatch[1]);
      const name = slotMatch[2].replace('[LEADER]', '').trim();
      const card = state.cards.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (card) newSlots[slotNum] = card.id;
      return;
    }

    // Match main deck: 3x Name (Code)
    const cardMatch = line.match(/^(\d+)x\s*([^(]+)(?:\(([^)]+)\))?/i);
    if (cardMatch) {
      const count = parseInt(cardMatch[1]);
      const name = cardMatch[2].trim();
      const card = state.cards.find(c => c.name.toLowerCase() === name.toLowerCase());
      if (card) newMain[card.id] = count;
    }
  });

  state.currentDeck.slots = newSlots;
  state.currentDeck.mainDeck = newMain;
  updateDeckState();
}

// 10. LocalStorage and Starter Decks
function saveCurrentDeckToLocalStorage() {
  localStorage.setItem('yyh_current_deck', JSON.stringify(state.currentDeck));
}

function loadInitialDeck() {
  const saved = localStorage.getItem('yyh_current_deck');
  if (saved) {
    try {
      state.currentDeck = JSON.parse(saved);
      document.getElementById('deckNameInput').value = state.currentDeck.name || 'Untitled Deck';
      document.getElementById('deckAuthorInput').value = state.currentDeck.author || '';
      return;
    } catch (e) {}
  }

  // Pre-load Starter Deck
  const starters = getStarterDecks();
  if (starters.length > 0) {
    state.currentDeck = starters[0];
    document.getElementById('deckNameInput').value = state.currentDeck.name;
    document.getElementById('deckAuthorInput').value = state.currentDeck.author;
  }
}

function getStarterDecks() {
  return [
    {
      id: 'team_urameshi_starter',
      name: 'Team Urameshi Starter Deck',
      author: 'Score Entertainment',
      slots: {
        1: 'GF-R5',   // Yusuke, Resurrected
        2: 'GF-R35',  // Kuwabara, Street Fighter
        3: 'GF-ST41', // Kurama
        4: 'GF-R32'   // Hiei, the Swordsman
      },
      leaderSlot: 1,
      mainDeck: {
        'GF-C52': 3,  // Abnormal Endurance
        'GF-C53': 3,  // Alley Fight for Eikichi
        'GF-C154': 3, // Spirit Gun Double
        'GF-ST134': 3,// Rose Whip
        'GF-C60': 3,  // Flurry of Blows
        'GF-C63': 3,  // Heroic Team
        'GF-C75': 3,  // Sabotage
        'GF-C82': 3,  // Time Out
        'GF-C113': 3, // Backyard Dummy
        'GF-C117': 3, // Demon Compass
        'GF-R126': 3, // Spirit Cuffs
        'GF-ST130': 3,// Fishing Pole
        'GF-ST171': 3,// Spirit Fist
        'GF-G178': 1  // Burst of Power
      }
    },
    {
      id: 'team_toguro_crush',
      name: 'Team Toguro Heavy Beatdown',
      author: 'Score Entertainment',
      slots: {
        1: 'GF-ST8',  // Younger Toguro
        2: 'GF-ST38', // Elder Toguro
        3: 'GF-ST40', // Karasu
        4: 'GF-ST37'  // Bui
      },
      leaderSlot: 1,
      mainDeck: {
        'GF-ST101': 3, // No Mercy
        'GF-C52': 3,   // Abnormal Endurance
        'GF-C60': 3,   // Flurry of Blows
        'GF-C75': 3,   // Sabotage
        'GF-C82': 3,   // Time Out
        'GF-C113': 3,  // Backyard Dummy
        'GF-C117': 3,  // Demon Compass
        'GF-R126': 3,  // Spirit Cuffs
        'GF-ST172': 3, // Spirit Palm Blast
        'GF-ST173': 3, // Spirit Sword Monster Beast Donut
        'GF-S174': 3,  // Dragon of the Darkness Flame
        'GF-U175': 3,  // Death Plant
        'GF-U176': 3,  // Sword of the Darkness Flame
        'GF-G179': 1   // Halt!
      }
    },
    {
      id: 'team_masho_ninjas',
      name: 'Team Masho Shadow Ninjas',
      author: 'Score Entertainment',
      slots: {
        1: 'GF-C1',   // Risho
        2: 'GF-C13',  // Gama
        3: 'GF-C30',  // Touya
        4: 'GF-R33'   // Jin
      },
      leaderSlot: 1,
      mainDeck: {
        'GF-C52': 3,   // Abnormal Endurance
        'GF-C60': 3,   // Flurry of Blows
        'GF-C75': 3,   // Sabotage
        'GF-C82': 3,   // Time Out
        'GF-C113': 3,  // Backyard Dummy
        'GF-C117': 3,  // Demon Compass
        'GF-R126': 3,  // Spirit Cuffs
        'GF-ST130': 3, // Fishing Pole
        'GF-ST171': 3, // Spirit Fist
        'GF-ST172': 3, // Spirit Palm Blast
        'GF-ST173': 3, // Spirit Sword Monster Beast Donut
        'GF-S174': 3,  // Dragon of the Darkness Flame
        'GF-U175': 3,  // Death Plant
        'GF-G180': 1   // I'm Callin' You Out!
      }
    }
  ];
}

// 11. Toast Helpers
function showToast(msg) {
  const toast = document.getElementById('toastNotification');
  document.getElementById('toastMessage').textContent = msg;
  toast.style.display = 'flex';
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.style.display = 'none';
  }, 2400);
}
