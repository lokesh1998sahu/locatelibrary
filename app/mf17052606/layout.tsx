// MF 2.0 layout — PURE SERVER component (same reasoning as LMA's layout):
// a "use client" file cannot export metadata/viewport, so the shell lives in
// ./_components/MFProvider.

import type { Metadata, Viewport } from "next";
import MFProvider from "./_components/MFProvider";
import MFPwaRegister from "./_components/MFPwaRegister";

export const metadata: Metadata = {
  title: "My Financials",
  description: "Accounts, expenses, and what everything is worth.",
  manifest: "/mf17052606/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Financials" },
};

export const viewport: Viewport = {
  themeColor: "#0F6E56",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function MFLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MFPwaRegister />
      <MFProvider>{children}</MFProvider>
    </>
  );
}