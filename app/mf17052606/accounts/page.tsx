"use client";

// MF 2.0 — Accounts & payment tags.
// An account is a real pot of money with a permanent code. Payment tags (routes
// in the database) are the ways money reaches it — a UPI QR, a card machine,
// cash in hand — listed inside each account's card. Tap an account or a tag to
// edit it in a bottom sheet.
//
// Codes are permanent by design: every receipt LMA has ever written is stamped
// with one, so renaming would detach the history. Names are yours to change.
// Moving a tag to another account only affects money recorded from then on.

import { useCallback, useEffect, useState } from "react";
import { useMF } from "../_components/MFProvider";
import {
  TopBar, Card, Amount, Button, Banner, Empty, Field, TextInput, Segmented, Sheet, Skeleton,
  SwitchRow, Stepper, inputCls, cx,
} from "../_ui/kit";
import { IconBank, IconChevron, IconPlus } from "../_ui/icons";
import { money, dateLong } from "../_ui/format";

type Route = {
  id: number; display_code: string; bank_code: string; settlement_days: number;
  active_lma: boolean; active_mf: boolean; description: string;
  use?: RouteUse;
};
type RouteUse = { n: number; last_used: string | null; month_net: number };
type Acct = {
  id: number; bank_code: string; bank_name: string; owner_name: string;
  acct_type: string; is_liability: boolean; active: boolean; quick: boolean;
  opening_balance: number | null; opening_date: string | null;
  history_rows: number; routes: Route[];
};
type Change = {
  id: number; at: string; action: string;
  old_bank_code: string | null; new_bank_code: string | null;
  old_settlement_days: number | null; new_settlement_days: number | null;
  old_active_lma: boolean | null; new_active_lma: boolean | null;
  old_active_mf: boolean | null; new_active_mf: boolean | null;
};
type SheetState = { kind: "acct"; id: number } | { kind: "tag"; id: number } | { kind: "new" } | null;

const TYPES = [
  { v: "BANK", label: "Bank" }, { v: "CASH", label: "Cash" },
  { v: "WALLET", label: "Wallet" }, { v: "CREDIT_CARD", label: "Card" },
];
const TYPE_LABEL: Record<string, string> = { BANK: "Bank", CASH: "Cash", WALLET: "Wallet", CREDIT_CARD: "Card" };
const CODE_OK = /^[A-Z0-9][A-Z0-9._-]*$/;   // same rule the server enforces
const cleanCode = (v: string) => v.toUpperCase().replace(/\s+/g, "");

const daysTxt = (d: number | null) => (d === null ? "—" : d === 0 ? "Same day" : d === 1 ? "Next day" : `${d} days`);
function useLine(u?: RouteUse): string {
  if (!u || u.n === 0) return "Not used in LMA yet";
  return `${u.month_net ? money(u.month_net) + " this month" : "Nothing this month"} · last used ${dateLong(u.last_used)}`;
}
function changeText(h: Change): string {
  if (h.action === "BASELINE") return `History started · lands in ${h.new_bank_code ?? "—"} · ${daysTxt(h.new_settlement_days).toLowerCase()}`;
  if (h.action === "CREATED") return `Created · lands in ${h.new_bank_code ?? "—"} · ${daysTxt(h.new_settlement_days).toLowerCase()}`;
  const parts: string[] = [];
  if (h.old_bank_code !== h.new_bank_code) parts.push(`Account ${h.old_bank_code ?? "—"} → ${h.new_bank_code ?? "—"}`);
  if (h.old_settlement_days !== h.new_settlement_days) parts.push(`Settles ${daysTxt(h.old_settlement_days).toLowerCase()} → ${daysTxt(h.new_settlement_days).toLowerCase()}`);
  if (h.old_active_lma !== h.new_active_lma) parts.push(`LMA ${h.new_active_lma ? "on" : "off"}`);
  if (h.old_active_mf !== h.new_active_mf) parts.push(`MF ${h.new_active_mf ? "on" : "off"}`);
  return parts.join(" · ") || "Changed";
}

export default function AccountsAndRoutes() {
  const { init, post, refreshInit } = useMF();
  const [rows, setRows] = useState<Acct[] | null>(null);   // null while loading
  const [sheet, setSheet] = useState<SheetState>(null);
  const [showOff, setShowOff] = useState(false);

  const load = useCallback(async () => {
    const j = await post("accountsTree");
    if (j) setRows(j.accounts ?? []);
    else setRows(r => r ?? []);
  }, [post]);
  useEffect(() => { load(); }, [load]);

  const after = async () => { await refreshInit(); await load(); };
  const close = () => setSheet(null);

  const all = rows ?? [];
  const on = all.filter(a => a.active);
  const off = all.filter(a => !a.active);
  const needOpening = on.filter(a => a.opening_date == null);
  const balanceOf = (id: number) => init?.accounts.find(x => x.id === id)?.balance ?? null;
  const acct = sheet?.kind === "acct" ? all.find(a => a.id === sheet.id) ?? null : null;
  const tag = sheet?.kind === "tag" ? all.flatMap(a => a.routes).find(r => r.id === sheet.id) ?? null : null;

  return (
    <div className="mx-auto w-full max-w-[560px] px-4">
      <TopBar title="Accounts" sub="Where money sits, and the tags it arrives by"
        right={<Button size="md" variant="secondary" className="h-10 px-3 text-[14px]" onClick={() => setSheet({ kind: "new" })}><IconPlus size={17} /> New</Button>} />

      {needOpening.length > 0 && (
        <Banner tone="warn" title={needOpening.length === 1 ? "1 account needs an opening balance" : `${needOpening.length} accounts need an opening balance`}>
          Until it has one, MF can’t show its balance. Tap the account and set it.
        </Banner>
      )}

      {rows === null ? (
        [0, 1, 2].map(i => (
          <Card key={i} className="mb-3"><Skeleton className="h-4 w-44" /><Skeleton className="mt-2 h-3 w-28" /><Skeleton className="mt-4 h-10 w-full" /></Card>
        ))
      ) : on.length === 0 ? (
        <Card><Empty icon={<IconBank size={22} />} title="No accounts yet" body="Add your banks, cash and cards. Each gets a short permanent code."
          action={<Button onClick={() => setSheet({ kind: "new" })}>Add an account</Button>} /></Card>
      ) : (
        on.map(a => (
          <AccountCard key={a.id} a={a} balance={balanceOf(a.id)}
            onOpen={() => setSheet({ kind: "acct", id: a.id })} onTag={id => setSheet({ kind: "tag", id })} />
        ))
      )}

      {off.length > 0 && (
        <>
          <button type="button" onClick={() => setShowOff(v => !v)}
            className="mf-noscale mb-3 mt-2 flex h-11 w-full items-center justify-center gap-1 text-[13.5px] font-semibold text-mf-ink-2">
            {showOff ? "Hide switched-off accounts" : `Show switched off (${off.length})`}
            <IconChevron size={16} className={cx("transition", showOff ? "-rotate-90" : "rotate-90")} />
          </button>
          {showOff && off.map(a => (
            <AccountCard key={a.id} a={a} balance={null} dim
              onOpen={() => setSheet({ kind: "acct", id: a.id })} onTag={id => setSheet({ kind: "tag", id })} />
          ))}
        </>
      )}

      <Sheet open={!!acct} onClose={close} title={acct ? acct.bank_name : ""}>
        {acct && <AccountForm key={acct.id} a={acct} rows={all} onDone={async () => { close(); await after(); }} />}
      </Sheet>
      <Sheet open={!!tag} onClose={close} title={tag ? tag.display_code : ""}>
        {tag && <TagForm key={tag.id} r={tag} accounts={all} onDone={async () => { close(); await after(); }} />}
      </Sheet>
      <Sheet open={sheet?.kind === "new"} onClose={close} title="New account">
        {sheet?.kind === "new" && <NewAccountForm rows={all} onDone={async () => { close(); await after(); }} />}
      </Sheet>
    </div>
  );
}

// ── one account and its tags ──
function AccountCard({ a, balance, dim, onOpen, onTag }: {
  a: Acct; balance: number | null; dim?: boolean; onOpen: () => void; onTag: (id: number) => void;
}) {
  return (
    <Card pad={false} className={cx("mb-3 overflow-hidden", dim && "opacity-60")}>
      <button type="button" onClick={onOpen} className="mf-noscale flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-mf-bg">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15.5px] font-semibold text-mf-ink">{a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-mf-ink-3">
            <span className="font-mf-mono">{a.bank_code}</span>
            <span>·</span><span>{TYPE_LABEL[a.acct_type] ?? a.acct_type}</span>
            {!a.active && <span className="rounded-full bg-mf-line px-2 py-px text-[11px] font-semibold text-mf-ink-2">Off</span>}
            {a.active && a.opening_date == null && <span className="rounded-full bg-mf-warn-soft px-2 py-px text-[11px] font-semibold text-mf-warn">No opening balance</span>}
          </div>
        </div>
        {balance != null && <Amount value={balance} tone={a.is_liability ? "out" : "plain"} className="text-[15px]" />}
        <IconChevron size={18} className="shrink-0 text-mf-ink-3" />
      </button>
      {a.routes.length > 0 ? (
        <div className="border-t border-mf-line">
          {a.routes.map((r, i) => (
            <button key={r.id} type="button" onClick={() => onTag(r.id)}
              className={cx("mf-noscale flex w-full items-center gap-3 bg-mf-bg/50 px-4 py-2.5 text-left active:bg-mf-line/50", i > 0 && "border-t border-mf-line")}>
              <div className="min-w-0 flex-1">
                <div className="font-mf-mono text-[13.5px] text-mf-ink">{r.display_code}</div>
                <div className="mt-0.5 truncate text-[11.5px] text-mf-ink-3">{useLine(r.use)}</div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Tiny>{daysTxt(r.settlement_days)}</Tiny>
                <Tiny on={r.active_lma}>LMA</Tiny>
                <Tiny on={r.active_mf}>MF</Tiny>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="border-t border-mf-line bg-mf-bg/50 px-4 py-2.5 text-[12px] text-mf-ink-3">No payment tags yet. Open the account to add one.</div>
      )}
    </Card>
  );
}

function Tiny({ children, on }: { children: React.ReactNode; on?: boolean }) {
  const neutral = on === undefined;
  return (
    <span className={cx("rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
      neutral ? "bg-mf-surface text-mf-ink-2 ring-1 ring-inset ring-mf-line" : on ? "mf-glass-btn text-white" : "bg-mf-line text-mf-ink-3 line-through")}>
      {children}
    </span>
  );
}

// ── edit an account (+ add a tag, switch off/on) ──
function AccountForm({ a, rows, onDone }: { a: Acct; rows: Acct[]; onDone: () => Promise<void> }) {
  const { post, showToast } = useMF();
  const [name, setName] = useState(a.bank_name);
  const [owner, setOwner] = useState(a.owner_name);
  const [type, setType] = useState(a.acct_type);
  const [bal, setBal] = useState(a.opening_balance == null ? "" : String(a.opening_balance));
  const [date, setDate] = useState(a.opening_date ?? "");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);

  // new tag
  const [code, setCode] = useState("");
  const [days, setDays] = useState(0);
  const [lma, setLma] = useState(true);
  const [rdesc, setRdesc] = useState("");

  const needsDate = bal !== "" && !date;   // the server refuses a balance without its date
  const allCodes = new Set(rows.flatMap(x => x.routes.map(r => r.display_code.toUpperCase())));
  const codeErr = !code ? "" : !CODE_OK.test(code) ? "Letters, numbers, dots and dashes only." : allCodes.has(code) ? `${code} already exists.` : "";

  const saveAcct = async () => {
    if (needsDate) return;
    setBusy(true);
    const j = await post("saveAccount", {
      id: a.id, bank_name: name, owner_name: owner, acct_type: type,
      opening_balance: bal === "" ? null : Number(bal),
      opening_date: date || null, active: a.active, quick: a.quick,
    });
    setBusy(false);
    if (j) { showToast("Saved"); await onDone(); }
  };

  const addRoute = async () => {
    if (!code.trim() || codeErr) return;
    setBusy(true);
    const j = await post("saveRoute", {
      display_code: code, bank_code: a.bank_code,
      settlement_days: Number(days || 0), active_lma: lma, active_mf: true, description: rdesc,
    });
    setBusy(false);
    if (j) { showToast(`${code} added`); await onDone(); }
  };

  const toggle = async () => {
    setBusy(true);
    const j = await post("toggleAccount", { id: a.id });
    setBusy(false);
    if (j) { showToast(j.active ? "Switched on" : "Switched off — history is untouched"); await onDone(); }
  };

  return (
    <div className="pb-2">
      <p className="mb-4 text-[12.5px] text-mf-ink-3">
        Code <span className="font-mf-mono text-mf-ink-2">{a.bank_code}</span> is permanent
        {a.history_rows > 0 ? ` — ${a.history_rows} history rows use it.` : "."}
      </p>

      <Field label="Name"><TextInput value={name} onChange={e => setName(e.target.value)} placeholder="Yes Bank" /></Field>
      <Field label="Owner"><TextInput value={owner} onChange={e => setOwner(e.target.value)} placeholder="GS" /></Field>
      <div className="mb-4">
        <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">Type</div>
        <Segmented value={type} onChange={setType} options={TYPES} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Opening balance">
          <input value={bal} inputMode="decimal" placeholder="0"
            onChange={e => setBal(e.target.value.replace(/[^0-9.\-]/g, ""))}
            className={cx(inputCls, "font-mf-mono")} />
        </Field>
        <Field label="True on" error={needsDate ? "Pick the date" : undefined}>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
        </Field>
      </div>
      <p className="-mt-2 mb-4 px-1 text-[12px] leading-relaxed text-mf-ink-3">
        From this date the balance counts every LMA collection and everything you record.
      </p>
      <Button size="lg" full loading={busy} loadingText="Saving…" disabled={needsDate} onClick={saveAcct}>Save account</Button>

      {/* add a payment tag */}
      <div className="mt-6 border-t border-mf-line pt-4">
        {!adding ? (
          <Button variant="secondary" full onClick={() => setAdding(true)}><IconPlus size={17} /> Add a payment tag</Button>
        ) : (
          <>
            <div className="mb-3 text-[15px] font-semibold text-mf-ink">New payment tag for {a.bank_code}</div>
            <Field label="Tag code" error={codeErr || undefined} hint="What LMA stamps on every receipt, so it can never change. e.g. GSP-UPI">
              <input value={code} placeholder="GSP-UPI" autoCapitalize="characters"
                onChange={e => setCode(cleanCode(e.target.value))} className={cx(inputCls, "font-mf-mono")} />
            </Field>
            <div className="mb-4 flex items-center justify-between gap-3 px-1">
              <div>
                <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">Reaches the bank</div>
                <div className="text-[12px] text-mf-ink-3">How long money on this tag takes</div>
              </div>
              <Stepper value={days} onChange={setDays} unit={daysTxt} />
            </div>
            <SwitchRow label="Offer in LMA" hint="Show this tag when taking fees in LMA" on={lma} onChange={setLma} last />
            <Field label="Note (optional)"><TextInput value={rdesc} onChange={e => setRdesc(e.target.value)} placeholder="e.g. Gaurav's UPI QR at the desk" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => { setAdding(false); setCode(""); setRdesc(""); }}>Cancel</Button>
              <Button loading={busy} loadingText="Adding…" disabled={!code || !!codeErr} onClick={addRoute}>Add tag</Button>
            </div>
          </>
        )}
      </div>

      {/* switch off / on */}
      <div className="mt-6 border-t border-mf-line pt-4">
        {a.active && confirmOff ? (
          <Banner tone="warn" title={`Switch ${a.bank_code} off?`}
            action={<div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirmOff(false)}>Keep it on</Button>
              <Button variant="danger" loading={busy} onClick={toggle}>Switch off</Button>
            </div>}>
            It and its tags disappear from both apps. History stays: balances, passbook and past reports still count it.
          </Banner>
        ) : (
          <Button variant="ghost" full disabled={busy} onClick={() => (a.active ? setConfirmOff(true) : toggle())}>
            {a.active ? "Switch this account off" : "Switch this account back on"}
          </Button>
        )}
      </div>
    </div>
  );
}

// ── edit a payment tag ──
function TagForm({ r, accounts, onDone }: { r: Route; accounts: Acct[]; onDone: () => Promise<void> }) {
  const { post, showToast } = useMF();
  const [bank, setBank] = useState(r.bank_code);
  const [days, setDays] = useState(r.settlement_days);
  const [lma, setLma] = useState(r.active_lma);
  const [mf, setMf] = useState(r.active_mf);
  const [desc, setDesc] = useState(r.description);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hist, setHist] = useState<Change[] | null>(null);
  const [histReady, setHistReady] = useState(true);

  useEffect(() => {
    let dead = false;
    post("routeHistory", { display_code: r.display_code }).then(j => {
      if (dead) return;
      if (j) { setHist(j.history ?? []); setHistReady(j.ready !== false); } else setHist([]);
    });
    return () => { dead = true; };
  }, [post, r.display_code]);

  const moving = bank !== r.bank_code;
  const target = accounts.find(a => a.bank_code === bank);
  const changed = moving || days !== r.settlement_days || lma !== r.active_lma
    || mf !== r.active_mf || desc.trim() !== (r.description || "").trim();
  const choices = accounts.filter(a => a.active || a.bank_code === r.bank_code);

  const save = async () => {
    if (!changed || busy || (moving && !sure)) return;
    setBusy(true);
    const j = await post("saveRoute", {
      id: r.id, bank_code: bank, settlement_days: Number(days || 0),
      active_lma: lma, active_mf: mf, description: desc,
    });
    setBusy(false);
    if (j) {
      showToast(moving ? `${r.display_code} now lands in ${bank}` : `${r.display_code} saved`);
      await onDone();
    }
  };

  return (
    <div className="pb-2">
      <p className="mb-4 text-[12.5px] text-mf-ink-3">{useLine(r.use)}</p>

      <Field label="Lands in">
        <select value={bank} onChange={e => { setBank(e.target.value); setSure(false); }} className={inputCls}>
          {choices.map(a => (
            <option key={a.bank_code} value={a.bank_code}>
              {a.bank_code} · {a.bank_name}{a.owner_name ? ` · ${a.owner_name}` : ""}{a.active ? "" : " (off)"}
            </option>
          ))}
        </select>
      </Field>

      {moving && (
        <Banner tone="warn" title={`Switch ${r.display_code} to ${bank}?`}>
          From the moment you save, new {r.display_code} payments land in {bank}
          {target ? ` (${target.bank_name}${target.owner_name ? " · " + target.owner_name : ""})` : ""}.
          Money already recorded stays in {r.bank_code}, because that is where it really went.
          To move one old payment, edit it in LMA and tap “Move”.
          {target && !target.opening_date && <span className="mt-1 block">{bank} has no opening balance yet, so MF can’t show its balance. Set it on that account.</span>}
          <label className="mt-2.5 flex cursor-pointer items-center gap-2.5 font-semibold">
            <input type="checkbox" checked={sure} onChange={e => setSure(e.target.checked)} className="h-5 w-5 accent-[#b42318]" />
            Yes, switch {r.display_code} to {bank}
          </label>
        </Banner>
      )}

      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div>
          <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">Reaches the bank</div>
          <div className="text-[12px] text-mf-ink-3">How long money on this tag takes</div>
        </div>
        <Stepper value={days} onChange={setDays} unit={daysTxt} />
      </div>
      <SwitchRow label="Offer in LMA" hint="Staff can pick it when taking fees" on={lma} onChange={setLma} />
      <SwitchRow label="Offer in MF" hint="You can pick it when recording here" on={mf} onChange={setMf} last />
      <Field label="Note"><TextInput value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Gaurav's UPI QR at the desk" /></Field>

      <Button size="lg" full loading={busy} loadingText="Saving…" disabled={!changed || (moving && !sure)} onClick={save}>
        {moving ? `Switch to ${bank}` : "Save tag"}
      </Button>

      <div className="mt-6 border-t border-mf-line pt-4">
        <div className="mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">Changes</div>
        {!histReady ? (
          <p className="px-1 text-[12.5px] text-mf-ink-3">History starts once the one-time setup SQL has been run.</p>
        ) : hist === null ? (
          <div className="space-y-2"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
        ) : hist.length === 0 ? (
          <p className="px-1 text-[12.5px] text-mf-ink-3">No changes recorded yet.</p>
        ) : (
          <ol className="space-y-2.5">
            {hist.map(h => (
              <li key={h.id} className="flex gap-3 px-1 text-[12.5px]">
                <span className="w-[92px] shrink-0 font-mf-mono text-mf-ink-3">{dateLong(h.at).replace(/ \d{4}$/, "")} {h.at.slice(11, 16)}</span>
                <span className="text-mf-ink-2">{changeText(h)}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ── new account ──
function NewAccountForm({ rows, onDone }: { rows: Acct[]; onDone: () => Promise<void> }) {
  const { post, showToast } = useMF();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [type, setType] = useState("BANK");
  const [busy, setBusy] = useState(false);
  const taken = new Set(rows.map(a => a.bank_code.toUpperCase()));
  const codeErr = !code ? "" : !CODE_OK.test(code) ? "Letters, numbers, dots and dashes only." : taken.has(code) ? `${code} already exists.` : "";
  const ok = !!code.trim() && !codeErr && !!name.trim() && !busy;

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("createAccount", { bank_code: code, bank_name: name, owner_name: owner, acct_type: type });
    setBusy(false);
    if (j) { showToast("Account added"); await onDone(); }
  };

  return (
    <div className="pb-2">
      <Field label="Code" error={codeErr || undefined} hint="Short and permanent, e.g. HDFC-KD. It links every rupee of history to this account.">
        <input value={code} placeholder="HDFC-KD" autoCapitalize="characters"
          onChange={e => setCode(cleanCode(e.target.value))} className={cx(inputCls, "font-mf-mono")} />
      </Field>
      <Field label="Name"><TextInput value={name} onChange={e => setName(e.target.value)} placeholder="HDFC Bank" /></Field>
      <Field label="Owner"><TextInput value={owner} onChange={e => setOwner(e.target.value)} placeholder="KD" /></Field>
      <div className="mb-5">
        <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">Type</div>
        <Segmented value={type} onChange={setType} options={TYPES} />
      </div>
      <Button size="lg" full disabled={!ok} loading={busy} loadingText="Adding…" onClick={save}>Add account</Button>
      <p className="mt-3 px-1 text-[12px] leading-relaxed text-mf-ink-3">Next: open it to set its opening balance, then add its payment tags.</p>
    </div>
  );
}
