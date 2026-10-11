import type { Metadata } from "next";
import Discovery from "./discovery";
export const metadata: Metadata = {
  title: "اكتشاف Notion الخاص | مدار",
  robots: { index: false, follow: false },
};
export default function DiscoveryPage() {
  return <Discovery />;
}
