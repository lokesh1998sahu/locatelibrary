// LMA — small formatters for the new kit. Dates parsing/formatting stays in
// ../_lib/dates (fmtDMY, toIsoInput, daysFromToday); this adds only what the
// kit needs on top.

/** ₹ amount, Indian grouping, whole rupees. */
export function inr(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const neg = n < 0;
  return (neg ? "-₹" : "₹") + Math.abs(Math.round(n)).toLocaleString("en-IN");
}

/** An amount being typed on a keypad ("1250.5" → "1,250.5"). */
export function typedAmount(s: string): string {
  if (!s) return "0";
  const [i, d] = s.split(".");
  const whole = i ? Number(i).toLocaleString("en-IN") : "0";
  return d !== undefined ? `${whole}.${d}` : whole;
}

/** Local yyyy-mm-dd for a Date (no UTC shift). */
export const isoOf = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const todayIso = () => isoOf(new Date());
/** yyyy-mm-dd shifted by whole days. */
export function shiftIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return isoOf(d);
}
/** "Today" · "Yesterday" · "Mon, 21 Sep". */
export function dayLabel(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  if (!m) return "—";
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const ago = Math.round((t.getTime() - d.getTime()) / 86400000);
  if (ago === 0) return "Today";
  if (ago === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", ...(d.getFullYear() !== t.getFullYear() ? { year: "numeric" } : {}) });
}
