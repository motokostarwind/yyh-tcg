/**
 * Yu Yu Hakusho TCG - Database & Deck Builder Frontend Logic
 * Supports 2003 Score YYH TCG rules, card search, deck construction, and analytics.
 */

// Global State
const state = {
  cards: [],
  combos: [],
  filteredCards: [],
  cardMap: new Map(),
  activeTab: 'catalog',
  currentView: 'grid', // 'grid' | 'table'
  deckViewMode: localStorage.getItem('yyh_deck_view_mode') || 'stacks', // 'stacks' | 'grid' | 'list'
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
  
  savedDecks: [],
  metaGauntlet: null,
  editingGauntletDeckKey: null
};
window.state = state;

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
  initMetaGauntlet();
  initSynergyWorker();
  renderDeckBuilder();
  renderGauntletPills();
  renderSavedDecks();
});

// 1. Data Fetching
async function loadCards() {
  try {
    const [resCards, resCombos] = await Promise.all([
      fetch('cards.json'),
      fetch('combos.json').catch(() => null)
    ]);

    if (!resCards.ok) throw new Error('Failed to load cards.json');
    state.cards = await resCards.json();
    
    if (resCombos && resCombos.ok) {
      state.combos = await resCombos.json();
    } else {
      state.combos = [];
    }

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
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (state.filteredCards && state.filteredCards.length > 0) {
        const topCard = state.filteredCards[0];
        const currCount = state.currentDeck.mainDeck[topCard.id] || 0;
        if (currCount >= (topCard.limitPerDeck || 3)) {
          showToast(`⚠️ "${topCard.name}" is already at max limit (${topCard.limitPerDeck} per deck).`);
        } else {
          addCardToMainDeck(topCard.id);
          const newCount = state.currentDeck.mainDeck[topCard.id] || 1;
          showToast(`➕ Added "${topCard.name}" (${newCount}/${topCard.limitPerDeck || 3}) to Deck!`);
        }
        searchInput.focus();
        searchInput.select();
      } else {
        showToast('No matching card to add.');
      }
    }
  });

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

    const hasCombos = c.comboLines && c.comboLines.length > 0;
    const comboBadgeHtml = hasCombos ? `<div class="card-combo-floating-badge" data-id="${c.id}" title="View ${c.comboLines.length} Combo Recipe(s)">💥 ${c.comboLines.length} Combo${c.comboLines.length > 1 ? 's' : ''}</div>` : '';
    const comboBtnText = hasCombos ? `💥 ${c.comboLines.length} Combo${c.comboLines.length > 1 ? 's' : ''}` : '⚡ Combos';
    const comboBtnClass = hasCombos ? 'btn btn-combo-inspect has-combos' : 'btn btn-combo-inspect no-combos';

    cardEl.innerHTML = `
      <div class="card-img-container" data-id="${c.id}">
        <img class="card-img" src="${c.images.primary}" alt="${c.name}" loading="lazy" onerror="this.src='https://placehold.co/240x336/131b2e/38bdf8?text=YYH+TCG'">
        <div class="card-rarity-tag">${c.rarity}</div>
        ${limitHtml}
        ${errataHtml}
        ${comboBadgeHtml}
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
            <button class="${comboBtnClass}" data-id="${c.id}" title="Inspect Combos & Synergies">${comboBtnText}</button>
          </div>
          ${slotButtons}
        </div>
      </div>
    `;

    // Click on artwork or title opens modal
    cardEl.querySelector('.card-img-container').addEventListener('click', (e) => {
      if (e.target.closest('.card-combo-floating-badge')) return;
      openCardModal(c);
    });
    cardEl.querySelector('.card-title').addEventListener('click', () => openCardModal(c));

    // Combo inspector button and badge
    cardEl.querySelectorAll('.btn-combo-inspect, .badge-combo, .card-combo-floating-badge').forEach(el => {
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

  // Mobile Modal Tab Switcher (Option A)
  const modalDialog = document.querySelector('.card-modal-dialog');
  const tabRulesBtn = document.getElementById('modalTabRulesBtn');
  const tabArtBtn = document.getElementById('modalTabArtBtn');
  const btnSwitchRules = document.getElementById('btnMobileSwitchRules');
  const btnSwitchArt = document.getElementById('btnMobileSwitchArt');

  window.setModalMobileTab = function(tab) {
    if (!modalDialog) return;
    modalDialog.setAttribute('data-mobile-view', tab);
    if (tabRulesBtn && tabArtBtn) {
      if (tab === 'rules') {
        tabRulesBtn.classList.add('active');
        tabArtBtn.classList.remove('active');
      } else {
        tabArtBtn.classList.add('active');
        tabRulesBtn.classList.remove('active');
      }
    }
    const modalContent = document.querySelector('.card-modal-content');
    if (modalContent) modalContent.scrollTop = 0;
  };

  if (tabRulesBtn) tabRulesBtn.addEventListener('click', () => window.setModalMobileTab('rules'));
  if (tabArtBtn) tabArtBtn.addEventListener('click', () => window.setModalMobileTab('art'));
  if (btnSwitchRules) btnSwitchRules.addEventListener('click', () => window.setModalMobileTab('rules'));
  if (btnSwitchArt) btnSwitchArt.addEventListener('click', () => window.setModalMobileTab('art'));
}

function findCardByName(name) {
  if (!name) return null;
  const n = name.trim().toLowerCase();
  // Exact match
  let card = state.cards.find(c => c.name.toLowerCase() === n);
  if (card) return card;
  // Normalized match ignoring punctuation
  const clean = str => str.toLowerCase().replace(/[^a-z0-9]/g, '');
  card = state.cards.find(c => clean(c.name) === clean(n));
  if (card) return card;
  // Substring fallback
  card = state.cards.find(c => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase()));
  return card || null;
}

function openCardModal(card) {
  state.activeModalCard = card;
  const modal = document.getElementById('cardModal');
  const modalContent = modal.querySelector('.card-modal-content');
  if (modalContent) modalContent.scrollTop = 0;

  // On mobile devices, default to rules & attacks view for immediate readability
  if (window.setModalMobileTab) {
    window.setModalMobileTab('rules');
  }

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
        const tier = combo.rating?.tier;
        const tierClass = tier ? tier.toLowerCase().replace('-', '') : '';

        const playbookHtml = combo.tacticalPlaybook && combo.tacticalPlaybook.setup ? `
          <div class="combo-playbook-box">
            <div class="playbook-step"><span class="step-label">1. Setup:</span> <span>${combo.tacticalPlaybook.setup}</span></div>
            <div class="playbook-step"><span class="step-label">2. Action:</span> <span>${combo.tacticalPlaybook.execution}</span></div>
            <div class="playbook-step"><span class="step-label">3. Payoff:</span> <span>${combo.tacticalPlaybook.payoff}</span></div>
          </div>
        ` : '';

        box.innerHTML = `
          <div class="combo-recipe-header">
            <div class="combo-title-group">
              ${tier ? `<span class="badge badge-tier ${tierClass}">${tier} • ${combo.rating.overallScore || 85}</span>` : ''}
              <span class="combo-recipe-title">${combo.comboName}</span>
            </div>
            <span class="combo-dmg-badge">${combo.damagePotential || 'Tactical Synergy'}</span>
          </div>
          <div class="partner-tags-row">
            <span class="partner-label">Key Partners:</span>
            ${(combo.partnerCards || []).map(p => `
              <span class="combo-partner-tag" data-partner="${p}" title="View ${p} in Pop-up">
                <span class="partner-tag-name">${p}</span>
                <span class="partner-tag-actions">
                  <button class="partner-tag-view-btn" data-partner="${p}" title="View ${p} in Pop-up">👁️ View</button>
                  <button class="partner-quick-add-btn" data-partner="${p}" title="Add ${p} to Deck">➕</button>
                </span>
              </span>
            `).join('')}
          </div>
          ${playbookHtml}
          <p class="combo-explanation">${combo.tacticalExplanation || combo.explanation || ''}</p>
        `;

        // Partner tag view action (opens partner card directly in modal pop-up, immune to active filters)
        box.querySelectorAll('.combo-partner-tag, .partner-tag-view-btn').forEach(tag => {
          tag.onclick = (e) => {
            if (e.target.classList.contains('partner-quick-add-btn')) return;
            e.stopPropagation();
            const partnerName = tag.dataset.partner;
            const partnerCard = findCardByName(partnerName);
            if (partnerCard) {
              openCardModal(partnerCard);
            } else {
              showToast(`Card "${partnerName}" not found in catalog.`);
            }
          };
        });

        // Partner tag quick-add action
        box.querySelectorAll('.partner-quick-add-btn').forEach(btn => {
          btn.onclick = (e) => {
            e.stopPropagation();
            const pName = btn.dataset.partner;
            const pCard = findCardByName(pName);
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
              <strong class="partner-name-link" data-partner="${pName}" title="View ${pName} in Pop-up">${pName}</strong>
              <span class="partner-chip-actions">
                <button class="partner-chip-btn btn-view-partner" data-partner="${pName}" title="View ${pName} in Pop-up">👁️ View</button>
                <button class="partner-chip-btn btn-add-partner" data-partner="${pName}" title="Add ${pName} to Deck">➕ Add</button>
              </span>
            </span>
          `;
        }).join('');
      }

      const tier = combo.rating?.tier;
      const tierClass = tier ? tier.toLowerCase().replace('-', '') : '';

      const playbookHtml = combo.tacticalPlaybook && combo.tacticalPlaybook.setup ? `
        <div class="combo-playbook-box">
          <div class="playbook-step"><span class="step-label">1. Setup:</span> <span>${combo.tacticalPlaybook.setup}</span></div>
          <div class="playbook-step"><span class="step-label">2. Action:</span> <span>${combo.tacticalPlaybook.execution}</span></div>
          <div class="playbook-step"><span class="step-label">3. Payoff:</span> <span>${combo.tacticalPlaybook.payoff}</span></div>
        </div>
      ` : '';

      box.innerHTML = `
        <div class="inspector-combo-head">
          <div class="combo-title-group">
            ${tier ? `<span class="badge badge-tier ${tierClass}">${tier} • ${combo.rating.overallScore || 85}</span>` : ''}
            <span class="inspector-combo-name">${combo.comboName}</span>
          </div>
          <span class="combo-dmg-badge">${combo.damagePotential || 'Synergy'}</span>
        </div>
        ${partnerChipsHtml ? `<div class="inspector-partner-chips"><span class="partner-label">Partners:</span> ${partnerChipsHtml}</div>` : ''}
        ${playbookHtml}
        <p class="inspector-combo-desc">${combo.tacticalExplanation || combo.explanation || ''}</p>
      `;

      box.querySelectorAll('.btn-add-partner').forEach(btn => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const pName = btn.dataset.partner;
          const pCard = findCardByName(pName);
          if (pCard) {
            addCardToMainDeck(pCard.id);
          } else {
            showToast(`Card "${pName}" not found in database.`);
          }
        };
      });

      // View button & partner name click: opens card modal directly in pop-up (immune to category filters)
      box.querySelectorAll('.btn-view-partner, .btn-find-partner, .partner-name-link').forEach(el => {
        el.onclick = (e) => {
          e.stopPropagation();
          const pName = el.dataset.partner;
          const pCard = findCardByName(pName);
          if (pCard) {
            openCardModal(pCard);
          } else {
            showToast(`Card "${pName}" not found in database.`);
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
                <strong class="partner-name-link" data-partner="${advice.partnerCard.name}" title="View ${advice.partnerCard.name} in Pop-up">${advice.partnerCard.name}</strong>
                <span class="partner-chip-actions">
                  <button class="partner-chip-btn btn-view-partner" data-partner="${advice.partnerCard.name}" title="View ${advice.partnerCard.name} in Pop-up">👁️ View</button>
                  <button class="partner-chip-btn btn-add-partner" data-partner="${advice.partnerCard.name}" title="Add to Deck">➕ Add</button>
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

        box.querySelectorAll('.btn-view-partner, .btn-find-partner, .partner-name-link').forEach(el => {
          el.onclick = (e) => {
            e.stopPropagation();
            if (advice.partnerCard) {
              openCardModal(advice.partnerCard);
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
    // A) Cards with SE cost >= 3 benefit from real Spirit Energy ramp cards (se_battery)
    if (card.seCost >= 3 && (partnerCard.strategicRoles?.includes('se_battery') || partnerCard.name.toLowerCase() === 'blade storm')) {
      synergies.push({
        partnerCard,
        synergyType: '⚡ Energy Enabler',
        priority: 60,
        reason: `${partnerCard.name} accelerates your Spirit Energy pool, ensuring you can afford ${card.name}'s ${card.seCost} SE cost.`
      });
      seenPartnerIds.add(partnerCard.id);
      continue;
    }

    // B) Multi-card attack discard costs benefit from genuine card draw
    if ((card.attacks || []).some(a => a.cost >= 2) &&
        (partnerCard.strategicRoles?.includes('card_draw') || partnerCard.name.includes('Kitty Love') || partnerCard.name.includes('Heroic Team'))) {
      synergies.push({
        partnerCard,
        synergyType: '🃏 Draw Fuel',
        priority: 55,
        reason: `${partnerCard.name} provides card draw to pay ${card.name}'s multi-card attack discard cost.`
      });
      seenPartnerIds.add(partnerCard.id);
      continue;
    }

    // C) Physical beatdown / attack pump synergies
    if ((card.attacks || []).some(a => a.damage >= 5000) && partnerCard.strategicRoles?.includes('atk_pump')) {
      synergies.push({
        partnerCard,
        synergyType: '💥 Attack Booster',
        priority: 52,
        reason: `${partnerCard.name} boosts attack values, pushing ${card.name}'s strikes over key opponent defense breakpoints.`
      });
      seenPartnerIds.add(partnerCard.id);
      continue;
    }

    // D) Technique synergies
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

  if (card.seCost >= 3) {
    const seBattery = state.cards.find(c => (c.strategicRoles || []).includes('se_battery') && (c.team === card.team || c.team === 'None')) ||
                      state.cards.find(c => (c.strategicRoles || []).includes('se_battery'));
    if (seBattery) {
      suggestions.push({
        title: 'Spirit Energy Acceleration',
        tag: 'Resource Fuel',
        partnerCard: seBattery,
        why: `With an SE cost of ${card.seCost}, ${card.name} benefits from ${seBattery.name}'s Spirit Energy generation to ensure consistent activation.`
      });
    }
  }

  if (maxAtkCost >= 2) {
    const drawCard = state.cards.find(c => (c.strategicRoles || []).includes('card_draw')) ||
                     state.cards.find(c => c.name.toLowerCase() === 'kitty love');
    if (drawCard) {
      suggestions.push({
        title: 'Hand Size Sustain & Draw',
        tag: 'Discard Fuel',
        partnerCard: drawCard,
        why: `${drawCard.name} maintains healthy hand size to pay ${card.name}'s ${maxAtkCost}-card discard costs without exhausting your options.`
      });
    }
  }

  if (maxAtkDmg >= 6000) {
    const pumpCard = state.cards.find(c => c.name.toLowerCase() === 'backyard dummy' || (c.strategicRoles || []).includes('atk_pump'));
    if (pumpCard) {
      suggestions.push({
        title: 'Breakpoint KO Push',
        tag: 'Damage Scaling',
        partnerCard: pumpCard,
        why: `${pumpCard.name} boosts attack damage (+2000 ATK), turning ${card.name}'s ${maxAtkDmg} power strike into guaranteed 2-wound KOs against high-DEF fighters.`
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

  // Rule: Cards costing more than 10 Spirit Energy require Blade Storm in the deck
  if (card.seCost !== null && card.seCost > 10) {
    const hasBladeStorm = Object.keys(state.currentDeck.mainDeck).some(id => {
      const c = state.cardMap.get(id);
      return c && c.name.toLowerCase() === 'blade storm';
    });
    if (!hasBladeStorm) {
      showToast(`⚠️ Cannot add "${card.name}" (SE ${card.seCost}): Cards costing more than 10 Spirit Energy require "Blade Storm" in your deck!`);
      return;
    }
  }

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
  const card = state.cardMap.get(cardId);
  if (state.currentDeck.mainDeck[cardId]) {
    // If removing Blade Storm, verify if deck has >10 SE cards that would be invalidated
    if (card && card.name.toLowerCase() === 'blade storm' && state.currentDeck.mainDeck[cardId] === 1) {
      const hasHighSECards = Object.keys(state.currentDeck.mainDeck).some(id => {
        const c = state.cardMap.get(id);
        return c && c.seCost !== null && c.seCost > 10;
      });
      if (hasHighSECards) {
        showToast('⚠️ Cannot remove Blade Storm while cards costing >10 Spirit Energy remain in your deck! Remove those cards first.');
        return;
      }
    }
    state.currentDeck.mainDeck[cardId]--;
    if (state.currentDeck.mainDeck[cardId] <= 0) {
      delete state.currentDeck.mainDeck[cardId];
    }
    updateDeckState();
  }
}

function deleteCardFromMainDeck(cardId) {
  const card = state.cardMap.get(cardId);
  if (card && card.name.toLowerCase() === 'blade storm') {
    const hasHighSECards = Object.keys(state.currentDeck.mainDeck).some(id => {
      const c = state.cardMap.get(id);
      return c && c.seCost !== null && c.seCost > 10;
    });
    if (hasHighSECards) {
      showToast('⚠️ Cannot remove Blade Storm while cards costing >10 Spirit Energy remain in your deck! Remove those cards first.');
      return;
    }
  }
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
      dropzone.classList.add('has-card');
      dropzone.innerHTML = `
        <div class="slot-assigned-view">
          <div class="slot-char-img-container">
            <img class="slot-char-img" src="${card.images.primary}" alt="${card.name}" onerror="this.src='https://placehold.co/240x336/131b2e/38bdf8?text=YYH+TCG'">
          </div>
          <div class="slot-char-info">
            <div class="slot-char-name" title="${card.name}">${card.name}</div>
            <div class="slot-char-meta">
              <span>${card.team ? card.team.replace('Team ', '') : 'Neutral'}</span>
              <span class="slot-char-def">DEF ${card.defense || 0}</span>
            </div>
          </div>
          <button class="slot-remove-btn" data-slot="${s}" title="Remove ${card.name} from Slot ${s}">✕ Remove</button>
        </div>
      `;
      dropzone.querySelector('.slot-remove-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        removeSlotCharacter(s);
      });
      dropzone.onclick = () => openCardModal(card);
    } else {
      dropzone.classList.remove('has-card');
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
  const listCol = document.querySelector('.deck-cards-list-col');
  const deckMode = state.deckViewMode || 'stacks';
  if (listCol) {
    listCol.className = 'deck-cards-list-col deck-view-' + deckMode;
  }

  // Ensure switcher button state is in sync
  document.querySelectorAll('.view-toggle-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.deckView === deckMode);
  });

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

  const hasHighSECards = Object.keys(state.currentDeck.mainDeck).some(id => {
    const card = state.cardMap.get(id);
    return card && card.seCost !== null && card.seCost > 10;
  });
  const hasBladeStorm = Object.keys(state.currentDeck.mainDeck).some(id => {
    const card = state.cardMap.get(id);
    return card && card.name.toLowerCase() === 'blade storm';
  });
  const bladeStormRequirementMet = !hasHighSECards || hasBladeStorm;

  const isDeckLegal = has4Chars && hasUniqueChars && hasMinMain && hasMinTotal && copyLimitsRespected && bladeStormRequirementMet;

  // Validation Checklist UI
  setCheckItem('checkStartingChars', has4Chars, '4 Starting Characters placed');
  setCheckItem('checkUniqueChars', hasUniqueChars, 'Starting characters are distinct');
  setCheckItem('checkMainDeckSize', hasMinMain, 'Minimum 40 Main Deck cards');
  setCheckItem('checkTotalDeckSize', hasMinTotal, 'Minimum 44 Total cards');
  setCheckItem('checkCopyLimits', copyLimitsRespected, 'Copy limits respected (max 3, Limit 1 respected)');
  setCheckItem('checkBladeStorm', bladeStormRequirementMet, bladeStormRequirementMet ? '>10 SE cards require Blade Storm' : '>10 SE cards require Blade Storm (Missing!)');

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

  // Gauntlet Editing Banner & Save Button Visibility
  const gauntletBanner = document.getElementById('gauntletEditBanner');
  const btnSaveToGauntlet = document.getElementById('btnSaveToGauntlet');
  if (state.editingGauntletKey) {
    if (gauntletBanner) {
      gauntletBanner.style.display = 'flex';
      const nameEl = document.getElementById('gauntletBannerDeckName');
      if (nameEl) nameEl.textContent = state.currentDeck.name || 'Gauntlet Opponent';
    }
    if (btnSaveToGauntlet) {
      btnSaveToGauntlet.style.display = 'inline-flex';
    }
  } else {
    if (gauntletBanner) gauntletBanner.style.display = 'none';
    if (btnSaveToGauntlet) btnSaveToGauntlet.style.display = 'none';
  }

  // 5. Analytics (SE Curve and Composition)
  renderAnalytics(mainDeckCount);

  // 6. Competitive Synergy & Machine Evaluation Engine
  triggerSynergyCalculation();
}

function renderDeckCategory(cardType, containerId, countId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  const mode = state.deckViewMode || 'stacks';
  container.className = 'type-items view-' + mode;

  const matchingEntries = Object.entries(state.currentDeck.mainDeck).filter(([id]) => {
    const card = state.cardMap.get(id);
    return card && card.cardType === cardType;
  });

  // Alphabetical sort by card name within each category
  matchingEntries.sort(([idA], [idB]) => {
    const cardA = state.cardMap.get(idA);
    const cardB = state.cardMap.get(idB);
    const nameA = (cardA?.name || '').toLowerCase();
    const nameB = (cardB?.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  const totalCatCount = matchingEntries.reduce((sum, [, count]) => sum + count, 0);
  document.getElementById(countId).textContent = `(${totalCatCount})`;

  if (matchingEntries.length === 0) {
    container.innerHTML = `<div class="empty-type-msg">No ${cardType.toLowerCase()}s added yet.</div>`;
    return;
  }

  if (mode === 'stacks') {
    // 1. Visual Stacks Mode (Cascading card piles with header banner and artwork)
    matchingEntries.forEach(([id, count], idx) => {
      const card = state.cardMap.get(id);
      const statText = card.defense ? `DEF ${card.defense}` : (card.seCost !== null ? `SE ${card.seCost}` : '');
      const stackCard = document.createElement('div');
      stackCard.className = 'deck-stack-card';
      stackCard.dataset.id = id;
      stackCard.style.zIndex = idx + 1;

      stackCard.innerHTML = `
        <div class="stack-card-banner">
          <span class="stack-qty-badge">${count}x</span>
          <span class="stack-card-name" title="${card.name}">${card.name}</span>
          <span class="stack-card-stat">${statText}</span>
        </div>
        <div class="stack-card-img-wrapper">
          <img class="stack-card-img" src="${card.images.primary}" alt="${card.name}" loading="lazy" onerror="this.src='https://placehold.co/240x336/131b2e/38bdf8?text=YYH+TCG'">
        </div>
        <div class="stack-card-controls">
          <button class="qty-btn btn-minus" data-id="${id}" title="Decrease count">-</button>
          <span class="qty-display">${count}</span>
          <button class="qty-btn btn-plus" data-id="${id}" title="Increase count">+</button>
          <button class="qty-btn btn-view-stack" data-id="${id}" title="View card in pop-up">👁️</button>
          <button class="deck-row-remove" data-id="${id}" title="Remove all copies">✕</button>
        </div>
      `;

      stackCard.querySelector('.stack-card-banner').onclick = () => openCardModal(card);
      stackCard.querySelector('.stack-card-img-wrapper').onclick = () => openCardModal(card);
      stackCard.querySelector('.btn-view-stack').onclick = (e) => { e.stopPropagation(); openCardModal(card); };
      stackCard.querySelector('.btn-minus').onclick = (e) => { e.stopPropagation(); removeCardFromMainDeck(id); };
      stackCard.querySelector('.btn-plus').onclick = (e) => { e.stopPropagation(); addCardToMainDeck(id); };
      stackCard.querySelector('.deck-row-remove').onclick = (e) => { e.stopPropagation(); deleteCardFromMainDeck(id); };

      container.appendChild(stackCard);
    });
  } else if (mode === 'grid') {
    // 2. Visual Grid Mode (Card tiles with controls at bottom)
    matchingEntries.forEach(([id, count]) => {
      const card = state.cardMap.get(id);
      const statText = card.defense ? `DEF ${card.defense}` : (card.seCost !== null ? `SE ${card.seCost}` : '');
      const tile = document.createElement('div');
      tile.className = 'deck-grid-tile';
      tile.dataset.id = id;

      tile.innerHTML = `
        <div class="tile-img-container">
          <img class="tile-card-img" src="${card.images.primary}" alt="${card.name}" loading="lazy" onerror="this.src='https://placehold.co/240x336/131b2e/38bdf8?text=YYH+TCG'">
          <div class="tile-qty-tag">${count}x</div>
          <div class="tile-header-bar">
            <span class="tile-card-name" title="${card.name}">${card.name}</span>
          </div>
        </div>
        <div class="tile-controls-bar">
          <button class="qty-btn btn-minus" data-id="${id}" title="Decrease count">-</button>
          <span class="qty-display">${count}</span>
          <button class="qty-btn btn-plus" data-id="${id}" title="Increase count">+</button>
          <button class="deck-row-remove" data-id="${id}" title="Remove card">✕</button>
        </div>
      `;

      tile.querySelector('.tile-img-container').onclick = () => openCardModal(card);
      tile.querySelector('.btn-minus').onclick = (e) => { e.stopPropagation(); removeCardFromMainDeck(id); };
      tile.querySelector('.btn-plus').onclick = (e) => { e.stopPropagation(); addCardToMainDeck(id); };
      tile.querySelector('.deck-row-remove').onclick = (e) => { e.stopPropagation(); deleteCardFromMainDeck(id); };

      container.appendChild(tile);
    });
  } else {
    // 3. Compact List Mode (Clean, space-efficient rows)
    matchingEntries.forEach(([id, count]) => {
      const card = state.cardMap.get(id);
      const statText = card.defense ? `DEF ${card.defense}` : (card.seCost !== null ? `SE ${card.seCost}` : '');
      const row = document.createElement('div');
      row.className = 'deck-card-row compact-row';
      row.dataset.id = id;

      row.innerHTML = `
        <div class="deck-card-left">
          <span class="compact-qty">${count}</span>
          <span class="deck-row-name" title="${card.name}">${card.name}</span>
          <span class="deck-row-stat">${statText}</span>
        </div>
        <div class="deck-card-controls">
          <button class="qty-btn btn-minus" data-id="${id}">-</button>
          <span class="qty-display">${count}</span>
          <button class="qty-btn btn-plus" data-id="${id}">+</button>
          <button class="deck-row-remove" data-id="${id}" title="Remove card">✕</button>
        </div>
      `;

      row.querySelector('.deck-card-left').onclick = () => openCardModal(card);
      row.querySelector('.btn-minus').onclick = (e) => { e.stopPropagation(); removeCardFromMainDeck(id); };
      row.querySelector('.btn-plus').onclick = (e) => { e.stopPropagation(); addCardToMainDeck(id); };
      row.querySelector('.deck-row-remove').onclick = (e) => { e.stopPropagation(); deleteCardFromMainDeck(id); };

      container.appendChild(row);
    });
  }
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
  const activeGauntlet = (typeof getMetaGauntletForSimulation === 'function') ? getMetaGauntletForSimulation() : null;

  if (synergyWorker) {
    synergyWorker.postMessage({
      deckState: deckPayload,
      allCards: state.cards,
      combosCatalog: state.combos || [],
      customGauntlet: activeGauntlet
    });
  } else if (typeof processSynergyEngine === 'function') {
    try {
      const results = processSynergyEngine(deckPayload, state.cards, state.combos || [], activeGauntlet);
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
  if (results.matchupSimulation) {
    renderMatchupSimulation(results.matchupSimulation);
  }
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

function renderMatchupSimulation(sim) {
  if (!sim) return;
  const winRateEl = document.getElementById('simGauntletWinRate');
  const synergyScoreEl = document.getElementById('simDeckSynergyScore');
  const activeCountEl = document.getElementById('simActiveCombosCount');
  const gridEl = document.getElementById('simMatchupsGrid');
  const pairingsEl = document.getElementById('simPairingsList');
  const combosEl = document.getElementById('simCombosList');

  if (winRateEl) {
    winRateEl.textContent = `${sim.overallWinRatePct ?? 0}%`;
    winRateEl.className = 'sim-pill-val';
    if (sim.overallWinRatePct >= 60) winRateEl.classList.add('val-favorable');
    else if (sim.overallWinRatePct < 45) winRateEl.classList.add('val-unfavorable');
    else winRateEl.classList.add('val-balanced');
  }

  if (synergyScoreEl) {
    synergyScoreEl.textContent = `${sim.synergyScore ?? 50} / 100`;
    synergyScoreEl.className = 'sim-pill-val';
    if (sim.synergyScore >= 80) synergyScoreEl.classList.add('val-favorable');
    else if (sim.synergyScore < 50) synergyScoreEl.classList.add('val-unfavorable');
    else synergyScoreEl.classList.add('val-balanced');
  }

  if (activeCountEl) {
    const count = (sim.rankedCombos || []).length;
    activeCountEl.textContent = `${count} Active`;
  }

  // Render 4 Gauntlet Decks
  if (gridEl && sim.matchups) {
    gridEl.innerHTML = '';
    sim.matchups.forEach(m => {
      const card = document.createElement('div');
      card.className = 'sim-matchup-card';
      const isFav = m.winRatePct >= 60;
      const isUnfav = m.winRatePct < 45;
      const statusClass = isFav ? 'fav' : (isUnfav ? 'unfav' : 'even');
      const barColor = isFav ? 'var(--spirit-cyan)' : (isUnfav ? '#ef4444' : '#f59e0b');

      card.innerHTML = `
        <div class="sim-matchup-head">
          <span class="sim-matchup-name">${m.icon || '⚔️'} ${m.opponentName}</span>
          <span class="sim-matchup-winrate ${statusClass}">${m.winRatePct}% Win</span>
        </div>
        <div class="sim-matchup-bar-track">
          <div class="sim-matchup-bar-fill" style="width: ${m.winRatePct}%; background: ${barColor};"></div>
        </div>
        <div class="sim-matchup-meta">
          <span>${m.playerWins}W / ${m.opponentWins}L (${m.runs} runs)</span>
          <span>Avg ${m.avgTurns} turns</span>
        </div>
      `;
      gridEl.appendChild(card);
    });
  }

  // Render Top Pairings (Strongest Together)
  if (pairingsEl) {
    pairingsEl.innerHTML = '';
    if (!sim.rankedPairings || sim.rankedPairings.length === 0) {
      pairingsEl.innerHTML = '<div class="sim-empty-msg">Add more cards to your deck to discover synergistic pairings!</div>';
    } else {
      sim.rankedPairings.forEach(p => {
        const item = document.createElement('div');
        item.className = 'sim-pairing-item';
        const liftPositive = p.liftDelta >= 0;

        item.innerHTML = `
          <div class="sim-pairing-cards">
            <span class="sim-pairing-name" data-card="${p.cardA}">${p.cardA}</span>
            <span class="sim-pairing-plus">➕</span>
            <span class="sim-pairing-name" data-card="${p.cardB}">${p.cardB}</span>
          </div>
          <div class="sim-pairing-stats">
            <span class="sim-pairing-winrate">${p.winRate}% Win Rate</span>
            <span class="sim-pairing-lift ${liftPositive ? 'lift-pos' : 'lift-neg'}">
              ${liftPositive ? '+' : ''}${p.liftDelta}% Lift
            </span>
            <span class="sim-pairing-runs">(${p.gamesTogether} matches)</span>
          </div>
        `;

        item.querySelectorAll('.sim-pairing-name').forEach(el => {
          el.onclick = (e) => {
            e.stopPropagation();
            const cName = el.dataset.card;
            const cCard = findCardByName(cName);
            if (cCard) openCardModal(cCard);
          };
        });

        pairingsEl.appendChild(item);
      });
    }
  }

  // Render Key Combos Executed
  if (combosEl) {
    combosEl.innerHTML = '';
    if (!sim.rankedCombos || sim.rankedCombos.length === 0) {
      combosEl.innerHTML = '<div class="sim-empty-msg">No active combo lines assembled yet. Check recommendations to add combo partners!</div>';
    } else {
      sim.rankedCombos.forEach(c => {
        const item = document.createElement('div');
        item.className = 'sim-combo-item';
        const tier = c.tier || 'A-Tier';
        const tierClass = tier.toLowerCase().replace('-', '');

        item.innerHTML = `
          <div class="sim-combo-top">
            <div class="sim-combo-title-group">
              <span class="badge badge-tier ${tierClass}">${tier} • ${c.rating}</span>
              <strong class="sim-combo-name">${c.name}</strong>
              <span class="sim-combo-archetype">${c.archetype || ''}</span>
            </div>
            <div class="sim-combo-rates">
              <span class="sim-exec-rate" title="Execution frequency">Executed: ${c.execRatePct}%</span>
              <span class="sim-win-rate" title="Win rate when combo goes off">Win Rate: ${c.winRateWhenExecuted}%</span>
            </div>
          </div>
          <div class="sim-combo-partners-row">
            <span class="sim-partner-lead">Key Cards:</span>
            <span class="sim-partner-pill" data-card="${c.primaryCard}">👁️ ${c.primaryCard}</span>
            ${(c.partnerCards || []).map(p => `<span class="sim-partner-pill" data-card="${p}">👁️ ${p}</span>`).join('')}
          </div>
        `;

        item.querySelectorAll('.sim-partner-pill').forEach(pill => {
          pill.onclick = (e) => {
            e.stopPropagation();
            const cName = pill.dataset.card;
            const cCard = findCardByName(cName);
            if (cCard) openCardModal(cCard);
          };
        });

        combosEl.appendChild(item);
      });
    }
  }
}

// 9. Deck Saving & Library Integration
function setupDeckActions() {
  // Main Deck View Mode Switcher
  document.querySelectorAll('.view-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.deckView;
      if (!mode) return;
      state.deckViewMode = mode;
      localStorage.setItem('yyh_deck_view_mode', mode);
      document.querySelectorAll('.view-toggle-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.deckView === mode);
      });
      renderDeckBuilder();
    });
  });

  const btnRunSim = document.getElementById('btnRunSimulation');
  if (btnRunSim) {
    btnRunSim.addEventListener('click', () => {
      btnRunSim.disabled = true;
      btnRunSim.textContent = '⏳ Simulating 1,000 Matches...';
      runSynergyCalculation();
      setTimeout(() => {
        btnRunSim.disabled = false;
        btnRunSim.textContent = '⚔️ Run 1,000 Matches';
        showToast('Monte Carlo matchup simulations complete! Check results below.');
      }, 500);
    });
  }

  document.getElementById('deckNameInput').addEventListener('input', (e) => {
    state.currentDeck.name = e.target.value;
    if (state.editingGauntletKey) {
      const bannerName = document.getElementById('gauntletBannerDeckName');
      if (bannerName) bannerName.textContent = e.target.value || 'Gauntlet Opponent';
    } else {
      saveCurrentDeckToLocalStorage();
    }
  });

  document.getElementById('deckAuthorInput').addEventListener('input', (e) => {
    state.currentDeck.author = e.target.value;
    if (!state.editingGauntletKey) {
      saveCurrentDeckToLocalStorage();
    }
  });

  document.getElementById('btnSaveDeck').addEventListener('click', saveDeck);
  document.getElementById('btnClearDeck').addEventListener('click', () => {
    if (confirm('Are you sure you want to clear the entire deck?')) {
      state.editingGauntletKey = null;
      state.currentDeck.slots = { 1: null, 2: null, 3: null, 4: null };
      state.currentDeck.mainDeck = {};
      updateDeckState();
      showToast('Deck cleared.');
    }
  });

  document.getElementById('btnNewDeck').addEventListener('click', () => {
    state.editingGauntletKey = null;
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

  // Meta Gauntlet Manager: Link to Saved Decks screen & Gauntlet section
  const btnManageGauntlet = document.getElementById('btnManageGauntlet');
  if (btnManageGauntlet) {
    btnManageGauntlet.onclick = () => {
      const tabBtn = document.querySelector('[data-tab="saved-decks"]');
      if (tabBtn) tabBtn.click();
      setTimeout(() => {
        const sec = document.getElementById('gauntletDecksSection');
        if (sec) {
          sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
          sec.classList.add('section-highlight');
          setTimeout(() => sec.classList.remove('section-highlight'), 1200);
        }
      }, 80);
      showToast('Navigated to Meta Gauntlet Opponents in Deck Library.');
    };
  }

  // Gauntlet Section Actions in Library
  const btnResetGauntlet = document.getElementById('btnResetGauntletDefaults');
  if (btnResetGauntlet) btnResetGauntlet.onclick = resetGauntletToDefaults;

  const btnAddNewGauntlet = document.getElementById('btnAddNewGauntletDeck');
  if (btnAddNewGauntlet) {
    btnAddNewGauntlet.onclick = () => {
      const newKey = 'gauntlet_' + Date.now();
      state.editingGauntletKey = newKey;
      state.currentDeck = {
        id: newKey,
        name: 'New Gauntlet Opponent',
        author: 'Custom',
        slots: { 1: null, 2: null, 3: null, 4: null },
        leaderSlot: 1,
        mainDeck: {}
      };
      document.getElementById('deckNameInput').value = state.currentDeck.name;
      document.getElementById('deckAuthorInput').value = state.currentDeck.author;
      updateDeckState();
      state.activeTab = 'deckbuilder';
      document.querySelector('[data-tab="deckbuilder"]').click();
      showToast('Creating new Gauntlet opponent! Add cards and click "Save to Gauntlet" when done.');
    };
  }

  // Save to Gauntlet Buttons (Top Bar + Banner)
  const btnSaveToGauntlet = document.getElementById('btnSaveToGauntlet');
  if (btnSaveToGauntlet) btnSaveToGauntlet.onclick = saveCurrentDeckToGauntlet;

  const btnSaveGauntletFromBanner = document.getElementById('btnSaveGauntletFromBanner');
  if (btnSaveGauntletFromBanner) btnSaveGauntletFromBanner.onclick = saveCurrentDeckToGauntlet;

  // Exit Gauntlet Edit Mode
  const btnExitGauntletEdit = document.getElementById('btnExitGauntletEdit');
  if (btnExitGauntletEdit) {
    btnExitGauntletEdit.onclick = () => {
      state.editingGauntletKey = null;
      updateDeckState();
      showToast('Exited Gauntlet editing mode.');
    };
  }
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

function getDeckTeamBonus(deck) {
  if (!deck || !deck.slots) return { hasBonus: false, teamName: null, label: 'No Team Bonus', icon: '⚪' };

  const charIds = [deck.slots[1], deck.slots[2], deck.slots[3], deck.slots[4]].filter(Boolean);
  if (charIds.length < 4) {
    return { hasBonus: false, teamName: null, label: 'No Team Bonus (Fewer than 4 fighters)', icon: '⚪' };
  }

  const teams = charIds.map(id => {
    const card = state.cardMap.get(id);
    return (card && card.team && card.team !== 'None') ? card.team : null;
  });

  if (teams.every(t => t && t === teams[0])) {
    const team = teams[0];
    const iconMap = {
      'Team Toguro': '💪',
      'Team Urameshi': '⚡',
      'Team Genkai': '🥋',
      'Team Masho': '🥷',
      'Team Saint Beasts': '🐉',
      'Team Uraotogi': '🎭',
      'Team Rokuyukai': '🔥'
    };
    return {
      hasBonus: true,
      teamName: team,
      label: `${team} Bonus Active`,
      icon: iconMap[team] || '✨'
    };
  }

  return {
    hasBonus: false,
    teamName: null,
    label: 'No Team Bonus',
    icon: '⚪'
  };
}

function renderTeamBonusTagHtml(deck) {
  const bonus = getDeckTeamBonus(deck);
  if (bonus.hasBonus) {
    return `<span class="deck-team-tag tag-bonus-active" title="Active Team Bonus: ${bonus.teamName}"><span class="team-tag-dot"></span>${bonus.icon} ${bonus.teamName} Bonus Active</span>`;
  }
  return `<span class="deck-team-tag tag-bonus-none" title="All 4 starting fighters must share the same team to unlock a team bonus"><span class="team-tag-dot"></span>No Team Bonus</span>`;
}

function renderSavedDecks() {
  renderGauntletDecksGrid();
  renderMySavedDecksGrid();
}

function renderGauntletDecksGrid() {
  const container = document.getElementById('gauntletDecksGrid');
  if (!container) return;
  container.innerHTML = '';

  if (!state.metaGauntlet) initMetaGauntlet();

  const entries = Object.entries(state.metaGauntlet || {});
  if (entries.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim); padding:20px; text-align:center; grid-column:1/-1;">No gauntlet opponents configured. Click "Reset Defaults" to restore tournament benchmark decks.</div>';
    return;
  }

  entries.forEach(([key, deck]) => {
    const card = document.createElement('div');
    const isEnabled = deck.enabled !== false;
    card.className = `deck-library-card gauntlet-deck-card ${isEnabled ? 'is-active' : 'is-inactive'}`;

    // Starting character thumbnails
    let thumbsHtml = '';
    for (let s = 1; s <= 4; s++) {
      const cId = deck.slots ? deck.slots[s] : null;
      const charCard = cId ? state.cardMap.get(cId) : null;
      if (charCard) {
        const imgSrc = charCard.images?.primary || charCard.imageUrl || '';
        thumbsHtml += `<img class="library-thumb" src="${imgSrc}" title="${charCard.name}" alt="${charCard.name}">`;
      } else {
        thumbsHtml += `<div class="library-thumb" style="background:#0f172a; border:1px dashed #475569; display:flex; align-items:center; justify-content:center; font-size:10px; color:#64748b;" title="Slot ${s} Empty">#${s}</div>`;
      }
    }

    const mainCount = Object.values(deck.mainDeck || {}).reduce((a, b) => a + b, 0);

    card.innerHTML = `
      <div class="library-card-header">
        <div>
          <div class="library-deck-title-row">
            <span class="gauntlet-card-icon">${deck.icon || '⚔️'}</span>
            <div class="library-deck-name">${deck.name}</div>
          </div>
          <div class="library-deck-author">Gauntlet Opponent (${deck.author || 'Score Benchmark'})</div>
        </div>
        ${renderTeamBonusTagHtml(deck)}
      </div>
      <div class="library-char-previews">
        ${thumbsHtml || '<span class="text-dim">No starting characters</span>'}
      </div>
      <div class="library-deck-stats">
        <span>Main Deck: <strong>${mainCount}</strong> cards</span>
      </div>
      <div class="gauntlet-card-status-bar">
        <label class="gauntlet-switch-label" title="Toggle whether this opponent is simulated in the Meta Gauntlet">
          <span class="gauntlet-switch">
            <input type="checkbox" class="gauntlet-card-toggle" ${isEnabled ? 'checked' : ''}>
            <span class="gauntlet-slider round"></span>
          </span>
          <span class="gauntlet-status-label ${isEnabled ? 'status-active' : 'status-inactive'}">
            ${isEnabled ? 'Active in Simulation' : 'Inactive in Simulation'}
          </span>
        </label>
      </div>
      <div class="library-actions">
        <button class="btn btn-primary btn-sm btn-edit-gauntlet-deck" title="Edit this opponent deck in the full Deck Builder">✏️ Edit Deck</button>
        <button class="btn btn-secondary btn-sm btn-del-gauntlet-deck" title="Remove this opponent from the Meta Gauntlet" style="color:#ef4444;">🗑️ Delete</button>
      </div>
    `;

    // Toggle on/off for simulation
    const toggle = card.querySelector('.gauntlet-card-toggle');
    toggle.onchange = () => {
      const activeCount = Object.values(state.metaGauntlet).filter(d => d.enabled !== false).length;
      if (isEnabled && activeCount <= 1 && !toggle.checked) {
        toggle.checked = true;
        showToast('⚠️ At least one opponent must remain active in the simulation gauntlet!');
        return;
      }
      deck.enabled = toggle.checked;
      localStorage.setItem('yyh_meta_gauntlet', JSON.stringify(state.metaGauntlet));
      renderGauntletDecksGrid();
      renderGauntletPills();
      runSynergyCalculation();
      showToast(`"${deck.name}" is now ${deck.enabled ? 'ACTIVE' : 'INACTIVE'} in simulations.`);
    };

    // Edit button -> loads into full Deck Builder!
    card.querySelector('.btn-edit-gauntlet-deck').onclick = () => {
      state.editingGauntletKey = key;
      state.currentDeck = JSON.parse(JSON.stringify(deck));
      if (!state.currentDeck.slots) state.currentDeck.slots = { 1: null, 2: null, 3: null, 4: null };
      if (!state.currentDeck.mainDeck) state.currentDeck.mainDeck = {};
      document.getElementById('deckNameInput').value = deck.name;
      document.getElementById('deckAuthorInput').value = deck.author || 'Gauntlet Opponent';
      updateDeckState();
      state.activeTab = 'deckbuilder';
      document.querySelector('[data-tab="deckbuilder"]').click();
      showToast(`Editing Gauntlet Opponent: "${deck.name}". Modify cards and click "Save to Gauntlet" when done!`);
    };

    // Delete button
    card.querySelector('.btn-del-gauntlet-deck').onclick = () => {
      if (Object.keys(state.metaGauntlet).length <= 1) {
        showToast('⚠️ Cannot delete the last opponent in the Meta Gauntlet!');
        return;
      }
      if (confirm(`Remove opponent "${deck.name}" from the Meta Gauntlet?`)) {
        delete state.metaGauntlet[key];
        localStorage.setItem('yyh_meta_gauntlet', JSON.stringify(state.metaGauntlet));
        renderGauntletDecksGrid();
        renderGauntletPills();
        runSynergyCalculation();
        showToast(`Removed "${deck.name}" from Meta Gauntlet.`);
      }
    };

    container.appendChild(card);
  });
}

function renderMySavedDecksGrid() {
  const container = document.getElementById('savedDecksGrid');
  if (!container) return;
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
        const imgSrc = charCard.images?.primary || charCard.imageUrl || '';
        thumbsHtml += `<img class="library-thumb" src="${imgSrc}" title="${charCard.name}" alt="${charCard.name}">`;
      }
    }

    const mainCount = Object.values(deck.mainDeck || {}).reduce((a, b) => a + b, 0);

    card.innerHTML = `
      <div class="library-card-header">
        <div>
          <div class="library-deck-name">${deck.name}</div>
          <div class="library-deck-author">By ${deck.author || 'Anonymous'}</div>
        </div>
        ${renderTeamBonusTagHtml(deck)}
      </div>
      <div class="library-char-previews">
        ${thumbsHtml || '<span class="text-dim">No starting characters</span>'}
      </div>
      <div class="library-deck-stats">
        <span>Main Deck: <strong>${mainCount}</strong> cards</span>
      </div>
      <div class="library-actions">
        <button class="btn btn-primary btn-sm btn-load-deck">Load Deck</button>
        <button class="btn btn-secondary btn-sm btn-copy-gauntlet" title="Copy this deck to Meta Gauntlet as a simulation opponent">📋 Copy to Gauntlet</button>
        <button class="btn btn-secondary btn-sm btn-del-deck">Delete</button>
      </div>
    `;

    card.querySelector('.btn-load-deck').onclick = () => {
      state.editingGauntletKey = null;
      state.currentDeck = JSON.parse(JSON.stringify(deck));
      document.getElementById('deckNameInput').value = deck.name;
      document.getElementById('deckAuthorInput').value = deck.author || '';
      updateDeckState();
      state.activeTab = 'deckbuilder';
      document.querySelector('[data-tab="deckbuilder"]').click();
      showToast(`Loaded deck: ${deck.name}`);
    };

    // Copy to Gauntlet button!
    card.querySelector('.btn-copy-gauntlet').onclick = () => {
      const newKey = 'gauntlet_copy_' + Date.now();
      const teamBonus = getDeckTeamBonus(deck);
      state.metaGauntlet[newKey] = {
        id: newKey,
        name: deck.name,
        author: deck.author || 'Anonymous',
        team: teamBonus.teamName || 'None',
        icon: teamBonus.icon !== '⚪' ? teamBonus.icon : '⚔️',
        slots: JSON.parse(JSON.stringify(deck.slots || { 1: null, 2: null, 3: null, 4: null })),
        leaderSlot: deck.leaderSlot || 1,
        mainDeck: JSON.parse(JSON.stringify(deck.mainDeck || {})),
        enabled: true
      };
      localStorage.setItem('yyh_meta_gauntlet', JSON.stringify(state.metaGauntlet));
      renderSavedDecks();
      renderGauntletPills();
      runSynergyCalculation();
      showToast(`📋 Copied "${deck.name}" to Meta Gauntlet opponents!`);
      const sec = document.getElementById('gauntletDecksSection');
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

// ==========================================================================
// 12. Meta Gauntlet Manager & Selector
// ==========================================================================

let editingGauntletDeckKey = null;
let editingGauntletDeckData = null;

function initMetaGauntlet() {
  const saved = localStorage.getItem('yyh_meta_gauntlet');
  if (saved) {
    try {
      state.metaGauntlet = JSON.parse(saved);
      for (const k of Object.keys(state.metaGauntlet)) {
        if (state.metaGauntlet[k].enabled === undefined) {
          state.metaGauntlet[k].enabled = true;
        }
      }
      return;
    } catch (e) {
      console.warn('Failed parsing saved meta gauntlet, reverting to default:', e);
    }
  }

  if (typeof META_GAUNTLET_DECKS !== 'undefined') {
    state.metaGauntlet = JSON.parse(JSON.stringify(META_GAUNTLET_DECKS));
  } else {
    state.metaGauntlet = {};
  }
  for (const k of Object.keys(state.metaGauntlet)) {
    state.metaGauntlet[k].enabled = true;
  }
  localStorage.setItem('yyh_meta_gauntlet', JSON.stringify(state.metaGauntlet));
}

function getMetaGauntletForSimulation() {
  if (!state.metaGauntlet) {
    initMetaGauntlet();
  }
  const enabledDecks = {};
  for (const [key, deck] of Object.entries(state.metaGauntlet || {})) {
    if (deck && deck.enabled !== false) {
      enabledDecks[key] = deck;
    }
  }
  if (Object.keys(enabledDecks).length === 0) {
    return state.metaGauntlet;
  }
  return enabledDecks;
}

function renderGauntletPills() {
  const container = document.getElementById('gauntletPillsList');
  if (!container) return;
  if (!state.metaGauntlet) initMetaGauntlet();

  container.innerHTML = '';
  const entries = Object.entries(state.metaGauntlet || {});
  if (entries.length === 0) {
    container.innerHTML = '<span class="text-dim" style="font-size:0.75rem;">No opponents configured</span>';
    return;
  }

  entries.forEach(([key, deck]) => {
    const isEnabled = deck.enabled !== false;
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = `gauntlet-pill ${isEnabled ? 'active' : 'inactive'}`;
    pill.title = isEnabled ? `Click to exclude "${deck.name}" from simulation` : `Click to include "${deck.name}" in simulation`;
    pill.innerHTML = `
      <span class="gauntlet-pill-icon">${deck.icon || '⚔️'}</span>
      <span class="gauntlet-pill-name">${deck.name.replace(/^Team\s+/i, '')}</span>
      <span class="gauntlet-pill-check">${isEnabled ? '✓' : '✗'}</span>
    `;

    pill.addEventListener('click', () => {
      const activeCount = Object.values(state.metaGauntlet).filter(d => d.enabled !== false).length;
      if (isEnabled && activeCount <= 1) {
        showToast('⚠️ At least one opponent deck must be active for simulations!');
        return;
      }
      deck.enabled = !isEnabled;
      localStorage.setItem('yyh_meta_gauntlet', JSON.stringify(state.metaGauntlet));
      renderGauntletPills();
      runSynergyCalculation();
      showToast(`${deck.name} ${deck.enabled ? 'enabled' : 'disabled'} for simulations.`);
    });

    container.appendChild(pill);
  });
}

function openGauntletModal() {
  const modal = document.getElementById('gauntletModal');
  if (!modal) return;
  if (!state.metaGauntlet) initMetaGauntlet();

  const savedSelect = document.getElementById('selectSavedDeckToImport');
  if (savedSelect) {
    savedSelect.innerHTML = '';
    const savedDecks = (state.savedDecks && state.savedDecks.length > 0)
      ? state.savedDecks
      : JSON.parse(localStorage.getItem('yyh_saved_decks') || '[]');

    if (savedDecks.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '-- No saved decks found (save decks in Deck Builder first) --';
      opt.disabled = true;
      savedSelect.appendChild(opt);
    } else {
      savedDecks.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        const count = Object.values(d.mainDeck || {}).reduce((a, b) => a + b, 0);
        opt.textContent = `${d.name} (${count} cards)`;
        savedSelect.appendChild(opt);
      });
    }
  }

  closeGauntletDeckEditor();
  renderGauntletModalDecks();
  modal.style.display = 'flex';
}

function closeGauntletModal() {
  const modal = document.getElementById('gauntletModal');
  if (modal) modal.style.display = 'none';
  closeGauntletDeckEditor();
  renderGauntletPills();
  runSynergyCalculation();
}

function renderGauntletModalDecks() {
  const listEl = document.getElementById('gauntletDecksList');
  if (!listEl) return;
  listEl.innerHTML = '';

  const entries = Object.entries(state.metaGauntlet || {});
  if (entries.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:16px;">No opponent decks in gauntlet. Click "Reset Defaults" or "+ New Opponent".</div>';
    return;
  }

  entries.forEach(([key, deck]) => {
    const card = document.createElement('div');
    const isEnabled = deck.enabled !== false;
    card.className = `gauntlet-deck-card ${isEnabled ? '' : 'disabled'}`;

    const mainCount = Object.values(deck.mainDeck || {}).reduce((a, b) => a + b, 0);

    let slotsHtml = '';
    for (let s = 1; s <= 4; s++) {
      const charId = deck.slots ? deck.slots[s] : null;
      const charCard = charId ? state.cardMap.get(charId) : null;
      if (charCard && charCard.imageUrl) {
        slotsHtml += `<img class="gauntlet-slot-mini" src="${charCard.imageUrl}" alt="${charCard.name}" title="${charCard.name} (Slot ${s})">`;
      } else if (charCard) {
        slotsHtml += `<div class="gauntlet-slot-mini" style="background:#1e293b; display:flex; align-items:center; justify-content:center; font-size:9px; color:#fff;" title="${charCard.name}">#${s}</div>`;
      } else {
        slotsHtml += `<div class="gauntlet-slot-mini" style="background:#0f172a; border:1px dashed #475569;" title="Slot ${s} Empty"></div>`;
      }
    }

    card.innerHTML = `
      <div class="gauntlet-deck-left">
        <input type="checkbox" class="gauntlet-toggle-check" ${isEnabled ? 'checked' : ''} title="Include this opponent in simulations">
        <div class="gauntlet-deck-info">
          <div class="gauntlet-deck-title-row">
            <span class="gauntlet-deck-icon">${deck.icon || '⚔️'}</span>
            <span class="gauntlet-deck-title">${deck.name}</span>
            <span class="gauntlet-deck-tag">${deck.team || 'No Team'}</span>
          </div>
          <div class="gauntlet-deck-sub">
            <span>Main: <strong>${mainCount}</strong> cards</span>
            <div class="gauntlet-slots-preview">${slotsHtml}</div>
          </div>
        </div>
      </div>
      <div class="gauntlet-deck-actions">
        <button class="btn btn-secondary btn-sm btn-edit-gauntlet" title="Edit this opponent deck">✏️ Edit</button>
        <button class="btn btn-secondary btn-sm btn-del-gauntlet" title="Delete opponent from gauntlet" style="color:#ef4444;">🗑️</button>
      </div>
    `;

    const checkbox = card.querySelector('.gauntlet-toggle-check');
    checkbox.onchange = () => {
      const activeCount = Object.values(state.metaGauntlet).filter(d => d.enabled !== false).length;
      if (isEnabled && activeCount <= 1 && !checkbox.checked) {
        checkbox.checked = true;
        showToast('⚠️ At least one opponent must remain enabled for simulations!');
        return;
      }
      deck.enabled = checkbox.checked;
      card.classList.toggle('disabled', !deck.enabled);
      localStorage.setItem('yyh_meta_gauntlet', JSON.stringify(state.metaGauntlet));
      renderGauntletPills();
      runSynergyCalculation();
    };

    card.querySelector('.btn-edit-gauntlet').onclick = () => {
      openGauntletDeckEditor(key);
    };

    card.querySelector('.btn-del-gauntlet').onclick = () => {
      if (Object.keys(state.metaGauntlet).length <= 1) {
        showToast('⚠️ Cannot delete the last opponent deck!');
        return;
      }
      if (confirm(`Remove opponent "${deck.name}" from the Meta Gauntlet?`)) {
        delete state.metaGauntlet[key];
        localStorage.setItem('yyh_meta_gauntlet', JSON.stringify(state.metaGauntlet));
        renderGauntletModalDecks();
        renderGauntletPills();
        runSynergyCalculation();
        showToast(`Removed "${deck.name}".`);
      }
    };

    listEl.appendChild(card);
  });
}

function openGauntletDeckEditor(deckKey = null) {
  editingGauntletDeckKey = deckKey;
  const panel = document.getElementById('gauntletDeckEditorPanel');
  if (!panel) return;

  if (deckKey && state.metaGauntlet[deckKey]) {
    editingGauntletDeckData = JSON.parse(JSON.stringify(state.metaGauntlet[deckKey]));
    document.getElementById('gauntletEditorTitle').textContent = `✏️ Edit Opponent: ${editingGauntletDeckData.name}`;
  } else {
    editingGauntletDeckData = {
      name: 'Custom Opponent Deck',
      team: 'None',
      icon: '⚔️',
      slots: { 1: null, 2: null, 3: null, 4: null },
      mainDeck: {},
      enabled: true
    };
    document.getElementById('gauntletEditorTitle').textContent = '⚔️ Create New Opponent Deck';
  }

  document.getElementById('gauntletEditName').value = editingGauntletDeckData.name || '';
  document.getElementById('gauntletEditIcon').value = editingGauntletDeckData.icon || '⚔️';

  const teamSelect = document.getElementById('gauntletEditTeam');
  if (teamSelect) {
    teamSelect.innerHTML = '';
    const teams = ['None', 'Team Urameshi', 'Team Toguro', 'Team Genkai', 'Team Masho', 'Team Saint Beasts', 'Team Uraotogi', 'Team Rokuyukai'];
    teams.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      if (editingGauntletDeckData.team === t) opt.selected = true;
      teamSelect.appendChild(opt);
    });
  }

  populateGauntletQuickAddSelect();
  renderGauntletEditorSlots();
  renderGauntletEditorCards();

  panel.style.display = 'block';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeGauntletDeckEditor() {
  const panel = document.getElementById('gauntletDeckEditorPanel');
  if (panel) panel.style.display = 'none';
  editingGauntletDeckKey = null;
  editingGauntletDeckData = null;
}

function renderGauntletEditorSlots() {
  const grid = document.getElementById('gauntletEditorSlotsGrid');
  if (!grid || !editingGauntletDeckData) return;
  grid.innerHTML = '';

  const charCards = (state.cards || []).filter(c => c.cardType === 'Character');
  charCards.sort((a, b) => a.name.localeCompare(b.name));

  for (let s = 1; s <= 4; s++) {
    const currentCardId = editingGauntletDeckData.slots ? editingGauntletDeckData.slots[s] : null;
    const currentCard = currentCardId ? state.cardMap.get(currentCardId) : null;

    const slotBox = document.createElement('div');
    slotBox.className = 'editor-slot-item';
    slotBox.style.cssText = 'background: rgba(15, 23, 42, 0.8); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 6px;';

    slotBox.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; font-weight:700; color:var(--spirit-cyan);">
        <span>Slot ${s} Fighter</span>
        ${currentCard ? `<span style="color:var(--text-dim); font-size:0.7rem;">DEF: ${currentCard.defense || 4000}</span>` : ''}
      </div>
      <select class="form-select slot-char-select" style="font-size:0.78rem; padding:4px 6px;">
        <option value="">-- Choose Character --</option>
      </select>
    `;

    const select = slotBox.querySelector('.slot-char-select');
    charCards.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = `${c.name} (${c.cardNumber}) [${c.team || 'No Team'}]`;
      if (c.id === currentCardId) opt.selected = true;
      select.appendChild(opt);
    });

    select.onchange = (e) => {
      if (!editingGauntletDeckData.slots) editingGauntletDeckData.slots = {};
      editingGauntletDeckData.slots[s] = e.target.value || null;
      renderGauntletEditorSlots();
    };

    grid.appendChild(slotBox);
  }
}

function populateGauntletQuickAddSelect() {
  const select = document.getElementById('gauntletQuickAddCardSelect');
  if (!select) return;
  select.innerHTML = '<option value="">-- Select card to add --</option>';

  const sorted = [...(state.cards || [])].sort((a, b) => a.name.localeCompare(b.name));
  sorted.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `[${c.cardType}] ${c.name} (${c.cardNumber})`;
    select.appendChild(opt);
  });
}

function renderGauntletEditorCards() {
  const container = document.getElementById('gauntletEditorCardsList');
  const countEl = document.getElementById('gauntletEditorCardCount');
  if (!container || !editingGauntletDeckData) return;

  container.innerHTML = '';
  const entries = Object.entries(editingGauntletDeckData.mainDeck || {});
  const totalCount = entries.reduce((sum, [, qty]) => sum + qty, 0);
  if (countEl) countEl.textContent = totalCount;

  if (entries.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim); font-size:0.78rem; text-align:center; padding:12px;">No cards in main deck. Use the quick add dropdown above to add cards.</div>';
    return;
  }

  const resolved = entries.map(([id, qty]) => ({
    id,
    qty,
    card: state.cardMap.get(id)
  })).filter(x => x.card);

  resolved.sort((a, b) => a.card.name.localeCompare(b.card.name));

  resolved.forEach(({ id, qty, card }) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:6px 10px; background:rgba(15, 23, 42, 0.6); border-bottom:1px solid rgba(255, 255, 255, 0.05); font-size:0.8rem;';

    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; min-width:0;">
        <span style="font-size:0.7rem; color:var(--spirit-cyan); font-weight:700;">[${card.cardType}]</span>
        <span style="color:#fff; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${card.name}</span>
        <span style="font-size:0.7rem; color:var(--text-dim);">${card.cardNumber}</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
        <button class="btn btn-secondary btn-sm btn-qty-minus" style="padding:2px 8px; font-weight:bold;">-</button>
        <span style="min-width:20px; text-align:center; font-weight:700; color:#fff;">${qty}</span>
        <button class="btn btn-secondary btn-sm btn-qty-plus" style="padding:2px 8px; font-weight:bold;">+</button>
        <button class="btn btn-secondary btn-sm btn-qty-del" style="padding:2px 6px; color:#ef4444;" title="Remove card">✕</button>
      </div>
    `;

    row.querySelector('.btn-qty-minus').onclick = () => {
      if (editingGauntletDeckData.mainDeck[id] > 1) {
        editingGauntletDeckData.mainDeck[id]--;
      } else {
        delete editingGauntletDeckData.mainDeck[id];
      }
      renderGauntletEditorCards();
    };

    row.querySelector('.btn-qty-plus').onclick = () => {
      const limit = card.limitPerDeck || 3;
      if (editingGauntletDeckData.mainDeck[id] < limit) {
        editingGauntletDeckData.mainDeck[id]++;
        renderGauntletEditorCards();
      } else {
        showToast(`Maximum ${limit} copies of ${card.name} allowed!`);
      }
    };

    row.querySelector('.btn-qty-del').onclick = () => {
      delete editingGauntletDeckData.mainDeck[id];
      renderGauntletEditorCards();
    };

    container.appendChild(row);
  });
}

function handleGauntletQuickAdd() {
  const select = document.getElementById('gauntletQuickAddCardSelect');
  if (!select || !select.value || !editingGauntletDeckData) return;
  const cardId = select.value;
  const card = state.cardMap.get(cardId);
  if (!card) return;

  if (!editingGauntletDeckData.mainDeck) editingGauntletDeckData.mainDeck = {};
  const current = editingGauntletDeckData.mainDeck[cardId] || 0;
  const limit = card.limitPerDeck || 3;

  if (current >= limit) {
    showToast(`Maximum ${limit} copies of ${card.name} already in deck!`);
    return;
  }

  editingGauntletDeckData.mainDeck[cardId] = current + 1;
  renderGauntletEditorCards();
  showToast(`Added ${card.name} to opponent deck.`);
}

function saveGauntletDeckFromEditor() {
  if (!editingGauntletDeckData) return;

  const nameInput = document.getElementById('gauntletEditName');
  const teamInput = document.getElementById('gauntletEditTeam');
  const iconInput = document.getElementById('gauntletEditIcon');

  const deckName = nameInput ? nameInput.value.trim() : '';
  if (!deckName) {
    showToast('⚠️ Please enter a deck name!');
    return;
  }

  editingGauntletDeckData.name = deckName;
  editingGauntletDeckData.team = teamInput ? teamInput.value : 'None';
  editingGauntletDeckData.icon = (iconInput && iconInput.value.trim()) ? iconInput.value.trim() : '⚔️';

  const slots = editingGauntletDeckData.slots || {};
  const filledSlots = [slots[1], slots[2], slots[3], slots[4]].filter(Boolean);
  if (filledSlots.length < 4) {
    if (!confirm('⚠️ This opponent deck has fewer than 4 starting fighters selected. Continue saving anyway?')) {
      return;
    }
  }

  const mainCount = Object.values(editingGauntletDeckData.mainDeck || {}).reduce((a, b) => a + b, 0);
  if (mainCount === 0) {
    if (!confirm('⚠️ This opponent deck has 0 cards in its main deck. Continue saving anyway?')) {
      return;
    }
  }

  let targetKey = editingGauntletDeckKey;
  if (!targetKey) {
    targetKey = 'deck_' + Date.now();
  }

  state.metaGauntlet[targetKey] = {
    ...editingGauntletDeckData,
    enabled: true
  };

  localStorage.setItem('yyh_meta_gauntlet', JSON.stringify(state.metaGauntlet));
  closeGauntletDeckEditor();
  renderGauntletModalDecks();
  renderGauntletPills();
  runSynergyCalculation();
  showToast(`Saved opponent deck "${deckName}"!`);
}

function importSavedDeckToGauntlet() {
  const select = document.getElementById('selectSavedDeckToImport');
  if (!select || !select.value) {
    showToast('⚠️ Please select a saved deck to import!');
    return;
  }
  const deckId = select.value;
  const savedDecks = (state.savedDecks && state.savedDecks.length > 0)
    ? state.savedDecks
    : JSON.parse(localStorage.getItem('yyh_saved_decks') || '[]');

  const deck = savedDecks.find(d => d.id === deckId);
  if (!deck) {
    showToast('⚠️ Could not find selected deck.');
    return;
  }

  const newKey = 'imported_' + Date.now();
  let detectedTeam = 'None';
  if (deck.slots) {
    const chars = Object.values(deck.slots).filter(Boolean).map(id => state.cardMap.get(id)).filter(Boolean);
    const teamCounts = {};
    chars.forEach(c => {
      if (c.team && c.team !== 'None') {
        teamCounts[c.team] = (teamCounts[c.team] || 0) + 1;
      }
    });
    const sorted = Object.entries(teamCounts).sort((a, b) => b[1] - a[1]);
    if (sorted.length > 0 && sorted[0][1] >= 2) {
      detectedTeam = sorted[0][0];
    }
  }

  const iconMap = {
    'Team Toguro': '💪',
    'Team Urameshi': '⚡',
    'Team Genkai': '🥋',
    'Team Masho': '🥷',
    'Team Saint Beasts': '🐉',
    'Team Uraotogi': '🎭',
    'Team Rokuyukai': '🔥'
  };

  state.metaGauntlet[newKey] = {
    name: deck.name || 'Imported Opponent',
    team: detectedTeam,
    icon: iconMap[detectedTeam] || '⚔️',
    slots: { ...(deck.slots || { 1: null, 2: null, 3: null, 4: null }) },
    mainDeck: { ...(deck.mainDeck || {}) },
    enabled: true
  };

  localStorage.setItem('yyh_meta_gauntlet', JSON.stringify(state.metaGauntlet));
  renderGauntletModalDecks();
  renderGauntletPills();
  runSynergyCalculation();
  showToast(`Successfully imported "${deck.name}" into Meta Gauntlet!`);
}

function saveCurrentDeckToGauntlet() {
  if (!state.editingGauntletKey) {
    state.editingGauntletKey = 'gauntlet_' + Date.now();
  }

  const teamBonus = getDeckTeamBonus(state.currentDeck);
  const existingDeck = (state.metaGauntlet && state.metaGauntlet[state.editingGauntletKey]) || {};

  state.metaGauntlet[state.editingGauntletKey] = {
    ...existingDeck,
    id: state.editingGauntletKey,
    name: state.currentDeck.name || 'Gauntlet Opponent',
    author: state.currentDeck.author || 'Gauntlet Opponent',
    team: teamBonus.teamName || 'None',
    icon: teamBonus.icon !== '⚪' ? teamBonus.icon : (existingDeck.icon || '⚔️'),
    slots: { ...state.currentDeck.slots },
    leaderSlot: state.currentDeck.leaderSlot || 1,
    mainDeck: { ...state.currentDeck.mainDeck },
    enabled: existingDeck.enabled !== false
  };

  localStorage.setItem('yyh_meta_gauntlet', JSON.stringify(state.metaGauntlet));
  renderGauntletPills();
  renderSavedDecks();
  runSynergyCalculation();
  showToast(`💾 Saved "${state.currentDeck.name}" to Meta Gauntlet!`);
}

function resetGauntletToDefaults() {
  if (confirm('Reset the Meta Gauntlet to default Score tournament benchmark decks? Any custom decks will be replaced.')) {
    if (typeof META_GAUNTLET_DECKS !== 'undefined') {
      state.metaGauntlet = JSON.parse(JSON.stringify(META_GAUNTLET_DECKS));
    } else {
      state.metaGauntlet = {};
    }
    for (const k of Object.keys(state.metaGauntlet)) {
      state.metaGauntlet[k].enabled = true;
    }
    localStorage.setItem('yyh_meta_gauntlet', JSON.stringify(state.metaGauntlet));
    renderSavedDecks();
    renderGauntletPills();
    runSynergyCalculation();
    showToast('Meta Gauntlet reset to defaults.');
  }
}
