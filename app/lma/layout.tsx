// LMA layout — PURE SERVER component.
//
// Its jobs are:
//   1) Declare LMA's OWN manifest + theme so /lma installs as an independent
//      PWA (indigo #6366f1). Must be a SERVER component — `"use client"` files
//      cannot export `metadata`/`viewport`. For the same reason this file must
//      NOT re-export client hooks: doing so pulls the module into the client
//      graph, and Next then forbids the `metadata` export.
//   2) Mount <PwaRegister> to register the LMA service worker (scoped to /lma).
//   3) Render <LMAProvider> (the real shell: auth gate, context, toast).
//
// The shell, hooks (useLMA, useScopeChips) and types (LMAInitData, ScopeChip,
// ToastKind, ToastState) live in ./_components/LMAProvider — pages import them
// directly from there.

import type { Metadata, Viewport } from "next";
import LMAProvider from "./_components/LMAProvider";
import PwaRegister from "./_components/PwaRegister";

export const metadata: Metadata = {
  title: "LMA — Locate Library",
  description: "Library Management App — admissions, seats, dues, dashboard.",
  manifest: "/lma/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LMA",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
};

export default function LmaLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PwaRegister />
      <LMAProvider>{children}</LMAProvider>
    </>
  );
}
