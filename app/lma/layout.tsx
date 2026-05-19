import type { Metadata, Viewport } from "next";
import TechToolNav from "@/components/TechToolNav";

export const metadata: Metadata = {
  title: "LMA — Locate Library",
  description: "Library Management App",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function LmaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lma-app">
      {children}
      <TechToolNav />
    </div>
  );
}