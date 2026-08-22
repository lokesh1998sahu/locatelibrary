"use client";

// MF 2.0 shared shell (client):
//   1) Password gate for everything under /mf17052606. The password is verified
//      SERVER-SIDE (POST /api/mf17052606/auth); the session is a signed httpOnly
//      cookie. Nothing secret ships in the browser bundle.
//   2) One initData() fetch shared through React context.
//   3) Shared toast + post() helper with a duplicate-submit guard.
//   4) The design tokens for the whole app live here, once.
//
// Deliberately separate from LMA's provider: different cookie, different API,
// different look. Two apps, not one app with a hidden room.

import { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from "react";

const API = "/api/mf17052606";
const AUTH_API = API + "/auth";

export interface MFAccount {
  id: number; bank_code: string; bank_name: string; owner_name: string;
  acct_type: string; is_liability: boolean; is_set_up: boolean;
  opening_balance: number | null; opening_date: string | null; balance: number | null;
}
export interface MFCategory { id: number; code: string; name: string; kind: "EXPENSE" | "INCOME"; quick: boolean; }
export interface MFPerson   { id: number; name: string; quick: boolean; }
export interface MFRoute    { code: string; bank_code: string; settlement_days: number; }
export interface MFLibrary  { library_code: string; label: string; branch_code: string | null; branch_label: string | null; }
export interface MFInitData {
  accounts: MFAccount[];
  categories: MFCategory[];
  people: MFPerson[];
  routes: MFRoute[];
  libraries: MFLibrary[];
  totals: { haves: number; owes: number; net: number };
}

export type ToastKind = "success" | "error";
export type ToastState = { msg: string; type: ToastKind } | null;

interface MFContextValue {
  init: MFInitData | null;
  refreshInit: () => Promise<void>;
  loading: boolean;
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

export function money(n: number | null | undefined): string {
  if (n == null) return "—";
  const neg = n < 0;
  const s = Math.abs(Math.round(n)).toLocaleString("en-IN");
  return (neg ? "-₹" : "₹") + s;
}

export const TOKENS = `
:root{
  --mf-ink:#0f172a; --mf-ink-2:#475569; --mf-ink-3:#8a94a6;
  --mf-line:#e6e8ee; --mf-surface:#ffffff;
  --mf-have:#0f6e56; --mf-have-bg:#e1f5ee;
  --mf-owe:#993c1d;  --mf-owe-bg:#faece7;
  --mf-radius:12px;
  --mf-mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
}
*{box-sizing:border-box}
.mf-num{font-family:var(--mf-mono);font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.mf-tap{-webkit-tap-highlight-color:transparent;cursor:pointer;user-select:none;
  transition:transform .08s ease,background .12s ease}
.mf-tap:active{transform:scale(.985)}
.mf-card{background:var(--mf-surface);border:1px solid var(--mf-line);border-radius:var(--mf-radius)}
button:focus-visible,[role=button]:focus-visible,input:focus-visible{
  outline:2px solid var(--mf-have);outline-offset:2px}
@media (prefers-reduced-motion:reduce){.mf-tap{transition:none}.mf-tap:active{transform:none}}
`;

export default function MFProvider({ children }: { children: ReactNode }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [init, setInit] = useState<MFInitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const inflight = useRef<Set<string>>(new Set());
  const toastTimer = useRef<any>(null);

  const showToast = useCallback((msg: string, type: ToastKind = "success") => {
    setToast({ msg, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const post = useCallback(async (action: string, payload: any = {}) => {
    if (inflight.current.has(action)) return null;
    inflight.current.add(action);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      if (r.status === 401) { setAuthed(false); setInit(null); return null; }
      const j = await r.json();
      if (!j?.ok) { showToast(j?.error || "That didn't work.", "error"); return null; }
      return j;
    } catch {
      showToast("No connection. Try again.", "error");
      return null;
    } finally {
      inflight.current.delete(action);
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
    setAuthed(false); setInit(null);
  }, []);

  if (authed === null) {
    return (
      <>
        <style>{TOKENS}</style>
        <div className="lma-app lma-page-body" style={{ minHeight: "100dvh" }} />
      </>
    );
  }

  if (!authed) {
    return (
      <>
        <style>{TOKENS}</style>
        <div className="lma-app lma-page-body" style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24 }}>
          <div className="mf-card" style={{ width: "100%", maxWidth: 340, padding: 24 }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: "var(--mf-ink)" }}>My Financials</div>
            <div style={{ fontSize: 13, color: "var(--mf-ink-2)", marginTop: 4, marginBottom: 18 }}>
              Enter your password to continue.
            </div>
            <input
              type="password" value={pw} autoFocus
              onChange={(e) => { setPw(e.target.value); setPwErr(""); }}
              onKeyDown={(e) => { if (e.key === "Enter") signIn(); }}
              placeholder="Password"
              style={{
                width: "100%", height: 44, padding: "0 12px", fontSize: 16,
                border: "1px solid var(--mf-line)", borderRadius: 10, color: "var(--mf-ink)",
              }}
            />
            {pwErr && <div style={{ fontSize: 13, color: "var(--mf-owe)", marginTop: 8 }}>{pwErr}</div>}
            <button
              onClick={signIn} disabled={busy || !pw}
              style={{
                width: "100%", height: 44, marginTop: 14, border: "none", borderRadius: 10,
                background: pw ? "var(--mf-have)" : "var(--mf-line)",
                color: pw ? "var(--mf-have-bg)" : "var(--mf-ink-3)",
                fontSize: 15, fontWeight: 600, cursor: pw ? "pointer" : "default",
              }}
            >
              {busy ? "Checking…" : "Sign in"}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <MFContext.Provider value={{ init, refreshInit, loading, lock, showToast, post }}>
      <style>{TOKENS}</style>
      <div className="lma-app lma-page-body" style={{ minHeight: "100dvh", color: "var(--mf-ink)" }}>
        {children}
      </div>
      {toast && (
        <div
          role="status"
          style={{
            position: "fixed", left: 16, right: 16, bottom: 20, zIndex: 60,
            margin: "0 auto", maxWidth: 420, padding: "12px 14px", borderRadius: 10,
            background: toast.type === "error" ? "var(--mf-owe-bg)" : "var(--mf-have-bg)",
            color: toast.type === "error" ? "var(--mf-owe)" : "var(--mf-have)",
            fontSize: 14, textAlign: "center",
          }}
        >
          {toast.msg}
        </div>
      )}
    </MFContext.Provider>
  );
}