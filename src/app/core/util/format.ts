/** Pure formatting + date helpers shared across the app. */

const MONEY = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COMPACT = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

const QTY = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });

/** Currency symbol for the storefront. Bangladeshi Taka, per the seed data. */
export const CURRENCY = '৳';

export function money(value: number | null | undefined): string {
  return MONEY.format(Number(value ?? 0));
}

export function currency(value: number | null | undefined): string {
  return `${CURRENCY} ${money(value)}`;
}

export function compact(value: number | null | undefined): string {
  return COMPACT.format(Number(value ?? 0));
}

export function qty(value: number | null | undefined): string {
  return QTY.format(Number(value ?? 0));
}

export function percent(value: number | null | undefined, digits = 1): string {
  return `${Number(value ?? 0).toFixed(digits)}%`;
}

/** `YYYY-MM-DD` for a Date, in local time (never shifts a day like toISOString). */
export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function today(): string {
  return isoDate(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

export function startOfMonth(reference = new Date()): string {
  return isoDate(new Date(reference.getFullYear(), reference.getMonth(), 1));
}

export function endOfMonth(reference = new Date()): string {
  return isoDate(new Date(reference.getFullYear(), reference.getMonth() + 1, 0));
}

const DAY_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const DAY_SHORT_FMT = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short' });

export function prettyDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? String(iso) : DAY_FMT.format(d);
}

export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? String(iso) : DAY_SHORT_FMT.format(d);
}

/** "3 minutes ago" style label, used by the activity feed. */
export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}

/** Initials for avatar chips: "Rahim Traders" -> "RT". */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

/** Deterministic hue from a string, so the same party always gets the same colour. */
export function hueOf(seed: string | null | undefined): number {
  const text = seed ?? '';
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(hash) % 360;
}

/** Case-insensitive "does this row match the search box" test. */
export function matches(haystack: unknown, needle: string): boolean {
  if (!needle) return true;
  return String(haystack ?? '')
    .toLowerCase()
    .includes(needle.toLowerCase());
}

export function sum<T>(rows: readonly T[], pick: (row: T) => number): number {
  return rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);
}

export function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** Clamp helper used by quantity steppers. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]): void {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(',')),
  ].join('\n');

  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

const ONES = [
  '',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function underThousand(value: number): string {
  if (value < 20) return ONES[value];
  if (value < 100) {
    const rest = value % 10;
    return TENS[Math.floor(value / 10)] + (rest ? `-${ONES[rest]}` : '');
  }
  const rest = value % 100;
  return `${ONES[Math.floor(value / 100)]} hundred${rest ? ` ${underThousand(rest)}` : ''}`;
}

/** Words for a whole number, on the lakh/crore scale the seed data is priced in. */
export function numberToWords(value: number): string {
  const whole = Math.floor(Math.abs(value));
  if (whole === 0) return 'zero';

  const groups: [number, string][] = [
    [10000000, 'crore'],
    [100000, 'lakh'],
    [1000, 'thousand'],
  ];

  let rest = whole;
  const parts: string[] = [];
  for (const [size, name] of groups) {
    const count = Math.floor(rest / size);
    if (count) {
      parts.push(`${numberToWords(count)} ${name}`);
      rest %= size;
    }
  }
  if (rest) parts.push(underThousand(rest));
  return parts.join(' ');
}

/** "Two thousand five hundred taka and fifty poisha only" — for invoice faces. */
export function amountInWords(value: number | null | undefined): string {
  const amount = Math.abs(round2(Number(value ?? 0)));
  const whole = Math.floor(amount);
  const fraction = Math.round((amount - whole) * 100);
  const head = `${numberToWords(whole)} taka`;
  const tail = fraction ? ` and ${numberToWords(fraction)} poisha` : '';
  const sign = Number(value ?? 0) < 0 ? 'minus ' : '';
  return `${sign}${head}${tail} only`;
}

/** "01 Aug 2026 — 29 Aug 2026", for report subtitles. */
export function dateRange(from: string | null | undefined, to: string | null | undefined): string {
  if (!from && !to) return 'All dates';
  if (!from) return `Up to ${prettyDate(to)}`;
  if (!to) return `From ${prettyDate(from)}`;
  return `${prettyDate(from)} — ${prettyDate(to)}`;
}
