import { format, isSameDay } from 'date-fns';

/** ISO string -> value for <input type="datetime-local">, in local time. */
export function toLocalInput(iso: string | Date): string {
  return format(typeof iso === 'string' ? new Date(iso) : iso, "yyyy-MM-dd'T'HH:mm");
}

/** <input type="datetime-local"> value -> ISO string (UTC). */
export function fromLocalInput(v: string): string {
  return new Date(v).toISOString();
}

export function fmtDateTime(iso: string): string {
  return format(new Date(iso), 'EEE, MMM d · h:mm a');
}

export function fmtDate(iso: string): string {
  return format(new Date(iso), 'EEE, MMM d, yyyy');
}

export function fmtTime(iso: string): string {
  return format(new Date(iso), 'h:mm a');
}

export function fmtRange(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  if (isSameDay(s, e)) return `${format(s, 'EEE, MMM d')} · ${format(s, 'h:mm a')} – ${format(e, 'h:mm a')}`;
  return `${format(s, 'MMM d, h:mm a')} → ${format(e, 'MMM d, h:mm a')}`;
}

/** Default start = next full hour, end = +1h. */
export function defaultRange(base = new Date()): { start: string; end: string } {
  const s = new Date(base);
  s.setMinutes(0, 0, 0);
  s.setHours(s.getHours() + 1);
  const e = new Date(s.getTime() + 60 * 60 * 1000);
  return { start: toLocalInput(s), end: toLocalInput(e) };
}

/** True when [aStart,aEnd] touches calendar day `day`. */
export function overlapsDay(startIso: string, endIso: string, day: Date): boolean {
  const ds = new Date(day);
  ds.setHours(0, 0, 0, 0);
  const de = new Date(ds);
  de.setDate(de.getDate() + 1);
  return new Date(startIso) < de && new Date(endIso) >= ds;
}
