import Dashboard from "./dashboard";
import { requirePageSession } from "./lib/private/page-session";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; capture?: string }>;
}) {
  await requirePageSession("/");
  const { view, capture } = await searchParams;
  const initialScreen =
    view === "spaces" ||
    view === "calendar" ||
    view === "assistant" ||
    view === "settings"
      ? view
      : "today";
  return (
    <Dashboard initialScreen={initialScreen} initialCapture={capture === "1"} />
  );
}
