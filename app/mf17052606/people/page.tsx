"use client";

// MF 2.0 — People.
// Who owes you, who you owe, and the four ways money crosses between an
// account and a person. A payable created by a part-paid expense is settled
// here, which is what stops money going into one and never coming out.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useMF, money } from "../_components/MFProvider";
import {
  TopBar, Card, Chip, ChipGroup, Sheet, Empty, Skeleton, AmountPad, DateChips, Button, BASE, cx,
} from "../_ui/kit";
import { IconPeople, IconChevron } from "../_ui/icons";
import { shiftIso, dayLabel } from "../_ui/format";

type Row = { id: number; name: string; phone: string; receivable: number; payable: number; net: number };
type Kind = "LEND" | "COLLECT" | "BORROW" | "REPAY";

const ACTIONS: { k: Kind; label: string; hint: string }[] = [
  { k: "COLLECT", label: "They paid me",  hint: "Money comes back to you" },
  { k: "REPAY",   label: "I paid them",   hint: "You settle what you owe" },
  { k: "LEND",    label: "I lent them",   hint: "You hand money over" },
  { k: "BORROW",  label: "I borrowed",    hint: "You take money in" },
];

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const daysAgo = (iso: string) =>
  Math.round((new Date(todayIso() + "T00:00:00").getTime() - new Date(iso + "T00:00:00").getTime()) / 86400000);

export default function People() {
  const { init, post, showToast, refreshInit } = useMF();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const j = await post("peopleBalances");
    if (j) setRows(j.people ?? []);
    else setRows(r => r ?? []);
  }, [post]);

  useEffect(() => { load(); }, [load]);

  const list = rows ?? [];
  const owedToYou = list.reduce((a, r) => a + Math.max(0, r.net), 0);
  const youOwe    = list.reduce((a, r) => a + Math.max(0, -r.net), 0);
  const net = owedToYou - youOwe;
  const open = openId != null ? list.find(r => r.id === openId) ?? null : null;

  return (
    <div className="mx-auto w-full max-w-[560px] px-4">
      <TopBar back={BASE} title="People" sub="Who owes what" />

      <div className="grid grid-cols-2 gap-2">
        <Card className="py-3">
          <div className="text-[12px] font-semibold text-mf-in">Owed to you</div>
          <div className="mt-1 font-mf-mono text-[19px] text-mf-ink">{money(owedToYou)}</div>
        </Card>
        <Card className="py-3">
          <div className="text-[12px] font-semibold text-mf-out">You owe</div>
          <div className="mt-1 font-mf-mono text-[19px] text-mf-ink">{money(youOwe)}</div>
        </Card>
      </div>
      <p className="mb-4 mt-2 text-center text-[12.5px] text-mf-ink-3">
        Net {net === 0 ? "— all settled" : <span className={cx("font-mf-mono font-semibold", net > 0 ? "text-mf-in" : "text-mf-out")}>{money(Math.abs(net))} {net > 0 ? "in your favour" : "against you"}</span>}
      </p>

      {rows === null ? (
        <Card pad={false}>
          {[0, 1, 2].map(i => (
            <div key={i} className={cx("flex items-center gap-3 px-4 py-4", i < 2 && "border-b border-mf-line")}>
              <div className="flex-1"><Skeleton className="h-4 w-32" /><Skeleton className="mt-2 h-3 w-20" /></div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <Empty icon={<IconPeople size={22} />} title="Nobody on the list yet"
            body="Add the people who lend to you, owe you, or get paid by you."
            action={<Link href={BASE + "/setup"} className="text-[14px] font-semibold text-mf-ink underline">Add them in Set up</Link>} />
        </Card>
      ) : (
        <Card pad={false} className="overflow-hidden">
          {list.map((r, i) => (
            <button key={r.id} type="button" onClick={() => setOpenId(r.id)}
              className={cx("mf-noscale flex min-h-[58px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-mf-bg", i < list.length - 1 && "border-b border-mf-line")}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-mf-ink">{r.name}</span>
                <span className="mt-0.5 block text-[12px] text-mf-ink-3">{r.net === 0 ? "Settled up" : r.net > 0 ? "Owes you" : "You owe"}</span>
              </span>
              <span className={cx("font-mf-mono text-[15px]", r.net === 0 ? "text-mf-ink-3" : r.net > 0 ? "text-mf-in" : "text-mf-out")}>
                {r.net === 0 ? "—" : money(Math.abs(r.net))}
              </span>
              <IconChevron size={18} className="shrink-0 text-mf-ink-3" />
            </button>
          ))}
        </Card>
      )}

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open ? open.name : ""}>
        {open && (
          <Form key={open.id} person={open} busy={busy} setBusy={setBusy}
            onDone={async () => { setOpenId(null); await refreshInit(); await load(); }}
            post={post} showToast={showToast}
            accounts={init?.accounts.filter(a => !a.is_liability) ?? []} />
        )}
      </Sheet>
    </div>
  );
}

function Form({ person, accounts, post, showToast, onDone, busy, setBusy }: {
  person: Row;
  accounts: { id: number; bank_name: string; owner_name: string }[];
  post: (a: string, p?: any) => Promise<any | null>;
  showToast: (m: string, t?: "success" | "error") => void;
  onDone: () => Promise<void>;
  busy: boolean;
  setBusy: (b: boolean) => void;
}) {
  const [kind, setKind] = useState<Kind>(person.net < 0 ? "REPAY" : "COLLECT");
  const [amountStr, setAmountStr] = useState(person.net === 0 ? "" : String(Math.abs(person.net)));
  const [accountId, setAccountId] = useState<number | null>(accounts[0]?.id ?? null);
  const [dateIso, setDateIso] = useState(todayIso);

  const amount = Number(amountStr || 0);
  const ok = amount > 0 && !!accountId && !busy;

  const tapKey = (k: string) => {
    setAmountStr(s => {
      if (k === "<") return s.slice(0, -1);
      if (k === "." && s.includes(".")) return s;
      if (s.replace(".", "").length >= 9) return s;
      return (s + k).replace(/^0(?=\d)/, "");
    });
  };

  const go = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("personMove", {
      person_id: person.id, account_id: accountId, amount, kind, entry_date: dateIso,
    });
    setBusy(false);
    if (j) { showToast("Recorded " + money(amount)); await onDone(); }
  };

  return (
    <div className="pb-2">
      <p className="mb-3 text-[12.5px] text-mf-ink-3">
        {person.net === 0 ? "Settled up." : person.net > 0 ? `${person.name} owes you ${money(person.net)}.` : `You owe ${person.name} ${money(-person.net)}.`}
      </p>

      <ChipGroup label="What happened" hint={ACTIONS.find(a => a.k === kind)?.hint}>
        {ACTIONS.map(a => <Chip key={a.k} on={kind === a.k} onClick={() => setKind(a.k)}>{a.label}</Chip>)}
      </ChipGroup>

      <AmountPad value={amountStr} onKey={tapKey} />

      <DateChips value={dateIso} onChange={setDateIso} ago={daysAgo(dateIso)} label={dayLabel(dateIso)}
        today={todayIso()} yesterday={shiftIso(todayIso(), -1)} />

      <ChipGroup label={kind === "COLLECT" || kind === "BORROW" ? "Lands in" : "Paid from"}>
        {accounts.map(a => (
          <Chip key={a.id} on={accountId === a.id} onClick={() => setAccountId(a.id)}>
            {a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}
          </Chip>
        ))}
      </ChipGroup>

      <Button size="lg" full disabled={!ok} loading={busy} loadingText="Saving…" onClick={go}>
        Record{amount > 0 ? ` ${money(amount)}` : " it"}
      </Button>
    </div>
  );
}
