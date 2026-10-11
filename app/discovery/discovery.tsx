"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Database,
  KeyRound,
  LockKeyhole,
  LogOut,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import ThemeToggle from "../components/theme-toggle";
import { spaces, spaceName, type SpaceId } from "../lib/model";
import type { AuditEntry, AuditView, Mapping } from "../lib/notion/types";
const messages: Record<string, string> = {
  PRIVATE_SETUP_REQUIRED:
    "المساحة الخاصة غير مُعدّة بعد. اتّبع دليل الإعداد وضع القيم في إعدادات الخادم، لا في هذه الصفحة.",
  PRIVATE_SERVICE_UNAVAILABLE:
    "تعذّر الوصول إلى التخزين الخاص. لم تُعرض بيانات Notion. تحقّق من اتصال PostgreSQL والجداول الداخلية.",
  AUTH_REQUIRED: "انتهت الجلسة أو تحتاج تسجيل الدخول.",
  ORIGIN_DENIED: "تم رفض الطلب من مصدر غير مطابق لعنوان التطبيق.",
  LOGIN_FAILED: "تعذّر تسجيل الدخول. تحقّق من كلمة المرور الخاصة.",
  LOGIN_RATE_LIMITED: "محاولات كثيرة. انتظر عشر دقائق قبل المحاولة مجددًا.",
  NOTION_SETUP_REQUIRED:
    "أضف تكامل Notion مستقلًا للقراءة فقط في إعدادات الخادم، ثم أكّد إعداد صلاحياته.",
  NOTION_TOKEN_INVALID:
    "تعذّر اعتماد تكامل Notion. راجع الرمز في إعدادات الخادم دون عرضه هنا.",
  NOTION_ACCESS_DENIED:
    "التكامل لا يملك الوصول المطلوب. شارك الصفحات المقصودة معه فقط.",
  NOTION_NETWORK_UNAVAILABLE:
    "تعذّر الاتصال بـ Notion. يمكنك استئناف الجرد لاحقًا.",
  NOTION_TEMPORARILY_UNAVAILABLE: "Notion غير متاح مؤقتًا. حاول لاحقًا.",
  NOTION_REQUEST_FAILED:
    "لم يكتمل طلب Notion. التقرير السابق محفوظ، ويمكن إعادة المحاولة.",
  NOTION_RATE_LIMITED:
    "طلب Notion الانتظار. سنحترم فترة الانتظار قبل الاستئناف.",
  WORKFLOW_BUSY: "هناك طلب قيد التنفيذ. انتظر ثم حدّث التقرير.",
  REPORT_CHANGED: "تغيّر التقرير منذ فتحه. حدّثه وراجع اختياراتك قبل الحفظ.",
  DISCOVERY_IN_PROGRESS: "يوجد جرد قيد التنفيذ. استأنفه بدل إنشاء جرد آخر.",
  DISCOVERY_REVIEW_REQUIRED: "أكّد نطاق الاكتشاف قبل البدء.",
  INVALID_MAPPING:
    "راجع المصادر والمجالات المختارة. لا يمكن ربط مصدر غير موثّق في التقرير.",
  MAPPING_REVIEW_REQUIRED: "أكمل مراجعة التقرير وأكّد الموافقة.",
  DISCOVERY_REQUIRED: "ابدأ الجرد أولًا ثم راجع التقرير.",
  REQUEST_TOO_LARGE: "الطلب كبير جدًا. احفظ عددًا أصغر من الروابط في كل مرة.",
};
const warningNames: Record<string, string> = {
  INACCESSIBLE: "عنصر غير متاح للتكامل؛ لم يتم جرده",
  PARTIAL_OBJECT: "بيانات وصفية ناقصة",
  SEARCH_INCOMPLETE: "بحث Notion أعاد نتيجة جزئية",
  LIMIT_REACHED: "وصل الجرد إلى حد الأمان؛ ليس كاملًا",
  CURSOR_INVALID: "تعذّر متابعة ترقيم البحث",
  RATE_LIMITED: "انتظار حد الطلبات",
};
class UiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
async function request<T>(path: string, body?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body ? "POST" : "GET",
      cache: "no-store",
      credentials: "same-origin",
      ...(body
        ? {
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
  } catch {
    throw new UiError("PRIVATE_SERVICE_UNAVAILABLE");
  }
  const result = await response.json();
  if (!response.ok)
    throw new UiError(
      typeof result.error === "string"
        ? result.error
        : "PRIVATE_SERVICE_UNAVAILABLE",
    );
  return result as T;
}
export default function Discovery() {
  const [auth, setAuth] = useState<"checking" | "setup" | "locked" | "open">(
    "checking",
  );
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<AuditView | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [choices, setChoices] = useState<Record<string, SpaceId | "">>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [acknowledged, setAcknowledged] = useState(false);
  const [approved, setApproved] = useState(false);
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [configured, setConfigured] = useState(false);
  const clearPrivate = useCallback(() => {
    setReport(null);
    setMappings([]);
    setChoices({});
    setSelected({});
    setLogs([]);
    setConfigured(false);
    setApproved(false);
  }, []);
  const handleError = useCallback(
    (e: unknown) => {
      const code =
        e instanceof UiError ? e.code : "PRIVATE_SERVICE_UNAVAILABLE";
      setError(
        messages[code] ??
          "تعذّر إكمال الطلب بأمان. حدّث الصفحة أو راجع إعدادات الخادم.",
      );
      if (
        [
          "AUTH_REQUIRED",
          "PRIVATE_SETUP_REQUIRED",
          "PRIVATE_SERVICE_UNAVAILABLE",
        ].includes(code)
      ) {
        clearPrivate();
        setAuth(code === "AUTH_REQUIRED" ? "locked" : "setup");
      }
    },
    [clearPrivate],
  );
  const load = useCallback(async () => {
    const [data, status] = await Promise.all([
      request<{ report: AuditView | null; mappings: Mapping[] }>(
        "/api/notion/report",
      ),
      request<{ configured: boolean }>("/api/notion/status"),
    ]);
    setReport(data.report);
    setMappings(data.mappings);
    setConfigured(status.configured);
    setSelected({});
    setApproved(false);
    const next: Record<string, SpaceId | ""> = {};
    for (const s of data.report?.suggestions ?? [])
      next[s.sourceId] =
        data.mappings.find((m) => m.sourceId === s.sourceId)?.area ??
        s.area ??
        "";
    setChoices(next);
  }, []);
  useEffect(() => {
    let cancelled = false;
    request<{ authenticated: boolean }>("/api/private/session")
      .then(async (s) => {
        if (cancelled) return;
        setAuth(s.authenticated ? "open" : "locked");
        if (s.authenticated) await load();
      })
      .catch((e) => {
        if (!cancelled) {
          clearPrivate();
          setAuth("setup");
          handleError(e);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clearPrivate, handleError, load]);
  useEffect(() => {
    if (auth !== "open") return;
    const timer = setInterval(() => {
      request<{ authenticated: boolean }>("/api/private/session")
        .then((s) => {
          if (!s.authenticated) {
            clearPrivate();
            setAuth("locked");
            setNotice("انتهت الجلسة الخاصة. أُزيل التقرير من العرض.");
          }
        })
        .catch(() => {
          clearPrivate();
          setAuth("locked");
        });
    }, 60000);
    return () => clearInterval(timer);
  }, [auth, clearPrivate]);
  async function perform(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }
  const sources = report?.items.filter((i) => i.kind === "data_source") ?? [];
  const isWaiting = !!report?.retryAt;
  return (
    <div className="discovery-shell">
      <header className="discovery-header">
        <Link className="quiet-button" href="/" prefetch={false}>
          <ArrowRight size={18} />
          العودة إلى مدار
        </Link>
        <div>
          <span className="tag">
            <ShieldCheck size={14} />
            قراءة فقط
          </span>
          <ThemeToggle />
          {auth === "open" && (
            <button
              className="quiet-button"
              disabled={busy}
              onClick={() =>
                perform(async () => {
                  await request("/api/private/logout", {});
                  clearPrivate();
                  setAuth("locked");
                  setPassword("");
                })
              }
            >
              <LogOut size={16} />
              خروج
            </button>
          )}
        </div>
      </header>
      <main className="discovery-main">
        <div className="page-heading">
          <div>
            <span className="eyebrow">ربط واعٍ، دون تغيير بياناتك</span>
            <h1>اكتشاف Notion الخاص</h1>
            <p>
              بيانات وصفية للمراجعة. القرار لك، ومحتوى الصفحات يبقى خارج الجرد.
            </p>
          </div>
          <LockKeyhole size={28} />
        </div>
        <div role="status" className="discovery-status">
          {error && <p className="error-message">{error}</p>}
          {notice && <p>{notice}</p>}
          {busy && <p>جارٍ تنفيذ الطلب بأمان…</p>}
        </div>
        {auth === "checking" && <p>جارٍ التحقق من الجلسة الخاصة…</p>}
        {(auth === "setup" || auth === "locked") && (
          <section className="section auth-panel">
            <span className="space-symbol">
              <KeyRound size={23} />
            </span>
            <h2>
              {auth === "setup" ? "الإعداد الخاص مطلوب" : "مساحة خاصة بك وحدك"}
            </h2>
            <p>
              لا يتصل التطبيق بـ Notion قبل التحقق من تسجيل دخولك. هذه الصفحة لا
              تطلب رمز تكامل Notion.
            </p>
            {auth === "locked" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  perform(async () => {
                    const credential = password;
                    setPassword("");
                    await request("/api/private/login", {
                      password: credential,
                    });
                    setAuth("open");
                    await load();
                  });
                }}
              >
                <label>
                  كلمة المرور الخاصة
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    maxLength={128}
                  />
                </label>
                <button className="button primary" disabled={busy || !password}>
                  دخول خاص
                </button>
              </form>
            )}
            <p className="helper">
              الإعداد: PostgreSQL داخلي، مفتاح تشفير، جلسة خاصة، وتكامل مستقل
              للقراءة فقط. القيم الحساسة تُضاف في إعدادات الخادم دون مشاركتها في
              المحادثة.
            </p>
            <a
              className="quiet-button"
              href="https://github.com/Elhamown/life-os/blob/feature/notion-readonly-discovery/docs/notion-discovery.md"
              target="_blank"
              rel="noreferrer"
            >
              دليل الإعداد الآمن
            </a>
          </section>
        )}
        {auth === "open" && (
          <>
            <section className="section">
              <div className="section-head">
                <div>
                  <h2>نطاق الاكتشاف</h2>
                  <p>API 2026-03-11 · تكامل مستقل · دون ذكاء اصطناعي</p>
                </div>
                <span className="tag">
                  {configured
                    ? "إعداد موجود؛ يحتاج التحقق"
                    : "التكامل غير مُعدّ"}
                </span>
              </div>
              <p className="scope-copy">
                نراجع فقط الصفحات ومصادر البيانات التي يعيدها البحث والمصادر
                المتاحة داخل قواعدها. لا نستعرض مساحة العمل كاملة، ولا نقرأ
                الكتل النصية أو سجلات الجداول. أسماء الصفحات والمخططات قد تكون
                حساسة؛ لا تُرسل إلى المساعد.
              </p>
              <label className="consent">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                <span>
                  راجعت أن التكامل مستقل وصلاحياته «قراءة المحتوى» فقط، وأنني
                  شاركت معه المصادر المقصودة.
                </span>
              </label>
              <div className="actions">
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    !acknowledged ||
                    !configured ||
                    report?.status === "running"
                  }
                  onClick={() =>
                    perform(async () => {
                      const data = await request<{ report: AuditView }>(
                        "/api/notion/start",
                        { acknowledged: true },
                      );
                      setReport(data.report);
                      setSelected({});
                      setApproved(false);
                      setChoices(
                        Object.fromEntries(
                          data.report.suggestions.map((s) => [
                            s.sourceId,
                            s.area ?? "",
                          ]),
                        ),
                      );
                    })
                  }
                >
                  <Database size={16} />
                  {report ? "جرد جديد" : "بدء الجرد للقراءة فقط"}
                </button>
                {report?.status === "running" && (
                  <button
                    className="button"
                    disabled={busy || isWaiting}
                    onClick={() =>
                      perform(async () => {
                        const data = await request<{ report: AuditView }>(
                          "/api/notion/step",
                          { reportId: report.id, revision: report.revision },
                        );
                        setReport(data.report);
                        setSelected({});
                        setApproved(false);
                        setChoices((previous) => ({
                          ...Object.fromEntries(
                            data.report.suggestions.map((s) => [
                              s.sourceId,
                              mappings.find((m) => m.sourceId === s.sourceId)
                                ?.area ??
                                s.area ??
                                "",
                            ]),
                          ),
                          ...previous,
                        }));
                      })
                    }
                  >
                    استئناف الدفعة التالية
                  </button>
                )}
                <button
                  className="quiet-button"
                  disabled={busy}
                  onClick={() => perform(load)}
                >
                  <RefreshCw size={15} />
                  تحديث التقرير
                </button>
              </div>
              {report?.retryAt && (
                <p className="helper">
                  استئناف متاح بعد{" "}
                  {new Date(report.retryAt).toLocaleString("ar")}؛ حدّث التقرير
                  بعد هذا الموعد.
                </p>
              )}
            </section>
            {report && (
              <>
                <section className="section">
                  <div className="section-head">
                    <div>
                      <h2>تقرير الجرد المرئي</h2>
                      <p>
                        آخر تحديث:{" "}
                        {new Date(report.updatedAt).toLocaleString("ar")}
                      </p>
                    </div>
                    <span className="tag">
                      {report.status === "running"
                        ? "قيد الاكتشاف"
                        : report.status === "partial"
                          ? "جرد جزئي"
                          : "اكتملت الدفعات المتاحة"}
                    </span>
                  </div>
                  <div className="audit-summary">
                    {(["page", "database", "data_source"] as const).map(
                      (kind, index) => (
                        <div key={kind}>
                          <strong>
                            {report.items
                              .filter((i) => i.kind === kind)
                              .length.toLocaleString("ar")}
                          </strong>
                          <span>
                            {
                              [
                                "صفحة وصفية",
                                "حاوية قاعدة بيانات",
                                "مصدر بيانات",
                              ][index]
                            }
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                  <p className="scope-copy">{report.scope}</p>
                  {report.warnings.length > 0 && (
                    <details className="audit-warnings">
                      <summary>
                        {report.warnings.length} تنبيهات حول النطاق
                      </summary>
                      <ul>
                        {report.warnings.map((w, i) => (
                          <li key={i}>
                            {warningNames[w.code]}
                            {w.id && <code dir="ltr"> · {w.id}</code>}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="inventory-list">
                    {report.items.map((item) => (
                      <details
                        className="inventory-item"
                        key={`${item.kind}-${item.id}`}
                      >
                        <summary>
                          <span>{item.title || "بلا عنوان"}</span>
                          <span className="tag">
                            {item.kind === "data_source"
                              ? "مصدر بيانات"
                              : item.kind === "database"
                                ? "حاوية"
                                : "صفحة"}
                          </span>
                        </summary>
                        <dl>
                          <dt>المعرّف</dt>
                          <dd>
                            <code dir="ltr">{item.id}</code>
                          </dd>
                          <dt>الحاوية / الأصل</dt>
                          <dd>
                            <code dir="ltr">{item.parentId ?? "غير متاح"}</code>
                          </dd>
                          <dt>الإنشاء</dt>
                          <dd>{item.createdAt ?? "غير متاح"}</dd>
                          <dt>آخر تعديل</dt>
                          <dd>{item.editedAt ?? "غير متاح"}</dd>
                        </dl>
                        {item.schema.length > 0 && (
                          <div className="table-scroll">
                            <table>
                              <caption>
                                المخطط الوصفي؛ لا تُعرض قيم السجلات
                              </caption>
                              <thead>
                                <tr>
                                  <th>الخاصية</th>
                                  <th>المعرّف</th>
                                  <th>النوع</th>
                                  <th>علاقة بمصدر</th>
                                </tr>
                              </thead>
                              <tbody>
                                {item.schema.map((p) => (
                                  <tr key={p.id}>
                                    <td>{p.name}</td>
                                    <td>
                                      <code dir="ltr">{p.id}</code>
                                    </td>
                                    <td>{p.type}</td>
                                    <td>
                                      {p.relation ? (
                                        <>
                                          <code dir="ltr">
                                            {p.relation.dataSourceId ??
                                              "غير متاح"}
                                          </code>
                                          <small>
                                            حاوية:{" "}
                                            {p.relation.databaseId ??
                                              "غير متاحة"}{" "}
                                            · خاصية مقابلة:{" "}
                                            {p.relation.syncedPropertyId ??
                                              "غير متاحة"}
                                          </small>
                                        </>
                                      ) : (
                                        "—"
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </details>
                    ))}
                  </div>
                  {!report.items.length && (
                    <p className="empty">
                      لم تظهر عناصر متاحة حتى الآن. تحقق من مشاركة المصادر
                      وفهرسة البحث، ثم استأنف الدفعات.
                    </p>
                  )}
                </section>
                <section className="section">
                  <div className="section-head">
                    <div>
                      <h2>هياكل قد تكون متشابهة</h2>
                      <p>تشابه وصفي فقط، لا إثبات لتكرار السجلات</p>
                    </div>
                  </div>
                  {report.duplicates.map((group, i) => (
                    <div className="duplicate-group" key={i}>
                      <span className="tag warning">
                        {group.reason === "schema"
                          ? "خصائص متشابهة"
                          : "اسم متشابه"}
                      </span>
                      <ul>
                        {group.ids.map((id) => (
                          <li key={id}>
                            {report.items.find((item) => item.id === id)?.title}{" "}
                            <code dir="ltr">{id}</code>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {!report.duplicates.length && (
                    <p className="empty">
                      لم يُرصد تشابه واضح في المصادر المعروضة. هذا لا يثبت غياب
                      التكرار خارج الجرد.
                    </p>
                  )}
                  <p className="helper">لا ندمج أو ننقل أو نحذف أي سجل.</p>
                </section>
                <section className="section">
                  <div className="section-head">
                    <div>
                      <h2>خريطة المصادر إلى مساحات مدار</h2>
                      <p>
                        الاقتراحات قواعد محلية من اسم المصدر فقط، وليست تحليلًا
                        بالذكاء الاصطناعي.
                      </p>
                    </div>
                  </div>
                  {sources.map((source) => (
                    <div className="mapping-row" key={source.id}>
                      <label className="mapping-select">
                        <input
                          type="checkbox"
                          checked={!!selected[source.id]}
                          onChange={(e) => {
                            setSelected((s) => ({
                              ...s,
                              [source.id]: e.target.checked,
                            }));
                            setApproved(false);
                          }}
                          disabled={report.status === "running"}
                        />
                        <span>
                          <strong>{source.title || "مصدر بلا عنوان"}</strong>
                          <small>
                            {
                              report.suggestions.find(
                                (s) => s.sourceId === source.id,
                              )?.reason
                            }
                          </small>
                        </span>
                      </label>
                      <label>
                        مساحة مدار
                        <select
                          aria-label={`مساحة ${source.title}`}
                          value={choices[source.id] ?? ""}
                          onChange={(e) => {
                            setChoices((c) => ({
                              ...c,
                              [source.id]: e.target.value as SpaceId | "",
                            }));
                            setApproved(false);
                          }}
                        >
                          <option value="">اختر يدويًا</option>
                          {spaces.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <span className="tag">استبعاد من AI</span>
                    </div>
                  ))}
                  {!sources.length && (
                    <p className="empty">
                      لا توجد مصادر بيانات موثّقة لربطها بعد.
                    </p>
                  )}
                  <p className="helper">
                    العمل الوزاري والصحة مستبعدان افتراضيًا من إدخال AI، وجميع
                    مصادر Notion مستبعدة في هذه المرحلة. الحاويات والصفحات لا
                    تُربط بدل مصدر البيانات.
                  </p>
                  <label className="consent">
                    <input
                      type="checkbox"
                      checked={approved}
                      onChange={(e) => setApproved(e.target.checked)}
                      disabled={report.status === "running"}
                    />
                    <span>
                      راجعت المصادر المحددة والمساحات، وأوافق على حفظ الربط في
                      إعدادات مدار الداخلية فقط.
                    </span>
                  </label>
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      !approved ||
                      report.status === "running" ||
                      !sources.some((s) => selected[s.id]) ||
                      sources.some((s) => selected[s.id] && !choices[s.id])
                    }
                    onClick={() =>
                      perform(async () => {
                        const data = await request<{ mappings: Mapping[] }>(
                          "/api/notion/mappings",
                          {
                            reportId: report.id,
                            revision: report.revision,
                            approved: true,
                            mappings: sources
                              .filter((s) => selected[s.id])
                              .map((s) => ({
                                sourceId: s.id,
                                area: choices[s.id],
                              })),
                          },
                        );
                        setMappings(data.mappings);
                        setSelected({});
                        setApproved(false);
                        setNotice(
                          "حُفظ الربط في إعدادات مدار الداخلية فقط. لم يُعدّل أي شيء في Notion.",
                        );
                      })
                    }
                  >
                    <Check size={16} />
                    حفظ الربط المعتمد داخليًا
                  </button>
                </section>
              </>
            )}
            {mappings.length > 0 && (
              <section className="section">
                <h2>الروابط المحفوظة داخليًا</h2>
                {mappings.map((m) => (
                  <div className="saved-mapping" key={m.sourceId}>
                    <code dir="ltr">{m.sourceId}</code>
                    <span>{spaceName(m.area)}</span>
                    <small>
                      {report?.items.some(
                        (i) => i.kind === "data_source" && i.id === m.sourceId,
                      )
                        ? "موثّق في التقرير الحالي"
                        : "غير موثّق في التقرير الحالي؛ لم نحذف الربط السابق"}
                    </small>
                    <span className="tag">AI محظور</span>
                  </div>
                ))}
              </section>
            )}
            <section className="section">
              <div className="section-head">
                <div>
                  <h2>سجل التدقيق الخاص</h2>
                  <p>أحداث وأعداد فقط؛ دون رموز وصول أو عناوين محتوى</p>
                </div>
                <button
                  className="quiet-button"
                  disabled={busy}
                  onClick={() =>
                    perform(async () => {
                      const data = await request<{ entries: AuditEntry[] }>(
                        "/api/notion/audit",
                      );
                      setLogs(data.entries);
                    })
                  }
                >
                  عرض آخر الأحداث
                </button>
              </div>
              {logs.map((log) => (
                <div className="audit-log" key={log.id}>
                  <time>{new Date(log.at).toLocaleString("ar")}</time>
                  <span>
                    {
                      {
                        login: "دخول",
                        logout: "خروج",
                        discovery_start: "بدء الجرد",
                        discovery_step: "دفعة جرد",
                        discovery_read: "عرض التقرير",
                        mappings_save: "حفظ الربط",
                        access_denied: "وصول مرفوض",
                      }[log.event]
                    }
                  </span>
                  <span>
                    {log.outcome === "ok"
                      ? "مقبول"
                      : log.outcome === "denied"
                        ? "مرفوض"
                        : "خطأ"}
                  </span>
                  <span>{log.count}</span>
                </div>
              ))}
              {!logs.length && <p className="helper">اضغط لعرض السجل الخاص.</p>}
            </section>
          </>
        )}
        <footer>
          <span>مدار · اكتشاف للقراءة فقط</span>
          <span>لا تغيير في Notion</span>
        </footer>
      </main>
    </div>
  );
}
