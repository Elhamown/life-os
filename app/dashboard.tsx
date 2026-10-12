"use client";
import { useState } from "react";
import { useWorkspace } from "./components/use-workspace";
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
import { todayDate, number, spaceName, type SpaceId } from "./lib/model";
import { Empty, ProposalCard, Section, TaskRow } from "./components/shared";
import Capture from "./components/capture";
import Spaces from "./components/spaces";
import Assistant from "./components/assistant";
import SiteLogout from "./components/site-logout";
import ThemeToggle from "./components/theme-toggle";
import SearchPanel from "./components/search";
import WorkspaceManager from "./components/workspace-manager";
import WorkspaceRecovery from "./components/workspace-recovery";
import Growth from "./components/growth";
import NotionReadPanel from "./components/notion-read-panel";
type Screen =
  | "today"
  | "spaces"
  | "assistant"
  | "tasks"
  | "projects"
  | "notes"
  | "calendar"
  | "settings"
  | "growth";
const navigation = [
  { id: "today", label: "اليوم", icon: Sun },
  { id: "tasks", label: "المهام", icon: Layers },
  { id: "projects", label: "المشاريع", icon: Orbit },
  { id: "calendar", label: "التقويم", icon: CalendarDays },
  { id: "notes", label: "الملاحظات", icon: Plus },
  { id: "growth", label: "العادات والأهداف", icon: Sun },
  { id: "settings", label: "الإعدادات", icon: Sun },
  { id: "spaces", label: "المساحات", icon: Layers },
  { id: "assistant", label: "المساعد", icon: Sparkles },
] as const;
export default function Dashboard() {
  const { state, dispatch, status, retry, exportUnsaved, ready } =
    useWorkspace();
  const events = state.events ?? [];
  const [screen, setScreen] = useState<Screen>("today");
  const [selected, setSelected] = useState<SpaceId | null>(null);
  const [capture, setCapture] = useState(false);
  const [search, setSearch] = useState(false);
  const demoDate = todayDate();
  const today = state.tasks.filter((t) => t.date === demoDate);
  const priorities = today.filter((t) => t.priority).slice(0, 3);
  const overdue = state.tasks.filter((t) => !t.done && t.date < demoDate);
  const weekStart = new Date(demoDate + "T12:00:00Z");
  weekStart.setUTCDate(
    weekStart.getUTCDate() -
      ((weekStart.getUTCDay() -
        (state.preferences?.weekStarts === "monday" ? 1 : 6) +
        7) %
        7),
  );
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const weekly = state.tasks.filter(
    (t) =>
      t.date >= weekStart.toISOString().slice(0, 10) &&
      t.date < weekEnd.toISOString().slice(0, 10),
  );
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
            : "مساحة عمل خاصة"}
          <p>
            {screen === "assistant" ? (
              "الاتصال الخارجي يتطلب إعداد المزوّد وموافقتك."
            ) : (
              <>
                بياناتك محفوظة بشكل خاص.
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
              {screen === "assistant" ? "مساعد خاص · مسودات" : "مساحة خاصة"}
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
          <div className="workspace-status" role="status">
            {status === "saved"
              ? "محفوظ في مساحة العمل الخاصة"
              : status === "loading"
                ? "جارٍ استعادة مساحة العمل…"
                : status === "saving"
                  ? "جارٍ الحفظ… لا تغلق الصفحة"
                  : status === "conflict"
                    ? "تغيّرت البيانات على جهاز آخر. احتفظ بنسخة من تعديلاتك قبل إعادة التحميل."
                    : "تعذّر الاتصال بمساحة العمل. التغييرات غير محفوظة بعد."}
            {(status === "error" || status === "conflict") && (
              <>
                <button
                  className="button"
                  onClick={retry}
                  disabled={status === "conflict"}
                >
                  إعادة المحاولة
                </button>
                <button className="button" onClick={exportUnsaved}>
                  تنزيل نسخة للاسترداد
                </button>
              </>
            )}
          </div>
          <fieldset disabled={!ready} className="workspace-content">
            <div className="page-heading">
              <div>
                <span className="eyebrow">
                  {screen === "today"
                    ? new Intl.DateTimeFormat("ar-SY", {
                        dateStyle: "full",
                        timeZone: "Asia/Damascus",
                      }).format(new Date())
                    : screen === "spaces"
                      ? "العمل / التعلّم / الحياة الشخصية"
                      : "فكّر بحرية، وقرّر بوضوح"}
                </span>
                <h1>
                  {screen === "today"
                    ? "اليوم، على مهل."
                    : screen === "spaces"
                      ? "مساحة لكل ما يهمك."
                      : screen === "assistant"
                        ? "مساعدك في مدار."
                        : navigation.find((n) => n.id === screen)?.label +
                          ", بوضوح."}
                </h1>
                <p>
                  {screen === "today"
                    ? `${number(priorities.length)} أولويات. مساحة للتقدّم، ومساحة للحياة.`
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
                <section
                  className="workspace-metrics"
                  aria-label="ملخص مساحة العمل"
                >
                  <article>
                    <small>مهام مفتوحة</small>
                    <strong>
                      {number(state.tasks.filter((t) => !t.done).length)}
                    </strong>
                    <span>{number(overdue.length)} تجاوزت الموعد</span>
                  </article>
                  <article>
                    <small>مهام هذا الأسبوع</small>
                    <strong>
                      {number(weekly.filter((t) => t.done).length)} /{" "}
                      {number(weekly.length)}
                    </strong>
                    <progress
                      aria-label="تقدم مهام هذا الأسبوع"
                      value={weekly.filter((t) => t.done).length}
                      max={weekly.length || 1}
                    />
                  </article>
                  <article>
                    <small>مشاريعك</small>
                    <strong>{number(state.projects?.length ?? 0)}</strong>
                    <span>تقدّم محسوب من المهام المرتبطة</span>
                  </article>
                  <article>
                    <small>أفكار محفوظة</small>
                    <strong>{number(state.notes.length)}</strong>
                    <span>ملاحظاتك في مساحة واحدة</span>
                  </article>
                </section>
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
                      caption="مواعيدك القادمة"
                      action={<CalendarDays size={19} />}
                    >
                      {events
                        .filter((e) => e.date >= demoDate)
                        .sort((a, b) =>
                          (a.date + a.time).localeCompare(b.date + b.time),
                        )
                        .slice(0, 6)
                        .map((e) => (
                          <div className="appointment" key={e.id}>
                            <time>{e.time}</time>
                            <div>
                              <strong>{e.title}</strong>
                              <small>
                                {spaceName(e.spaceId)} · {e.date} · {e.duration}
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
                        <ProposalCard
                          proposal={pending[0]}
                          dispatch={dispatch}
                        />
                      ) : (
                        <Empty>راجعت كل الاقتراحات. يومك ملكك.</Empty>
                      )}
                      <button
                        className="quiet-button section-link"
                        onClick={() => go("assistant")}
                      >
                        المساعد والاقتراحات{" "}
                        {pending.length > 1
                          ? `(${number(pending.length)})`
                          : ""}
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
                {!!state.activity?.length && (
                  <Section
                    title="نشاطك الأخير"
                    caption="ملخص آخر ٥٠ تغييراً في مساحة العمل"
                  >
                    {state.activity.slice(0, 8).map((a) => (
                      <div className="record-row" key={a.id}>
                        <span>{a.label}</span>
                        <time>
                          {new Date(a.at).toLocaleString("ar-SY", {
                            timeZone: "Asia/Damascus",
                          })}
                        </time>
                      </div>
                    ))}
                  </Section>
                )}
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
                          onClick={() =>
                            dispatch({ type: "convert", id: n.id })
                          }
                        >
                          تحويل إلى مهمة <ArrowLeft size={14} />
                        </button>
                      </div>
                    ))}
                  </Section>
                )}
              </>
            )}
            {screen !== "today" &&
              screen !== "spaces" &&
              screen !== "assistant" &&
              screen !== "growth" && (
                <WorkspaceManager
                  key={screen}
                  kind={screen}
                  state={state}
                  dispatch={dispatch}
                />
              )}
            {screen === "growth" && (
              <Growth state={state} dispatch={dispatch} />
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
            <div hidden={screen !== "settings"}>
              <WorkspaceRecovery state={state} dispatch={dispatch} />
              <NotionReadPanel />
            </div>
            <footer>
              <span>مدار · مساحة لحياة أكثر وضوحًا</span>
              <span>
                {screen === "assistant"
                  ? "مسودات المساعد محفوظة بشكل خاص"
                  : "الحفظ التلقائي في قاعدة البيانات"}
              </span>
            </footer>
          </fieldset>
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
          customSpaces={state.customSpaces}
          defaultSpace={screen === "spaces" && selected ? selected : "life"}
          onClose={() => setCapture(false)}
        />
      )}
    </div>
  );
}
