"use client";

// LMA shared shell:
//   1) Single password gate for everything under /lma
//   2) Single getInitData() fetch shared via React context (LMAProvider)
//   3) Pages call `useLMA()` to read libraries/branches/fees/shifts/etc.
//
// Result: switching tabs feels instant — no re-auth, no re-fetch.
// Mirrors the old admissions app's persistent single-page feel while
// keeping Next.js App Router routes (URLs still bookmarkable).
//
// NOTE: metadata/viewport export was removed from this file because
// `"use client"` files can't export those. If you need them back, put
// them in a sibling `app/lma/metadata.ts` or move them up to the root
// layout. The TechToolNav is preserved.

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import TechToolNav from "@/components/TechToolNav";

const API      = "/api/lma";
const PASSWORD = process.env.NEXT_PUBLIC_LMA_PASSWORD!;

// ── Types ──────────────────────────────────────────────────────────
// Superset of every shape used by individual pages. Pages destructure
// only what they need.
interface Library   { library_code:string; library_name?:string; display_name:string; active:boolean; has_branches:boolean; emoji:string; color?:string; }
interface Branch    { library_code:string; branch_code:string; branch_display:string; active:boolean; emoji?:string; color?:string; }
interface Shift     { shift_key:string; shift_name:string; shift_time:string; active:boolean; }
interface PaymentTag{ tag_name:string; fees_mode?:string; active:boolean; }
export interface LMAInitData {
  ok:boolean;
  libraries:Library[];
  branches:Branch[];
  shifts:Shift[];
  paymentTags:PaymentTag[];
  activeTags:string[];
  fees:Record<string,Record<string,number>>;
  settings:Record<string,Record<string,any>>;
}

interface LMAContextValue {
  init: LMAInitData | null;       // null until first load
  refreshInit: () => Promise<void>; // force re-fetch (e.g. after Settings edits)
  loading: boolean;               // true during the very first fetch only
  lock: () => void;               // sign out of LMA
}

const LMAContext = createContext<LMAContextValue | null>(null);

export function useLMA(): LMAContextValue {
  const v = useContext(LMAContext);
  if (!v) throw new Error("useLMA must be called inside <LMAProvider>");
  return v;
}

// ── Layout shell ───────────────────────────────────────────────────
export default function LmaLayout({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwErr, setPwErr]     = useState("");
  const [init, setInit]       = useState<LMAInitData|null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setHydrated(true);
    if (typeof window !== "undefined" && sessionStorage.getItem("lma_ok") === "1") {
      setUnlocked(true);
    }
  }, []);

  const refreshInit = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}?action=getInitData`).then(r => r.json());
      // Backend returns the fields directly (no `ok` flag); normalise it.
      const merged: LMAInitData = {
        ok: true,
        libraries:   r.libraries   || [],
        branches:    r.branches    || [],
        shifts:      r.shifts      || [],
        paymentTags: r.paymentTags || [],
        activeTags:  r.activeTags  || [],
        fees:        r.fees        || {},
        settings:    r.settings    || {},
      };
      setInit(merged);
    } catch (e) {
      // Keep prior init if a refresh fails so the UI stays usable.
      console.error("LMA init fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // First fetch when unlocked
  useEffect(() => {
    if (unlocked && !init) refreshInit();
  }, [unlocked, init, refreshInit]);

  const tryUnlock = () => {
    if (pwInput && pwInput === PASSWORD) {
      sessionStorage.setItem("lma_ok", "1");
      setUnlocked(true);
      setPwErr("");
    } else {
      setPwErr("Incorrect password.");
    }
  };
  const lock = () => {
    sessionStorage.removeItem("lma_ok");
    setUnlocked(false);
    setInit(null);
    setPwInput("");
  };

  if (!hydrated) return null;

  if (!unlocked) {
    return (
      <div className="lma-app">
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-7 lma-slide-up">
            <div className="text-center mb-5">
              <div className="text-4xl mb-2">🔒</div>
              <h1 className="text-xl font-extrabold text-lma-slate-900">LMA</h1>
              <p className="text-[11px] text-lma-slate-500 mt-1">Locate Library Management</p>
            </div>
            <input
              type="password"
              autoFocus
              value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwErr(""); }}
              onKeyDown={e => { if (e.key === "Enter") tryUnlock(); }}
              placeholder="Password"
              className="w-full px-4 py-3 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[15px] font-medium"
            />
            {pwErr && <p className="text-sm text-lma-danger mt-2 font-medium">{pwErr}</p>}
            <button
              onClick={tryUnlock}
              className="w-full mt-4 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold text-[15px] shadow-md"
            >
              Unlock
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <LMAContext.Provider value={{ init, refreshInit, loading, lock }}>
      <div className="lma-app">
        {children}
        <TechToolNav />
      </div>
    </LMAContext.Provider>
  );
}