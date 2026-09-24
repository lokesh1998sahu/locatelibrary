"use client";

// LMA shared shell (client):
//   1) Single password gate for everything under /lma960805 — the password is
//      now verified SERVER-SIDE (POST /api/lma960805/auth) and the session is a
//      signed httpOnly cookie. Nothing secret ships in the browser bundle.
//   2) Single getInitData() fetch shared via React context (LMAProvider)
//   3) Pages call `useLMA()` to read libraries/branches/fees/shifts/etc.
//   4) Shared toast + post() + duplicate-action guard (was duplicated in every page)
//   5) Shared chip-builder hook `useScopeChips()` for the library/branch filter UI
//   6) The app frame: bottom tab bar + toast. Colours and the reusable parts
//      live in app/globals.css and ../_ui/kit.tsx.
//
// Result: switching tabs feels instant — no re-auth, no re-fetch. Toasts
// triggered on page A stay visible after navigating away.
//
// NOTE: This used to live in app/lma960805/layout.tsx. It was split out so the
// layout can be a pure SERVER component that exports `metadata` (manifest
// link) and `viewport.themeColor` (#6366f1 indigo) — a `"use client"` file
// can't export those. Pages import the hooks and types below directly from
// this module (e.g. `from "../_components/LMAProvider"`).

import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TabBar, ToastView, tabBarHidden, Button, TextInput } from "../_ui/kit";

const API      = "/api/lma960805";
const AUTH_API = API + "/auth";

// ── Types ──────────────────────────────────────────────────────────
// Superset of every shape used by individual pages. Pages destructure
// only what they need.
interface Library   { library_code:string; library_name?:string; display_name:string; active:boolean; has_branches:boolean; emoji:string; color?:string; }
interface Branch    { library_code:string; branch_code:string; branch_display:string; active:boolean; emoji?:string; color?:string; }
interface Shift     { shift_key:string; shift_name:string; shift_time:string; active:boolean; }
interface PaymentTag{ tag_name:string; fees_mode?:string; active:boolean; settlement_days?:number; } // C1
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
  // Shared confirm dialog (the app's own look — never the browser's popup).
  // Resolves true on the confirm button, false on cancel / tap outside.
  confirm: (o:ConfirmOpts) => Promise<boolean>;
}
export interface ConfirmOpts { title:string; body?:string; confirmLabel?:string; cancelLabel?:string; danger?:boolean }

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
  const [pwBusy, setPwBusy]   = useState(false);
  const [init, setInit]       = useState<LMAInitData|null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast]     = useState<ToastState>(null);
  const [ask, setAsk]         = useState<(ConfirmOpts & { resolve:(v:boolean)=>void }) | null>(null);
  const confirmDialog = useCallback((o:ConfirmOpts) => new Promise<boolean>(resolve => setAsk({ ...o, resolve })), []);
  const answer = (v:boolean) => { setAsk(a => { a?.resolve(v); return null; }); };
  const pathname = usePathname() || "";

  // Ask the SERVER whether the httpOnly session cookie is still valid.
  // (The cookie is httpOnly by design, so JS cannot read it directly.)
  useEffect(() => {
    let cancelled = false;
    fetch(AUTH_API, { cache: "no-store" })
      .then(r => r.json())
      .then(j => { if (!cancelled && j && j.authed) setUnlocked(true); })
      .catch(() => { /* treat any failure as "not signed in" */ })
      .finally(() => { if (!cancelled) setHydrated(true); });
    return () => { cancelled = true; };
  }, []);

  // Session died server-side (expired / logged out elsewhere / cookie cleared).
  // Drop straight back to the login screen instead of leaving a dead page.
  const handleUnauthorized = useCallback(() => {
    setUnlocked(false);
    setInit(null);
    setPwInput("");
    setPwErr("Session expired. Please sign in again.");
  }, []);

  const refreshInit = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}?action=getInitData`, { cache: "no-store" });
      if (res.status === 401) { handleUnauthorized(); return; }
      const r = await res.json();
      if (r && r.ok === false) {
        // Keep prior init so the UI stays usable.
        console.error("LMA init fetch failed:", r.error);
        return;
      }
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
  }, [handleUnauthorized]);

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
        const r = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify({ action, payload }),
        });
        if (r.status === 401) { handleUnauthorized(); return null; }
        const res = await r.json();
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
  }, [showToast, handleUnauthorized]);

  const tryUnlock = async () => {
    if (!pwInput || pwBusy) return;
    setPwBusy(true);
    setPwErr("");
    try {
      const r = await fetch(AUTH_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pwInput }),
      });
      const res = await r.json().catch(() => ({ ok: false }));
      if (r.ok && res.ok) {
        setUnlocked(true);
        setPwInput("");
        setPwErr("");
      } else {
        setPwErr(res.error || "Incorrect password.");
      }
    } catch (e) {
      setPwErr("Could not reach the server. Check your connection.");
    } finally {
      setPwBusy(false);
    }
  };

  const lock = useCallback(() => {
    // Clear the cookie server-side; the UI locks immediately either way.
    fetch(AUTH_API, { method: "DELETE" }).catch(() => {});
    setUnlocked(false);
    setInit(null);
    setPwInput("");
    setPwErr("");
    setToast(null);
  }, []);

  if (!hydrated) return null;

  if (!unlocked) {
    return (
      <div className="lma-app grid min-h-[100dvh] place-items-center px-6">
        <div className="w-full max-w-[360px]">
          <div className="lma-glass-btn mx-auto mb-5 grid h-14 w-14 place-items-center rounded-[18px] text-white">
            <span className="text-[24px]">🔒</span>
          </div>
          <h1 className="text-center text-[22px] font-bold tracking-[-0.01em] text-lma-ink">LMA</h1>
          <p className="mb-6 mt-1 text-center text-[14px] text-lma-ink-3">Locate Library Management</p>
          <TextInput
            type="password" autoFocus disabled={pwBusy} value={pwInput} aria-label="Password"
            autoComplete="current-password"
            onChange={e => { setPwInput(e.target.value); setPwErr(""); }}
            onKeyDown={e => { if (e.key === "Enter") tryUnlock(); }}
            placeholder="Password"
          />
          {pwErr && <p role="alert" className="mt-2 px-1 text-[13px] font-medium text-lma-out">{pwErr}</p>}
          <Button size="lg" full className="mt-4" onClick={tryUnlock} disabled={!pwInput} loading={pwBusy} loadingText="Signing in…">
            Unlock
          </Button>
        </div>
      </div>
    );
  }

  const withTabs = !tabBarHidden(pathname);
  return (
    <LMAContext.Provider value={{ init, refreshInit, loading, lock, showToast, post, confirm: confirmDialog }}>
      <div className="lma-app" style={{ paddingBottom: withTabs ? undefined : 0 }}>
        {children}
        <TabBar onLock={lock} />
        <ToastView toast={toast} />
        {ask && (
          <div className="fixed inset-0 z-[10060] flex items-center justify-center px-6" onClick={() => answer(false)}>
            <div className="lma-fade-in absolute inset-0 bg-[rgb(15_23_42/0.45)]"/>
            <div role="alertdialog" aria-modal="true" aria-label={ask.title}
              className="lma-sheet-up relative w-full max-w-sm rounded-[20px] bg-lma-surface p-5 shadow-lma-float" onClick={e => e.stopPropagation()}>
              <h4 className="mb-1 text-[16px] font-bold leading-snug text-lma-ink">{ask.title}</h4>
              {ask.body && <p className="mb-4 whitespace-pre-line text-[13px] leading-relaxed text-lma-ink-3">{ask.body}</p>}
              <div className={`grid grid-cols-2 gap-2 ${ask.body ? "" : "mt-4"}`}>
                <Button variant="secondary" className="whitespace-nowrap" onClick={() => answer(false)}>{ask.cancelLabel || "Cancel"}</Button>
                <Button variant={ask.danger ? "danger" : "primary"} className="whitespace-nowrap" onClick={() => answer(true)} autoFocus>{ask.confirmLabel || "OK"}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </LMAContext.Provider>
  );
}
