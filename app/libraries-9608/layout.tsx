import TechToolNav from "@/components/TechToolNav";

export const metadata = {
  title: "FEES ENTRY",
  description: "Libraries Panel",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <TechToolNav />
    </>
  );
}