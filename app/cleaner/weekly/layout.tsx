export const metadata = {
  title: "Weekly Cleaning",
  description: "Check weekly cleaning tasks",
  robots: {
    index: false,
    follow: false,
},
icons: {
icon: "/cleaning-icon.svg.png",
},
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}