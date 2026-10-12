"use client";
import { useState } from "react";
import {
  spaces,
  todayDate,
  type Action,
  type State,
  type SpaceId,
} from "../lib/model";
import { Section, Empty } from "./shared";
export default function Growth({
  state,
  dispatch,
}: {
  state: State;
  dispatch: (a: Action) => void;
}) {
  const [kind, setKind] = useState("habit"),
    [title, setTitle] = useState(""),
    [area, setArea] = useState<SpaceId>("life"),
    [target, setTarget] = useState(10),
    [deadline, setDeadline] = useState("");
  const today = todayDate();
  return (
    <>
      <Section title="العادات والأهداف" caption="خطوات صغيرة، تقدّم محفوظ">
        <form
          className="workspace-editor"
          onSubmit={(e) => {
            e.preventDefault();
            const id = crypto.randomUUID();
            if (kind === "habit")
              dispatch({
                type: "habit",
                habit: { id, title: title.trim(), spaceId: area, days: [] },
              });
            else
              dispatch({
                type: "goal",
                goal: {
                  id,
                  title: title.trim(),
                  spaceId: area,
                  deadline,
                  current: 0,
                  target,
                },
              });
            setTitle("");
          }}
        >
          <label>
            النوع
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="habit">عادة يومية</option>
              <option value="goal">هدف قابل للقياس</option>
            </select>
          </label>
          <label>
            العنوان
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={1000}
            />
          </label>
          <label>
            المساحة
            <select
              value={area}
              onChange={(e) => setArea(e.target.value as SpaceId)}
            >
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              {state.customSpaces?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          {kind === "goal" && (
            <>
              <label>
                عدد الخطوات المطلوبة
                <input
                  type="number"
                  min={1}
                  max={1000000}
                  value={target}
                  onChange={(e) => setTarget(Number(e.target.value))}
                  required
                />
              </label>
              <label>
                الموعد المستهدف
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </label>
            </>
          )}
          <button className="button primary" disabled={!title.trim()}>
            إضافة
          </button>
        </form>
      </Section>
      <Section title="عادات اليوم">
        {state.habits?.map((h) => (
          <div className="record-row" key={h.id}>
            <label>
              <input
                type="checkbox"
                checked={h.days.includes(today)}
                onChange={() =>
                  dispatch({ type: "toggleHabit", id: h.id, date: today })
                }
              />
              {h.title}
            </label>
            <small>{h.days.length} أيام مكتملة</small>
            <button
              className="quiet-button"
              onClick={() => {
                if (window.confirm("حذف هذه العادة وسجلها من مدار؟"))
                  dispatch({ type: "deleteHabit", id: h.id });
              }}
            >
              حذف {h.title}
            </button>
          </div>
        ))}
        {!state.habits?.length && <Empty>أضف عادة تناسب يومك.</Empty>}
      </Section>
      <Section title="أهدافك">
        {state.goals?.map((g) => (
          <div className="record-row" key={g.id}>
            <div>
              <h3>{g.title}</h3>
              <progress
                aria-label={`تقدم ${g.title}`}
                value={g.current}
                max={g.target}
              />
              <label>
                الخطوات المكتملة
                <input
                  aria-label={`الخطوات المكتملة لـ ${g.title}`}
                  type="number"
                  min={0}
                  max={g.target}
                  value={g.current}
                  onChange={(e) => {
                    const current = Number(e.target.value);
                    if (
                      Number.isFinite(current) &&
                      current >= 0 &&
                      current <= g.target
                    )
                      dispatch({ type: "goal", goal: { ...g, current } });
                  }}
                />
              </label>
              <small>
                الهدف: {g.target} · {g.deadline || "دون موعد"}
              </small>
            </div>
            <button
              className="quiet-button"
              onClick={() => {
                if (window.confirm("حذف هذا الهدف من مدار؟"))
                  dispatch({ type: "deleteGoal", id: g.id });
              }}
            >
              حذف {g.title}
            </button>
          </div>
        ))}
        {!state.goals?.length && <Empty>حدّد هدفك الأول.</Empty>}
      </Section>
    </>
  );
}
