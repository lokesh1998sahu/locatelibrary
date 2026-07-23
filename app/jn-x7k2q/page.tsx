import IntakeForm from "./IntakeForm";

export const metadata = {
  title: "Library Admission",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function Page(){ return <IntakeForm/>; }