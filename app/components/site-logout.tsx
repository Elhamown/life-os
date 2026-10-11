"use client";
import { useState } from "react";
export default function SiteLogout({
  disabled = false,
}: {
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="quiet-button"
      disabled={disabled || busy}
      aria-label="الخروج من مدار"
      onClick={async () => {
        setBusy(true);
        try {
          await fetch("/api/private/logout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
            cache: "no-store",
          });
        } finally {
          window.location.replace(
            new URL("/login", window.location.origin).href,
          );
        }
      }}
    >
      خروج
    </button>
  );
}
