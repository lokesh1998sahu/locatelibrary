// MF 2.0 — icon set. Simple 24×24 line icons drawn for this app (no library to install).
// Every icon inherits the text colour; size via the `size` prop.
import type { ReactNode } from "react";

type P = { size?: number; className?: string; strokeWidth?: number };
function Svg({ size = 22, className, strokeWidth = 1.9, children }: P & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

export const IconHome = (p: P) => <Svg {...p}><path d="M4 10.5 12 4l8 6.5" /><path d="M6 9.5V20h12V9.5" /><path d="M10 20v-5h4v5" /></Svg>;
export const IconBook = (p: P) => <Svg {...p}><path d="M5 4.5h10.5A2.5 2.5 0 0 1 18 7v12.5H7.5A2.5 2.5 0 0 1 5 17V4.5Z" /><path d="M5 17a2.5 2.5 0 0 1 2.5-2.5H18" /><path d="M9 8.5h5" /></Svg>;
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconBank = (p: P) => <Svg {...p}><path d="M3.5 9 12 4.5 20.5 9" /><path d="M5 9v8M9.5 9v8M14.5 9v8M19 9v8" /><path d="M3.5 19.5h17" /></Svg>;
export const IconMore = (p: P) => <Svg {...p}><rect x="4" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" /></Svg>;
export const IconBack = (p: P) => <Svg {...p}><path d="M14.5 5.5 8 12l6.5 6.5" /></Svg>;
export const IconChevron = (p: P) => <Svg {...p}><path d="M9.5 5.5 16 12l-6.5 6.5" /></Svg>;
export const IconClose = (p: P) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const IconLock = (p: P) => <Svg {...p}><rect x="5" y="10.5" width="14" height="9.5" rx="2.2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></Svg>;
export const IconRefresh = (p: P) => <Svg {...p}><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 4.5v4.2h-4.2" /></Svg>;
export const IconIn = (p: P) => <Svg {...p}><path d="M17 7 7 17" /><path d="M7 9.5V17h7.5" /></Svg>;
export const IconMove = (p: P) => <Svg {...p}><path d="M5 8.5h13l-3.5-3.5" /><path d="M19 15.5H6l3.5 3.5" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="M5 12.5 9.5 17 19 7.5" /></Svg>;
export const IconPeople = (p: P) => <Svg {...p}><circle cx="9" cy="8.5" r="3.2" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M15.5 5.6a3.2 3.2 0 0 1 0 5.8" /><path d="M17.5 14.2a5.5 5.5 0 0 1 3 4.8" /></Svg>;
export const IconChart = (p: P) => <Svg {...p}><path d="M4.5 19.5h15" /><path d="M7 16v-4.5M11 16V8M15 16v-6M19 16V5.5" /></Svg>;
export const IconRepeat = (p: P) => <Svg {...p}><path d="M5 11V9.5A3.5 3.5 0 0 1 8.5 6H18l-3-3" /><path d="M19 13v1.5a3.5 3.5 0 0 1-3.5 3.5H6l3 3" /></Svg>;
export const IconAsset = (p: P) => <Svg {...p}><path d="M4 20V9.5L12 4l8 5.5V20" /><path d="M9 20v-6h6v6" /><path d="M4 20h16" /></Svg>;
export const IconFolder = (p: P) => <Svg {...p}><path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h4l2 2h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.5Z" /></Svg>;
export const IconSettings = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2.2M12 18.3v2.2M20.5 12h-2.2M5.7 12H3.5M18 6l-1.6 1.6M7.6 16.4 6 18M18 18l-1.6-1.6M7.6 7.6 6 6" /></Svg>;
export const IconAlert = (p: P) => <Svg {...p}><path d="M12 4 21 19.5H3L12 4Z" /><path d="M12 10v4.5" /><path d="M12 17.3v.2" /></Svg>;
export const IconCalendar = (p: P) => <Svg {...p}><rect x="4" y="5.5" width="16" height="14.5" rx="2.2" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></Svg>;
export const IconBackspace = (p: P) => <Svg {...p}><path d="M9 5.5h10a1.5 1.5 0 0 1 1.5 1.5v10a1.5 1.5 0 0 1-1.5 1.5H9L3.5 12 9 5.5Z" /><path d="M11.5 9.5l5 5M16.5 9.5l-5 5" /></Svg>;
export const IconWallet = (p: P) => <Svg {...p}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><path d="M4 7.5v10A2.5 2.5 0 0 0 6.5 20H20v-12H6.5A2.5 2.5 0 0 1 4 7.5Z" /><path d="M16 14h1.5" /></Svg>;
