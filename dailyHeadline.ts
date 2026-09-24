export const DAILY_HEADLINES = [
  'Grow with calm',
  'Focus with ease',
  'Progress with peace',
  'Learn with intention',
  'Move with clarity',
  'Breathe then begin',
  'Steady mind forward',
] as const;

const DAY_MS = 86_400_000;
const ANCHOR_DAY = Date.UTC(2026, 0, 1);

export function getDailyHeadline(date = new Date()): (typeof DAILY_HEADLINES)[number] {
  // Read the phone's local calendar fields; UTC here only makes date-only arithmetic DST-safe.
  const localDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceAnchor = Math.floor((localDay - ANCHOR_DAY) / DAY_MS);
  const index = ((daysSinceAnchor % DAILY_HEADLINES.length) + DAILY_HEADLINES.length) % DAILY_HEADLINES.length;
  return DAILY_HEADLINES[index];
}
