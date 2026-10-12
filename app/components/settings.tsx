"use client";
import Link from "next/link";
import { useState } from "react";
import { ShieldCheck, Type, UserRound } from "lucide-react";
import ThemeToggle from "./theme-toggle";
import { Section } from "./shared";
export default function Settings() {
  const [notifications, setNotifications] = useState(true);
  return (
    <div className="settings-grid">
      <Section title="مساحتك الخاصة" action={<UserRound size={20} />}>
        <h3>إلهام · مالكة مدار</h3>
        <p>حساب مالك واحد. لا تسجيل عام أو دعوات أو فرق.</p>
        <small>الاسم المعروض تجريبي؛ بيانات الدخول تُضبط على الخادم.</small>
      </Section>
      <Section title="المظهر" caption="هادئ في النهار، مريح في المساء">
        <div className="settings-line">
          <span>المظهر الفاتح / الداكن</span>
          <ThemeToggle />
        </div>
        <p>كحلي #14243D · أحمر #B71C32</p>
      </Section>
      <Section title="Neo Sans Arabic" action={<Type size={20} />}>
        <p>Black للعناوين الكبيرة · Bold للأقسام والأزرار · Light للنصوص.</p>
        <span className="tag">خطوط محلية · لا طلبات خارجية</span>
        <p className="privacy-hint">
          ملف Medium المرفق لاتيني فقط. نستخدم Light العربي الحقيقي للنصوص حتى
          توفير Medium عربي؛ لا أوزان مصطنعة.
        </p>
      </Section>
      <Section title="الخصوصية والحدود" action={<ShieldCheck size={20} />}>
        <p>
          الوزارة وStardust واستوديو السلام والمعلومات الشخصية ضمن حدود وصول
          صريحة.
        </p>
        <p>
          محتوى الوزارة والصحة مستبعد افتراضيًا من الذكاء الاصطناعي الخارجي. أي
          إرسال يتطلب موافقة صريحة.
        </p>
      </Section>
      <Section title="التكاملات" caption="لا تفعيل تلقائي">
        <p>
          إعداد المزوّد والمفاتيح يتم على الخادم فقط. خدمات الذكاء الاصطناعي
          والتفريغ قد تفرض رسوم استخدام.
        </p>
        <Link className="button" prefetch={false} href="/discovery">
          مراجعة اكتشاف Notion
        </Link>
        <Link className="button" prefetch={false} href="/sync">
          مراجعة المزامنة والموافقات
        </Link>
      </Section>
      <Section
        title="إشعارات داخل الواجهة"
        caption="تفضيل مؤقت للجلسة التجريبية"
      >
        <label className="settings-line">
          <input
            type="checkbox"
            checked={notifications}
            onChange={(e) => setNotifications(e.target.checked)}
          />
          إظهار ملخص الانتباه في الإعدادات
        </label>
        {notifications && (
          <p role="status">
            راجع المتأخرات والاقتراحات من شاشة اليوم. لا إرسال بريد أو إشعارات
            خارجية.
          </p>
        )}
      </Section>
      <Section title="أمان الحساب">
        <p>
          جلسات محدودة المدة، ملفات ارتباط HttpOnly، تسجيل خروج، حماية CSRF
          وحدود للطلبات.
        </p>
        <p>
          تغيير بيانات المالك وإدارة الأسرار من إعدادات الخادم الخاصة. لا إدارة
          مستخدمين هنا.
        </p>
      </Section>
    </div>
  );
}
