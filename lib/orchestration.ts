import { Item, MatchResult } from '../types';
import { normalizeItem } from './items';
import { calculateMatchScore, filterConfidentMatches } from './matching';

/**
 * The raw structured shape the intake LLM is asked to return. Every field is
 * nullable because the model must use `null` when a detail is unknown (it must
 * never invent information). This is normalized into a full `Item` before it is
 * ever persisted.
 */
export interface ExtractedReport {
  item_name: string | null;
  item_category: string | null;
  color: string | null;
  brand: string | null;
  dents: string | null;
  hidden_details: string | null;
  distinctive_features: string | null;
  last_seen_location: string | null;
  date_lost_or_found: string | null;
  type: 'lost' | 'found' | null;
  user_name: string | null;
  user_email: string | null;
  user_phone: string | null;
  student_id: string | null;
}

const VALID_CATEGORIES = [
  'Electronics',
  'Accessories',
  'Documents',
  'Clothing',
  'Keys',
  'Stationery',
  'Other',
] as const;

type Category = (typeof VALID_CATEGORIES)[number];

/**
 * Supplemental instruction appended to INTAKE_AGENT_PROMPT so the model also
 * classifies the report as a lost vs. found report and emits a single JSON
 * object with the exact keys we normalize below.
 */
export const INTAKE_TYPE_INSTRUCTION = `
Additionally include a "type" field: "lost" if the user is reporting something they lost, "found" if they are reporting something they found, or null if it is not yet clear.
Return ONLY a single JSON object with exactly these keys: item_name, item_category, color, brand, dents, hidden_details, distinctive_features, last_seen_location, date_lost_or_found, type, user_name, user_email, user_phone, student_id.`;


/** Returns a trimmed non-empty string, or null for empty/"null"/non-strings. */
function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'n/a') return null;
  return trimmed;
}

function hasValue(value: string | null): value is string {
  return typeof value === 'string' && value.length > 0;
}

function coerceType(value: unknown): 'lost' | 'found' | null {
  if (value === 'lost' || value === 'found') return value;
  return null;
}

function coerceCategory(value: string | null): Category | null {
  if (!value) return null;
  const match = VALID_CATEGORIES.find(c => c.toLowerCase() === value.toLowerCase());
  return match ?? null;
}

/**
 * Robustly parse the intake model's response into an `ExtractedReport`.
 *
 * The model is instructed to return JSON only, but real models sometimes wrap
 * the object in Markdown fences or surrounding prose. We try a direct parse,
 * then fall back to extracting the outermost `{...}` block. Returns `null` when
 * no valid JSON object can be recovered so the caller can fall back to a
 * conversational reply WITHOUT logging anything or claiming a match.
 */
export function parseExtractedReport(raw: unknown): ExtractedReport | null {
  if (typeof raw !== 'string') return null;

  const candidate = extractJsonObject(raw);
  if (!candidate) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(candidate) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  return {
    item_name: cleanString(parsed.item_name),
    item_category: cleanString(parsed.item_category),
    color: cleanString(parsed.color),
    brand: cleanString(parsed.brand),
    dents: cleanString(parsed.dents),
    hidden_details: cleanString(parsed.hidden_details),
    distinctive_features: cleanString(parsed.distinctive_features ?? parsed.description),
    last_seen_location: cleanString(parsed.last_seen_location ?? parsed.location),
    date_lost_or_found: cleanString(parsed.date_lost_or_found ?? parsed.date),
    type: coerceType(parsed.type),
    user_name: cleanString(parsed.user_name),
    user_email: cleanString(parsed.user_email),
    user_phone: cleanString(parsed.user_phone),
    student_id: cleanString(parsed.student_id),
  };
}

function extractJsonObject(raw: string): string | null {
  const trimmed = raw.trim();
  // Strip Markdown code fences if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : trimmed;

  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return body.slice(start, end + 1);
}

/**
 * Centralized completeness rule (reused by the route and by property tests).
 *
 * A report is "ready to log" only when it has at least an item name, a known
 * type (lost/found), AND one additional distinguishing detail (color, brand,
 * location, or a free-text description). This keeps the threshold in one place
 * so it is easy to tune.
 */
export function isReportComplete(report: ExtractedReport | null): boolean {
  if (!report) return false;

  const hasName = hasValue(report.item_name);
  const hasType = report.type === 'lost' || report.type === 'found';
  
  // A report is "ready to log" only when it has at least an item name, a known
  // type (lost/found), AND one additional distinguishing detail.
  const hasDetail =
    hasValue(report.color) ||
    hasValue(report.brand) ||
    hasValue(report.dents) ||
    hasValue(report.hidden_details) ||
    hasValue(report.last_seen_location) ||
    hasValue(report.distinctive_features);

  // Very Strict Requirements: Mandate user contact info
  const hasUserName = hasValue(report.user_name);
  const hasUserPhone = hasValue(report.user_phone);
  const hasUserIdentifier = hasValue(report.user_email) || hasValue(report.student_id);

  return hasName && hasType && hasDetail && hasUserName && hasUserPhone && hasUserIdentifier;
}

/**
 * Normalize an `ExtractedReport` into a fully-formed `Item` (safe defaults +
 * system-generated id/timestamp). Pure aside from the id/timestamp generated by
 * `normalizeItem`.
 */
export function extractedReportToItem(report: ExtractedReport): Item {
  const category = coerceCategory(report.item_category) ?? 'Other';
  return normalizeItem({
    itemName: report.item_name ?? '',
    category,
    color: report.color,
    brand: report.brand,
    dents: report.dents,
    hiddenDetails: report.hidden_details,
    description: report.distinctive_features ?? '',
    location: report.last_seen_location ?? '',
    date: report.date_lost_or_found ?? '',
    type: report.type === 'found' ? 'found' : 'lost',
    userName: report.user_name ?? undefined,
    userEmail: report.user_email ?? undefined,
    userPhone: report.user_phone ?? undefined,
    studentId: report.student_id ?? undefined,
  });
}

/** The opposite item type we search against for a report of the given type. */
export function oppositeType(type: 'lost' | 'found'): 'lost' | 'found' {
  return type === 'lost' ? 'found' : 'lost';
}

/**
 * Score a candidate item against the opposite-type items and return only the
 * confident matches (>= MIN_REPORTABLE_SCORE, sorted descending). Every result
 * is, by construction, an element of `oppositeItems` so the assistant can never
 * surface an item that is not in the store.
 */
export function findConfidentMatches(
  candidate: Item,
  oppositeItems: Item[]
): MatchResult[] {
  const scored = oppositeItems.map(existing => calculateMatchScore(candidate, existing));
  return filterConfidentMatches(scored).slice(0, 5);
}

/**
 * Deterministically build the factual match block from real match output.
 * NEVER invents matches — facts come only from the provided `matches` array
 * (which originates from `filterConfidentMatches`).
 */
export function buildMatchMessage(
  matches: MatchResult[],
  opposite: 'lost' | 'found',
  reportedType?: 'lost' | 'found',
  itemName?: string
): string {
  const kind = reportedType ? reportedType.toUpperCase() : 'item';
  const what = itemName && itemName.trim() ? ` for your **${sanitizeCell(itemName)}**` : '';
  const logged = `✅ Got it — I've logged your **${kind}** report${what}.`;

  if (!matches || matches.length === 0) {
    return (
      `${logged}\n\n` +
      `I searched all current ${opposite} reports, but no matching item has been found yet. ` +
      `I've safely logged your report and I'll keep watching and let you know the moment one appears.`
    );
  }

  const header =
    `${logged}\n\nGreat news — I also found ${matches.length === 1 ? 'a possible match' : `${matches.length} possible matches`} ` +
    `among our current ${opposite} reports:`;

  const tableHeader =
    '| Image | Item | Location | Match Score | Contact Details | Why it matches |\n' +
    '| --- | --- | --- | --- | --- | --- |';

  const rows = matches.map(m => {
    const imgStr = m.item?.imageUrl ? `![match](${m.item.imageUrl})` : 'No Image';
    const name = sanitizeCell(m.item?.itemName) || 'Unnamed item';
    const location = sanitizeCell(m.item?.location) || 'Not specified';
    const reasoning = sanitizeCell(m.reasoning) || 'Several details line up.';
    const contactInfo = [
      m.item?.userName ? `Name: ${m.item.userName}` : '',
      m.item?.userPhone ? `Phone: ${m.item.userPhone}` : '',
      m.item?.userEmail ? `Email: ${m.item.userEmail}` : '',
    ].filter(Boolean).join(', ') || 'N/A';
    const contact = sanitizeCell(contactInfo);
    return `| ${imgStr} | ${name} | ${location} | ${m.match_score}% | ${contact} | ${reasoning} |`;
  });

  const footer =
    "Please review these carefully. I've safely logged your report, so we'll " +
    'keep these matches connected while you confirm the details.';

  return [header, '', tableHeader, ...rows, '', footer].join('\n');
}

/** Escape pipe/newline chars so a value can't break the Markdown table. */
function sanitizeCell(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}
