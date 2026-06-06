import type { Metadata, Viewport } from "next";
import TechToolNav from "@/components/TechToolNav";
import TechToolPwaRegister from "./_components/TechToolPwaRegister";

export const metadata: Metadata = {
  title: "Tech Tools — Locate Library",
  description: "Internal tools dashboard for Locate Library operations.",
  manifest: "/tech-tool-manifest.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tech Tools",
  },
};

export const viewport: Viewport = {
  themeColor: "#080a0f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function TechToolLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TechToolPwaRegister />
      {children}
    </>
  );
}