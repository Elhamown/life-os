import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  createSecretValues,
  assertOutsideRepository,
} from "../scripts/setup-owner-secrets.mjs";
import { passwordMatches } from "../app/lib/private/crypto";

test("private output rejects a home directory within the repository before generation", () => {
  assert.doesNotThrow(() =>
    assertOutsideRepository(
      "/Users/test-owner",
      "/Users/test-owner/Projects/life-os",
    ),
  );
  assert.throws(
    () => assertOutsideRepository("/Users/test-owner", "/Users/test-owner"),
    /OUTPUT_IN_REPOSITORY/,
  );
  assert.throws(
    () =>
      assertOutsideRepository("/Users/test-owner/private", "/Users/test-owner"),
    /OUTPUT_IN_REPOSITORY/,
  );
  assert.doesNotThrow(() =>
    assertOutsideRepository("/Users/test-owner-other", "/Users/test-owner"),
  );
});

test("offline setup matches production scrypt verification and exact encodings using synthetic entropy only", async () => {
  let calls = 0;
  const values = createSecretValues(
    "synthetic-test-password-only",
    (size: number) => {
      assert.equal(size, 32);
      return Buffer.alloc(size, ++calls);
    },
  );
  assert.equal(calls, 3);
  assert.match(
    values.MADAR_OWNER_PASSWORD_HASH,
    /^scrypt\$32768\$8\$1\$[a-f\d]{64}\$[a-f\d]{128}$/,
  );
  assert.match(values.MADAR_SESSION_SECRET, /^[a-f\d]{64}$/);
  assert.match(values.MADAR_STORE_ENCRYPTION_KEY, /^[a-f\d]{64}$/);
  assert.notEqual(
    values.MADAR_SESSION_SECRET,
    values.MADAR_STORE_ENCRYPTION_KEY,
  );
  assert.equal(
    await passwordMatches(
      "synthetic-test-password-only",
      values.MADAR_OWNER_PASSWORD_HASH,
    ),
    true,
  );
  assert.equal(
    await passwordMatches(
      "incorrect-test-password",
      values.MADAR_OWNER_PASSWORD_HASH,
    ),
    false,
  );
});

test("setup rejects short and oversized passwords before requesting randomness", () => {
  for (const value of ["short", "a".repeat(129)])
    assert.throws(
      () =>
        createSecretValues(value, () => {
          throw new Error("Randomness must not be requested");
        }),
      /PASSWORD_POLICY/,
    );
});

test("CLI refuses noninteractive input without generating or displaying values", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/setup-owner-secrets.mjs"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Setup stopped/);
  assert.doesNotMatch(result.stderr, /scrypt\$/);
});
