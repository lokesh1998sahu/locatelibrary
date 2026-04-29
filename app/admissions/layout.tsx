// app/admissions/layout.tsx
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Admissions — Locate Library",
  description: "Library Admission & Receipt Management",
  robots: { index: false, follow: false },
};
export default function AdmissionsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}