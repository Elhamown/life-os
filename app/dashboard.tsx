"use client";
import { useReducer, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Orbit,
  Plus,
  Search,
  Sparkles,
  Mic,
  Bell,
} from "lucide-react";
import {
  demoDate,
  events,
  initialState,
  number,
  reducer,
  spaceName,
  type SpaceId,
} from "./lib/model";
import { Empty, ProposalCard, Section, TaskRow } from "./components/shared";
import Capture from "./components/capture";
import Spaces from "./components/spaces";
import Assistant from "./components/assistant";
import SiteLogout from "./components/site-logout";
import ThemeToggle from "./components/theme-toggle";
import SearchPanel from "./components/search";
import Calendar from "./components/calendar";
import Settings from "./components/settings";
import {
  WorkspaceNavigation,
  navigation,
  type WorkspaceView,
} from "./components/workspace-navigation";
type Screen = WorkspaceView;
export default function Dashboard({
  initialScreen = "today",
  initialCapture = false,
}: {
  initialScreen?: Screen;
  initialCapture?: boolean;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [notice, setNotice] = useState(false);
  const [quickText, setQuickText] = useState("");
  const [quickKind, setQuickKind] = useState<"task" | "note">("task");
  const [selected, setSelected] = useState<SpaceId | null>(null);
  const [capture, setCapture] = useState(initialCapture);
  const [search, setSearch] = useState(false);
  const today = state.tasks.filter((t) => t.date === demoDate);
  const priorities = today.filter((t) => t.priority).slice(0, 3);
  const overdue = state.tasks.filter((t) => !t.done && t.date < demoDate);
  const pending = state.proposals.filter((p) => p.status === "pending");
  function go(id: Screen) {
    setScreen(id);
    window.history.replaceState(null, "", `/?view=${id}`);
  }
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        انتقل إلى المحتوى
      </a>
      <aside className="sidebar">
        <button
          className="brand"
          onClick={() => go("today")}
          aria-label="مدار، العودة لليوم"
        >
          <span className="brand-mark">
            <Orbit size={24} />
          </span>
          <span>
            مدار<small>MADAR · LIFE OS</small>
          </span>
        </button>
        <p className="sidebar-caption">حياتك، بوضوح.</p>
        <WorkspaceNavigation current={screen} onNavigate={go} />
        <button
          className="button primary capture-sidebar"
          onClick={() => setCapture(true)}
        >
          <Plus size={18} />
          التقاط سريع
        </button>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          {screen === "assistant"
            ? "المساعد خاص · مسودات فقط"
            : "مساحة تجريبية آمنة"}
          <p>
            {screen === "assistant" ? (
              "الاتصال الخارجي يتطلب إعداد المزوّد وموافقتك."
            ) : (
              <>
                بيانات توضيحية فقط.
                <br />
                غير متصل بـ Notion.
              </>
            )}
          </p>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <span>مساحتي</span>
            <span>/</span>
            <strong>{navigation.find((n) => n.id === screen)?.label}</strong>
          </div>
          <div className="header-actions">
            <span className="demo-indicator">
              {screen === "assistant" ? "مساعد خاص · مسودات" : "وضع تجريبي"}
            </span>
            <button
              className="icon-button"
              aria-label="فتح البحث"
              aria-expanded={search}
              onClick={() => setSearch(!search)}
            >
              <Search size={19} />
            </button>
            <button
              className="icon-button"
              aria-label="فتح الالتقاط الصوتي"
              onClick={() => go("assistant")}
            >
              <Mic size={19} />
            </button>
            <button
              className="icon-button"
              aria-label="عرض التنبيهات"
              aria-expanded={notice}
              onClick={() => setNotice(!notice)}
            >
              <Bell size={19} />
            </button>
            <span className="owner-avatar" aria-label="حساب المالك: إلهام">
              إ
            </span>
            <ThemeToggle />
            <SiteLogout />
            <button
              className="button capture-top"
              onClick={() => setCapture(true)}
            >
              <Plus size={17} />
              التقاط سريع
            </button>
          </div>
        </header>
        <main id="main">
          {notice && (
            <div className="notification-panel" role="status">
              <strong>ما يحتاج انتباهك</strong>
              <p>
                {number(overdue.length)} مهام متأخرة · {number(pending.length)}{" "}
                اقتراحات للمراجعة · بيانات تجريبية
              </p>
              <button
                className="quiet-button"
                onClick={() => {
                  go("today");
                  setNotice(false);
                }}
              >
                افتح اليوم
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {screen === "today"
                  ? "الأحد، ١١ أكتوبر · يوم تجريبي"
                  : screen === "spaces"
                    ? "العمل / التعلّم / الحياة الشخصية"
                    : screen === "calendar"
                      ? "أسبوع واضح، مساحة للتوازن"
                      : screen === "settings"
                        ? "مساحتك، على طريقتك"
                        : "فكّر بحرية، وقرّر بوضوح"}
              </span>
              <h1>
                {screen === "today"
                  ? "صباح الخير، إلهام"
                  : screen === "spaces"
                    ? "مساحة لكل ما يهمك."
                    : screen === "calendar"
                      ? "وقتك، في مكان واحد."
                      : screen === "settings"
                        ? "إعدادات مدار."
                        : "مساعدك في مدار."}
              </h1>
              <p>
                {screen === "today"
                  ? "ثلاث أولويات. مساحة للتقدّم، ومساحة للحياة."
                  : screen === "spaces"
                    ? "ثماني مساحات مترابطة، دون تكرار أو تشتّت."
                    : screen === "calendar"
                      ? "مواعيد ومهام مسجلة، دون التزامات مختلقة."
                      : screen === "settings"
                        ? "حساب واحد. تجربة بسيطة. خصوصية واضحة."
                        : "اقتراحات للمراجعة، لا قرارات بالنيابة عنك."}
              </p>
            </div>
            {screen === "today" && (
              <div className="daily-progress">
                <span>
                  {number(today.filter((t) => t.done).length)}
                  <small> / {number(today.length)}</small>
                </span>
                <div>
                  <strong>خطوات مكتملة</strong>
                  <progress
                    aria-label="تقدم مهام اليوم"
                    value={today.filter((t) => t.done).length}
                    max={today.length || 1}
                  />
                </div>
              </div>
            )}
          </div>
          {search && (
            <SearchPanel
              state={state}
              onClose={() => setSearch(false)}
              onSelect={(id) => {
                setSelected(id);
                setScreen("spaces");
                setSearch(false);
              }}
            />
          )}
          {screen === "today" && (
            <>
              <div className="hero-actions">
                <button
                  className="button primary"
                  onClick={() => setCapture(true)}
                >
                  <Plus size={17} />
                  أضف مهمة
                </button>
                <button className="button" onClick={() => go("assistant")}>
                  <Mic size={17} />
                  سجل صوت
                </button>
                <button className="button" onClick={() => go("assistant")}>
                  <Sparkles size={17} />
                  خطط يومي
                </button>
                <button
                  className="quiet-button"
                  onClick={() => go("assistant")}
                >
                  افتح المساعد <ArrowLeft size={16} />
                </button>
              </div>
              <div className="metric-grid" aria-label="ملخص اليوم التجريبي">
                {[
                  {
                    label: "مهام اليوم",
                    value: today.filter((t) => !t.done).length,
                  },
                  { label: "المواعيد", value: events.length },
                  { label: "موافقات معلّقة", value: pending.length },
                  {
                    label: "مهام الدراسة",
                    value: today.filter(
                      (t) => t.spaceId === "studies" && !t.done,
                    ).length,
                  },
                  {
                    label: "مهام العادات",
                    value: today.filter(
                      (t) => t.spaceId === "health" && !t.done,
                    ).length,
                  },
                ].map((m) => (
                  <div className="metric" key={m.label}>
                    <small>{m.label}</small>
                    <strong>{number(m.value)}</strong>
                    <span>من البيانات التجريبية</span>
                  </div>
                ))}
              </div>
              <div className="planning-hint">
                <Sparkles size={19} />
                <p>
                  <strong>مساحة للتركيز</strong> · ابدأ بأولوية واحدة، ثم راجع
                  موعدك القادم. إرشاد محلي توضيحي، وليس نتيجة ذكاء اصطناعي.
                </p>
              </div>
              <div className="today-layout">
                <div>
                  <Section
                    title="ما يهمّ اليوم"
                    caption="أولوياتك الثلاث"
                    action={
                      <span className="tag">
                        {number(priorities.length)} أولويات
                      </span>
                    }
                  >
                    {priorities.map((t) => (
                      <TaskRow key={t.id} task={t} dispatch={dispatch} />
                    ))}
                  </Section>
                  <Section
                    title="يحتاج انتباهك"
                    caption="مهام تجاوزت موعدها"
                    action={
                      <span className="tag warning">
                        {number(overdue.length)} متأخرة
                      </span>
                    }
                  >
                    {overdue.map((t) => (
                      <TaskRow
                        key={t.id}
                        task={t}
                        overdue
                        dispatch={dispatch}
                      />
                    ))}
                    {!overdue.length && (
                      <Empty>كل شيء تحت السيطرة. لا توجد مهام متأخرة.</Empty>
                    )}
                  </Section>
                  <Section
                    title="خطوات أخرى"
                    action={
                      <button
                        className="quiet-button"
                        onClick={() => setCapture(true)}
                      >
                        <Plus size={16} />
                        إضافة
                      </button>
                    }
                  >
                    {today
                      .filter((t) => !t.priority)
                      .map((t) => (
                        <TaskRow key={t.id} task={t} dispatch={dispatch} />
                      ))}
                    {!today.some((t) => !t.priority) && (
                      <Empty>يومك واضح؛ أضف ما تحتاجه فقط.</Empty>
                    )}
                  </Section>
                </div>
                <div>
                  <Section
                    title="على جدولك"
                    caption="مواعيد اليوم التجريبية"
                    action={<CalendarDays size={19} />}
                  >
                    {events.map((e) => (
                      <div className="appointment" key={e.id}>
                        <time>{e.time}</time>
                        <div>
                          <strong>{e.title}</strong>
                          <small>
                            {spaceName(e.spaceId)} · {e.duration}
                          </small>
                        </div>
                      </div>
                    ))}
                  </Section>
                  <Section
                    title="اقتراح ينتظر قرارك"
                    action={<Sparkles size={19} />}
                  >
                    {pending[0] ? (
                      <ProposalCard proposal={pending[0]} dispatch={dispatch} />
                    ) : (
                      <Empty>راجعت كل الاقتراحات. يومك ملكك.</Empty>
                    )}
                    <button
                      className="quiet-button section-link"
                      onClick={() => go("assistant")}
                    >
                      المساعد والاقتراحات{" "}
                      {pending.length > 1 ? `(${number(pending.length)})` : ""}
                      <ArrowLeft size={15} />
                    </button>
                  </Section>
                  <Section
                    title="التقاط سريع"
                    caption="الفكرة الآن، التنظيم بعد قليل"
                  >
                    <form
                      className="quick-capture-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!quickText.trim()) return;
                        dispatch({
                          type: "capture",
                          id: crypto.randomUUID(),
                          title: quickText,
                          kind: quickKind,
                          spaceId: "life",
                        });
                        setQuickText("");
                      }}
                    >
                      <label htmlFor="quick-text">ما الذي يدور في بالك؟</label>
                      <textarea
                        id="quick-text"
                        value={quickText}
                        maxLength={1000}
                        required
                        onChange={(e) => setQuickText(e.target.value)}
                        placeholder="مهمة، فكرة، شيء لا تريد نسيانه…"
                      />
                      <div className="quick-chips">
                        <button
                          type="button"
                          aria-pressed={quickKind === "task"}
                          onClick={() => setQuickKind("task")}
                        >
                          مهمة
                        </button>
                        <button
                          type="button"
                          aria-pressed={quickKind === "note"}
                          onClick={() => setQuickKind("note")}
                        >
                          ملاحظة
                        </button>
                        <small>الحياة الشخصية · مؤقت</small>
                      </div>
                      <div className="settings-line">
                        <button className="button primary" type="submit">
                          أضف إلى الديمو
                        </button>
                        <button
                          type="button"
                          className="icon-button"
                          aria-label="التقاط صوت عبر المساعد"
                          onClick={() => go("assistant")}
                        >
                          <Mic size={19} />
                        </button>
                      </div>
                    </form>
                  </Section>
                </div>
              </div>
              {state.notes.length > 0 && (
                <Section
                  title="أفكار التقطتها"
                  caption="يمكن تحويل أي ملاحظة إلى مهمة"
                >
                  {state.notes.map((n) => (
                    <div className="note-row" key={n.id}>
                      <div>
                        <p>{n.title}</p>
                        <small>{spaceName(n.spaceId)}</small>
                      </div>
                      <button
                        className="quiet-button"
                        onClick={() => dispatch({ type: "convert", id: n.id })}
                      >
                        تحويل إلى مهمة <ArrowLeft size={14} />
                      </button>
                    </div>
                  ))}
                </Section>
              )}
            </>
          )}
          <div hidden={screen !== "spaces"}>
            <Spaces
              state={state}
              dispatch={dispatch}
              selected={selected}
              onSelect={setSelected}
              onCapture={() => setCapture(true)}
            />
          </div>
          {screen === "calendar" && (
            <Calendar state={state} onCapture={() => setCapture(true)} />
          )}
          {screen === "settings" && <Settings />}
          <div hidden={screen !== "assistant"}>
            <Assistant
              state={state}
              dispatch={dispatch}
              active={screen === "assistant"}
            />
          </div>
          <footer>
            <span>مدار · مساحة لحياة أكثر وضوحًا</span>
            <span>
              {screen === "assistant"
                ? "مسودات المساعد محفوظة بشكل خاص"
                : "تعديلات الديمو محلية ومؤقتة"}
            </span>
          </footer>
        </main>
      </div>
      <WorkspaceNavigation current={screen} onNavigate={go} mobile />
      <button
        className="mobile-capture icon-button"
        aria-label="التقاط سريع"
        onClick={() => setCapture(true)}
      >
        <Plus size={23} />
      </button>
      {capture && (
        <Capture
          dispatch={dispatch}
          defaultSpace={screen === "spaces" && selected ? selected : "life"}
          onClose={() => setCapture(false)}
        />
      )}
    </div>
  );
}
