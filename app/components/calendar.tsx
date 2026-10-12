"use client";
import { useState } from "react";
import { CalendarDays } from "lucide-react";
import {
  events,
  demoDate,
  spaces,
  spaceName,
  number,
  type State,
  type SpaceId,
} from "../lib/model";
import { Section, Empty } from "./shared";
const week = [
  "2026-10-11",
  "2026-10-12",
  "2026-10-13",
  "2026-10-14",
  "2026-10-15",
  "2026-10-16",
  "2026-10-17",
];
const days = [
  "الأحد",
  "الاثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];
export default function Calendar({
  state,
  onCapture,
}: {
  state: State;
  onCapture: () => void;
}) {
  const [mode, setMode] = useState<"day" | "week">("day");
  const [date, setDate] = useState(demoDate);
  const [space, setSpace] = useState<SpaceId | "all">("all");
  const selectedEvents = events.filter(
    (e) => e.date === date && (space === "all" || e.spaceId === space),
  );
  const tasks = state.tasks.filter(
    (t) => t.date === date && (space === "all" || t.spaceId === space),
  );
  return (
    <>
      <div className="calendar-tools">
        <div className="segmented" aria-label="عرض التقويم">
          <button aria-pressed={mode === "day"} onClick={() => setMode("day")}>
            يوم
          </button>
          <button
            aria-pressed={mode === "week"}
            onClick={() => setMode("week")}
          >
            أسبوع
          </button>
        </div>
        <label>
          المساحة{" "}
          <select
            value={space}
            onChange={(e) => setSpace(e.target.value as SpaceId | "all")}
          >
            <option value="all">كل المساحات</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button className="button primary" onClick={onCapture}>
          أضف مهمة
        </button>
      </div>
      <p className="privacy-hint">
        جدول تجريبي · لا اتصال بتقويم خارجي. المهام مرتبطة بسجلاتها الأصلية.
      </p>
      <div className="week-strip">
        {week.map((d, i) => (
          <button key={d} aria-pressed={date === d} onClick={() => setDate(d)}>
            <small>{days[i]}</small>
            <strong>{number(11 + i)}</strong>
            {d === demoDate && <span>اليوم التجريبي</span>}
          </button>
        ))}
      </div>
      {mode === "week" ? (
        <div className="week-board">
          {week.map((d, i) => (
            <Section key={d} title={days[i]} caption={d}>
              {events
                .filter(
                  (e) =>
                    e.date === d && (space === "all" || e.spaceId === space),
                )
                .map((e) => (
                  <div
                    className="schedule-block"
                    data-space={e.spaceId}
                    key={e.id}
                  >
                    <time dir="ltr">{e.time}</time>
                    <strong>{e.title}</strong>
                    <small>
                      {spaceName(e.spaceId)} · {e.duration}
                    </small>
                  </div>
                ))}
              {state.tasks
                .filter(
                  (t) =>
                    t.date === d && (space === "all" || t.spaceId === space),
                )
                .map((t) => (
                  <div className="calendar-task" key={t.id}>
                    {t.done ? "✓ " : "○ "}
                    {t.title}
                  </div>
                ))}
              {!events.some(
                (e) => e.date === d && (space === "all" || e.spaceId === space),
              ) &&
                !state.tasks.some(
                  (t) =>
                    t.date === d && (space === "all" || t.spaceId === space),
                ) && <Empty>مساحة مفتوحة</Empty>}
            </Section>
          ))}
        </div>
      ) : (
        <div className="calendar-day">
          <Section
            title="خطّ اليوم"
            caption={date}
            action={<CalendarDays size={20} />}
          >
            {selectedEvents.map((e) => (
              <div className="schedule-block" data-space={e.spaceId} key={e.id}>
                <time dir="ltr">{e.time}</time>
                <strong>{e.title}</strong>
                <small>
                  {spaceName(e.spaceId)} · {e.duration}
                </small>
              </div>
            ))}
            {!selectedEvents.length && (
              <Empty>لا توجد مواعيد مسجلة لهذا اليوم.</Empty>
            )}
          </Section>
          <Section title="مهام اليوم" caption="دون اختراع موعد للمهمة">
            {tasks.map((t) => (
              <div className="calendar-task" key={t.id}>
                <strong>{t.title}</strong>
                <small>
                  {spaceName(t.spaceId)} · {t.done ? "مكتملة" : "مفتوحة"}
                </small>
              </div>
            ))}
            {!tasks.length && <Empty>لا توجد مهام مسجلة.</Empty>}
          </Section>
        </div>
      )}
    </>
  );
}
