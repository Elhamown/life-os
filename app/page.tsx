import Dashboard from "./dashboard";
import { requirePageSession } from "./lib/private/page-session";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requirePageSession("/");
  return <Dashboard />;
}
