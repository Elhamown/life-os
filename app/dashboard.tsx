"use client";
import { useEffect, useReducer, useState } from "react";
import { readWorkspace, saveWorkspace } from "./lib/workspace-storage";
import {
  ArrowLeft,
  CalendarDays,
  Layers,
  Orbit,
  Plus,
  Search,
  Sparkles,
  Sun,
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
type Screen = "today" | "spaces" | "assistant";
const navigation = [
  { id: "today", label: "اليوم", icon: Sun },
  { id: "spaces", label: "المساحات", icon: Layers },
  { id: "assistant", label: "المساعد", icon: Sparkles },
] as const;
export default function Dashboard() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    dispatch({ type: "hydrate", state: readWorkspace() });
    setWorkspaceReady(true);
  }, []);
  useEffect(() => {
    if (workspaceReady) setStorageError(!saveWorkspace(state));
  }, [state, workspaceReady]);
  const [screen, setScreen] = useState<Screen>("today");
  const [selected, setSelected] = useState<SpaceId | null>(null);
  const [capture, setCapture] = useState(false);
  const [search, setSearch] = useState(false);
  const today = state.tasks.filter((t) => t.date === demoDate);
  const priorities = today.filter((t) => t.priority).slice(0, 3);
  const overdue = state.tasks.filter((t) => !t.done && t.date < demoDate);
  const pending = state.proposals.filter((p) => p.status === "pending");
  function go(id: Screen) {
    setScreen(id);
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
        <nav aria-label="التنقل الرئيسي">
          {navigation.map((n) => (
            <button
              key={n.id}
              aria-current={screen === n.id ? "page" : undefined}
              className={`nav-link ${screen === n.id ? "active" : ""}`}
              onClick={() => go(n.id)}
            >
              <n.icon size={20} />
              {n.label}
              {n.id === "assistant" && <span className="nav-demo">خاص</span>}
            </button>
          ))}
        </nav>
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
          {storageError && <p role="alert">تعذّر حفظ التغييرات على هذا الجهاز. يرجى التحقق من مساحة تخزين المتصفح.</p>}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {screen === "today"
                  ? "الأحد، ١١ أكتوبر · يوم تجريبي"
                  : screen === "spaces"
                    ? "العمل / التعلّم / الحياة الشخصية"
                    : "فكّر بحرية، وقرّر بوضوح"}
              </span>
              <h1>
                {screen === "today"
                  ? "اليوم، على مهل."
                  : screen === "spaces"
                    ? "مساحة لكل ما يهمك."
                    : "مساعدك في مدار."}
              </h1>
              <p>
                {screen === "today"
                  ? "ثلاث أولويات. مساحة للتقدّم، ومساحة للحياة."
                  : screen === "spaces"
                    ? "ثماني مساحات مترابطة، دون تكرار أو تشتّت."
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
                  <div className="capture-inline">
                    <Plus size={21} />
                    <div>
                      <strong>اترك الفكرة هنا.</strong>
                      <p>مهمة أو ملاحظة، في مكانها المناسب.</p>
                    </div>
                    <button
                      className="icon-button"
                      aria-label="فتح الالتقاط السريع"
                      onClick={() => setCapture(true)}
                    >
                      <ArrowLeft size={18} />
                    </button>
                  </div>
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
      <nav className="mobile-nav" aria-label="التنقل على الجوال">
        {navigation.map((n) => (
          <button
            key={n.id}
            className={screen === n.id ? "active" : ""}
            aria-current={screen === n.id ? "page" : undefined}
            onClick={() => go(n.id)}
          >
            <n.icon size={21} />
            <span>{n.label}</span>
          </button>
        ))}
      </nav>
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
