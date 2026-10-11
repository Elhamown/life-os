import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  reducer,
  demoDate,
  spaces,
  domains,
} from "../app/lib/model.ts";
test("all eight original spaces belong to one of three domains", () => {
  assert.equal(spaces.length, 8);
  assert.equal(new Set(spaces.map((s) => s.id)).size, 8);
  assert.equal(domains.length, 3);
  for (const s of spaces) assert.ok(domains.some((d) => d.id === s.domain));
});
test("capture trims content and rejects whitespace and duplicate identifiers", () => {
  const action = {
    type: "capture",
    id: "capture1",
    title: "  فكرة جديدة  ",
    spaceId: "life",
    kind: "note",
  } as const;
  const next = reducer(initialState, action);
  assert.equal(next.notes.at(-1)?.title, "فكرة جديدة");
  assert.strictEqual(reducer(next, action), next);
  assert.strictEqual(
    reducer(initialState, { ...action, title: "   " }),
    initialState,
  );
});
test("converting a note moves its identity instead of duplicating it", () => {
  const next = reducer(initialState, { type: "convert", id: "n1" });
  assert.ok(!next.notes.some((n) => n.id === "n1"));
  assert.equal(next.tasks.filter((t) => t.id === "n1").length, 1);
  assert.strictEqual(reducer(next, { type: "convert", id: "n1" }), next);
});
test("approving a proposal adds exactly one task and repeated approvals do nothing", () => {
  const next = reducer(initialState, {
    type: "decide",
    id: "p1",
    decision: "approved",
  });
  assert.equal(next.tasks.length, initialState.tasks.length + 1);
  assert.equal(next.proposals[0].status, "approved");
  assert.strictEqual(
    reducer(next, { type: "decide", id: "p1", decision: "approved" }),
    next,
  );
});
test("rejection leaves task data unchanged and cannot later be approved", () => {
  const next = reducer(initialState, {
    type: "decide",
    id: "p1",
    decision: "rejected",
  });
  assert.strictEqual(next.tasks, initialState.tasks);
  assert.strictEqual(
    reducer(next, { type: "decide", id: "p1", decision: "approved" }),
    next,
  );
});
test("approval uses the edited title, space and date", () => {
  const edited = reducer(initialState, {
    type: "editProposal",
    id: "p1",
    title: "خطة معدّلة",
    spaceId: "life",
    date: "2026-10-12",
  });
  const next = reducer(edited, {
    type: "decide",
    id: "p1",
    decision: "approved",
  });
  assert.deepEqual(next.tasks.at(-1), {
    id: "proposal-p1",
    title: "خطة معدّلة",
    spaceId: "life",
    date: "2026-10-12",
    priority: false,
    done: false,
  });
});
test("reschedule updates existing task and removes overdue classification", () => {
  const next = reducer(initialState, { type: "reschedule", id: "t5" });
  assert.equal(next.tasks.length, initialState.tasks.length);
  assert.equal(next.tasks.find((t) => t.id === "t5")?.date, demoDate);
  assert.equal(
    next.tasks.filter((t) => !t.done && t.date < demoDate).length,
    0,
  );
});
test("completion updates the shared task without changing its identity", () => {
  const next = reducer(initialState, { type: "toggle", id: "t1" });
  assert.equal(next.tasks.find((t) => t.id === "t1")?.done, true);
  assert.equal(next.tasks.length, initialState.tasks.length);
  assert.equal(initialState.tasks[0].done, false);
});
