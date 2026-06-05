// LMA layout — THIN SERVER component.
//
// Its only jobs are:
//   1) Export `viewport.themeColor` = #6366f1 (LMA indigo). This overrides the
//      root layout's green (#25d366, set for the /whatsapp app) for every /lma
//      route — fixing the mobile status/top bar so it shows the LMA brand.
//      A server component is required: `"use client"` files can't export viewport.
//   2) Render <LMAProvider> (the real shell: auth gate, context, toast).
//
// The provider + hooks + types live in ./_components/LMAProvider. They are
// re-exported below so existing page imports — `from "./layout"` / `from
// "../layout"` (useLMA, useScopeChips, LMAInitData, ScopeChip, …) — keep working.

import type { Viewport } from "next";
import LMAProvider from "./_components/LMAProvider";

export { useLMA, useScopeChips } from "./_components/LMAProvider";
export type { LMAInitData, ScopeChip, ToastKind, ToastState } from "./_components/LMAProvider";

export const viewport: Viewport = {
  themeColor: "#6366f1",
};

export default function LmaLayout({ children }: { children: React.ReactNode }) {
  return <LMAProvider>{children}</LMAProvider>;
}
