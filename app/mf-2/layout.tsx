export const metadata = {
  title: "My Financials 2.0",
  description: "Private financial control panel",
  robots: {
    index: false,
    follow: false,
  },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}