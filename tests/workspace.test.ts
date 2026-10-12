import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { SqlStore, type QueryExecutor } from "../app/lib/private/store";
import { workspaceApi } from "../app/lib/workspace-api";
import { newWorkspace, validWorkspace } from "../app/lib/workspace-schema";
import { syncFixture } from "./sync-fixtures";
const sample = () => ({
  schemaVersion: 1 as const,
  state: {
    tasks: [
      {
        id: "task-1",
        title: "مهمة حقيقية للاختبار",
        spaceId: "life" as const,
        date: "2026-10-12",
        priority: false,
        done: false,
      },
    ],
    notes: [
      { id: "note-1", title: "ملاحظة للاختبار", spaceId: "life" as const },
    ],
    proposals: [],
    projects: [],
    events: [],
    preferences: { weekStarts: "monday" as const },
  },
});
test("workspace starts empty, validates schema, rejects duplicate IDs, invalid dates and secret fields", () => {
  assert.deepEqual(newWorkspace().state.tasks, []);
  assert.equal(validWorkspace(sample()), true);
  assert.equal(validWorkspace({ ...sample(), schemaVersion: 2 }), false);
  const data = sample();
  data.state.tasks.push({ ...data.state.tasks[0] });
  assert.equal(validWorkspace(data), false);
  const invalid = sample();
  invalid.state.tasks[0].date = "2026-02-30";
  assert.equal(validWorkspace(invalid), false);
  assert.equal(
    validWorkspace({
      ...sample(),
      state: { ...sample().state, token: "never-accept" },
    }),
    false,
  );
  assert.equal(
    validWorkspace({
      ...sample(),
      state: {
        ...sample().state,
        notes: [{ ...sample().state.notes[0], apiKey: "never-accept" }],
      },
    }),
    false,
  );
});
test("authenticated workspace API enforces origin, bounds, conflict checks and never constructs Notion", async () => {
  const f = await syncFixture(true);
  try {
    const req = (
      body?: unknown,
      cookie = f.cookie,
      origin = f.context.config.origin,
    ) =>
      new Request(f.context.config.origin + "/api/workspace", {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Cookie: cookie,
          Origin: origin,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    assert.equal(
      (await workspaceApi(req(undefined, ""), f.context)).status,
      401,
    );
    const blank = await workspaceApi(req(), f.context);
    assert.equal(blank.status, 200);
    assert.deepEqual((await blank.json()).workspace.state.tasks, []);
    const body = { revision: 0, workspace: sample() };
    assert.equal(
      (
        await workspaceApi(
          req(body, f.cookie, "https://evil.example"),
          f.context,
        )
      ).status,
      403,
    );
    assert.equal((await workspaceApi(req(body), f.context)).status, 200);
    assert.equal((await workspaceApi(req(body), f.context)).status, 409);
    const saved = await (await workspaceApi(req(), f.context)).json();
    assert.equal(saved.revision, 1);
    assert.deepEqual(saved.workspace, body.workspace);
    assert.equal(
      (
        await workspaceApi(
          req({ revision: 1, workspace: { ...sample(), schemaVersion: 2 } }),
          f.context,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await workspaceApi(
          req({ revision: 1, workspace: sample(), extra: "x" }),
          f.context,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await workspaceApi(
          req({ revision: 1, workspace: { padding: "x".repeat(70000) } }),
          f.context,
        )
      ).status,
      413,
    );
    assert.equal(f.requests.length, 0);
  } finally {
    await f.db?.close();
  }
});
test("encrypted workspace survives database restart, additive migration and simultaneous stale writers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "madar-workspace-"));
  let db = new PGlite(directory);
  const schema = await readFile(
    new URL("../scripts/private-store.sql", import.meta.url),
    "utf8",
  );
  const adapter: QueryExecutor = {
    async query<T extends Record<string, unknown>>(
      sql: string,
      values: unknown[] = [],
    ) {
      return (await db.query<T>(sql, values)).rows;
    },
  };
  try {
    await db.exec(schema);
    const store = new SqlStore(adapter, "b".repeat(64));
    assert.equal(await store.saveWorkspace(0, sample()), true);
    const raw = await db.query<{ ciphertext: string }>(
      "SELECT ciphertext FROM madar_workspace",
    );
    assert.ok(!raw.rows[0].ciphertext.includes("مهمة"));
    await db.close();
    db = new PGlite(directory);
    await db.exec(schema);
    const fresh = new SqlStore(adapter, "b".repeat(64));
    assert.deepEqual(await fresh.readWorkspace(), {
      revision: 1,
      data: sample(),
    });
    const a = sample(),
      b = sample();
    a.state.tasks[0].title = "النسخة الأولى";
    b.state.tasks[0].title = "النسخة الثانية";
    const results = await Promise.all([
      fresh.saveWorkspace(1, a),
      fresh.saveWorkspace(1, b),
    ]);
    assert.equal(results.filter(Boolean).length, 1);
    const saved = await fresh.readWorkspace();
    assert.equal(saved?.revision, 2);
    assert.deepEqual(saved?.data, results[0] ? a : b);
    await assert.rejects(() =>
      new SqlStore(adapter, "c".repeat(64)).readWorkspace(),
    );
  } finally {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("custom spaces, daily habits and measured goals persist in the validated workspace without changing AI scope", async () => {
  const { reducer, emptyState } = await import("../app/lib/model");
  const { allowedArea } = await import("../app/lib/ai/model");
  const customId = "custom-00000000-0000-4000-8000-000000000001";
  let state = reducer(emptyState, {
    type: "customSpace",
    space: { id: customId, title: "المالية" },
  });
  state = reducer(state, {
    type: "capture",
    id: "finance-task",
    title: "مراجعة الميزانية",
    spaceId: customId as import("../app/lib/model").SpaceId,
    kind: "task",
    date: "2026-10-12",
  });
  state = reducer(state, {
    type: "habit",
    habit: { id: "daily", title: "قراءة", spaceId: "reading", days: [] },
  });
  state = reducer(state, {
    type: "toggleHabit",
    id: "daily",
    date: "2026-10-12",
  });
  state = reducer(state, {
    type: "goal",
    goal: {
      id: "goal",
      title: "قراءة كتاب",
      spaceId: "reading",
      deadline: "2026-11-01",
      current: 2,
      target: 10,
    },
  });
  assert.equal(validWorkspace({ schemaVersion: 1, state }), true);
  assert.equal(state.habits?.[0].days.length, 1);
  assert.equal(state.goals?.[0].current, 2);
  assert.equal(allowedArea(customId), false);
  assert.equal(
    validWorkspace({ schemaVersion: 1, state: { ...state, customSpaces: [] } }),
    false,
  );
  state = reducer(state, { type: "deleteGoal", id: "goal" });
  assert.equal(state.goals?.length, 0);
  assert.equal(state.tasks.length, 1);
});
