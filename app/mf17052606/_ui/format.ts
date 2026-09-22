// MF 2.0 — number & date formatting. Single source; MFProvider re-exports money().

/** ₹ amount, Indian grouping, whole rupees (e.g. ₹1,25,000 · -₹450 · —). */
export function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toLocaleString("en-IN");
  return (neg ? "-₹" : "₹") + s;
}

/** An amount being typed on the keypad ("1250.5") shown with grouping ("1,250.5"). */
export function typedAmount(s: string): string {
  if (!s) return "0";
  const [i, d] = s.split(".");
  const whole = i ? Number(i).toLocaleString("en-IN") : "0";
  return d !== undefined ? `${whole}.${d}` : whole;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-21" → "21 Sep 2026" (— when empty). */
export function dateLong(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${+m[3]} ${MON[+m[2] - 1]} ${m[1]}` : "—";
}
/** "2026-09-21" → "21 Sep". */
export function dateShort(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ""));
  return m ? `${+m[3]} ${MON[+m[2] - 1]}` : "—";
}

/** Local yyyy-mm-dd for a Date (no UTC shift). */
export function isoOf(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
/** yyyy-mm-dd shifted by whole days (local calendar). */
export function shiftIso(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return isoOf(d);
}
/** "Today" · "Yesterday" · "Mon, 21 Sep" (adds the year when it is not this year). */
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
