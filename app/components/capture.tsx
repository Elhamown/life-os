"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { type Action, type SpaceId, spaces } from "../lib/model";
export default function Capture({
  dispatch,
  onClose,
  defaultSpace,
}: {
  dispatch: (a: Action) => void;
  onClose: () => void;
  defaultSpace: SpaceId;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"task" | "note">("task");
  const [spaceId, setSpaceId] = useState(defaultSpace);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    element?.showModal();
    element?.querySelector("textarea")?.focus();
    return () => {
      element?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      className="capture-dialog"
      aria-labelledby="capture-title"
    >
      <div className="section-head">
        <div>
          <span className="eyebrow">فكرة صغيرة، خطوة واضحة</span>
          <h2 id="capture-title">التقاط سريع</h2>
        </div>
        <button
          className="icon-button"
          aria-label="إغلاق الالتقاط"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          dispatch({
            type: "capture",
            id: crypto.randomUUID(),
            title,
            spaceId,
            kind,
          });
          onClose();
        }}
      >
        <label>
          ما الذي تريد التقاطه؟
          <textarea
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="اكتب مهمة أو فكرة..."
            maxLength={1000}
            required
          />
        </label>
        <div className="form-grid">
          <label>
            النوع
            <select
              aria-label="النوع"
              value={kind}
              onChange={(e) => setKind(e.target.value as "task" | "note")}
            >
              <option value="task">مهمة</option>
              <option value="note">ملاحظة</option>
            </select>
          </label>
          <label>
            المساحة
            <select
              aria-label="المساحة"
              value={spaceId}
              onChange={(e) => setSpaceId(e.target.value as SpaceId)}
            >
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="helper">
          تُحفظ على هذا المتصفح وتبقى بعد تحديث الصفحة. لم تُربط بـ Notion بعد.
        </p>
        <button
          type="submit"
          className="button primary"
          disabled={!title.trim()}
        >
          <Plus size={17} />
          حفظ المهمة أو الملاحظة
        </button>
      </form>
    </dialog>
  );
}
