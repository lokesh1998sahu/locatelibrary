// Locate Library — backup builder, shared by the LMA and MF "Download backup"
// buttons. Reads every table of LMA (schema public) and MF (schema fin), writes
// each as a CSV with all its columns, and packs them into one .zip with a
// README. Read-only: nothing in the database changes.
//
// Tables holding sign-in secrets or sessions are left out on purpose.
// No extra package: the zip is written here with Node's built-in compression.

import { deflateRawSync } from "zlib";

const SKIP = /(session|auth|token|secret|password|passwd|login|otp)/i;

// ── CSV ──────────────────────────────────────────────────────────────
function cell(v: unknown, typeOid?: number): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) {
    s = isNaN(v.getTime()) ? "" : typeOid === 1082 ? v.toISOString().slice(0, 10) : v.toISOString();
  } else if (typeof v === "object") {
    s = JSON.stringify(v);
  } else {
    s = String(v);
  }
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCsv(cols: { name: string; type?: number }[], rows: any[]): string {
  const out: string[] = [cols.map((c) => cell(c.name)).join(",")];
  for (const r of rows) out.push(cols.map((c) => cell(r[c.name], c.type)).join(","));
  return "\uFEFF" + out.join("\r\n") + "\r\n";   // BOM so Excel reads ₹ and Hindi correctly
}

// ── ZIP (deflate, UTF-8 names) ───────────────────────────────────────
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(files: { name: string; data: Uint8Array }[], when: Date): Uint8Array {
  const dosTime = (when.getUTCHours() << 11) | (when.getUTCMinutes() << 5) | Math.floor(when.getUTCSeconds() / 2);
  const dosDate = ((when.getUTCFullYear() - 1980) << 9) | ((when.getUTCMonth() + 1) << 5) | when.getUTCDate();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = new TextEncoder().encode(f.name);
    const comp = new Uint8Array(deflateRawSync(f.data, { level: 6 }));
    const crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 8, true);
    lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, comp.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, comp);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 8, true);
    ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, comp.length, true); ch.setUint32(24, f.data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true); ch.setUint32(38, 0, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + comp.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0;
  for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}

// ── the backup ───────────────────────────────────────────────────────
export async function buildBackup(sql: any): Promise<{ bytes: Uint8Array; filename: string; tables: number; rows: number }> {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3600e3);
  const stamp = ist.toISOString().slice(0, 10);
  const tables = (await sql`
    select table_schema as s, table_name as t
      from information_schema.tables
     where table_schema in ('public', 'fin') and table_type = 'BASE TABLE'
     order by table_schema = 'fin', table_name
  `) as any[];

  const files: { name: string; data: Uint8Array }[] = [];
  const lines: string[] = [];
  const skipped: string[] = [];
  let totalRows = 0;
  for (const { s, t } of tables) {
    if (SKIP.test(t)) { skipped.push(`${s}.${t}`); continue; }
    const rows = (await sql.unsafe(`select * from "${String(s).replace(/"/g, "")}"."${String(t).replace(/"/g, "")}"`)) as any;
    const cols = ((rows.columns || []) as any[]).map((c) => ({ name: String(c.name), type: Number(c.type) }));
    const folder = s === "fin" ? "MF" : "LMA";
    files.push({ name: `${folder}/${t}.csv`, data: new TextEncoder().encode(toCsv(cols, Array.from(rows))) });
    lines.push(`${folder.padEnd(4)} ${String(t).padEnd(32)} ${String(rows.length).padStart(8)} rows`);
    totalRows += rows.length;
  }

  const readme = [
    "Locate Library — backup",
    `Made: ${ist.toISOString().slice(0, 16).replace("T", " ")} (India time)`,
    "",
    "One CSV per table, every column. Open any file in Excel or Google Sheets.",
    "LMA/ = the library app (receipts, students, dues, refunds, misc income, past fees, settings, layouts…)",
    "MF/  = My Financials (accounts, entries, entry lines, people, groups and heads, schedules…)",
    "Dates are YYYY-MM-DD; times are UTC (add 5:30 for India time).",
    "",
    "Contents:",
    ...lines,
    "",
    skipped.length ? "Left out on purpose (sign-in and session data): " + skipped.join(", ") : "Nothing left out.",
    "",
    "This file holds student phone numbers and your finances — keep it private.",
  ].join("\r\n");
  files.unshift({ name: "README.txt", data: new TextEncoder().encode("\uFEFF" + readme + "\r\n") });

  return { bytes: zip(files, now), filename: `locatelibrary-backup-${stamp}.zip`, tables: files.length - 1, rows: totalRows };
}
