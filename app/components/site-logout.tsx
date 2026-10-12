"use client";
import { useState } from "react";
export default function SiteLogout({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="quiet-button"
        disabled={disabled || busy}
        aria-label="الخروج من مدار"
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const response = await fetch("/api/private/logout", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "{}",
              cache: "no-store",
            });
            if (!response.ok && response.status !== 401) throw Error();
            window.location.replace(
              new URL("/login", window.location.origin).href,
            );
          } catch {
            setError("تعذّر تأكيد الخروج. حاول مجددًا.");
            setBusy(false);
          }
        }}
      >
        خروج
      </button>
      {error && <span role="alert">{error}</span>}
    </>
  );
}
