"use client";
import { useState } from "react";
import { Search, X, ChevronLeft } from "lucide-react";
import { type State, type SpaceId, spaces, spaceName } from "../lib/model";
import { Empty } from "./shared";
export default function SearchPanel({
  state,
  onSelect,
  onClose,
}: {
  state: State;
  onSelect: (id: SpaceId) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const records = [
    ...spaces.map((s) => ({
      id: `space-${s.id}`,
      title: s.name,
      spaceId: s.id,
      kind: "مساحة",
    })),
    ...state.tasks.map((t) => ({ ...t, kind: "مهمة" })),
    ...state.notes.map((n) => ({ ...n, kind: "ملاحظة" })),
  ];
  const matches = query.trim()
    ? records.filter((r) =>
        `${r.title} ${spaceName(r.spaceId)}`.includes(query.trim()),
      )
    : [];
  return (
    <section className="section global-search" aria-label="البحث في مساحتك">
      <div className="section-head">
        <h2>البحث في مساحتك</h2>
        <button
          className="icon-button"
          aria-label="إغلاق البحث"
          onClick={onClose}
        >
          <X size={19} />
        </button>
      </div>
      <label className="space-search">
        <Search size={18} />
        <input
          autoFocus
          aria-label="ابحث في المهام والملاحظات والمساحات"
          placeholder="مهمة، فكرة، أو مساحة..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {matches.map((r) => (
        <button
          className="search-result"
          key={r.id}
          onClick={() => onSelect(r.spaceId)}
        >
          <div>
            <strong>{r.title}</strong>
            <small>
              {r.kind} · {spaceName(r.spaceId)}
            </small>
          </div>
          <ChevronLeft size={17} />
        </button>
      ))}
      {query.trim() && !matches.length && <Empty>لا توجد نتائج مطابقة.</Empty>}
      {!query.trim() && (
        <Empty>ابحث في سجلات الديمو؛ كل نتيجة تفتح مساحتها.</Empty>
      )}
    </section>
  );
}
