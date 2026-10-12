import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isPasswordlessProtectedPreview } from "../lib/private/protected-preview";
import type { Metadata } from "next";
import Login from "./login";
export const metadata: Metadata = {
  title: "دخول مدار الخاص",
  robots: { index: false, follow: false },
};
export default async function Page() {
  if (isPasswordlessProtectedPreview((await headers()).get("host"))) redirect("/");
  return <Login />;
}
