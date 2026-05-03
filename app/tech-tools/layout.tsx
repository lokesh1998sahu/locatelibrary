import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tech Tool — Locate Library",
  description: "Internal tools dashboard for Locate Library operations.",
};

export default function TechToolLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}