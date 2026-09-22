"use client";

// MF 2.0 — Money in / Move money.
// Two entry types on one screen because they share a shape: an amount, a date,
// and where it lands. Kept apart from Add expense, which has its own
// complications (splits, part payments, who is owed).
//
// Neither screen decides whether an entry balances — it sends the lines and
// the database's guard rail is the judge.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMF, money } from "../_components/MFProvider";
import { TopBar, Card, Chip, ChipGroup, Segmented, Field, TextInput, AmountPad, DateChips, SaveBar, BalanceChange, BASE } from "../_ui/kit";
import { shiftIso } from "../_ui/format";

type Mode = "IN" | "MOVE";

const todayIso = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function prettyDate(iso: string) {
  const d = new Date(iso + "T00:00:00");
  const t = new Date(todayIso() + "T00:00:00");
  const ago = Math.round((t.getTime() - d.getTime()) / 86400000);
  const label = ago === 0 ? "Today" : ago === 1 ? "Yesterday"
    : d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  return { label, ago };
}

export default function MoneyInOrMove() {
  const { init, post, showToast, refreshInit } = useMF();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("IN");
  const [amountStr, setAmountStr] = useState("");
  const [dateIso, setDateIso] = useState(todayIso);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const amount = Number(amountStr || 0);
  const { label: dateLabel, ago } = prettyDate(dateIso);

  const accounts = init?.accounts ?? [];
  const incomeCats = useMemo(() => (init?.categories ?? []).filter(c => c.kind === "INCOME"), [init]);

  const from = accounts.find(a => a.id === fromId) ?? null;
  const to = accounts.find(a => a.id === toId) ?? null;
  const landing = accounts.find(a => a.id === accountId) ?? null;

  const canSave = amount > 0 && !busy && (
    mode === "IN"
      ? !!accountId && !!categoryId
      : !!fromId && !!toId && fromId !== toId
  );

  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    const j = mode === "IN"
      ? await post("addIncome", {
          entry_date: dateIso, world: "PERSONAL", amount,
          account_id: accountId, category_id: categoryId,
          description: note.trim() || null,
        })
      : await post("addMove", {
          entry_date: dateIso, amount,
          from_account_id: fromId, to_account_id: toId,
          description: note.trim() || null,
        });
    setBusy(false);
    if (j) {
      showToast((mode === "IN" ? "Recorded " : "Moved ") + money(amount));
      await refreshInit();
      router.push("/mf17052606");
    }
  };

  // Amount comes from the same keypad as Add expense (same typing rules).
  const tapKey = (k: string) => {
    setAmountStr(s => {
      if (k === "<") return s.slice(0, -1);
      if (k === "." && s.includes(".")) return s;
      if (s.replace(".", "").length >= 9) return s;
      const next = s + k;
      return next.replace(/^0(?=\d)/, "");
    });
  };

  // Why the button is still off, in plain words. (The button itself follows canSave exactly.)
  const blocker =
    amount <= 0 ? "Enter the amount" :
    mode === "IN"
      ? (!accountId ? "Pick where the money landed" : !categoryId ? "Pick what it was for" : "")
      : (!fromId ? "Pick the account it came out of" : !toId ? "Pick the account it went into" : fromId === toId ? "Pick two different accounts" : "");

  const name = (a: { bank_name: string; owner_name: string }) => a.bank_name + (a.owner_name ? " · " + a.owner_name : "");

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-[calc(env(safe-area-inset-bottom)+128px)]">
      <TopBar back={BASE} title={mode === "IN" ? "Money in" : "Move money"} />

      <Segmented className="mb-4" value={mode} onChange={setMode}
        options={[{ v: "IN", label: "Money in" }, { v: "MOVE", label: "Move between accounts" }]} />

      <AmountPad value={amountStr} onKey={tapKey} />

      <DateChips value={dateIso} onChange={setDateIso} ago={ago} label={dateLabel} today={todayIso()} yesterday={shiftIso(todayIso(), -1)} />

      {mode === "IN" ? (
        <>
          <ChipGroup label="Where did it land">
            {accounts.filter(a => !a.is_liability).map(a => (
              <Chip key={a.id} on={accountId === a.id} onClick={() => setAccountId(a.id)}>{name(a)}</Chip>
            ))}
          </ChipGroup>

          <ChipGroup label="What for"
            hint={incomeCats.length === 0
              ? <>No income categories yet. Add one in <Link href={BASE + "/setup"} className="font-semibold text-mf-ink underline">Set up</Link>.</>
              : undefined}>
            {incomeCats.map(c => (
              <Chip key={c.id} on={categoryId === c.id} onClick={() => setCategoryId(c.id)}>{c.name}</Chip>
            ))}
          </ChipGroup>

          {landing && landing.balance != null && amount > 0 && (
            <Card className="mb-4 py-1.5">
              <BalanceChange name={`${landing.bank_name} after this`} before={landing.balance} after={landing.balance + amount} />
            </Card>
          )}
        </>
      ) : (
        <>
          <ChipGroup label="Out of">
            {accounts.map(a => (
              <Chip key={a.id} on={fromId === a.id} onClick={() => { setFromId(a.id); if (toId === a.id) setToId(null); }}>{name(a)}</Chip>
            ))}
          </ChipGroup>

          <ChipGroup label="Into">
            {accounts.filter(a => a.id !== fromId).map(a => (
              <Chip key={a.id} on={toId === a.id} onClick={() => setToId(a.id)}>{name(a)}</Chip>
            ))}
          </ChipGroup>

          {from && to && amount > 0 && (
            <Card className="mb-4 py-1.5">
              {from.balance != null && (
                <BalanceChange name={from.bank_name} before={from.balance}
                  after={from.balance + (from.is_liability ? amount : -amount)} />
              )}
              {to.balance != null && (
                <BalanceChange name={to.bank_name} before={to.balance} first={from.balance == null}
                  after={to.balance + (to.is_liability ? -amount : amount)} />
              )}
              <p className="border-t border-mf-line py-2.5 text-[12px] leading-relaxed text-mf-ink-3">
                {to.is_liability
                  ? "Paying this card down. Your net worth does not change: you have less, and you owe less."
                  : "Net worth does not change. The same money is simply somewhere else."}
              </p>
            </Card>
          )}
        </>
      )}

      <Field label="Note (optional)">
        <TextInput value={note} onChange={e => setNote(e.target.value)} placeholder={mode === "IN" ? "Where did it come from?" : "Why the move?"} />
      </Field>

      <SaveBar hint={!canSave ? blocker : ""} onSave={save} disabled={!canSave} loading={busy}>
        {mode === "IN" ? "Record" : "Move"}{amount > 0 ? ` ${money(amount)}` : ""}
      </SaveBar>
    </div>
  );
}
