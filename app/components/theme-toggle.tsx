"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
const subscribe = (notify: () => void) => {
  window.addEventListener("madar-theme", notify);
  return () => window.removeEventListener("madar-theme", notify);
};
const getSnapshot = () =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";
export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => "light");
  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("madar-theme", next);
    } catch {
      /* Works without storage. */
    }
    window.dispatchEvent(new Event("madar-theme"));
  }
  return (
    <button
      className="icon-button"
      onClick={toggle}
      aria-label={
        theme === "light" ? "تفعيل الوضع الداكن" : "تفعيل الوضع الفاتح"
      }
    >
      {theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
    </button>
  );
}
