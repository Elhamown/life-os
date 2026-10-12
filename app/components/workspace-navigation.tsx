"use client";
import Link from "next/link";
import { useState } from "react";
import {
  Sun,
  Layers,
  CalendarDays,
  Sparkles,
  ScanSearch,
  RefreshCw,
  Settings,
  MoreHorizontal,
} from "lucide-react";
export type WorkspaceView =
  | "today"
  | "spaces"
  | "calendar"
  | "assistant"
  | "settings";
export const navigation = [
  { id: "today", label: "اليوم", icon: Sun },
  { id: "spaces", label: "المساحات", icon: Layers },
  { id: "calendar", label: "التقويم", icon: CalendarDays },
  { id: "assistant", label: "المساعد", icon: Sparkles },
  { id: "discovery", label: "اكتشاف Notion", icon: ScanSearch },
  { id: "sync", label: "مركز المزامنة", icon: RefreshCw },
  { id: "settings", label: "الإعدادات", icon: Settings },
] as const;
export function WorkspaceNavigation({
  current,
  onNavigate,
  mobile = false,
}: {
  current: string;
  onNavigate?: (view: WorkspaceView) => void;
  mobile?: boolean;
}) {
  const [more, setMore] = useState(false);
  function item(n: (typeof navigation)[number]) {
    const content = (
      <>
        <n.icon size={20} />
        <span>{n.label}</span>
      </>
    );
    const active = current === n.id;
    if (onNavigate && n.id !== "discovery" && n.id !== "sync")
      return (
        <button
          key={n.id}
          className={`nav-link ${active ? "active" : ""}`}
          aria-current={active ? "page" : undefined}
          onClick={() => {
            onNavigate(n.id as WorkspaceView);
            setMore(false);
          }}
        >
          {content}
        </button>
      );
    return (
      <Link
        key={n.id}
        prefetch={false}
        className={`nav-link ${active ? "active" : ""}`}
        aria-current={active ? "page" : undefined}
        href={
          n.id === "discovery" || n.id === "sync"
            ? `/${n.id}`
            : `/?view=${n.id}`
        }
      >
        {content}
      </Link>
    );
  }
  return (
    <nav
      className={mobile ? "mobile-nav" : "workspace-nav"}
      aria-label={mobile ? "التنقل على الجوال" : "التنقل الرئيسي"}
    >
      {(mobile ? navigation.slice(0, 4) : navigation).map(item)}
      {mobile && (
        <>
          <button
            className="nav-link"
            aria-label="المزيد من الأقسام"
            aria-expanded={more}
            onClick={() => setMore(!more)}
          >
            <MoreHorizontal size={20} />
            <span>المزيد</span>
          </button>
          {more && (
            <div className="mobile-more">
              {navigation.slice(4).map(item)}
              <button onClick={() => setMore(false)}>إغلاق</button>
            </div>
          )}
        </>
      )}
    </nav>
  );
}
