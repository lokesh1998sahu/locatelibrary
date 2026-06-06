// WhatsApp tool layout — THIN SERVER component.
//
// Declares the /whatsapp app's OWN manifest + theme so it installs as an
// independent PWA (WhatsApp green #25d366). Previously /whatsapp had NO layout,
// so it inherited the (broken) root manifest link and Chrome could not detect
// its real manifest at /whatsapp/manifest.json.
//
// The service worker for this app is registered inside app/whatsapp/page.tsx
// (scope "/whatsapp"); nothing about that changes here.

import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Open on WhatsApp",
  description: "Paste a number and open it directly in WhatsApp.",
  manifest: "/whatsapp/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "WA Open",
  },
};

export const viewport: Viewport = {
  themeColor: "#25d366",
};

export default function WhatsAppLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
