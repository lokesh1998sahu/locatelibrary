// LMA — how a student ID is shown for a cross-library booking.
// A student from another library shows with their home library: F189 from KAL → "F189-KAL".
// Some receipts already store the ID with that suffix ("F189-KAL"), so it is
// added only when missing — never "F189-KAL-KAL".
export function shownStudentId(id: unknown, home?: unknown): string {
  const sid = String(id ?? "").trim();
  const h = String(home ?? "").trim().toUpperCase();
  if (!h || h === "NO") return sid;
  return sid.toUpperCase().endsWith("-" + h) ? sid : `${sid}-${h}`;
}
