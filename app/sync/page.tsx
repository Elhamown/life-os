import PrivateWorkspace from "../components/private-workspace";
import type { Metadata } from "next";
import Sync from "./sync";
import { requirePageSession } from "../lib/private/page-session";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "مزامنة Notion المحكومة | مدار",
  robots: { index: false, follow: false },
};
export default async function Page() {
  await requirePageSession("/sync");
  return (
    <PrivateWorkspace current="sync">
      <Sync />
    </PrivateWorkspace>
  );
}
