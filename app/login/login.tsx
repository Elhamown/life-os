"use client";
import { useState } from "react";
export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-shell">
      <h1>مدار، مساحتك الخاصة.</h1>
      <p>يلزم تسجيل الدخول لفتح الموقع أو مراجعة بيانات Notion.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const r = await fetch("/api/private/login", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ password }),
              cache: "no-store",
            });
            const d = await r.json();
            if (!r.ok)
              throw Error(
                d.error === "PRIVATE_SETUP_REQUIRED"
                  ? "الإعداد الخاص غير مكتمل. أعدّ المصادقة ومخزن الأسرار على الخادم أولًا."
                  : r.status === 429
                    ? "محاولات كثيرة؛ حاول بعد عشر دقائق."
                    : "تعذّر الدخول. تحقق من كلمة المرور وإعدادات الخادم.",
              );
            const target = new URLSearchParams(window.location.search).get(
              "next",
            );
            window.location.assign(
              target && ["/", "/discovery", "/sync"].includes(target)
                ? target
                : "/",
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setPassword("");
            setBusy(false);
          }
        }}
      >
        <label>
          كلمة مرور المالك
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={128}
            required
          />
        </label>
        <button className="button primary" disabled={busy}>
          {busy ? "جارٍ التحقق" : "دخول آمن"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      <p className="helper">
        لا تُدخل توكن Notion أو مفتاح AI هنا. احفظ الأسرار في متغيرات الخادم
        فقط.
      </p>
    </main>
  );
}
