import type { Metadata } from "next";
import Login from "./login";
export const metadata: Metadata = {
  title: "دخول مدار الخاص",
  robots: { index: false, follow: false },
};
export default async function Page() {
  return <Login />;
}
