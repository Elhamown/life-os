"use client";
import { spaces } from "../lib/model";
import { useState } from "react";
export default function DiscoveryPreview() {
  const [open, setOpen] = useState(false);
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <h2>معاينة التقرير التجريبي</h2>
          <p>بيانات اصطناعية منفصلة تمامًا عن أي جرد حقيقي</p>
        </div>
        <button
          className="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? "إخفاء المعاينة" : "عرض مثال آمن"}
        </button>
      </div>
      {open && (
        <>
          <div className="planning-hint">
            <p>
              مثال بصري فقط: لا طلب إلى Notion، ولا حفظ ربط أو تعديل بيانات.
              المعرّفات التالية توضيحية.
            </p>
          </div>
          <div className="audit-preview-grid">
            {spaces.map((s) => (
              <article key={s.id} className="audit-preview-source">
                <h3>{s.name}</h3>
                <small>demo-source-{s.id} · مصدر توضيحي</small>
                <p>المخطط: العنوان / الحالة / التاريخ / المشروع</p>
                <p>الربط المقترح: {s.name}</p>
                <span className="tag">
                  {s.id === "ministry" || s.id === "health"
                    ? "مستبعد من AI"
                    : "اقتراح يحتاج مراجعة"}
                </span>
              </article>
            ))}
          </div>
          <p className="privacy-hint">
            مثال تنبيه: تشابه مخطط «المهام» و«متابعة المهام» قد يعني بنيتين
            متشابهتين. لا استنتاج بوجود سجل مكرر، ولا دمج تلقائي.
          </p>
        </>
      )}
    </section>
  );
}
