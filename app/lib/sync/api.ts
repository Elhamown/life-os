import "server-only";
import { randomUUID } from "node:crypto";
import { assertOrigin, readJson } from "../private/config";
import {
  requirePrivateSession,
  response,
  errorResponse,
  type PrivateContext,
} from "../private/api";
import { PrivateError } from "../private/errors";
import type { DiscoveryJob, Mapping } from "../notion/types";
import type { AiProposal } from "../ai/model";
import { allowedArea } from "../ai/model";
import { createSyncGateway, SyncRemoteError } from "./gateway";
import {
  fail,
  hash,
  matches,
  properties,
  projectPage,
  recordFields,
  same,
  schemaHash,
  stableValue,
  syncConfig,
  uuid,
  validateColumns,
} from "./validation";
import {
  emptyLedger,
  type RemotePage,
  type SourceScope,
  type SyncAction,
  type SyncConfig,
  type SyncGateway,
  type SyncLedger,
} from "./types";
export type SyncContext = PrivateContext & {
  sync: SyncConfig;
  gateway: (
    scope: SourceScope,
    action: Pick<SyncAction, "recordId" | "pageId" | "payload" | "operation">,
    approved: boolean,
  ) => SyncGateway;
};
export function withSync(context: PrivateContext): SyncContext {
  const sync = syncConfig();
  return {
    ...context,
    sync,
    gateway: (scope, action, approved) => {
      if (!sync.enabled || !sync.token)
        throw new PrivateError("SYNC_SETUP_REQUIRED", 503);
      return createSyncGateway(sync.token, scope, action, approved);
    },
  };
}
const now = () => new Date().toISOString();
function event(action: SyncAction, name: string, payload = false) {
  if (action.history.length >= 40) fail("SYNC_HISTORY_LIMIT", 409);
  action.history.push({
    at: now(),
    event: name,
    digest: action.digest,
    ...(payload ? { payload: structuredClone(action.payload) } : {}),
  });
}
const scopeIdentity = (scope: SourceScope) =>
  hash({
    sourceId: scope.sourceId,
    mode: scope.mode,
    columns: scope.columns,
    schemaHash: scope.schemaHash,
  });
export function testGate(ledger: SyncLedger, config: SyncConfig) {
  const e = ledger.testEvidence;
  const scope = ledger.scopes.find((s) => s.sourceId === e?.sourceId);
  return (
    !!e &&
    !!scope &&
    scope.mode === "test" &&
    scopeIdentity(scope) === e.scopeHash &&
    e.connectionHash === config.connectionHash &&
    ledger.actions.some(
      (a) =>
        a.id === e.createId &&
        a.connectionHash === config.connectionHash &&
        a.state === "succeeded" &&
        a.writeDispatched,
    ) &&
    ledger.actions.some(
      (a) =>
        a.id === e.updateId &&
        a.connectionHash === config.connectionHash &&
        a.state === "succeeded" &&
        a.writeDispatched,
    )
  );
}
function evidence(ledger: SyncLedger, action: SyncAction, config: SyncConfig) {
  if (
    action.scope.mode !== "test" ||
    action.operation !== "update" ||
    !action.writeDispatched ||
    !action.baseline ||
    matches(action.baseline, action.payload)
  )
    return;
  const created = ledger.actions.find(
    (a) =>
      a.sourceId === action.sourceId &&
      a.recordId === action.recordId &&
      a.operation === "create" &&
      a.connectionHash === config.connectionHash &&
      a.state === "succeeded" &&
      a.writeDispatched &&
      a.pageId === action.pageId &&
      scopeIdentity(a.scope) === scopeIdentity(action.scope),
  );
  if (created)
    ledger.testEvidence = {
      sourceId: action.sourceId,
      createId: created.id,
      updateId: action.id,
      schemaHash: action.scope.schemaHash,
      scopeHash: scopeIdentity(action.scope),
      connectionHash: config.connectionHash,
      at: now(),
    };
}
async function auditedSources(context: SyncContext) {
  const job = await context.store.get<DiscoveryJob>("discovery");
  const mappings = (await context.store.get<Mapping[]>("mappings")) ?? [];
  if (!job || job.status === "running") return { job, sources: [] };
  const sources = mappings
    .filter((m) => m.reportId === job.id)
    .map((m) => {
      const source = job.items.find(
        (i) =>
          i.kind === "data_source" &&
          i.verified &&
          uuid(i.id) === uuid(m.sourceId),
      );
      return source ? { ...source, id: uuid(source.id), area: m.area } : null;
    })
    .filter((v) => v !== null);
  return { job, sources };
}
async function authorizeScope(
  context: SyncContext,
  ledger: SyncLedger,
  scope: SourceScope,
  readOnly = false,
) {
  if (!context.sync.enabled) fail("SYNC_SETUP_REQUIRED", 503);
  const { job, sources } = await auditedSources(context);
  const current = sources.find((s) => s.id === scope.sourceId);
  if (
    !job ||
    !current ||
    scope.reportId !== job.id ||
    scope.revision !== job.revision ||
    scope.area !== current.area
  )
    fail("SYNC_AUDIT_OR_MAPPING_CHANGED", 409);
  const ids =
    scope.mode === "test" ? context.sync.testIds : context.sync.existingIds;
  if (!ids.includes(scope.sourceId)) fail("SYNC_SOURCE_DENIED", 403);
  if (!readOnly && scope.mode === "existing" && !testGate(ledger, context.sync))
    fail("SYNC_TEST_REQUIRED", 409);
}
function digest(action: SyncAction) {
  return hash({
    connectionHash: action.connectionHash,
    recordId: action.recordId,
    sourceId: action.sourceId,
    pageId: action.pageId,
    operation: action.operation,
    origin: action.origin,
    proposalId: action.proposalId,
    scope: action.scope,
    payload: action.payload,
    baseline: action.baseline,
  });
}
function conflict(
  action: SyncAction,
  code: string,
  current: RemotePage | null = null,
  candidates: string[] = [],
) {
  action.state = "conflict";
  action.error = code;
  action.current = current ? projectPage(current, action.scope) : null;
  action.candidates = candidates;
  event(action, "conflict");
}
function success(
  ledger: SyncLedger,
  action: SyncAction,
  page: RemotePage,
  config: SyncConfig,
  recovered = false,
) {
  if (
    page.trashed ||
    page.sourceId !== action.sourceId ||
    stableValue(page, action.scope.columns.recordId) !== action.recordId ||
    !matches(page, action.payload)
  )
    return conflict(action, "SYNC_READBACK_CONFLICT", page);
  if (action.pageId && action.pageId !== page.id)
    return conflict(action, "SYNC_PAGE_ID_CHANGED", page);
  action.pageId = page.id;
  action.state = "succeeded";
  action.lastSuccessAt = now();
  action.error = null;
  action.retryAt = null;
  action.current = projectPage(page, action.scope);
  ledger.lastSuccessAt = action.lastSuccessAt;
  ledger.bindings[action.recordId] = {
    sourceId: action.sourceId,
    pageId: page.id,
  };
  event(action, recovered ? "reconciled" : "verified");
  evidence(ledger, action, config);
}
export async function syncApi(
  request: Request,
  name: string,
  context: SyncContext,
): Promise<Response> {
  let lock: string | null = null;
  let ledger: SyncLedger | null = null;
  let active: SyncAction | null = null;
  let wrote = false;
  let writeResponseReceived = false;
  let attemptStarted = false;
  async function save(
    eventName:
      | "sync_scope"
      | "sync_prepare"
      | "sync_attempt"
      | "sync_result"
      | "sync_review" = "sync_result",
  ) {
    if (!ledger || !lock) fail("SYNC_STORE_REQUIRED", 503);
    ledger.revision++;
    if (active) active.version++;
    await context.store.putAudited(
      "sync",
      ledger,
      eventName,
      active ? 1 : 0,
      lock,
    );
  }
  try {
    await requirePrivateSession(request, context);
    if (context.sync.token && context.sync.token === context.config.notionToken)
      fail("SYNC_SEPARATE_TOKEN_REQUIRED", 503);
    if (request.method === "GET" && name === "status") {
      ledger = (await context.store.get<SyncLedger>("sync")) ?? emptyLedger();
      const { job, sources } = await auditedSources(context);
      return response({
        configured: context.sync.enabled,
        testPassed: testGate(ledger, context.sync),
        ledger,
        reportId: job?.id ?? null,
        reportRevision: job?.revision ?? null,
        sources: sources
          .filter(
            (s) =>
              context.sync.testIds.includes(s.id) ||
              context.sync.existingIds.includes(s.id),
          )
          .map((s) => ({
            ...s,
            mode: context.sync.testIds.includes(s.id) ? "test" : "existing",
          })),
        aiProposals: (
          (await context.store.get<AiProposal[]>("ai-proposals")) ?? []
        ).filter((p) => p.status === "approved"),
      });
    }
    if (
      request.method !== "POST" ||
      ![
        "scope",
        "prepare",
        "execute",
        "retry",
        "recover",
        "reject",
        "renew",
      ].includes(name)
    )
      fail("METHOD_NOT_ALLOWED", 405);
    assertOrigin(request, context.config);
    const body = await readJson(request);
    if (!(await context.store.consume("sync-owner", 30, 600)))
      throw new PrivateError("SYNC_RATE_LIMITED", 429, 600);
    lock = randomUUID();
    if (!(await context.store.lease("notion-workflow", lock)))
      fail("WORKFLOW_BUSY", 409);
    ledger = (await context.store.get<SyncLedger>("sync")) ?? emptyLedger();
    if (name === "scope") {
      if (body.approved !== true || typeof body.reportId !== "string")
        fail("SYNC_APPROVAL_REQUIRED");
      const sourceId = uuid(body.sourceId);
      const { job, sources } = await auditedSources(context);
      const source = sources.find((s) => s.id === sourceId);
      if (
        !job ||
        !source ||
        job.id !== body.reportId ||
        job.revision !== body.revision
      )
        fail("SYNC_AUDIT_OR_MAPPING_CHANGED", 409);
      const mode = context.sync.testIds.includes(sourceId)
        ? "test"
        : context.sync.existingIds.includes(sourceId)
          ? "existing"
          : fail("SYNC_SOURCE_DENIED", 403);
      if (mode === "test" && body.disposableConfirmed !== true)
        fail("SYNC_TEST_APPROVAL_REQUIRED");
      const scope: SourceScope = {
        sourceId,
        area: source.area,
        mode,
        columns: body.columns as SourceScope["columns"],
        schemaHash: "",
        approvedAt: now(),
        reportId: job.id,
        revision: job.revision,
      };
      await authorizeScope(context, ledger, scope);
      await context.store.audit("sync_scope", "ok");
      const schema = await context
        .gateway(
          scope,
          {
            recordId: randomUUID(),
            pageId: null,
            payload: {},
            operation: "create",
          },
          false,
        )
        .schema();
      scope.columns = validateColumns(body.columns, schema);
      scope.schemaHash = schemaHash(schema);
      ledger.scopes = ledger.scopes
        .filter((s) => s.sourceId !== sourceId)
        .concat(scope);
      if (ledger.scopes.length > 20) fail("SYNC_SCOPE_LIMIT", 409);
      await save("sync_scope");
      return response({ ledger });
    }
    if (name === "prepare") {
      const sourceId = uuid(body.sourceId),
        recordId = uuid(body.recordId);
      const scope = ledger.scopes.find((s) => s.sourceId === sourceId);
      if (!scope) fail("SYNC_SCOPE_REQUIRED", 409);
      await authorizeScope(context, ledger, scope);
      if (!["create", "update"].includes(String(body.operation)))
        fail("SYNC_OPERATION_DENIED", 403);
      const operation = body.operation as "create" | "update";
      const pageId = operation === "update" ? uuid(body.pageId) : null;
      const values = recordFields(body.fields);
      const origin =
        body.origin === "ai"
          ? "ai"
          : body.origin === "manual"
            ? "manual"
            : fail("SYNC_FIELDS_INVALID");
      let proposalId: string | null = null;
      if (origin === "ai") {
        proposalId = uuid(body.proposalId);
        const proposal = (
          (await context.store.get<AiProposal[]>("ai-proposals")) ?? []
        ).find((p) => p.id === proposalId && p.status === "approved");
        if (
          !proposal ||
          !allowedArea(scope.area) ||
          proposal.spaceId !== scope.area ||
          operation !== "create" ||
          recordId !== proposal.id ||
          values.title !== proposal.title ||
          values.kind !== proposal.kind ||
          values.details !== (proposal.details || null) ||
          values.durationMinutes !== proposal.durationMinutes
        )
          fail("SYNC_AI_DRAFT_CHANGED", 409);
        if (
          proposal.date === null
            ? values.date !== null
            : !values.date ||
              values.date.slice(0, 10) !== proposal.date ||
              (proposal.time && values.date.slice(11, 16) !== proposal.time)
        )
          fail("SYNC_AI_DRAFT_CHANGED", 409);
      }
      if (scope.mode === "test" && !values.title.startsWith("اختبار مدار ·"))
        fail("SYNC_TEST_RECORD_REQUIRED");
      const binding = ledger.bindings[recordId];
      if (
        binding &&
        (binding.sourceId !== sourceId ||
          (operation === "update" && binding.pageId !== pageId))
      )
        fail("SYNC_BINDING_CONFLICT", 409);
      if (
        operation === "update" &&
        scope.mode === "test" &&
        !ledger.actions.some(
          (a) =>
            a.operation === "create" &&
            a.scope.mode === "test" &&
            a.state === "succeeded" &&
            a.writeDispatched &&
            a.recordId === recordId &&
            a.pageId === pageId,
        )
      )
        fail("SYNC_TEST_RECORD_REQUIRED", 403);
      if (
        operation === "update" &&
        ledger.actions.some(
          (a) =>
            a.recordId === recordId &&
            ["writing", "uncertain"].includes(a.state),
        )
      )
        fail("SYNC_RECORD_UNCERTAIN", 409);
      const payload = properties(values, recordId, scope);
      if (operation === "create") {
        const prior = ledger.actions.find(
          (a) =>
            a.operation === "create" &&
            a.recordId === recordId &&
            a.state !== "rejected",
        );
        if (prior) {
          if (prior.sourceId !== sourceId || !same(prior.payload, payload))
            fail("SYNC_RECORD_IN_USE", 409);
          return response({ action: prior, ledger });
        }
      }
      if (ledger.actions.length >= 200) fail("SYNC_HISTORY_LIMIT", 409);
      await context.store.audit("sync_prepare", "ok");
      const gateway = context.gateway(
        scope,
        { recordId, pageId, payload, operation },
        false,
      );
      if (schemaHash(await gateway.schema()) !== scope.schemaHash)
        fail("SYNC_SCHEMA_CHANGED", 409);
      const found = await gateway.query(recordId);
      let baseline: RemotePage | null = null;
      if (operation === "update")
        baseline = projectPage(await gateway.page(pageId!), scope);
      active = {
        id: randomUUID(),
        version: 0,
        connectionHash: context.sync.connectionHash,
        recordId,
        sourceId,
        pageId,
        operation,
        origin,
        proposalId,
        scope: structuredClone(scope),
        fields: values,
        payload,
        digest: "",
        baseline,
        state: "pending",
        createdAt: now(),
        approvedAt: null,
        lastSuccessAt: null,
        retryAt: null,
        attempts: 0,
        writeDispatched: false,
        error: null,
        current: null,
        candidates: [],
        history: [],
      };
      active.digest = digest(active);
      event(active, "prepared", true);
      if (found.more || found.pages.length > 1)
        conflict(
          active,
          "SYNC_DUPLICATE_IDS",
          null,
          found.pages.map((p) => p.id),
        );
      else if (
        operation === "create" &&
        found.pages.length &&
        !matches(found.pages[0], payload)
      )
        conflict(active, "SYNC_EXISTING_RECORD_DIFFERS", found.pages[0], [
          found.pages[0].id,
        ]);
      else if (
        baseline &&
        (baseline.trashed ||
          baseline.sourceId !== sourceId ||
          found.pages.some((p) => p.id !== baseline!.id) ||
          (stableValue(baseline, scope.columns.recordId) !== "" &&
            stableValue(baseline, scope.columns.recordId) !== recordId))
      )
        conflict(
          active,
          "SYNC_BINDING_CONFLICT",
          baseline,
          found.pages.map((p) => p.id),
        );
      ledger.actions.push(active);
      await save("sync_prepare");
      return response({ action: active, ledger });
    }
    active = ledger.actions.find((a) => a.id === body.id) ?? null;
    if (!active) fail("SYNC_ACTION_MISSING", 404);
    if (body.version !== active.version) fail("SYNC_ACTION_CHANGED", 409);
    if (name === "reject") {
      if (active.state !== "pending" || body.approved !== true)
        fail("SYNC_ACTION_CHANGED", 409);
      active.state = "rejected";
      event(active, "rejected");
      await save("sync_review");
      return response({ action: active, ledger });
    }
    const scope = ledger.scopes.find((s) => s.sourceId === active!.sourceId);
    if (!scope || !same(scope, active.scope)) fail("SYNC_SCOPE_CHANGED", 409);
    await authorizeScope(context, ledger, scope, name === "recover");
    if (
      name !== "recover" &&
      active.connectionHash !== context.sync.connectionHash
    )
      fail("SYNC_CONNECTION_CHANGED", 409);
    if (name === "renew") {
      if (active.state !== "failed" || body.approved !== true)
        fail("SYNC_ACTION_CHANGED", 409);
      const remote = context.gateway(scope, active, false);
      await context.store.audit("sync_review", "ok");
      if (schemaHash(await remote.schema()) !== scope.schemaHash)
        fail("SYNC_SCHEMA_CHANGED", 409);
      const found = await remote.query(active.recordId);
      if (found.more || found.pages.length > 1)
        conflict(
          active,
          "SYNC_DUPLICATE_IDS",
          null,
          found.pages.map((p) => p.id),
        );
      else if (active.operation === "create" && found.pages.length)
        success(ledger, active, found.pages[0], context.sync, true);
      else {
        if (active.operation === "update") {
          const current = await remote.page(active.pageId!);
          const stable = stableValue(current, scope.columns.recordId);
          if (
            current.trashed ||
            (stable !== "" && stable !== active.recordId) ||
            found.pages.some((p) => p.id !== active!.pageId)
          ) {
            conflict(active, "SYNC_BINDING_CONFLICT", current);
            await save("sync_review");
            return response({ action: active, ledger });
          }
          active.baseline = projectPage(current, scope);
        }
        active.state = "pending";
        active.createdAt = now();
        active.approvedAt = null;
        active.error = null;
        active.retryAt = null;
        active.digest = digest(active);
        event(active, "renewed_review", true);
      }
      await save("sync_review");
      return response({ action: active, ledger });
    }
    if (name === "recover") {
      if (
        !["writing", "uncertain"].includes(active.state) ||
        body.approved !== true
      )
        fail("SYNC_RECOVERY_REQUIRED", 409);
      await context.store.audit("sync_review", "ok");
      const remote = context.gateway(scope, active, false);
      if (schemaHash(await remote.schema()) !== scope.schemaHash)
        fail("SYNC_SCHEMA_CHANGED", 409);
      if (body.pageId) {
        const p = await context
          .gateway(scope, { ...active, pageId: uuid(body.pageId) }, false)
          .page(uuid(body.pageId));
        if (stableValue(p, scope.columns.recordId) !== active.recordId)
          fail("SYNC_BINDING_CONFLICT", 409);
        success(ledger, active, p, context.sync, true);
      } else {
        const found = await remote.query(active.recordId);
        if (found.more || found.pages.length > 1)
          conflict(
            active,
            "SYNC_DUPLICATE_IDS",
            null,
            found.pages.map((p) => p.id),
          );
        else if (found.pages.length === 1)
          success(ledger, active, found.pages[0], context.sync, true);
        else if (active.pageId)
          success(
            ledger,
            active,
            await remote.page(active.pageId),
            context.sync,
            true,
          );
        else {
          active.state = "uncertain";
          active.error = "SYNC_RECONCILE_NOT_FOUND";
          active.retryAt = new Date(Date.now() + 60000).toISOString();
          event(active, "recovery_pending");
        }
      }
      await save("sync_review");
      return response({ action: active, ledger });
    }
    if (active.operation === "update" && body.riskAccepted !== true)
      fail("SYNC_CONFLICT_LIMIT_ACK_REQUIRED", 403);
    if (body.approved !== true || body.digest !== active.digest)
      fail("SYNC_APPROVAL_REQUIRED", 403);
    if (active.state === "succeeded")
      return response({ action: active, ledger });
    if (
      name === "retry" ? active.state !== "failed" : active.state !== "pending"
    )
      fail("SYNC_ACTION_CHANGED", 409);
    if (Date.now() - Date.parse(active.createdAt) > 15 * 60000)
      fail("SYNC_APPROVAL_EXPIRED", 409);
    if (active.retryAt && Date.now() < Date.parse(active.retryAt))
      throw new PrivateError(
        "SYNC_RETRY_LATER",
        429,
        Math.ceil((Date.parse(active.retryAt) - Date.now()) / 1000),
      );
    if (active.attempts >= 5) fail("SYNC_ATTEMPT_LIMIT", 409);
    if (active.origin === "ai") {
      const proposal = (
        (await context.store.get<AiProposal[]>("ai-proposals")) ?? []
      ).find((p) => p.id === active!.proposalId && p.status === "approved");
      if (
        !proposal ||
        !allowedArea(scope.area) ||
        proposal.spaceId !== scope.area ||
        proposal.title !== active.fields.title ||
        proposal.kind !== active.fields.kind ||
        proposal.details !== (active.fields.details ?? "")
      )
        fail("SYNC_AI_DRAFT_CHANGED", 409);
    }
    attemptStarted = true;
    active.approvedAt = now();
    active.attempts++;
    active.error = null;
    event(active, "approved", true);
    await save("sync_attempt");
    const remote = context.gateway(scope, active, false);
    if (schemaHash(await remote.schema()) !== scope.schemaHash) {
      conflict(active, "SYNC_SCHEMA_CHANGED");
      await save();
      return response({ action: active, ledger });
    }
    const found = await remote.query(active.recordId);
    if (found.more || found.pages.length > 1) {
      conflict(
        active,
        "SYNC_DUPLICATE_IDS",
        null,
        found.pages.map((p) => p.id),
      );
      await save();
      return response({ action: active, ledger });
    }
    if (active.operation === "create" && found.pages.length) {
      success(ledger, active, found.pages[0], context.sync, true);
      await save();
      return response({ action: active, ledger });
    }
    if (active.operation === "create" && ledger.bindings[active.recordId]) {
      conflict(active, "SYNC_BOUND_PAGE_NOT_FOUND");
      await save();
      return response({ action: active, ledger });
    }
    if (active.operation === "update") {
      const current = await remote.page(active.pageId!);
      if (
        current.trashed ||
        !active.baseline ||
        current.editedAt !== active.baseline.editedAt ||
        !same(current.properties, active.baseline.properties) ||
        found.pages.some((p) => p.id !== active!.pageId)
      ) {
        conflict(active, "SYNC_REMOTE_CHANGED", current);
        await save();
        return response({ action: active, ledger });
      }
      if (matches(current, active.payload)) {
        success(ledger, active, current, context.sync, true);
        await save();
        return response({ action: active, ledger });
      }
    }
    active.state = "writing";
    event(active, "dispatching");
    await save("sync_attempt");
    // Check revocation again immediately before dispatch; no automatic worker can write.
    await requirePrivateSession(request, context);
    active.writeDispatched = true;
    await save("sync_attempt");
    const writer = context.gateway(scope, active, true);
    wrote = true;
    const result =
      active.operation === "create"
        ? await writer.create(active.payload)
        : await writer.update(active.pageId!, active.payload);
    writeResponseReceived = true;
    if (active.pageId && active.pageId !== result.id)
      fail("SYNC_PAGE_ID_CHANGED", 409);
    active.pageId = result.id;
    event(active, "write_response");
    await save();
    const verified = await context
      .gateway(scope, active, false)
      .page(result.id);
    success(ledger, active, verified, context.sync);
    await save();
    return response({ action: active, ledger });
  } catch (error) {
    if (
      attemptStarted &&
      active &&
      ledger &&
      lock &&
      ["execute", "retry"].includes(name)
    ) {
      const remote = error instanceof SyncRemoteError ? error : null;
      if (active.state === "writing" || active.approvedAt) {
        active.state =
          wrote && (writeResponseReceived || !remote || remote.uncertain)
            ? "uncertain"
            : remote?.code === "NOTION_CONFLICT"
              ? "conflict"
              : "failed";
        active.error =
          remote?.code ??
          (error instanceof PrivateError ? error.code : "SYNC_FAILED");
        active.retryAt = remote?.retryAfter
          ? new Date(Date.now() + remote.retryAfter * 1000).toISOString()
          : null;
        event(active, active.state);
        try {
          await save();
          return response({ action: active, ledger });
        } catch {
          /* durable dispatch journal remains for read-only reconciliation */
        }
      }
    }
    try {
      await context.store.audit("sync_result", "error");
    } catch {
      /* no private payload or upstream exception is logged */
    }
    return errorResponse(error);
  } finally {
    if (lock)
      try {
        await context.store.release("notion-workflow", lock);
      } catch {
        /* fencing remains, lease expires after 90 seconds */
      }
  }
}
