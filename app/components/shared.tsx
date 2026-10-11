"use client";
import { useState, type ReactNode } from "react";
import { ArrowLeft, Check, Pencil, Sparkles, X } from "lucide-react";
import {
  type Action,
  type Proposal,
  type Task,
  type SpaceId,
  spaces,
  spaceName,
} from "../lib/model";
export function Section({
  title,
  caption,
  action,
  children,
}: {
  title: string;
  caption?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>{title}</h2>
          {caption && <p>{caption}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>;
}
export function TaskRow({
  task,
  dispatch,
  overdue = false,
}: {
  task: Task;
  dispatch: (a: Action) => void;
  overdue?: boolean;
}) {
  return (
    <div className={`task-row ${task.done ? "completed" : ""}`}>
      <button
        className="task-check"
        aria-label={`${task.done ? "إلغاء إكمال" : "إكمال"} ${task.title}`}
        aria-pressed={task.done}
        onClick={() => dispatch({ type: "toggle", id: task.id })}
      >
        {task.done && <Check size={15} />}
      </button>
      <div className="row-copy">
        <span className="task-title">{task.title}</span>
        <small>{spaceName(task.spaceId)}</small>
      </div>
      {overdue ? (
        <button
          className="quiet-button"
          onClick={() => dispatch({ type: "reschedule", id: task.id })}
        >
          لليوم <ArrowLeft size={14} />
        </button>
      ) : (
        task.priority && <span className="tag">أولوية</span>
      )}
    </div>
  );
}
export function ProposalCard({
  proposal,
  dispatch,
}: {
  proposal: Proposal;
  dispatch: (a: Action) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(proposal.title);
  const [spaceId, setSpaceId] = useState<SpaceId>(proposal.spaceId);
  const [date, setDate] = useState(proposal.date);
  return (
    <article className="proposal">
      <div className="proposal-label">
        <Sparkles size={15} />
        <span>اقتراح تجريبي</span>
        <span className="tag">
          {proposal.status === "pending"
            ? "بانتظار موافقتك"
            : proposal.status === "approved"
              ? "أُضيف للديمو"
              : "مرفوض"}
        </span>
      </div>
      {editing && proposal.status === "pending" ? (
        <form
          className="proposal-edit"
          onSubmit={(e) => {
            e.preventDefault();
            dispatch({
              type: "editProposal",
              id: proposal.id,
              title,
              spaceId,
              date,
            });
            setEditing(false);
          }}
        >
          <label>
            عنوان المهمة
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
            />
          </label>
          <label>
            المساحة
            <select
              aria-label="المساحة"
              value={spaceId}
              onChange={(e) => setSpaceId(e.target.value as SpaceId)}
            >
              {spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            التاريخ
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <div className="actions">
            <button className="button primary" disabled={!title.trim()}>
              حفظ التعديل
            </button>
            <button
              type="button"
              className="button"
              onClick={() => setEditing(false)}
            >
              إلغاء
            </button>
          </div>
        </form>
      ) : (
        <>
          <h3>{proposal.title}</h3>
          <p>{proposal.reason}</p>
          <small>
            {spaceName(proposal.spaceId)} · {proposal.date}
          </small>
          {proposal.status === "pending" && (
            <div className="actions">
              <button
                className="button primary"
                onClick={() =>
                  dispatch({
                    type: "decide",
                    id: proposal.id,
                    decision: "approved",
                  })
                }
              >
                <Check size={15} />
                موافقة
              </button>
              <button
                className="button"
                onClick={() => {
                  setTitle(proposal.title);
                  setSpaceId(proposal.spaceId);
                  setDate(proposal.date);
                  setEditing(true);
                }}
              >
                <Pencil size={14} />
                تعديل
              </button>
              <button
                className="quiet-button"
                onClick={() =>
                  dispatch({
                    type: "decide",
                    id: proposal.id,
                    decision: "rejected",
                  })
                }
              >
                <X size={14} />
                رفض
              </button>
            </div>
          )}
        </>
      )}
    </article>
  );
}
