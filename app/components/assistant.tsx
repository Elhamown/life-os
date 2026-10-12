"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Send, Sparkles } from "lucide-react";
import { type Action, type State, spaceName } from "../lib/model";
import { ProposalCard } from "./shared";
import {
  aiAreas,
  type AiArea,
  type AiFields,
  type AiProposal,
  type AuthorizedItem,
} from "../lib/ai/model";
import { AiProposalCard, kindNames } from "./ai-proposal";
import { useArabicVoice } from "./use-arabic-voice";
type Status = {
  configured: boolean;
  provider: string | null;
  model: string;
  transcriptionModel: string;
  context: AuthorizedItem[];
  proposals: AiProposal[];
};
const errors: Record<string, string> = {
  AUTH_REQUIRED: "انتهت الجلسة. سجّل الدخول مجددًا.",
  PRIVATE_SETUP_REQUIRED: "الإعداد الخاص غير مكتمل. راجع دليل إعداد المساعد.",
  AI_SETUP_REQUIRED: "مزوّد AI غير مفعّل. راجع إعدادات الخادم.",
  AI_CONTEXT_REQUIRED: "أضف مهامًا أو مواعيد حقيقية مؤكدة للتخطيط أولًا.",
  AI_INVALID_DATA:
    "تحقق من الحقول. الموعد وجلسة الدراسة يحتاجان تاريخًا ووقتًا ومدة.",
  AI_PROVIDER_INVALID: "لم يُرجع المزوّد مقترحات صالحة وآمنة. لم يُنفّذ شيء.",
  AI_RATE_LIMITED: "وصلت إلى حد الطلبات. انتظر عشر دقائق.",
  AI_PROVIDER_RATE_LIMITED: "وصل المزوّد إلى حد الطلبات. حاول بعد دقيقة.",
  AI_ALREADY_DECIDED: "سبق اتخاذ قرار لهذا المقترح؛ حدّث الصفحة.",
  AI_BOUNDARY_DENIED:
    "كل مساحة مستقلة. اختر المساحة المطلوبة وأنشئ مسودة جديدة فيها.",
  AI_DRAFT_LIMIT: "وصلت المسودات إلى الحد المسموح (٢٠٠).",
  WORKFLOW_BUSY: "هناك عملية أخرى جارية. حاول بعد قليل.",
};
export default function Assistant({
  state,
  dispatch,
  active,
}: {
  state: State;
  dispatch: (a: Action) => void;
  active: boolean;
}) {
  const epoch = useRef(0);
  const [input, setInput] = useState("");
  const [password, setPassword] = useState("");
  const [auth, setAuth] = useState(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [consent, setConsent] = useState(false);
  const [area, setArea] = useState<AiArea>("life");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState<
    { text: string; role: "user" | "assistant" }[]
  >([]);
  const [plan, setPlan] = useState<AuthorizedItem[]>([]);
  const [items, setItems] = useState<AuthorizedItem[]>([]);
  const [contextConsent, setContextConsent] = useState(false);
  const [itemTitle, setItemTitle] = useState("");
  const [itemDate, setItemDate] = useState("");
  const [itemTime, setItemTime] = useState("");
  const [itemDuration, setItemDuration] = useState(30);
  const [itemKind, setItemKind] = useState<"task" | "event">("task");
  async function request(path: string, body?: unknown, signal?: AbortSignal) {
    const version = epoch.current;
    const res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal,
    });
    const data = await res.json();
    if (version !== epoch.current)
      throw new Error("انتهت الجلسة؛ تجاهلنا النتيجة المتأخرة.");
    if (!res.ok) {
      if (
        res.status === 401 ||
        (res.status === 503 && data.error === "PRIVATE_SETUP_REQUIRED")
      ) {
        epoch.current++;
        setAuth(false);
        setStatus(null);
        setMessages([]);
        setPlan([]);
        setItems([]);
        setInput("");
        setItemTitle("");
        setItemDate("");
        setItemTime("");
        setConsent(false);
        setContextConsent(false);
        voice.cancel();
      }
      throw new Error(
        errors[data.error] ??
          "تعذّر إكمال الطلب. حاول مجددًا؛ لم يُنفّذ إجراء خارجي.",
      );
    }
    return data;
  }
  const voice = useArabicVoice(async (blob, signal) => {
    const form = new FormData();
    form.set("audio", blob, "capture");
    const res = await fetch("/api/ai/transcribe", {
      method: "POST",
      headers: { "X-Madar-Consent": "1", "X-Madar-Area": area },
      body: form,
      signal,
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) throw Error();
    return data.transcript;
  });
  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    async function load(initial = false) {
      try {
        const s = await fetch("/api/private/session", {
          cache: "no-store",
          signal: controller.signal,
        });
        const session = await s.json();
        if (!live) return;
        setReady(s.ok);
        setAuth(!!session.authenticated);
        if (session.authenticated && initial) {
          const r = await fetch(`/api/ai/status?spaceId=${area}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!r.ok) throw Error();
          const data = await r.json();
          if (live) {
            setStatus(data);
            setItems(data.context);
          }
        } else if (!session.authenticated) {
          epoch.current++;
          setStatus(null);
          setItems([]);
          setPlan([]);
          setMessages([]);
          setInput("");
          setItemTitle("");
          setItemDate("");
          setItemTime("");
          setConsent(false);
          setContextConsent(false);
        }
      } catch {
        if (live) {
          epoch.current++;
          setAuth(false);
          setStatus(null);
          setItems([]);
          setPlan([]);
          setMessages([]);
          setInput("");
          setItemTitle("");
          setItemDate("");
          setItemTime("");
          setConsent(false);
          setContextConsent(false);
        }
      }
    }
    void load(true);
    const timer = setInterval(() => void load(), 60000);
    return () => {
      live = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [area]);
  useEffect(() => {
    if (!auth || !active) voice.cancel(); // stop capture when session becomes unavailable
    // The cleanup operation intentionally depends only on authentication and navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, active]);
  async function login() {
    setBusy(true);
    setError("");
    try {
      await request("/api/private/login", { password });
      setPassword("");
      const s = await request(`/api/ai/status?spaceId=${area}`);
      setStatus(s);
      setItems(s.context);
      setAuth(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      setPassword("");
    }
  }
  async function send(planning = false) {
    if (!input.trim() && !planning) return;
    setBusy(true);
    setError("");
    try {
      const message = planning
        ? "رتّب أولويات اليوم من السياق المؤكد فقط"
        : input;
      const result = await request("/api/ai/propose", {
        message,
        spaceId: area,
        consent,
        planning,
        today: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`,
      });
      setMessages((m) => [
        ...m,
        { text: message, role: "user" },
        { text: result.message, role: "assistant" },
      ]);
      setPlan(result.plan);
      setStatus((s) =>
        s ? { ...s, proposals: [...s.proposals, ...result.proposals] } : s,
      );
      setInput("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function decide(
    p: AiProposal,
    f: AiFields,
    decision: "approved" | "rejected",
  ) {
    setBusy(true);
    setError("");
    try {
      const result = await request("/api/ai/decision", {
        id: p.id,
        spaceId: area,
        fields: f,
        decision,
        confirmed: true,
      });
      setStatus((s) =>
        s
          ? {
              ...s,
              proposals: s.proposals.map((old) =>
                old.id === p.id ? result.proposal : old,
              ),
            }
          : s,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const contextDirty =
    JSON.stringify(items) !== JSON.stringify(status?.context ?? []);
  const enabled =
    auth &&
    !!status?.configured &&
    consent &&
    !busy &&
    voice.status === "idle" &&
    !contextDirty;
  return (
    <div className="assistant-layout">
      <section className="conversation">
        <div className="assistant-intro">
          <span className="space-symbol">
            <Sparkles size={24} />
          </span>
          <h2>أفكارك، بخطوة أوضح.</h2>
          <p>مساعد عربي · القرار يبقى لك</p>
          <span className="tag">مسودات فقط · لا كتابة إلى Notion</span>
        </div>
        <p className="helper">
          النص والصوت يُرسلان إلى مزوّد خارجي بعد موافقتك، وقد تترتب رسوم AI
          وتفريغ صوتي واستضافة. لا تُدخل تفاصيل الوزارة أو الصحة؛ هذان المجالان
          مستبعدان. لا تُرسل بيانات الديمو تلقائيًا.
        </p>
        {!auth ? (
          <section className="ai-access">
            <h3>دخول خاص للمساعد</h3>
            {ready ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void login();
                }}
              >
                <label>
                  كلمة مرور المالك
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </label>
                <button className="button primary" disabled={busy}>
                  دخول خاص
                </button>
              </form>
            ) : (
              <p>
                الإعداد الخاص غير متاح.{" "}
                <a href="https://github.com/Elhamown/life-os/blob/feature/arabic-ai-assistant/docs/ai-assistant.md">
                  دليل إعداد المساعد
                </a>
              </p>
            )}
          </section>
        ) : (
          <>
            <div className="section-head">
              <span className="tag">
                {status?.configured
                  ? `المزوّد: ${status.provider}`
                  : "AI غير مفعّل على الخادم"}
              </span>
              <button
                className="quiet-button"
                disabled={busy}
                onClick={() => {
                  voice.cancel();
                  void request("/api/private/logout", {})
                    .then(() => {
                      epoch.current++;
                      setAuth(false);
                      setStatus(null);
                      setMessages([]);
                      setItems([]);
                      setPlan([]);
                      setInput("");
                      setItemTitle("");
                      setItemDate("");
                      setItemTime("");
                      setConsent(false);
                      setContextConsent(false);
                    })
                    .catch((e) => setError(e.message));
                }}
              >
                خروج
              </button>
            </div>
            <label>
              مجال الرسالة
              <select
                value={area}
                disabled={voice.status !== "idle" || busy}
                onChange={(e) => {
                  epoch.current++;
                  voice.cancel();
                  setArea(e.target.value as AiArea);
                  setStatus(null);
                  setItems([]);
                  setPlan([]);
                  setMessages([]);
                  setInput("");
                  setItemTitle("");
                  setItemDate("");
                  setItemTime("");
                  setConsent(false);
                  setContextConsent(false);
                }}
              >
                {aiAreas.map((id) => (
                  <option key={id} value={id}>
                    {spaceName(id)}
                  </option>
                ))}
              </select>
            </label>
            <p className="helper">
              سياق ومسودات هذه المساحة فقط. تغيير المساحة يبدأ طلبًا مستقلًا.
            </p>
            <label className="ai-consent">
              <input
                type="checkbox"
                checked={consent}
                disabled={voice.status !== "idle" || busy}
                onChange={(e) => setConsent(e.target.checked)}
              />{" "}
              أوافق على إرسال النص والسياق المؤكد، والصوت عند التسجيل، إلى
              المزوّد. المحتوى خالٍ من تفاصيل الوزارة والصحة.
            </label>
            <button
              className="button"
              disabled={!enabled || !items.length}
              onClick={() => void send(true)}
            >
              رتّب أولويات اليوم
            </button>
            {contextDirty && (
              <p className="helper" role="status">
                احفظ تغييرات السياق قبل إرسال رسالة أو تسجيل صوت، كي لا يُستخدم
                سياق قديم.
              </p>
            )}
            <details className="ai-context">
              <summary>سياق التخطيط المؤكد · {items.length} سجل</summary>
              <p className="helper">
                أدخل مهامًا ومواعيد فعلية مخوّلًا بمشاركتها. لا يوجد اتصال حي
                بتقويمك أو مهام Notion. سيُرسل هذا السياق مع الرسائل التالية بعد
                الموافقة.
              </p>
              <ul>
                {items.map((i) => (
                  <li key={i.id}>
                    {kindNames[i.kind]}: {i.title} · {i.date} {i.time ?? ""} ·{" "}
                    {spaceName(i.spaceId)}{" "}
                    <button
                      className="quiet-button"
                      onClick={() =>
                        setItems(items.filter((old) => old.id !== i.id))
                      }
                    >
                      إزالة من السياق
                    </button>
                  </li>
                ))}
              </ul>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (items.length >= 50) return;
                  setItems([
                    ...items,
                    {
                      id: crypto.randomUUID(),
                      kind: itemKind,
                      spaceId: area,
                      title: itemTitle.trim(),
                      date: itemDate,
                      time: itemKind === "event" ? itemTime : null,
                      durationMinutes:
                        itemKind === "event" ? itemDuration : null,
                    },
                  ]);
                  setItemTitle("");
                  setContextConsent(false);
                }}
              >
                <label>
                  نوع السياق
                  <select
                    value={itemKind}
                    onChange={(e) =>
                      setItemKind(e.target.value as "task" | "event")
                    }
                  >
                    <option value="task">مهمة</option>
                    <option value="event">موعد</option>
                  </select>
                </label>
                <label>
                  عنوان السجل المؤكد
                  <input
                    value={itemTitle}
                    onChange={(e) => setItemTitle(e.target.value)}
                    maxLength={200}
                    required
                  />
                </label>
                <label>
                  تاريخ السجل المؤكد
                  <input
                    type="date"
                    value={itemDate}
                    onChange={(e) => setItemDate(e.target.value)}
                    required
                  />
                </label>
                {itemKind === "event" && (
                  <>
                    <label>
                      وقت السجل المؤكد
                      <input
                        type="time"
                        value={itemTime}
                        onChange={(e) => setItemTime(e.target.value)}
                        required
                      />
                    </label>
                    <label>
                      مدة الموعد المؤكد بالدقائق
                      <input
                        type="number"
                        min={5}
                        max={480}
                        value={itemDuration}
                        onChange={(e) =>
                          setItemDuration(Number(e.target.value))
                        }
                        required
                      />
                    </label>
                  </>
                )}
                <p className="helper">الوجهة: {spaceName(area)}</p>
                <button
                  className="button"
                  disabled={busy || items.length >= 50}
                >
                  أضف للسياق المراد حفظه
                </button>
              </form>
              <label className="ai-consent">
                <input
                  type="checkbox"
                  checked={contextConsent}
                  onChange={(e) => setContextConsent(e.target.checked)}
                />{" "}
                هذه سجلات حقيقية، وأوافق على حفظها مشفّرة واستخدامها كسياق
                خارجي.
              </label>
              <button
                className="button"
                disabled={busy || !contextConsent}
                onClick={() => {
                  setBusy(true);
                  setError("");
                  void request("/api/ai/context", {
                    spaceId: area,
                    items,
                    consent: contextConsent,
                    confirmedActual: true,
                  })
                    .then((r) => {
                      setItems(r.context);
                      setStatus((s) => (s ? { ...s, context: r.context } : s));
                      setContextConsent(false);
                      setMessages((m) => [
                        ...m,
                        {
                          text: "حُفظ سياق التخطيط الداخلي. لم يُعدّل أي مصدر خارجي.",
                          role: "assistant",
                        },
                      ]);
                    })
                    .catch((e) => setError(e.message))
                    .finally(() => setBusy(false));
                }}
              >
                حفظ السياق المؤكد
              </button>
              <p className="helper">
                الإزالة هنا تخص السياق فقط، وتُحفظ بهذا الزر؛ لا تحذف مهمة أو
                موعدًا من مصدره.
              </p>
            </details>
          </>
        )}
        <div className="messages" aria-live="polite">
          {messages.map((m, i) => (
            <article key={i} className={`message ${m.role}`}>
              <small>{m.role === "user" ? "أنت" : "مدار"}</small>
              <p>{m.text}</p>
            </article>
          ))}
        </div>
        {!!plan.length && (
          <section>
            <h3>خطة مقترحة من سجلات مؤكدة</h3>
            <ol>
              {plan.map((i) => (
                <li key={i.id}>
                  {i.title} · {i.date} {i.time ?? ""} · {spaceName(i.spaceId)}
                </li>
              ))}
            </ol>
          </section>
        )}
        {error && <p role="alert">{error}</p>}
        {voice.error && <p role="alert">{voice.error}</p>}
        {voice.status !== "idle" && (
          <div className="voice-state" role="status">
            {voice.status === "recording"
              ? "● جارٍ التسجيل · الحد الأقصى دقيقة"
              : voice.status === "permission"
                ? "بانتظار إذن الميكروفون"
                : "جارٍ تفريغ الصوت إلى نص"}
            {voice.status === "recording" && (
              <button className="button" onClick={voice.stop}>
                إيقاف وتفريغ
              </button>
            )}
            <button className="quiet-button" onClick={voice.cancel}>
              إلغاء التسجيل
            </button>
          </div>
        )}
        {voice.transcript && (
          <section className="transcript">
            <label>
              راجع النص الصوتي قبل الإرسال
              <textarea
                maxLength={4000}
                value={voice.transcript}
                onChange={(e) => voice.setTranscript(e.target.value)}
              />
            </label>
            <button
              className="button"
              onClick={() => {
                setInput(voice.transcript);
                voice.setTranscript("");
              }}
            >
              استخدم النص المحرر في الرسالة
            </button>
            <button className="quiet-button" onClick={voice.cancel}>
              تجاهل النص
            </button>
            <p className="helper">
              لم يُرسل النص إلى المساعد بعد. الصوت أُرسل إلى خدمة التفريغ فقط.
            </p>
          </section>
        )}
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <textarea
            aria-label="رسالتك للمساعد"
            placeholder={`مثال: أنشئ ملاحظة في ${spaceName(area)} بعنوان أفكاري`}
            maxLength={4000}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <div>
            <button
              type="button"
              className="quiet-button"
              disabled={!enabled}
              onClick={() => void voice.start()}
            >
              <Mic size={18} />
              تسجيل صوت عربي
            </button>
            <button
              className="icon-button send-button"
              type="submit"
              disabled={!enabled || !input.trim()}
              aria-label="إرسال الرسالة"
            >
              <Send size={18} />
            </button>
          </div>
        </form>
        <p className="helper">
          اعتماد المقترح يحفظ مسودة داخل MADAR فقط. لا ينشئ مهمة في لوحة الديمو
          أو تقويمًا أو سجل Notion.
        </p>
      </section>
      <section className="proposal-column">
        <div className="section-head">
          <div>
            <h2>مقترحات للمراجعة</h2>
            <p>النوع والوجهة والحقول قبل الاعتماد</p>
          </div>
        </div>
        {status?.proposals.map((p) => (
          <AiProposalCard
            key={p.id}
            proposal={p}
            disabled={busy}
            onDecide={decide}
          />
        ))}
        <details>
          <summary>اقتراحات الديمو المحلية السابقة</summary>
          {state.proposals.map((p) => (
            <ProposalCard key={p.id} proposal={p} dispatch={dispatch} />
          ))}
        </details>
      </section>
    </div>
  );
}
