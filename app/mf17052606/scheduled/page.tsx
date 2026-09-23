"use client";

// MF 2.0 — Scheduled payments.
// Rent, EMIs, recurring bills. They remind; they never record themselves.
// Confirming one writes an ordinary expense, so it appears in the passbook and
// can be removed like anything else — then the schedule moves on a period.

import { useCallback, useEffect, useState } from "react";
import { useMF, money } from "../_components/MFProvider";
import {
  TopBar, Card, Chip, ChipGroup, Sheet, Button, Empty, Skeleton, Field, TextInput, SectionTitle,
  AmountPad, DateChips, inputCls, BASE, cx,
} from "../_ui/kit";
import { IconRepeat, IconPlus, IconChevron } from "../_ui/icons";
import { shiftIso, dayLabel, dateLong } from "../_ui/format";

type Sched = {
  id: number; name: string; amount: number;
  account_id: number | null; account_name: string | null;
  category_id: number | null; category_name: string | null;
  world: string; library_code: string | null;
  frequency: string; next_due: string; days_away: number;
  installments_total: number | null; installments_paid: number; remaining: number | null;
};

const FREQ = [
  { v: "MONTHLY", label: "Monthly" }, { v: "WEEKLY", label: "Weekly" },
  { v: "QUARTERLY", label: "Quarterly" }, { v: "YEARLY", label: "Yearly" },
  { v: "ONE_OFF", label: "One-off" },
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

function dueText(d: number): { text: string; urgent: boolean } {
  if (d < 0) return { text: `${-d} day${d === -1 ? "" : "s"} overdue`, urgent: true };
  if (d === 0) return { text: "due today", urgent: true };
  if (d === 1) return { text: "due tomorrow", urgent: true };
  if (d <= 7) return { text: `in ${d} days`, urgent: true };
  return { text: `in ${d} days`, urgent: false };
}

export default function Schedules() {
  const { init, post, showToast, refreshInit } = useMF();
  const [rows, setRows] = useState<Sched[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const j = await post("schedules");
    if (j) setRows(j.schedules ?? []);
    else setRows(r => r ?? []);
  }, [post]);

  useEffect(() => { load(); }, [load]);

  const confirmPaid = async (s: Sched, accountId: number | null, paidOn: string, amount: number) => {
    setBusy(true);
    const j = await post("recordSchedule", { id: s.id, account_id: accountId, paid_on: paidOn, amount });
    setBusy(false);
    if (j) {
      showToast(j.finished ? `${s.name} — last one, done` : `Recorded ${money(amount)}`);
      setOpenId(null);
      await refreshInit();
      await load();
    }
  };

  const list = rows ?? [];
  const open = openId != null ? list.find(s => s.id === openId) ?? null : null;
  const groups: { title: string; tone?: "out" | "warn"; items: Sched[] }[] = [
    { title: "Overdue", tone: "out", items: list.filter(s => s.days_away < 0) },
    { title: "Due soon", tone: "warn", items: list.filter(s => s.days_away >= 0 && s.days_away <= 7) },
    { title: "Later", items: list.filter(s => s.days_away > 7) },
  ];

  return (
    <div className="mx-auto w-full max-w-[560px] px-4">
      <TopBar back={BASE} title="Scheduled" sub="Rent, EMIs, bills"
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
      ) : list.length === 0 ? (
        <Card>
          <Empty icon={<IconRepeat size={22} />} title="Nothing scheduled"
            body="Add rent, an EMI or any bill that repeats. It reminds you, and only records once you confirm it happened."
            action={<Button onClick={() => setAdding(true)}>Add a schedule</Button>} />
        </Card>
      ) : (
        groups.filter(g => g.items.length > 0).map(g => (
          <div key={g.title}>
            <SectionTitle>{g.title}</SectionTitle>
            <Card pad={false} className="overflow-hidden">
              {g.items.map((s, i) => {
                const d = dueText(s.days_away);
                return (
                  <button key={s.id} type="button" onClick={() => setOpenId(s.id)}
                    className={cx("mf-noscale flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-mf-bg", i < g.items.length - 1 && "border-b border-mf-line")}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-mf-ink">{s.name}</span>
                      <span className={cx("mt-0.5 block truncate text-[12px]", d.urgent ? "font-semibold text-mf-out" : "text-mf-ink-3")}>
                        {d.text}
                        {s.remaining != null ? ` · ${s.remaining} left` : ""}
                        {s.account_name ? ` · ${s.account_name}` : ""}
                      </span>
                    </span>
                    <span className="font-mf-mono text-[15px] text-mf-ink">{money(s.amount)}</span>
                    <IconChevron size={18} className="shrink-0 text-mf-ink-3" />
                  </button>
                );
              })}
            </Card>
          </div>
        ))
      )}

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open ? open.name : ""}>
        {open && (
          <ConfirmForm key={open.id} s={open} busy={busy}
            accounts={init?.accounts.filter(a => !a.is_liability) ?? []}
            onConfirm={confirmPaid} onCancel={() => setOpenId(null)} />
        )}
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title="New schedule">
        {adding && <NewForm onDone={async () => { setAdding(false); await load(); }} />}
      </Sheet>
    </div>
  );
}

function ConfirmForm({ s, accounts, onConfirm, onCancel, busy }: {
  s: Sched;
  accounts: { id: number; bank_name: string; owner_name: string }[];
  onConfirm: (s: Sched, accountId: number | null, paidOn: string, amount: number) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
}) {
  const [accountId, setAccountId] = useState<number | null>(s.account_id ?? accounts[0]?.id ?? null);
  const [paidOn, setPaidOn] = useState(todayIso);
  const [amountStr, setAmountStr] = useState(String(s.amount));
  const amount = Number(amountStr || 0);
  const ok = amount > 0 && !!accountId && !busy;
  const d = dueText(s.days_away);

  return (
    <div className="pb-2">
      <p className="mb-3 text-[12.5px] text-mf-ink-3">
        {d.text[0].toUpperCase() + d.text.slice(1)} · was due {dateLong(s.next_due)}.
        Confirming records it as an ordinary expense.
      </p>

      <AmountPad value={amountStr} onKey={k => setAmountStr(x => keyRules(x, k))} />

      <DateChips title="Paid on" value={paidOn} onChange={setPaidOn} ago={daysAgo(paidOn)} label={dayLabel(paidOn)}
        today={todayIso()} yesterday={shiftIso(todayIso(), -1)} />

      <ChipGroup label="Paid from">
        {accounts.map(a => (
          <Chip key={a.id} on={accountId === a.id} onClick={() => setAccountId(a.id)}>
            {a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}
          </Chip>
        ))}
      </ChipGroup>

      <Button size="lg" full disabled={!ok} loading={busy} loadingText="Saving…"
        onClick={() => ok && onConfirm(s, accountId, paidOn, amount)}>
        Yes, it happened{amount > 0 ? ` · ${money(amount)}` : ""}
      </Button>
      <Button variant="ghost" full className="mt-2" onClick={onCancel}>Not yet</Button>
    </div>
  );
}

function NewForm({ onDone }: { onDone: () => Promise<void> }) {
  const { init, post, showToast } = useMF();
  const [name, setName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [freq, setFreq] = useState("MONTHLY");
  const [nextDue, setNextDue] = useState(todayIso);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [totalStr, setTotalStr] = useState("");
  const [busy, setBusy] = useState(false);

  const cats = (init?.categories ?? []).filter(c => c.kind === "EXPENSE");
  const accounts = init?.accounts.filter(a => !a.is_liability) ?? [];
  const ok = !!name.trim() && Number(amountStr) > 0 && !!categoryId && !busy;
  const blocker = !name.trim() ? "Give it a name" : Number(amountStr) <= 0 ? "Enter the amount" : !categoryId ? "Pick a category" : "";

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("saveSchedule", {
      name, amount: Number(amountStr), frequency: freq, next_due: nextDue,
      account_id: accountId, category_id: categoryId, world: "PERSONAL",
      installments_total: totalStr === "" ? null : Number(totalStr),
    });
    setBusy(false);
    if (j) { showToast("Added " + name.trim()); await onDone(); }
  };

  return (
    <div className="pb-2">
      <Field label="Name"><TextInput value={name} onChange={e => setName(e.target.value)} placeholder="Flat rent" autoFocus /></Field>

      <AmountPad value={amountStr} onKey={k => setAmountStr(s => keyRules(s, k))} />

      <ChipGroup label="How often">
        {FREQ.map(f => <Chip key={f.v} on={freq === f.v} onClick={() => setFreq(f.v)}>{f.label}</Chip>)}
      </ChipGroup>

      <Field label="Next due">
        <input type="date" value={nextDue} onChange={e => e.target.value && setNextDue(e.target.value)} className={inputCls} />
      </Field>

      <ChipGroup label="Category" hint={cats.length === 0 ? "No spending categories yet — add them in Set up." : undefined}>
        {cats.map(c => <Chip key={c.id} on={categoryId === c.id} onClick={() => setCategoryId(c.id)}>{c.name}</Chip>)}
      </ChipGroup>

      <ChipGroup label="Usually paid from">
        {accounts.map(a => <Chip key={a.id} on={accountId === a.id} onClick={() => setAccountId(a.id)}>{a.bank_name}</Chip>)}
      </ChipGroup>

      <Field label="How many payments" hint="Leave blank if it runs forever. e.g. 36 for an EMI.">
        <input value={totalStr} inputMode="numeric" placeholder="36"
          onChange={e => setTotalStr(e.target.value.replace(/[^0-9]/g, ""))} className={cx(inputCls, "font-mf-mono")} />
      </Field>

      {!ok && blocker && <p className="mb-2 text-center text-[12.5px] font-medium text-mf-ink-3">{blocker}</p>}
      <Button size="lg" full disabled={!ok} loading={busy} loadingText="Saving…" onClick={save}>Add schedule</Button>
    </div>
  );
}
