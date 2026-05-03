import TechToolNav from "@/components/TechToolNav";

export const metadata = {
  title: "Cleaning Tracker",
  description: "Track Daily and Weekly Cleaning",
  robots: { index: false, follow: false },
  icons: { icon: "/cleaning-icon.svg.png" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <TechToolNav />
    </>
  );
}