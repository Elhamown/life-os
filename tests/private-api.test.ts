import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes, scryptSync } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { SqlStore, type QueryExecutor } from "../app/lib/private/store";
import { getConfig, type PrivateConfig } from "../app/lib/private/config";
import {
  cookieName,
  digest,
  issueToken,
  verifyToken,
  seal,
  unseal,
} from "../app/lib/private/crypto";
import {
  notionApi,
  privateAuthApi,
  type PrivateContext,
} from "../app/lib/private/api";
import { mockNotion, id } from "./notion-fixtures";
const password = "fixture-private-password-not-a-real-secret";
const salt = Buffer.alloc(32, 5);
const hash = `scrypt$32768$8$1$${salt.toString("hex")}$${scryptSync(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString("hex")}`;
const config: PrivateConfig = {
  origin: "https://madar.example",
  passwordHash: hash,
  sessionSecret: "a".repeat(64),
  encryptionKey: "b".repeat(64),
  databaseUrl: "postgresql://fixture",
  notionToken: "fake-test-token",
  readOnlyAcknowledged: true,
  secureCookies: true,
};
async function fixture() {
  const db = new PGlite();
  await db.exec(
    await readFile(
      new URL("../scripts/private-store.sql", import.meta.url),
      "utf8",
    ),
  );
  const adapter: QueryExecutor = {
    async query<T extends Record<string, unknown>>(
      text: string,
      values: unknown[] = [],
    ) {
      return (await db.query<T>(text, values)).rows;
    },
  };
  const store = new SqlStore(adapter, config.encryptionKey);
  const mock = mockNotion();
  let builds = 0;
  const context: PrivateContext = {
    config,
    store,
    notion: () => {
      builds++;
      return mock.client;
    },
  };
  return {
    db,
    adapter,
    store,
    context,
    mock,
    get builds() {
      return builds;
    },
  };
}
function req(
  path: string,
  body?: object,
  cookie?: string,
  origin = config.origin,
) {
  return new Request(config.origin + path, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json", Origin: origin } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
async function login(context: PrivateContext) {
  const result = await privateAuthApi(
    req("/api/private/login", { password }),
    "login",
    context,
  );
  assert.equal(result.status, 200);
  return result.headers.get("set-cookie")!.split(";")[0];
}
test("configuration is fail-closed without private secrets or with an insecure public origin", () => {
  assert.throws(() => getConfig({}), /PRIVATE_SETUP_REQUIRED/);
  const env = {
    MADAR_APP_ORIGIN: "http://public.example",
    MADAR_OWNER_PASSWORD_HASH: hash,
    MADAR_SESSION_SECRET: config.sessionSecret,
    MADAR_STORE_ENCRYPTION_KEY: config.encryptionKey,
    DATABASE_URL: config.databaseUrl,
  };
  assert.throws(() => getConfig(env), /PRIVATE_SETUP_REQUIRED/);
  assert.equal(
    getConfig({ ...env, MADAR_APP_ORIGIN: config.origin }).notionToken,
    null,
  );
});
test("signed sessions reject expired, tampered and cross-origin issuer tokens", async () => {
  const sessionId = randomBytes(32).toString("hex");
  const token = await issueToken(config, sessionId);
  assert.equal(await verifyToken(config, token), sessionId);
  assert.equal(await verifyToken(config, token + "tampered"), null);
  assert.equal(
    await verifyToken({ ...config, origin: "https://other.example" }, token),
    null,
  );
  assert.equal(
    await verifyToken(
      config,
      await issueToken(config, sessionId, Date.now() - 1900000),
    ),
    null,
  );
});
test("store encryption hides metadata and detects tampering", () => {
  const data = { title: "sensitive-test-metadata" };
  const ciphertext = seal(data, config.encryptionKey);
  assert.ok(!ciphertext.includes(data.title));
  assert.deepEqual(unseal(ciphertext, config.encryptionKey), data);
  assert.throws(() => unseal(ciphertext, "c".repeat(64)));
});
test("every private Notion operation rejects unauthenticated requests before constructing SDK", async () => {
  const f = await fixture();
  try {
    for (const [action, body] of [
      ["report", undefined],
      ["audit", undefined],
      ["status", undefined],
      ["start", { acknowledged: true }],
      ["step", { reportId: "fake", revision: 0 }],
      ["mappings", { approved: true, mappings: [] }],
    ] as const) {
      const result = await notionApi(
        req("/api/notion/" + action, body),
        action,
        f.context,
      );
      assert.equal(result.status, 401);
      assert.equal(
        result.headers.get("cache-control"),
        "private, no-store, max-age=0",
      );
    }
    assert.equal(f.builds, 0);
    assert.equal(f.mock.calls.length, 0);
    const logs = await f.store.logs();
    assert.equal(logs.filter((l) => l.event === "access_denied").length, 6);
    assert.ok(!JSON.stringify(logs).includes(config.notionToken!));
  } finally {
    await f.db.close();
  }
});
test("private login uses secure cookies, origin checks, bounded attempts and persistent sessions", async () => {
  const f = await fixture();
  try {
    let result = await privateAuthApi(
      req(
        "/api/private/login",
        { password },
        undefined,
        "https://evil.example",
      ),
      "login",
      f.context,
    );
    assert.equal(result.status, 403);
    const cookie = await login(f.context);
    assert.ok(cookie.startsWith("__Host-madar-private="));
    result = await privateAuthApi(
      req("/api/private/login", { password }),
      "login",
      f.context,
    );
    const setCookie = result.headers.get("set-cookie")!;
    for (const attribute of [
      "HttpOnly",
      "Secure",
      "SameSite=Strict",
      "Path=/",
      "Max-Age=1800",
    ])
      assert.ok(setCookie.includes(attribute));
    assert.ok(!setCookie.includes("Domain="));
    const session = await privateAuthApi(
      req("/api/private/session", undefined, cookie),
      "session",
      f.context,
    );
    assert.equal((await session.json()).authenticated, true);
    const raw = await f.adapter.query(
      "SELECT id_hash FROM madar_private_sessions",
    );
    assert.ok(
      raw.every(
        (row) =>
          String(row.id_hash).length === 64 &&
          !cookie.includes(String(row.id_hash)),
      ),
    );
    for (let i = 0; i < 3; i++)
      assert.equal(
        (
          await privateAuthApi(
            req("/api/private/login", { password: "wrong" }),
            "login",
            f.context,
          )
        ).status,
        401,
      );
    assert.equal(
      (
        await privateAuthApi(
          req("/api/private/login", { password }),
          "login",
          f.context,
        )
      ).status,
      429,
    );
  } finally {
    await f.db.close();
  }
});
test("logout revokes the server-side session and later Notion access is denied", async () => {
  const f = await fixture();
  try {
    const cookie = await login(f.context);
    assert.equal(
      (
        await notionApi(
          req("/api/notion/status", undefined, cookie),
          "status",
          f.context,
        )
      ).status,
      200,
    );
    const out = await privateAuthApi(
      req("/api/private/logout", {}, cookie),
      "logout",
      f.context,
    );
    assert.equal(out.status, 200);
    assert.match(out.headers.get("set-cookie")!, /Max-Age=0/);
    assert.equal(
      (
        await notionApi(
          req("/api/notion/report", undefined, cookie),
          "report",
          f.context,
        )
      ).status,
      401,
    );
    assert.equal(f.builds, 0);
  } finally {
    await f.db.close();
  }
});
test("authenticated scan requires approval and refuses cross-origin requests", async () => {
  const f = await fixture();
  try {
    const cookie = await login(f.context);
    assert.equal(
      (
        await notionApi(
          req("/api/notion/start", {}, cookie),
          "start",
          f.context,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await notionApi(
          req(
            "/api/notion/start",
            { acknowledged: true },
            cookie,
            "https://evil.example",
          ),
          "start",
          f.context,
        )
      ).status,
      403,
    );
    assert.equal(f.builds, 0);
    assert.equal(f.mock.calls.length, 0);
    const noToken = { ...f.context, config: { ...config, notionToken: null } };
    assert.equal(
      (
        await notionApi(
          req("/api/notion/start", { acknowledged: true }, cookie),
          "start",
          noToken,
        )
      ).status,
      503,
    );
    assert.equal(f.builds, 0);
  } finally {
    await f.db.close();
  }
});
test("resumable discovery and approved mappings persist encrypted, without issuing Notion writes", async () => {
  const f = await fixture();
  try {
    const cookie = await login(f.context);
    let result = await notionApi(
      req("/api/notion/start", { acknowledged: true }, cookie),
      "start",
      f.context,
    );
    assert.equal(result.status, 200);
    let report = (await result.json()).report;
    while (report.status === "running") {
      result = await notionApi(
        req(
          "/api/notion/step",
          { reportId: report.id, revision: report.revision },
          cookie,
        ),
        "step",
        f.context,
      );
      assert.equal(result.status, 200);
      report = (await result.json()).report;
    }
    const upstreamBefore = f.mock.calls.length;
    result = await notionApi(
      req(
        "/api/notion/mappings",
        {
          reportId: report.id,
          revision: report.revision,
          approved: true,
          mappings: [
            { sourceId: id(1), area: "ministry", aiIngestion: true },
            { sourceId: id(2), area: "health" },
          ],
        },
        cookie,
      ),
      "mappings",
      f.context,
    );
    assert.equal(result.status, 200);
    assert.equal(f.mock.calls.length, upstreamBefore);
    const saved = (await result.json()).mappings;
    assert.ok(
      saved.every((m: { aiIngestion: boolean }) => m.aiIngestion === false),
    );
    const freshStore = new SqlStore(f.adapter, config.encryptionKey);
    assert.deepEqual(await freshStore.get("mappings"), saved);
    const raw = await f.adapter.query<{ ciphertext: string }>(
      "SELECT ciphertext FROM madar_private_state",
    );
    assert.ok(
      raw.every(
        (row) =>
          !row.ciphertext.includes("مكتبة") && !row.ciphertext.includes(id(1)),
      ),
    );
    const logs = await f.store.logs();
    assert.ok(
      logs.some((l) => l.event === "mappings_save" && l.outcome === "ok"),
    );
    assert.ok(!JSON.stringify(logs).includes(id(1)));
    result = await notionApi(
      req(
        "/api/notion/mappings",
        { reportId: report.id, revision: 0, approved: true, mappings: [] },
        cookie,
      ),
      "mappings",
      f.context,
    );
    assert.equal(result.status, 409);
  } finally {
    await f.db.close();
  }
});
test("distributed lease blocks concurrent scan/mapping and ownership protects release", async () => {
  const f = await fixture();
  try {
    assert.equal(await f.store.lease("notion-workflow", "one"), true);
    assert.equal(await f.store.lease("notion-workflow", "two"), false);
    await f.store.release("notion-workflow", "wrong");
    assert.equal(await f.store.lease("notion-workflow", "two"), false);
    const cookie = await login(f.context);
    assert.equal(
      (
        await notionApi(
          req("/api/notion/start", { acknowledged: true }, cookie),
          "start",
          f.context,
        )
      ).status,
      409,
    );
    assert.equal(f.builds, 0);
    await f.store.release("notion-workflow", "one");
    assert.equal(await f.store.lease("notion-workflow", "two"), true);
  } finally {
    await f.db.close();
  }
});
test("audit-store failure prevents any upstream Notion request", async () => {
  const f = await fixture();
  try {
    const cookie = await login(f.context);
    f.store.audit = async () => {
      throw Error("PRIVATE_DATABASE_CONNECTION_STRING");
    };
    const result = await notionApi(
      req("/api/notion/start", { acknowledged: true }, cookie),
      "start",
      f.context,
    );
    assert.equal(result.status, 503);
    assert.equal(f.builds, 0);
    assert.ok(!(await result.text()).includes("CONNECTION_STRING"));
  } finally {
    await f.db.close();
  }
});
test("mapping data and successful audit entry commit atomically", async () => {
  const f = await fixture();
  try {
    await f.store.putAudited(
      "test",
      { private: "fixture" },
      "mappings_save",
      1,
    );
    assert.deepEqual(await f.store.get("test"), { private: "fixture" });
    assert.equal((await f.store.logs()).length, 1);
    await assert.rejects(() =>
      f.store.putAudited(
        "never-committed",
        { private: "fixture" },
        "not_a_valid_event" as "mappings_save",
        1,
      ),
    );
    assert.equal(await f.store.get("never-committed"), null);
  } finally {
    await f.db.close();
  }
});
test("malformed payloads, oversized input and unsupported methods fail safely", async () => {
  const f = await fixture();
  try {
    const cookie = await login(f.context);
    const oversized = new Request(config.origin + "/api/notion/mappings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: config.origin,
        Cookie: cookie,
      },
      body: JSON.stringify({ payload: "x".repeat(70000) }),
    });
    assert.equal(
      (await notionApi(oversized, "mappings", f.context)).status,
      413,
    );
    const unsupported = new Request(config.origin + "/api/notion/report", {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    assert.equal(
      (await notionApi(unsupported, "report", f.context)).status,
      405,
    );
    assert.equal(f.builds, 0);
  } finally {
    await f.db.close();
  }
});
test("expired persisted session cannot bypass authorization even with a valid signature", async () => {
  const f = await fixture();
  try {
    const value = randomBytes(32).toString("hex");
    await f.store.createSession(
      digest(value),
      new Date(Date.now() - 1000).toISOString(),
    );
    const token = await issueToken(config, value);
    const cookie = `${cookieName(config)}=${token}`;
    assert.equal(
      (
        await notionApi(
          req("/api/notion/report", undefined, cookie),
          "report",
          f.context,
        )
      ).status,
      401,
    );
    assert.equal(f.builds, 0);
  } finally {
    await f.db.close();
  }
});

test("encrypted records cannot be swapped between report and mapping slots", async () => {
  const f = await fixture();
  try {
    await f.store.put("discovery", { title: "private report fixture" });
    const raw = await f.adapter.query<{ ciphertext: string }>(
      "SELECT ciphertext FROM madar_private_state WHERE name=$1",
      ["discovery"],
    );
    await f.adapter.query(
      "INSERT INTO madar_private_state(name,ciphertext) VALUES($1,$2)",
      ["mappings", raw[0].ciphertext],
    );
    await assert.rejects(() => f.store.get("mappings"));
  } finally {
    await f.db.close();
  }
});

test("lease fencing prevents an expired worker from overwriting report or mappings", async () => {
  const f = await fixture();
  try {
    await f.store.lease("notion-workflow", "old");
    assert.equal(
      await f.store.putUnderLease("discovery", { revision: 1 }, "old"),
      true,
    );
    await f.adapter.query(
      "UPDATE madar_private_leases SET expires_at=NOW()-INTERVAL '1 second' WHERE name=$1",
      ["notion-workflow"],
    );
    await f.store.lease("notion-workflow", "new");
    assert.equal(
      await f.store.putUnderLease("discovery", { revision: 2 }, "old"),
      false,
    );
    await assert.rejects(
      () => f.store.putAudited("mappings", [], "mappings_save", 0, "old"),
      /WORKFLOW_BUSY/,
    );
    assert.deepEqual(await f.store.get("discovery"), { revision: 1 });
    assert.equal(await f.store.get("mappings"), null);
    assert.equal(
      await f.store.putUnderLease("discovery", { revision: 3 }, "new"),
      true,
    );
  } finally {
    await f.db.close();
  }
});
