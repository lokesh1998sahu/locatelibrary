import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tech Tool — Locate Library",
  description: "Internal tools dashboard for Locate Library operations.",
  manifest: "/tech-tool-manifest.json",
  themeColor: "#080a0f",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Tech Tool",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
  },
};

export default function TechToolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}