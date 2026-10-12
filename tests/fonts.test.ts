import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkLicensedFonts, inspectFont } from "../scripts/check-fonts.mjs";
test("supplied fonts preserve original hashes, weights, Arabic letters, diacritics and digits", async () => {
  await checkLicensedFonts();
});
test("Latin Medium cannot masquerade as Arabic Medium", async () => {
  const font = inspectFont(
    await readFile(
      new URL("../app/fonts/Neo_Sans_Medium.ttf", import.meta.url),
    ),
  );
  assert.equal(font.weight, 500);
  assert.equal(font.covered.has(0x627), false);
});
test("missing or truncated fonts fail closed", async () => {
  await assert.rejects(() =>
    checkLicensedFonts(new URL("file:///tmp/madar-missing-fonts/")),
  );
  assert.throws(() => inspectFont(Buffer.alloc(4)), /Invalid/);
});
