import type { Metadata, Viewport } from "next";
import PwaRegister from "./_components/PwaRegister";

export const metadata: Metadata = {
  title: "LMA — Locate Library",
  description: "Library Management App",
  robots: { index: false, follow: false },
  manifest: "/lma/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "LMA",
  },
  icons: {
    icon: "/lma/icons/icon-192.png",
    apple: "/lma/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function LmaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="lma-app">
      {children}
      <PwaRegister />
    </div>
  );
}