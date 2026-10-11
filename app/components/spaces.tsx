"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  ChevronLeft,
  GraduationCap,
  Heart,
  House,
  Layers,
  Orbit,
  Palette,
  Plus,
  Search,
} from "lucide-react";
import {
  type Action,
  type State,
  type SpaceId,
  domains,
  spaces,
  projects,
  events,
  number,
} from "../lib/model";
import { Empty, Section, TaskRow } from "./shared";
const icons = {
  ministry: BriefcaseBusiness,
  stardust: Orbit,
  studio: Palette,
  studies: GraduationCap,
  reading: BookOpen,
  courses: Layers,
  health: Heart,
  life: House,
};
const tabs = [
  "نظرة عامة",
  "المشاريع",
  "المهام",
  "التقويم",
  "الملاحظات",
] as const;
export default function Spaces({
  state,
  dispatch,
  selected,
  onSelect,
  onCapture,
}: {
  state: State;
  dispatch: (a: Action) => void;
  selected: SpaceId | null;
  onSelect: (s: SpaceId | null) => void;
  onCapture: () => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("نظرة عامة");
  const [query, setQuery] = useState("");
  const [habit, setHabit] = useState(false);
  const space = spaces.find((s) => s.id === selected);
  const tasks = state.tasks.filter((t) => t.spaceId === selected);
  const notes = state.notes.filter((n) => n.spaceId === selected);
  const appointments = events.filter((e) => e.spaceId === selected);
  const spaceProjects = projects.filter((p) => p.spaceId === selected);
  if (!space)
    return (
      <>
        <div className="space-search">
          <Search size={18} />
          <input
            aria-label="البحث في المساحات"
            placeholder="ابحث عن مساحة..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {domains.map((d) => (
          <Section key={d.id} title={d.name} caption={d.subtitle}>
            <div className="space-grid">
              {spaces
                .filter((s) => s.domain === d.id && s.name.includes(query))
                .map((s) => {
                  const Icon = icons[s.id];
                  return (
                    <button
                      className="space-tile"
                      key={s.id}
                      onClick={() => {
                        onSelect(s.id);
                        setTab("نظرة عامة");
                      }}
                    >
                      <span className="space-symbol">
                        <Icon size={22} />
                      </span>
                      <span>
                        <strong>{s.name}</strong>
                        <small>{s.description}</small>
                        <span className="space-count">
                          {number(
                            state.tasks.filter(
                              (t) => t.spaceId === s.id && !t.done,
                            ).length,
                          )}{" "}
                          مهام مفتوحة ·{" "}
                          {number(
                            projects.filter((p) => p.spaceId === s.id).length,
                          )}{" "}
                          مشروع
                        </span>
                      </span>
                      <ChevronLeft size={18} />
                    </button>
                  );
                })}
            </div>
            {!spaces.some(
              (s) => s.domain === d.id && s.name.includes(query),
            ) && <Empty>لا توجد مساحة تطابق البحث في هذا المجال.</Empty>}
          </Section>
        ))}
        <details className="notion-discovery">
          <summary>
            اكتشاف Notion <span className="tag">غير متصل</span>
          </summary>
          <p>
            راجع المصادر المتاحة للتكامل، وافحص مخططاتها، ثم اعتمد ربطها
            بمساحاتك. يتطلب الوصول الحقيقي تسجيل دخول خاص، ولا يغيّر أي بيانات
            Notion.
          </p>
          <Link className="quiet-button" href="/discovery" prefetch={false}>
            فتح الاكتشاف الخاص <ArrowLeft size={15} />
          </Link>
          <Link className="quiet-button" href="/sync" prefetch={false}>
            مزامنة محكومة بعد المراجعة <ArrowLeft size={15} />
          </Link>
        </details>
      </>
    );
  return (
    <>
      <div className="space-detail-head">
        <button className="quiet-button" onClick={() => onSelect(null)}>
          <ArrowRight size={17} />
          كل المساحات
        </button>
        <button className="button" onClick={onCapture}>
          <Plus size={16} />
          إضافة
        </button>
      </div>
      <div className="space-title">
        <span className="space-symbol">
          {(() => {
            const Icon = icons[space.id];
            return <Icon size={25} />;
          })()}
        </span>
        <div>
          <h2>{space.name}</h2>
          <p>{space.description}</p>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="أقسام المساحة">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            id={`tab-${tabs.indexOf(t)}`}
            aria-selected={t === tab}
            aria-controls="space-panel"
            tabIndex={t === tab ? 0 : -1}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const index =
                  e.key === "Home"
                    ? 0
                    : e.key === "End"
                      ? tabs.length - 1
                      : (tabs.indexOf(t) +
                          (e.key === "ArrowLeft" ? 1 : -1) +
                          tabs.length) %
                        tabs.length;
                setTab(tabs[index]);
                document.getElementById(`tab-${index}`)?.focus();
              }
            }}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div
        id="space-panel"
        role="tabpanel"
        aria-labelledby={`tab-${tabs.indexOf(tab)}`}
        tabIndex={0}
      >
        {(tab === "نظرة عامة" || tab === "المشاريع") && (
          <Section
            title="المشاريع"
            caption={`${number(tasks.filter((t) => t.done).length)} من ${number(tasks.length)} مهام مكتملة في هذه المساحة`}
          >
            {spaceProjects.map((p) => (
              <div className="project-row" key={p.id}>
                <span className="project-marker" />
                <div>
                  <strong>{p.title}</strong>
                  <small>مشروع تجريبي · قيد التنفيذ</small>
                </div>
                <span className="tag">نشط</span>
              </div>
            ))}
          </Section>
        )}
        {(tab === "نظرة عامة" || tab === "المهام") && (
          <Section
            title="المهام"
            action={
              <button className="quiet-button" onClick={onCapture}>
                <Plus size={15} />
                إضافة مهمة
              </button>
            }
          >
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} dispatch={dispatch} />
            ))}
            {!tasks.length && (
              <Empty>لا توجد مهام بعد. أضف خطوتك الأولى.</Empty>
            )}
          </Section>
        )}
        {(tab === "نظرة عامة" || tab === "التقويم") && (
          <Section title="التقويم" caption="مواعيد اليوم التجريبي">
            {appointments.map((e) => (
              <div className="appointment" key={e.id}>
                <time>{e.time}</time>
                <div>
                  <strong>{e.title}</strong>
                  <small>
                    {e.date} · {e.duration}
                  </small>
                </div>
              </div>
            ))}
            {!appointments.length && (
              <Empty>لا توجد مواعيد في هذه المساحة.</Empty>
            )}
          </Section>
        )}
        {(tab === "نظرة عامة" || tab === "الملاحظات") && (
          <Section
            title="الملاحظات"
            action={
              <button className="quiet-button" onClick={onCapture}>
                <Plus size={15} />
                التقاط فكرة
              </button>
            }
          >
            {notes.map((n) => (
              <div className="note-row" key={n.id}>
                <p>{n.title}</p>
                <button
                  className="quiet-button"
                  onClick={() => dispatch({ type: "convert", id: n.id })}
                >
                  تحويل إلى مهمة <ArrowLeft size={14} />
                </button>
              </div>
            ))}
            {!notes.length && <Empty>مساحة فارغة لأفكارك القادمة.</Empty>}
          </Section>
        )}
        {tab === "نظرة عامة" &&
          ["reading", "courses", "health"].includes(space.id) && (
            <Section
              title={
                space.id === "reading"
                  ? "رفّ القراءة"
                  : space.id === "courses"
                    ? "مسار التعلّم"
                    : "الصحة والعادات"
              }
              caption="عرض متخصص تجريبي"
            >
              {space.id === "health" ? (
                <label className="habit-row">
                  <input
                    type="checkbox"
                    checked={habit}
                    onChange={(e) => setHabit(e.target.checked)}
                  />
                  <span>استراحة قصيرة بعيدًا عن الشاشة</span>
                  <span className="tag">
                    {habit ? "اكتملت اليوم" : "عادة يومية"}
                  </span>
                </label>
              ) : (
                <div className="specialized">
                  <BookOpen size={26} />
                  <div>
                    <strong>
                      {space.id === "reading"
                        ? "العادات الذرية"
                        : "أساسيات التصميم"}
                    </strong>
                    <p>
                      {space.id === "reading"
                        ? "كتاب تجريبي · قيد القراءة"
                        : "دورة تجريبية · قيد التعلّم"}
                    </p>
                  </div>
                  <span className="tag">نموذج توضيحي</span>
                </div>
              )}
            </Section>
          )}
      </div>
    </>
  );
}
