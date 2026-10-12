import type { Metadata } from "next";
import "@fontsource/tajawal/arabic-400.css";
import "@fontsource/tajawal/arabic-500.css";
import "@fontsource/tajawal/arabic-700.css";
import "./globals.css";
import { neoSansCss } from "./lib/neo-sans";
import OwnerSessionGuard from "./components/owner-session-guard";
export const metadata: Metadata = {
  title: "مدار | نظام حياتك",
  description: "مساحة عربية لتنظيم يومك ومشاريعك وحياتك",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        {process.env.MADAR_NEO_SANS_ENABLED === "1" && (
          <style>{neoSansCss}</style>
        )}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('madar-theme');document.documentElement.dataset.theme=t==='dark'||t==='light'?t:matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch{}",
          }}
        />
      </head>
      <body>
        <OwnerSessionGuard />
        {children}
      </body>
    </html>
  );
}
