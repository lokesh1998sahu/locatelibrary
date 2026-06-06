"use client";

// LMA shared shell (client):
//   1) Single password gate for everything under /lma
//   2) Single getInitData() fetch shared via React context (LMAProvider)
//   3) Pages call `useLMA()` to read libraries/branches/fees/shifts/etc.
//   4) Shared toast + post() + duplicate-action guard (was duplicated in every page)
//   5) Shared chip-builder hook `useScopeChips()` for the library/branch filter UI
//
// Result: switching tabs feels instant — no re-auth, no re-fetch. Toasts
// triggered on page A stay visible after navigating away.
//
// NOTE: This used to live in app/lma/layout.tsx. It was split out so the
// layout can be a pure SERVER component that exports `metadata` (manifest
// link) and `viewport.themeColor` (#6366f1 indigo) — a `"use client"` file
// can't export those. Pages import the hooks and types below directly from
// this module (e.g. `from "../_components/LMAProvider"`).

import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo, ReactNode } from "react";
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

export type ToastKind = "success"|"error";
export type ToastState = { msg:string; type:ToastKind } | null;

export interface ScopeChip { code:string; label:string; emoji?:string; color?:string; }

interface LMAContextValue {
  init: LMAInitData | null;       // null until first load
  refreshInit: () => Promise<void>; // force re-fetch (e.g. after Settings edits)
  loading: boolean;               // true during the very first fetch only
  lock: () => void;               // sign out of LMA
  // Shared toast (renders at layout level — persists across page navigation)
  showToast: (msg:string, type?:ToastKind) => void;
  // Shared POST helper (with duplicate-action guard + auto toast on backend error)
  post: (action:string, payload:any) => Promise<any | null>;
}

const LMAContext = createContext<LMAContextValue | null>(null);

export function useLMA(): LMAContextValue {
  const v = useContext(LMAContext);
  if (!v) throw new Error("useLMA must be called inside <LMAProvider>");
  return v;
}

// ── useScopeChips() ───────────────────────────────────────────────
// Builds the library/branch filter chips used by Board, Dashboard, Receipts,
// Renewals, Dues, MiscIncome, Refunds, Students.
// Options:
//   includeAll: true  → prefixes an "All" chip with code="" (default)
//   includeAll: false → no "All" chip (Board uses this; the chip list is
//                        mandatory-pick, never "all libraries").
// Returns [] until init has loaded.
export function useScopeChips(options?: { includeAll?: boolean }): ScopeChip[] {
  const { init } = useLMA();
  const includeAll = options?.includeAll !== false;
  return useMemo<ScopeChip[]>(() => {
    if (!init) return [];
    const out: ScopeChip[] = includeAll ? [{ code:"", label:"All" }] : [];
    init.libraries.filter(l => l.active).forEach(l => {
      if (l.has_branches) {
        init.branches
          .filter(b => b.library_code === l.library_code && b.active)
          .forEach(b => out.push({
            code:  b.branch_code,
            label: b.branch_code,
            emoji: b.emoji || l.emoji,
            color: b.color || l.color,
          }));
      } else {
        out.push({ code: l.library_code, label: l.library_code, emoji: l.emoji, color: l.color });
      }
    });
    return out;
  }, [init, includeAll]);
}

// ── Layout shell ───────────────────────────────────────────────────
export default function LMAProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwErr, setPwErr]     = useState("");
  const [init, setInit]       = useState<LMAInitData|null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast]     = useState<ToastState>(null);

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

  // ── Shared toast helper ─────────────────────────────────────────
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  const showToast = useCallback((msg: string, type: ToastKind = "success") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ msg, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Shared POST with duplicate-action guard ─────────────────────
  const inflightRef = useRef<Set<string>>(new Set());
  const post = useCallback(async (action: string, payload: any) => {
    const key = action + "|" + JSON.stringify(payload);
    if (inflightRef.current.has(key)) return null;
    inflightRef.current.add(key);
    try {
      try {
        const res = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action, payload }),
        }).then(r => r.json());
        if (!res.ok) {
          showToast(res.error || "Operation failed", "error");
          return null;
        }
        return res;
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e), "error");
        return null;
      }
    } finally {
      inflightRef.current.delete(key);
    }
  }, [showToast]);

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
    setToast(null);
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
    <LMAContext.Provider value={{ init, refreshInit, loading, lock, showToast, post }}>
      <div className="lma-app">
        {children}
        <TechToolNav />
        {/* Shared toast — renders once at layout level so it persists across page navigation */}
        {toast && (
          <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-lg z-50 lma-slide-up text-[14px] font-semibold ${toast.type==="error" ? "bg-lma-danger text-white" : "bg-lma-slate-900 text-white"}`}>
            {toast.msg}
          </div>
        )}
      </div>
    </LMAContext.Provider>
  );
}
