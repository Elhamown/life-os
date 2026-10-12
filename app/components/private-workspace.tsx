"use client";
import Link from "next/link";
import { Orbit, Plus } from "lucide-react";
import { WorkspaceNavigation } from "./workspace-navigation";
import ThemeToggle from "./theme-toggle";
import SiteLogout from "./site-logout";
export default function PrivateWorkspace({
  current,
  children,
}: {
  current: "discovery" | "sync";
  children: React.ReactNode;
}) {
  return (
    <div className="shell private-workspace">
      <aside className="sidebar">
        <Link className="brand" href="/" prefetch={false}>
          <span className="brand-mark">
            <Orbit size={24} />
          </span>
          <span>
            مدار<small>MADAR · LIFE OS</small>
          </span>
        </Link>
        <p className="sidebar-caption">حياتك، بوضوح.</p>
        <WorkspaceNavigation current={current} />
        <Link
          className="button primary capture-sidebar"
          href="/?capture=1"
          prefetch={false}
        >
          <Plus size={18} />
          التقاط سريع
        </Link>
        <div className="sidebar-bottom">
          <span className="status-dot" />
          مساحة المالك الخاصة
          <p>كل عملية تحتاج نطاقًا وموافقة. لا تفعيل تلقائي.</p>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            مساحتي /{" "}
            <strong>
              {current === "sync" ? "مركز المزامنة" : "اكتشاف Notion"}
            </strong>
          </div>
          <div className="header-actions">
            <ThemeToggle />
            <SiteLogout />
          </div>
        </header>
        {children}
      </div>
      <WorkspaceNavigation current={current} mobile />
    </div>
  );
}
