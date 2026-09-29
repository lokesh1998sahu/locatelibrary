// MF 2.0 — server handlers.  route.ts -> _handlers.ts -> _db.ts (shared with LMA).
// Every balance figure comes from fin.v_account_balance, which is also what
// Recount rebuilds to. Nothing computes a balance a second way.

import sql from "../lma960805/_db";

const up = (v: unknown) => String(v ?? "").trim().toUpperCase();
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const money = (v: unknown) => Math.round(num(v) * 100) / 100;

function isoDate(v: unknown): string {
  const s = String(v ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Give a date as YYYY-MM-DD.");
  return s;
}

// ── reference data: cheap indexed lookups, safe on every app open ─────
// Deliberately excludes anything that scans fin.entry_lines without a date
// bound. That lives in initLive() and runs only when the owner asks.
// A date from the database (Date object or text) as plain YYYY-MM-DD.
function ymdOf(v: unknown): string {
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  return String(v ?? "").slice(0, 10);
}

async function initData() {
  const [accounts, categories, people, routes, libraries, groups, labels] = await Promise.all([
    // select * so this keeps working before mf-balance-now-setup.sql adds its columns
    sql`select * from fin.v_account_balance where active order by is_liability, balance desc nulls last`,
    sql`select id, code, name, kind, quick, group_code, parent_id, sort from fin.categories where active order by sort, name`,
    sql`select id, name, quick from fin.people where active order by quick desc, name`,
    sql`select display_code, bank_code, settlement_days from fin.v_routes_mf order by display_code`,
    sql`select l.s_no, l.library_code,
               coalesce(l.display_name, l.library_name, l.library_code) as label,
               l.has_branches, b.branch_code, b.branch_display
        from public.libraries l
        left join public.library_branches b
               on b.library_code = l.library_code and coalesce(b.active, true)
        where coalesce(l.active, true)
        order by l.s_no, b.s_no`,
    sql`select code, name, is_library, sort from fin.groups where active order by sort, name`,
    sql`select key, value from fin.labels`,
  ]) as any[][];

  return {
    accounts: accounts.map((a) => ({
      id: Number(a.account_id),
      bank_code: a.bank_code,
      bank_name: a.bank_name ?? a.bank_code,
      owner_name: a.owner_name ?? "",
      acct_type: a.acct_type,
      is_liability: !!a.is_liability,
      is_set_up: !!a.is_set_up,
      opening_balance: a.opening_balance == null ? null : num(a.opening_balance),
      opening_date: a.opening_date ? ymdOf(a.opening_date) : null,
      // "balance" is what the bank should show TODAY; the parts dated later are separate
      balance: a.balance == null ? null : num(a.balance_now ?? a.balance),
      balance_total: a.balance == null ? null : num(a.balance),
      incoming: num(a.incoming ?? 0),                  // library fees landing after today
      dated_later: num(a.dated_later ?? 0),            // MF entries dated after today
      lands_by: a.lands_by ? ymdOf(a.lands_by) : null,
    })),
    categories: categories.map((c) => ({
      id: Number(c.id), code: c.code, name: c.name, kind: c.kind, quick: !!c.quick,
      group_code: c.group_code ?? null, parent_id: c.parent_id == null ? null : Number(c.parent_id), sort: Number(c.sort ?? 0),
    })),
    groups: groups.map((g) => ({ code: g.code, name: g.name, is_library: !!g.is_library, sort: Number(g.sort ?? 0) })),
    labels: labelsOf(labels),
    people: people.map((p) => ({ id: Number(p.id), name: p.name, quick: !!p.quick })),
    routes: routes.map((r) => ({ code: r.display_code, bank_code: r.bank_code, settlement_days: Number(r.settlement_days ?? 0) })),
    libraries: libraries.map((l) => ({
      library_code: up(l.library_code),
      label: String(l.label ?? l.library_code),
      branch_code: l.branch_code ? up(l.branch_code) : null,
      branch_label: l.branch_display ? String(l.branch_display) : null,
    })),
  };
}

// ── the live half: net worth + scheduled-payment alerts ───────────────
// These aggregates scan every entry line ever written, so they run only when
// the owner taps "Show where you stand" on Home. All money maths stays here;
// the client never sums a balance of its own.
async function initLive() {
  const [balances, extra] = await Promise.all([
    sql`select is_liability, balance from fin.v_account_balance
        where active and balance is not null`,
    sql`select
      coalesce((select sum(l.amount) from fin.entry_lines l join fin.entries e on e.id = l.entry_id
                where l.line_kind = 'RECEIVABLE' and e.voided = false), 0) as receivable,
      coalesce((select sum(l.amount) from fin.entry_lines l join fin.entries e on e.id = l.entry_id
                where l.line_kind = 'PAYABLE' and e.voided = false), 0) as payable,
      coalesce((select sum(coalesce(v.current_value, v.cost)) from fin.v_asset_current v
                join fin.assets a on a.id = v.asset_id
                where a.active and a.nature = 'HAVE'), 0) as assets_have,
      coalesce((select sum(coalesce(v.current_value, v.cost)) from fin.v_asset_current v
                join fin.assets a on a.id = v.asset_id
                where a.active and a.nature = 'OWE'), 0) as assets_owe,
      coalesce((select sum(l.amount) from fin.entry_lines l join fin.entries e on e.id = l.entry_id
                join fin.reserves r on r.id = l.reserve_id
                where l.line_kind = 'RESERVE' and e.voided = false and r.nature = 'HAVE'), 0) as res_have,
      coalesce((select sum(l.amount) from fin.entry_lines l join fin.entries e on e.id = l.entry_id
                join fin.reserves r on r.id = l.reserve_id
                where l.line_kind = 'RESERVE' and e.voided = false and r.nature = 'OWE'), 0) as res_owe,
      (select count(*)::int from fin.scheduled_payments
        where active and next_due <= current_date + 7) as due_soon,
      (select count(*)::int from fin.scheduled_payments
        where active and next_due < current_date) as overdue,
      (select name from fin.scheduled_payments
        where active and next_due <= current_date + 7 order by next_due, name limit 1) as next_name,
      (select min(next_due) from fin.scheduled_payments
        where active and next_due <= current_date + 7) as next_due`,
  ]) as any[][];

  let haves = 0, owes = 0;
  for (const a of balances) {
    if (a.is_liability) owes += num(a.balance); else haves += num(a.balance);
  }

  const x = (extra as any[])[0] ?? {};
  const due = Number(x.due_soon ?? 0);
  const h = haves + num(x.receivable) + num(x.assets_have) + num(x.res_have);
  const o = owes  + num(x.payable)    + num(x.assets_owe)  + num(x.res_owe);

  return {
    alerts: due > 0 ? {
      due_soon: due,
      overdue: Number(x.overdue ?? 0),
      next_name: x.next_name ?? null,
      next_due: x.next_due ? ymdOf(x.next_due) : null,
    } : null,
    totals: {
      haves: money(h), owes: money(o), net: money(h - o),
      in_accounts: money(haves), owed_to_you: money(x.receivable),
      you_owe_people: money(x.payable), in_assets: money(x.assets_have),
    },
  };
}

// ── add expense ──────────────────────────────────────────────────────
// legs:  [{ account_id, amount, date }]        money that actually left
// split: [{ category_id, amount, library_code, branch_code }]  what it was for
// owed:  { person_id, amount } | null          the unpaid remainder
//
// The database refuses anything that does not balance, so this handler
// writes plainly and lets the guard rail be the judge.
// ── Groups → Heads → Sub-heads ────────────────────────────────────────
// A Group (Personal, Library, or any you add) is stored on each entry in
// fin.entries.world. Heads are fin.categories rows with a group_code; a
// Sub-head is a fin.categories row whose parent_id is its Head. Only the
// Library group adds the extra "which library / branch" layer.
function labelsOf(rows: any[]) {
  const m: Record<string, string> = { group: "Group", head: "Head", subhead: "Sub-head" };
  for (const r of rows || []) if (r?.key && String(r.value || "").trim()) m[String(r.key)] = String(r.value).trim();
  return m;
}
async function groupOf(tx: any, code: string) {
  const g = (await tx`select code, is_library, active from fin.groups where code = ${code} limit 1`) as any[];
  if (!g.length) throw new Error("Choose a group.");
  return { code: String(g[0].code), is_library: !!g[0].is_library };
}
// head must be of this kind and this group; the sub-head (optional) must sit under it
async function checkHeads(tx: any, kind: string, group: string, headId: number, subId: number | null) {
  const h = (await tx`select id, kind, group_code, parent_id from fin.categories where id = ${headId} limit 1`) as any[];
  if (!h.length || h[0].parent_id != null) throw new Error("Choose a head.");
  if (h[0].kind !== kind) throw new Error("That head is not an " + kind.toLowerCase() + " head.");
  if (h[0].group_code != null && h[0].group_code !== group) throw new Error("That head belongs to another group.");
  if (subId) {
    const sh = (await tx`select parent_id from fin.categories where id = ${subId} limit 1`) as any[];
    if (!sh.length || Number(sh[0].parent_id) !== headId) throw new Error("That sub-head belongs to another head.");
  }
}

async function addExpense(p: any) {
  const entryDate = isoDate(p?.entry_date);
  const world = up(p?.world) || "PERSONAL";
  const subheadId = Number(p?.subhead_id) || null;
  const legs = Array.isArray(p?.legs) ? p.legs : [];
  const split = Array.isArray(p?.split) ? p.split : [];
  const owed = p?.owed && p.owed.person_id ? p.owed : null;
  const editId = Number(p?.entry_id) || 0;

  if (!split.length) throw new Error("Choose what the expense was for.");
  if (!legs.length && !owed) throw new Error("Add at least one payment, or say who is owed.");

  const total = money(split.reduce((s: number, r: any) => s + num(r.amount), 0));
  if (total <= 0) throw new Error("The amount must be more than zero.");

  const paid = money(legs.reduce((s: number, r: any) => s + num(r.amount), 0));
  const owing = money(owed ? num(owed.amount) : 0);
  if (money(paid + owing) !== total) {
    throw new Error(`Payments and the amount owed come to ${money(paid + owing)}, but the expense is ${total}.`);
  }

  return await sql.begin(async (tx: any) => {
    const grp = await groupOf(tx, world);
    for (const s of split) await checkHeads(tx, "EXPENSE", world, Number(s.category_id), subheadId);
    let entryId: number;
    if (editId) {
      const upd = (await tx`
        update fin.entries set entry_date = ${entryDate}::date,
               description = ${String(p?.description ?? "").trim() || null},
               world = ${world}, total = ${total}
        where id = ${editId} and voided = false returning id
      `) as any[];
      if (!upd.length) throw new Error("That entry no longer exists.");
      entryId = editId;
      // Rewriting the lines is safe: the balance rule is checked at commit,
      // once the replacements are in, never in between.
      await tx`delete from fin.entry_lines where entry_id = ${entryId}`;
    } else {
      const ins = (await tx`
        insert into fin.entries (entry_type, entry_date, description, world, total)
        values ('EXPENSE', ${entryDate}::date, ${String(p?.description ?? "").trim() || null}, ${world}, ${total})
        returning id
      `) as any[];
      entryId = Number(ins[0].id);
    }

    for (const s of split) {
      await tx`insert into fin.entry_lines
        (entry_id, line_kind, category_id, subhead_id, amount, line_date, library_code, branch_code)
        values (${entryId}, 'EXPENSE', ${Number(s.category_id)}, ${subheadId}, ${money(s.amount)}, ${entryDate}::date,
                ${grp.is_library ? up(s.library_code) || null : null},
                ${grp.is_library ? up(s.branch_code) || null : null})`;
    }

    for (const l of legs) {
      await tx`insert into fin.entry_lines
        (entry_id, line_kind, account_id, amount, line_date, route_code)
        values (${entryId}, 'ACCOUNT', ${Number(l.account_id)}, ${-Math.abs(money(l.amount))},
                ${isoDate(l.date || entryDate)}::date, ${l.route_code ? up(l.route_code) : null})`;
    }

    if (owed) {
      await tx`insert into fin.entry_lines
        (entry_id, line_kind, person_id, amount, line_date)
        values (${entryId}, 'PAYABLE', ${Number(owed.person_id)}, ${owing}, ${entryDate}::date)`;
    }

    return { entry_id: entryId, total };
  });
}

// ── warn before writing into a period already reconciled ─────────────
async function checkConflicts(p: any) {
  const onDate = isoDate(p?.entry_date);
  const ids = (Array.isArray(p?.account_ids) ? p.account_ids : []).map(Number).filter(Boolean);
  if (!ids.length) return { conflicts: [] };
  const rows = (await sql`
    select a.id, a.bank_name, a.bank_code, max(c.checked_on) as checked_through
    from fin.accounts a join fin.checks c on c.account_id = a.id
    where a.id = any(${ids}) and c.checked_on >= ${onDate}::date
    group by a.id, a.bank_name, a.bank_code
  `) as any[];
  return {
    conflicts: rows.map((r) => ({
      account_id: Number(r.id),
      name: r.bank_name ?? r.bank_code,
      checked_through: r.checked_through,
    })),
  };
}

// ── possible duplicate: same money, same day, same account ───────────
async function findPossibleDuplicate(p: any) {
  const onDate = isoDate(p?.entry_date);
  const amount = money(p?.amount);
  const accountId = Number(p?.account_id) || 0;
  if (!accountId || amount <= 0) return { duplicate: null };
  const rows = (await sql`
    select e.id, e.description, e.entry_date
    from fin.entries e join fin.entry_lines l on l.entry_id = e.id
    where e.voided = false and e.entry_type = 'EXPENSE' and e.entry_date = ${onDate}::date
      and l.line_kind = 'ACCOUNT' and l.account_id = ${accountId}
      and abs(l.amount) = ${amount}
    limit 1
  `) as any[];
  return { duplicate: rows.length ? { id: Number(rows[0].id), description: rows[0].description ?? "" } : null };
}

// ── masters: accounts, categories, people ────────────────────────────
// bank_code is never editable — the database refuses it, and the UI never
// offers it. Everything else about an account is the owner's to change.
async function saveAccount(p: any) {
  const id = Number(p?.id);
  if (!id) throw new Error("Which account?");
  const openingBal  = p?.opening_balance === null || p?.opening_balance === "" ? null : money(p?.opening_balance);
  const openingDate = p?.opening_date ? isoDate(p.opening_date) : null;
  if (openingBal !== null && !openingDate) throw new Error("An opening balance needs the date it was true on.");

  const r = (await sql`
    update fin.accounts set
      bank_name       = ${String(p?.bank_name ?? "").trim() || null},
      owner_name      = ${String(p?.owner_name ?? "").trim() || null},
      acct_type       = ${up(p?.acct_type) || "BANK"},
      is_liability    = ${up(p?.acct_type) === "CREDIT_CARD"},
      opening_balance = ${openingBal},
      opening_date    = ${openingDate}::date,
      active          = ${p?.active === false ? false : true},
      quick           = ${!!p?.quick}
    where id = ${id}
  `) as any;
  if (!r.count) throw new Error("That account no longer exists.");
  return { saved: true };
}

function slugCode(name: string): string {
  const s = String(name).trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!s) throw new Error("Give it a name.");
  return s.slice(0, 40);
}

async function saveCategory(p: any) {
  const name = String(p?.name ?? "").trim();
  if (!name) throw new Error("Give it a name.");
  const id = Number(p?.id) || 0;
  const parentId = Number(p?.parent_id) || null;          // set → this is a Sub-head
  let kind = up(p?.kind) === "INCOME" ? "INCOME" : "EXPENSE";
  let group = up(p?.group_code) || null;
  if (parentId) {                                          // a sub-head follows its head
    const h = (await sql`select kind, group_code, parent_id from fin.categories where id = ${parentId} limit 1`) as any[];
    if (!h.length || h[0].parent_id != null) throw new Error("A sub-head must sit under a head.");
    kind = h[0].kind; group = h[0].group_code ?? null;
  } else if (!group) throw new Error("Choose the group this head belongs to.");
  if (group) {
    const g = (await sql`select 1 from fin.groups where code = ${group} limit 1`) as any[];
    if (!g.length) throw new Error("That group no longer exists.");
  }

  if (id) {
    const cur = (await sql`select group_code, parent_id from fin.categories where id = ${id} limit 1`) as any[];
    if (!cur.length) throw new Error("That item no longer exists.");
    // moving a head to another group is allowed only while nothing is recorded under it
    if (!parentId && (cur[0].group_code ?? null) !== group) {
      const used = (await sql`select 1 from fin.entry_lines where category_id = ${id} or subhead_id = ${id} limit 1`) as any[];
      if (used.length) throw new Error("Entries already use this head, so it stays in its group. Add a new head in the other group instead.");
    }
    await sql`
      update fin.categories set name = ${name}, kind = ${kind}, group_code = ${group}, parent_id = ${parentId},
             quick = ${!!p?.quick}, active = ${p?.active === false ? false : true}
      where id = ${id}`;
    if (!parentId) await sql`update fin.categories set kind = ${kind}, group_code = ${group} where parent_id = ${id}`;   // sub-heads follow
    return { saved: true, id };
  }

  let code = slugCode((parentId ? "S" + parentId + " " : "") + name);
  for (let k = 2; ; k++) {
    const dup = (await sql`select 1 from fin.categories where code = ${code} limit 1`) as any[];
    if (!dup.length) break;
    code = slugCode((parentId ? "S" + parentId + " " : "") + name) + "_" + k;
  }
  const mx = (await sql`select coalesce(max(sort), 0) + 10 as s from fin.categories`) as any[];
  const ins = (await sql`
    insert into fin.categories (code, name, kind, quick, active, group_code, parent_id, sort)
    values (${code}, ${name}, ${kind}, ${!!p?.quick}, true, ${group}, ${parentId}, ${Number(mx[0].s)}) returning id
  `) as any[];
  return { saved: true, id: Number(ins[0].id) };
}

// Groups: add, rename, switch on/off. Personal and Library always exist.
async function saveGroup(p: any) {
  const name = String(p?.name ?? "").trim();
  if (!name) throw new Error("Give the group a name.");
  const code = up(p?.code);
  if (code) {
    const r = (await sql`update fin.groups set name = ${name}, active = ${p?.active === false ? false : true}
                         where code = ${code}`) as any;
    if (!r.count) throw new Error("That group no longer exists.");
    return { saved: true, code };
  }
  let c = slugCode(name) || "GROUP";
  for (let k = 2; ; k++) {
    const dup = (await sql`select 1 from fin.groups where code = ${c} limit 1`) as any[];
    if (!dup.length) break;
    c = (slugCode(name) || "GROUP") + "_" + k;
  }
  const mx = (await sql`select coalesce(max(sort), 0) + 10 as s from fin.groups`) as any[];
  await sql`insert into fin.groups (code, name, is_library, active, sort) values (${c}, ${name}, false, true, ${Number(mx[0].s)})`;
  return { saved: true, code: c };
}

// Order of groups, or of heads/sub-heads: the list comes in the order wanted.
async function reorderSetup(p: any) {
  const what = String(p?.what || "");
  const ids: any[] = Array.isArray(p?.order) ? p.order : [];
  if (!ids.length) return { saved: true };
  return await sql.begin(async (tx: any) => {
    for (let k = 0; k < ids.length; k++) {
      if (what === "groups") await tx`update fin.groups set sort = ${(k + 1) * 10} where code = ${up(ids[k])}`;
      else await tx`update fin.categories set sort = ${(k + 1) * 10} where id = ${Number(ids[k])}`;
    }
    return { saved: true };
  });
}

// The level names themselves (Group / Head / Sub-head) can be renamed.
async function saveLabels(p: any) {
  return await sql.begin(async (tx: any) => {
    for (const key of ["group", "head", "subhead"]) {
      const v = String(p?.[key] ?? "").trim();
      if (!v) continue;
      await tx`insert into fin.labels (key, value) values (${key}, ${v}) on conflict (key) do update set value = excluded.value`;
    }
    return { saved: true };
  });
}

// ── Set up: every category and person, switched-off ones included ─────
// initData sends only active ones (that is what the entry screens need);
// Set up needs the rest too, so a switched-off item can be brought back.
async function masters() {
  const [categories, people, groups, labels] = await Promise.all([
    sql`select c.id, c.code, c.name, c.kind, c.quick, c.active, c.group_code, c.parent_id, c.sort,
               (select count(*)::int from fin.entry_lines l where l.category_id = c.id or l.subhead_id = c.id) as uses
          from fin.categories c order by c.sort, c.name`,
    sql`select id, name, phone, quick, active from fin.people order by name`,
    sql`select code, name, is_library, active, sort from fin.groups order by sort, name`,
    sql`select key, value from fin.labels`,
  ]);
  return {
    groups: (groups as any[]).map((g) => ({ code: g.code, name: g.name, is_library: !!g.is_library, active: !!g.active, sort: Number(g.sort ?? 0) })),
    labels: labelsOf(labels as any[]),
    categories: (categories as any[]).map((c) => ({
      id: Number(c.id), code: c.code, name: c.name, kind: c.kind, quick: !!c.quick, active: !!c.active,
      group_code: c.group_code ?? null, parent_id: c.parent_id == null ? null : Number(c.parent_id),
      sort: Number(c.sort ?? 0), uses: Number(c.uses ?? 0),
    })),
    people: (people as any[]).map((p) => ({
      id: Number(p.id), name: p.name, phone: p.phone ?? "", quick: !!p.quick, active: !!p.active,
    })),
  };
}
async function savePerson(p: any) {
  const name = String(p?.name ?? "").trim();
  if (!name) throw new Error("Give the person a name.");
  const id = Number(p?.id) || 0;

  if (id) {
    const r = (await sql`
      update fin.people set name = ${name}, phone = ${String(p?.phone ?? "").trim() || null},
             quick = ${!!p?.quick}, active = ${p?.active === false ? false : true}
      where id = ${id}
    `) as any;
    if (!r.count) throw new Error("That person no longer exists.");
    return { saved: true, id };
  }

  const dup = (await sql`select 1 from fin.people where upper(name) = ${name.toUpperCase()} limit 1`) as any[];
  if (dup.length) throw new Error(`"${name}" is already on the list.`);
  const ins = (await sql`
    insert into fin.people (name, phone, quick, active)
    values (${name}, ${String(p?.phone ?? "").trim() || null}, ${!!p?.quick}, true) returning id
  `) as any[];
  return { saved: true, id: Number(ins[0].id) };
}

// ── passbook ─────────────────────────────────────────────────────────
// One account, every movement, oldest→newest, with the balance after each
// line. LMA's collections and MF 2.0's own entries are merged here — they are
// the same money and belong in the same column.
//
// The running balance is built forward from the opening balance so the last
// row must equal fin.v_account_balance. If it ever does not, that is a bug
// worth knowing about, not a rounding quirk to paper over.
async function ledger(p: any) {
  const accountId = Number(p?.account_id) || 0;
  const limit = Math.min(400, Math.max(20, Number(p?.limit) || 120));
  // World filter is offered ONLY on the all-accounts "recent" view, which has
  // no running balance. Never on a single account: filtering rows there would
  // make the balance column skip transactions and stop matching the bank.
  const wWorld = up(p?.world);
  const wScoped = !!wWorld;   // any group

  if (!accountId) {
    const rows = (await sql`
      select e.id, e.entry_date, e.entry_type, e.description, e.total, e.world, e.voided,
             (select c.name || coalesce(' · ' || sc.name, '') from fin.entry_lines cl
                join fin.categories c on c.id = cl.category_id
                left join fin.categories sc on sc.id = cl.subhead_id
               where cl.entry_id = e.id limit 1) as category
      from fin.entries e
      where e.voided = false
        and (${!wScoped} or e.world = ${wScoped ? wWorld : "PERSONAL"})
      order by e.entry_date desc, e.id desc
      limit ${limit}
    `) as any[];
    return {
      mode: "recent",
      rows: rows.map((r) => ({
        entry_id: Number(r.id), on_date: r.entry_date, kind: r.entry_type,
        label: r.description || r.category || r.entry_type,
        category: r.category ?? null,          // "Head · Sub-head", shown under the remark
        amount: -Math.abs(num(r.total)), balance: null, source: "MF", world: r.world,
      })),
    };
  }

  const accs = (await sql`
    select id, bank_code, bank_name, opening_balance, opening_date
    from fin.accounts where id = ${accountId} limit 1
  `) as any[];
  if (!accs.length) throw new Error("No such account.");
  const acc = accs[0];
  if (!acc.opening_date) {
    return { mode: "passbook", account: { id: accountId, name: acc.bank_name ?? acc.bank_code }, needs_setup: true, rows: [] };
  }

  const rows = (await sql`
    with mf as (
      select l.line_date as on_date, l.amount, e.entry_type as kind, e.id as entry_id,
             coalesce(nullif(btrim(e.description), ''),
                      (select c.name from fin.entry_lines cl join fin.categories c on c.id = cl.category_id
                        where cl.entry_id = e.id limit 1),
                      e.entry_type) as label,
             (select c.name || coalesce(' · ' || sc.name, '') from fin.entry_lines cl
                join fin.categories c on c.id = cl.category_id
                left join fin.categories sc on sc.id = cl.subhead_id
               where cl.entry_id = e.id limit 1) as category,
             e.world::text as world, 'MF' as source
      from fin.entry_lines l
      join fin.entries e on e.id = l.entry_id
      where l.line_kind = 'ACCOUNT' and l.account_id = ${accountId} and e.voided = false
    ),
    lma as (
      select i.on_date, i.amount, i.src as kind, null::bigint as entry_id,
             i.src || ' ' || i.ref as label, null::text as category, 'LIBRARY'::text as world, 'LMA' as source
      from fin.v_lma_income i
      where i.bank_code = ${acc.bank_code}
    )
    select * from (select * from mf union all select * from lma) x
    where x.on_date >= ${acc.opening_date}::date
    order by x.on_date asc, x.source asc, x.label asc
  `) as any[];

  let run = num(acc.opening_balance);
  const walked = rows.map((r) => {
    run = money(run + num(r.amount));
    return {
      entry_id: r.entry_id == null ? null : Number(r.entry_id),
      on_date: r.on_date, kind: r.kind, label: r.label, category: r.category ?? null,
      amount: money(r.amount), balance: run, source: r.source, world: r.world,
    };
  });

  // today in India, so the screen can mark rows that haven't reached the bank yet
  const istToday = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const lastNow = [...walked].reverse().find((r) => ymdOf(r.on_date) <= istToday);
  return {
    mode: "passbook",
    account: {
      id: accountId, name: acc.bank_name ?? acc.bank_code, bank_code: acc.bank_code,
      opening_balance: money(acc.opening_balance), opening_date: acc.opening_date ? ymdOf(acc.opening_date) : null,
    },
    needs_setup: false,
    today: istToday,
    balance_now: lastNow ? lastNow.balance : money(acc.opening_balance),   // what the bank should show today
    rows: walked.slice(-limit).reverse(),
    shown: Math.min(limit, walked.length),
    total: walked.length,
  };
}

// ── reconciliation check ─────────────────────────────────────────────
// The north star: an account's computed balance should equal the real one.
// A Check records that comparison on a date. Once recorded, everything on or
// before that date is confirmed — which is why backdating into a checked
// period is warned about elsewhere.
async function checkPrepare(p: any) {
  const accountId = Number(p?.account_id) || 0;
  const onDate = p?.on_date ? isoDate(p.on_date) : isoDate(new Date().toISOString().slice(0, 10));
  if (!accountId) throw new Error("Which account?");

  const rows = (await sql`
    select a.id, a.bank_code, a.bank_name, a.opening_balance, a.opening_date,
           coalesce(a.opening_balance, 0)
         + coalesce((select sum(l.amount) from fin.entry_lines l
                     join fin.entries e on e.id = l.entry_id
                     where l.line_kind = 'ACCOUNT' and l.account_id = a.id and e.voided = false
                       and l.line_date >= a.opening_date and l.line_date <= ${onDate}::date), 0)
         + coalesce((select sum(i.amount) from fin.v_lma_income i
                     where i.bank_code = a.bank_code
                       and i.on_date >= a.opening_date and i.on_date <= ${onDate}::date), 0) as app_balance
    from fin.accounts a where a.id = ${accountId} limit 1
  `) as any[];
  if (!rows.length) throw new Error("No such account.");
  const a = rows[0];
  if (!a.opening_date) {
    return { needs_setup: true, name: a.bank_name ?? a.bank_code, on_date: onDate };
  }

  const last = (await sql`
    select checked_on, real_balance, difference from fin.checks
    where account_id = ${accountId} order by checked_on desc limit 1
  `) as any[];

  return {
    needs_setup: false,
    account_id: accountId,
    name: a.bank_name ?? a.bank_code,
    bank_code: a.bank_code,
    on_date: onDate,
    app_balance: money(a.app_balance),
    last_check: last.length
      ? { checked_on: ymdOf(last[0].checked_on), real_balance: money(last[0].real_balance), difference: money(last[0].difference) }
      : null,
  };
}

// Saving a Check never silently changes a balance. If you ask it to settle a
// difference, it writes a visible ADJUSTMENT entry that you can find and undo
// later — the balance moves because of a recorded event, never by decree.
async function saveCheck(p: any) {
  const accountId = Number(p?.account_id) || 0;
  const onDate = isoDate(p?.on_date);
  const real = money(p?.real_balance);
  const app = money(p?.app_balance);
  const diff = money(real - app);
  if (!accountId) throw new Error("Which account?");

  return await sql.begin(async (tx: any) => {
    await tx`
      insert into fin.checks (account_id, checked_on, real_balance, app_balance, difference, note)
      values (${accountId}, ${onDate}::date, ${real}, ${app}, ${diff},
              ${String(p?.note ?? "").trim() || null})
      on conflict (account_id, checked_on) do update
        set real_balance = excluded.real_balance,
            app_balance  = excluded.app_balance,
            difference   = excluded.difference,
            note         = excluded.note
    `;

    if (!p?.settle || Math.abs(diff) < 0.005) {
      return { saved: true, difference: diff, adjusted: false };
    }

    const isIn = diff > 0;
    const code = isIn ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";
    const catRows = (await tx`
      insert into fin.categories (code, name, kind, quick, active)
      values (${code}, ${isIn ? "Unrecorded money in" : "Unrecorded money out"},
              ${isIn ? "INCOME" : "EXPENSE"}, false, true)
      on conflict (code) do update set active = true
      returning id
    `) as any[];
    const categoryId = Number(catRows[0].id);

    const ins = (await tx`
      insert into fin.entries (entry_type, entry_date, description, world, total)
      values ('ADJUSTMENT', ${onDate}::date,
              ${"Settled from a check on " + onDate}, 'PERSONAL', ${money(Math.abs(diff))})
      returning id
    `) as any[];
    const entryId = Number(ins[0].id);

    await tx`insert into fin.entry_lines (entry_id, line_kind, account_id, amount, line_date)
             values (${entryId}, 'ACCOUNT', ${accountId}, ${diff}, ${onDate}::date)`;
    await tx`insert into fin.entry_lines (entry_id, line_kind, category_id, amount, line_date)
             values (${entryId}, ${isIn ? "INCOME" : "EXPENSE"}, ${categoryId},
                     ${money(Math.abs(diff))}, ${onDate}::date)`;

    return { saved: true, difference: diff, adjusted: true, entry_id: entryId };
  });
}

// ── money in ─────────────────────────────────────────────────────────
// Personal or non-library income. Library fees never come through here —
// LMA records those and the bridge picks them up automatically.
async function addIncome(p: any) {
  const entryDate = isoDate(p?.entry_date);
  const world = up(p?.world) || "PERSONAL";
  const subheadId = Number(p?.subhead_id) || null;
  const accountId = Number(p?.account_id) || 0;
  const categoryId = Number(p?.category_id) || 0;
  const amount = money(p?.amount);

  if (amount <= 0) throw new Error("The amount must be more than zero.");
  if (!accountId) throw new Error("Where did the money land?");
  if (!categoryId) throw new Error("Choose what the money was for.");

  return await sql.begin(async (tx: any) => {
    const grp = await groupOf(tx, world);
    await checkHeads(tx, "INCOME", world, categoryId, subheadId);
    if (grp.is_library && !up(p?.library_code)) throw new Error("Which library was this for?");
    const ins = (await tx`
      insert into fin.entries (entry_type, entry_date, description, world, total)
      values ('INCOME', ${entryDate}::date, ${String(p?.description ?? "").trim() || null}, ${world}, ${amount})
      returning id
    `) as any[];
    const entryId = Number(ins[0].id);

    await tx`insert into fin.entry_lines (entry_id, line_kind, account_id, amount, line_date)
             values (${entryId}, 'ACCOUNT', ${accountId}, ${amount}, ${entryDate}::date)`;
    await tx`insert into fin.entry_lines (entry_id, line_kind, category_id, subhead_id, amount, line_date, library_code, branch_code)
             values (${entryId}, 'INCOME', ${categoryId}, ${subheadId}, ${amount}, ${entryDate}::date,
                     ${grp.is_library ? up(p?.library_code) || null : null},
                     ${grp.is_library ? up(p?.branch_code) || null : null})`;

    return { entry_id: entryId, total: amount };
  });
}

// ── move money ───────────────────────────────────────────────────────
// Between your own accounts. Net worth never changes, which is the whole
// point: a transfer is not income and paying a card is not an expense.
//
// The sign rule falls out of the account's nature and needs no special cases:
//   leaving an asset  -> that balance goes down
//   arriving at an asset -> up
//   arriving at a liability -> its owe balance goes DOWN (you paid it off)
//   leaving a liability -> its owe balance goes UP (a cash advance)
async function addMove(p: any) {
  const entryDate = isoDate(p?.entry_date);
  const fromId = Number(p?.from_account_id) || 0;
  const toId = Number(p?.to_account_id) || 0;
  const amount = money(p?.amount);

  if (amount <= 0) throw new Error("The amount must be more than zero.");
  if (!fromId || !toId) throw new Error("Choose both accounts.");
  if (fromId === toId) throw new Error("Pick two different accounts.");

  const accs = (await sql`
    select id, is_liability, bank_name, bank_code from fin.accounts where id in (${fromId}, ${toId})
  `) as any[];
  const from = accs.find((a) => Number(a.id) === fromId);
  const to = accs.find((a) => Number(a.id) === toId);
  if (!from || !to) throw new Error("One of those accounts no longer exists.");

  const fromAmount = from.is_liability ? amount : -amount;
  const toAmount = to.is_liability ? -amount : amount;

  const label = `${from.bank_name ?? from.bank_code} → ${to.bank_name ?? to.bank_code}`;

  return await sql.begin(async (tx: any) => {
    const ins = (await tx`
      insert into fin.entries (entry_type, entry_date, description, world, total)
      values ('MOVE', ${entryDate}::date, ${String(p?.description ?? "").trim() || label}, 'PERSONAL', ${amount})
      returning id
    `) as any[];
    const entryId = Number(ins[0].id);

    await tx`insert into fin.entry_lines (entry_id, line_kind, account_id, amount, line_date)
             values (${entryId}, 'ACCOUNT', ${fromId}, ${fromAmount}, ${entryDate}::date)`;
    await tx`insert into fin.entry_lines (entry_id, line_kind, account_id, amount, line_date)
             values (${entryId}, 'ACCOUNT', ${toId}, ${toAmount}, ${entryDate}::date)`;

    return { entry_id: entryId, total: amount };
  });
}

// ── people: what is owed, in both directions ─────────────────────────
// A receivable is money that will come back to you; a payable is money you owe.
// Both live on the same person, so one row can show a net position.
async function peopleBalances() {
  const rows = (await sql`
    select p.id, p.name, p.phone, p.quick,
           coalesce(sum(case when e.voided = false and l.line_kind = 'RECEIVABLE' then l.amount else 0 end), 0) as receivable,
           coalesce(sum(case when e.voided = false and l.line_kind = 'PAYABLE'    then l.amount else 0 end), 0) as payable
    from fin.people p
    left join fin.entry_lines l on l.person_id = p.id
    left join fin.entries e     on e.id = l.entry_id
    where p.active
    group by p.id, p.name, p.phone, p.quick
    order by p.quick desc, p.name
  `) as any[];

  return {
    people: rows.map((r) => {
      const receivable = money(r.receivable);
      const payable = money(r.payable);
      return {
        id: Number(r.id), name: r.name, phone: r.phone ?? "",
        receivable, payable, net: money(receivable - payable),
      };
    }),
  };
}

// Money crossing between an account and a person. Four shapes, one rule each,
// and every one balances without a special case:
//   LEND    you hand it over        account down, they owe you more
//   COLLECT they pay you back       account up,   they owe you less
//   BORROW  you take it             account up,   you owe them more
//   REPAY   you pay them back       account down, you owe them less
async function personMove(p: any) {
  const entryDate = isoDate(p?.entry_date);
  const personId = Number(p?.person_id) || 0;
  const accountId = Number(p?.account_id) || 0;
  const amount = money(p?.amount);
  const kind = up(p?.kind);

  if (!personId) throw new Error("Which person?");
  if (!accountId) throw new Error("Which account?");
  if (amount <= 0) throw new Error("The amount must be more than zero.");

  const shapes: Record<string, { line: "RECEIVABLE" | "PAYABLE"; acct: number; side: number; type: string; verb: string }> = {
    LEND:    { line: "RECEIVABLE", acct: -1, side:  1, type: "RECEIVABLE", verb: "Lent to" },
    COLLECT: { line: "RECEIVABLE", acct:  1, side: -1, type: "RECEIVABLE", verb: "Collected from" },
    BORROW:  { line: "PAYABLE",    acct:  1, side:  1, type: "PAYABLE",    verb: "Borrowed from" },
    REPAY:   { line: "PAYABLE",    acct: -1, side: -1, type: "PAYABLE",    verb: "Repaid" },
  };
  const shape = shapes[kind];
  if (!shape) throw new Error("Unknown action.");

  const who = (await sql`select name from fin.people where id = ${personId} limit 1`) as any[];
  if (!who.length) throw new Error("That person no longer exists.");

  return await sql.begin(async (tx: any) => {
    const ins = (await tx`
      insert into fin.entries (entry_type, entry_date, description, world, total)
      values (${shape.type}, ${entryDate}::date,
              ${String(p?.description ?? "").trim() || `${shape.verb} ${who[0].name}`},
              'PERSONAL', ${amount})
      returning id
    `) as any[];
    const entryId = Number(ins[0].id);

    await tx`insert into fin.entry_lines (entry_id, line_kind, account_id, amount, line_date)
             values (${entryId}, 'ACCOUNT', ${accountId}, ${money(amount * shape.acct)}, ${entryDate}::date)`;
    await tx`insert into fin.entry_lines (entry_id, line_kind, person_id, amount, line_date)
             values (${entryId}, ${shape.line}, ${personId}, ${money(amount * shape.side)}, ${entryDate}::date)`;

    return { entry_id: entryId, total: amount };
  });
}

// ── reports ──────────────────────────────────────────────────────────
// Library P&L: income comes from LMA on its settlement date, expenses from
// MF 2.0 on their own date. Both are already attributed to a library and,
// where one exists, a branch — so a branch stands on its own numbers.
async function reportPnl(p: any) {
  const from = isoDate(p?.from);
  const to = isoDate(p?.to);

  // Past library fees (LMA → "Past library fees") follow LMA's own rules here:
  // date-wise lines count on their date; month totals and the unknown remainder
  // count only when the period covers the whole month (with or without a bank).
  const pastReady = ((await sql`select 1 from information_schema.tables
                                 where table_schema = 'public' and table_name = 'past_fee_lines' limit 1`) as any[]).length > 0;
  const past = pastReady ? (await sql`
    select coalesce(nullif(upper(btrim(f.library)), ''), '?') as lib, upper(btrim(f.branch)) as br, sum(x.amount) as income
    from public.past_fees f
    join lateral (
      select l.amount from public.past_fee_lines l
       where l.past_fee_id = f.id and l.kind = 'DATE' and l.line_date between ${from}::date and ${to}::date
      union all
      select l.amount from public.past_fee_lines l
       where l.past_fee_id = f.id and l.kind = 'MONTH'
         and to_date(f.month || '-01', 'YYYY-MM-DD') >= ${from}::date
         and (to_date(f.month || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date <= ${to}::date
      union all
      select f.remainder where f.remainder > 0
         and to_date(f.month || '-01', 'YYYY-MM-DD') >= ${from}::date
         and (to_date(f.month || '-01', 'YYYY-MM-DD') + interval '1 month' - interval '1 day')::date <= ${to}::date
    ) x on true
    where f.status <> 'DELETED'
    group by 1, 2
  `) as any[] : [];

  const rows = (await sql`
    select lib, br, sum(income) as income, sum(expense) as expense
    from (
      select coalesce(nullif(btrim(i.library_code), ''), '?') as lib,
             coalesce(nullif(btrim(i.branch_code), ''), '')   as br,
             i.amount as income, 0::numeric as expense
      from fin.v_lma_income i
      where i.on_date between ${from}::date and ${to}::date
        and i.src <> 'PAST'            -- past fees are added below, by their own rules
      union all
      select coalesce(nullif(btrim(l.library_code), ''), '?'),
             coalesce(nullif(btrim(l.branch_code), ''), ''),
             0::numeric, l.amount
      from fin.entry_lines l
      join fin.entries e on e.id = l.entry_id
      where l.line_kind = 'EXPENSE' and e.voided = false and e.world = 'LIBRARY'
        and l.line_date between ${from}::date and ${to}::date
    ) x
    group by lib, br
    order by lib, br
  `) as any[];

  // merge the past fees into the library rows
  const merged = rows.map((r) => ({ ...r }));
  for (const pr of past) {
    const hit = merged.find((r) => r.lib === pr.lib && (r.br || "") === (pr.br || ""));
    if (hit) hit.income = num(hit.income) + num(pr.income);
    else merged.push({ lib: pr.lib, br: pr.br || "", income: num(pr.income), expense: 0 });
  }
  merged.sort((a, b) => (a.lib + "|" + a.br).localeCompare(b.lib + "|" + b.br));

  const out = merged.map((r) => {
    const income = money(r.income);
    const expense = money(r.expense);
    return {
      library_code: r.lib, branch_code: r.br || null,
      income, expense, profit: money(income - expense),
    };
  });

  return {
    from, to, rows: out,
    totals: {
      income: money(out.reduce((a, r) => a + r.income, 0)),
      expense: money(out.reduce((a, r) => a + r.expense, 0)),
      profit: money(out.reduce((a, r) => a + r.profit, 0)),
    },
  };
}

// Where the money went, by category. Library income is deliberately absent:
// it never passes through a category, it arrives from LMA against a bank.
async function reportSpending(p: any) {
  const from = isoDate(p?.from);
  const to = isoDate(p?.to);
  const world = up(p?.world);
  const scoped = !!world && world !== "ALL";   // any group

  const rows = (await sql`
    select c.id, c.name, c.kind, sc.name as sub, sum(l.amount) as total, count(distinct e.id)::int as entries
    from fin.entry_lines l
    join fin.entries e    on e.id = l.entry_id
    join fin.categories c on c.id = l.category_id
    left join fin.categories sc on sc.id = l.subhead_id
    where l.line_kind in ('EXPENSE', 'INCOME')
      and e.voided = false
      and l.line_date between ${from}::date and ${to}::date
      and (${!scoped} or e.world = ${scoped ? world : "PERSONAL"})
    group by c.id, c.name, c.kind, sc.name
  `) as any[];

  // one row per head, with its sub-heads inside (entries without a sub-head show as "No sub-head")
  const heads = new Map<number, any>();
  for (const r of rows) {
    const k = Number(r.id);
    const h = heads.get(k) || { name: r.name, kind: r.kind, total: 0, entries: 0, subs: [] as any[] };
    h.total = money(h.total + num(r.total)); h.entries += Number(r.entries);
    h.subs.push({ name: r.sub ?? null, total: money(r.total), entries: Number(r.entries) });
    heads.set(k, h);
  }
  const cats = Array.from(heads.values())
    .map((h) => ({ ...h, subs: h.subs.sort((a: any, b: any) => b.total - a.total) }))
    .sort((a, b) => b.total - a.total);

  return {
    from, to,
    expenses: cats.filter((c) => c.kind === "EXPENSE"),
    income: cats.filter((c) => c.kind === "INCOME"),
    spent: money(cats.filter((c) => c.kind === "EXPENSE").reduce((a, c) => a + c.total, 0)),
    earned: money(cats.filter((c) => c.kind === "INCOME").reduce((a, c) => a + c.total, 0)),
  };
}

// ── scheduled payments ───────────────────────────────────────────────
// These remind. They never record themselves — nothing in this file or the
// database moves money on a timer. A schedule only ever becomes an entry
// because you confirmed it actually happened.
// ── Scheduled payments ───────────────────────────────────────────────
// A schedule has a default split ("shares") of each instalment: your part
// (Group → Head → Sub-head, and the library for the Library group) and/or any
// number of people (their part is money you lend them — they owe it back).
// Every payment is ONE entry: the full amount leaves the account, your part is
// your expense, each person's part is lent to them. The split and the amount
// can be changed on every payment; the defaults are only a starting point.

type Share = { kind: "ME" | "PERSON"; amount: number; group?: string; head_id?: number | null; subhead_id?: number | null;
               library_code?: string | null; branch_code?: string | null; person_id?: number | null };

const STEP: Record<string, string> = { WEEKLY: "7 days", MONTHLY: "1 month", QUARTERLY: "3 months", YEARLY: "1 year" };

function cleanShares(raw: any): Share[] {
  let v = raw;
  for (let k = 0; k < 2 && typeof v === "string"; k++) { try { v = JSON.parse(v); } catch { v = []; } }   // tolerate text-encoded lists
  const arr = Array.isArray(v) ? v : [];
  return arr.map((x: any) => ({
    kind: up(x?.kind) === "PERSON" ? "PERSON" : "ME",
    amount: money(x?.amount),
    group: up(x?.group) || undefined,
    head_id: Number(x?.head_id) || null,
    subhead_id: Number(x?.subhead_id) || null,
    library_code: up(x?.library_code) || null,
    branch_code: up(x?.branch_code) || null,
    person_id: Number(x?.person_id) || null,
  })) as Share[];
}

// Shares must add up to the amount; your part needs a head; a person needs a name.
async function checkShares(tx: any, shares: Share[], amount: number) {
  if (!shares.length) throw new Error("Say who this is for — you, someone else, or both.");
  if (shares.filter((x) => x.kind === "ME").length > 1) throw new Error("Your part can appear only once.");
  const sum = money(shares.reduce((a, x) => a + num(x.amount), 0));
  if (sum !== money(amount)) throw new Error(`The shares add up to ${money(sum)}, but the amount is ${money(amount)}.`);
  for (const x of shares) {
    if (num(x.amount) <= 0) throw new Error("Every share must be more than zero.");
    if (x.kind === "ME") {
      if (!x.group) throw new Error("Choose the group for your part.");
      const g = await groupOf(tx, x.group);
      if (!x.head_id) throw new Error("Choose the head for your part.");
      await checkHeads(tx, "EXPENSE", x.group, Number(x.head_id), x.subhead_id ? Number(x.subhead_id) : null);
      if (g.is_library && !x.library_code) throw new Error("Which library is your part for?");
      if (!g.is_library) { x.library_code = null; x.branch_code = null; }
    } else {
      if (!x.person_id) throw new Error("Choose who each other share is for.");
      const pp = (await tx`select 1 from fin.people where id = ${Number(x.person_id)} limit 1`) as any[];
      if (!pp.length) throw new Error("That person no longer exists.");
    }
  }
}

async function schedules() {
  const rows = (await sql`
    select s.*, a.bank_name, a.bank_code, (s.next_due - current_date)::int as days_away
    from fin.scheduled_payments s
    left join fin.accounts a on a.id = s.account_id
    order by (s.status = 'ACTIVE') desc, s.next_due asc, s.name
  `) as any[];
  const names = (await sql`
    select 'C' || id as k, name from fin.categories union all select 'P' || id, name from fin.people
    union all select 'G' || code, name from fin.groups
  `) as any[];
  const nm: Record<string, string> = {};
  for (const r of names) nm[String(r.k)] = String(r.name);
  const pays = (await sql`
    select e.schedule_id, e.id, e.entry_date, e.total, coalesce(e.schedule_part, 'INSTALMENT') as part
    from fin.entries e where e.schedule_id is not null and e.voided = false
    order by e.entry_date desc, e.id desc
  `) as any[];

  const decorate = (x: any) => ({
    ...x,
    label: x.kind === "PERSON" ? (nm["P" + x.person_id] ?? "Someone") : "You",
    group_name: x.group ? (nm["G" + x.group] ?? x.group) : null,
    head_name: x.head_id ? (nm["C" + x.head_id] ?? null) : null,
    subhead_name: x.subhead_id ? (nm["C" + x.subhead_id] ?? null) : null,
  });

  return {
    schedules: rows.map((s) => {
      const shares = cleanShares(s.shares).map(decorate);
      const mine = pays.filter((x) => Number(x.schedule_id) === Number(s.id));
      return {
        id: Number(s.id), name: s.name, amount: money(s.amount), note: s.note ?? "",
        account_id: s.account_id == null ? null : Number(s.account_id),
        account_name: s.bank_name ?? s.bank_code ?? null,
        frequency: s.frequency, next_due: ymdOf(s.next_due), days_away: Number(s.days_away),
        installments_total: s.installments_total == null ? null : Number(s.installments_total),
        installments_paid: Number(s.installments_paid ?? 0),
        remaining: s.installments_total == null ? null : Number(s.installments_total) - Number(s.installments_paid ?? 0),
        status: s.status ?? (s.active ? "ACTIVE" : "CLOSED"), closed_reason: s.closed_reason ?? null, closed_on: s.closed_on ? ymdOf(s.closed_on) : null,
        shares,
        paid_total: money(mine.reduce((a, x) => a + num(x.total), 0)),
        payments: mine.slice(0, 12).map((x) => ({ entry_id: Number(x.id), on: x.entry_date, amount: money(x.total), part: x.part })),
        // kept for older screens
        world: s.world, library_code: s.library_code ?? null, category_id: s.category_id == null ? null : Number(s.category_id),
      };
    }),
  };
}

async function saveSchedule(p: any) {
  const name = String(p?.name ?? "").trim();
  const amount = money(p?.amount);
  if (!name) throw new Error("Give it a name.");
  if (amount <= 0) throw new Error("The amount must be more than zero.");
  const nextDue = isoDate(p?.next_due);
  const freq = up(p?.frequency) || "MONTHLY";
  const total = p?.installments_total == null || p?.installments_total === "" ? null : Number(p.installments_total);
  if (total != null && (!Number.isInteger(total) || total < 1)) throw new Error("The number of instalments must be a whole number.");
  const shares = cleanShares(p?.shares);
  const id = Number(p?.id) || 0;
  const note = String(p?.note ?? "").trim() || null;

  return await sql.begin(async (tx: any) => {
    await checkShares(tx, shares, amount);
    const me = shares.find((x) => x.kind === "ME");
    const world = me?.group || "PERSONAL";               // older columns, kept filled
    const categoryId = me?.head_id || null;
    const lib = me?.library_code || null;
    if (id) {
      const r = (await tx`
        update fin.scheduled_payments set
          name = ${name}, amount = ${amount}, account_id = ${Number(p?.account_id) || null},
          category_id = ${categoryId}, world = ${world}, library_code = ${lib},
          frequency = ${freq}, next_due = ${nextDue}::date, installments_total = ${total},
          note = ${note}, shares = ${JSON.stringify(shares)}::text::jsonb
        where id = ${id}
      `) as any;
      if (!r.count) throw new Error("That schedule no longer exists.");
      return { saved: true, id };
    }
    const ins = (await tx`
      insert into fin.scheduled_payments
        (name, amount, account_id, category_id, world, library_code, frequency, next_due, installments_total, note, shares, status)
      values (${name}, ${amount}, ${Number(p?.account_id) || null}, ${categoryId}, ${world}, ${lib},
              ${freq}, ${nextDue}::date, ${total}, ${note}, ${JSON.stringify(shares)}::text::jsonb, 'ACTIVE')
      returning id
    `) as any[];
    return { saved: true, id: Number(ins[0].id) };
  });
}

// One payment on a schedule: an instalment, a prepayment (any amount; the
// schedule keeps running) or the foreclosure (the last payment; it closes).
//   { id, part, paid_on, account_id, amount, shares, note,
//     adjust?: { installments_total?, amount? } }   ← prepayment only
async function paySchedule(p: any) {
  const id = Number(p?.id) || 0;
  if (!id) throw new Error("Which schedule?");
  const part = ["INSTALMENT", "PREPAY", "FORECLOSE"].includes(up(p?.part)) ? up(p?.part) : "INSTALMENT";
  const paidOn = p?.paid_on ? isoDate(p.paid_on) : isoDate(new Date().toISOString().slice(0, 10));

  return await sql.begin(async (tx: any) => {
    const rows = (await tx`select * from fin.scheduled_payments where id = ${id} for update`) as any[];
    if (!rows.length) throw new Error("That schedule no longer exists.");
    const s = rows[0];
    if ((s.status ?? "ACTIVE") !== "ACTIVE" || s.active === false) throw new Error("This schedule is closed. Reopen it first.");

    const amount = p?.amount == null || p?.amount === "" ? money(s.amount) : money(p.amount);
    const accountId = Number(p?.account_id) || Number(s.account_id) || 0;
    if (amount <= 0) throw new Error("The amount must be more than zero.");
    if (!accountId) throw new Error("Which account did it come from?");
    let shares = p?.shares ? cleanShares(p.shares) : cleanShares(s.shares);
    if (!p?.shares && money(shares.reduce((a, x) => a + num(x.amount), 0)) !== amount) shares = scaleShares(shares, amount);
    await checkShares(tx, shares, amount);

    const me = shares.find((x) => x.kind === "ME");
    const label = part === "PREPAY" ? `${s.name} — prepayment` : part === "FORECLOSE" ? `${s.name} — foreclosure` : s.name;
    const note = String(p?.note ?? "").trim();
    const ins = (await tx`
      insert into fin.entries (entry_type, entry_date, description, world, total, schedule_id, schedule_part)
      values (${me ? "EXPENSE" : "RECEIVABLE"}, ${paidOn}::date, ${note ? label + " · " + note : label},
              ${me?.group || "PERSONAL"}, ${amount}, ${id}, ${part})
      returning id
    `) as any[];
    const entryId = Number(ins[0].id);

    await tx`insert into fin.entry_lines (entry_id, line_kind, account_id, amount, line_date)
             values (${entryId}, 'ACCOUNT', ${accountId}, ${-amount}, ${paidOn}::date)`;
    for (const x of shares) {
      if (x.kind === "ME") {
        await tx`insert into fin.entry_lines (entry_id, line_kind, category_id, subhead_id, amount, line_date, library_code, branch_code)
                 values (${entryId}, 'EXPENSE', ${Number(x.head_id)}, ${x.subhead_id ? Number(x.subhead_id) : null}, ${money(x.amount)},
                         ${paidOn}::date, ${x.library_code || null}, ${x.branch_code || null})`;
      } else {
        await tx`insert into fin.entry_lines (entry_id, line_kind, person_id, amount, line_date)
                 values (${entryId}, 'RECEIVABLE', ${Number(x.person_id)}, ${money(x.amount)}, ${paidOn}::date)`;
      }
    }

    let finished = false;
    if (part === "INSTALMENT") {
      const paid = Number(s.installments_paid ?? 0) + 1;
      finished = s.frequency === "ONE_OFF" || (s.installments_total != null && paid >= Number(s.installments_total));
      if (finished) {
        await tx`update fin.scheduled_payments set installments_paid = ${paid}, active = false,
                 status = 'CLOSED', closed_reason = 'FINISHED', closed_on = ${paidOn}::date where id = ${id}`;
      } else {
        await tx`update fin.scheduled_payments set installments_paid = ${paid},
                 next_due = (next_due + ${STEP[s.frequency] ?? "1 month"}::interval)::date where id = ${id}`;
      }
    } else if (part === "FORECLOSE") {
      finished = true;
      await tx`update fin.scheduled_payments set active = false, status = 'CLOSED', closed_reason = 'FORECLOSED',
               closed_on = ${paidOn}::date where id = ${id}`;
    } else {
      // a prepayment keeps the schedule running; optionally the lender changed it
      const a = p?.adjust || {};
      if (a.installments_total != null && a.installments_total !== "") {
        const t = Number(a.installments_total);
        if (!Number.isInteger(t) || t < Number(s.installments_paid ?? 0) + 1)
          throw new Error(`Total instalments must be at least ${Number(s.installments_paid ?? 0) + 1}.`);
        await tx`update fin.scheduled_payments set installments_total = ${t} where id = ${id}`;
      }
      if (a.amount != null && a.amount !== "") {
        const na = money(a.amount);
        if (na <= 0) throw new Error("The new instalment amount must be more than zero.");
        const scaled = scaleShares(cleanShares(s.shares), na);
        await tx`update fin.scheduled_payments set amount = ${na}, shares = ${JSON.stringify(scaled)}::text::jsonb where id = ${id}`;
      }
    }
    return { entry_id: entryId, total: amount, finished, part };
  });
}

// Keep the same proportions at a new amount (rounding goes to the first share).
function scaleShares(shares: Share[], amount: number): Share[] {
  const sum = shares.reduce((a, x) => a + num(x.amount), 0);
  if (!shares.length || sum <= 0) return shares;
  const out = shares.map((x) => ({ ...x, amount: money((num(x.amount) / sum) * amount) }));
  const diff = money(amount - out.reduce((a, x) => a + x.amount, 0));
  out[0].amount = money(out[0].amount + diff);
  return out;
}

// Stop a schedule with no payment (e.g. the EMI was cancelled), or bring it back.
async function closeSchedule(p: any) {
  const id = Number(p?.id) || 0;
  const on = p?.on ? isoDate(p.on) : isoDate(new Date().toISOString().slice(0, 10));
  const r = (await sql`update fin.scheduled_payments set active = false, status = 'CLOSED', closed_reason = 'CANCELLED',
                       closed_on = ${on}::date where id = ${id} and status = 'ACTIVE'`) as any;
  if (!r.count) throw new Error("That schedule is not running.");
  return { saved: true };
}
async function reopenSchedule(p: any) {
  const id = Number(p?.id) || 0;
  const r = (await sql`update fin.scheduled_payments set active = true, status = 'ACTIVE', closed_reason = null, closed_on = null
                       where id = ${id} and status = 'CLOSED'`) as any;
  if (!r.count) throw new Error("That schedule is not closed.");
  return { saved: true };
}

// Older screens call this: the default split, amount and account.
async function recordSchedule(p: any) {
  return await paySchedule({ id: p?.id, part: "INSTALMENT", paid_on: p?.paid_on, account_id: p?.account_id, amount: p?.amount });
}

// ── assets ───────────────────────────────────────────────────────────
// Two numbers per asset, never conflated: COST is the sum of its ledger lines,
// so it is literally history and cannot be typed over. CURRENT VALUE is a
// dated row you add — never an overwrite — which is what lets a screen say
// "valued as of 14 Aug" and mean it. Net worth reads value; the gap is gain.
async function assets() {
  const rows = (await sql`
    select v.asset_id, v.name, v.nature, v.value_trend, v.income_generating,
           v.current_value, v.valued_as_of, v.cost, a.asset_type, a.active
    from fin.v_asset_current v
    join fin.assets a on a.id = v.asset_id
    where a.active
    order by coalesce(v.current_value, v.cost) desc nulls last, v.name
  `) as any[];

  const out = rows.map((r) => {
    const cost = money(r.cost);
    const value = r.current_value == null ? null : money(r.current_value);
    return {
      id: Number(r.asset_id), name: r.name, asset_type: r.asset_type ?? null,
      nature: r.nature, value_trend: r.value_trend,
      income_generating: !!r.income_generating,
      cost, current_value: value, valued_as_of: r.valued_as_of ?? null,
      gain: value == null ? null : money(value - cost),
    };
  });

  return {
    assets: out,
    totals: {
      cost: money(out.reduce((a, r) => a + r.cost, 0)),
      value: money(out.reduce((a, r) => a + (r.current_value ?? r.cost), 0)),
    },
  };
}

async function saveAsset(p: any) {
  const name = String(p?.name ?? "").trim();
  if (!name) throw new Error("Give the asset a name.");
  const trend = up(p?.value_trend);
  const okTrend = ["APPRECIATING", "STABLE", "DEPRECIATING"].includes(trend) ? trend : "STABLE";
  const id = Number(p?.id) || 0;

  if (id) {
    const r = (await sql`
      update fin.assets set name = ${name}, asset_type = ${String(p?.asset_type ?? "").trim() || null},
             value_trend = ${okTrend}, income_generating = ${!!p?.income_generating},
             active = ${p?.active === false ? false : true}
      where id = ${id}
    `) as any;
    if (!r.count) throw new Error("That asset no longer exists.");
    return { saved: true, id };
  }

  const dup = (await sql`select 1 from fin.assets where upper(name) = ${name.toUpperCase()} limit 1`) as any[];
  if (dup.length) throw new Error(`"${name}" already exists.`);
  const ins = (await sql`
    insert into fin.assets (name, asset_type, value_trend, income_generating)
    values (${name}, ${String(p?.asset_type ?? "").trim() || null}, ${okTrend}, ${!!p?.income_generating})
    returning id
  `) as any[];
  return { saved: true, id: Number(ins[0].id) };
}

// Buying moves money into the asset. Net worth does not change — you have less
// cash and more asset. The first purchase also seeds a value row at cost, so
// the asset is worth what you paid until you say otherwise.
async function assetBuy(p: any) {
  const entryDate = isoDate(p?.entry_date);
  const assetId = Number(p?.asset_id) || 0;
  const accountId = Number(p?.account_id) || 0;
  const amount = money(p?.amount);
  if (!assetId || !accountId) throw new Error("Choose the asset and the account.");
  if (amount <= 0) throw new Error("The amount must be more than zero.");

  return await sql.begin(async (tx: any) => {
    const nameRows = (await tx`select name from fin.assets where id = ${assetId} limit 1`) as any[];
    if (!nameRows.length) throw new Error("That asset no longer exists.");

    const ins = (await tx`
      insert into fin.entries (entry_type, entry_date, description, world, total)
      values ('MOVE', ${entryDate}::date, ${"Bought into " + nameRows[0].name}, 'PERSONAL', ${amount})
      returning id
    `) as any[];
    const entryId = Number(ins[0].id);

    await tx`insert into fin.entry_lines (entry_id, line_kind, account_id, amount, line_date)
             values (${entryId}, 'ACCOUNT', ${accountId}, ${-amount}, ${entryDate}::date)`;
    await tx`insert into fin.entry_lines (entry_id, line_kind, asset_id, amount, line_date)
             values (${entryId}, 'ASSET', ${assetId}, ${amount}, ${entryDate}::date)`;

    const anyValue = (await tx`select 1 from fin.asset_values where asset_id = ${assetId} limit 1`) as any[];
    if (!anyValue.length) {
      await tx`insert into fin.asset_values (asset_id, value, as_of, note)
               values (${assetId}, ${amount}, ${entryDate}::date, 'Cost at purchase')
               on conflict (asset_id, as_of) do nothing`;
    }
    return { entry_id: entryId, total: amount };
  });
}

// A revaluation is a dated observation, not a transaction. No cash moves and
// no ledger line is written — net worth simply reflects the newer number.
async function assetRevalue(p: any) {
  const assetId = Number(p?.asset_id) || 0;
  const asOf = isoDate(p?.as_of);
  const value = money(p?.value);
  if (!assetId) throw new Error("Which asset?");
  if (value < 0) throw new Error("A value cannot be negative.");
  await sql`
    insert into fin.asset_values (asset_id, value, as_of, note)
    values (${assetId}, ${value}, ${asOf}::date, ${String(p?.note ?? "").trim() || null})
    on conflict (asset_id, as_of) do update set value = excluded.value, note = excluded.note
  `;
  return { saved: true };
}

// Selling returns cash, clears the cost out of the asset, and books whatever
// is left over as a realised gain or loss so the entry still balances.
async function assetSell(p: any) {
  const entryDate = isoDate(p?.entry_date);
  const assetId = Number(p?.asset_id) || 0;
  const accountId = Number(p?.account_id) || 0;
  const proceeds = money(p?.amount);
  if (!assetId || !accountId) throw new Error("Choose the asset and the account.");
  if (proceeds <= 0) throw new Error("The amount must be more than zero.");

  return await sql.begin(async (tx: any) => {
    const rows = (await tx`
      select a.name,
             coalesce((select sum(l.amount) from fin.entry_lines l
                       join fin.entries e on e.id = l.entry_id
                       where l.asset_id = a.id and e.voided = false), 0) as cost
      from fin.assets a where a.id = ${assetId} limit 1
    `) as any[];
    if (!rows.length) throw new Error("That asset no longer exists.");
    const cost = money(rows[0].cost);
    const gain = money(proceeds - cost);

    const ins = (await tx`
      insert into fin.entries (entry_type, entry_date, description, world, total)
      values ('MOVE', ${entryDate}::date, ${"Sold " + rows[0].name}, 'PERSONAL', ${proceeds})
      returning id
    `) as any[];
    const entryId = Number(ins[0].id);

    await tx`insert into fin.entry_lines (entry_id, line_kind, account_id, amount, line_date)
             values (${entryId}, 'ACCOUNT', ${accountId}, ${proceeds}, ${entryDate}::date)`;
    await tx`insert into fin.entry_lines (entry_id, line_kind, asset_id, amount, line_date)
             values (${entryId}, 'ASSET', ${assetId}, ${-cost}, ${entryDate}::date)`;

    if (Math.abs(gain) >= 0.005) {
      const isGain = gain > 0;
      const cat = (await tx`
        insert into fin.categories (code, name, kind, quick, active)
        values (${isGain ? "ASSET_GAIN" : "ASSET_LOSS"},
                ${isGain ? "Gain on sale" : "Loss on sale"},
                ${isGain ? "INCOME" : "EXPENSE"}, false, true)
        on conflict (code) do update set active = true
        returning id
      `) as any[];
      await tx`insert into fin.entry_lines (entry_id, line_kind, category_id, amount, line_date)
               values (${entryId}, ${isGain ? "INCOME" : "EXPENSE"}, ${Number(cat[0].id)},
                       ${money(Math.abs(gain))}, ${entryDate}::date)`;
    }

    await tx`update fin.assets set active = false where id = ${assetId}`;
    return { entry_id: entryId, proceeds, cost, gain };
  });
}

// ── provisions ───────────────────────────────────────────────────────
// Money you will owe later: tax set aside, a deposit to return, a repair
// committed to. Recognising one is a real event — net worth drops, because
// the obligation is real. Paying it later moves cash but not net worth, since
// you already took the hit. No account is touched when you set it aside,
// which is what keeps the Check honest.
async function provisions() {
  const rows = (await sql`
    select r.id, r.name, r.note,
           coalesce(sum(case when e.voided = false then l.amount else 0 end), 0) as balance
    from fin.reserves r
    left join fin.entry_lines l on l.reserve_id = r.id and l.line_kind = 'RESERVE'
    left join fin.entries e     on e.id = l.entry_id
    where r.active and r.nature = 'OWE'
    group by r.id, r.name, r.note
    order by r.name
  `) as any[];
  const out = rows.map((r) => ({ id: Number(r.id), name: r.name, note: r.note ?? "", balance: money(r.balance) }));
  return { provisions: out, total: money(out.reduce((a, r) => a + r.balance, 0)) };
}

async function saveProvision(p: any) {
  const name = String(p?.name ?? "").trim();
  if (!name) throw new Error("Give it a name.");
  const id = Number(p?.id) || 0;
  if (id) {
    const r = (await sql`update fin.reserves set name = ${name}, note = ${String(p?.note ?? "").trim() || null},
                         active = ${p?.active === false ? false : true} where id = ${id}`) as any;
    if (!r.count) throw new Error("That provision no longer exists.");
    return { saved: true, id };
  }
  const dup = (await sql`select 1 from fin.reserves where upper(name) = ${name.toUpperCase()} limit 1`) as any[];
  if (dup.length) throw new Error(`"${name}" already exists.`);
  const ins = (await sql`insert into fin.reserves (name, nature, note)
                         values (${name}, 'OWE', ${String(p?.note ?? "").trim() || null}) returning id`) as any[];
  return { saved: true, id: Number(ins[0].id) };
}

// SET_ASIDE  recognise the obligation   provision up,   expense booked
// PAY        settle it in cash          account down,   provision down
// RELEASE    no longer needed           provision down, the expense comes back
async function provisionMove(p: any) {
  const entryDate = isoDate(p?.entry_date);
  const reserveId = Number(p?.reserve_id) || 0;
  const amount = money(p?.amount);
  const kind = up(p?.kind);
  if (!reserveId) throw new Error("Which provision?");
  if (amount <= 0) throw new Error("The amount must be more than zero.");

  const who = (await sql`select name from fin.reserves where id = ${reserveId} and nature = 'OWE' limit 1`) as any[];
  if (!who.length) throw new Error("That provision no longer exists.");
  const name = who[0].name;

  return await sql.begin(async (tx: any) => {
    const ins = (await tx`
      insert into fin.entries (entry_type, entry_date, description, world, total)
      values ('ADJUSTMENT', ${entryDate}::date,
              ${kind === "PAY" ? "Paid " + name : kind === "RELEASE" ? "Released " + name : "Set aside for " + name},
              'PERSONAL', ${amount})
      returning id
    `) as any[];
    const entryId = Number(ins[0].id);

    if (kind === "PAY") {
      const accountId = Number(p?.account_id) || 0;
      if (!accountId) throw new Error("Which account did it come from?");
      await tx`insert into fin.entry_lines (entry_id, line_kind, account_id, amount, line_date)
               values (${entryId}, 'ACCOUNT', ${accountId}, ${-amount}, ${entryDate}::date)`;
      await tx`insert into fin.entry_lines (entry_id, line_kind, reserve_id, amount, line_date)
               values (${entryId}, 'RESERVE', ${reserveId}, ${-amount}, ${entryDate}::date)`;
      return { entry_id: entryId, total: amount };
    }

    const setting = kind !== "RELEASE";
    const categoryId = Number(p?.category_id) || 0;
    let catId = categoryId;
    if (!catId) {
      const c = (await tx`
        insert into fin.categories (code, name, kind, quick, active)
        values (${setting ? "PROVISION" : "PROVISION_RELEASED"},
                ${setting ? "Set aside" : "Released from provision"},
                ${setting ? "EXPENSE" : "INCOME"}, false, true)
        on conflict (code) do update set active = true returning id
      `) as any[];
      catId = Number(c[0].id);
    }
    await tx`insert into fin.entry_lines (entry_id, line_kind, reserve_id, amount, line_date)
             values (${entryId}, 'RESERVE', ${reserveId}, ${setting ? amount : -amount}, ${entryDate}::date)`;
    await tx`insert into fin.entry_lines (entry_id, line_kind, category_id, amount, line_date)
             values (${entryId}, ${setting ? "EXPENSE" : "INCOME"}, ${catId}, ${amount}, ${entryDate}::date)`;
    return { entry_id: entryId, total: amount };
  });
}

// ── earmarks ─────────────────────────────────────────────────────────
// Labels on money you already have. Nothing is owed to anyone, so nothing is
// recorded: no entry, no line, no effect on any balance or on net worth.
// They exist only to answer "how much of this is actually free to spend".
async function earmarks() {
  const rows = (await sql`
    select e.id, e.name, e.amount, e.note, e.account_id, a.bank_name, a.bank_code
    from fin.earmarks e
    left join fin.accounts a on a.id = e.account_id
    where e.active order by e.created_at desc
  `) as any[];
  const out = rows.map((r) => ({
    id: Number(r.id), name: r.name, amount: money(r.amount), note: r.note ?? "",
    account_id: r.account_id == null ? null : Number(r.account_id),
    account_name: r.bank_name ?? r.bank_code ?? null,
  }));
  return { earmarks: out, total: money(out.reduce((a, r) => a + r.amount, 0)) };
}

async function saveEarmark(p: any) {
  const name = String(p?.name ?? "").trim();
  const amount = money(p?.amount);
  if (!name) throw new Error("Give it a name.");
  if (amount <= 0) throw new Error("The amount must be more than zero.");
  const id = Number(p?.id) || 0;
  if (id) {
    const r = (await sql`update fin.earmarks set name = ${name}, amount = ${amount},
                         account_id = ${Number(p?.account_id) || null},
                         note = ${String(p?.note ?? "").trim() || null},
                         active = ${p?.active === false ? false : true} where id = ${id}`) as any;
    if (!r.count) throw new Error("That earmark no longer exists.");
    return { saved: true, id };
  }
  const ins = (await sql`
    insert into fin.earmarks (name, amount, account_id, note)
    values (${name}, ${amount}, ${Number(p?.account_id) || null}, ${String(p?.note ?? "").trim() || null})
    returning id`) as any[];
  return { saved: true, id: Number(ins[0].id) };
}

async function removeEarmark(p: any) {
  const id = Number(p?.id) || 0;
  if (!id) throw new Error("Which earmark?");
  const r = (await sql`update fin.earmarks set active = false where id = ${id} and active`) as any;
  if (!r.count) throw new Error("That earmark is already gone.");
  return { removed: true };
}

// ── accounts and their routes ────────────────────────────────────────
// An account is a real pot of money, identified by a permanent bank_code.
// A route is a way money reaches it — GSP, KDP-UPI, plain CASH — each with
// its own settlement delay and its own on/off switch per app. Several routes
// can feed one account: GSP and a direct UPI both land in Yes Bank–GS, but
// they clear on different days.
async function accountsTree() {
  const [accs, routes] = await Promise.all([
    sql`select id, bank_code, bank_name, owner_name, acct_type, is_liability,
               description, active, quick, opening_balance, opening_date
        from fin.accounts order by active desc, bank_name nulls last, bank_code`,
    sql`select r.id, r.display_code, r.bank_code, r.settlement_days,
               r.active_lma, r.active_mf, r.description
        from fin.routes r order by r.display_code`,
  ]) as any[][];

  const used = (await sql`
    select upper(btrim(bank_code)) as bank_code, count(*)::int as rows_using
    from fin.v_lma_income group by 1
  `) as any[];
  const usage = new Map(used.map((u) => [u.bank_code, Number(u.rows_using)]));

  // How each payment tag is used in LMA — entries, last day used, this month's
  // net — shown under every route so busy and dead tags are obvious.
  const tagUse = (await sql`
    with u as (
      select upper(btrim(pay_mode_1)) as tag, coalesce(public.lma_safe_date(pay_mode_1_date), receipt_date_d) as d, pay_amount_1 as amt
        from receipt_log where coalesce(pay_amount_1, 0) <> 0
      union all
      select upper(btrim(pay_mode_2)), coalesce(public.lma_safe_date(pay_mode_2_date), receipt_date_d), pay_amount_2
        from receipt_log where coalesce(pay_amount_2, 0) <> 0
      union all
      select upper(btrim(pay_mode_3)), coalesce(public.lma_safe_date(pay_mode_3_date), receipt_date_d), pay_amount_3
        from receipt_log where coalesce(pay_amount_3, 0) <> 0
      union all
      select upper(btrim(payment_mode)), received_on_d, amount_received
        from fees_due_log where coalesce(amount_received, 0) <> 0
      union all
      select upper(btrim(payment_tag)), date_d, amount
        from misc_income where coalesce(amount, 0) <> 0 and coalesce(upper(btrim(status)), '') <> 'DELETED'
      union all
      select upper(btrim(refund_mode)), refund_date_d, -abs(amount)
        from refund_log where coalesce(amount, 0) <> 0
    )
    select tag, count(*)::int as n, to_char(max(d), 'YYYY-MM-DD') as last_used,
           coalesce(sum(amt) filter (where d >= date_trunc('month', now() at time zone 'Asia/Kolkata')::date), 0) as month_net
    from u where coalesce(tag, '') <> '' group by tag
  `) as any[];
  const useOf = new Map(tagUse.map((t) => [String(t.tag), { n: Number(t.n), last_used: t.last_used ?? null, month_net: money(t.month_net) }]));

  return {
    accounts: accs.map((a) => ({
      id: Number(a.id), bank_code: a.bank_code, bank_name: a.bank_name ?? a.bank_code,
      owner_name: a.owner_name ?? "", acct_type: a.acct_type, is_liability: !!a.is_liability,
      description: a.description ?? "", active: !!a.active, quick: !!a.quick,
      opening_balance: a.opening_balance == null ? null : money(a.opening_balance),
      opening_date: a.opening_date ? ymdOf(a.opening_date) : null,
      history_rows: usage.get(String(a.bank_code).toUpperCase()) ?? 0,
      routes: routes
        .filter((r) => r.bank_code === a.bank_code)
        .map((r) => ({
          id: Number(r.id), display_code: r.display_code, bank_code: r.bank_code,
          settlement_days: Number(r.settlement_days ?? 0),
          active_lma: !!r.active_lma, active_mf: !!r.active_mf,
          description: r.description ?? "",
          use: useOf.get(String(r.display_code).toUpperCase()) ?? { n: 0, last_used: null, month_net: 0 },
        })),
    })),
  };
}

// Creating an account is the only moment bank_code can be set. After that the
// database refuses to change it, because every rupee of history is stamped
// with it and a rename would detach the lot.
async function createAccount(p: any) {
  const code = up(p?.bank_code).replace(/\s+/g, "");
  const name = String(p?.bank_name ?? "").trim();
  const type = up(p?.acct_type) || "BANK";
  if (!code) throw new Error("Give it a code — short, permanent, e.g. HDFC-KD.");
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(code)) throw new Error("Codes use letters, numbers, dots and dashes only.");
  if (!name) throw new Error("Give it a name.");
  if (!["BANK", "CASH", "WALLET", "CREDIT_CARD"].includes(type)) throw new Error("Unknown account type.");

  const dup = (await sql`select 1 from fin.accounts where upper(bank_code) = ${code} limit 1`) as any[];
  if (dup.length) throw new Error(`${code} already exists.`);

  const ins = (await sql`
    insert into fin.accounts (bank_code, bank_name, owner_name, acct_type, is_liability, description)
    values (${code}, ${name}, ${String(p?.owner_name ?? "").trim() || null}, ${type},
            ${type === "CREDIT_CARD"}, ${String(p?.description ?? "").trim() || null})
    returning id
  `) as any[];
  return { saved: true, id: Number(ins[0].id), bank_code: code };
}

// Switching an account off hides it and every route under it from both apps.
// History is untouched: balances, the passbook and past P&L all still count it.
async function toggleAccount(p: any) {
  const id = Number(p?.id) || 0;
  if (!id) throw new Error("Which account?");
  const r = (await sql`
    update fin.accounts set active = not active where id = ${id} returning active
  `) as any[];
  if (!r.length) throw new Error("That account no longer exists.");
  return { active: !!r[0].active };
}

// A route's display_code is what LMA stamps onto every receipt, so it is
// permanent too. New routes are free; existing ones keep their code.
async function saveRoute(p: any) {
  const id = Number(p?.id) || 0;
  const days = Math.max(0, Math.floor(Number(p?.settlement_days ?? 0)));
  const activeLma = p?.active_lma === true;
  const activeMf = p?.active_mf === false ? false : true;

  if (id) {
    // Edit: only the fields sent are changed (a missing field never switches
    // LMA/MF off or wipes the note). The account a route lands in can change;
    // money already recorded keeps the account it was stamped with.
    const cur = (await sql`select id, display_code, bank_code from fin.routes where id = ${id} limit 1`) as any[];
    if (!cur.length) throw new Error("That route no longer exists.");
    const upd: Record<string, any> = {};
    if (p?.settlement_days !== undefined) upd.settlement_days = days;
    if (p?.active_lma !== undefined) upd.active_lma = activeLma;
    if (p?.active_mf !== undefined) upd.active_mf = activeMf;
    if (p?.description !== undefined) upd.description = String(p?.description ?? "").trim() || null;
    let bankChanged = false;
    if (p?.bank_code !== undefined) {
      const bank = up(p?.bank_code).replace(/\s+/g, "");
      if (!bank) throw new Error("Which account does it land in?");
      if (bank !== up(cur[0].bank_code)) {
        const acc = (await sql`select bank_code, active from fin.accounts where upper(bank_code) = ${bank} limit 1`) as any[];
        if (!acc.length) throw new Error(`No account with code ${bank}.`);
        if (!acc[0].active) throw new Error(`${bank} is switched off. Switch it on first.`);
        upd.bank_code = acc[0].bank_code;
        bankChanged = true;
      }
    }
    if (Object.keys(upd).length) await sql`update fin.routes set ${sql(upd)} where id = ${id}`;
    return { saved: true, id, bank_changed: bankChanged };
  }

  const code = up(p?.display_code).replace(/\s+/g, "");
  const bank = up(p?.bank_code).replace(/\s+/g, "");
  if (!code) throw new Error("Give the route a code, e.g. GSP-UPI.");
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(code)) throw new Error("Codes use letters, numbers, dots and dashes only.");
  if (!bank) throw new Error("Which account does it land in?");

  const bankOk = (await sql`select 1 from fin.accounts where upper(bank_code) = ${bank} limit 1`) as any[];
  if (!bankOk.length) throw new Error(`No account with code ${bank}.`);
  const dup = (await sql`select 1 from fin.routes where upper(display_code) = ${code} limit 1`) as any[];
  if (dup.length) throw new Error(`${code} already exists.`);

  const ins = (await sql`
    insert into fin.routes (display_code, bank_code, settlement_days, active_lma, active_mf, description)
    values (${code}, ${bank}, ${days}, ${activeLma}, ${activeMf},
            ${String(p?.description ?? "").trim() || null})
    returning id
  `) as any[];
  return { saved: true, id: Number(ins[0].id) };
}

// ── a payment tag's change history ───────────────────────────────────
// Written by a database trigger on fin.routes, so changes made in MF 2.0,
// in LMA Settings or in the Table Editor are all recorded. Until the one-time
// setup SQL has been run the table does not exist: the page just says so.
async function routeHistory(p: any) {
  const code = up(p?.display_code);
  if (!code) throw new Error("Which route?");
  try {
    const rows = (await sql`
      select id, to_char(changed_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD HH24:MI') as at, action,
             old_bank_code, new_bank_code, old_settlement_days, new_settlement_days,
             old_active_lma, new_active_lma, old_active_mf, new_active_mf
      from fin.route_changes where upper(display_code) = ${code}
      order by changed_at desc, id desc limit 50
    `) as any[];
    return { ready: true, history: rows.map((h) => ({ ...h, id: Number(h.id) })) };
  } catch (e: any) {
    if (String(e?.message || e).includes("route_changes")) return { ready: false, history: [] };
    throw e;
  }
}
// ── load one entry back into the form ────────────────────────────────
// Editing reuses the Add screen rather than duplicating it, so this returns
// the entry shaped exactly the way that form holds it.
async function getEntry(p: any) {
  const id = Number(p?.entry_id) || 0;
  if (!id) throw new Error("Which entry?");

  const rows = (await sql`
    select id, entry_type, entry_date, description, world, total, voided
    from fin.entries where id = ${id} limit 1
  `) as any[];
  if (!rows.length) throw new Error("That entry no longer exists.");
  const e = rows[0];
  if (e.voided) throw new Error("That entry was removed and cannot be edited.");

  const lines = (await sql`
    select line_kind, account_id, category_id, subhead_id, person_id, amount, line_date,
           library_code, branch_code
    from fin.entry_lines where entry_id = ${id} order by id
  `) as any[];

  return {
    entry: {
      id: Number(e.id), entry_type: e.entry_type, entry_date: e.entry_date,
      description: e.description ?? "", world: e.world, total: money(e.total),
    },
    split: lines.filter((l) => l.line_kind === "EXPENSE").map((l) => ({
      category_id: Number(l.category_id), subhead_id: l.subhead_id == null ? null : Number(l.subhead_id), amount: money(l.amount),
      library_code: l.library_code ?? null, branch_code: l.branch_code ?? null,
    })),
    legs: lines.filter((l) => l.line_kind === "ACCOUNT").map((l) => ({
      account_id: Number(l.account_id), amount: money(Math.abs(l.amount)), date: l.line_date,
    })),
    owed: (() => {
      const o = lines.find((l) => l.line_kind === "PAYABLE");
      return o ? { person_id: Number(o.person_id), amount: money(o.amount) } : null;
    })(),
  };
}

async function voidEntry(p: any) {
  const id = Number(p?.entry_id);
  const reason = up(p?.reason);
  const allowed = new Set(["TYPED_WRONG", "DUPLICATE", "NEVER_HAPPENED", "OTHER"]);
  if (!id) throw new Error("Which entry?");
  if (!allowed.has(reason)) throw new Error("Choose a reason.");
  const r = (await sql`
    update fin.entries set voided = true, void_reason = ${reason},
           void_note = ${String(p?.note ?? "").trim() || null}, voided_at = now()
    where id = ${id} and voided = false
  `) as any;
  if (!r.count) throw new Error("That entry is already removed, or does not exist.");
  return { voided: true };
}

export async function handle(action: string, payload: any): Promise<any> {
  switch (action) {
    case "ping":                  return { pong: true };
    case "initData":              return await initData();
    case "initLive":              return await initLive();

    // entries
    case "addExpense":            return await addExpense(payload);
    case "addIncome":             return await addIncome(payload);
    case "addMove":               return await addMove(payload);
    case "getEntry":              return await getEntry(payload);
    case "voidEntry":             return await voidEntry(payload);

    // guards shown while typing
    case "checkConflicts":        return await checkConflicts(payload);
    case "findPossibleDuplicate": return await findPossibleDuplicate(payload);

    // accounts, routes and other masters
    case "accountsTree":          return await accountsTree();
    case "createAccount":         return await createAccount(payload);
    case "toggleAccount":         return await toggleAccount(payload);
    case "saveRoute":             return await saveRoute(payload);
    case "routeHistory":          return await routeHistory(payload);
    case "saveAccount":           return await saveAccount(payload);
    case "saveCategory":          return await saveCategory(payload);
    case "saveGroup":             return await saveGroup(payload);
    case "reorderSetup":          return await reorderSetup(payload);
    case "saveLabels":            return await saveLabels(payload);
    case "savePerson":            return await savePerson(payload);
    case "masters":               return await masters();

    // passbook + reconciliation
    case "ledger":                return await ledger(payload);
    case "checkPrepare":          return await checkPrepare(payload);
    case "saveCheck":             return await saveCheck(payload);

    // people
    case "peopleBalances":        return await peopleBalances();
    case "personMove":            return await personMove(payload);

    // reports
    case "reportPnl":             return await reportPnl(payload);
    case "reportSpending":        return await reportSpending(payload);

    // scheduled payments
    case "schedules":             return await schedules();
    case "saveSchedule":          return await saveSchedule(payload);
    case "recordSchedule":        return await recordSchedule(payload);
    case "paySchedule":           return await paySchedule(payload);
    case "closeSchedule":         return await closeSchedule(payload);
    case "reopenSchedule":        return await reopenSchedule(payload);

    // assets
    case "assets":                return await assets();
    case "saveAsset":             return await saveAsset(payload);
    case "assetBuy":              return await assetBuy(payload);
    case "assetRevalue":          return await assetRevalue(payload);
    case "assetSell":             return await assetSell(payload);

    // provisions & earmarks
    case "provisions":            return await provisions();
    case "saveProvision":         return await saveProvision(payload);
    case "provisionMove":         return await provisionMove(payload);
    case "earmarks":              return await earmarks();
    case "saveEarmark":           return await saveEarmark(payload);
    case "removeEarmark":         return await removeEarmark(payload);

    default: throw new Error("Unknown action: " + action);
  }
}