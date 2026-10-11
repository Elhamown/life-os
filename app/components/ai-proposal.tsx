"use client";
import { useState } from "react";
import Link from "next/link";
import { aiAreas, type AiFields, type AiProposal } from "../lib/ai/model";
import { spaceName } from "../lib/model";
export const kindNames = {
  task: "مهمة",
  event: "موعد",
  note: "ملاحظة",
  study: "جلسة دراسة",
};
export function AiProposalCard({
  proposal,
  onDecide,
  disabled,
}: {
  proposal: AiProposal;
  onDecide: (
    p: AiProposal,
    f: AiFields,
    decision: "approved" | "rejected",
  ) => Promise<void>;
  disabled: boolean;
}) {
  const [edit, setEdit] = useState(false);
  const [value, setValue] = useState<AiFields>(() => {
    const {
      kind,
      operation,
      spaceId,
      title,
      date,
      time,
      durationMinutes,
      details,
      contextIds,
    } = proposal;
    return {
      kind,
      operation,
      spaceId,
      title,
      date,
      time,
      durationMinutes,
      details,
      contextIds,
    };
  });
  return (
    <article className="proposal ai-proposal">
      <span className="tag">إنشاء · {kindNames[value.kind]} · مسودة فقط</span>
      <h3>{value.title}</h3>
      <p>الوجهة: {spaceName(value.spaceId)}</p>
      <p>
        {value.date ?? "بلا تاريخ"} {value.time ?? ""}{" "}
        {value.durationMinutes ? `· ${value.durationMinutes} دقيقة` : ""}
      </p>
      {value.details && <p>{value.details}</p>}
      <small>
        {value.contextIds.length
          ? `مرتبط بـ ${value.contextIds.length} سجل مؤكد`
          : "مقترح جديد؛ ليس التزامًا قائمًا"}
      </small>
      {proposal.status === "pending" ? (
        <>
          {edit && (
            <fieldset disabled={disabled}>
              <legend>حقول المقترح</legend>
              <label>
                نوع السجل
                <select
                  value={value.kind}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      kind: e.target.value as AiFields["kind"],
                    })
                  }
                >
                  {Object.entries(kindNames).map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                عنوان المقترح
                <input
                  required
                  maxLength={200}
                  value={value.title}
                  onChange={(e) =>
                    setValue({ ...value, title: e.target.value })
                  }
                />
              </label>
              <label>
                وجهة المقترح
                <select
                  value={value.spaceId}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      spaceId: e.target.value as AiFields["spaceId"],
                    })
                  }
                >
                  {aiAreas.map((id) => (
                    <option key={id} value={id}>
                      {spaceName(id)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                تاريخ المقترح
                <input
                  type="date"
                  value={value.date ?? ""}
                  onChange={(e) =>
                    setValue({ ...value, date: e.target.value || null })
                  }
                />
              </label>
              <label>
                وقت المقترح
                <input
                  type="time"
                  value={value.time ?? ""}
                  onChange={(e) =>
                    setValue({ ...value, time: e.target.value || null })
                  }
                />
              </label>
              <label>
                المدة بالدقائق
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={value.durationMinutes ?? ""}
                  onChange={(e) =>
                    setValue({
                      ...value,
                      durationMinutes: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                />
              </label>
              <label>
                تفاصيل المقترح
                <textarea
                  maxLength={1000}
                  value={value.details}
                  onChange={(e) =>
                    setValue({ ...value, details: e.target.value })
                  }
                />
              </label>
            </fieldset>
          )}
          <div className="proposal-actions">
            <button
              className="button"
              disabled={disabled}
              onClick={() => setEdit(!edit)}
            >
              {edit ? "إنهاء التعديل" : "تعديل المقترح"}
            </button>
            <button
              className="button primary"
              disabled={disabled || !value.title.trim()}
              onClick={() => void onDecide(proposal, value, "approved")}
            >
              اعتماد كمسودة
            </button>
            <button
              className="quiet-button"
              disabled={disabled}
              onClick={() => void onDecide(proposal, value, "rejected")}
            >
              رفض المقترح
            </button>
          </div>
        </>
      ) : (
        <p className="tag">
          {proposal.status === "approved"
            ? "مسودة معتمدة داخليًا · لم تُرسل إلى Notion"
            : "مرفوض"}
        </p>
      )}
      {proposal.status === "approved" && (
        <Link className="button" href="/sync" prefetch={false}>
          مراجعة مزامنة منفصلة إلى Notion
        </Link>
      )}
    </article>
  );
}
