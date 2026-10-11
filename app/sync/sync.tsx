"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { spaceName, type SpaceId } from "../lib/model";
import type { InventoryItem } from "../lib/notion/types";
import type { AiProposal } from "../lib/ai/model";
import type {
  ColumnMap,
  RecordFields,
  SyncAction,
  SyncLedger,
} from "../lib/sync/types";
import SiteLogout from "../components/site-logout";
import ThemeToggle from "../components/theme-toggle";
type Source = InventoryItem & { area: SpaceId; mode: "test" | "existing" };
type Status = {
  configured: boolean;
  testPassed: boolean;
  ledger: SyncLedger;
  reportId: string | null;
  reportRevision: number | null;
  sources: Source[];
  aiProposals: AiProposal[];
};
const messages: Record<string, string> = {
  SYNC_SETUP_REQUIRED:
    "المزامنة غير مفعّلة. أعدّ التكامل المنفصل وقاعدة الاختبار على الخادم.",
  SYNC_TEST_REQUIRED: "يلزم نجاح إنشاء وتحديث سجل تجريبي والتحقق منه أولًا.",
  SYNC_SCHEMA_CHANGED: "تغيّر مخطط المصدر؛ أعد التدقيق واعتماد ربط الحقول.",
  SYNC_AI_DRAFT_CHANGED:
    "المسودة أو الوجهة لا تطابق الاقتراح المعتمد. راجعها في المساعد.",
  SYNC_AUDIT_OR_MAPPING_CHANGED: "تغيّر التدقيق أو الربط؛ أعد اعتمادهما.",
  SYNC_SCOPE_CHANGED: "تغيّرت صلاحية المصدر؛ يلزم إعداد مراجعة جديدة.",
  SYNC_TEST_RECORD_REQUIRED:
    "استخدم سجلًا تجريبيًا بعنوان يبدأ بـ «اختبار مدار ·». تحديث الاختبار متاح لسجل أنشأه MADAR فقط.",
  SYNC_UNMAPPED_FIELDS:
    "بعض الحقول المطلوبة غير مربوطة بخصائص موجودة؛ لا يمكن تجاهلها أو تغيير المخطط.",
  SYNC_COLUMNS_INVALID: "اختر خصائص موجودة بأنواع مناسبة ومختلفة لكل حقل.",
  SYNC_FIELDS_INVALID:
    "تحقق من الحقول والتاريخ. الوقت يحتاج ISO مع منطقة زمنية صريحة.",
  SYNC_APPROVAL_EXPIRED:
    "انتهت المراجعة (١٥ دقيقة). جدّد مراجعة الفشل الآمن أو أعد إعداد الإجراء.",
  SYNC_RECORD_IN_USE:
    "المعرّف مستخدم لإجراء مختلف؛ لا تنشئ نسخة جديدة. راجع الإجراء السابق.",
  SYNC_RECORD_UNCERTAIN:
    "توجد نتيجة غامضة لهذا السجل. صالِحها بالقراءة قبل أي إجراء آخر.",
  SYNC_ACTION_CHANGED: "تغيّرت حالة الإجراء؛ حدّث التقرير.",
  SYNC_HISTORY_LIMIT:
    "وصل سجل المزامنة إلى الحد الآمن. لا تُحذف السجلات تلقائيًا.",
  SYNC_RETRY_LATER: "احترم وقت إعادة المحاولة الموضح وانتظر.",
  SYNC_RATE_LIMITED: "بلغت حد الطلبات. حاول بعد عشر دقائق.",
  WORKFLOW_BUSY: "توجد عملية جارية. انتظر قليلًا ثم حدّث الحالة.",
};
const states = {
  pending: "بانتظار موافقتك",
  writing: "أُرسلت محاولة · تحقق من النتيجة",
  succeeded: "تم التحقق من النجاح",
  failed: "فشل معروف · يمكن مراجعته",
  uncertain: "نتيجة غير مؤكدة · ممنوع إعادة الكتابة",
  conflict: "تعارض يتطلب مراجعة",
  rejected: "مرفوض محليًا",
};
const emptyFields: RecordFields = {
  title: "",
  details: null,
  date: null,
  kind: "task",
  durationMinutes: null,
};
const emptyColumns: ColumnMap = {
  title: "",
  recordId: "",
  details: null,
  date: null,
  kind: null,
  duration: null,
};
export default function Sync() {
  const [status, setStatus] = useState<Status | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [sourceId, setSourceId] = useState(""),
    [columns, setColumns] = useState<ColumnMap>(emptyColumns),
    [scopeConsent, setScopeConsent] = useState(false);
  const [recordId, setRecordId] = useState(""),
    [pageId, setPageId] = useState(""),
    [operation, setOperation] = useState<"create" | "update">("create"),
    [fields, setFields] = useState<RecordFields>(emptyFields),
    [proposalId, setProposalId] = useState("");
  const request = useCallback(async (action: string, body?: unknown) => {
    const res = await fetch(`/api/sync/${action}`, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const result = await res.json();
    if (!res.ok) {
      if (res.status === 401) {
        setStatus(null);
        window.location.replace(
          new URL("/login?next=%2Fsync", window.location.origin).href,
        );
      }
      throw Error(
        messages[result.error] ??
          "تعذّر إكمال الطلب بأمان. لم تُنفّذ عملية حذف أو دمج.",
      );
    }
    return result;
  }, []);
  const refresh = useCallback(async () => {
    try {
      const result = await request("status");
      setStatus(result);
    } catch (e) {
      setStatus(null);
      setError((e as Error).message);
    }
  }, [request]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 60000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, [refresh]);
  async function mutate(action: string, body: unknown) {
    setBusy(true);
    setError("");
    try {
      const result = await request(action, body);
      if (result.ledger)
        setStatus((s) => (s ? { ...s, ledger: result.ledger } : s));
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const source = status?.sources.find((s) => s.id === sourceId);
  const scope = status?.ledger.scopes.find((s) => s.sourceId === sourceId);
  const enabled = !!status?.configured && !busy;
  function select(id: string) {
    if (!recordId) setRecordId(crypto.randomUUID());
    setSourceId(id);
    const s = status?.sources.find((s) => s.id === id);
    const existing = status?.ledger.scopes.find((s) => s.sourceId === id);
    setColumns(
      existing?.columns ?? {
        ...emptyColumns,
        title: s?.schema.find((p) => p.type === "title")?.id ?? "",
      },
    );
    setScopeConsent(false);
    setFields({
      ...emptyFields,
      title: s?.mode === "test" ? "اختبار مدار · سجل قابل للتخلص منه" : "",
    });
    setProposalId("");
  }
  function chooseProposal(id: string) {
    setProposalId(id);
    const p = status?.aiProposals.find((p) => p.id === id);
    if (p) {
      setRecordId(p.id);
      setOperation("create");
      setPageId("");
      setFields({
        title: p.title,
        details: p.details || null,
        date: p.date,
        kind: p.kind,
        durationMinutes: p.durationMinutes,
      });
    }
  }
  return (
    <main className="sync-shell">
      <header className="section-head">
        <div>
          <Link href="/">← العودة إلى مدار</Link>
          <h1>مزامنة Notion، بقرار واضح.</h1>
          <p>مصادر محددة · سجل واحد في كل إجراء · مراجعة قبل الكتابة</p>
        </div>
        <div>
          <ThemeToggle />
          <SiteLogout disabled={busy} />
        </div>
      </header>
      <p className="helper">
        تكامل التدقيق يبقى للقراءة فقط. لا حذف أو أرشفة أو دمج أو تغيير مخطط. لن
        ينقل MADAR بيانات الديمو تلقائيًا، ولا يرسل محتوى الوزارة أو الصحة إلى
        AI.
      </p>
      <p className="helper">
        Notion لا يوفّر شرط تحديث ذريًا هنا؛ نفحص التغييرات قبل الكتابة وبعدها،
        لكن لا نستطيع منع كل تعديل متزامن. النتائج الغامضة تُراجع بالقراءة ولا
        تُعاد كتابتها تلقائيًا.
      </p>
      {error && <p role="alert">{error}</p>}
      <section className="sync-overview">
        <span className="tag">
          {status?.configured
            ? "المزامنة مفعّلة للمصادر المعتمدة فقط"
            : "المزامنة غير مفعّلة"}
        </span>
        <span className="tag">
          {status?.testPassed
            ? "اجتاز اختبار الإنشاء والتحديث"
            : "المصادر القائمة مقفلة حتى نجاح الاختبار"}
        </span>
        <p>آخر نجاح متحقق: {status?.ledger.lastSuccessAt ?? "لم يحدث بعد"}</p>
        <button
          className="button"
          disabled={busy}
          onClick={() => void refresh()}
        >
          تحديث حالة المزامنة
        </button>
        <Link href="/discovery">مراجعة التدقيق والربط</Link>
      </section>
      {!status?.configured && (
        <p>
          أعدّ الأسرار والتكامل المنفصل وقاعدة الاختبار حسب{" "}
          <a href="https://github.com/Elhamown/life-os/blob/feature/controlled-notion-sync/docs/notion-sync.md">
            دليل المزامنة
          </a>
          . لا تُدخل الأسرار في هذه الصفحة.
        </p>
      )}
      <section className="sync-panel">
        <h2>١. اعتماد مصدر وحقول موجودة</h2>
        <label>
          مصدر Notion
          <select
            value={sourceId}
            onChange={(e) => select(e.target.value)}
            disabled={!enabled}
          >
            <option value="">اختر مصدرًا مدققًا ومعتمد الربط</option>
            {status?.sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title || s.id} · {spaceName(s.area)} ·{" "}
                {s.mode === "test" ? "اختبار منفصل" : "بيانات قائمة"}
              </option>
            ))}
          </select>
        </label>
        {source && (
          <>
            <p>
              معرّف المصدر: <code>{source.id}</code> ·{" "}
              {source.mode === "test"
                ? "يجب أن يكون مصدرًا منفصلًا يحتوي بيانات قابلة للتخلص منها فقط"
                : "مقفَل إلى أن تنجح الكتابة التجريبية"}
            </p>
            <p className="helper">
              حقل المعرّف الثابت يجب أن يكون rich_text موجودًا ومخصصًا لهذه
              الغاية. لا نضيف خصائص ولا نستبدل معرّفات موجودة مختلفة.
            </p>
            {(
              Object.entries({
                title: ["العنوان", "title"],
                recordId: ["المعرّف الثابت", "rich_text"],
                details: ["التفاصيل", "rich_text"],
                date: ["التاريخ", "date"],
                kind: ["نوع السجل", "rich_text"],
                duration: ["المدة بالدقائق", "number"],
              }) as [keyof ColumnMap, [string, string]][]
            ).map(([key, [name, type]]) => (
              <label key={key}>
                {name}
                <select
                  value={columns[key] ?? ""}
                  disabled={!enabled}
                  onChange={(e) =>
                    setColumns({
                      ...columns,
                      [key]:
                        e.target.value ||
                        (["title", "recordId"].includes(key) ? "" : null),
                    })
                  }
                >
                  <option value="">
                    {["title", "recordId"].includes(key)
                      ? "اختر خاصية موجودة"
                      : "غير مربوط"}
                  </option>
                  {source.schema
                    .filter((p) => p.type === type)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {p.id}
                      </option>
                    ))}
                </select>
              </label>
            ))}
            <label className="ai-consent">
              <input
                type="checkbox"
                checked={scopeConsent}
                onChange={(e) => setScopeConsent(e.target.checked)}
                disabled={!enabled}
              />{" "}
              أوافق على الكتابة في هذا المصدر والحقول المحددة فقط؛{" "}
              {source.mode === "test"
                ? "وأؤكد أنه قاعدة اختبار مستقلة قابلة للتخلص من سجلاتها."
                : "وقد راجعت التدقيق والربط."}
            </label>
            <button
              className="button primary"
              disabled={
                !enabled ||
                !scopeConsent ||
                !columns.title ||
                !columns.recordId ||
                (source.mode === "existing" && !status?.testPassed)
              }
              onClick={() =>
                void mutate("scope", {
                  sourceId,
                  columns,
                  approved: true,
                  disposableConfirmed: source.mode === "test",
                  reportId: status?.reportId,
                  revision: status?.reportRevision,
                })
              }
            >
              اعتماد نطاق الكتابة
            </button>
            {scope && (
              <p className="helper">اعتماد الحقول الحالي: {scope.approvedAt}</p>
            )}
          </>
        )}
      </section>
      {scope && (
        <section className="sync-panel">
          <h2>٢. إعداد إجراء للمراجعة فقط</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void mutate("prepare", {
                sourceId,
                recordId,
                pageId: operation === "update" ? pageId : null,
                operation,
                origin: proposalId ? "ai" : "manual",
                proposalId: proposalId || null,
                fields,
              });
            }}
          >
            <label>
              مصدر الإجراء
              <select
                value={proposalId}
                disabled={!enabled}
                onChange={(e) => {
                  if (!e.target.value) {
                    setProposalId("");
                    setFields(emptyFields);
                    setRecordId(crypto.randomUUID());
                  } else chooseProposal(e.target.value);
                }}
              >
                <option value="">إدخال يدوي</option>
                {status?.aiProposals
                  .filter((p) => p.spaceId === scope.area)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      مسودة AI معتمدة: {p.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              العملية
              <select
                disabled={!enabled || !!proposalId}
                value={operation}
                onChange={(e) =>
                  setOperation(e.target.value as "create" | "update")
                }
              >
                <option value="create">إنشاء سجل واحد</option>
                <option value="update">
                  تحديث سجل موجود مع الحفاظ على معرّفه
                </option>
              </select>
            </label>
            <label>
              المعرّف الثابت للسجل
              <input
                value={recordId}
                onChange={(e) => setRecordId(e.target.value)}
                required
                disabled={!enabled || !!proposalId}
              />
            </label>
            {operation === "update" && (
              <label>
                معرّف صفحة Notion القائمة
                <input
                  value={pageId}
                  onChange={(e) => setPageId(e.target.value)}
                  required
                  disabled={!enabled}
                />
              </label>
            )}
            <label>
              عنوان السجل
              <input
                value={fields.title}
                onChange={(e) =>
                  setFields({ ...fields, title: e.target.value })
                }
                maxLength={200}
                required
                disabled={!enabled || !!proposalId}
              />
            </label>
            <label>
              نوع السجل
              <select
                value={fields.kind}
                onChange={(e) =>
                  setFields({
                    ...fields,
                    kind: e.target.value as RecordFields["kind"],
                  })
                }
                disabled={!enabled || !!proposalId}
              >
                <option value="task">مهمة</option>
                <option value="event">موعد</option>
                <option value="note">ملاحظة</option>
                <option value="study">جلسة دراسة</option>
              </select>
            </label>
            <label>
              التفاصيل المراد كتابتها
              <textarea
                value={fields.details ?? ""}
                onChange={(e) =>
                  setFields({ ...fields, details: e.target.value || null })
                }
                maxLength={1000}
                disabled={!enabled || !!proposalId}
              />
            </label>
            <label>
              التاريخ أو طابع ISO مع المنطقة الزمنية
              <input
                value={fields.date ?? ""}
                placeholder="2026-10-11 أو 2026-10-11T14:00:00+03:00"
                onChange={(e) =>
                  setFields({ ...fields, date: e.target.value || null })
                }
                disabled={!enabled}
              />
            </label>
            {proposalId &&
              status?.aiProposals.find((p) => p.id === proposalId)?.time && (
                <p className="helper">
                  أضف الوقت الأصلي والمنطقة الزمنية صراحةً؛ لا نخمن المنطقة
                  الزمنية.
                </p>
              )}
            <label>
              المدة بالدقائق
              <input
                type="number"
                min={5}
                max={480}
                value={fields.durationMinutes ?? ""}
                onChange={(e) =>
                  setFields({
                    ...fields,
                    durationMinutes: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
                disabled={!enabled || !!proposalId}
              />
            </label>
            <button
              className="button"
              disabled={!enabled || !fields.title.trim()}
              type="submit"
            >
              إعداد المعاينة دون كتابة
            </button>
          </form>
        </section>
      )}
      <section>
        <h2>٣. مراجعة الإجراءات وسجل المزامنة</h2>
        <p className="helper">
          الموافقة أدناه تخص الهدف والحمولة المعروضين فقط. المحاولات لا تعمل في
          الخلفية.
        </p>
        {!status?.ledger.actions.length && <p>لا توجد إجراءات مزامنة بعد.</p>}
        {[...(status?.ledger.actions ?? [])].reverse().map((action) => (
          <ActionCard
            key={`${action.id}:${action.version}`}
            action={action}
            busy={busy}
            onAction={mutate}
          />
        ))}
      </section>
    </main>
  );
}
function ActionCard({
  action,
  busy,
  onAction,
}: {
  action: SyncAction;
  busy: boolean;
  onAction: (action: string, body: unknown) => Promise<void>;
}) {
  const [approved, setApproved] = useState(false),
    [risk, setRisk] = useState(false),
    [pageId, setPageId] = useState("");
  const target =
    action.operation === "create"
      ? {
          parent: { type: "data_source_id", data_source_id: action.sourceId },
          properties: action.payload,
        }
      : { properties: action.payload };
  const base = {
    id: action.id,
    version: action.version,
    digest: action.digest,
    approved: true,
    riskAccepted: risk,
  };
  return (
    <article className="sync-panel">
      <div className="section-head">
        <h3>{action.fields.title}</h3>
        <span className="tag">{states[action.state]}</span>
      </div>
      <p>
        {action.operation === "create" ? "إنشاء" : "تحديث"} ·{" "}
        {action.origin === "ai" ? "مسودة AI" : "إدخال يدوي"} ·{" "}
        {spaceName(action.scope.area)} ·{" "}
        {action.scope.mode === "test" ? "اختبار" : "مصدر قائم"}
      </p>
      <p>
        المصدر: <code>{action.sourceId}</code>
        <br />
        معرّف السجل: <code>{action.recordId}</code>
        <br />
        صفحة Notion:{" "}
        <code>{action.pageId ?? "صفحة جديدة أو مطابقة للمعرّف الثابت"}</code>
      </p>
      <p>
        المحاولات: {action.attempts}/٥ · آخر نجاح:{" "}
        {action.lastSuccessAt ?? "لا يوجد"} · إعادة محاولة بعد:{" "}
        {action.retryAt ?? "لا انتظار محدد"}
      </p>
      {action.error && (
        <p role="status">{messages[action.error] ?? action.error}</p>
      )}
      <details open={action.state === "pending"}>
        <summary>الهدف والحمولة الدقيقة</summary>
        <code dir="ltr">
          {action.operation === "create"
            ? "POST /v1/pages"
            : `PATCH /v1/pages/${action.pageId}`}
        </code>
        <pre dir="ltr">{JSON.stringify(target, null, 2)}</pre>
        <p className="helper">
          بصمة المراجعة: <code>{action.digest}</code>
        </p>
      </details>
      {action.baseline && (
        <details>
          <summary>القيم عند إعداد المراجعة</summary>
          <p>آخر تعديل: {action.baseline.editedAt}</p>
          <pre dir="ltr">
            {JSON.stringify(action.baseline.properties, null, 2)}
          </pre>
        </details>
      )}
      {action.current && (
        <details open={action.state === "conflict"}>
          <summary>النتيجة الحالية للمراجعة</summary>
          <p>آخر تعديل: {action.current.editedAt}</p>
          <pre dir="ltr">
            {JSON.stringify(action.current.properties, null, 2)}
          </pre>
        </details>
      )}
      {!!action.candidates.length && (
        <p>
          صفحات مطابقة تتطلب فحصًا يدويًا:{" "}
          <code dir="ltr">{action.candidates.join(" · ")}</code>. لن تُدمج.
        </p>
      )}
      {["pending", "failed"].includes(action.state) && (
        <>
          <label className="ai-consent">
            <input
              type="checkbox"
              checked={approved}
              onChange={(e) => setApproved(e.target.checked)}
              disabled={busy}
            />{" "}
            أوافق على تنفيذ الهدف والحمولة المعروضين في Notion، لسجل واحد فقط.
          </label>
          {action.operation === "update" && (
            <label className="ai-consent">
              <input
                type="checkbox"
                checked={risk}
                onChange={(e) => setRisk(e.target.checked)}
                disabled={busy}
              />{" "}
              راجعت القيم الحالية وأفهم حدود التعديل المتزامن في Notion.
            </label>
          )}
          <button
            className="button primary"
            disabled={
              busy || !approved || (action.operation === "update" && !risk)
            }
            onClick={() =>
              void onAction(
                action.state === "failed" ? "retry" : "execute",
                base,
              )
            }
          >
            {action.state === "failed"
              ? "إعادة محاولة معتمدة"
              : "موافقة وتنفيذ هذا الإجراء"}
          </button>
          {action.state === "pending" && (
            <button
              className="quiet-button"
              disabled={busy}
              onClick={() => void onAction("reject", base)}
            >
              رفض دون تغيير Notion
            </button>
          )}
          {action.state === "failed" && (
            <button
              className="button"
              disabled={busy}
              onClick={() => void onAction("renew", base)}
            >
              تجديد المعاينة بالقراءة فقط
            </button>
          )}
        </>
      )}
      {["writing", "uncertain"].includes(action.state) && (
        <>
          <p>
            لا تُكرر الإنشاء ولا تغيّر المعرّف. المصالحة التالية تقرأ Notion فقط
            ولا تعيد الكتابة.
          </p>
          <label>
            معرّف صفحة مؤكدة للمصالحة (اختياري)
            <input
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              disabled={busy}
            />
          </label>
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void onAction("recover", { ...base, pageId: pageId || null })
            }
          >
            تحقق من النتيجة دون كتابة
          </button>
        </>
      )}
      {action.state === "conflict" && (
        <p>
          راجع الفرق والتكرارات في Notion؛ لإجراء تغيير مقصود، أعد إعداد معاينة
          جديدة بالقيم الحالية وموافقة جديدة. لا يوجد تجاوز للتعارض.
        </p>
      )}
      <details>
        <summary>التاريخ القابل للتدقيق · {action.history.length} خطوة</summary>
        <ol>
          {action.history.map((h, i) => (
            <li key={i}>
              {h.at} · {h.event} · <code>{h.digest}</code>
              {h.payload && (
                <pre dir="ltr">{JSON.stringify(h.payload, null, 2)}</pre>
              )}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}
