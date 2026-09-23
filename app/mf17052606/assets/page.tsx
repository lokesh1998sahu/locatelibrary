"use client";

// MF 2.0 — Assets.
// Cost is the sum of the ledger; current value is a dated observation you add.
// The gap between them is your gain, and it is never hidden inside one number.

import { useCallback, useEffect, useState } from "react";
import { useMF, money } from "../_components/MFProvider";
import {
  TopBar, Card, Chip, ChipGroup, Sheet, Button, Empty, Skeleton, Field, TextInput, SwitchRow,
  AmountPad, DateChips, BASE, cx,
} from "../_ui/kit";
import { IconAsset, IconPlus, IconChevron } from "../_ui/icons";
import { shiftIso, dayLabel, dateLong } from "../_ui/format";

type Asset = {
  id: number; name: string; asset_type: string | null; nature: string;
  value_trend: string; income_generating: boolean;
  cost: number; current_value: number | null; valued_as_of: string | null; gain: number | null;
};

const TRENDS = [
  { v: "APPRECIATING", label: "Grows" },
  { v: "STABLE", label: "Steady" },
  { v: "DEPRECIATING", label: "Wears out" },
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
/** "valued 8 months ago" · "never valued" — and whether that is getting old. */
function valuedText(iso: string | null): { text: string; stale: boolean } {
  if (!iso) return { text: "Never valued", stale: true };
  const d = daysAgo(String(iso).slice(0, 10));
  if (Number.isNaN(d)) return { text: `Valued ${dateLong(iso)}`, stale: false };
  if (d <= 1) return { text: "Valued today", stale: false };
  if (d < 31) return { text: `Valued ${d} days ago`, stale: false };
  const m = Math.round(d / 30.4);
  if (m < 12) return { text: `Valued ${m} month${m === 1 ? "" : "s"} ago`, stale: m >= 6 };
  const y = Math.floor(d / 365);
  return { text: `Valued ${y}+ year${y === 1 ? "" : "s"} ago`, stale: true };
}

type Act = "BUY" | "VALUE" | "SELL";

export default function Assets() {
  const { post, refreshInit } = useMF();
  const [rows, setRows] = useState<Asset[] | null>(null);
  const [totals, setTotals] = useState<{ cost: number; value: number } | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const j = await post("assets");
    if (j) { setRows(j.assets ?? []); setTotals(j.totals ?? null); }
    else setRows(r => r ?? []);
  }, [post]);

  useEffect(() => { load(); }, [load]);

  const after = async () => { setOpenId(null); await refreshInit(); await load(); };
  const list = rows ?? [];
  const open = openId != null ? list.find(a => a.id === openId) ?? null : null;
  const gain = totals ? totals.value - totals.cost : 0;

  return (
    <div className="mx-auto w-full max-w-[560px] px-4">
      <TopBar back={BASE} title="Assets" sub="Property, gold, deposits"
        right={<Button size="md" variant="secondary" className="h-10 px-3 text-[14px]" onClick={() => setAdding(true)}><IconPlus size={17} /> New</Button>} />

      {totals && list.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Card className="py-3">
              <div className="text-[12px] font-semibold text-mf-ink-3">You paid</div>
              <div className="mt-1 font-mf-mono text-[19px] text-mf-ink">{money(totals.cost)}</div>
            </Card>
            <Card className="py-3">
              <div className="text-[12px] font-semibold text-mf-ink-3">Worth today</div>
              <div className="mt-1 font-mf-mono text-[19px] text-mf-ink">{money(totals.value)}</div>
            </Card>
          </div>
          <p className="mb-4 mt-2 text-center text-[12.5px] text-mf-ink-3">
            {Math.abs(gain) < 1 ? "Level with what you paid" : (
              <span className={cx("font-mf-mono font-semibold", gain < 0 ? "text-mf-out" : "text-mf-in")}>
                {money(Math.abs(gain))} {gain < 0 ? "down on cost" : "up on cost"}
              </span>
            )}
          </p>
        </>
      )}

      {rows === null ? (
        <Card pad={false}>
          {[0, 1, 2].map(i => (
            <div key={i} className={cx("flex items-center gap-3 px-4 py-4", i < 2 && "border-b border-mf-line")}>
              <div className="flex-1"><Skeleton className="h-4 w-36" /><Skeleton className="mt-2 h-3 w-24" /></div>
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <Empty icon={<IconAsset size={22} />} title="No assets yet"
            body="Property, gold, deposits, a vehicle — anything you own that has a value worth counting in your net worth."
            action={<Button onClick={() => setAdding(true)}>Add an asset</Button>} />
        </Card>
      ) : (
        <Card pad={false} className="overflow-hidden">
          {list.map((a, i) => {
            const v = valuedText(a.valued_as_of);
            return (
              <button key={a.id} type="button" onClick={() => setOpenId(a.id)}
                className={cx("mf-noscale flex min-h-[62px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-mf-bg", i < list.length - 1 && "border-b border-mf-line")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-mf-ink">{a.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-mf-ink-3">
                    {a.asset_type && <span>{a.asset_type}</span>}
                    {a.asset_type && <span>·</span>}
                    <span className={cx(v.stale && "font-semibold text-mf-warn")}>{v.text}</span>
                    {a.income_generating && <><span>·</span><span>Earns</span></>}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block font-mf-mono text-[15px] text-mf-ink">{money(a.current_value ?? a.cost)}</span>
                  {a.gain != null && Math.abs(a.gain) >= 1 && (
                    <span className={cx("mt-0.5 block font-mf-mono text-[12px]", a.gain < 0 ? "text-mf-out" : "text-mf-in")}>
                      {a.gain < 0 ? "" : "+"}{money(a.gain)}
                    </span>
                  )}
                </span>
                <IconChevron size={18} className="shrink-0 text-mf-ink-3" />
              </button>
            );
          })}
        </Card>
      )}

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open ? open.name : ""}>
        {open && <Actions key={open.id} a={open} onDone={after} />}
      </Sheet>
      <Sheet open={adding} onClose={() => setAdding(false)} title="New asset">
        {adding && <NewAsset onDone={async () => { setAdding(false); await load(); }} />}
      </Sheet>
    </div>
  );
}

function Actions({ a, onDone }: { a: Asset; onDone: () => Promise<void> }) {
  const { init, post, showToast } = useMF();
  const [act, setAct] = useState<Act>("VALUE");
  const [amountStr, setAmountStr] = useState("");
  const [dateIso, setDateIso] = useState(todayIso);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const accounts = init?.accounts.filter(x => !x.is_liability) ?? [];
  const amount = Number(amountStr || 0);
  const needsAccount = act !== "VALUE";
  const ok = amount > 0 && (!needsAccount || !!accountId) && !busy;

  const go = async () => {
    if (!ok) return;
    setBusy(true);
    const j =
      act === "VALUE" ? await post("assetRevalue", { asset_id: a.id, value: amount, as_of: dateIso })
      : act === "BUY" ? await post("assetBuy", { asset_id: a.id, account_id: accountId, amount, entry_date: dateIso })
      :                 await post("assetSell", { asset_id: a.id, account_id: accountId, amount, entry_date: dateIso });
    setBusy(false);
    if (j) {
      showToast(act === "VALUE" ? "Value updated"
        : act === "BUY" ? "Recorded " + money(amount)
        : `Sold — ${j.gain >= 0 ? "gain" : "loss"} of ${money(Math.abs(j.gain))}`);
      await onDone();
    }
  };

  const hint = act === "VALUE" ? "No money moves — this records what it is worth today, and the date."
    : act === "BUY" ? "Money leaves an account and becomes part of this asset. Net worth is unchanged."
    : `Cost so far is ${money(a.cost)}. Anything above that is booked as a gain, anything below as a loss.`;

  return (
    <div className="pb-2">
      <p className="mb-3 text-[12.5px] text-mf-ink-3">
        Paid {money(a.cost)}{a.current_value != null ? ` · worth ${money(a.current_value)} as at ${dateLong(a.valued_as_of)}` : " · never valued"}
      </p>

      <ChipGroup label="What are you doing" hint={hint}>
        <Chip on={act === "VALUE"} onClick={() => setAct("VALUE")}>Update value</Chip>
        <Chip on={act === "BUY"} onClick={() => setAct("BUY")}>Put money in</Chip>
        <Chip on={act === "SELL"} onClick={() => setAct("SELL")}>Sell it</Chip>
      </ChipGroup>

      <AmountPad value={amountStr} onKey={k => setAmountStr(s => keyRules(s, k))}
        label={act === "VALUE" ? "Worth today" : act === "BUY" ? "Amount" : "Sale proceeds"} />

      <DateChips title={act === "VALUE" ? "Valued as at" : "On"} value={dateIso} onChange={setDateIso}
        ago={daysAgo(dateIso)} label={dayLabel(dateIso)} today={todayIso()} yesterday={shiftIso(todayIso(), -1)} />

      {needsAccount && (
        <ChipGroup label={act === "BUY" ? "Paid from" : "Money lands in"}>
          {accounts.map(x => (
            <Chip key={x.id} on={accountId === x.id} onClick={() => setAccountId(x.id)}>
              {x.bank_name}{x.owner_name ? " · " + x.owner_name : ""}
            </Chip>
          ))}
        </ChipGroup>
      )}

      <Button size="lg" full disabled={!ok} loading={busy} loadingText="Saving…" onClick={go}>
        {act === "VALUE" ? "Record value" : act === "BUY" ? "Record it" : "Record sale"}
        {amount > 0 ? ` · ${money(amount)}` : ""}
      </Button>
    </div>
  );
}

function NewAsset({ onDone }: { onDone: () => Promise<void> }) {
  const { post, showToast } = useMF();
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [trend, setTrend] = useState("STABLE");
  const [earns, setEarns] = useState(false);
  const [busy, setBusy] = useState(false);
  const ok = !!name.trim() && !busy;

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("saveAsset", { name, asset_type: type, value_trend: trend, income_generating: earns });
    setBusy(false);
    if (j) { showToast("Added " + name.trim()); await onDone(); }
  };

  return (
    <div className="pb-2">
      <Field label="Name"><TextInput value={name} onChange={e => setName(e.target.value)} placeholder="Flat in Jaipur" autoFocus /></Field>
      <Field label="Kind (optional)"><TextInput value={type} onChange={e => setType(e.target.value)} placeholder="Property, gold, FD…" /></Field>
      <ChipGroup label="Over time">
        {TRENDS.map(t => <Chip key={t.v} on={trend === t.v} onClick={() => setTrend(t.v)}>{t.label}</Chip>)}
      </ChipGroup>
      <SwitchRow label="Earns income" hint="Rent, interest or anything it pays you" on={earns} onChange={setEarns} last />
      <Button size="lg" full className="mt-4" disabled={!ok} loading={busy} loadingText="Saving…" onClick={save}>Add asset</Button>
      <p className="mt-3 px-1 text-[12px] leading-relaxed text-mf-ink-3">
        Next: open it to put money in, or record what it is worth today.
      </p>
    </div>
  );
}
