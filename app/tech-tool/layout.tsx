import type { Metadata, Viewport } from "next";
import TechToolNav from "@/components/TechToolNav";

export const metadata: Metadata = {
  title: "Tech Tool — Locate Library",
  description: "Internal tools dashboard for Locate Library operations.",
  manifest: "/tech-tool-manifest.json",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tech Tool",
  },
};

export const viewport: Viewport = {
  themeColor: "#080a0f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function TechToolLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}