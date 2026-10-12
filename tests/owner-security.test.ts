import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";
import { assertOrigin, type PrivateConfig } from "../app/lib/private/config";
import {
  digest,
  issueToken,
  verifyToken,
  seal,
  unseal,
} from "../app/lib/private/crypto";
import { spaceAccess, isSpace } from "../app/lib/access-policy";
import { allowedArea } from "../app/lib/ai/model";
import { withSync } from "../app/lib/sync/api";
import { syncFixture } from "./sync-fixtures";
import { privateAuthApi } from "../app/lib/private/api";

const config: PrivateConfig = {
  origin: "https://madar.example",
  passwordHash: "fixture-owner-credential",
  sessionSecret: "a".repeat(64),
  encryptionKey: "b".repeat(64),
  databaseUrl: "fixture",
  notionToken: null,
  readOnlyAcknowledged: false,
  secureCookies: true,
};
test("only the fixed owner identity and current credential version can authorize a session", async () => {
  const id = "d".repeat(64),
    token = await issueToken(config, id);
  assert.equal(await verifyToken(config, token), id);
  assert.equal(
    await verifyToken(
      { ...config, passwordHash: "rotated-owner-credential" },
      token,
    ),
    null,
  );
  for (const subject of ["member", "admin", "guest"]) {
    const forged = await new SignJWT({
      ownerVersion: digest(config.passwordHash),
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(subject)
      .setIssuer(config.origin)
      .setAudience("madar-private")
      .setJti(id)
      .setIssuedAt()
      .setExpirationTime("30m")
      .sign(new TextEncoder().encode(config.sessionSecret));
    assert.equal(await verifyToken(config, forged), null);
  }
  const old = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("owner")
    .setIssuer(config.origin)
    .setAudience("madar-private")
    .setJti(id)
    .setIssuedAt()
    .setExpirationTime("30m")
    .sign(new TextEncoder().encode(config.sessionSecret));
  assert.equal(await verifyToken(config, old), null);
});
test("CSRF denies missing/foreign/null origins and same-site subdomain fetches", () => {
  for (const origin of [
    undefined,
    "null",
    "https://evil.example",
    "https://madar.example.evil",
  ])
    assert.throws(() =>
      assertOrigin(
        new Request(config.origin, {
          method: "POST",
          headers: origin ? { Origin: origin } : {},
        }),
        config,
      ),
    );
  for (const site of ["cross-site", "same-site", "invalid"])
    assert.throws(() =>
      assertOrigin(
        new Request(config.origin, {
          method: "POST",
          headers: { Origin: config.origin, "Sec-Fetch-Site": site },
        }),
        config,
      ),
    );
  assert.doesNotThrow(() =>
    assertOrigin(
      new Request(config.origin, {
        method: "POST",
        headers: { Origin: config.origin, "Sec-Fetch-Site": "same-origin" },
      }),
      config,
    ),
  );
});
test("public signup, invitations, teams and account selectors cannot execute", async () => {
  const f = await syncFixture();
  for (const action of [
    "signup",
    "register",
    "invite",
    "team",
    "users",
    "reset-password",
  ]) {
    const response = await privateAuthApi(
      new Request(`${config.origin}/api/private/${action}`, {
        method: "POST",
        headers: { Origin: config.origin },
        body: "{}",
      }),
      action,
      f.context,
    );
    assert.equal(response.status, 405);
  }
  const login = await privateAuthApi(
    new Request(`${config.origin}/api/private/login`, {
      method: "POST",
      headers: { Origin: config.origin, "Content-Type": "application/json" },
      body: JSON.stringify({
        password: "fake",
        userId: "another-account",
        role: "admin",
      }),
    }),
    "login",
    f.context,
  );
  assert.equal(login.status, 400);
  assert.equal(f.requests.length, 0);
});
test("compartments are fixed and Ministry/health can never become external AI destinations", () => {
  const ciphertext = seal(
    { title: "synthetic isolated note" },
    config.encryptionKey,
    "ai-context:stardust",
  );
  assert.throws(() =>
    unseal(ciphertext, config.encryptionKey, "ai-context:studio"),
  );
  assert.throws(() =>
    unseal(ciphertext, config.encryptionKey, "ai-context:life"),
  );
  assert.deepEqual(
    [
      spaceAccess.ministry.compartment,
      spaceAccess.stardust.compartment,
      spaceAccess.studio.compartment,
      spaceAccess.life.compartment,
    ],
    ["ministry", "stardust", "studio", "personal"],
  );
  for (const area of [
    "ministry",
    "health",
    "__proto__",
    "constructor",
    "team",
    "../life",
  ]) {
    assert.equal(allowedArea(area), false);
  }
  assert.equal(isSpace("__proto__"), false);
});
test("production sync factory disables all write grants but permits read-only recovery when writes are off", async () => {
  const f = await syncFixture();
  await f.scope();
  const { action } = await f.prepare();
  const ledger =
    await f.store.get<import("../app/lib/sync/types").SyncLedger>("sync");
  const context = withSync(f.context, { ...f.context.sync, enabled: false });
  assert.throws(
    () => context.gateway(ledger!.scopes[0], action, true),
    /SYNC_SETUP_REQUIRED/,
  );
  assert.equal(
    typeof context.gateway(ledger!.scopes[0], action, false).query,
    "function",
  );
});
