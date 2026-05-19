"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

const API = "/api/lma";
const PASSWORD = process.env.NEXT_PUBLIC_LMA_PASSWORD!;

// ── TYPES ─────────────────────────────────────────────────────────
interface Library    { library_code:string; library_name:string; display_name:string; active:boolean; has_branches:boolean; emoji:string; color?:string; }
interface Branch     { library_code:string; branch_code:string; branch_display:string; active:boolean; emoji?:string; color?:string; }
interface Shift      { shift_key:string; shift_name:string; shift_time:string; active:boolean; }
interface PaymentTag { tag_name:string; fees_mode:string; active:boolean; created_at:string; }
interface LibSettings { library:string; last_student_id:number; last_receipt_no:number; cutoff_student_id:number; cutoff_receipt_no:number; renewal_alert_days:number; }
interface InitData   { ok:boolean; libraries:Library[]; branches:Branch[]; fees:Record<string,Record<string,number>>; shifts:Shift[]; paymentTags:PaymentTag[]; activeTags:string[]; settings:Record<string,LibSettings>; }
interface PingData   { ok:boolean; app?:string; version?:string; timezone?:string; server_time?:string; error?:string; }

// ── NAVIGATION CARDS ──────────────────────────────────────────────
const NAV: { href:string; label:string; emoji:string; desc:string; ready:boolean }[] = [
  { href:"/lma/admissions",  label:"Admissions",   emoji:"📝", desc:"New + renewal receipts",       ready:false },
  { href:"/lma/students",    label:"Students",     emoji:"👥", desc:"Browse + edit students",       ready:false },
  { href:"/lma/receipts",    label:"Receipts",     emoji:"🧾", desc:"All receipts log",             ready:false },
  { href:"/lma/dues",        label:"Dues",         emoji:"💰", desc:"Pending + irrecoverable",      ready:false },
  { href:"/lma/renewals",    label:"Renewals",     emoji:"🔁", desc:"Expiring + cancellations",     ready:false },
  { href:"/lma/misc-income", label:"Misc Income",  emoji:"💵", desc:"Day-pass, locker, xerox",      ready:false },
  { href:"/lma/dashboard",   label:"Dashboard",    emoji:"📊", desc:"Revenue + analytics",          ready:false },
  { href:"/lma/board",       label:"Seat Chart",   emoji:"🪑", desc:"Visual seat map (Phase 8)",    ready:false },
  { href:"/lma/settings",    label:"Settings",     emoji:"⚙️", desc:"Libraries, shifts, tags, fees", ready:false },
];

// ── PAGE ──────────────────────────────────────────────────────────
export default function LmaHomePage() {
  const [unlocked, setUnlocked] = useState(false);
  const [pwInput, setPwInput] = useState("");
  const [pwErr, setPwErr] = useState("");

  const [ping, setPing] = useState<PingData | null>(null);
  const [init, setInit] = useState<InitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState("");

  // ── Unlock from sessionStorage on mount ──
  useEffect(() => {
    if (typeof window !== "undefined" && sessionStorage.getItem("lma_ok") === "1") {
      setUnlocked(true);
    }
  }, []);

  const tryUnlock = () => {
    if (pwInput && pwInput === PASSWORD) {
      sessionStorage.setItem("lma_ok", "1");
      setUnlocked(true);
      setPwErr("");
    } else {
      setPwErr("Incorrect password.");
    }
  };

  // ── Fetch backend health + init data ──
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setLoadErr("");
    try {
      const [pingRes, initRes] = await Promise.all([
        fetch(`${API}?action=ping`).then(r => r.json()),
        fetch(`${API}?action=getInitData`).then(r => r.json()),
      ]);
      setPing(pingRes);
      setInit(initRes);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (unlocked) fetchAll();
  }, [unlocked, fetchAll]);

  // ── PASSWORD GATE ──
  if (!unlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg p-7 lma-slide-up">
          <div className="text-center mb-5">
            <div className="text-4xl mb-2">📚</div>
            <h1 className="text-xl font-extrabold text-lma-slate-900">LMA</h1>
            <p className="text-sm text-lma-slate-500 mt-1">Library Management App</p>
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
            className="w-full mt-4 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold text-[15px] shadow-md hover:shadow-lg active:scale-[0.98] transition"
          >
            Unlock
          </button>
        </div>
      </div>
    );
  }

  // ── MAIN ──
  const isHealthy = ping?.ok && init?.ok;

  return (
    <div className="lma-page-body max-w-md mx-auto px-4 pt-5">
      {/* Header */}
      <header className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-lma-slate-900">LMA</h1>
          <p className="text-xs text-lma-slate-500 font-medium">Library Management</p>
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="text-xs font-bold px-3 py-2 rounded-lg bg-lma-slate-100 text-lma-slate-600 hover:bg-lma-slate-200 disabled:opacity-50"
        >
          {loading ? "..." : "↻ Refresh"}
        </button>
      </header>

      {/* Backend Health Card */}
      <section className="bg-white rounded-2xl shadow-sm p-4 mb-4 lma-slide-up">
        <div className="flex items-center gap-2 mb-3">
          <span className={`w-2.5 h-2.5 rounded-full ${isHealthy ? "bg-lma-accent" : "bg-lma-danger"}`}></span>
          <h2 className="text-sm font-bold text-lma-slate-900">
            Backend Status: {isHealthy ? "Connected" : (loading ? "Checking..." : "Disconnected")}
          </h2>
        </div>
        {loadErr && (
          <div className="text-xs text-lma-danger bg-red-50 rounded-lg p-2 mb-2">{loadErr}</div>
        )}
        {ping && (
          <div className="text-xs text-lma-slate-600 font-mono space-y-0.5">
            <div>v{ping.version} · {ping.timezone}</div>
            <div className="text-lma-slate-400">Server: {ping.server_time}</div>
          </div>
        )}
      </section>

      {/* Seeded Data Snapshot */}
      {init && init.ok && (
        <section className="bg-white rounded-2xl shadow-sm p-4 mb-4 lma-slide-up">
          <h2 className="text-sm font-bold text-lma-slate-900 mb-3">Reference Data</h2>
          <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
            <Stat label="Libraries"     value={init.libraries.length} />
            <Stat label="Branches"      value={init.branches.length} />
            <Stat label="Shifts"        value={init.shifts.length} />
            <Stat label="Payment Tags"  value={`${init.activeTags.length}/${init.paymentTags.length}`} />
          </div>
          <div className="space-y-1.5">
            {init.libraries.map(lib => (
              <div key={lib.library_code} className="flex items-center justify-between bg-lma-slate-50 rounded-lg px-3 py-2">
                <span className="flex items-center gap-2">
                  <span className="text-base">{lib.emoji}</span>
                  <span className="text-sm font-bold text-lma-slate-800">{lib.library_code}</span>
                  <span className="text-xs text-lma-slate-500">{lib.display_name}</span>
                </span>
                {lib.has_branches && (
                  <span className="text-[10px] font-bold text-lma-primary bg-lma-primary/10 px-1.5 py-0.5 rounded">
                    {init.branches.filter(b => b.library_code === lib.library_code).length} branches
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Navigation Grid */}
      <section className="lma-slide-up">
        <h2 className="text-sm font-bold text-lma-slate-600 mb-2 px-1">App Sections</h2>
        <div className="grid grid-cols-2 gap-2.5">
          {NAV.map(nav => (
            <Link
              key={nav.href}
              href={nav.href}
              className={`bg-white rounded-2xl p-3.5 shadow-sm hover:shadow-md transition active:scale-[0.98] ${nav.ready ? "" : "opacity-60"}`}
            >
              <div className="text-2xl mb-1.5">{nav.emoji}</div>
              <div className="text-sm font-bold text-lma-slate-900">{nav.label}</div>
              <div className="text-[11px] text-lma-slate-500 leading-tight mt-0.5">{nav.desc}</div>
              {!nav.ready && (
                <div className="text-[10px] text-lma-warn font-bold mt-1">Coming soon</div>
              )}
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center text-[11px] text-lma-slate-400 mt-6 font-medium">
        v{ping?.version || "?"} · Tap to expand any section
      </footer>
    </div>
  );
}

// ── COMPONENTS ────────────────────────────────────────────────────
function Stat({ label, value }: { label:string; value:string|number }) {
  return (
    <div className="bg-lma-slate-50 rounded-lg p-2.5">
      <div className="text-[10px] text-lma-slate-500 font-semibold uppercase tracking-wide">{label}</div>
      <div className="text-lg font-extrabold text-lma-slate-900 mt-0.5">{value}</div>
    </div>
  );
}