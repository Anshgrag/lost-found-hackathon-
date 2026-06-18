import { ExtractedReport } from './orchestration';

// Deterministic, offline intake extraction. No LLM required — this guarantees
// the core demo flow (log a report + find matches) always works, even when the
// model API is slow or down. It is intentionally simple, not robust.

const COLORS = [
  'black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple',
  'pink', 'brown', 'grey', 'gray', 'silver', 'gold', 'rose gold', 'navy',
];

const BRANDS = [
  'apple', 'iphone', 'samsung', 'oneplus', 'redmi', 'xiaomi', 'mi', 'oppo',
  'vivo', 'realme', 'nokia', 'dell', 'hp', 'lenovo', 'asus', 'acer', 'macbook',
  'sony', 'bose', 'jbl', 'nike', 'adidas', 'puma', 'titan', 'fossil', 'boat',
  'doms', 'parker', 'reynolds', 'pilot',
];

// Common campus item names. Order matters: more specific first.
const ITEMS = [
  'laptop charger', 'phone charger', 'mobile charger', 'power bank',
  'id card', 'pen drive', 'water bottle', 'smart watch', 'pencil box', 'pencil case',
  'iphone', 'macbook', 'laptop', 'phone', 'mobile', 'tablet', 'ipad',
  'earbuds', 'airpods', 'headphones', 'earphones', 'charger',
  'wallet', 'purse', 'id', 'card', 'keys', 'key', 'watch',
  'backpack', 'bag', 'handbag', 'bottle', 'umbrella',
  'glasses', 'spectacles', 'sunglasses', 'notebook', 'book', 'calculator',
  'usb', 'hard disk', 'jacket', 'hoodie', 'sweater', 'cap', 'hat',
  'pencil', 'pen', 'folder', 'document', 'keychain',
];

const LOCATIONS = [
  'library', 'cafeteria', 'canteen', 'gym', 'lab', 'laboratory', 'hostel',
  'classroom', 'class', 'auditorium', 'ground', 'playground', 'parking',
  'washroom', 'restroom', 'cafe', 'mess', 'block', 'building', 'reception',
];

function find(text: string, list: string[]): string | null {
  for (const word of list) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(text)) return word;
  }
  return null;
}

function findType(text: string): 'lost' | 'found' | null {
  const t = text.toLowerCase();
  // "found" intent
  if (/\b(i\s+found|found\s+a|found\s+an|found\s+my|picked\s+up|someone\s+left)\b/.test(t)) {
    return 'found';
  }
  // "lost" intent
  if (/\b(i\s+lost|lost\s+my|lost\s+a|lost\s+an|misplaced|can'?t\s+find|cannot\s+find|missing)\b/.test(t)) {
    return 'lost';
  }
  // bare keyword fallback
  if (/\bfound\b/.test(t)) return 'found';
  if (/\blost\b/.test(t)) return 'lost';
  return null;
}

function findLocation(text: string): string | null {
  // try "near/at/in <place>" first
  const m = text.match(/\b(?:near|at|in|by|inside|outside)\s+(?:the\s+)?([a-zA-Z][a-zA-Z\s]{2,30})/i);
  if (m) {
    const phrase = m[1].trim().split(/[.,!?]/)[0].trim();
    if (phrase) return phrase;
  }
  return find(text, LOCATIONS);
}

function extractField(text: string, keyPattern: string): string | null {
  const re = new RegExp(`(?:^|\\b|\\|)\\s*(?:${keyPattern})\\s*(?:\\||:|\\-|\\t|\\s{2,})\\s*([^\\n\\r|]+)`, 'im');
  const m = text.match(re);
  if (m && m[1] && m[1].trim()) {
    const val = m[1].trim();
    if (val.toLowerCase() !== 'null' && val.toLowerCase() !== 'n/a') {
      return val;
    }
  }
  return null;
}

/**
 * Build an ExtractedReport from the whole conversation by scanning every user
 * message and merging the details found (later messages fill earlier gaps).
 */
export function localExtract(userTexts: string[]): ExtractedReport {
  const all = userTexts.join('\n');
  const report: ExtractedReport = {
    item_name: null,
    item_category: null,
    color: null,
    brand: null,
    dents: null,
    hidden_details: null,
    distinctive_features: null,
    last_seen_location: null,
    date_lost_or_found: null,
    type: null,
    user_name: null,
    user_email: null,
    user_phone: null,
    student_id: null,
  };

  // 1. Extract Type (lost / found)
  const extractedType = extractField(all, 'type');
  if (extractedType && (extractedType.toLowerCase() === 'lost' || extractedType.toLowerCase() === 'found')) {
    report.type = extractedType.toLowerCase() as 'lost' | 'found';
  } else {
    report.type = findType(all);
  }

  // 2. Extract User Contact Details
  // Name
  report.user_name = extractField(all, '(?:user\\s+|full\\s+)?name');
  if (!report.user_name) {
    const nameMatch = all.match(/(?:my name is|i\'m|i am)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+){0,2})/i);
    if (nameMatch) {
      report.user_name = nameMatch[1].trim();
    }
  }

  // Email
  report.user_email = extractField(all, '(?:user\\s+)?email');
  if (!report.user_email) {
    const emailMatch = all.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) report.user_email = emailMatch[0];
  }

  // Phone
  report.user_phone = extractField(all, '(?:phone(?:\\s+number)?|contact(?:\\s+number)?)');
  if (report.user_phone && !/^\+?[0-9\s\-()]{7,15}$/.test(report.user_phone)) {
    report.user_phone = null;
  }
  if (!report.user_phone) {
    const phoneMatch = all.match(/(?:\+?\d{1,3}[- ]?)?\(?\d{3}\)?[- ]?\d{3}[- ]?\d{4}/);
    if (phoneMatch) {
      report.user_phone = phoneMatch[0];
    } else {
      const phoneDigitsMatch = all.match(/\b\d{7,15}\b/);
      if (phoneDigitsMatch) report.user_phone = phoneDigitsMatch[0];
    }
  }

  // Student ID (support 3-9 digits)
  report.student_id = extractField(all, '(?:student\\s+)?id(?:\\s+number)?');
  if (report.student_id && !/^[0-9a-zA-Z]{3,9}$/.test(report.student_id)) {
    report.student_id = null;
  }
  if (!report.student_id) {
    const idMatches = [...all.matchAll(/\b\d{3,9}\b/g)].map(m => m[0]);
    for (const idCandidate of idMatches) {
      // Exclude matches that are part of the phone number
      if (report.user_phone && report.user_phone.includes(idCandidate)) {
        continue;
      }
      report.student_id = idCandidate;
      break;
    }
  }

  // 3. Extract Item Attributes
  // Clean text for item/brand/color/location extraction to avoid matching contact labels/values (e.g. "phone", "id")
  let cleanText = all;
  if (report.user_email) {
    cleanText = cleanText.replace(new RegExp(report.user_email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }
  if (report.user_phone) {
    cleanText = cleanText.replace(new RegExp(report.user_phone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    cleanText = cleanText.replace(/\b(?:phone(?:\s+number)?|contact(?:\s+number)?)\b/gi, '');
  }
  if (report.student_id) {
    cleanText = cleanText.replace(new RegExp(report.student_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    cleanText = cleanText.replace(/\b(?:student\s+)?id(?:\s+number)?\b/gi, '');
  }
  if (report.user_name) {
    cleanText = cleanText.replace(new RegExp(report.user_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    cleanText = cleanText.replace(/\b(?:my\s+name\s+is|i\'m|i\s+am|name)\b/gi, '');
  }

  // Item Name
  report.item_name = extractField(cleanText, '(?:lost\\s+|found\\s+)?item(?:\\s+name)?');
  if (!report.item_name) {
    const item = find(cleanText, ITEMS);
    const brand = find(cleanText, BRANDS);
    report.item_name = item ?? brand ?? null;
  }

  // Category
  report.item_category = extractField(cleanText, 'category');

  // Color
  report.color = extractField(cleanText, 'color');
  if (!report.color) {
    report.color = find(cleanText, COLORS);
  }

  // Brand
  report.brand = extractField(cleanText, 'brand');
  if (!report.brand) {
    report.brand = find(cleanText, BRANDS);
  }

  // Location
  report.last_seen_location = extractField(cleanText, '(?:last\\s+seen\\s+)?location|place');
  if (!report.last_seen_location) {
    report.last_seen_location = findLocation(cleanText);
  }

  // Date
  report.date_lost_or_found = extractField(all, '(?:date\\s+)?(?:lost|found)');
  if (!report.date_lost_or_found) {
    const dateMatch = all.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if (dateMatch) report.date_lost_or_found = dateMatch[0];
  }

  // Dents / unique marks
  report.dents = extractField(all, '(?:dents|marks|unique\\s+marks|damage)');

  // Hidden details
  report.hidden_details = extractField(all, '(?:hidden\\s+details|hidden|private\\s+details)');

  // Distinctive features description
  const descriptionCandidates = userTexts.filter(text => {
    const t = text.toLowerCase();
    // Exclude structured contact info tables/attributes
    if (t.includes('attribute') && t.includes('detail')) return false;
    if (t.includes('student id') && t.includes('phone')) return false;
    
    // Exclude if it's just a number (like student ID or phone number)
    if (/^\d+$/.test(t.trim())) return false;
    
    // Exclude if it's just a name or short confirmation
    if (t.trim().split(/\s+/).length <= 2 && (t.includes('yes') || t.includes('no') || t.includes('correct'))) return false;

    return true;
  });

  const longest = descriptionCandidates.reduce((a, b) => (b.length > a.length ? b : a), '');
  if (longest.trim().length > 0) {
    report.distinctive_features = longest.trim();
  } else {
    // Fallback if all are filtered, take the longest overall
    const fallbackLongest = userTexts.reduce((a, b) => (b.length > a.length ? b : a), '');
    if (fallbackLongest.trim().length > 0) {
      report.distinctive_features = fallbackLongest.trim();
    }
  }

  return report;
}

