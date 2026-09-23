"use client";

// MF 2.0 — Set aside.
// Two things that look alike and behave oppositely, kept on separate tabs so
// they can never be confused:
//
//   Provisions — money you will owe later. Real ledger entries. Net worth
//                falls when you recognise one, and does not move again when
//                you pay it. No account is touched at set-aside time, so a
//                Check still balances.
//
//   Earmarks   — labels on money you already have. No entry, no line, no
//                effect on any balance. They only answer "what is free".

import { useCallback, useEffect, useState } from "react";
import { useMF, money } from "../_components/MFProvider";
import {
  TopBar, Card, Chip, ChipGroup, Segmented, Sheet, Button, Empty, Skeleton, Field, TextInput,
  AmountPad, DateChips, BASE, cx,
} from "../_ui/kit";
import { IconFolder, IconPlus, IconChevron } from "../_ui/icons";
import { shiftIso, dayLabel } from "../_ui/format";

type Prov = { id: number; name: string; balance: number };
type Mark = { id: number; name: string; amount: number; note: string; account_id: number | null; account_name: string | null };
type Tab = "PROV" | "MARK";
type Act = "SET_ASIDE" | "PAY" | "RELEASE";
type Acct = { id: number; bank_name: string; owner_name: string; balance?: number | null };

const ACTS: { k: Act; label: string; hint: string }[] = [
  { k: "SET_ASIDE", label: "Set aside more", hint: "Recognises the obligation. Net worth falls; no account moves." },
  { k: "PAY",       label: "Pay it",         hint: "Cash leaves an account and the provision clears. Net worth unchanged." },
  { k: "RELEASE",   label: "Not needed",     hint: "Cancels what was set aside. Net worth comes back up." },
];

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const daysAgo = (iso: string) =>
  Math.round((new Date(todayIso() + "T00:00:00").getTime() - new Date(iso + "T00:00:00").getTime()) / 86400000);
const keyRules = (s: string, k: string) => {
  if (k === "<") return s.slice(0, -1);
  if (k === "." && s.includes(".")) return s;
  if (s.replace(".", "").length >= 9) return s;
  return (s + k).replace(/^0(?=\d)/, "");
};

export default function SetAside() {
  const { post } = useMF();
  const [tab, setTab] = useState<Tab>("PROV");
  const [provs, setProvs] = useState<Prov[] | null>(null);
  const [provTotal, setProvTotal] = useState(0);
  const [marks, setMarks] = useState<Mark[] | null>(null);
  const [markTotal, setMarkTotal] = useState(0);

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([post("provisions"), post("earmarks")]);
    if (a) { setProvs(a.provisions ?? []); setProvTotal(a.total ?? 0); } else setProvs(p => p ?? []);
    if (b) { setMarks(b.earmarks ?? []); setMarkTotal(b.total ?? 0); } else setMarks(m => m ?? []);
  }, [post]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="mx-auto w-full max-w-[560px] px-4">
      <TopBar back={BASE} title="Set aside" sub="Provisions and earmarks" />
      <Segmented className="mb-4" value={tab} onChange={setTab}
        options={[{ v: "PROV", label: "Provisions" }, { v: "MARK", label: "Earmarks" }]} />

      {tab === "PROV"
        ? <Provisions rows={provs} total={provTotal} reload={load} />
        : <Earmarks rows={marks} total={markTotal} reload={load} />}
    </div>
  );
}

function TotalCard({ label, value, tone }: { label: string; value: number; tone?: "out" }) {
  return (
    <Card className="mb-3">
      <div className="text-[12.5px] text-mf-ink-2">{label}</div>
      <div className={cx("mt-1 font-mf-mono text-[27px] tracking-[-0.02em]", tone === "out" ? "text-mf-out" : "text-mf-ink")}>{money(value)}</div>
    </Card>
  );
}

function Loading() {
  return (
    <Card pad={false}>
      {[0, 1, 2].map(i => (
        <div key={i} className={cx("flex items-center gap-3 px-4 py-4", i < 2 && "border-b border-mf-line")}>
          <Skeleton className="h-4 flex-1" /><Skeleton className="h-4 w-16" />
        </div>
      ))}
    </Card>
  );
}

/* ── provisions ─────────────────────────────────────────────────────── */

function Provisions({ rows, total, reload }: { rows: Prov[] | null; total: number; reload: () => Promise<void> }) {
  const { init, post, showToast, refreshInit } = useMF();
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const list = rows ?? [];
  const open = openId != null ? list.find(r => r.id === openId) ?? null : null;

  const add = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    const j = await post("saveProvision", { name: newName });
    setBusy(false);
    if (j) { showToast("Added " + newName.trim()); setNewName(""); setAdding(false); await reload(); }
  };

  return (
    <>
      <p className="mb-3 px-1 text-[12.5px] leading-relaxed text-mf-ink-3">
        Money you will owe later — tax, a deposit to return, a repair you have committed to.
        Setting one aside lowers your net worth; your bank balance only moves when you actually pay it.
      </p>

      <TotalCard label="Set aside in total" value={total} tone="out" />

      {rows === null ? <Loading /> : list.length === 0 ? (
        <Card><Empty icon={<IconFolder size={22} />} title="Nothing set aside yet"
          body="Add one for anything you know is coming: tax, a deposit you hold, a promised repair." /></Card>
      ) : (
        <Card pad={false} className="overflow-hidden">
          {list.map((r, i) => (
            <button key={r.id} type="button" onClick={() => setOpenId(r.id)}
              className={cx("mf-noscale flex min-h-[54px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-mf-bg", i < list.length - 1 && "border-b border-mf-line")}>
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-mf-ink">{r.name}</span>
              <span className={cx("font-mf-mono text-[15px]", r.balance > 0 ? "text-mf-out" : "text-mf-ink-3")}>
                {r.balance === 0 ? "—" : money(r.balance)}
              </span>
              <IconChevron size={18} className="shrink-0 text-mf-ink-3" />
            </button>
          ))}
        </Card>
      )}

      <Button variant="secondary" full className="mt-4" onClick={() => setAdding(true)}>
        <IconPlus size={17} /> Add a provision
      </Button>

      <Sheet open={adding} onClose={() => setAdding(false)} title="New provision">
        <Field label="What for" hint="You set the amount afterwards, whenever you recognise it.">
          <TextInput value={newName} onChange={e => setNewName(e.target.value)} placeholder="Income tax" autoFocus
            onKeyDown={e => { if (e.key === "Enter") add(); }} />
        </Field>
        <Button size="lg" full disabled={!newName.trim()} loading={busy} loadingText="Adding…" onClick={add}>Add provision</Button>
      </Sheet>

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open ? open.name : ""}>
        {open && (
          <ProvForm key={open.id} r={open} accounts={init?.accounts.filter(a => !a.is_liability) ?? []}
            post={post} showToast={showToast}
            onDone={async () => { setOpenId(null); await refreshInit(); await reload(); }} />
        )}
      </Sheet>
    </>
  );
}

function ProvForm({ r, accounts, post, showToast, onDone }: {
  r: Prov;
  accounts: Acct[];
  post: (a: string, p?: any) => Promise<any | null>;
  showToast: (m: string, t?: "success" | "error") => void;
  onDone: () => Promise<void>;
}) {
  const [act, setAct] = useState<Act>(r.balance > 0 ? "PAY" : "SET_ASIDE");
  const [amountStr, setAmountStr] = useState(r.balance > 0 ? String(r.balance) : "");
  const [dateIso, setDateIso] = useState(todayIso);
  const [accountId, setAccountId] = useState<number | null>(accounts[0]?.id ?? null);
  const [busy, setBusy] = useState(false);

  const amount = Number(amountStr || 0);
  const needsAccount = act === "PAY";
  const ok = amount > 0 && (!needsAccount || !!accountId) && !busy;

  const go = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("provisionMove", {
      reserve_id: r.id, kind: act, amount, entry_date: dateIso,
      account_id: needsAccount ? accountId : null,
    });
    setBusy(false);
    if (j) { showToast("Recorded " + money(amount)); await onDone(); }
  };

  return (
    <div className="pb-2">
      <p className="mb-3 text-[12.5px] text-mf-ink-3">
        {r.balance > 0 ? `${money(r.balance)} set aside so far.` : "Nothing set aside yet."}
      </p>

      <ChipGroup label="What are you doing" hint={ACTS.find(a => a.k === act)?.hint}>
        {ACTS.map(a => <Chip key={a.k} on={act === a.k} onClick={() => setAct(a.k)}>{a.label}</Chip>)}
      </ChipGroup>

      <AmountPad value={amountStr} onKey={k => setAmountStr(s => keyRules(s, k))} />

      <DateChips value={dateIso} onChange={setDateIso} ago={daysAgo(dateIso)} label={dayLabel(dateIso)}
        today={todayIso()} yesterday={shiftIso(todayIso(), -1)} />

      {needsAccount && (
        <ChipGroup label="Paid from">
          {accounts.map(a => (
            <Chip key={a.id} on={accountId === a.id} onClick={() => setAccountId(a.id)}>
              {a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}
            </Chip>
          ))}
        </ChipGroup>
      )}

      <Button size="lg" full disabled={!ok} loading={busy} loadingText="Saving…" onClick={go}>
        Record{amount > 0 ? ` ${money(amount)}` : " it"}
      </Button>
    </div>
  );
}

/* ── earmarks ───────────────────────────────────────────────────────── */

function Earmarks({ rows, total, reload }: { rows: Mark[] | null; total: number; reload: () => Promise<void> }) {
  const { init, post, showToast } = useMF();
  const [edit, setEdit] = useState<Mark | null | "new">(null);
  const accounts = init?.accounts.filter(a => !a.is_liability && a.is_set_up) ?? [];
  const list = rows ?? [];

  return (
    <>
      <p className="mb-3 px-1 text-[12.5px] leading-relaxed text-mf-ink-3">
        Labels on money you already have. Nothing is recorded and no balance changes — they only
        tell you how much of a balance is already spoken for.
      </p>

      <TotalCard label="Spoken for" value={total} />

      {rows === null ? <Loading /> : list.length === 0 ? (
        <Card><Empty icon={<IconFolder size={22} />} title="Nothing earmarked"
          body="Label money that is already promised, so you can see what is really free." /></Card>
      ) : (
        <Card pad={false} className="overflow-hidden">
          {list.map((m, i) => {
            const acct = accounts.find(a => a.id === m.account_id);
            const free = acct && acct.balance != null ? acct.balance - m.amount : null;
            return (
              <button key={m.id} type="button" onClick={() => setEdit(m)}
                className={cx("mf-noscale flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-mf-bg", i < list.length - 1 && "border-b border-mf-line")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-mf-ink">{m.name}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-mf-ink-3">
                    {m.account_name ?? "Any account"}{free != null ? ` · ${money(free)} free there` : ""}
                  </span>
                </span>
                <span className="font-mf-mono text-[15px] text-mf-ink">{money(m.amount)}</span>
                <IconChevron size={18} className="shrink-0 text-mf-ink-3" />
              </button>
            );
          })}
        </Card>
      )}

      <Button variant="secondary" full className="mt-4" onClick={() => setEdit("new")}>
        <IconPlus size={17} /> Add an earmark
      </Button>

      <Sheet open={!!edit} onClose={() => setEdit(null)} title={edit === "new" ? "New earmark" : edit ? edit.name : ""}>
        {edit && (
          <MarkForm key={edit === "new" ? "new" : edit.id} row={edit === "new" ? null : edit} accounts={accounts}
            post={post} showToast={showToast}
            onDone={async () => { setEdit(null); await reload(); }} />
        )}
      </Sheet>
    </>
  );
}

function MarkForm({ row, accounts, post, showToast, onDone }: {
  row: Mark | null;
  accounts: Acct[];
  post: (a: string, p?: any) => Promise<any | null>;
  showToast: (m: string, t?: "success" | "error") => void;
  onDone: () => Promise<void>;
}) {
  const [name, setName] = useState(row?.name ?? "");
  const [amountStr, setAmountStr] = useState(row ? String(row.amount) : "");
  const [accountId, setAccountId] = useState<number | null>(row?.account_id ?? null);
  const [busy, setBusy] = useState(false);
  const [confirmDrop, setConfirmDrop] = useState(false);

  const amount = Number(amountStr || 0);
  const ok = !!name.trim() && amount > 0 && !busy;

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("saveEarmark", row
      ? { id: row.id, name, amount, account_id: accountId, note: row.note }
      : { name, amount, account_id: accountId });
    setBusy(false);
    if (j) { showToast(row ? "Saved" : "Earmarked " + money(amount)); await onDone(); }
  };

  const drop = async () => {
    if (!row) return;
    setBusy(true);
    const j = await post("removeEarmark", { id: row.id });
    setBusy(false);
    if (j) { showToast("Removed"); await onDone(); }
  };

  return (
    <div className="pb-2">
      <Field label="What for">
        <TextInput value={name} onChange={e => setName(e.target.value)} placeholder="Staff bonus" autoFocus={!row} />
      </Field>

      <AmountPad value={amountStr} onKey={k => setAmountStr(s => keyRules(s, k))} />

      <ChipGroup label="Sitting in">
        <Chip on={accountId === null} onClick={() => setAccountId(null)}>Any account</Chip>
        {accounts.map(a => <Chip key={a.id} on={accountId === a.id} onClick={() => setAccountId(a.id)}>{a.bank_name}</Chip>)}
      </ChipGroup>

      <Button size="lg" full disabled={!ok} loading={busy} loadingText="Saving…" onClick={save}>
        {row ? "Save" : "Add earmark"}
      </Button>

      {row && (
        <div className="mt-4 border-t border-mf-line pt-4">
          {confirmDrop ? (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirmDrop(false)}>Keep it</Button>
              <Button variant="danger" loading={busy} onClick={drop}>Remove</Button>
            </div>
          ) : (
            <Button variant="ghost" full onClick={() => setConfirmDrop(true)}>Remove this earmark</Button>
          )}
          <p className="mt-2 px-1 text-center text-[12px] text-mf-ink-3">Removing changes no balance — it only drops the label.</p>
        </div>
      )}
    </div>
  );
}
