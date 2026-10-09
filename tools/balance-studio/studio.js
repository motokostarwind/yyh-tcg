/**
 * Yu Yu Hakusho TCG - Card Balancing Studio & Algorithmic Valuation System
 * Client-Side Application Logic
 */

(function () {
  'use strict';

  // State Management
  const state = {
    allCards: {},          // Raw card data dictionary keyed by id
    cardList: [],          // Array of card objects currently loaded
    filteredCards: [],      // Filtered & sorted array of card objects
    currentIndex: 0,       // Current selected index in filteredCards
    dossier: {},           // Loaded methodology_dossier.json
    feedbackHistory: { reviews: {}, heuristics: [] },
    weights: {},           // Active category weights
    defaultWeights: {},    // Default category weights
    activePreset: 'default'
  };

  // Weight Presets
  const PRESETS = {
    default: {}, // Populated from dossier
    aggro: {
      flat_atk_boost: 2.2,
      atk_discard_efficiency: 1.8,
      flat_def_boost: 0.9,
      absolute_stall: 0.8,
      se_cost_friction: 1.4
    },
    stall: {
      flat_def_boost: 2.2,
      absolute_stall: 2.0,
      wound_mitigation: 1.8,
      sideline_reposition: 1.5,
      flat_atk_boost: 0.7
    },
    garfield: {
      net_card_delta: 2.2,
      tutor_equity: 2.0,
      recursion_equity: 1.6,
      se_cost_friction: 1.8,
      permanence_multiplier: 1.4
    },
    mill: {
      opp_deck_mill: 2.4,
      opp_hand_discard: 2.0,
      opp_resource_denial: 1.8,
      absolute_stall: 1.5
    }
  };

  // DOM Elements
  const el = {
    // Header & Tickers
    tickerTotalCards: document.getElementById('tickerTotalCards'),
    tickerApproved: document.getElementById('tickerApproved'),
    tickerDisputed: document.getElementById('tickerDisputed'),
    tickerPresetName: document.getElementById('tickerPresetName'),
    btnOpenDossier: document.getElementById('btnOpenDossier'),
    btnToggleSliders: document.getElementById('btnToggleSliders'),
    btnExportReviews: document.getElementById('btnExportReviews'),
    btnPublishLive: document.getElementById('btnPublishLive'),

    // Filters & Nav
    searchInput: document.getElementById('searchInput'),
    btnClearSearch: document.getElementById('btnClearSearch'),
    filterType: document.getElementById('filterType'),
    filterSet: document.getElementById('filterSet'),
    filterTier: document.getElementById('filterTier'),
    filterStatus: document.getElementById('filterStatus'),
    sortOrder: document.getElementById('sortOrder'),
    btnPrevCard: document.getElementById('btnPrevCard'),
    btnNextCard: document.getElementById('btnNextCard'),
    cardJumpSelect: document.getElementById('cardJumpSelect'),
    jumpCounter: document.getElementById('jumpCounter'),

    // Column 1: Inspector
    cardSourceSet: document.getElementById('cardSourceSet'),
    cardScanImg: document.getElementById('cardScanImg'),
    metaPillsContainer: document.getElementById('metaPillsContainer'),
    cardVerbatimText: document.getElementById('cardVerbatimText'),
    errataPanel: document.getElementById('errataPanel'),
    errataText: document.getElementById('errataText'),

    // Column 2: Deliberation
    cardOverallScore: document.getElementById('cardOverallScore'),
    cardTierBadge: document.getElementById('cardTierBadge'),
    cardTierCaption: document.getElementById('cardTierCaption'),
    synergyBarFill: document.getElementById('synergyBarFill'),
    cardSynergyVal: document.getElementById('cardSynergyVal'),
    reviewStatusBanner: document.getElementById('reviewStatusBanner'),
    deliberationTabs: document.querySelectorAll('.deliberation-tabs .tab-btn'),
    tabContents: document.querySelectorAll('.deliberation-box .tab-content'),
    agentTheoristText: document.getElementById('agentTheoristText'),
    agentAuditorText: document.getElementById('agentAuditorText'),
    agentSynergyText: document.getElementById('agentSynergyText'),
    agentConsensusText: document.getElementById('agentConsensusText'),
    traceTableBody: document.getElementById('traceTableBody'),
    microCategoriesGrid: document.getElementById('microCategoriesGrid'),

    // Column 3: Feedback
    btnApproveCard: document.getElementById('btnApproveCard'),
    btnDisputeCard: document.getElementById('btnDisputeCard'),
    disputeForm: document.getElementById('disputeForm'),
    disputeCategory: document.getElementById('disputeCategory'),
    disputeScoreSlider: document.getElementById('disputeScoreSlider'),
    disputeScoreInput: document.getElementById('disputeScoreInput'),
    disputeNotes: document.getElementById('disputeNotes'),
    btnSubmitDispute: document.getElementById('btnSubmitDispute'),
    historyCountBadge: document.getElementById('historyCountBadge'),
    reviewHistoryList: document.getElementById('reviewHistoryList'),

    // Drawer & Modals
    weightsDrawer: document.getElementById('weightsDrawer'),
    btnCloseSliders: document.getElementById('btnCloseSliders'),
    presetButtons: document.querySelectorAll('.btn-preset'),
    btnResetWeights: document.getElementById('btnResetWeights'),
    slidersContainer: document.getElementById('slidersContainer'),
    dossierModal: document.getElementById('dossierModal'),
    btnCloseDossier: document.getElementById('btnCloseDossier'),
    dossierFilter: document.getElementById('dossierFilter'),
    dossierCategoriesList: document.getElementById('dossierCategoriesList'),
    imageLightbox: document.getElementById('imageLightbox'),
    lightboxImg: document.getElementById('lightboxImg'),
    lightboxCaption: document.getElementById('lightboxCaption'),
    btnCloseLightbox: document.getElementById('btnCloseLightbox'),
    toastContainer: document.getElementById('toastContainer')
  };

  // Toast Notification System
  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // Initialization
  async function init() {
    try {
      showToast('Initializing YYH Balance Studio...', 'info');

      // Fetch Data
      const [metricsRes, dossierRes, feedbackRes] = await Promise.all([
        fetch('data/card_metrics.json'),
        fetch('data/methodology_dossier.json'),
        fetch('data/feedback_history.json').catch(() => null)
      ]);

      if (!metricsRes.ok) throw new Error('Failed to load card_metrics.json');
      state.allCards = await metricsRes.json();
      state.cardList = Object.values(state.allCards);

      if (dossierRes.ok) {
        state.dossier = await dossierRes.json();
        // Initialize weights
        for (const [k, v] of Object.entries(state.dossier.categories || {})) {
          state.defaultWeights[k] = v.defaultWeight || 1.0;
          state.weights[k] = v.defaultWeight || 1.0;
        }
        PRESETS.default = { ...state.defaultWeights };
      }

      if (feedbackRes && feedbackRes.ok) {
        state.feedbackHistory = await feedbackRes.json();
      }

      buildDisputeCategories();
      buildSlidersDrawer();
      buildDossierModal();
      applyFiltersAndSort();
      updateGlobalTicker();
      renderReviewHistory();
      setupEventListeners();

      if (state.filteredCards.length > 0) {
        displayCard(0);
      }

      showToast(`Loaded ${state.cardList.length} cards across 18 micro-categories.`, 'success');
    } catch (err) {
      console.error(err);
      showToast(`Initialization error: ${err.message}`, 'error');
    }
  }

  // Populate Dispute Category Dropdown
  function buildDisputeCategories() {
    el.disputeCategory.innerHTML = '<option value="Overall Score">Overall Score (Holistic Rating)</option>';
    if (state.dossier.categories) {
      for (const [k, v] of Object.entries(state.dossier.categories)) {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = `${v.name} (${v.group})`;
        el.disputeCategory.appendChild(opt);
      }
    }
  }

  // Build 18 Category Weight Sliders in Drawer
  function buildSlidersDrawer() {
    el.slidersContainer.innerHTML = '';
    if (!state.dossier.categories) return;

    // Group categories
    const groups = {};
    for (const [key, meta] of Object.entries(state.dossier.categories)) {
      const g = meta.group || 'General';
      if (!groups[g]) groups[g] = [];
      groups[g].push({ key, ...meta });
    }

    for (const [groupName, items] of Object.entries(groups)) {
      const title = document.createElement('div');
      title.className = 'slider-group-title';
      title.textContent = groupName;
      el.slidersContainer.appendChild(title);

      items.forEach(item => {
        const row = document.createElement('div');
        row.className = 'slider-row';

        const header = document.createElement('div');
        header.className = 'slider-row-header';

        const label = document.createElement('span');
        label.className = 'slider-label';
        label.textContent = item.name;

        const valSpan = document.createElement('span');
        valSpan.className = 'slider-weight-val';
        valSpan.id = `slider-val-${item.key}`;
        valSpan.textContent = `${(state.weights[item.key] || 1.0).toFixed(2)}x`;

        header.appendChild(label);
        header.appendChild(valSpan);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'range-slider';
        slider.min = '0.0';
        slider.max = '3.0';
        slider.step = '0.05';
        slider.value = state.weights[item.key] || 1.0;
        slider.dataset.category = item.key;

        slider.addEventListener('input', (e) => {
          const newWeight = parseFloat(e.target.value);
          state.weights[item.key] = newWeight;
          valSpan.textContent = `${newWeight.toFixed(2)}x`;
          state.activePreset = 'Custom';
          el.tickerPresetName.textContent = 'Custom';
          recalculateCardScoresLive();
        });

        row.appendChild(header);
        row.appendChild(slider);
        el.slidersContainer.appendChild(row);
      });
    }
  }

  // Recalculate Card Scores In-Browser Live when sliders change
  function recalculateCardScoresLive() {
    const weights = state.weights;

    state.cardList.forEach(card => {
      // If user manually calibrated with suggested score, prioritize calibration
      if (card.userReview && card.userReview.decision === 'dispute' && card.userReview.suggestedScore) {
        return;
      }

      const ctype = card.cardType || 'Event';
      const m = card.metrics || {};
      const seCost = card.seCost !== null && card.seCost !== undefined ? card.seCost : (m.se_cost_friction || 0);
      let basePoints = 0.0;
      const trace = [];

      // 1. Base Archetype Budget
      if (ctype === 'Character') {
        const defVal = card.defense || 4000;
        const defPts = Math.round((36.0 + ((defVal - 2000) / 4000.0) * 34.0) * 10) / 10;
        basePoints += defPts;
        trace.push({
          category: 'Character Baseline Defense',
          metric: `${defVal} DEF (2x threshold: ${defVal * 2} ATK)`,
          points: defPts,
          comment: `Requires opponent to reach ${defVal * 2} ATK to inflict double wounds.`
        });
        if (m.atk_discard_efficiency > 0) {
          const effPts = Math.round(Math.min(12.0, (m.atk_discard_efficiency / 2000.0) * 10.0) * (weights.atk_discard_efficiency || 1.0) * 10) / 10;
          basePoints += effPts;
          trace.push({
            category: 'Attack-to-Discard Efficiency',
            metric: `${Math.round(m.atk_discard_efficiency)} Damage / Discard`,
            points: effPts,
            comment: 'Damage output per hand discard ammunition.'
          });
        }
        if (m.flat_atk_boost > 0) {
          const atkPts = Math.round(Math.min(10.0, (m.flat_atk_boost / 3000.0) * 8.0) * (weights.flat_atk_boost || 1.0) * 10) / 10;
          basePoints += atkPts;
          trace.push({
            category: 'Attack Ability Bonus',
            metric: `+${m.flat_atk_boost} ATK`,
            points: atkPts,
            comment: 'Inherent fighter special attack punch.'
          });
        }
        if (m.flat_def_boost > 0) {
          const defBPts = Math.round(Math.min(10.0, (m.flat_def_boost / 2000.0) * 8.0) * (weights.flat_def_boost || 1.0) * 10) / 10;
          basePoints += defBPts;
          trace.push({
            category: 'Defensive Combat Buff',
            metric: `+${m.flat_def_boost} DEF`,
            points: defBPts,
            comment: 'Temporary combat defense protection.'
          });
        }
      } else if (ctype === 'Item') {
        basePoints += 46.0;
        trace.push({
          category: 'Item Equipment Budget',
          metric: 'Persistent Attached Equipment',
          points: 46.0,
          comment: 'Multi-turn equipment base value on arena fighter.'
        });
        if (m.flat_atk_boost > 0) {
          const atkPts = Math.round(Math.min(18.0, (m.flat_atk_boost / 2500.0) * 12.0) * (weights.flat_atk_boost || 1.0) * 10) / 10;
          basePoints += atkPts;
          trace.push({
            category: 'Flat Attack Boost',
            metric: `+${m.flat_atk_boost} ATK`,
            points: atkPts,
            comment: 'Increases attack value to threaten lethal double-damage.'
          });
        }
        if (m.flat_def_boost > 0) {
          const defPts = Math.round(Math.min(16.0, (m.flat_def_boost / 2000.0) * 12.0) * (weights.flat_def_boost || 1.0) * 10) / 10;
          basePoints += defPts;
          trace.push({
            category: 'Flat Defense Boost',
            metric: `+${m.flat_def_boost} DEF`,
            points: defPts,
            comment: 'Increases attached character double-damage survival cliff.'
          });
        }
      } else if (ctype === 'Technique') {
        basePoints += 45.0;
        trace.push({
          category: 'Technique Move Budget',
          metric: 'Attached Signature Technique',
          points: 45.0,
          comment: 'Reusable attached special move budget.'
        });
        if (m.flat_atk_boost > 0) {
          const atkPts = Math.round(Math.min(18.0, (m.flat_atk_boost / 2500.0) * 12.0) * (weights.flat_atk_boost || 1.0) * 10) / 10;
          basePoints += atkPts;
          trace.push({
            category: 'Flat Attack Boost',
            metric: `+${m.flat_atk_boost} ATK`,
            points: atkPts,
            comment: 'Increases attack value to threaten lethal double-damage.'
          });
        }
        if (m.flat_def_boost > 0) {
          const defPts = Math.round(Math.min(16.0, (m.flat_def_boost / 2000.0) * 12.0) * (weights.flat_def_boost || 1.0) * 10) / 10;
          basePoints += defPts;
          trace.push({
            category: 'Flat Defense Boost',
            metric: `+${m.flat_def_boost} DEF`,
            points: defPts,
            comment: 'Increases attached character double-damage survival cliff.'
          });
        }
        if (m.atk_discard_efficiency > 0) {
          const effPts = Math.round(Math.min(8.0, (m.atk_discard_efficiency / 2000.0) * 6.0) * (weights.atk_discard_efficiency || 1.0) * 10) / 10;
          basePoints += effPts;
          trace.push({
            category: 'Attack Damage Efficiency',
            metric: `${Math.round(m.atk_discard_efficiency)} Dmg / Cost`,
            points: effPts,
            comment: 'Preserves hand ammunition during resolution.'
          });
        }
      } else { // Event / Special Moves
        basePoints += 44.0;
        trace.push({
          category: 'Event Tactical Budget',
          metric: '1-for-1 Tactical Resolution',
          points: 44.0,
          comment: 'Standard burst effect baseline.'
        });
        if (m.flat_atk_boost > 0) {
          const atkPts = Math.round(Math.min(16.0, (m.flat_atk_boost / 2500.0) * 12.0) * (weights.flat_atk_boost || 1.0) * 10) / 10;
          basePoints += atkPts;
          trace.push({
            category: 'Flat Attack Boost',
            metric: `+${m.flat_atk_boost} ATK`,
            points: atkPts,
            comment: 'Single-turn attack pump.'
          });
        }
        if (m.flat_def_boost > 0) {
          const defPts = Math.round(Math.min(16.0, (m.flat_def_boost / 2000.0) * 12.0) * (weights.flat_def_boost || 1.0) * 10) / 10;
          basePoints += defPts;
          trace.push({
            category: 'Flat Defense Boost',
            metric: `+${m.flat_def_boost} DEF`,
            points: defPts,
            comment: 'Single-turn defense pump.'
          });
        }
      }

      // Universal Modifiers
      if (m.absolute_stall > 0) {
        const stallPts = Math.round(Math.min(32.0, m.absolute_stall * 0.75) * (weights.absolute_stall || 1.0) * 10) / 10;
        basePoints += stallPts;
        trace.push({
          category: 'Absolute Attack Stalling',
          metric: 'Attack Step Cancellation',
          points: stallPts,
          comment: 'Neutralizes opponent strike and attached pump cards.'
        });
      }

      if (m.wound_mitigation > 0) {
        const mitPts = Math.round(Math.min(16.0, m.wound_mitigation * 0.45) * (weights.wound_mitigation || 1.0) * 10) / 10;
        basePoints += mitPts;
        trace.push({
          category: 'Wound & Damage Mitigation',
          metric: 'Damage Absorption/Healing',
          points: mitPts,
          comment: 'Extends character lifespan and protects match slots.'
        });
      }

      if (m.sideline_reposition > 0) {
        const repoPts = Math.round(Math.min(12.0, m.sideline_reposition * 0.40) * (weights.sideline_reposition || 1.0) * 10) / 10;
        basePoints += repoPts;
        trace.push({
          category: 'Sideline Repositioning',
          metric: 'Fighter Switching / Dodging',
          points: repoPts,
          comment: 'Protects wounded fighters by swapping to sideline.'
        });
      }

      const delta = m.net_card_delta || 0;
      if (delta > 0) {
        const cardPts = Math.round(Math.min(22.0, delta * 11.0) * (weights.net_card_delta || 1.0) * 10) / 10;
        basePoints += cardPts;
        trace.push({
          category: 'Net Hand Advantage',
          metric: `+${delta} Net Cards`,
          points: cardPts,
          comment: 'Raw card advantage based on Garfield theory.'
        });
      } else if (delta < -1) {
        const cardPts = Math.round(-Math.min(18.0, Math.abs(delta + 1) * 8.0) * (weights.net_card_delta || 1.0) * 10) / 10;
        basePoints += cardPts;
        trace.push({
          category: 'Hand Discard Cost Penalty',
          metric: `${Math.abs(delta + 1)} Additional Discards`,
          points: cardPts,
          comment: 'Depletes hand ammunition beyond normal 1-for-1 play.'
        });
      }

      if (m.tutor_equity > 0) {
        const tutPts = Math.round(Math.min(18.0, m.tutor_equity * 0.50) * (weights.tutor_equity || 1.0) * 10) / 10;
        basePoints += tutPts;
        trace.push({
          category: 'Targeted Tutor / Search',
          metric: 'Deck Search Target',
          points: tutPts,
          comment: 'Eliminates draw variance and retrieves key combo pieces.'
        });
      }

      if (m.recursion_equity > 0) {
        const recPts = Math.round(Math.min(14.0, m.recursion_equity * 0.40) * (weights.recursion_equity || 1.0) * 10) / 10;
        basePoints += recPts;
        trace.push({
          category: 'Discard Pile Recursion',
          metric: 'Graveyard Retrieval',
          points: recPts,
          comment: 'Recycles key cards or extends deck life against mill.'
        });
      }

      if (m.se_delta > 0) {
        const sePts = Math.round(Math.min(16.0, m.se_delta * 7.0) * (weights.se_delta || 1.0) * 10) / 10;
        basePoints += sePts;
        trace.push({
          category: 'Spirit Energy Generation',
          metric: `+${m.se_delta} SE Ramped`,
          points: sePts,
          comment: 'Accelerates tempo ahead of normal draw step curve.'
        });
      }

      if (ctype === 'Event' || ctype === 'Item' || ctype === 'Technique') {
        const seFrictionW = weights.se_cost_friction || 1.0;
        if (seCost === 0) {
          const pts = Math.round(4.0 * seFrictionW * 10) / 10;
          basePoints += pts;
          trace.push({
            category: 'Spirit Energy Cost Friction',
            metric: '0 SE Cost (Free Tempo)',
            points: pts,
            comment: 'Zero energy friction; playable immediately turn 1.'
          });
        } else if (seCost === 1) {
          const pts = Math.round(-2.0 * seFrictionW * 10) / 10;
          basePoints += pts;
          trace.push({
            category: 'Spirit Energy Cost Friction',
            metric: '1 SE Cost Gate',
            points: pts,
            comment: 'Minor energy friction; requires 1 banked SE.'
          });
        } else if (seCost === 2) {
          const pts = Math.round(-5.0 * seFrictionW * 10) / 10;
          basePoints += pts;
          trace.push({
            category: 'Spirit Energy Cost Friction',
            metric: '2 SE Cost Gate',
            points: pts,
            comment: 'Moderate tempo delay; requires 2 banked SE.'
          });
        } else if (seCost >= 3) {
          const pen = Math.round((5.0 + (seCost - 2) * 3.5) * seFrictionW * 10) / 10;
          basePoints -= pen;
          trace.push({
            category: 'Spirit Energy Cost Friction',
            metric: `${seCost} SE Heavy Cost`,
            points: -pen,
            comment: 'Severe energy friction; dead card in early turns.'
          });
        }
      }

      if (m.opp_hand_discard > 0) {
        const discPts = Math.round(Math.min(20.0, m.opp_hand_discard * 0.50) * (weights.opp_hand_discard || 1.0) * 10) / 10;
        basePoints += discPts;
        trace.push({
          category: 'Opponent Hand Depletion',
          metric: 'Forced Discard Disruption',
          points: discPts,
          comment: 'Strips opponent of defensive responses and attack fuel.'
        });
      }

      if (m.opp_deck_mill > 0) {
        const millPts = Math.round(Math.min(18.0, m.opp_deck_mill * 0.45) * (weights.opp_deck_mill || 1.0) * 10) / 10;
        basePoints += millPts;
        trace.push({
          category: 'Opponent Deck Milling',
          metric: 'Topdeck Depletion',
          points: millPts,
          comment: 'Accelerates opponent towards deck-out loss condition.'
        });
      }

      if (m.opp_resource_denial > 0) {
        const denPts = Math.round(Math.min(16.0, m.opp_resource_denial * 0.50) * (weights.opp_resource_denial || 1.0) * 10) / 10;
        basePoints += denPts;
        trace.push({
          category: 'Opponent Resource Denial',
          metric: 'Item/SE Removal',
          points: denPts,
          comment: 'Destroys opponent equipment or removes banked energy.'
        });
      }

      const finalScore = Math.round(Math.max(20.0, Math.min(97.0, basePoints)) * 10) / 10;
      card.score = finalScore;
      card.trace = trace;

      if (finalScore >= 88.0) card.tier = 'S-Tier';
      else if (finalScore >= 74.0) card.tier = 'A-Tier';
      else if (finalScore >= 56.0) card.tier = 'B-Tier';
      else if (finalScore >= 42.0) card.tier = 'C-Tier';
      else card.tier = 'D-Tier';
    });

    if (state.filteredCards.length > 0 && state.currentIndex < state.filteredCards.length) {
      displayCard(state.currentIndex);
    }
  }

  // Filter & Sort Logic
  function applyFiltersAndSort() {
    const search = el.searchInput.value.trim().toLowerCase();
    const typeFilter = el.filterType.value;
    const setFilter = el.filterSet.value;
    const tierFilter = el.filterTier.value;
    const statusFilter = el.filterStatus.value;
    const sort = el.sortOrder.value;

    state.filteredCards = state.cardList.filter(card => {
      // Search
      if (search) {
        const matchesName = (card.name || '').toLowerCase().includes(search);
        const matchesText = (card.text || '').toLowerCase().includes(search);
        const matchesId = (card.id || '').toLowerCase().includes(search);
        const matchesTeam = (card.team || '').toLowerCase().includes(search);
        if (!matchesName && !matchesText && !matchesId && !matchesTeam) return false;
      }

      // Type Filter
      if (typeFilter !== 'ALL') {
        if (typeFilter === 'Special Moves') {
          if (card.cardType !== 'Special Moves' && card.cardType !== 'Special Move') return false;
        } else if (card.cardType !== typeFilter) {
          return false;
        }
      }

      // Set Filter
      if (setFilter !== 'ALL' && card.set !== setFilter) return false;

      // Tier Filter
      if (tierFilter !== 'ALL' && card.tier !== tierFilter) return false;

      // Review Status
      if (statusFilter !== 'ALL') {
        const rev = card.userReview ? card.userReview.decision : null;
        if (statusFilter === 'UNREVIEWED' && rev) return false;
        if (statusFilter === 'APPROVED' && rev !== 'approve') return false;
        if (statusFilter === 'DISPUTED' && rev !== 'dispute') return false;
      }

      return true;
    });

    // Sort
    state.filteredCards.sort((a, b) => {
      if (sort === 'SCORE_DESC') return (b.score || 0) - (a.score || 0);
      if (sort === 'SCORE_ASC') return (a.score || 0) - (b.score || 0);
      if (sort === 'SYNERGY_DESC') return (b.synergyScore || 0) - (a.synergyScore || 0);
      if (sort === 'NAME_ASC') return (a.name || '').localeCompare(b.name || '');
      if (sort === 'ID_ASC') return (a.id || '').localeCompare(b.id || '');
      return 0;
    });

    // Populate Jump Select
    populateJumpSelect();

    state.currentIndex = 0;
    if (state.filteredCards.length > 0) {
      displayCard(0);
    } else {
      renderEmptyState();
    }
  }

  // Populate Jump Select Dropdown
  function populateJumpSelect() {
    el.cardJumpSelect.innerHTML = '';
    state.filteredCards.forEach((c, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = `[${c.id}] ${c.name} (${c.score} • ${c.tier})`;
      el.cardJumpSelect.appendChild(opt);
    });
    updateCounter();
  }

  function updateCounter() {
    const total = state.filteredCards.length;
    const current = total > 0 ? state.currentIndex + 1 : 0;
    el.jumpCounter.textContent = `${current} / ${total}`;
    el.cardJumpSelect.value = state.currentIndex;
  }

  // Render a Single Card into the 3-Column Workbench
  function displayCard(index) {
    if (index < 0 || index >= state.filteredCards.length) return;
    state.currentIndex = index;
    updateCounter();

    const card = state.filteredCards[index];

    // --- COLUMN 1: Card Inspector ---
    el.cardSourceSet.textContent = card.set || 'Ghost Files';
    el.cardSourceSet.className = 'inspector-badge ' + (
      card.set === 'Ghost Files' ? 'badge-gf' :
      card.set === 'Dark Tournament' ? 'badge-dt' : 'badge-gw'
    );

    // Image scan path
    const imgPath = card.image ? `/${encodeURI(card.image)}` : '';
    el.cardScanImg.src = imgPath;
    el.cardScanImg.alt = card.name;
    el.cardScanImg.onerror = () => {
      el.cardScanImg.src = 'data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%22300%22%20height%3D%22420%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20fill%3D%22%23161f30%22%20width%3D%22100%25%22%20height%3D%22100%25%22%2F%3E%3Ctext%20fill%3D%22%2364748b%22%20font-size%3D%2216%22%20font-family%3D%22sans-serif%22%20x%3D%2250%25%22%20y%3D%2250%25%22%20text-anchor%3D%22middle%22%3ENo%20Scan%20Available%3C%2Ftext%3E%3C%2Fsvg%3E';
    };

    // Metadata Pills
    el.metaPillsContainer.innerHTML = '';
    const addPill = (text, cls = '') => {
      const p = document.createElement('span');
      p.className = `meta-pill ${cls}`;
      p.textContent = text;
      el.metaPillsContainer.appendChild(p);
    };

    addPill(card.cardType || 'Card', 'meta-pill-accent');
    addPill(card.cardNumber || card.id);
    addPill(card.rarity || 'Common');
    if (card.team) addPill(`🛡️ ${card.team}`, 'meta-pill-gold');
    if (card.defense) addPill(`DEF: ${card.defense}`);
    if (card.seCost !== null && card.seCost !== undefined) {
      addPill(card.seCost === 0 ? '⚡ 0 SE (Free)' : `⚡ ${card.seCost} SE`);
    }

    // Card Text
    el.cardVerbatimText.textContent = card.text || 'No text provided.';

    // Errata
    if (card.hasErrata && card.errata) {
      el.errataPanel.style.display = 'block';
      el.errataText.textContent = card.errata;
    } else {
      el.errataPanel.style.display = 'none';
    }

    // --- COLUMN 2: Deliberation & Calculation Trace ---
    el.cardOverallScore.textContent = (card.score || 50).toFixed(1);
    
    // Tier badge & caption
    const tier = card.tier || 'B-Tier';
    const tierClean = tier.replace('-Tier', '');
    el.cardTierBadge.textContent = tier.toUpperCase();
    el.cardTierBadge.className = `tier-badge-large tier-${tierClean}`;

    const captions = {
      'S-Tier': 'Tournament Staple • Meta Defining',
      'A-Tier': 'Competitive Mainstay • High Efficiency',
      'B-Tier': 'Format Viable • Solid Roleplayer',
      'C-Tier': 'Niche Tech • Restrictive Shell',
      'D-Tier': 'Underpowered Filler • Outclassed'
    };
    el.cardTierCaption.textContent = captions[tier] || 'Rated Card';

    // Synergy Meter
    const syn = card.synergyScore || 50;
    el.cardSynergyVal.textContent = syn;
    el.synergyBarFill.style.width = `${syn}%`;

    // Review Status Banner
    if (card.userReview) {
      el.reviewStatusBanner.style.display = 'flex';
      const dec = card.userReview.decision;
      if (dec === 'approve') {
        el.reviewStatusBanner.className = 'review-status-banner banner-approved';
        el.reviewStatusBanner.innerHTML = `<strong>👍 Human Arbiter Approved</strong> — Verified as gold standard balance.`;
        el.btnApproveCard.classList.add('active');
        el.btnDisputeCard.classList.remove('active');
        el.disputeForm.style.display = 'none';
      } else {
        el.reviewStatusBanner.className = 'review-status-banner banner-disputed';
        el.reviewStatusBanner.innerHTML = `<strong>👎 Human Arbiter Dispute [${card.userReview.category || 'General'}]:</strong> "${card.userReview.notes || 'Ruling applied.'}"`;
        el.btnDisputeCard.classList.add('active');
        el.btnApproveCard.classList.remove('active');
        el.disputeForm.style.display = 'flex';
        el.disputeCategory.value = card.userReview.category || 'Overall Score';
        el.disputeScoreSlider.value = card.userReview.suggestedScore || card.score;
        el.disputeScoreInput.value = card.userReview.suggestedScore || card.score;
        el.disputeNotes.value = card.userReview.notes || '';
      }
    } else {
      el.reviewStatusBanner.style.display = 'none';
      el.btnApproveCard.classList.remove('active');
      el.btnDisputeCard.classList.remove('active');
      el.disputeForm.style.display = 'none';
      el.disputeNotes.value = '';
      el.disputeScoreSlider.value = Math.round(card.score);
      el.disputeScoreInput.value = Math.round(card.score);
    }

    // Agent Perspectives
    const ap = card.agentPerspectives || {};
    el.agentTheoristText.textContent = ap.gameTheorist || 'Evaluating resource exchange curves...';
    el.agentAuditorText.textContent = ap.rulesAuditor || 'Literal syntax verified.';
    el.agentSynergyText.textContent = ap.synergySpecialist || 'Assessing archetype interactions...';
    el.agentConsensusText.textContent = ap.consensusJustification || 'Balanced synthesis complete.';

    // Trace Table
    renderTraceTable(card);

    // 18 Micro Categories Grid
    renderMicroGrid(card);
  }

  // Render Calculation Trace Receipt
  function renderTraceTable(card) {
    el.traceTableBody.innerHTML = '';
    const trace = card.trace || [];

    if (trace.length === 0) {
      el.traceTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-dim);">No calculation breakdown available.</td></tr>`;
      return;
    }

    trace.forEach(row => {
      const tr = document.createElement('tr');
      const pts = row.points || 0;
      const ptsCls = pts >= 0 ? 'trace-points-pos' : 'trace-points-neg';
      const ptsPrefix = pts > 0 ? '+' : '';

      tr.innerHTML = `
        <td style="font-weight:600; color:#fff;">${row.category || 'Evaluation'}</td>
        <td style="font-family:var(--font-mono); color:var(--text-muted);">${row.metric || '--'}</td>
        <td class="${ptsCls}">${ptsPrefix}${pts} pts</td>
        <td style="color:var(--text-muted);">${row.comment || ''}</td>
      `;
      el.traceTableBody.appendChild(tr);
    });
  }

  // Render 18 Micro Categories Visual Grid
  function renderMicroGrid(card) {
    el.microCategoriesGrid.innerHTML = '';
    const m = card.metrics || {};
    const catDefs = state.dossier.categories || {};

    for (const [key, meta] of Object.entries(catDefs)) {
      const val = m[key] !== undefined ? m[key] : 0;
      const cardEl = document.createElement('div');
      cardEl.className = 'micro-card';
      cardEl.title = `Click to inspect ${meta.name} methodology`;

      // Percentage fill calculation based on baseline
      let pct = 0;
      if (typeof val === 'number') {
        if (key.includes('boost')) pct = Math.min(100, (val / 3000) * 100);
        else if (key === 'atk_discard_efficiency') pct = Math.min(100, (val / 2000) * 100);
        else if (key === 'net_card_delta') pct = Math.min(100, Math.max(0, (val + 2) * 20));
        else if (key === 'permanence_multiplier') pct = Math.min(100, ((val - 1.0) / 0.5) * 100);
        else pct = Math.min(100, val * 3);
      }

      cardEl.innerHTML = `
        <div class="micro-card-top">
          <span class="micro-cat-name">${meta.name}</span>
          <span class="micro-cat-val">${formatMetricValue(key, val)}</span>
        </div>
        <div class="micro-bar-bg">
          <div class="micro-bar-fill" style="width: ${Math.max(4, pct)}%;"></div>
        </div>
      `;

      cardEl.addEventListener('click', () => {
        openDossierModalToCategory(key);
      });

      el.microCategoriesGrid.appendChild(cardEl);
    }
  }

  function formatMetricValue(key, val) {
    if (val === undefined || val === null) return '0';
    if (key === 'flat_atk_boost' || key === 'flat_def_boost') {
      return val > 0 ? `+${val}` : `${val}`;
    }
    if (key === 'net_card_delta') {
      return val > 0 ? `+${val} cards` : `${val} cards`;
    }
    if (key === 'permanence_multiplier') {
      return `${val}x`;
    }
    if (typeof val === 'number') {
      return Number.isInteger(val) ? `${val}` : val.toFixed(1);
    }
    return `${val}`;
  }

  // Methodology Dossier Modal
  function buildDossierModal() {
    el.dossierCategoriesList.innerHTML = '';
    const categories = state.dossier.categories || {};

    for (const [key, meta] of Object.entries(categories)) {
      const card = document.createElement('div');
      card.className = 'dossier-category-card';
      card.id = `dossier-cat-${key}`;
      card.dataset.name = meta.name.toLowerCase();
      card.dataset.group = (meta.group || '').toLowerCase();

      let anchorHtml = '';
      if (meta.anchors) {
        anchorHtml = `
          <div class="dossier-anchors">
            <div class="anchor-box anchor-s"><strong>S-Tier Anchor:</strong> ${meta.anchors.S_tier || 'N/A'}</div>
            <div class="anchor-box anchor-a"><strong>A-Tier Anchor:</strong> ${meta.anchors.A_tier || 'N/A'}</div>
            <div class="anchor-box anchor-b"><strong>B-Tier Anchor:</strong> ${meta.anchors.B_tier || 'N/A'}</div>
            <div class="anchor-box anchor-c"><strong>C-Tier Anchor:</strong> ${meta.anchors.C_tier || 'N/A'}</div>
          </div>
        `;
      }

      card.innerHTML = `
        <div class="dossier-card-top">
          <span class="dossier-cat-title">${meta.name}</span>
          <span class="dossier-cat-group">${meta.group || 'Primitive'} • Default Weight: ${meta.defaultWeight || 1.0}x</span>
        </div>
        <p style="font-size:13px; color:#cbd5e1; line-height:1.5;">${meta.philosophy || ''}</p>
        <div class="dossier-formula-box">
          <strong>Formula:</strong> ${meta.formula || 'Calculated Primitive'}
        </div>
        ${anchorHtml}
      `;

      el.dossierCategoriesList.appendChild(card);
    }
  }

  function openDossierModalToCategory(categoryKey) {
    el.dossierModal.style.display = 'flex';
    setTimeout(() => {
      const target = document.getElementById(`dossier-cat-${categoryKey}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        target.style.borderColor = 'var(--color-cyan)';
        target.style.boxShadow = 'var(--glow-cyan)';
        setTimeout(() => {
          target.style.borderColor = 'var(--border-color)';
          target.style.boxShadow = 'none';
        }, 2000);
      }
    }, 100);
  }

  // Arbitrator Ruling / Feedback Submission
  async function submitDecision(decision) {
    if (state.filteredCards.length === 0) return;
    const currentCard = state.filteredCards[state.currentIndex];

    let payload = {
      cardId: currentCard.id,
      cardName: currentCard.name,
      decision: decision,
      timestamp: new Date().toISOString()
    };

    if (decision === 'dispute') {
      const category = el.disputeCategory.value;
      const score = parseFloat(el.disputeScoreInput.value);
      const notes = el.disputeNotes.value.trim();

      if (!notes) {
        showToast('Please provide a brief arbitration critique explaining the ruling.', 'error');
        el.disputeNotes.focus();
        return;
      }

      payload.category = category;
      payload.suggestedScore = score;
      payload.notes = notes;
    }

    try {
      showToast('Recording arbitrator ruling...', 'info');

      // Send to server
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Server returned error');
      const data = await res.json();

      // Update in-memory state
      currentCard.userReview = {
        decision: payload.decision,
        category: payload.category,
        suggestedScore: payload.suggestedScore,
        notes: payload.notes,
        timestamp: payload.timestamp
      };

      if (decision === 'dispute' && payload.suggestedScore !== undefined) {
        currentCard.score = payload.suggestedScore;
        if (currentCard.score >= 90) currentCard.tier = 'S-Tier';
        else if (currentCard.score >= 78) currentCard.tier = 'A-Tier';
        else if (currentCard.score >= 60) currentCard.tier = 'B-Tier';
        else if (currentCard.score >= 42) currentCard.tier = 'C-Tier';
        else currentCard.tier = 'D-Tier';
      }

      // Update Feedback History collection
      if (!state.feedbackHistory.reviews) state.feedbackHistory.reviews = {};
      state.feedbackHistory.reviews[currentCard.id] = payload;

      showToast(`Arbiter Ruling saved for ${currentCard.name}!`, 'success');
      displayCard(state.currentIndex);
      updateGlobalTicker();
      renderReviewHistory();
    } catch (err) {
      console.error(err);
      showToast(`Saved locally: ${err.message}`, 'warning');
      // Local fallback
      currentCard.userReview = payload;
      if (!state.feedbackHistory.reviews) state.feedbackHistory.reviews = {};
      state.feedbackHistory.reviews[currentCard.id] = payload;
      displayCard(state.currentIndex);
      updateGlobalTicker();
      renderReviewHistory();
    }
  }

  // Render Recent Reviews List
  function renderReviewHistory() {
    el.reviewHistoryList.innerHTML = '';
    const reviews = Object.values(state.feedbackHistory.reviews || {});

    el.historyCountBadge.textContent = `${reviews.length} Reviews`;

    if (reviews.length === 0) {
      el.reviewHistoryList.innerHTML = '<div class="empty-history">No card reviews recorded yet.</div>';
      return;
    }

    // Sort newest first
    reviews.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    reviews.forEach(rev => {
      const item = document.createElement('div');
      item.className = 'history-item';

      const isApprove = rev.decision === 'approve';
      const verdictClass = isApprove ? 'verdict-approved' : 'verdict-disputed';
      const verdictText = isApprove ? 'Approved 👍' : `Disputed 👎 (${rev.category || 'General'})`;

      item.innerHTML = `
        <div class="history-item-top">
          <span class="history-card-name">${rev.cardName || rev.cardId}</span>
          <span class="history-verdict ${verdictClass}">${verdictText}</span>
        </div>
        ${rev.notes ? `<div class="history-notes">"${rev.notes}"</div>` : ''}
      `;

      item.addEventListener('click', () => {
        // Jump to this card
        const idx = state.filteredCards.findIndex(c => c.id === rev.cardId);
        if (idx !== -1) {
          displayCard(idx);
        } else {
          // Clear filters to find it
          el.searchInput.value = rev.cardId;
          el.filterType.value = 'ALL';
          el.filterSet.value = 'ALL';
          el.filterTier.value = 'ALL';
          el.filterStatus.value = 'ALL';
          applyFiltersAndSort();
        }
      });

      el.reviewHistoryList.appendChild(item);
    });
  }

  // Update Global Header Tickers
  function updateGlobalTicker() {
    const reviews = Object.values(state.feedbackHistory.reviews || {});
    const approved = reviews.filter(r => r.decision === 'approve').length;
    const disputed = reviews.filter(r => r.decision === 'dispute').length;

    el.tickerTotalCards.textContent = state.cardList.length;
    el.tickerApproved.textContent = approved;
    el.tickerDisputed.textContent = disputed;
  }

  // Empty Search State
  function renderEmptyState() {
    el.cardSourceSet.textContent = 'None';
    el.cardScanImg.src = '';
    el.cardScanImg.alt = 'No card';
    el.metaPillsContainer.innerHTML = '';
    el.cardVerbatimText.textContent = 'No cards match the active filters or search query.';
    el.errataPanel.style.display = 'none';
    el.cardOverallScore.textContent = '--';
    el.cardTierBadge.textContent = 'NONE';
    el.cardTierBadge.className = 'tier-badge-large tier-D';
    el.cardTierCaption.textContent = 'No match found';
    el.cardSynergyVal.textContent = '0';
    el.synergyBarFill.style.width = '0%';
    el.reviewStatusBanner.style.display = 'none';
    el.traceTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No cards match query.</td></tr>';
    el.microCategoriesGrid.innerHTML = '';
  }

  // Event Listeners
  function setupEventListeners() {
    // Search
    el.searchInput.addEventListener('input', () => {
      el.btnClearSearch.style.display = el.searchInput.value ? 'block' : 'none';
      applyFiltersAndSort();
    });

    el.btnClearSearch.addEventListener('click', () => {
      el.searchInput.value = '';
      el.btnClearSearch.style.display = 'none';
      applyFiltersAndSort();
    });

    // Filters
    [el.filterType, el.filterSet, el.filterTier, el.filterStatus, el.sortOrder].forEach(select => {
      select.addEventListener('change', applyFiltersAndSort);
    });

    // Jump Select
    el.cardJumpSelect.addEventListener('change', (e) => {
      displayCard(parseInt(e.target.value, 10));
    });

    // Prev / Next Navigation
    el.btnPrevCard.addEventListener('click', () => {
      if (state.currentIndex > 0) displayCard(state.currentIndex - 1);
      else if (state.filteredCards.length > 0) displayCard(state.filteredCards.length - 1);
    });

    el.btnNextCard.addEventListener('click', () => {
      if (state.currentIndex < state.filteredCards.length - 1) displayCard(state.currentIndex + 1);
      else if (state.filteredCards.length > 0) displayCard(0);
    });

    // Keyboard Shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return; // Don't intercept when user is typing
      }
      if (e.key === 'ArrowLeft') {
        el.btnPrevCard.click();
      } else if (e.key === 'ArrowRight') {
        el.btnNextCard.click();
      } else if (e.key === 'Escape') {
        el.weightsDrawer.classList.remove('open');
        el.dossierModal.style.display = 'none';
        el.imageLightbox.style.display = 'none';
      }
    });

    // Deliberation Tabs
    el.deliberationTabs.forEach(btn => {
      btn.addEventListener('click', () => {
        el.deliberationTabs.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const targetId = btn.dataset.tab;
        el.tabContents.forEach(content => {
          content.style.display = content.id === targetId ? 'block' : 'none';
        });
      });
    });

    // Quick Decision Buttons
    el.btnApproveCard.addEventListener('click', () => {
      submitDecision('approve');
    });

    el.btnDisputeCard.addEventListener('click', () => {
      el.disputeForm.style.display = el.disputeForm.style.display === 'none' ? 'flex' : 'none';
      if (el.disputeForm.style.display === 'flex') {
        el.btnDisputeCard.classList.add('active');
        el.btnApproveCard.classList.remove('active');
      }
    });

    // Dispute Slider & Input Sync
    el.disputeScoreSlider.addEventListener('input', (e) => {
      el.disputeScoreInput.value = e.target.value;
    });
    el.disputeScoreInput.addEventListener('input', (e) => {
      el.disputeScoreSlider.value = e.target.value;
    });

    // Submit Dispute
    el.btnSubmitDispute.addEventListener('click', () => {
      submitDecision('dispute');
    });

    // Weights Drawer Toggle
    el.btnToggleSliders.addEventListener('click', () => {
      el.weightsDrawer.classList.toggle('open');
    });
    el.btnCloseSliders.addEventListener('click', () => {
      el.weightsDrawer.classList.remove('open');
    });

    // Presets
    el.presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        el.presetButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const presetKey = btn.dataset.preset;
        state.activePreset = presetKey;
        el.tickerPresetName.textContent = btn.textContent;

        const presetValues = PRESETS[presetKey] || PRESETS.default;
        // Merge with defaults
        state.weights = { ...state.defaultWeights, ...presetValues };

        // Update slider UI
        for (const [key, val] of Object.entries(state.weights)) {
          const slider = el.slidersContainer.querySelector(`input[data-category="${key}"]`);
          if (slider) slider.value = val;
          const valSpan = document.getElementById(`slider-val-${key}`);
          if (valSpan) valSpan.textContent = `${val.toFixed(2)}x`;
        }

        recalculateCardScoresLive();
        showToast(`Applied weight preset: ${btn.textContent}`, 'info');
      });
    });

    // Reset Weights Button
    el.btnResetWeights.addEventListener('click', () => {
      state.weights = { ...state.defaultWeights };
      state.activePreset = 'default';
      el.tickerPresetName.textContent = 'Default';
      el.presetButtons.forEach(b => b.classList.toggle('active', b.dataset.preset === 'default'));

      for (const [key, val] of Object.entries(state.weights)) {
        const slider = el.slidersContainer.querySelector(`input[data-category="${key}"]`);
        if (slider) slider.value = val;
        const valSpan = document.getElementById(`slider-val-${key}`);
        if (valSpan) valSpan.textContent = `${val.toFixed(2)}x`;
      }

      recalculateCardScoresLive();
      showToast('Reset category weights to official baseline.', 'info');
    });

    // Methodology Dossier Modal
    el.btnOpenDossier.addEventListener('click', () => {
      el.dossierModal.style.display = 'flex';
    });
    el.btnCloseDossier.addEventListener('click', () => {
      el.dossierModal.style.display = 'none';
    });
    el.dossierModal.addEventListener('click', (e) => {
      if (e.target === el.dossierModal) el.dossierModal.style.display = 'none';
    });

    // Dossier Search
    el.dossierFilter.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      const cards = el.dossierCategoriesList.querySelectorAll('.dossier-category-card');
      cards.forEach(c => {
        const match = c.dataset.name.includes(q) || c.dataset.group.includes(q) || c.textContent.toLowerCase().includes(q);
        c.style.display = match ? 'flex' : 'none';
      });
    });

    // Image Lightbox
    el.cardScanImg.addEventListener('click', () => {
      const currentCard = state.filteredCards[state.currentIndex];
      if (!currentCard) return;
      el.lightboxImg.src = el.cardScanImg.src;
      el.lightboxCaption.textContent = `${currentCard.name} (${currentCard.cardNumber}) - ${currentCard.set}`;
      el.imageLightbox.style.display = 'flex';
    });

    el.btnCloseLightbox.addEventListener('click', () => {
      el.imageLightbox.style.display = 'none';
    });
    el.imageLightbox.addEventListener('click', (e) => {
      if (e.target === el.imageLightbox) el.imageLightbox.style.display = 'none';
    });

    // Export Feedback Reviews
    el.btnExportReviews.addEventListener('click', () => {
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.feedbackHistory, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `feedback_history_${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('Exported feedback history JSON.', 'success');
    });

    // Publish to Live Site
    el.btnPublishLive.addEventListener('click', async () => {
      try {
        showToast('Compiling and publishing card balance matrix...', 'info');
        const res = await fetch('/api/publish', { method: 'POST' });
        if (!res.ok) throw new Error('Publish request failed');
        const data = await res.json();
        showToast('Successfully published matrix to src/data/card_balance_matrix.json!', 'success');
      } catch (err) {
        console.error(err);
        showToast(`Publish error: ${err.message}`, 'error');
      }
    });
  }

  // Start
  document.addEventListener('DOMContentLoaded', init);
})();
