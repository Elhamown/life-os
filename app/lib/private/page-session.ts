import { isPasswordlessProtectedPreview } from "./protected-preview";
import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requirePrivateSession } from "./api";
import { productionContext } from "./context";
export async function requirePageSession(path: "/" | "/discovery" | "/sync") {
  const requestHeaders = await headers();
  if (path === "/" && isPasswordlessProtectedPreview(requestHeaders.get("host"))) return;
  let authenticated = false;
  try {
    const context = productionContext();
    await requirePrivateSession(
      new Request(`${context.config.origin}${path}`, {
        headers: requestHeaders,
      }),
      context,
    );
    authenticated = true;
  } catch {
    /* fail closed, no raw store/secret errors exposed */
  }
  if (!authenticated) redirect(`/login?next=${encodeURIComponent(path)}`);
}
