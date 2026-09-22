"use client";

// MF 2.0 — Set up: categories and people, managed in the app so the Table
// Editor is never needed for day-to-day setup. Switched-off items stay listed
// (in their own section) so they can be brought back; history always keeps them.
// Accounts and payment tags live in the Accounts tab.

import { useCallback, useEffect, useState } from "react";
import { useMF } from "../_components/MFProvider";
import {
  TopBar, Card, Button, Empty, Field, TextInput, Segmented, Sheet, Skeleton, SwitchRow, SectionTitle, BASE, cx,
} from "../_ui/kit";
import { IconChevron, IconPlus, IconFolder, IconPeople } from "../_ui/icons";

type Cat = { id: number; code: string; name: string; kind: string; quick: boolean; active: boolean };
type Person = { id: number; name: string; phone: string; quick: boolean; active: boolean };
type Tab = "CATEGORIES" | "PEOPLE";
type Edit = { kind: "cat"; row: Cat | null } | { kind: "person"; row: Person | null } | null;   // row null = new

export default function Masters() {
  const { post, refreshInit } = useMF();
  const [tab, setTab] = useState<Tab>("CATEGORIES");
  const [data, setData] = useState<{ categories: Cat[]; people: Person[] } | null>(null);
  const [edit, setEdit] = useState<Edit>(null);

  const load = useCallback(async () => {
    const j = await post("masters");
    if (j) setData({ categories: j.categories ?? [], people: j.people ?? [] });
    else setData(d => d ?? { categories: [], people: [] });
  }, [post]);
  useEffect(() => { load(); }, [load]);

  const done = async () => { setEdit(null); await refreshInit(); await load(); };
  const cats = data?.categories ?? [];
  const people = data?.people ?? [];

  return (
    <div className="mx-auto w-full max-w-[560px] px-4">
      <TopBar back={BASE} title="Set up" sub="Categories and people" />
      <Segmented className="mb-2" value={tab} onChange={setTab}
        options={[{ v: "CATEGORIES", label: "Categories" }, { v: "PEOPLE", label: "People" }]} />

      {data === null ? (
        <Card pad={false} className="mt-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={cx("px-4 py-4", i < 3 && "border-b border-mf-line")}><Skeleton className="h-4 w-40" /></div>
          ))}
        </Card>
      ) : tab === "CATEGORIES" ? (
        <>
          <List title="Spending" empty="No spending categories yet."
            items={cats.filter(c => c.active && c.kind !== "INCOME")} render={c => ({ title: c.name, quick: c.quick })}
            onOpen={c => setEdit({ kind: "cat", row: c })} />
          <List title="Income" empty="No income categories yet."
            items={cats.filter(c => c.active && c.kind === "INCOME")} render={c => ({ title: c.name, quick: c.quick })}
            onOpen={c => setEdit({ kind: "cat", row: c })} />
          <Button variant="secondary" full className="mt-4" onClick={() => setEdit({ kind: "cat", row: null })}>
            <IconPlus size={17} /> Add a category
          </Button>
          {cats.some(c => !c.active) && (
            <List title="Switched off" dim items={cats.filter(c => !c.active)}
              render={c => ({ title: c.name, sub: c.kind === "INCOME" ? "Income" : "Spending" })}
              onOpen={c => setEdit({ kind: "cat", row: c })} />
          )}
          {cats.length === 0 && <Card className="mt-4"><Empty icon={<IconFolder size={22} />} title="No categories yet" body="Add what you spend on and what money comes in for." /></Card>}
        </>
      ) : (
        <>
          <List title="People" empty="Nobody on the list yet."
            items={people.filter(p => p.active)} render={p => ({ title: p.name, sub: p.phone || undefined, quick: p.quick })}
            onOpen={p => setEdit({ kind: "person", row: p })} />
          <Button variant="secondary" full className="mt-4" onClick={() => setEdit({ kind: "person", row: null })}>
            <IconPlus size={17} /> Add a person
          </Button>
          {people.some(p => !p.active) && (
            <List title="Switched off" dim items={people.filter(p => !p.active)}
              render={p => ({ title: p.name, sub: p.phone || undefined })}
              onOpen={p => setEdit({ kind: "person", row: p })} />
          )}
          {people.length === 0 && <Card className="mt-4"><Empty icon={<IconPeople size={22} />} title="No people yet" body="Add the people who lend to you, owe you, or get paid by you." /></Card>}
        </>
      )}

      <Sheet open={edit?.kind === "cat"} onClose={() => setEdit(null)}
        title={edit?.kind === "cat" ? (edit.row ? "Category" : "New category") : ""}>
        {edit?.kind === "cat" && <CategoryForm key={edit.row?.id ?? "new"} row={edit.row} all={cats} onDone={done} />}
      </Sheet>
      <Sheet open={edit?.kind === "person"} onClose={() => setEdit(null)}
        title={edit?.kind === "person" ? (edit.row ? "Person" : "New person") : ""}>
        {edit?.kind === "person" && <PersonForm key={edit.row?.id ?? "new"} row={edit.row} all={people} onDone={done} />}
      </Sheet>
    </div>
  );
}

function List<T extends { id: number }>({ title, items, render, onOpen, empty, dim }: {
  title: string; items: T[]; render: (x: T) => { title: string; sub?: string; quick?: boolean };
  onOpen: (x: T) => void; empty?: string; dim?: boolean;
}) {
  if (items.length === 0 && !empty) return null;
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      <Card pad={false} className={cx("overflow-hidden", dim && "opacity-60")}>
        {items.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-mf-ink-3">{empty}</p>
        ) : items.map((x, i) => {
          const r = render(x);
          return (
            <button key={x.id} type="button" onClick={() => onOpen(x)}
              className={cx("mf-noscale flex min-h-[54px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-mf-bg", i < items.length - 1 && "border-b border-mf-line")}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-mf-ink">{r.title}</span>
                {r.sub && <span className="mt-0.5 block truncate text-[12px] text-mf-ink-3">{r.sub}</span>}
              </span>
              {r.quick && <span className="rounded-full bg-mf-bg px-2 py-0.5 text-[11px] font-semibold text-mf-ink-2 ring-1 ring-inset ring-mf-line">Quick pick</span>}
              <IconChevron size={18} className="shrink-0 text-mf-ink-3" />
            </button>
          );
        })}
      </Card>
    </>
  );
}

function CategoryForm({ row, all, onDone }: { row: Cat | null; all: Cat[]; onDone: () => Promise<void> }) {
  const { post, showToast } = useMF();
  const [name, setName] = useState(row?.name ?? "");
  const [kind, setKind] = useState<string>(row?.kind === "INCOME" ? "INCOME" : "EXPENSE");
  const [quick, setQuick] = useState(row ? row.quick : true);
  const [active, setActive] = useState(row ? row.active : true);
  const [busy, setBusy] = useState(false);
  const clash = !row && all.some(c => c.name.trim().toUpperCase() === name.trim().toUpperCase());
  const ok = !!name.trim() && !clash && !busy;

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("saveCategory", row
      ? { id: row.id, name, kind, quick, active }
      : { name, kind, quick });
    setBusy(false);
    if (j) { showToast(row ? "Saved" : `${name.trim()} added`); await onDone(); }
  };

  return (
    <div className="pb-2">
      <Field label="Name" error={clash ? `"${name.trim()}" already exists.` : undefined}>
        <TextInput value={name} onChange={e => setName(e.target.value)} placeholder="Petrol" autoFocus={!row}
          onKeyDown={e => { if (e.key === "Enter") save(); }} />
      </Field>
      <div className="mb-3">
        <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">Type</div>
        <Segmented value={kind} onChange={setKind} options={[{ v: "EXPENSE", label: "Spending" }, { v: "INCOME", label: "Income" }]} />
      </div>
      <SwitchRow label="Quick pick" hint="Shows first when you add an entry" on={quick} onChange={setQuick} last={!row} />
      {row && <SwitchRow label="In use" hint="Off hides it from new entries. Past entries keep it." on={active} onChange={setActive} last />}
      <Button size="lg" full className="mt-4" disabled={!ok} loading={busy} loadingText="Saving…" onClick={save}>
        {row ? "Save" : "Add category"}
      </Button>
    </div>
  );
}

function PersonForm({ row, all, onDone }: { row: Person | null; all: Person[]; onDone: () => Promise<void> }) {
  const { post, showToast } = useMF();
  const [name, setName] = useState(row?.name ?? "");
  const [phone, setPhone] = useState(row?.phone ?? "");
  const [quick, setQuick] = useState(row ? row.quick : true);
  const [active, setActive] = useState(row ? row.active : true);
  const [busy, setBusy] = useState(false);
  const clash = !row && all.some(p => p.name.trim().toUpperCase() === name.trim().toUpperCase());
  const ok = !!name.trim() && !clash && !busy;

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("savePerson", row
      ? { id: row.id, name, phone, quick, active }
      : { name, phone, quick });
    setBusy(false);
    if (j) { showToast(row ? "Saved" : `${name.trim()} added`); await onDone(); }
  };

  return (
    <div className="pb-2">
      <Field label="Name" error={clash ? `"${name.trim()}" is already on the list.` : undefined}>
        <TextInput value={name} onChange={e => setName(e.target.value)} placeholder="Ramesh" autoFocus={!row} />
      </Field>
      <Field label="Phone (optional)">
        <TextInput value={phone} onChange={e => setPhone(e.target.value)} type="tel" inputMode="tel" placeholder="98xxxxxxxx" />
      </Field>
      <SwitchRow label="Quick pick" hint="Shows first when you pick who is owed" on={quick} onChange={setQuick} last={!row} />
      {row && <SwitchRow label="In use" hint="Off hides them from new entries. Their history stays." on={active} onChange={setActive} last />}
      <Button size="lg" full className="mt-4" disabled={!ok} loading={busy} loadingText="Saving…" onClick={save}>
        {row ? "Save" : "Add person"}
      </Button>
    </div>
  );
}
