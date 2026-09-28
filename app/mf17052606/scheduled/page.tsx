"use client";

// MF 2.0 — Scheduled payments: rent, EMIs, bills, and payments you make for others.
// A schedule reminds; it never records itself. Each payment you confirm is one
// entry: the full amount leaves the account, your part is your expense and each
// other person's part is money lent to them (they owe it back). The split set on
// the schedule is only the default — every payment can change the amount and
// the split. Prepay any amount (the schedule keeps running), foreclose (a final
// payment closes it) or cancel (closes with no payment); closed ones can reopen.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMF, money, groupsOf, headsOf, subsOf, labelsOf } from "../_components/MFProvider";
import QuickAdd from "../_components/QuickAdd";
import {
  TopBar, Card, Chip, ChipGroup, Sheet, Button, Empty, Skeleton, Field, TextInput, SectionTitle,
  AmountPad, DateChips, inputCls, BASE, cx,
} from "../_ui/kit";
import { IconRepeat, IconPlus, IconChevron } from "../_ui/icons";
import { shiftIso, dayLabel, dateLong } from "../_ui/format";

type Share = {
  kind: "ME" | "PERSON"; amount: number;
  group?: string; head_id?: number | null; subhead_id?: number | null;
  library_code?: string | null; branch_code?: string | null; person_id?: number | null;
  label?: string; head_name?: string | null; subhead_name?: string | null; group_name?: string | null;
};
type Pay = { entry_id: number; on: string; amount: number; part: "INSTALMENT" | "PREPAY" | "FORECLOSE" };
type Sched = {
  id: number; name: string; amount: number; note: string;
  account_id: number | null; account_name: string | null;
  frequency: string; next_due: string; days_away: number;
  installments_total: number | null; installments_paid: number; remaining: number | null;
  status: "ACTIVE" | "CLOSED"; closed_reason: string | null; closed_on: string | null;
  shares: Share[]; paid_total: number; payments: Pay[];
};
type Part = "INSTALMENT" | "PREPAY" | "FORECLOSE";

const FREQ = [
  { v: "MONTHLY", label: "Monthly" }, { v: "WEEKLY", label: "Weekly" },
  { v: "QUARTERLY", label: "Quarterly" }, { v: "YEARLY", label: "Yearly" },
  { v: "ONE_OFF", label: "One-off" },
];
const PART_LABEL: Record<Part, string> = { INSTALMENT: "Instalment", PREPAY: "Prepayment", FORECLOSE: "Foreclosure" };
const REASON: Record<string, string> = { FINISHED: "All paid", FORECLOSED: "Foreclosed", CANCELLED: "Cancelled" };

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
const r2 = (n: number) => Math.round(n * 100) / 100;
const sumOf = (xs: Share[]) => r2(xs.reduce((a, x) => a + (Number(x.amount) || 0), 0));
/** Same proportions at a new total; rounding goes to the first share. */
function scale(xs: Share[], total: number): Share[] {
  const s = sumOf(xs);
  if (!xs.length || s <= 0 || total <= 0) return xs;
  const out = xs.map(x => ({ ...x, amount: r2((x.amount / s) * total) }));
  out[0] = { ...out[0], amount: r2(out[0].amount + (total - sumOf(out))) };
  return out;
}
const iso10 = (v: string | null | undefined) => String(v ?? "").slice(0, 10);
const strip = (xs: Share[]) => xs.map(({ label, head_name, subhead_name, group_name, ...x }) => x);

function dueText(d: number): { text: string; urgent: boolean } {
  if (d < 0) return { text: `${-d} day${d === -1 ? "" : "s"} overdue`, urgent: true };
  if (d === 0) return { text: "due today", urgent: true };
  if (d === 1) return { text: "due tomorrow", urgent: true };
  if (d <= 7) return { text: `in ${d} days`, urgent: true };
  return { text: `in ${d} days`, urgent: false };
}
const splitText = (xs: Share[]) =>
  xs.length === 1 && xs[0].kind === "ME" ? "" : xs.map(x => `${x.label ?? (x.kind === "ME" ? "You" : "Someone")} ${money(x.amount)}`).join(" · ");

export default function Schedules() {
  const { post, showToast, refreshInit } = useMF();
  const [rows, setRows] = useState<Sched[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [mode, setMode] = useState<"VIEW" | "EDIT" | Part>("VIEW");
  const [adding, setAdding] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const j = await post("schedules");
    if (j) setRows(j.schedules ?? []);
    else setRows(r => r ?? []);
  }, [post]);
  useEffect(() => { load(); }, [load]);

  const list = rows ?? [];
  const active = list.filter(s => s.status === "ACTIVE");
  const closed = list.filter(s => s.status === "CLOSED");
  const open = openId != null ? list.find(s => s.id === openId) ?? null : null;
  const groups: { title: string; items: Sched[] }[] = [
    { title: "Overdue", items: active.filter(s => s.days_away < 0) },
    { title: "Due soon", items: active.filter(s => s.days_away >= 0 && s.days_away <= 7) },
    { title: "Later", items: active.filter(s => s.days_away > 7) },
  ];
  const close = () => { setOpenId(null); setMode("VIEW"); };
  const after = async (msg: string) => { showToast(msg); await refreshInit(); await load(); };
  const act = async (action: string, payload: any, msg: string) => {
    setBusy(true);
    const j = await post(action, payload);
    setBusy(false);
    if (j) { close(); await after(msg); }
  };

  const rowOf = (s: Sched, last: boolean) => {
    const d = dueText(s.days_away);
    const sp = splitText(s.shares);
    return (
      <button key={s.id} type="button" onClick={() => { setOpenId(s.id); setMode("VIEW"); }}
        className={cx("mf-noscale flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-mf-bg", !last && "border-b border-mf-line")}>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-medium text-mf-ink">{s.name}</span>
          <span className={cx("mt-0.5 block truncate text-[12px]", s.status === "ACTIVE" && d.urgent ? "font-semibold text-mf-out" : "text-mf-ink-3")}>
            {s.status === "ACTIVE"
              ? <>{d.text}{s.remaining != null ? ` · ${s.remaining} left` : ""}{s.account_name ? ` · ${s.account_name}` : ""}</>
              : <>{REASON[s.closed_reason ?? ""] ?? "Closed"}{s.closed_on ? ` on ${dateLong(iso10(s.closed_on))}` : ""} · paid {money(s.paid_total)}</>}
          </span>
          {sp && <span className="mt-0.5 block truncate text-[11.5px] text-mf-ink-3">{sp}</span>}
        </span>
        <span className="font-mf-mono text-[15px] text-mf-ink">{money(s.amount)}</span>
        <IconChevron size={18} className="shrink-0 text-mf-ink-3" />
      </button>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[560px] px-4">
      <TopBar back={BASE} title="Scheduled" sub="Rent, EMIs, bills — yours or for others"
        right={<Button size="md" variant="secondary" className="h-10 px-3 text-[14px]" onClick={() => setAdding(true)}><IconPlus size={17} /> New</Button>} />

      {rows === null ? (
        <Card pad={false}>
          {[0, 1, 2].map(i => (
            <div key={i} className={cx("flex items-center gap-3 px-4 py-4", i < 2 && "border-b border-mf-line")}>
              <div className="flex-1"><Skeleton className="h-4 w-36" /><Skeleton className="mt-2 h-3 w-24" /></div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </Card>
      ) : active.length === 0 && closed.length === 0 ? (
        <Card>
          <Empty icon={<IconRepeat size={22} />} title="Nothing scheduled"
            body="Add rent, an EMI, a bill — or something you pay for someone else. It reminds you, and records only when you confirm."
            action={<Button onClick={() => setAdding(true)}>Add a schedule</Button>} />
        </Card>
      ) : (
        <>
          {groups.filter(g => g.items.length > 0).map(g => (
            <div key={g.title}>
              <SectionTitle>{g.title}</SectionTitle>
              <Card pad={false} className="overflow-hidden">
                {g.items.map((s, i) => rowOf(s, i === g.items.length - 1))}
              </Card>
            </div>
          ))}
          {active.length === 0 && <Card className="mt-3"><p className="text-[13.5px] text-mf-ink-3">Nothing running right now.</p></Card>}
          {closed.length > 0 && (
            <>
              <button type="button" onClick={() => setShowClosed(v => !v)} aria-expanded={showClosed}
                className="mt-5 flex w-full items-center justify-between px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">
                <span>Closed · {closed.length}</span><span className="normal-case tracking-normal">{showClosed ? "Hide" : "Show"}</span>
              </button>
              {showClosed && (
                <Card pad={false} className="mt-2 overflow-hidden">
                  {closed.map((s, i) => rowOf(s, i === closed.length - 1))}
                </Card>
              )}
            </>
          )}
        </>
      )}

      <Sheet open={!!open} onClose={close}
        title={open ? (mode === "VIEW" ? open.name : mode === "EDIT" ? `Edit ${open.name}` : `${PART_LABEL[mode as Part]} · ${open.name}`) : ""}>
        {open && mode === "VIEW" && (
          <ScheduleView s={open} busy={busy}
            onPart={p => setMode(p)} onEdit={() => setMode("EDIT")}
            onCancelSchedule={() => act("closeSchedule", { id: open.id, on: todayIso() }, `${open.name} cancelled`)}
            onReopen={() => act("reopenSchedule", { id: open.id }, `${open.name} reopened`)} />
        )}
        {open && (mode === "INSTALMENT" || mode === "PREPAY" || mode === "FORECLOSE") && (
          <PayForm key={open.id + mode} s={open} part={mode} busy={busy}
            onBack={() => setMode("VIEW")}
            onPay={async payload => {
              setBusy(true);
              const j = await post("paySchedule", { id: open.id, part: mode, ...payload });
              setBusy(false);
              if (j) {
                close();
                await after(mode === "FORECLOSE" ? `${open.name} foreclosed` : mode === "PREPAY" ? `Prepaid ${money(j.total)}`
                  : j.finished ? `${open.name} — last one, done` : `Recorded ${money(j.total)}`);
              }
            }} />
        )}
        {open && mode === "EDIT" && (
          <ScheduleForm key={"e" + open.id} row={open} onDone={async () => { close(); await after("Saved"); }} onBack={() => setMode("VIEW")} />
        )}
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="New schedule">
        {adding && <ScheduleForm row={null} onDone={async () => { setAdding(false); await after("Schedule added"); }} />}
      </Sheet>
    </div>
  );
}

// ── one schedule: what it is, what's been paid, and what you can do ──
function ScheduleView({ s, busy, onPart, onEdit, onCancelSchedule, onReopen }: {
  s: Sched; busy: boolean; onPart: (p: Part) => void; onEdit: () => void; onCancelSchedule: () => void; onReopen: () => void;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const running = s.status === "ACTIVE";
  return (
    <div className="pb-2">
      <Card className="mb-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-mf-ink-3">{running ? "Each instalment" : "Was"}</span>
          <span className="font-mf-mono text-[22px] text-mf-ink">{money(s.amount)}</span>
        </div>
        <div className="mt-1 text-[12.5px] text-mf-ink-3">
          {running
            ? <>Next due {dateLong(iso10(s.next_due))} ({dueText(s.days_away).text}) · {FREQ.find(f => f.v === s.frequency)?.label ?? s.frequency}</>
            : <>{REASON[s.closed_reason ?? ""] ?? "Closed"}{s.closed_on ? ` on ${dateLong(iso10(s.closed_on))}` : ""}</>}
        </div>
        <div className="mt-1 text-[12.5px] text-mf-ink-3">
          {s.installments_paid}{s.installments_total != null ? ` of ${s.installments_total}` : ""} instalments paid · {money(s.paid_total)} so far
          {s.account_name ? ` · from ${s.account_name}` : ""}
        </div>
        <div className="mt-3 space-y-1.5 rounded-[12px] bg-mf-bg px-3 py-2.5">
          {s.shares.map((x, i) => (
            <div key={i} className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 truncate text-mf-ink-2">
                <b className="font-semibold text-mf-ink">{x.label}</b>
                {x.kind === "ME"
                  ? ` · ${[x.group_name, x.library_code ? (x.branch_code || x.library_code) : null, x.head_name, x.subhead_name].filter(Boolean).join(" → ")}`
                  : " · pays you back"}
              </span>
              <span className="shrink-0 font-mf-mono text-mf-ink-2">{money(x.amount)}</span>
            </div>
          ))}
        </div>
        {s.note && <p className="mt-2 text-[12.5px] text-mf-ink-3">{s.note}</p>}
      </Card>

      {running ? (
        <>
          <Button size="lg" full disabled={busy} onClick={() => onPart("INSTALMENT")}>Pay this instalment</Button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => onPart("PREPAY")}>Prepay</Button>
            <Button variant="secondary" disabled={busy} onClick={() => onPart("FORECLOSE")}>Foreclose</Button>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} onClick={onEdit}>Edit</Button>
            {!confirmCancel
              ? <Button variant="ghost" disabled={busy} onClick={() => setConfirmCancel(true)}>Cancel schedule</Button>
              : <Button variant="danger" loading={busy} onClick={onCancelSchedule}>Yes, cancel it</Button>}
          </div>
          {confirmCancel && <p className="mt-2 px-1 text-[12.5px] text-mf-ink-3">Stops it with no payment (e.g. the EMI was cancelled). Past payments stay. You can reopen it later.</p>}
        </>
      ) : (
        <Button size="lg" full variant="secondary" loading={busy} onClick={onReopen}>Reopen</Button>
      )}

      {s.payments.length > 0 && (
        <>
          <SectionTitle>Payments</SectionTitle>
          <Card pad={false} className="overflow-hidden">
            {s.payments.map((p, i) => (
              <div key={p.entry_id} className={cx("flex items-center gap-3 px-4 py-2.5", i < s.payments.length - 1 && "border-b border-mf-line")}>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] text-mf-ink">{dateLong(iso10(p.on))}</span>
                  <span className="block text-[11.5px] text-mf-ink-3">{PART_LABEL[p.part] ?? p.part}</span>
                </span>
                <span className="font-mf-mono text-[14px] text-mf-ink">{money(p.amount)}</span>
              </div>
            ))}
          </Card>
          <p className="mt-2 px-1 text-[12px] text-mf-ink-3">Each payment is an ordinary entry in the passbook — remove it there if it was a mistake.</p>
        </>
      )}
    </div>
  );
}

// ── pay: an instalment, a prepayment or the foreclosure ──
function PayForm({ s, part, busy, onBack, onPay }: {
  s: Sched; part: Part; busy: boolean; onBack: () => void; onPay: (payload: any) => Promise<void>;
}) {
  const { init } = useMF();
  const accounts = init?.accounts.filter(a => !a.is_liability) ?? [];
  const [amountStr, setAmountStr] = useState(part === "INSTALMENT" ? String(s.amount) : "");
  const [paidOn, setPaidOn] = useState(todayIso);
  const [accountId, setAccountId] = useState<number | null>(s.account_id ?? accounts[0]?.id ?? null);
  const [shares, setShares] = useState<Share[]>(s.shares.map(x => ({ ...x })));
  const [touched, setTouched] = useState(false);          // once you edit the split, the amount no longer re-scales it
  const [note, setNote] = useState("");
  const [adjust, setAdjust] = useState<"NONE" | "COUNT" | "AMOUNT">("NONE");
  const [countStr, setCountStr] = useState(s.installments_total != null ? String(s.installments_total) : "");
  const [newAmtStr, setNewAmtStr] = useState(String(s.amount));
  const amount = Number(amountStr || 0);

  // the split follows the amount until you change it yourself
  useEffect(() => { if (!touched && amount > 0) setShares(scale(s.shares.map(x => ({ ...x })), amount)); }, [amount, touched, s.shares]);

  const diff = r2(amount - sumOf(shares));
  const blocker = amount <= 0 ? "Enter the amount"
    : !accountId ? "Pick the account it came from"
    : Math.abs(diff) >= 0.005 ? (diff > 0 ? `${money(diff)} not yet split` : `Split is ${money(-diff)} more than the amount`)
    : shares.some(x => x.kind === "ME" && !x.head_id) ? "Pick a head for your part"
    : (part === "PREPAY" && adjust === "COUNT" && !(Number(countStr) >= s.installments_paid + 1)) ? `Instalments must be at least ${s.installments_paid + 1}`
    : (part === "PREPAY" && adjust === "AMOUNT" && !(Number(newAmtStr) > 0)) ? "Enter the new instalment amount" : "";

  const save = () => {
    if (blocker) return;
    onPay({
      paid_on: paidOn, account_id: accountId, amount, note: note.trim() || null, shares: strip(shares),
      adjust: part === "PREPAY" ? (adjust === "COUNT" ? { installments_total: Number(countStr) } : adjust === "AMOUNT" ? { amount: Number(newAmtStr) } : null) : null,
    });
  };

  return (
    <div className="pb-2">
      <p className="mb-3 px-1 text-[12.5px] text-mf-ink-3">
        {part === "INSTALMENT" ? `Instalment ${s.installments_paid + 1}${s.installments_total != null ? ` of ${s.installments_total}` : ""}. Change the amount or the split if this one is different.`
          : part === "PREPAY" ? "Any extra amount. It doesn't count as an instalment, and the schedule keeps running."
          : "The final payment. The schedule closes once it's recorded."}
      </p>
      <AmountPad value={amountStr} onKey={k => setAmountStr(x => keyRules(x, k))} />
      <DateChips title="Paid on" value={paidOn} onChange={setPaidOn} ago={daysAgo(paidOn)} label={dayLabel(paidOn)}
        today={todayIso()} yesterday={shiftIso(todayIso(), -1)} />
      <ChipGroup label="Paid from">
        {accounts.map(a => (
          <Chip key={a.id} on={accountId === a.id} onClick={() => setAccountId(a.id)}>{a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}</Chip>
        ))}
      </ChipGroup>

      <ShareEditor shares={shares} setShares={xs => { setTouched(true); setShares(xs); }} amount={amount} />

      {part === "PREPAY" && (
        <div className="mb-4">
          <div className="mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">After this, the lender…</div>
          <div className="flex flex-wrap gap-2">
            <Chip on={adjust === "NONE"} onClick={() => setAdjust("NONE")}>Changed nothing</Chip>
            <Chip on={adjust === "COUNT"} onClick={() => setAdjust("COUNT")}>Cut the instalments</Chip>
            <Chip on={adjust === "AMOUNT"} onClick={() => setAdjust("AMOUNT")}>Lowered the EMI</Chip>
          </div>
          {adjust === "COUNT" && (
            <div className="mt-3">
              <Field label="Total instalments now" hint={`${s.installments_paid} already paid`}>
                <input value={countStr} inputMode="numeric" onChange={e => setCountStr(e.target.value.replace(/[^0-9]/g, ""))} className={cx(inputCls, "font-mf-mono")} />
              </Field>
            </div>
          )}
          {adjust === "AMOUNT" && (
            <div className="mt-3">
              <Field label="New instalment amount" hint="The usual split keeps the same proportions">
                <input value={newAmtStr} inputMode="decimal" onChange={e => setNewAmtStr(e.target.value.replace(/[^0-9.]/g, ""))} className={cx(inputCls, "font-mf-mono")} />
              </Field>
            </div>
          )}
        </div>
      )}

      <Field label="Note (optional)"><TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. paid late, part payment" /></Field>
      <Button size="lg" full className="mt-2" disabled={!!blocker || busy} loading={busy} loadingText="Saving…" onClick={save}>
        {blocker || (part === "FORECLOSE" ? `Foreclose with ${money(amount)}` : part === "PREPAY" ? `Prepay ${money(amount)}` : `Record ${money(amount)}`)}
      </Button>
      <Button variant="ghost" full className="mt-2" onClick={onBack}>Back</Button>
    </div>
  );
}

// ── new / edit a schedule ──
function ScheduleForm({ row, onDone, onBack }: { row: Sched | null; onDone: () => Promise<void>; onBack?: () => void }) {
  const { init, post } = useMF();
  const accounts = init?.accounts.filter(a => !a.is_liability) ?? [];
  const [name, setName] = useState(row?.name ?? "");
  const [amountStr, setAmountStr] = useState(row ? String(row.amount) : "");
  const [freq, setFreq] = useState(row?.frequency ?? "MONTHLY");
  const [nextDue, setNextDue] = useState(row ? iso10(row.next_due) : todayIso());
  const [accountId, setAccountId] = useState<number | null>(row?.account_id ?? accounts[0]?.id ?? null);
  const [totalStr, setTotalStr] = useState(row?.installments_total != null ? String(row.installments_total) : "");
  const [shares, setShares] = useState<Share[]>(row ? row.shares.map(x => ({ ...x })) : [{ kind: "ME", amount: 0, group: "PERSONAL" }]);
  const [touched, setTouched] = useState(!!row);
  const [note, setNote] = useState(row?.note ?? "");
  const [busy, setBusy] = useState(false);
  const amount = Number(amountStr || 0);

  useEffect(() => { if (!touched && amount > 0) setShares(xs => (xs.length === 1 ? [{ ...xs[0], amount }] : scale(xs, amount))); }, [amount, touched]);

  const diff = r2(amount - sumOf(shares));
  const blocker = !name.trim() ? "Give it a name" : amount <= 0 ? "Enter the amount"
    : Math.abs(diff) >= 0.005 ? (diff > 0 ? `${money(diff)} not yet split` : `Split is ${money(-diff)} more than the amount`)
    : shares.some(x => x.kind === "ME" && !x.head_id) ? "Pick a head for your part" : "";

  const save = async () => {
    if (blocker) return;
    setBusy(true);
    const j = await post("saveSchedule", {
      id: row?.id, name: name.trim(), amount, frequency: freq, next_due: nextDue, account_id: accountId,
      installments_total: totalStr === "" ? null : Number(totalStr), note: note.trim() || null, shares: strip(shares),
    });
    setBusy(false);
    if (j) await onDone();
  };

  return (
    <div className="pb-2">
      <Field label="Name"><TextInput value={name} onChange={e => setName(e.target.value)} placeholder="Car EMI" autoFocus={!row} /></Field>
      <div className="mb-1 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">Each instalment</div>
      <AmountPad value={amountStr} onKey={k => setAmountStr(s => keyRules(s, k))} />
      <ChipGroup label="How often">
        {FREQ.map(f => <Chip key={f.v} on={freq === f.v} onClick={() => setFreq(f.v)}>{f.label}</Chip>)}
      </ChipGroup>
      <Field label={row ? "Next due" : "First due"}>
        <input type="date" value={nextDue} onChange={e => e.target.value && setNextDue(e.target.value)} className={inputCls} />
      </Field>
      <Field label="How many instalments (optional)" hint="Leave blank if it runs until you stop it. e.g. 36 for an EMI.">
        <input value={totalStr} inputMode="numeric" onChange={e => setTotalStr(e.target.value.replace(/[^0-9]/g, ""))} className={cx(inputCls, "font-mf-mono")} placeholder="—" />
      </Field>
      <ChipGroup label="Usually paid from">
        {accounts.map(a => <Chip key={a.id} on={accountId === a.id} onClick={() => setAccountId(a.id)}>{a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}</Chip>)}
      </ChipGroup>

      <ShareEditor shares={shares} setShares={xs => { setTouched(true); setShares(xs); }} amount={amount}
        intro="The usual split. You can change it on any payment." />

      <Field label="Note (optional)"><TextInput value={note} onChange={e => setNote(e.target.value)} placeholder="Loan no., landlord, etc." /></Field>
      <Button size="lg" full className="mt-2" disabled={!!blocker || busy} loading={busy} loadingText="Saving…" onClick={save}>
        {blocker || (row ? "Save" : "Add schedule")}
      </Button>
      {onBack && <Button variant="ghost" full className="mt-2" onClick={onBack}>Back</Button>}
    </div>
  );
}

// ── who it's for: your part (Group → library → Head → Sub-head) and/or people ──
function ShareEditor({ shares, setShares, amount, intro }: {
  shares: Share[]; setShares: (xs: Share[]) => void; amount: number; intro?: string;
}) {
  const { init, post, refreshInit, showToast } = useMF();
  const L = labelsOf(init);
  const groups = groupsOf(init);
  const people = init?.people ?? [];
  const places = useMemo(() => (init?.libraries ?? []).map(l => ({
    library_code: l.library_code, branch_code: l.branch_code,
    key: l.library_code + "|" + (l.branch_code ?? ""), label: l.branch_code ? (l.branch_label || l.branch_code) : l.label,
  })), [init]);
  const [adding, setAdding] = useState(false);
  const hasMe = shares.some(x => x.kind === "ME");
  const diff = r2(amount - sumOf(shares));
  const set = (i: number, patch: Partial<Share>) => setShares(shares.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const remove = (i: number) => setShares(shares.filter((_, k) => k !== i));
  const addPerson = (id: number, nm?: string) => {
    setShares([...shares, { kind: "PERSON", person_id: id, amount: diff > 0 ? diff : 0, label: nm ?? people.find(p => p.id === id)?.name }]);
    setAdding(false);
  };
  const equal = () => {
    if (!shares.length || amount <= 0) return;
    const each = Math.floor((amount / shares.length) * 100) / 100;
    const out = shares.map(x => ({ ...x, amount: each }));
    out[0] = { ...out[0], amount: r2(out[0].amount + (amount - each * shares.length)) };
    setShares(out);
  };

  return (
    <div className="mb-4">
      <div className="mb-1.5 flex items-baseline justify-between px-1">
        <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">Who it's for</span>
        {shares.length > 1 && <button type="button" onClick={equal} className="text-[12.5px] font-semibold text-mf-ink-2 underline underline-offset-2">Split equally</button>}
      </div>
      {intro && <p className="mb-2 px-1 text-[12px] text-mf-ink-3">{intro}</p>}

      <div className="space-y-2">
        {shares.map((x, i) => {
          const grp = groups.find(g => g.code === (x.group || "PERSONAL"));
          const heads = x.kind === "ME" ? headsOf(init, "EXPENSE", x.group || "PERSONAL") : [];
          const subs = x.kind === "ME" ? subsOf(init, x.head_id ?? null) : [];
          const nm = x.kind === "ME" ? "You" : (people.find(p => p.id === x.person_id)?.name ?? x.label ?? "Someone");
          return (
            <Card key={i} className="py-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[14.5px] font-semibold text-mf-ink">
                  {nm}{x.kind === "PERSON" && <span className="ml-1.5 text-[11.5px] font-normal text-mf-ink-3">pays you back</span>}
                </span>
                <input value={x.amount ? String(x.amount) : ""} inputMode="decimal" aria-label={`${nm}'s share`} placeholder="0"
                  onChange={e => set(i, { amount: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })}
                  className="h-10 w-28 rounded-[10px] border border-mf-line bg-mf-surface px-2.5 text-right font-mf-mono text-[14px] outline-none focus:border-mf-ink" />
                {shares.length > 1 && (
                  <button type="button" onClick={() => remove(i)} aria-label={`Remove ${nm}`} className="grid h-9 w-9 place-items-center rounded-full text-mf-ink-3 active:bg-mf-bg">✕</button>
                )}
              </div>
              {x.kind === "ME" && (
                <div className="mt-2.5">
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {groups.map(g => (
                      <Chip key={g.code} on={(x.group || "PERSONAL") === g.code}
                        onClick={() => { if ((x.group || "PERSONAL") !== g.code) set(i, { group: g.code, head_id: null, subhead_id: null, library_code: null, branch_code: null }); }}>{g.name}</Chip>
                    ))}
                  </div>
                  {grp?.is_library && (
                    <div className="mb-1.5 flex flex-wrap gap-1.5">
                      {places.map(pl => (
                        <Chip key={pl.key} on={x.library_code === pl.library_code && (x.branch_code ?? null) === pl.branch_code}
                          onClick={() => set(i, { library_code: pl.library_code, branch_code: pl.branch_code })}>{pl.label}</Chip>
                      ))}
                    </div>
                  )}
                  <div className="mb-1 px-0.5 text-[11.5px] font-semibold text-mf-ink-3">{L.head}</div>
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {heads.map(h => (
                      <Chip key={h.id} on={x.head_id === h.id} onClick={() => { if (x.head_id !== h.id) set(i, { head_id: h.id, subhead_id: null }); }}>{h.name}</Chip>
                    ))}
                    <QuickAdd what={L.head.toLowerCase()} where={`in ${grp?.name ?? ""} · Spending`} placeholder="EMI"
                      existing={heads} onPickExisting={id => set(i, { head_id: id, subhead_id: null })}
                      onSave={async name => {
                        const j = await post("saveCategory", { name, kind: "EXPENSE", group_code: x.group || "PERSONAL", quick: true });
                        if (!j) return null;
                        await refreshInit(); set(i, { head_id: Number(j.id), subhead_id: null }); showToast(`${name} added`);
                        return Number(j.id);
                      }} />
                  </div>
                  {!!x.head_id && (
                    <>
                      <div className="mb-1 px-0.5 text-[11.5px] font-semibold text-mf-ink-3">{L.subhead} (optional)</div>
                      <div className="flex flex-wrap gap-1.5">
                        {subs.map(sb => (
                          <Chip key={sb.id} on={x.subhead_id === sb.id} onClick={() => set(i, { subhead_id: x.subhead_id === sb.id ? null : sb.id })}>{sb.name}</Chip>
                        ))}
                        <QuickAdd what={L.subhead.toLowerCase()} where={`under ${heads.find(h => h.id === x.head_id)?.name ?? ""}`} placeholder="Car loan"
                          existing={subs} onPickExisting={id => set(i, { subhead_id: id })}
                          onSave={async name => {
                            const j = await post("saveCategory", { name, parent_id: x.head_id });
                            if (!j) return null;
                            await refreshInit(); set(i, { subhead_id: Number(j.id) }); showToast(`${name} added`);
                            return Number(j.id);
                          }} />
                      </div>
                    </>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {!hasMe && <Button variant="secondary" className="h-10 px-3 text-[13.5px]" onClick={() => setShares([{ kind: "ME", amount: diff > 0 ? diff : 0, group: "PERSONAL" }, ...shares])}>+ Add yourself</Button>}
        <Button variant="secondary" className="h-10 px-3 text-[13.5px]" onClick={() => setAdding(v => !v)}>+ Add a person</Button>
      </div>
      {adding && (
        <div className="mt-2 flex flex-wrap gap-2 rounded-[14px] bg-mf-bg p-2.5">
          {people.filter(p => !shares.some(x => x.person_id === p.id)).map(p => <Chip key={p.id} on={false} onClick={() => addPerson(p.id, p.name)}>{p.name}</Chip>)}
          <QuickAdd what="person" placeholder="Ramesh" withPhone existing={people} onPickExisting={id => addPerson(id)}
            onSave={async (name, phone) => {
              const j = await post("savePerson", { name, phone, quick: true });
              if (!j) return null;
              await refreshInit(); addPerson(Number(j.id), name); showToast(`${name} added`);
              return Number(j.id);
            }} />
        </div>
      )}
      <p className={cx("mt-2 px-1 text-[12.5px]", Math.abs(diff) < 0.005 ? "text-mf-ink-3" : "font-semibold text-mf-out")}>
        {amount <= 0 ? "Enter the amount first." : Math.abs(diff) < 0.005 ? `Split adds up to ${money(amount)}.`
          : diff > 0 ? `${money(diff)} still to split.` : `Split is ${money(-diff)} more than ${money(amount)}.`}
      </p>
    </div>
  );
}
