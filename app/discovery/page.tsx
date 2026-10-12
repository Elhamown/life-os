import PrivateWorkspace from "../components/private-workspace";
import type { Metadata } from "next";
import Discovery from "./discovery";
import { requirePageSession } from "../lib/private/page-session";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "اكتشاف Notion الخاص | مدار",
  robots: { index: false, follow: false },
};
export default async function DiscoveryPage() {
  await requirePageSession("/discovery");
  return (
    <PrivateWorkspace current="discovery">
      <Discovery />
    </PrivateWorkspace>
  );
}
