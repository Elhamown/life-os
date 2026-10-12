import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
export async function checkLicensedFonts(
  enabled,
  root = new URL("../public/fonts/neo-sans-arabic/", import.meta.url),
) {
  if (!enabled) return;
  for (const name of ["regular", "medium", "bold"]) {
    let bytes;
    try {
      bytes = await readFile(new URL(`${name}.woff2`, root));
    } catch {
      throw Error(
        "Neo Sans Arabic enabled but licensed WOFF2 files are missing. See docs/single-owner.md.",
      );
    }
    if (bytes.length < 48 || bytes.toString("ascii", 0, 4) !== "wOF2")
      throw Error(
        "Neo Sans Arabic files must be genuine licensed WOFF2 fonts.",
      );
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  nextEnv.loadEnvConfig(process.cwd(), false);
  await checkLicensedFonts(process.env.MADAR_NEO_SANS_ENABLED === "1");
  console.log(
    process.env.MADAR_NEO_SANS_ENABLED === "1"
      ? "Local WOFF2 headers validated; web embedding license must be confirmed separately."
      : "Neo Sans disabled; bundled Tajawal fallback is active.",
  );
}
