"use client";
import { useCallback, useEffect, useState } from "react";
import type { ReadScope } from "../lib/notion/records";
import { spaceName } from "../lib/model";
import { Section } from "./shared";
type Source = {
  sourceId: string;
  area: ReadScope["area"];
  properties: { id: string; name: string }[];
};
export default function NotionReadPanel() {
  const [scopes, setScopes] = useState<ReadScope[]>([]),
    [sources, setSources] = useState<Source[]>([]),
    [configured, setConfigured] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/notion-records", {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw Error();
      const data = await response.json();
      setScopes(data.scopes);
      setSources(data.sources);
      setConfigured(data.configured);
    } catch {
      setError("تعذّر قراءة حالة Notion. إعدادات الخادم أو الجلسة غير متاحة.");
    }
  }, []);
  const step = useCallback(
    async (scope: ReadScope) => {
      setBusy(true);
      try {
        const response = await fetch("/api/notion-records", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "step",
            sourceId: scope.sourceId,
            revision: scope.revision,
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (!response.ok) throw Error();
        await load();
        setError("");
      } catch {
        setError(
          "لم تكتمل دورة القراءة. البيانات السابقة محفوظة؛ تحقق من الحالة قبل المحاولة التالية.",
        );
      } finally {
        setBusy(false);
      }
    },
    [load],
  );
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    return () => clearTimeout(initial);
  }, [load]);
  useEffect(() => {
    if (!configured || busy) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "hidden") return;
      const due = scopes.find(
        (s) =>
          s.automatic &&
          (!s.retryAt || Date.parse(s.retryAt) <= Date.now()) &&
          (s.cursor ||
            !s.lastSuccess ||
            Date.now() - Date.parse(s.lastSuccess) >= 5 * 60 * 1000),
      );
      if (due) void step(due);
    }, 20000);
    return () => clearInterval(timer);
  }, [configured, busy, scopes, step]);
  async function configure(
    event: React.FormEvent<HTMLFormElement>,
    source: Source,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const response = await fetch("/api/notion-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "configure",
          sourceId: source.sourceId,
          titlePropertyId: form.get("property"),
          automatic: form.get("automatic") === "on",
          approved: form.get("approved") === "on",
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw Error();
      await load();
      setError("");
    } catch {
      setError("راجع اعتماد المصدر وخاصية العنوان أولاً في اكتشاف Notion.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Section
      title="قراءة Notion ومتابعة المزامنة"
      caption={
        configured
          ? "اتصال الخادم مُعدّ؛ نجاح القراءة يظهر لكل مصدر بعد اختباره"
          : "قراءة السجلات غير مهيّأة بعد"
      }
    >
      <p>
        قراءة فقط. تبقى السجلات المستوردة منفصلة عن مهامك وملاحظاتك، ولا تُرسل
        إلى AI. لا توجد كتابة أو حذف في Notion.
      </p>
      <p>
        القراءة التلقائية تعمل أثناء فتح مدار وظهور الصفحة فقط؛ لا تتطلب وظائف
        Cron أو خطة Vercel مدفوعة.
      </p>
      {error && <p role="alert">{error}</p>}
      {sources.map((source) => {
        const scope = scopes.find((s) => s.sourceId === source.sourceId);
        return (
          <div className="workspace-editor" key={source.sourceId}>
            <strong>{spaceName(source.area)}</strong>
            <small>{source.sourceId}</small>
            <form onSubmit={(e) => void configure(e, source)}>
              <label>
                خاصية العنوان
                <select name="property" defaultValue={scope?.titlePropertyId}>
                  {source.properties.map((p) => (
                    <option value={p.id} key={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  name="automatic"
                  defaultChecked={scope?.automatic}
                />
                قراءة تلقائية أثناء فتح مدار
              </label>
              <label>
                <input type="checkbox" name="approved" required />
                أوافق على قراءة عناوين سجلات هذا المصدر وحفظها مشفّرة في مدار
              </label>
              <button
                className="button"
                disabled={busy || !configured || !source.properties.length}
              >
                حفظ ربط القراءة
              </button>
            </form>
            {scope && (
              <>
                <p role="status">
                  {scope.error
                    ? `تحتاج معالجة: ${scope.error}`
                    : scope.cursor
                      ? "دورة القراءة جارية"
                      : "جاهز للقراءة"}{" "}
                  · {scope.records.length} سجل
                </p>
                <p>
                  آخر نجاح:{" "}
                  {scope.lastSuccess
                    ? new Date(scope.lastSuccess).toLocaleString("ar-SY")
                    : "لم تنجح دورة قراءة بعد"}
                </p>
                {scope.retryAt && (
                  <p>
                    المحاولة التالية بعد{" "}
                    {new Date(scope.retryAt).toLocaleString("ar-SY")}
                  </p>
                )}
                <button
                  className="button"
                  disabled={busy || !configured}
                  onClick={() => void step(scope)}
                >
                  قراءة الدفعة التالية
                </button>
                <details>
                  <summary>السجلات المستوردة</summary>
                  {scope.records.map((r) => (
                    <p key={r.id}>{r.title || "بدون عنوان"}</p>
                  ))}
                </details>
              </>
            )}
          </div>
        );
      })}
      {!sources.length && (
        <p>ابدأ باكتشاف المصادر واعتماد ربطها بمساحاتك قبل قراءة السجلات.</p>
      )}
      <button
        className="quiet-button"
        disabled={busy}
        onClick={() => void load()}
      >
        تحديث الحالة
      </button>
    </Section>
  );
}
