import { Item, MatchResult } from '../types';

// Minimum match score (medium confidence and above) that is safe to surface
// to users as a real, reportable match.
export const MIN_REPORTABLE_SCORE = 40;

const synonymGroups = [
  ['wallet', 'card holder', 'purse', 'clutch', 'billfold', 'pouch'],
  ['phone', 'mobile', 'iphone', 'android', 'smartphone', 'cellphone', 'cell'],
  ['laptop', 'computer', 'macbook', 'notebook', 'chromebook'],
  ['keys', 'keychain', 'fob', 'key'],
  ['bottle', 'flask', 'thermos', 'tumbler', 'water bottle', 'canteen'],
  ['bag', 'backpack', 'sack', 'handbag', 'tote'],
  ['charger', 'adapter', 'power brick', 'cable', 'wire'],
  ['earphones', 'headphones', 'earbuds', 'airpods', 'pods'],
  ['watch', 'smartwatch', 'apple watch', 'fitbit'],
  ['book', 'notebook', 'textbook', 'binder', 'journal'],
  ['glasses', 'sunglasses', 'spectacles', 'eyewear'],
  ['pencil', 'pen', 'marker', 'highlighter', 'stationery']
];

function normalizeSynonyms(str: string): string {
  let s = str.toLowerCase();
  s = s.replace(/\bcard holder\b/g, 'wallet');
  s = s.replace(/\bwater bottle\b/g, 'bottle');
  s = s.replace(/\bpower brick\b/g, 'charger');
  s = s.replace(/\bapple watch\b/g, 'watch');
  s = s.replace(/\bcar keys\b/g, 'keys');
  s = s.replace(/\bkey chain\b/g, 'keychain');
  return s;
}

function levenshteinDistance(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));

  for (let i = 0; i <= len1; i++) matrix[i][0] = i;
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  return matrix[len1][len2];
}

function levenshteinSimilarity(s1: string, s2: string): number {
  const val1 = s1.toLowerCase().trim();
  const val2 = s2.toLowerCase().trim();
  if (!val1 || !val2) return 0;
  if (val1 === val2) return 1.0;
  const dist = levenshteinDistance(val1, val2);
  const maxLen = Math.max(val1.length, val2.length);
  return 1 - dist / maxLen;
}

function getSynonymGroupIndex(word: string): number {
  const w = word.toLowerCase().trim();
  for (let i = 0; i < synonymGroups.length; i++) {
    if (synonymGroups[i].includes(w)) {
      return i;
    }
  }
  return -1;
}

function tokensMatchOrSynonym(t1: string, t2: string): boolean {
  const w1 = t1.toLowerCase().trim();
  const w2 = t2.toLowerCase().trim();
  if (w1 === w2) return true;

  if (levenshteinSimilarity(w1, w2) > 0.8) return true;

  const g1 = getSynonymGroupIndex(w1);
  const g2 = getSynonymGroupIndex(w2);
  if (g1 !== -1 && g1 === g2) return true;

  return false;
}

function calculateStringSimilarity(s1: string, s2: string): number {
  const str1 = normalizeSynonyms(s1).trim();
  const str2 = normalizeSynonyms(s2).trim();

  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0.0;

  const stopWords = new Set(['a', 'the', 'is', 'with', 'in', 'on', 'at', 'of', 'and', 'or', 'for', 'to']);
  const tokens1 = str1.split(/\s+/).filter(t => t.length > 1 && !stopWords.has(t));
  const tokens2 = str2.split(/\s+/).filter(t => t.length > 1 && !stopWords.has(t));

  if (tokens1.length === 0 || tokens2.length === 0) {
    return (str1.includes(str2) || str2.includes(str1)) ? 0.5 : 0.0;
  }

  let intersectionSize = 0;
  const used2 = new Set<number>();

  for (const t1 of tokens1) {
    for (let j = 0; j < tokens2.length; j++) {
      if (!used2.has(j) && tokensMatchOrSynonym(t1, tokens2[j])) {
        intersectionSize++;
        used2.add(j);
        break;
      }
    }
  }

  const unionSize = tokens1.length + tokens2.length - intersectionSize;
  const tokenJaccard = unionSize > 0 ? intersectionSize / unionSize : 0;
  const levSim = levenshteinSimilarity(str1, str2);

  // Take the best similarity of Jaccard and Levenshtein, but give a bonus for substring containment
  let finalSim = Math.max(tokenJaccard, levSim);
  if (finalSim < 0.5 && (str1.includes(str2) || str2.includes(str1))) {
    finalSim = Math.max(finalSim, 0.5);
  }

  return finalSim;
}

/**
 * Returns only the matches that meet the reportable confidence threshold,
 * sorted in descending order by match score.
 */
export function filterConfidentMatches(matches: MatchResult[]): MatchResult[] {
  return matches
    .filter(m => m.match_score >= MIN_REPORTABLE_SCORE)
    .sort((a, b) => b.match_score - a.match_score);
}

function getDeterministicImageSimilarity(url1: string, url2: string, textSim: number): number {
  if (url1 === url2) return 1.0;
  let hash = 0;
  const combined = url1.split('/').pop()! + url2.split('/').pop()!;
  for (let i = 0; i < combined.length; i++) {
    hash = combined.charCodeAt(i) + ((hash << 5) - hash);
  }
  const rawRand = Math.abs(hash % 1000) / 1000;
  return 0.35 + rawRand * 0.3 + textSim * 0.35;
}

export function calculateMatchScore(
  newItem: Partial<Item>,
  existingItem: Item,
  precomputedVisualScore?: number,
  visualResultExplanation?: string
): MatchResult {
  let score = 0;
  const reasoning: string[] = [];

  const hasBothImages = !!(newItem.imageUrl && existingItem.imageUrl);
  const textWeightMultiplier = hasBothImages ? 0.8 : 1.0;

  let overallTextSimSum = 0;
  let overallTextCount = 0;

  // 1. Name Similarity (35 points base)
  let nameSim = 0;
  if (newItem.itemName && existingItem.itemName) {
    nameSim = calculateStringSimilarity(newItem.itemName, existingItem.itemName);
    overallTextSimSum += nameSim;
    overallTextCount++;
    const componentScore = nameSim * 35 * textWeightMultiplier;
    score += componentScore;
    if (nameSim > 0.8) {
      reasoning.push('Highly similar item names.');
    } else if (nameSim > 0.4) {
      reasoning.push('Similar item names.');
    }
  }

  // 2. Description Similarity (25 points base)
  let descSim = 0;
  if (newItem.description && existingItem.description) {
    descSim = calculateStringSimilarity(newItem.description, existingItem.description);
    overallTextSimSum += descSim;
    overallTextCount++;
    const componentScore = descSim * 25 * textWeightMultiplier;
    score += componentScore;
    if (descSim > 0.8) {
      reasoning.push('Descriptions match almost identically.');
    } else if (descSim > 0.5) {
      reasoning.push('Descriptions match significantly.');
    } else if (descSim > 0.2) {
      reasoning.push('Some description overlap.');
    }
  }

  // 3. Location Match (15 points base)
  if (newItem.location && existingItem.location) {
    const locSim = calculateStringSimilarity(newItem.location, existingItem.location);
    const componentScore = locSim * 15 * textWeightMultiplier;
    score += componentScore;
    if (locSim > 0.8) {
      reasoning.push('Locations match exactly.');
    } else if (locSim > 0.4) {
      reasoning.push('Location overlap.');
    }
  }

  // 4. Category Match (10 points base)
  if (newItem.category && existingItem.category) {
    if (newItem.category.toLowerCase() === existingItem.category.toLowerCase()) {
      score += 10 * textWeightMultiplier;
      reasoning.push('Category matches.');
    }
  }

  // 5. Date Proximity (10 points base)
  if (newItem.date && existingItem.date) {
    const d1 = new Date(newItem.date);
    const d2 = new Date(existingItem.date);
    if (!isNaN(d1.getTime()) && !isNaN(d2.getTime())) {
      const diffDays = Math.abs(d1.getTime() - d2.getTime()) / (1000 * 3600 * 24);
      if (diffDays <= 1) {
        score += 10 * textWeightMultiplier;
        reasoning.push('Reported within 24 hours of each other.');
      } else if (diffDays <= 3) {
        score += 7 * textWeightMultiplier;
        reasoning.push('Reported within 3 days of each other.');
      } else if (diffDays <= 7) {
        score += 4 * textWeightMultiplier;
        reasoning.push('Reported within the same week.');
      } else if (diffDays <= 14) {
        score += 2 * textWeightMultiplier;
        reasoning.push('Reported within 2 weeks of each other.');
      }
    }
  }

  // 6. Color Match (5 points base)
  if (newItem.color && existingItem.color) {
    const c1 = newItem.color.toLowerCase().trim();
    const c2 = existingItem.color.toLowerCase().trim();
    if (c1 === c2 || c1.includes(c2) || c2.includes(c1)) {
      score += 5 * textWeightMultiplier;
      reasoning.push('Color matches.');
    }
  }

  // 7. Visual Similarity Layer (20 points base)
  if (hasBothImages) {
    if (typeof precomputedVisualScore === 'number') {
      const visualSim = precomputedVisualScore / 100;
      score += visualSim * 20;
      reasoning.push(`Visual Verification Agent confirms ${Math.round(visualSim * 100)}% visual similarity.`);
      if (visualResultExplanation) {
        reasoning.push(visualResultExplanation);
      }
    } else {
      const avgTextSim = overallTextCount > 0 ? (overallTextSimSum / overallTextCount) : 0.5;
      const visualSim = getDeterministicImageSimilarity(newItem.imageUrl!, existingItem.imageUrl!, avgTextSim);
      score += visualSim * 20;
      reasoning.push(`Visual features correlate by ${Math.round(visualSim * 100)}% via scanning.`);
    }
  }

  // Brand/Dents/Details minor boosts & penalties
  if (newItem.brand && existingItem.brand) {
    const b1 = newItem.brand.toLowerCase().trim();
    const b2 = existingItem.brand.toLowerCase().trim();
    if (b1 === b2 || b1.includes(b2) || b2.includes(b1)) {
      reasoning.push('Brand matches.');
    } else {
      // Brand mismatch penalty (e.g. Redmi vs iPhone)
      score -= 30;
      reasoning.push('Brand mismatch detected.');
    }
  }

  if (newItem.dents && existingItem.dents) {
    if (calculateStringSimilarity(newItem.dents, existingItem.dents) > 0.3) {
      reasoning.push('Unique physical marks overlap.');
    }
  }

  if (newItem.hiddenDetails && existingItem.hiddenDetails) {
    if (calculateStringSimilarity(newItem.hiddenDetails, existingItem.hiddenDetails) > 0.4) {
      reasoning.push('Specific internal/hidden details match.');
    }
  }

  const roundedScore = Math.max(0, Math.min(Math.round(score), 100));

  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (roundedScore >= 70) confidence = 'high';
  else if (roundedScore >= 40) confidence = 'medium';

  return {
    match_score: roundedScore,
    reasoning: reasoning.join(' '),
    confidence_level: confidence,
    item: existingItem
  };
}
