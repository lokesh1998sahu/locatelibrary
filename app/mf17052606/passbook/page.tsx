"use client";

// MF 2.0 — Passbook.
// Pick an account and every movement appears oldest-to-newest with the balance
// after each line: LMA collections and MF 2.0 entries in one column, because
// they are the same money. The last row equals the dashboard figure — if it
// ever does not, something is wrong and you want to see it.
//
// Tap an MF 2.0 line to remove it. LMA lines are not editable here; they
// belong to the library app and are corrected there.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMF, money } from "../_components/MFProvider";
import { TopBar, Card, Chip, Segmented, Sheet, Button, Empty, Skeleton, BASE, cx } from "../_ui/kit";
import { IconBook, IconWallet } from "../_ui/icons";
import { dayLabel } from "../_ui/format";

type Row = {
  entry_id: number | null;
  on_date: string;
  kind: string;
  label: string;
  amount: number;
  balance: number | null;
  source: "MF" | "LMA";
  world?: string | null;
};

const REASONS: { v: string; label: string }[] = [
  { v: "TYPED_WRONG", label: "Typed it wrong" },
  { v: "DUPLICATE", label: "Duplicate" },
  { v: "NEVER_HAPPENED", label: "Never happened" },
  { v: "OTHER", label: "Other" },
];

export default function Passbook() {
  const { init, post, showToast, refreshInit } = useMF();
  const router = useRouter();
  // Opens on one account when linked from Home (…/passbook?account=ID).
  const [accountId, setAccountId] = useState<number | null>(() => {
    if (typeof window === "undefined") return null;
    const v = Number(new URLSearchParams(window.location.search).get("account") || 0);
    return v > 0 ? v : null;
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [meta, setMeta] = useState<{ needs_setup?: boolean; total?: number; shown?: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [world, setWorld] = useState<"" | "PERSONAL" | "LIBRARY">("");

  const load = useCallback(async () => {
    setBusy(true);
    const j = await post("ledger", { account_id: accountId ?? 0, world });
    setBusy(false);
    if (j) { setRows(j.rows ?? []); setMeta({ needs_setup: j.needs_setup, total: j.total, shown: j.shown }); }
  }, [accountId, world, post]);

  useEffect(() => { load(); }, [load]);

  const removeEntry = async (entryId: number, reason: string) => {
    const j = await post("voidEntry", { entry_id: entryId, reason });
    if (j) { showToast("Removed"); setOpenId(null); await refreshInit(); await load(); }
  };

  const accounts = init?.accounts.filter(a => a.is_set_up) ?? [];

  const selected = accountId != null ? accounts.find(a => a.id === accountId) ?? null : null;
  // Newest first; every line still shows the balance right after it, so the
  // top line of an account equals the balance on Home.
  const days: { day: string; items: Row[] }[] = [];
  for (const r of [...rows].reverse()) {
    const g = days[days.length - 1];
    if (g && g.day === r.on_date) g.items.push(r); else days.push({ day: r.on_date, items: [r] });
  }
  const open = openId != null ? rows.find(r => r.entry_id === openId) ?? null : null;

  return (
    <div className="mx-auto w-full max-w-[560px] px-4">
      <TopBar title="Passbook" sub={selected ? `${selected.bank_name}${selected.owner_name ? " · " + selected.owner_name : ""}` : "Every account"} />

      {/* Which account — one swipeable row */}
      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <Chip on={accountId === null} onClick={() => setAccountId(null)}>Everything</Chip>
        {accounts.map(a => (
          <Chip key={a.id} on={accountId === a.id} onClick={() => setAccountId(a.id)}>{a.bank_name}{a.owner_name ? " · " + a.owner_name : ""}</Chip>
        ))}
      </div>

      {accountId === null && (
        <Segmented className="mb-4" value={world} onChange={setWorld}
          options={[{ v: "", label: "All" }, { v: "PERSONAL", label: "Personal" }, { v: "LIBRARY", label: "Library" }]} />
      )}

      {busy && rows.length === 0 ? (
        <Card pad={false}>
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={cx("flex items-center gap-3 px-4 py-4", i < 3 && "border-b border-mf-line")}>
              <div className="flex-1"><Skeleton className="h-4 w-40" /><Skeleton className="mt-2 h-3 w-20" /></div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </Card>
      ) : meta?.needs_setup ? (
        <Card>
          <Empty icon={<IconWallet size={22} />} title="No opening balance yet"
            body="This account has no starting balance, so there is nothing to run a balance from."
            action={<Link href={BASE + "/accounts"} className="text-[14px] font-semibold text-mf-ink underline">Set it in Accounts</Link>} />
        </Card>
      ) : rows.length === 0 ? (
        <Card><Empty icon={<IconBook size={22} />} title="Nothing recorded yet" body="Entries appear here as soon as money moves." /></Card>
      ) : (
        <>
          {days.map(d => (
            <section key={d.day} className="mb-3">
              <h2 className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">{dayLabel(d.day)}</h2>
              <Card pad={false} className="overflow-hidden">
                {d.items.map((r, i) => {
                  const inner = (
                    <>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14.5px] font-medium text-mf-ink">{r.label}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-mf-ink-3">
                          {r.world && <span className="rounded-full px-1.5 py-px text-[10.5px] font-semibold ring-1 ring-inset ring-mf-line">{r.world === "LIBRARY" ? "Library" : "Personal"}</span>}
                          {r.source === "LMA" && <span className="rounded-full bg-mf-bg px-1.5 py-px text-[10.5px] font-semibold text-mf-ink-2">From LMA</span>}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className={cx("font-mf-mono text-[14.5px]", r.amount < 0 ? "text-mf-out" : "text-mf-in")}>{r.amount < 0 ? "" : "+"}{money(r.amount)}</div>
                        {r.balance != null && <div className="mt-0.5 font-mf-mono text-[11.5px] text-mf-ink-3">{money(r.balance)}</div>}
                      </div>
                    </>
                  );
                  const cls = cx("flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left", i < d.items.length - 1 && "border-b border-mf-line");
                  return r.entry_id
                    ? <button key={`${r.source}-${r.entry_id}-${i}`} type="button" onClick={() => setOpenId(r.entry_id)} className={cx(cls, "mf-noscale active:bg-mf-bg")}>{inner}</button>
                    : <div key={`${r.source}-${r.on_date}-${i}`} className={cls}>{inner}</div>;
                })}
              </Card>
            </section>
          ))}
          {meta?.total != null && meta.shown != null && meta.total > meta.shown && (
            <p className="mt-2 text-center text-[12px] text-mf-ink-3">Showing the most recent {meta.shown} of {meta.total}.</p>
          )}
          <p className="mt-2 text-center text-[12px] text-mf-ink-3">Lines from LMA are corrected in LMA.</p>
        </>
      )}

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open?.kind === "EXPENSE" ? "Expense" : "Entry"}>
        {open && (
          <>
            <div className="mb-4">
              <div className="text-[15px] font-semibold text-mf-ink">{open.label}</div>
              <div className="mt-0.5 text-[12.5px] text-mf-ink-3">{dayLabel(open.on_date)}</div>
              <div className={cx("mt-2 font-mf-mono text-[26px]", open.amount < 0 ? "text-mf-out" : "text-mf-in")}>{open.amount < 0 ? "" : "+"}{money(open.amount)}</div>
            </div>
            {/* Only expenses can be edited: the Add screen is an expense form, and loading
                anything else into it would rewrite the entry as an expense on save. */}
            {open.kind === "EXPENSE" && (
              <Button size="lg" full onClick={() => router.push(`/mf17052606/add?edit=${open.entry_id}`)}>Edit it</Button>
            )}
            <div className="mb-2 mt-5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">
              {open.kind === "EXPENSE" ? "Or remove it — why?" : "Remove this entry — why?"}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {REASONS.map(x => (
                <button key={x.v} type="button" onClick={() => removeEntry(open.entry_id!, x.v)}
                  className="mf-btn h-12 rounded-[12px] bg-mf-out-soft text-[14px] font-semibold text-mf-out active:brightness-95">
                  {x.label}
                </button>
              ))}
            </div>
            <Button variant="secondary" full className="mt-3" onClick={() => setOpenId(null)}>Keep it</Button>
          </>
        )}
      </Sheet>
    </div>
  );
}
