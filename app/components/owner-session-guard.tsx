"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function OwnerSessionGuard() {
  const path = usePathname();
  useEffect(() => {
    if (!["/", "/discovery", "/sync"].includes(path)) return;
    if (path === "/" && window.location.hostname === "life-os-git-feature-single-owner-boundaries-elhamown.vercel.app") return;
    let live = true,
      checking = false;
    let pending: AbortController | null = null;
    const leave = () =>
      window.location.replace(`/login?next=${encodeURIComponent(path)}`);
    async function check() {
      if (!live || checking) return;
      checking = true;
      const controller = new AbortController();
      pending = controller;
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch("/api/private/session", {
          cache: "no-store",
          signal: controller.signal,
        });
        const session = await response.json();
        if (live && (!response.ok || session.authenticated !== true)) leave();
      } catch {
        if (live) leave();
      } finally {
        clearTimeout(timeout);
        checking = false;
      }
    }
    const visible = () => {
      if (document.visibilityState !== "hidden") void check();
    };
    void check();
    const timer = setInterval(visible, 60000);
    window.addEventListener("focus", visible);
    window.addEventListener("pageshow", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      live = false;
      pending?.abort();
      clearInterval(timer);
      window.removeEventListener("focus", visible);
      window.removeEventListener("pageshow", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [path]);
  return null;
}
