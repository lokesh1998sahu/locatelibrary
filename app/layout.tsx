import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Locate Library",
  description: "Discover and book premium study libraries near you.",
  // NOTE: intentionally NO `manifest` here. The root site (/) is not a PWA.
  // Each sub-app (/lma, /whatsapp, /tech-tool) declares its OWN manifest in its
  // own layout, so it installs as an independent app. A root manifest used to
  // point at a non-existent /manifest.json — causing a 404 on every sub-app
  // that inherited it ("No manifest detected" on /lma) and risking accidental
  // install of the root website.
};

export const viewport: Viewport = {
  themeColor: "#25d366",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}