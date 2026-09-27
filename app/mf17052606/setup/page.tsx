"use client";

// MF 2.0 — Set up: groups, heads, sub-heads and people, managed in the app so the Table
// Editor is never needed for day-to-day setup. Switched-off items stay listed
// (in their own section) so they can be brought back; history always keeps them.
// Accounts and payment tags live in the Accounts tab.

import { useCallback, useEffect, useState } from "react";
import { useMF } from "../_components/MFProvider";
import {
  TopBar, Card, Button, Empty, Field, TextInput, Segmented, Sheet, Skeleton, SwitchRow, SectionTitle, BASE, cx,
} from "../_ui/kit";
import { IconChevron, IconPlus, IconFolder, IconPeople } from "../_ui/icons";

type Cat = { id: number; code: string; name: string; kind: string; quick: boolean; active: boolean;
  group_code: string | null; parent_id: number | null; sort: number; uses: number };
type Group = { code: string; name: string; is_library: boolean; active: boolean; sort: number };
type Labels = { group: string; head: string; subhead: string };
type Person = { id: number; name: string; phone: string; quick: boolean; active: boolean };
type Tab = "HEADS" | "PEOPLE";
type Edit =
  | { kind: "head"; row: Cat | null }          // row null = new head
  | { kind: "group"; row: Group | null }       // row null = new group
  | { kind: "labels" }
  | { kind: "person"; row: Person | null }
  | null;

const byOrder = <T extends { sort: number; name: string }>(a: T, b: T) => (a.sort - b.sort) || a.name.localeCompare(b.name);

export default function Masters() {
  const { post, refreshInit } = useMF();
  const [tab, setTab] = useState<Tab>("HEADS");
  const [data, setData] = useState<{ categories: Cat[]; people: Person[]; groups: Group[]; labels: Labels } | null>(null);
  const [edit, setEdit] = useState<Edit>(null);
  const [groupSel, setGroupSel] = useState<string>("PERSONAL");
  const [kind, setKind] = useState<string>("EXPENSE");

  const load = useCallback(async () => {
    const j = await post("masters");
    if (j) setData({ categories: j.categories ?? [], people: j.people ?? [], groups: j.groups ?? [],
                     labels: { group: "Group", head: "Head", subhead: "Sub-head", ...(j.labels || {}) } });
    else setData(d => d ?? { categories: [], people: [], groups: [], labels: { group: "Group", head: "Head", subhead: "Sub-head" } });
  }, [post]);
  useEffect(() => { load(); }, [load]);

  const done = async () => { setEdit(null); await refreshInit(); await load(); };
  const cats = data?.categories ?? [];
  const people = data?.people ?? [];
  const groups = (data?.groups ?? []).slice().sort(byOrder);
  const L = data?.labels ?? { group: "Group", head: "Head", subhead: "Sub-head" };
  const grp = groups.find(g => g.code === groupSel) ?? groups[0];
  const heads = cats.filter(c => !c.parent_id && c.kind === kind && (c.group_code ?? "PERSONAL") === (grp?.code ?? "PERSONAL")).sort(byOrder);
  const subCount = (id: number) => cats.filter(c => c.parent_id === id).length;

  return (
    <div className="mx-auto w-full max-w-[560px] px-4">
      <TopBar back={BASE} title="Set up" sub={`${L.group}s, ${L.head.toLowerCase()}s and people`} />
      <Segmented className="mb-2" value={tab} onChange={setTab}
        options={[{ v: "HEADS", label: `${L.group}s & ${L.head.toLowerCase()}s` }, { v: "PEOPLE", label: "People" }]} />

      {data === null ? (
        <Card pad={false} className="mt-4">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className={cx("px-4 py-4", i < 3 && "border-b border-mf-line")}><Skeleton className="h-4 w-40" /></div>
          ))}
        </Card>
      ) : tab === "HEADS" ? (
        <>
          {/* the groups: tap to pick; the selected one can be renamed, reordered, switched off */}
          <SectionTitle>{L.group}</SectionTitle>
          <div className="-mx-4 mb-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {groups.map(g => (
              <button key={g.code} type="button" onClick={() => setGroupSel(g.code)} aria-pressed={grp?.code === g.code}
                className={cx("mf-noscale inline-flex h-10 shrink-0 items-center rounded-full px-4 text-[14px] font-semibold ring-1 ring-inset",
                  grp?.code === g.code ? "bg-mf-ink text-white ring-mf-ink" : "bg-mf-surface text-mf-ink-2 ring-mf-line",
                  !g.active && "opacity-55")}>
                {g.name}{!g.active && <span className="ml-1 text-[11px]">· off</span>}
              </button>
            ))}
            <button type="button" onClick={() => setEdit({ kind: "group", row: null })}
              className="mf-noscale inline-flex h-10 shrink-0 items-center gap-1 rounded-full px-4 text-[14px] font-semibold text-mf-ink-2 ring-1 ring-inset ring-dashed ring-mf-line">
              <IconPlus size={15} /> {L.group}
            </button>
          </div>
          {grp && (
            <button type="button" onClick={() => setEdit({ kind: "group", row: grp })}
              className="mb-3 px-1 text-[12.5px] font-semibold text-mf-ink-2 underline underline-offset-2">
              Edit “{grp.name}”{grp.is_library ? " · asks which library" : ""}
            </button>
          )}

          <Segmented className="mb-1" value={kind} onChange={setKind} options={[{ v: "EXPENSE", label: "Spending" }, { v: "INCOME", label: "Income" }]} />

          <SectionTitle>{`${L.head}s in ${grp?.name ?? ""}`}</SectionTitle>
          <Card pad={false} className="overflow-hidden">
            {heads.length === 0 ? (
              <p className="px-4 py-4 text-[13px] text-mf-ink-3">No {kind === "INCOME" ? "income" : "spending"} {L.head.toLowerCase()}s here yet.</p>
            ) : heads.map((h, i) => (
              <button key={h.id} type="button" onClick={() => setEdit({ kind: "head", row: h })}
                className={cx("mf-noscale flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-mf-bg", i < heads.length - 1 && "border-b border-mf-line", !h.active && "opacity-55")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-mf-ink">{h.name}{!h.active && <span className="ml-1.5 text-[11.5px] font-semibold text-mf-ink-3">off</span>}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-mf-ink-3">
                    {subCount(h.id)} {subCount(h.id) === 1 ? L.subhead.toLowerCase() : L.subhead.toLowerCase() + "s"} · {h.uses} {h.uses === 1 ? "entry" : "entries"}
                  </span>
                </span>
                {h.quick && <span className="rounded-full bg-mf-bg px-2 py-0.5 text-[11px] font-semibold text-mf-ink-2 ring-1 ring-inset ring-mf-line">Quick pick</span>}
                <IconChevron size={18} className="shrink-0 text-mf-ink-3" />
              </button>
            ))}
          </Card>
          <Button variant="secondary" full className="mt-3" onClick={() => setEdit({ kind: "head", row: null })}>
            <IconPlus size={17} /> Add a {L.head.toLowerCase()}
          </Button>

          <button type="button" onClick={() => setEdit({ kind: "labels" })}
            className="mt-5 w-full rounded-[14px] px-4 py-3 text-left text-[13px] text-mf-ink-3 ring-1 ring-inset ring-mf-line active:bg-mf-bg">
            The levels are called <b className="text-mf-ink-2">{L.group}</b> → <b className="text-mf-ink-2">{L.head}</b> → <b className="text-mf-ink-2">{L.subhead}</b>. Tap to rename them.
          </button>
          {cats.length === 0 && <Card className="mt-4"><Empty icon={<IconFolder size={22} />} title={`No ${L.head.toLowerCase()}s yet`} body="Add what you spend on and what money comes in for." /></Card>}
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

      <Sheet open={edit?.kind === "head"} onClose={() => setEdit(null)}
        title={edit?.kind === "head" ? (edit.row ? L.head : `New ${L.head.toLowerCase()} in ${grp?.name ?? ""}`) : ""}>
        {edit?.kind === "head" && grp && (
          <HeadForm key={edit.row?.id ?? "new"} row={edit.row} group={grp} groups={groups} kind={kind} all={cats} labels={L} onDone={done} onReload={load} />
        )}
      </Sheet>
      <Sheet open={edit?.kind === "group"} onClose={() => setEdit(null)}
        title={edit?.kind === "group" ? (edit.row ? L.group : `New ${L.group.toLowerCase()}`) : ""}>
        {edit?.kind === "group" && (
          <GroupForm key={edit.row?.code ?? "new"} row={edit.row} groups={groups} labels={L}
            onDone={async (code?: string) => { if (code) setGroupSel(code); await done(); }} />
        )}
      </Sheet>
      <Sheet open={edit?.kind === "labels"} onClose={() => setEdit(null)} title="Names of the levels">
        {edit?.kind === "labels" && <LabelsForm labels={L} onDone={done} />}
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

// ── a Head: name, quick pick, in use, order, group (while unused) and its Sub-heads ──
function HeadForm({ row, group, groups, kind, all, labels: L, onDone, onReload }: {
  row: Cat | null; group: Group; groups: Group[]; kind: string; all: Cat[]; labels: Labels;
  onDone: () => Promise<void>; onReload: () => Promise<void>;
}) {
  const { post, showToast } = useMF();
  const [name, setName] = useState(row?.name ?? "");
  const [quick, setQuick] = useState(row ? row.quick : true);
  const [active, setActive] = useState(row ? row.active : true);
  const [groupCode, setGroupCode] = useState(row?.group_code ?? group.code);
  const [busy, setBusy] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null);
  const k = row?.kind ?? kind;
  const siblings = all.filter(c => !c.parent_id && c.kind === k && (c.group_code ?? "PERSONAL") === (row?.group_code ?? group.code)).sort(byOrder);
  const subs = row ? all.filter(c => c.parent_id === row.id).sort(byOrder) : [];
  const clash = all.some(c => !c.parent_id && c.id !== row?.id && c.kind === k && (c.group_code ?? "PERSONAL") === groupCode && c.name.trim().toUpperCase() === name.trim().toUpperCase());
  const ok = !!name.trim() && !clash && !busy;

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("saveCategory", row
      ? { id: row.id, name, kind: k, group_code: groupCode, quick, active }
      : { name, kind: k, group_code: group.code, quick });
    setBusy(false);
    if (j) { showToast(row ? "Saved" : `${name.trim()} added`); await onDone(); }
  };
  const move = async (list: { id: number }[], idx: number, dir: -1 | 1) => {
    const t = idx + dir; if (t < 0 || t >= list.length) return;
    const order = list.map(x => x.id); [order[idx], order[t]] = [order[t], order[idx]];
    const j = await post("reorderSetup", { what: "categories", order }); if (j) await onReload();
  };
  const addSub = async () => {
    const n = newSub.trim(); if (!n || !row) return;
    if (subs.some(s => s.name.trim().toUpperCase() === n.toUpperCase())) { showToast(`${n} is already there`, "error"); return; }
    const j = await post("saveCategory", { name: n, parent_id: row.id });
    if (j) { setNewSub(""); showToast(`${n} added`); await onReload(); }
  };
  const saveSub = async (sub: Cat, patch: Partial<Cat>) => {
    const j = await post("saveCategory", { id: sub.id, name: patch.name ?? sub.name, parent_id: row!.id, quick: sub.quick, active: patch.active ?? sub.active });
    if (j) { setRenaming(null); await onReload(); }
  };
  const idx = row ? siblings.findIndex(x => x.id === row.id) : -1;

  return (
    <div className="pb-2">
      <p className="mb-3 px-1 text-[12.5px] text-mf-ink-3">{groups.find(g => g.code === groupCode)?.name} · {k === "INCOME" ? "Income" : "Spending"}</p>
      <Field label="Name" error={clash ? `"${name.trim()}" already exists here.` : undefined}>
        <TextInput value={name} onChange={e => setName(e.target.value)} placeholder={k === "INCOME" ? "Salary" : "Electricity"} autoFocus={!row}
          onKeyDown={e => { if (e.key === "Enter") save(); }} />
      </Field>
      <SwitchRow label="Quick pick" hint="Shows first when you add an entry" on={quick} onChange={setQuick} last={!row} />
      {row && <SwitchRow label="In use" hint="Off hides it from new entries. Past entries keep it." on={active} onChange={setActive} last />}
      {row && (
        <div className="mt-3">
          <div className="mb-1.5 px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-mf-ink-3">{L.group}</div>
          {row.uses > 0 ? (
            <p className="px-1 text-[12.5px] text-mf-ink-3">Stays in {groups.find(g => g.code === row.group_code)?.name} — {row.uses} {row.uses === 1 ? "entry uses" : "entries use"} it.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {groups.filter(g => g.active || g.code === groupCode).map(g => (
                <button key={g.code} type="button" onClick={() => setGroupCode(g.code)} aria-pressed={groupCode === g.code}
                  className={cx("mf-noscale h-9 rounded-full px-3.5 text-[13px] font-semibold ring-1 ring-inset",
                    groupCode === g.code ? "bg-mf-ink text-white ring-mf-ink" : "bg-mf-surface text-mf-ink-2 ring-mf-line")}>{g.name}</button>
              ))}
            </div>
          )}
        </div>
      )}
      <Button size="lg" full className="mt-4" disabled={!ok} loading={busy} loadingText="Saving…" onClick={save}>
        {row ? "Save" : `Add ${L.head.toLowerCase()}`}
      </Button>

      {row && (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={idx <= 0} onClick={() => move(siblings, idx, -1)}>Move up</Button>
            <Button variant="secondary" disabled={idx < 0 || idx >= siblings.length - 1} onClick={() => move(siblings, idx, 1)}>Move down</Button>
          </div>

          <SectionTitle>{`${L.subhead}s (optional)`}</SectionTitle>
          <Card pad={false} className="overflow-hidden">
            {subs.length === 0 && <p className="px-4 py-3.5 text-[13px] text-mf-ink-3">None yet. Add one below if you want more detail, e.g. Swiggy under Food.</p>}
            {subs.map((sb, i) => (
              <div key={sb.id} className={cx("flex min-h-[52px] items-center gap-1 px-3 py-1.5", i < subs.length - 1 && "border-b border-mf-line", !sb.active && "opacity-55")}>
                {renaming?.id === sb.id ? (
                  <>
                    <input value={renaming.name} onChange={e => setRenaming({ id: sb.id, name: e.target.value })} autoFocus aria-label="New name"
                      onKeyDown={e => { if (e.key === "Enter" && renaming.name.trim()) saveSub(sb, { name: renaming.name.trim() }); if (e.key === "Escape") setRenaming(null); }}
                      className="h-10 min-w-0 flex-1 rounded-[10px] border border-mf-line bg-mf-surface px-3 text-[14px] outline-none focus:border-mf-ink" />
                    <Button className="h-10 px-3" onClick={() => renaming.name.trim() && saveSub(sb, { name: renaming.name.trim() })}>Save</Button>
                  </>
                ) : (
                  <>
                    <span className="min-w-0 flex-1 truncate px-1 text-[14.5px] text-mf-ink">{sb.name}<span className="ml-1.5 text-[11.5px] text-mf-ink-3">{sb.uses} {sb.uses === 1 ? "entry" : "entries"}{!sb.active ? " · off" : ""}</span></span>
                    <button type="button" aria-label={`Move ${sb.name} up`} disabled={i === 0} onClick={() => move(subs, i, -1)} className="grid h-9 w-9 place-items-center rounded-full text-mf-ink-2 disabled:opacity-30">↑</button>
                    <button type="button" aria-label={`Move ${sb.name} down`} disabled={i === subs.length - 1} onClick={() => move(subs, i, 1)} className="grid h-9 w-9 place-items-center rounded-full text-mf-ink-2 disabled:opacity-30">↓</button>
                    <button type="button" onClick={() => setRenaming({ id: sb.id, name: sb.name })} className="h-9 rounded-full px-2 text-[12.5px] font-semibold text-mf-ink-2">Rename</button>
                    <button type="button" onClick={() => saveSub(sb, { active: !sb.active })} className="h-9 rounded-full px-2 text-[12.5px] font-semibold text-mf-ink-3">{sb.active ? "Off" : "On"}</button>
                  </>
                )}
              </div>
            ))}
          </Card>
          <div className="mt-2 flex gap-2">
            <input value={newSub} onChange={e => setNewSub(e.target.value)} placeholder={`New ${L.subhead.toLowerCase()}`} aria-label={`New ${L.subhead.toLowerCase()}`}
              onKeyDown={e => { if (e.key === "Enter") addSub(); }}
              className="h-12 min-w-0 flex-1 rounded-[14px] border border-mf-line bg-mf-surface px-3.5 text-[15px] outline-none focus:border-mf-ink" />
            <Button className="h-12 px-4" disabled={!newSub.trim()} onClick={addSub}>Add</Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── a Group: name, in use, order. Personal and Library always stay on. ──
function GroupForm({ row, groups, labels: L, onDone }: { row: Group | null; groups: Group[]; labels: Labels; onDone: (code?: string) => Promise<void> }) {
  const { post, showToast } = useMF();
  const [name, setName] = useState(row?.name ?? "");
  const [active, setActive] = useState(row ? row.active : true);
  const [busy, setBusy] = useState(false);
  const builtIn = row?.code === "PERSONAL" || row?.code === "LIBRARY";
  const clash = groups.some(g => g.code !== row?.code && g.name.trim().toUpperCase() === name.trim().toUpperCase());
  const ok = !!name.trim() && !clash && !busy;
  const idx = row ? groups.findIndex(g => g.code === row.code) : -1;

  const save = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("saveGroup", row ? { code: row.code, name, active: builtIn ? true : active } : { name });
    setBusy(false);
    if (j) { showToast(row ? "Saved" : `${name.trim()} added`); await onDone(j.code); }
  };
  const move = async (dir: -1 | 1) => {
    const t = idx + dir; if (!row || t < 0 || t >= groups.length) return;
    const order = groups.map(g => g.code); [order[idx], order[t]] = [order[t], order[idx]];
    const j = await post("reorderSetup", { what: "groups", order }); if (j) await onDone(row.code);
  };

  return (
    <div className="pb-2">
      <Field label="Name" error={clash ? `"${name.trim()}" already exists.` : undefined}>
        <TextInput value={name} onChange={e => setName(e.target.value)} placeholder="Business" autoFocus={!row}
          onKeyDown={e => { if (e.key === "Enter") save(); }} />
      </Field>
      {row?.is_library && <p className="-mt-1 mb-3 px-1 text-[12.5px] text-mf-ink-3">Entries in this {L.group.toLowerCase()} also ask which library or branch.</p>}
      {row && !builtIn && <SwitchRow label="In use" hint="Off hides it from new entries. Past entries keep it." on={active} onChange={setActive} last />}
      {row && builtIn && <p className="mb-2 px-1 text-[12.5px] text-mf-ink-3">{row.name} is built in, so it always stays on. You can rename it.</p>}
      <Button size="lg" full className="mt-4" disabled={!ok} loading={busy} loadingText="Saving…" onClick={save}>
        {row ? "Save" : `Add ${L.group.toLowerCase()}`}
      </Button>
      {row && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" disabled={idx <= 0} onClick={() => move(-1)}>Move left</Button>
          <Button variant="secondary" disabled={idx < 0 || idx >= groups.length - 1} onClick={() => move(1)}>Move right</Button>
        </div>
      )}
    </div>
  );
}

// ── the names of the three levels ──
function LabelsForm({ labels, onDone }: { labels: Labels; onDone: () => Promise<void> }) {
  const { post, showToast } = useMF();
  const [g, setG] = useState(labels.group);
  const [h, setH] = useState(labels.head);
  const [sb, setSb] = useState(labels.subhead);
  const [busy, setBusy] = useState(false);
  const ok = !!g.trim() && !!h.trim() && !!sb.trim() && !busy;
  const save = async () => {
    if (!ok) return;
    setBusy(true);
    const j = await post("saveLabels", { group: g.trim(), head: h.trim(), subhead: sb.trim() });
    setBusy(false);
    if (j) { showToast("Names saved"); await onDone(); }
  };
  return (
    <div className="pb-2">
      <p className="mb-3 px-1 text-[12.5px] text-mf-ink-3">Only the names on screen change. Everything you recorded stays where it is.</p>
      <Field label="Top level (e.g. Group, Category)"><TextInput value={g} onChange={e => setG(e.target.value)} /></Field>
      <Field label="Second level (e.g. Head)"><TextInput value={h} onChange={e => setH(e.target.value)} /></Field>
      <Field label="Third level (e.g. Sub-head)"><TextInput value={sb} onChange={e => setSb(e.target.value)} /></Field>
      <Button size="lg" full className="mt-2" disabled={!ok} loading={busy} loadingText="Saving…" onClick={save}>Save names</Button>
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
