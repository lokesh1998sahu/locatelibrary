"use client";

// MF 2.0 shared shell (client):
//   1) Password gate for everything under /mf17052606. The password is verified
//      SERVER-SIDE (POST /api/mf17052606/auth); the session is a signed httpOnly
//      cookie. Nothing secret ships in the browser bundle.
//   2) One initData() fetch shared through React context.
//   3) Shared toast + post() helper with a duplicate-submit guard.
//   4) The app frame: bottom tab bar + toast. MF's colours and base styles
//      live in app/globals.css (Tailwind v4 @theme, mf-* names); the reusable
//      parts live in ../_ui/kit.tsx.
//
// Deliberately separate from LMA's provider: different cookie, different API,
// different look. Two apps, not one app with a hidden room.

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TabBar, ToastView, tabBarHidden, Button, TextInput } from "../_ui/kit";

const API = "/api/mf17052606";
const AUTH_API = API + "/auth";

export interface MFAccount {
  id: number; bank_code: string; bank_name: string; owner_name: string;
  acct_type: string; is_liability: boolean; is_set_up: boolean;
  opening_balance: number | null; opening_date: string | null;
  balance: number | null;          // what the bank should show TODAY (India time)
  balance_total?: number | null;   // including everything dated after today
  incoming?: number;               // library fees received, landing in this bank after today
  dated_later?: number;            // your own entries dated after today
  lands_by?: string | null;        // last day the incoming fees should land
}
// A Head (group_code set) or a Sub-head (parent_id = its Head).
export interface MFCategory {
  id: number; code: string; name: string; kind: "EXPENSE" | "INCOME"; quick: boolean;
  group_code?: string | null; parent_id?: number | null; sort?: number;
}
// A Group: Personal, Library (asks which library/branch), or any you add.
export interface MFGroup { code: string; name: string; is_library: boolean; sort: number; }
export interface MFLabels { group: string; head: string; subhead: string; }
export interface MFPerson   { id: number; name: string; quick: boolean; }
export interface MFRoute    { code: string; bank_code: string; settlement_days: number; }
export interface MFLibrary  { library_code: string; label: string; branch_code: string | null; branch_label: string | null; }
export interface MFInitData {
  accounts: MFAccount[];
  categories: MFCategory[];
  people: MFPerson[];
  routes: MFRoute[];
  libraries: MFLibrary[];
  groups?: MFGroup[];     // Personal, Library, and any you add (in your order)
  labels?: MFLabels;      // what the levels are called (renameable in Set up)
}
export interface MFLiveData {
  alerts: { due_soon: number; overdue: number; next_name: string | null; next_due: string | null } | null;
  totals: {
    haves: number; owes: number; net: number;
    in_accounts: number; owed_to_you: number; you_owe_people: number; in_assets: number;
  };
}

export type ToastKind = "success" | "error";
export type ToastState = { msg: string; type: ToastKind } | null;

interface MFContextValue {
  init: MFInitData | null;
  refreshInit: () => Promise<void>;
  loading: boolean;
  live: MFLiveData | null;
  loadLive: () => Promise<void>;
  liveLoading: boolean;
  lock: () => void;
  showToast: (msg: string, type?: ToastKind) => void;
  post: (action: string, payload?: any) => Promise<any | null>;
}

const MFContext = createContext<MFContextValue | null>(null);

export function useMF(): MFContextValue {
  const v = useContext(MFContext);
  if (!v) throw new Error("useMF must be called inside <MFProvider>");
  return v;
}

// ₹ formatting lives in ../_ui/format (one source); re-exported so existing imports keep working.
export { money } from "../_ui/format";
import { money as fmtMoney } from "../_ui/format";


export default function MFProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [init, setInit] = useState<MFInitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [live, setLive] = useState<MFLiveData | null>(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const inflight = useRef<Set<string>>(new Set());
  const toastTimer = useRef<any>(null);
  const pathname = usePathname() || "";

  const showToast = useCallback((msg: string, type: ToastKind = "success") => {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const post = useCallback(async (action: string, payload: any = {}) => {
    // Blocks a repeat of the SAME request while it is running (double taps),
    // but never a different request of the same kind.
    const key = action + "|" + JSON.stringify(payload ?? {});
    if (inflight.current.has(key)) return null;
    inflight.current.add(key);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      if (r.status === 401) { setAuthed(false); setInit(null); setLive(null); return null; }
      const j = await r.json();
      if (!j?.ok) { showToast(j?.error || "That didn't work.", "error"); return null; }
      return j;
    } catch {
      showToast("No connection. Try again.", "error");
      return null;
    } finally {
      inflight.current.delete(key);
    }
  }, [showToast]);

  const refreshInit = useCallback(async () => {
    setLoading(true);
    const j = await post("initData");
    if (j) setInit(j as MFInitData);
    setLoading(false);
  }, [post]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(AUTH_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "session" }),
        });
        const j = await r.json();
        setAuthed(!!j?.authed);
      } catch { setAuthed(false); }
    })();
  }, []);

  // The heavy half. Home calls it by itself when it opens, and on refresh.
  const loadLive = useCallback(async () => {
    setLiveLoading(true);
    const j = await post("initLive");
    if (j) setLive(j as MFLiveData);
    setLiveLoading(false);
  }, [post]);

  useEffect(() => { if (authed) refreshInit(); }, [authed, refreshInit]);

  const signIn = useCallback(async () => {
    if (!pw || busy) return;
    setBusy(true); setPwErr("");
    try {
      const r = await fetch(AUTH_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", password: pw }),
      });
      const j = await r.json();
      if (j?.ok) { setPw(""); setAuthed(true); }
      else setPwErr(j?.error || "Wrong password.");
    } catch { setPwErr("No connection. Try again."); }
    finally { setBusy(false); }
  }, [pw, busy]);

  const lock = useCallback(async () => {
    try {
      await fetch(AUTH_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } catch { /* locking locally is still correct */ }
    setAuthed(false); setInit(null); setLive(null);
  }, []);

  if (authed === null) {
    return <div className="mf-app" />;
  }

  if (!authed) {
    return (
      <div className="mf-app grid place-items-center px-6">
        <div className="w-full max-w-[360px]">
          <div className="mf-glass-btn mx-auto mb-5 grid h-14 w-14 place-items-center rounded-[18px] text-white">
            <span className="font-mf-mono text-[24px] font-medium">₹</span>
          </div>
          <h1 className="text-center text-[22px] font-bold tracking-[-0.01em] text-mf-ink">My Financials</h1>
          <p className="mb-6 mt-1 text-center text-[14px] text-mf-ink-3">Enter your password to continue.</p>
          <TextInput
            type="password" value={pw} autoFocus autoComplete="current-password" aria-label="Password"
            onChange={(e) => { setPw(e.target.value); setPwErr(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") signIn(); }}
            placeholder="Password"
          />
          {pwErr && <p role="alert" className="mt-2 px-1 text-[13px] font-medium text-mf-out">{pwErr}</p>}
          <Button size="lg" full className="mt-4" onClick={signIn} disabled={!pw} loading={busy} loadingText="Checking…">
            Sign in
          </Button>
        </div>
      </div>
    );
  }

  const withTabs = !tabBarHidden(pathname);
  return (
    <MFContext.Provider value={{ init, refreshInit, loading, live, loadLive, liveLoading, lock, showToast, post }}>
      <div className="mf-app" style={{ paddingBottom: withTabs ? "calc(88px + env(safe-area-inset-bottom))" : undefined }}>
        {children}
        <TabBar onLock={lock} />
        <ToastView toast={toast} />
      </div>
    </MFContext.Provider>
  );
}

// ── Groups → Heads → Sub-heads: one place for the rules every screen uses ──
export const DEFAULT_GROUPS: MFGroup[] = [
  { code: "PERSONAL", name: "Personal", is_library: false, sort: 10 },
  { code: "LIBRARY",  name: "Library",  is_library: true,  sort: 20 },
];
export const labelsOf = (init: MFInitData | null | undefined): MFLabels =>
  ({ group: "Group", head: "Head", subhead: "Sub-head", ...(init?.labels || {}) });
export const groupsOf = (init: MFInitData | null | undefined): MFGroup[] =>
  (init?.groups && init.groups.length ? init.groups : DEFAULT_GROUPS);
/** Heads of this kind in this group (a head with no group shows in every group). */
export const headsOf = (init: MFInitData | null | undefined, kind: "EXPENSE" | "INCOME", group: string): MFCategory[] =>
  (init?.categories || []).filter(c => c.kind === kind && !c.parent_id && (!c.group_code || c.group_code === group));
/** Sub-heads under one head. */
export const subsOf = (init: MFInitData | null | undefined, headId: number | null): MFCategory[] =>
  headId ? (init?.categories || []).filter(c => c.parent_id === headId) : [];

/** "+₹2,800 on its way · by 30 Sep" — money not in the bank yet (empty when there is none). */
export function laterText(a: Pick<MFAccount, "incoming" | "dated_later" | "lands_by">): string {
  const parts: string[] = [];
  const inc = Number(a.incoming || 0), later = Number(a.dated_later || 0);
  if (Math.abs(inc) >= 0.5) {
    const by = a.lands_by ? String(a.lands_by).slice(0, 10) : "";
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const d = by ? `${Number(by.slice(8, 10))} ${MON[Number(by.slice(5, 7)) - 1]}` : "";
    parts.push(`${inc > 0 ? "+" : "−"}${fmtMoney(Math.abs(inc))} on its way${d ? " · by " + d : ""}`);
  }
  if (Math.abs(later) >= 0.5) parts.push(`${later > 0 ? "+" : "−"}${fmtMoney(Math.abs(later))} dated later`);
  return parts.join(" · ");
}
