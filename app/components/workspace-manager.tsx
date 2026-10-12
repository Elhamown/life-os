"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  spaces,
  spaceName,
  todayDate,
  type State,
  type Action,
  type SpaceId,
  type Task,
  type Project,
  type Note,
  type CalendarEvent,
} from "../lib/model";
import { Empty, Section, TaskRow } from "./shared";
type Kind = "tasks" | "projects" | "notes" | "calendar" | "settings";
type RecordItem = Task | Project | Note | CalendarEvent;
export default function WorkspaceManager({
  kind,
  state,
  dispatch,
}: {
  kind: Kind;
  state: State;
  dispatch: (a: Action) => void;
}) {
  const availableSpaces = [
    ...spaces,
    ...(state.customSpaces ?? []).map((s) => ({
      id: s.id as SpaceId,
      name: s.title,
    })),
  ];
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [view, setView] = useState("list");
  const [date, setDate] = useState(todayDate()),
    [range, setRange] = useState("month");
  const [editing, setEditing] = useState<RecordItem | null>(null),
    [creating, setCreating] = useState(false);
  const [title, setTitle] = useState(""),
    [spaceId, setSpace] = useState<SpaceId>("life"),
    [due, setDue] = useState(todayDate()),
    [notes, setNotes] = useState(""),
    [time, setTime] = useState("09:00"),
    [duration, setDuration] = useState("30 دقيقة"),
    [priority, setPriority] = useState(false),
    [projectId, setProject] = useState("");
  function edit(item?: RecordItem) {
    setEditing(item ?? null);
    setCreating(true);
    setTitle(item?.title ?? "");
    setSpace(item?.spaceId ?? "life");
    setDue(
      item && "date" in item
        ? item.date
        : item && "deadline" in item
          ? item.deadline
          : todayDate(),
    );
    setNotes(item && "notes" in item ? item.notes : "");
    setTime(item && "time" in item ? item.time : "09:00");
    setDuration(item && "duration" in item ? item.duration : "30 دقيقة");
    setPriority(item && "priority" in item ? item.priority : false);
    setProject(item && "projectId" in item ? (item.projectId ?? "") : "");
  }
  function save() {
    const id = editing?.id ?? crypto.randomUUID(),
      base = { id, title: title.trim(), spaceId };
    if (!base.title) return;
    if (kind === "tasks") {
      const task: Task = {
        ...base,
        date: due,
        priority,
        done: editing && "done" in editing ? editing.done : false,
        ...(projectId ? { projectId } : {}),
      };
      if (editing) dispatch({ type: "editTask", task });
      else {
        dispatch({ type: "capture", ...base, kind: "task", date: due });
        dispatch({ type: "editTask", task });
      }
    } else if (kind === "notes") {
      if (editing) dispatch({ type: "editNote", note: base });
      else dispatch({ type: "capture", ...base, kind: "note" });
    } else if (kind === "projects")
      dispatch({ type: "project", project: { ...base, deadline: due, notes } });
    else
      dispatch({
        type: "event",
        event: { ...base, date: due, time, duration },
      });
    setCreating(false);
  }
  function remove(id: string) {
    if (!window.confirm("حذف هذا السجل من مدار؟ لن تُحذف أي بيانات من Notion."))
      return;
    dispatch({
      type:
        kind === "tasks"
          ? "deleteTask"
          : kind === "notes"
            ? "deleteNote"
            : kind === "projects"
              ? "deleteProject"
              : "deleteEvent",
      id,
    });
  }
  if (kind === "settings")
    return (
      <Section title="إعدادات مساحة العمل" caption="الخصوصية والتفضيلات">
        <label>
          بداية الأسبوع
          <select
            value={state.preferences?.weekStarts ?? "saturday"}
            onChange={(e) =>
              dispatch({
                type: "preferences",
                preferences: {
                  weekStarts: e.target.value as "saturday" | "monday",
                },
              })
            }
          >
            <option value="saturday">السبت</option>
            <option value="monday">الاثنين</option>
          </select>
        </label>
        <p>
          تُحفظ السجلات مشفّرة في قاعدة البيانات. لا تُرسل إلى AI أو Notion
          تلقائياً.
        </p>
        <p>غيّر المظهر من زر الشمس أو القمر في الشريط العلوي.</p>
        <a className="button" href="/discovery">
          حالة اتصال Notion وربط المصادر
        </a>
        <a className="button" href="/sync">
          مراجعة المزامنة
        </a>
        <p>
          التكاملات تحتاج إعدادات الخادم وموافقتك. حالة الاتصال الفعلية تظهر عند
          فتح صفحة الخدمة.
        </p>
      </Section>
    );
  const collection: RecordItem[] =
    kind === "tasks"
      ? state.tasks
      : kind === "notes"
        ? state.notes
        : kind === "projects"
          ? (state.projects ?? [])
          : (state.events ?? []);
  const records = collection.filter(
    (r) =>
      r.title.includes(query) &&
      (filter === "all" ||
        (kind === "tasks" && "done" in r
          ? filter === "done"
            ? r.done
            : !r.done
          : r.spaceId === filter)),
  );
  const heading = {
    tasks: "المهام",
    projects: "المشاريع",
    notes: "الملاحظات",
    calendar: "التقويم",
  }[kind];
  function tools(item: RecordItem) {
    return (
      <span className="record-tools">
        <button
          className="icon-button"
          aria-label={`تعديل ${item.title}`}
          onClick={() => edit(item)}
        >
          <Pencil size={16} />
        </button>
        <button
          className="icon-button"
          aria-label={`حذف ${item.title}`}
          onClick={() => remove(item.id)}
        >
          <Trash2 size={16} />
        </button>
      </span>
    );
  }
  function row(item: RecordItem) {
    return (
      <article className="record-row" key={item.id}>
        {kind === "tasks" && "done" in item ? (
          <TaskRow
            task={item}
            dispatch={dispatch}
            spaceLabel={
              availableSpaces.find((s) => s.id === item.spaceId)?.name
            }
          />
        ) : (
          <div>
            <h3>{item.title}</h3>
            <small>
              {availableSpaces.find((s) => s.id === item.spaceId)?.name ??
                spaceName(item.spaceId)}
            </small>
            {"deadline" in item && (
              <>
                <p>{item.notes}</p>
                <small>الموعد: {item.deadline || "غير محدد"}</small>
                <progress
                  aria-label={`تقدم ${item.title}`}
                  value={
                    state.tasks.filter((t) => t.projectId === item.id && t.done)
                      .length
                  }
                  max={
                    state.tasks.filter((t) => t.projectId === item.id).length ||
                    1
                  }
                />
                <small>
                  {
                    state.tasks.filter((t) => t.projectId === item.id && t.done)
                      .length
                  }{" "}
                  / {state.tasks.filter((t) => t.projectId === item.id).length}{" "}
                  مهام مكتملة
                </small>
              </>
            )}
            {"time" in item && (
              <p>
                {item.date} · {item.time} · {item.duration}
              </p>
            )}
          </div>
        )}
        {"date" in item && !("time" in item) && <time>{item.date}</time>}
        {tools(item)}
      </article>
    );
  }
  const day = new Date(date + "T12:00:00Z");
  const weekStart = state.preferences?.weekStarts === "monday" ? 1 : 6;
  const start = new Date(day);
  if (range === "month") start.setUTCDate(1);
  else if (range === "week")
    start.setUTCDate(
      start.getUTCDate() - ((start.getUTCDay() - weekStart + 7) % 7),
    );
  const count =
    range === "day"
      ? 1
      : range === "week"
        ? 7
        : new Date(day.getUTCFullYear(), day.getUTCMonth() + 1, 0).getUTCDate();
  function move(direction: number) {
    const next = new Date(day);
    if (range === "month") {
      next.setUTCDate(1);
      next.setUTCMonth(next.getUTCMonth() + direction);
    } else
      next.setUTCDate(
        next.getUTCDate() + direction * (range === "week" ? 7 : 1),
      );
    setDate(next.toISOString().slice(0, 10));
  }
  return (
    <Section
      title={heading}
      action={
        <button className="button primary" onClick={() => edit()}>
          <Plus size={16} />
          إضافة
        </button>
      }
    >
      <div className="workspace-toolbar">
        <input
          aria-label={`البحث في ${heading}`}
          placeholder="ابحث…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="تصفية السجلات"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">الكل</option>
          {kind === "tasks" ? (
            <>
              <option value="open">مفتوحة</option>
              <option value="done">مكتملة</option>
            </>
          ) : (
            availableSpaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))
          )}
        </select>
        {kind === "tasks" && (
          <select
            aria-label="طريقة العرض"
            value={view}
            onChange={(e) => setView(e.target.value)}
          >
            <option value="list">قائمة</option>
            <option value="board">لوحة</option>
            <option value="calendar">حسب التاريخ</option>
          </select>
        )}
      </div>
      {creating && (
        <form
          className="workspace-editor"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <h3>{editing ? "تعديل السجل" : "سجل جديد"}</h3>
          <label>
            العنوان
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={1000}
              required
            />
          </label>
          <label>
            المساحة
            <select
              value={spaceId}
              onChange={(e) => {
                setSpace(e.target.value as SpaceId);
                setProject("");
              }}
            >
              {availableSpaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          {kind !== "notes" && (
            <label>
              الموعد
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                required={kind !== "projects"}
              />
            </label>
          )}
          {kind === "tasks" && (
            <>
              <label>
                <input
                  type="checkbox"
                  checked={priority}
                  onChange={(e) => setPriority(e.target.checked)}
                />
                أولوية
              </label>
              <label>
                المشروع
                <select
                  aria-label="المشروع"
                  value={projectId}
                  onChange={(e) => setProject(e.target.value)}
                >
                  <option value="">بدون مشروع</option>
                  {(state.projects ?? [])
                    .filter((p) => p.spaceId === spaceId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}
          {kind === "projects" && (
            <label>
              ملاحظات المشروع
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={1000}
              />
            </label>
          )}
          {kind === "calendar" && (
            <>
              <label>
                الوقت
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  required
                />
              </label>
              <label>
                المدة
                <input
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  maxLength={100}
                  required
                />
              </label>
            </>
          )}
          <div className="actions">
            <button className="button primary">حفظ</button>
            <button
              type="button"
              className="button"
              onClick={() => setCreating(false)}
            >
              إلغاء
            </button>
          </div>
        </form>
      )}
      {kind === "calendar" ? (
        <>
          <div className="workspace-toolbar">
            <button
              className="icon-button"
              aria-label="الفترة السابقة"
              onClick={() => move(-1)}
            >
              <ChevronRight />
            </button>
            <input
              aria-label="التاريخ المعروض"
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
            />
            <button
              className="icon-button"
              aria-label="الفترة التالية"
              onClick={() => move(1)}
            >
              <ChevronLeft />
            </button>
            <select
              aria-label="فترة التقويم"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              <option value="day">يوم</option>
              <option value="week">أسبوع</option>
              <option value="month">شهر</option>
            </select>
          </div>
          <div className={`calendar-grid ${range}`}>
            {Array.from({ length: count }, (_, i) => {
              const d = new Date(start);
              d.setUTCDate(d.getUTCDate() + i);
              const key = d.toISOString().slice(0, 10);
              return (
                <div className="calendar-day" key={key}>
                  <strong>
                    {new Intl.DateTimeFormat("ar-SY", {
                      day: "numeric",
                      month: "short",
                      timeZone: "UTC",
                    }).format(d)}
                  </strong>
                  {records
                    .filter((e) => "date" in e && e.date === key)
                    .sort((a, b) =>
                      ("time" in a ? a.time : "").localeCompare(
                        "time" in b ? b.time : "",
                      ),
                    )
                    .map(row)}
                  {state.tasks
                    .filter(
                      (t) =>
                        t.date === key &&
                        t.title.includes(query) &&
                        (filter === "all" || t.spaceId === filter),
                    )
                    .map((t) => (
                      <TaskRow key={t.id} task={t} dispatch={dispatch} />
                    ))}
                </div>
              );
            })}
          </div>
        </>
      ) : kind === "tasks" && view !== "list" ? (
        <div className="record-board">
          {(view === "board"
            ? ["open", "done"]
            : [
                ...new Set(records.map((r) => ("date" in r ? r.date : ""))),
              ].sort()
          ).map((group) => (
            <div key={group}>
              <h3>
                {view === "board"
                  ? group === "open"
                    ? "قيد العمل"
                    : "مكتملة"
                  : group}
              </h3>
              {records
                .filter((r) =>
                  view === "board"
                    ? "done" in r && r.done === (group === "done")
                    : "date" in r && r.date === group,
                )
                .map(row)}
            </div>
          ))}
        </div>
      ) : (
        records.map(row)
      )}
      {!records.length && kind !== "calendar" && (
        <Empty>لا توجد سجلات. أضف أول سجل لك.</Empty>
      )}
    </Section>
  );
}
