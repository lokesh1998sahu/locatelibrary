"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";

const API = "/api/lma";

// ── TYPES ────────────────────────────────────────────────────────
interface Library  { library_code:string; library_name:string; display_name:string; active:boolean; has_branches:boolean; emoji:string; color?:string; }
interface Branch   { library_code:string; branch_code:string; branch_display:string; active:boolean; emoji?:string; color?:string; }
interface SeatCell { row_in_section:number; col_in_section:number; seat_no:number; display_label:string; notes?:string; cell_type?:"SEAT"|"DEAD"; }
interface Section  { section_name:string; section_order:number; rows:number; cols:number; seats:SeatCell[]; }
interface Layout   { library_code:string; branch_code:string; sections:Section[]; }
interface LayoutSummary { library_code:string; branch_code:string; seat_count:number; dead_count:number; section_count:number; sections:Record<string,number>; }

type Toast = { msg:string; type:"success"|"error" } | null;

interface Props {
  libraries: Library[];
  branches: Branch[];
  onToast: (msg:string, type?:"success"|"error") => void;
}

// ── ROOT EDITOR COMPONENT ────────────────────────────────────────
export default function SeatLayoutEditor({ libraries, branches, onToast }: Props) {
  const [summaries, setSummaries] = useState<LayoutSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<{ library_code:string; branch_code:string } | null>(null);

  // Build the full list of editable scopes (library OR library+branch)
  const scopes = useMemo(() => {
    const out: { library_code:string; branch_code:string; label:string; emoji:string; color?:string }[] = [];
    libraries.filter(l => l.active).forEach(lib => {
      if (lib.has_branches) {
        branches.filter(b => b.library_code === lib.library_code && b.active).forEach(br => {
          out.push({
            library_code: lib.library_code,
            branch_code: br.branch_code,
            label: `${lib.library_code} · ${br.branch_code}`,
            emoji: br.emoji || lib.emoji,
            color: br.color || lib.color,
          });
        });
      } else {
        out.push({
          library_code: lib.library_code,
          branch_code: "",
          label: lib.library_code,
          emoji: lib.emoji,
          color: lib.color,
        });
      }
    });
    return out;
  }, [libraries, branches]);

  const fetchSummaries = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}?action=getAllSeatLayouts`).then(r => r.json());
      if (r.ok) setSummaries(r.layouts || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchSummaries(); }, [fetchSummaries]);

  const summaryFor = (lib:string, br:string): LayoutSummary | null => {
    return summaries.find(s => s.library_code === lib && (s.branch_code || "") === (br || "")) || null;
  };

  // ── Render ──
  if (editing) {
    return (
      <LayoutBuilder
        library_code={editing.library_code}
        branch_code={editing.branch_code}
        scopeLabel={scopes.find(s => s.library_code === editing.library_code && s.branch_code === editing.branch_code)?.label || ""}
        onClose={() => { setEditing(null); fetchSummaries(); }}
        onToast={onToast}
      />
    );
  }

  return (
    <div>
      <p className="text-[11px] text-lma-slate-500 mb-3">Tap a library/branch to set up or edit its seat layout.</p>
      {loading && summaries.length === 0 ? (
        <div className="text-center text-sm text-lma-slate-500 py-4">Loading…</div>
      ) : (
        <div className="space-y-2">
          {scopes.map(s => {
            const sum = summaryFor(s.library_code, s.branch_code);
            return (
              <button
                key={s.library_code + "|" + s.branch_code}
                onClick={() => setEditing({ library_code: s.library_code, branch_code: s.branch_code })}
                className="w-full text-left bg-white rounded-xl p-3 shadow-sm hover:shadow-md active:scale-[0.99] transition flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-base shrink-0 font-extrabold" style={s.color ? { background: s.color+"22", color: s.color } : { background:"#e2e8f0" }}>
                  {s.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-lma-slate-900">{s.label}</div>
                  <div className="text-[11px] text-lma-slate-500">
                    {sum ? `${sum.seat_count} seats${sum.dead_count ? ` · ${sum.dead_count} dead` : ""} · ${sum.section_count} section${sum.section_count===1?"":"s"}` : "Not set up yet"}
                  </div>
                </div>
                <span className="text-lma-slate-400 text-lg">›</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// LAYOUT BUILDER — single library/branch's layout editing screen
// ─────────────────────────────────────────────────────────────────
interface LayoutBuilderProps {
  library_code: string;
  branch_code: string;
  scopeLabel: string;
  onClose: () => void;
  onToast: (msg:string, type?:"success"|"error") => void;
}

function LayoutBuilder({ library_code, branch_code, scopeLabel, onClose, onToast }: LayoutBuilderProps) {
  const [layout, setLayout] = useState<Layout | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewSection, setShowNewSection] = useState(false);

  const fetchLayout = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ action: "getSeatLayout", library_code });
      if (branch_code) params.set("branch_code", branch_code);
      const r = await fetch(`${API}?${params}`).then(r => r.json());
      if (r.ok) setLayout(r);
      else onToast(r.error || "Failed to load layout", "error");
    } finally { setLoading(false); }
  }, [library_code, branch_code, onToast]);

  useEffect(() => { fetchLayout(); }, [fetchLayout]);

  const onSectionSaved = () => fetchLayout();
  const onSectionDeleted = () => fetchLayout();

  // Suggest a unique default name for new section
  const suggestSectionName = () => {
    const existing = (layout?.sections || []).map(s => s.section_name.toLowerCase());
    const candidates = ["Main Block", "Side Wall", "Back Row", "Front Row", "Corner Area", "Center Block"];
    for (const c of candidates) {
      if (!existing.includes(c.toLowerCase())) return c;
    }
    return `Section ${(layout?.sections.length || 0) + 1}`;
  };

  const nextSectionOrder = (layout?.sections.length || 0) + 1;

  return (
    <div>
      {/* Subheader */}
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-lma-slate-200">
        <button onClick={onClose} className="text-lma-slate-600 hover:text-lma-slate-900 text-lg">←</button>
        <div className="flex-1">
          <h3 className="text-sm font-extrabold text-lma-slate-900">Seat Layout: {scopeLabel}</h3>
          <p className="text-[10px] text-lma-slate-500">{layout?.sections.length || 0} section{(layout?.sections.length||0)===1?"":"s"}</p>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-sm text-lma-slate-500 py-4">Loading…</div>
      ) : (
        <>
          {layout && layout.sections.length === 0 && (
            <div className="bg-lma-slate-50 rounded-xl p-4 text-center mb-3">
              <div className="text-3xl mb-2">🪑</div>
              <p className="text-sm font-semibold text-lma-slate-700">No sections yet.</p>
              <p className="text-[11px] text-lma-slate-500 mb-3">Add your first section to start placing seats.</p>
            </div>
          )}

          <div className="space-y-3">
            {(layout?.sections || []).map(sec => (
              <SectionCard
                key={sec.section_name}
                library_code={library_code}
                branch_code={branch_code}
                section={sec}
                onSaved={onSectionSaved}
                onDeleted={onSectionDeleted}
                onToast={onToast}
              />
            ))}
          </div>

          <button
            onClick={() => setShowNewSection(true)}
            className="w-full mt-3 py-3 rounded-xl border-[1.5px] border-dashed border-lma-primary/40 text-lma-primary font-bold text-sm hover:bg-lma-primary/5 active:scale-[0.99]"
          >
            + Add Section
          </button>

          {showNewSection && (
            <NewSectionDialog
              defaultName={suggestSectionName()}
              defaultOrder={nextSectionOrder}
              onCancel={() => setShowNewSection(false)}
              onCreate={(name, order, rows, cols) => {
                setShowNewSection(false);
                // Create an empty section by saving an empty seats array — but backend needs at least 1 seat
                // So we just open the section in expanded mode locally; nothing saved yet
                setLayout(l => l ? {
                  ...l,
                  sections: [...l.sections, { section_name: name, section_order: order, rows, cols, seats: [] }],
                } : l);
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// SECTION CARD — one expandable section with its grid
// ─────────────────────────────────────────────────────────────────
interface SectionCardProps {
  library_code: string;
  branch_code: string;
  section: Section;
  onSaved: () => void;
  onDeleted: () => void;
  onToast: (msg:string, type?:"success"|"error") => void;
}

function SectionCard({ library_code, branch_code, section, onSaved, onDeleted, onToast }: SectionCardProps) {
  // LOCAL working state — edits live here until "Save section"
  const [name, setName] = useState(section.section_name);
  const [order, setOrder] = useState(section.section_order);
  const [rows, setRows] = useState(Math.max(section.rows || 1, 1));
  const [cols, setCols] = useState(Math.max(section.cols || 1, 1));
  const [seats, setSeats] = useState<SeatCell[]>(section.seats);
  const [expanded, setExpanded] = useState(section.seats.length === 0); // auto-expand if new/empty
  const [dirty, setDirty] = useState(section.seats.length === 0 ? true : false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingCell, setEditingCell] = useState<{ row:number; col:number; existing?: SeatCell } | null>(null);
  const [saving, setSaving] = useState(false);

  // Sync from prop when section reloads (after save)
  const syncedRef = useRef(false);
  useEffect(() => {
    if (!syncedRef.current) { syncedRef.current = true; return; }
    setName(section.section_name);
    setOrder(section.section_order);
    setRows(Math.max(section.rows || 1, 1));
    setCols(Math.max(section.cols || 1, 1));
    setSeats(section.seats);
    setDirty(false);
  }, [section]);

  const markDirty = () => setDirty(true);

  // Build a map for fast lookup: "r-c" → seat
  const cellMap = useMemo(() => {
    const m: Record<string, SeatCell> = {};
    seats.forEach(s => { m[`${s.row_in_section}-${s.col_in_section}`] = s; });
    return m;
  }, [seats]);

  const handleCellClick = (r: number, c: number) => {
    const existing = cellMap[`${r}-${c}`];
    setEditingCell({ row: r, col: c, existing });
  };

  const saveSeat = (cellType: "SEAT"|"DEAD", label: string, seat_no: number, notes: string) => {
    if (!editingCell) return;
    const { row, col } = editingCell;
    // Check label uniqueness only for SEAT cells
    if (cellType === "SEAT") {
      const dup = seats.find(s =>
        s.cell_type !== "DEAD" &&
        s.display_label.toLowerCase() === label.toLowerCase() &&
        !(s.row_in_section === row && s.col_in_section === col)
      );
      if (dup) {
        onToast(`Label "${label}" already used at row ${dup.row_in_section}, col ${dup.col_in_section}`, "error");
        return;
      }
    }
    const next = seats.filter(s => !(s.row_in_section === row && s.col_in_section === col));
    next.push({
      row_in_section: row,
      col_in_section: col,
      seat_no: cellType === "DEAD" ? 0 : seat_no,
      display_label: cellType === "DEAD" ? "" : label,
      notes,
      cell_type: cellType,
    });
    setSeats(next);
    setEditingCell(null);
    markDirty();
  };

  const removeSeatCell = () => {
    if (!editingCell) return;
    const { row, col } = editingCell;
    setSeats(seats.filter(s => !(s.row_in_section === row && s.col_in_section === col)));
    setEditingCell(null);
    markDirty();
  };

  // Auto-expand grid when user wants to click beyond current bounds (Q2: a + c)
  const expandTo = (r: number, c: number) => {
    if (r > rows) { setRows(r); markDirty(); }
    if (c > cols) { setCols(c); markDirty(); }
  };

  // Resize handlers (Q2: a — explicit resize)
  const tryResize = (newRows: number, newCols: number) => {
    if (newRows < 1 || newCols < 1) return;
    // Block shrink if it would orphan seats
    const orphans = seats.filter(s => s.row_in_section > newRows || s.col_in_section > newCols);
    if (orphans.length > 0) {
      onToast(`Cannot shrink: ${orphans.length} seat${orphans.length===1?"":"s"} would be lost. Remove them first.`, "error");
      return;
    }
    setRows(newRows);
    setCols(newCols);
    markDirty();
  };

  const handleSave = async () => {
    if (seats.length === 0) {
      onToast("Add at least one seat before saving the section.", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        action: "saveSeatSection",
        payload: {
          library_code,
          branch_code: branch_code || "",
          section_name: name.trim(),
          section_order: order,
          seats,
        }
      };
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
      }).then(r => r.json());
      if (r.ok) {
        onToast(`Saved ${seats.length} seat${seats.length===1?"":"s"} in "${name}"`);
        setDirty(false);
        onSaved();
      } else {
        onToast(r.error || "Save failed", "error");
      }
    } catch (e) {
      onToast(e instanceof Error ? e.message : String(e), "error");
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const r = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "deleteSeatSection",
          payload: { library_code, branch_code: branch_code || "", section_name: section.section_name },
        }),
      }).then(r => r.json());
      if (r.ok) {
        onToast(`Deleted section "${section.section_name}"`);
        onDeleted();
      } else onToast(r.error || "Delete failed", "error");
    } finally { setSaving(false); setConfirmDelete(false); }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-lma-slate-50 transition active:bg-lma-slate-100"
      >
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold bg-lma-slate-100 text-lma-slate-500 px-1.5 py-0.5 rounded">#{order}</span>
            <span className="text-sm font-bold text-lma-slate-900">{name}</span>
            {dirty && <span className="text-[10px] font-bold text-lma-warn bg-lma-warn/10 px-1.5 py-0.5 rounded">UNSAVED</span>}
          </div>
          <div className="text-[11px] text-lma-slate-500 mt-0.5">
            {seats.length} / {rows * cols} cells filled · {rows}×{cols}
          </div>
        </div>
        <span className={`text-lma-slate-400 transition-transform ${expanded?"rotate-180":""}`}>▾</span>
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-lma-slate-100 lma-slide-up">
          {/* Section settings */}
          <div className="grid grid-cols-2 gap-2 mt-3 mb-3">
            <FieldMini label="Name">
              <input value={name} onChange={e => { setName(e.target.value); markDirty(); }} className="w-full px-2.5 py-2 rounded-lg border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
            </FieldMini>
            <FieldMini label="Order">
              <input type="number" value={order} onChange={e => { setOrder(Number(e.target.value) || 1); markDirty(); }} min={1} className="w-full px-2.5 py-2 rounded-lg border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
            </FieldMini>
            <FieldMini label="Rows">
              <input type="number" value={rows} onChange={e => tryResize(Number(e.target.value)||1, cols)} min={1} max={30} className="w-full px-2.5 py-2 rounded-lg border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
            </FieldMini>
            <FieldMini label="Cols">
              <input type="number" value={cols} onChange={e => tryResize(rows, Number(e.target.value)||1)} min={1} max={30} className="w-full px-2.5 py-2 rounded-lg border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
            </FieldMini>
          </div>

          <p className="text-[10px] text-lma-slate-500 mb-2 px-0.5">
            Tap any cell to add or edit a seat. Empty cells render as gaps.
          </p>

          {/* Grid */}
          <SectionGrid
            rows={rows}
            cols={cols}
            cellMap={cellMap}
            onCellClick={handleCellClick}
            onExpandRequest={expandTo}
          />

          {/* Actions */}
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={saving}
              className="px-3 py-2.5 rounded-xl bg-lma-danger/10 text-lma-danger font-bold text-xs"
            >
              Delete Section
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              className={`flex-1 py-2.5 rounded-xl font-bold text-sm shadow-md transition ${dirty && !saving ? "bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white" : "bg-lma-slate-200 text-lma-slate-500 cursor-not-allowed"}`}
            >
              {saving ? "Saving…" : dirty ? "Save Section" : "✓ Saved"}
            </button>
          </div>
        </div>
      )}

      {/* Cell edit modal */}
      {editingCell && (
        <CellEditModal
          row={editingCell.row}
          col={editingCell.col}
          existing={editingCell.existing}
          onSave={saveSeat}
          onRemove={editingCell.existing ? removeSeatCell : undefined}
          onCancel={() => setEditingCell(null)}
        />
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <BottomSheet onClose={() => setConfirmDelete(false)}>
          <p className="text-[15px] font-semibold text-lma-slate-800 text-center mb-5">
            Delete section &quot;{section.section_name}&quot; and all {section.seats.length} seat{section.seats.length===1?"":"s"} in it?
          </p>
          <div className="flex gap-2.5">
            <button onClick={() => setConfirmDelete(false)} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
            <button onClick={handleDelete} className="flex-1 py-3 rounded-xl bg-lma-danger text-white font-bold">Delete</button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// THE GRID — clickable cells
// ─────────────────────────────────────────────────────────────────
function SectionGrid({ rows, cols, cellMap, onCellClick, onExpandRequest }: {
  rows: number;
  cols: number;
  cellMap: Record<string, SeatCell>;
  onCellClick: (r:number, c:number) => void;
  onExpandRequest: (r:number, c:number) => void;
}) {
  // Cell size: scale to fit container, target ~36px on mobile, larger on desktop
  return (
    <div className="bg-lma-slate-50 rounded-xl p-2 overflow-x-auto">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(36px, 1fr))` }}
      >
        {Array.from({ length: rows * cols }).map((_, idx) => {
          const r = Math.floor(idx / cols) + 1;
          const c = (idx % cols) + 1;
          const cell = cellMap[`${r}-${c}`];
          const isDead = cell?.cell_type === "DEAD";
          const isSeat = cell && !isDead;

          let className = "aspect-square rounded-md flex flex-col items-center justify-center text-[11px] font-bold transition active:scale-95 ";
          if (isDead) {
            className += "bg-lma-slate-500 text-lma-slate-100 border border-lma-slate-600 hover:bg-lma-slate-600";
          } else if (isSeat) {
            className += "bg-lma-primary/15 text-lma-primary border border-lma-primary/30 hover:bg-lma-primary/25";
          } else {
            className += "bg-white text-lma-slate-300 border border-dashed border-lma-slate-200 hover:border-lma-primary/40 hover:text-lma-primary/60";
          }

          return (
            <button
              key={`${r}-${c}`}
              onClick={() => onCellClick(r, c)}
              className={className}
              title={
                isDead ? `Dead zone (${r},${c})${cell?.notes ? " · " + cell.notes : ""}`
                : isSeat ? `Seat ${cell.display_label}`
                : `Empty cell (${r},${c})`
              }
            >
              {isDead ? (
                <span className="text-[12px] opacity-80">⬛</span>
              ) : isSeat ? (
                <>
                  <span className="leading-tight">{cell.display_label}</span>
                  {cell.notes && <span className="text-[7px] text-lma-slate-500 leading-none">·</span>}
                </>
              ) : (
                <span className="text-[14px] opacity-30">+</span>
              )}
            </button>
          );
        })}
      </div>
      {/* Quick "extend grid" buttons (Q2: c — click beyond bounds) */}
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => onExpandRequest(rows + 1, cols)}
          className="flex-1 py-1.5 rounded-md text-[10px] font-bold text-lma-slate-500 bg-white border border-dashed border-lma-slate-200 hover:border-lma-primary/40 hover:text-lma-primary"
        >
          + Add Row
        </button>
        <button
          onClick={() => onExpandRequest(rows, cols + 1)}
          className="flex-1 py-1.5 rounded-md text-[10px] font-bold text-lma-slate-500 bg-white border border-dashed border-lma-slate-200 hover:border-lma-primary/40 hover:text-lma-primary"
        >
          + Add Col
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// CELL EDIT MODAL — appears when operator taps a cell
// ─────────────────────────────────────────────────────────────────
function CellEditModal({ row, col, existing, onSave, onRemove, onCancel }: {
  row: number;
  col: number;
  existing?: SeatCell;
  onSave: (cellType:"SEAT"|"DEAD", label:string, seat_no:number, notes:string) => void;
  onRemove?: () => void;
  onCancel: () => void;
}) {
  const [cellType, setCellType] = useState<"SEAT"|"DEAD">(existing?.cell_type || "SEAT");
  const [label, setLabel] = useState(existing?.display_label || "");
  const [seatNo, setSeatNo] = useState<string>(existing?.seat_no ? String(existing.seat_no) : "");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [seatNoTouched, setSeatNoTouched] = useState(!!existing);

  // Auto-derive seat_no from display_label (Q1: a but with smart default)
  useEffect(() => {
    if (seatNoTouched) return;
    if (cellType === "DEAD") return;
    const digits = label.replace(/\D/g, "");
    if (digits) setSeatNo(digits);
  }, [label, seatNoTouched, cellType]);

  const handleSave = () => {
    if (cellType === "SEAT") {
      const l = label.trim();
      if (!l) return;
      const n = parseInt(seatNo) || 0;
      onSave("SEAT", l, n, notes.trim());
    } else {
      onSave("DEAD", "", 0, notes.trim());
    }
  };

  return (
    <BottomSheet onClose={onCancel}>
      <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">
        {existing ? "Edit Cell" : "Add Cell"}
      </h3>
      <p className="text-[11px] text-lma-slate-500 mb-4">Position: Row {row}, Column {col}</p>

      {/* Cell type toggle */}
      <div className="bg-lma-slate-100 rounded-xl p-1 flex gap-1 mb-4">
        <button
          type="button"
          onClick={() => setCellType("SEAT")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${cellType==="SEAT" ? "bg-white shadow-sm text-lma-primary" : "text-lma-slate-500 hover:text-lma-slate-800"}`}
        >
          🪑 Seat
        </button>
        <button
          type="button"
          onClick={() => setCellType("DEAD")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${cellType==="DEAD" ? "bg-white shadow-sm text-lma-slate-700" : "text-lma-slate-500 hover:text-lma-slate-800"}`}
        >
          ⬛ Dead Zone
        </button>
      </div>

      {cellType === "DEAD" ? (
        <div className="bg-lma-slate-50 rounded-xl p-3 mb-3 text-[11px] text-lma-slate-600 leading-relaxed">
          Marks this cell as a non-seatable area (wall, aisle, AC unit, pillar, etc.).
          On the seat chart and downloaded image, it renders as a solid colored block.
        </div>
      ) : (
        <>
          <Label>Display Label *</Label>
          <input
            autoFocus
            value={label}
            onChange={e => setLabel(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
            placeholder="e.g. 1, 5A, 26A"
            className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[14px] font-medium mb-3"
          />

          <Label>Seat Number (numeric, for sorting)</Label>
          <input
            type="number"
            inputMode="numeric"
            value={seatNo}
            onChange={e => { setSeatNo(e.target.value); setSeatNoTouched(true); }}
            placeholder="Auto-derived from label"
            className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[14px] font-medium mb-1"
          />
          <p className="text-[10px] text-lma-slate-500 mb-3">Auto-derived from label&apos;s digits; override if needed.</p>
        </>
      )}

      <Label>Notes (optional)</Label>
      <input
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder={cellType === "DEAD" ? "e.g. AC unit, water cooler, librarian desk" : "e.g. corner, near AC"}
        className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[14px] font-medium mb-3"
      />

      <div className="flex gap-2 mt-4">
        <button onClick={onCancel} className="px-4 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
        {onRemove && (
          <button onClick={onRemove} className="px-4 py-3 rounded-xl bg-lma-danger/10 text-lma-danger font-bold">Remove</button>
        )}
        <button
          onClick={handleSave}
          disabled={cellType === "SEAT" && !label.trim()}
          className="flex-1 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md disabled:opacity-50"
        >
          {existing ? "Update" : "Add"}
        </button>
      </div>
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────────
// NEW SECTION DIALOG — quick prompt before opening the section
// ─────────────────────────────────────────────────────────────────
function NewSectionDialog({ defaultName, defaultOrder, onCancel, onCreate }: {
  defaultName: string;
  defaultOrder: number;
  onCancel: () => void;
  onCreate: (name:string, order:number, rows:number, cols:number) => void;
}) {
  const [name, setName] = useState(defaultName);
  const [order, setOrder] = useState(defaultOrder);
  const [rows, setRows] = useState(5);
  const [cols, setCols] = useState(8);

  return (
    <BottomSheet onClose={onCancel}>
      <h3 className="text-base font-extrabold text-lma-slate-900 mb-1">New Section</h3>
      <p className="text-[11px] text-lma-slate-500 mb-4">You can resize and rename anytime after creation.</p>

      <Label>Name</Label>
      <input autoFocus value={name} onChange={e=>setName(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 focus:bg-white focus:border-lma-primary outline-none text-[14px] font-medium mb-3"/>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div>
          <Label>Order</Label>
          <input type="number" value={order} onChange={e=>setOrder(Number(e.target.value)||1)} min={1} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
        </div>
        <div>
          <Label>Rows</Label>
          <input type="number" value={rows} onChange={e=>setRows(Number(e.target.value)||1)} min={1} max={30} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
        </div>
        <div>
          <Label>Cols</Label>
          <input type="number" value={cols} onChange={e=>setCols(Number(e.target.value)||1)} min={1} max={30} className="w-full px-3 py-2.5 rounded-xl border-[1.5px] border-lma-slate-200 bg-lma-slate-50 text-sm font-medium"/>
        </div>
      </div>

      <div className="flex gap-2 mt-3">
        <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-lma-slate-100 text-lma-slate-600 font-bold">Cancel</button>
        <button onClick={() => name.trim() && onCreate(name.trim(), order, rows, cols)} disabled={!name.trim()} className="flex-1 py-3 rounded-xl bg-gradient-to-br from-lma-primary to-lma-primary-2 text-white font-bold shadow-md disabled:opacity-50">Create</button>
      </div>
    </BottomSheet>
  );
}

// ─────────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────────
function BottomSheet({ onClose, children }:{ onClose:()=>void; children:React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[9998] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"/>
      <div className="relative w-full max-w-md bg-white rounded-t-3xl p-5 max-h-[88vh] overflow-y-auto lma-slide-up" onClick={e=>e.stopPropagation()}>
        <div className="w-9 h-1 bg-lma-slate-200 rounded-full mx-auto mb-4"/>
        {children}
      </div>
    </div>
  );
}

function Label({ children }:{ children:React.ReactNode }) {
  return <label className="block text-[11px] font-bold text-lma-slate-500 uppercase tracking-wide mb-1">{children}</label>;
}

function FieldMini({ label, children }:{ label:string; children:React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-bold text-lma-slate-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );
}