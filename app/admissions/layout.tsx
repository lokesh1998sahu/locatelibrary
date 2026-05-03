import type { Metadata } from "next";
import TechToolNav from "@/components/TechToolNav";

export const metadata: Metadata = {
  title: "Admissions — Locate Library",
  description: "Library Admission & Receipt Management",
  robots: { index: false, follow: false },
};

export default function AdmissionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <TechToolNav />
    </>
  );
}