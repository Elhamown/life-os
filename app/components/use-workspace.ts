"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { emptyState, reducer, type Action, type State } from "../lib/model";
import { validWorkspace } from "../lib/workspace-schema";
export function useWorkspace() {
  const [state, setState] = useState<State>(emptyState);
  const [status, setStatus] = useState<
    "loading" | "saved" | "saving" | "error" | "conflict"
  >("loading");
  const [loaded, setLoaded] = useState(false);
  const loading = useRef(false),
    loadFailures = useRef(0),
    loadRetryAt = useRef(0);
  const retryAt = useRef(0),
    failures = useRef(0);
  const revision = useRef(0),
    current = useRef(state),
    pending = useRef(false),
    busy = useRef(false),
    ready = useRef(false);
  const flush = useCallback(async () => {
    if (
      busy.current ||
      !pending.current ||
      !ready.current ||
      Date.now() < retryAt.current ||
      failures.current >= 5
    )
      return;
    busy.current = true;
    const snapshot = current.current;
    const expected = revision.current;
    setStatus("saving");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      let result: Response;
      try {
        result = await fetch("/api/workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            revision: expected,
            workspace: { schemaVersion: 1, state: snapshot },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (result.status === 409) {
        // A previous interrupted request may have committed. Recognize it without overwriting newer data.
        const check = await fetch("/api/workspace", {
          cache: "no-store",
          signal: AbortSignal.timeout(15000),
        });
        const saved = await check.json();
        if (
          !check.ok ||
          saved.revision !== expected + 1 ||
          JSON.stringify(saved.workspace?.state) !== JSON.stringify(snapshot)
        ) {
          ready.current = false;
          setStatus("conflict");
          return;
        }
      } else if (!result.ok) {
        const delay = Number(result.headers.get("Retry-After"));
        if (Number.isFinite(delay) && delay > 0)
          retryAt.current = Date.now() + delay * 1000;
        if (![429, 502, 503, 504].includes(result.status)) failures.current = 5;
        throw new Error("SAVE_FAILED");
      }
      failures.current = 0;
      retryAt.current = 0;
      revision.current = expected + 1;
      pending.current = current.current !== snapshot;
      setStatus(pending.current ? "saving" : "saved");
    } catch {
      failures.current++;
      retryAt.current = Math.max(
        retryAt.current,
        Date.now() + Math.min(30000, 1000 * 2 ** failures.current),
      );
      setStatus("error");
    } finally {
      busy.current = false;
    }
  }, []);
  const load = useCallback(async () => {
    if (
      pending.current ||
      busy.current ||
      loading.current ||
      loadFailures.current >= 3 ||
      Date.now() < loadRetryAt.current
    )
      return;
    loading.current = true;
    try {
      const result = await fetch("/api/workspace", {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      const body = await result.json();
      if (!result.ok) {
        if (![429, 502, 503, 504].includes(result.status))
          loadFailures.current = 3;
        throw new Error("LOAD_FAILED");
      }
      if (
        !validWorkspace(body.workspace) ||
        !Number.isSafeInteger(body.revision)
      ) {
        loadFailures.current = 3;
        throw new Error("LOAD_FAILED");
      }
      current.current = body.workspace.state;
      revision.current = body.revision;
      ready.current = true;
      setState(body.workspace.state);
      setLoaded(true);
      setStatus("saved");
    } catch {
      loadFailures.current++;
      loadRetryAt.current = Date.now() + 1000 * 2 ** loadFailures.current;
      ready.current = false;
      setStatus("error");
    } finally {
      loading.current = false;
    }
  }, []);
  useEffect(() => {
    const initialLoad = setTimeout(() => void load(), 0);
    const timer = setInterval(() => {
      if (ready.current) void flush();
      else void load();
    }, 1000);
    const unload = (event: BeforeUnloadEvent) => {
      if (pending.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", unload);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(timer);
      window.removeEventListener("beforeunload", unload);
    };
  }, [load, flush]);
  const dispatch = (action: Action) => {
    if (!ready.current) return;
    const next = reducer(current.current, action);
    if (next === current.current) return;
    failures.current = 0;
    retryAt.current = 0;
    const labels: Record<string, string> = {
      capture: "إضافة سجل جديد",
      toggle: "تحديث حالة مهمة",
      editTask: "تعديل مهمة",
      deleteTask: "حذف مهمة",
      convert: "تحويل ملاحظة إلى مهمة",
      editNote: "تعديل ملاحظة",
      deleteNote: "حذف ملاحظة",
      project: "تحديث مشروع",
      deleteProject: "حذف مشروع",
      event: "تحديث موعد",
      deleteEvent: "حذف موعد",
      preferences: "تحديث التفضيلات",
      habit: "إضافة عادة",
      toggleHabit: "تحديث عادة يومية",
      deleteHabit: "حذف عادة",
      goal: "تحديث هدف",
      deleteGoal: "حذف هدف",
      customSpace: "إضافة مساحة مخصصة",
      hydrate: "استرداد نسخة",
      decide: "مراجعة اقتراح",
    };
    next.activity = [
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        label: labels[action.type] ?? "تحديث مساحة العمل",
      },
      ...(current.current.activity ?? []),
    ].slice(0, 50);
    current.current = next;
    pending.current = true;
    setState(next);
    setStatus("saving");
  };
  function exportUnsaved() {
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify({ schemaVersion: 1, state: current.current }, null, 2)],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "madar-workspace-recovery.json";
    link.click();
    URL.revokeObjectURL(url);
  }
  return {
    state,
    dispatch,
    status,
    retry: () => {
      failures.current = 0;
      retryAt.current = 0;
      loadFailures.current = 0;
      loadRetryAt.current = 0;
      return pending.current ? flush() : load();
    },
    exportUnsaved,
    ready: loaded && status !== "conflict",
  };
}
