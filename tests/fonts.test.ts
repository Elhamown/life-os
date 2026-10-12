import { test } from "node:test";
import assert from "node:assert/strict";
import { checkLicensedFonts } from "../scripts/check-fonts.mjs";
test("missing licensed fonts cannot be activated; default fallback requires no font assets", async () => {
  const root = new URL("file:///tmp/madar-licensed-fonts-not-provisioned/");
  await checkLicensedFonts(false, root);
  await assert.rejects(
    () => checkLicensedFonts(true, root),
    /files are missing/,
  );
});
