"use client";
import { useEffect, useState } from "react";
import { legacyWorkspace } from "../lib/workspace-storage";
import { validWorkspace, type Workspace } from "../lib/workspace-schema";
import type { Action, State } from "../lib/model";
const collections = [
  "tasks",
  "notes",
  "proposals",
  "projects",
  "events",
  "habits",
  "goals",
  "customSpaces",
] as const;
export default function WorkspaceRecovery({
  state,
  dispatch,
}: {
  state: State;
  dispatch: (a: Action) => void;
}) {
  const [legacy, setLegacy] = useState<Workspace | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        setLegacy(legacyWorkspace());
      } catch {
        setError(
          "توجد نسخة محلية قديمة لا يمكن قراءتها بأمان. لم نحذفها أو نستبدلها.",
        );
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  function exportLegacy() {
    if (!legacy) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(legacy, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "madar-legacy-review.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  async function importFile(file: File) {
    try {
      if (file.size > 65536) throw Error("LIMIT");
      const restored: unknown = JSON.parse(await file.text());
      if (!validWorkspace(restored)) throw Error("SCHEMA");
      const next: State = { ...state };
      let count = 0;
      for (const key of collections) {
        const existing = state[key] ?? [],
          incoming = restored.state[key] ?? [];
        const ids = new Map(existing.map((r) => [r.id, r]));
        for (const record of incoming) {
          const previous = ids.get(record.id);
          if (previous && JSON.stringify(previous) !== JSON.stringify(record))
            throw Error("CONFLICT");
          if (!previous) {
            ids.set(record.id, record as never);
            count++;
          }
        }
        Object.assign(next, { [key]: [...ids.values()] });
      }
      if (!validWorkspace({ schemaVersion: 1, state: next }))
        throw Error("SCHEMA");
      if (count === 0) {
        setError("لا توجد سجلات جديدة في هذه النسخة.");
        return;
      }
      if (
        !window.confirm(
          `إضافة ${count} سجلات من النسخة إلى مساحة العمل؟ راجع أن النسخة تتضمن بياناتك المطلوبة؛ قد تتضمن النسخ القديمة بيانات ديمو. لن تُستبدل سجلات موجودة.`,
        )
      )
        return;
      dispatch({ type: "hydrate", state: next });
      setError("");
    } catch {
      setError(
        "تعذّرت الاستعادة: النسخة غير صالحة أو تتعارض مع سجل موجود أو تتجاوز الحد. لم تُستبدل أي بيانات.",
      );
    }
  }
  return (
    <details className="workspace-status">
      <summary>استرداد البيانات والنسخ السابقة</summary>
      {legacy && (
        <>
          <p>
            توجد بيانات محفوظة سابقاً في هذا المتصفح. بقيت كما هي ولم تُستورد
            تلقائياً.
          </p>
          <button className="button" onClick={exportLegacy}>
            تنزيل النسخة القديمة للمراجعة
          </button>
        </>
      )}
      <label>
        استعادة نسخة مراجعة أو استرداد JSON
        <input
          type="file"
          accept="application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importFile(file);
            e.target.value = "";
          }}
        />
      </label>
      <p>
        الاستعادة تضيف سجلات جديدة فقط ولا تستبدل سجلاً مختلفاً يحمل المعرّف
        نفسه. تفضيلاتك الحالية تبقى كما هي.
      </p>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
