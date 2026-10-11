import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'مدار | نظام حياتك', description: 'مساحة عربية لتنظيم يومك ومشاريعك وحياتك' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ar" dir="rtl"><body>{children}</body></html>; }
