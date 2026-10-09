/**
 * Hypergeometric Probability Calculator for 2003 Score Yu Yu Hakusho TCG
 * Computes exact draw probabilities across opening hands (n=4) and early turns (n=6, 8, 10).
 */

// Precomputed log-factorials to prevent integer overflow
const LOG_FACTORIALS = [0, 0];
function logFactorial(n) {
  while (LOG_FACTORIALS.length <= n) {
    const len = LOG_FACTORIALS.length;
    LOG_FACTORIALS.push(LOG_FACTORIALS[len - 1] + Math.log(len));
  }
  return LOG_FACTORIALS[n];
}

/**
 * Computes combinations nCr using log factorials
 */
function logCombination(n, r) {
  if (r < 0 || r > n) return -Infinity;
  if (r === 0 || r === n) return 0;
  return logFactorial(n) - logFactorial(r) - logFactorial(n - r);
}

/**
 * Exact Hypergeometric Probability Mass Function (PMF): P(X = k)
 * @param {number} N - Population size (Deck size, e.g. 40 or 44)
 * @param {number} K - Number of successes in population (copies of card in deck, e.g. 3, 2, 1)
 * @param {number} n - Sample size (cards drawn, e.g. 4 for opening hand)
 * @param {number} k - Observed successes in sample
 * @returns {number} Probability between 0 and 1
 */
function hypergeometricPMF(N, K, n, k) {
  if (k < 0 || k > K || k > n || (n - k) > (N - K)) return 0;
  const logProb = logCombination(K, k) + logCombination(N - K, n - k) - logCombination(N, n);
  return Math.exp(logProb);
}

/**
 * Cumulative Hypergeometric: Probability of drawing at least k copies: P(X >= k)
 * @param {number} N - Total deck size
 * @param {number} K - Copies in deck
 * @param {number} n - Cards drawn
 * @param {number} k - Minimum desired copies (default 1)
 * @returns {number} Probability between 0 and 1
 */
function hypergeometricAtLeast(N, K, n, k = 1) {
  if (k <= 0) return 1.0;
  if (k > K || k > n) return 0.0;
  
  let totalProb = 0;
  const maxPossible = Math.min(n, K);
  for (let x = k; x <= maxPossible; x++) {
    totalProb += hypergeometricPMF(N, K, n, x);
  }
  return Math.min(1.0, Math.max(0.0, totalProb));
}

/**
 * Evaluates draw consistency across key game turns
 * @param {number} deckSize - Total deck size (minimum 40)
 * @param {number} cardCount - Copies of card/role in deck
 * @returns {object} Probabilities for Opening Hand, Turn 1, Turn 2, Turn 3
 */
function calculateDrawTimeline(deckSize, cardCount) {
  if (deckSize < 1 || cardCount < 1) {
    return { openingHand: 0, turn1: 0, turn2: 0, turn3: 0 };
  }
  
  // YYH TCG Draw Schedule:
  // Opening Hand: 4 cards
  // Turn 1: 4 start + 2 draw = 6 cards
  // Turn 2: 6 + 2 draw = 8 cards
  // Turn 3: 8 + 2 draw = 10 cards
  return {
    openingHand: Math.round(hypergeometricAtLeast(deckSize, cardCount, 4, 1) * 1000) / 10,
    turn1: Math.round(hypergeometricAtLeast(deckSize, cardCount, 6, 1) * 1000) / 10,
    turn2: Math.round(hypergeometricAtLeast(deckSize, cardCount, 8, 1) * 1000) / 10,
    turn3: Math.round(hypergeometricAtLeast(deckSize, cardCount, 10, 1) * 1000) / 10
  };
}

// Export for Web Worker & ES/CommonJS
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    hypergeometricPMF,
    hypergeometricAtLeast,
    calculateDrawTimeline
  };
}
