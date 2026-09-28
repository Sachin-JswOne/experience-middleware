/**
 * Generic coercion helpers shared by the response transformers. Nothing here knows
 * about a particular route or payload — every function takes an unknown value off a
 * downstream response and returns a usable one, never throwing.
 */

/** Days in milliseconds; the unit `daysUntil` divides by. */
const MS_PER_DAY = 86_400_000;

/**
 * Amounts arrive either as plain numbers or as the platform `AmountDetails`
 * object. Within that object the two amount fields scale differently:
 * `centAmount` is always in hundredths, while `precisionAmount` scales by the
 * accompanying `precision`. `centAmount` is preferred because it needs no
 * sibling field to be read correctly.
 */
export function toNumber(value: any): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object') {
    if ('centAmount' in value) {
      return toNumber(value.centAmount) / 100;
    }
    if ('precisionAmount' in value) {
      return toNumber(value.precisionAmount) / Math.pow(10, toNumber(value.precision));
    }
  }
  return 0;
}

/**
 * Amounts are read in hundredths, so summing them reintroduces float noise the
 * source values never carry. Every total a transformer reports is rounded back.
 */
export function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Narrows an unknown payload to a list; anything else becomes an empty one. */
export function toArray(value: any): any[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Dates arrive either as a parseable string/timestamp or, from the Java
 * services, as a `LocalDate` serialised to `[year, month, day]` with a 1-based
 * month — `new Date()` cannot read that form, so it is built explicitly.
 */
export function toDate(value: unknown): Date | null {
  if (Array.isArray(value)) {
    const [year, month, day] = value.map(Number);
    if (![year, month, day].every((part) => Number.isFinite(part))) {
      return null;
    }
    return new Date(Date.UTC(year, month - 1, day));
  }
  if (typeof value !== 'string' && typeof value !== 'number' && !(value instanceof Date)) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whole days from today (UTC) to `date`; 0 is today, negative is in the past. */
export function daysUntil(date: unknown): number | null {
  const due = toDate(date);
  if (!due) {
    return null;
  }
  const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((startOfDay(due) - startOfDay(new Date())) / MS_PER_DAY);
}

/**
 * Canonicalises a status/stage string for lookup in a keyed map: uppercased with
 * runs of non-alphanumerics collapsed to `_`, so `Material Dispatch`,
 * `material-dispatch` and `MATERIAL_DISPATCH` all normalise alike.
 */
export function normalizeStatus(status: any): string {
  return String(status ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_');
}
