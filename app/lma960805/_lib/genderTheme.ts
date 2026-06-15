// app/lma960805/_lib/genderTheme.ts
// SINGLE SOURCE OF TRUTH for gender-based card theming (Architectural Component A).
// Spec: M -> faded blue, F -> faded pink, null/unknown -> neutral grey.
// Subtle, near-white, premium. NO gender colour logic may live anywhere else in the app.

export type Gender = "M" | "F" | "" | null | undefined;

export interface GenderTheme {
  bg: string;      // card background
  border: string;  // card border colour
  key: "male" | "female" | "neutral";
}

const MALE:    GenderTheme = { bg: "#f5f8ff", border: "#dbe6fb", key: "male" };
const FEMALE:  GenderTheme = { bg: "#fff5f9", border: "#fbdbe8", key: "female" };
const NEUTRAL: GenderTheme = { bg: "#f8fafc", border: "#e5e7eb", key: "neutral" };

/** Normalize any stored value to "M" | "F" | "" (null-safe, case-insensitive). */
export function normGender(g: Gender | string): "M" | "F" | "" {
  const v = String(g ?? "").trim().toUpperCase();
  if (v === "M" || v === "MALE")   return "M";
  if (v === "F" || v === "FEMALE") return "F";
  return "";
}

/** Theme tokens for a gender value. Never throws. */
export function genderTheme(g: Gender | string): GenderTheme {
  const v = normGender(g);
  if (v === "M") return MALE;
  if (v === "F") return FEMALE;
  return NEUTRAL;
}

/** Convenience: inline style object for a card background + border. */
export function genderCardStyle(g: Gender | string): { background: string; borderColor: string } {
  const t = genderTheme(g);
  return { background: t.bg, borderColor: t.border };
}

/** Human label for display: "Male" | "Female" | "—". */
export function genderLabel(g: Gender | string): string {
  const v = normGender(g);
  return v === "M" ? "Male" : v === "F" ? "Female" : "—";
}