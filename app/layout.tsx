import type { Metadata } from "next";
import "@fontsource/tajawal/arabic-400.css";
import "@fontsource/tajawal/arabic-500.css";
import "@fontsource/tajawal/arabic-700.css";
import "./globals.css";
import localFont from "next/font/local";
import "./premium.css";
const neoArabic = localFont({
  src: [
    { path: "./fonts/NeoSansArabic-Light.ttf", weight: "300", style: "normal" },
    { path: "./fonts/NeoSansArabic-Bold.ttf", weight: "700", style: "normal" },
    { path: "./fonts/NeoSansArabic-Black.ttf", weight: "900", style: "normal" },
  ],
  variable: "--font-neo-arabic",
  display: "swap",
  adjustFontFallback: false,
  fallback: ["Tajawal", "Tahoma", "Arial"],
});
// The supplied Medium file is Latin-only. Never label it as Arabic Medium.
const neoLatin = localFont({
  src: "./fonts/Neo_Sans_Medium.ttf",
  weight: "500",
  variable: "--font-neo-latin",
  display: "swap",
  preload: false,
});
import OwnerSessionGuard from "./components/owner-session-guard";
export const metadata: Metadata = {
  title: "مدار | نظام حياتك",
  description: "مساحة عربية لتنظيم يومك ومشاريعك وحياتك",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${neoArabic.variable} ${neoLatin.variable}`}
      suppressHydrationWarning
    >
      <head>
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
