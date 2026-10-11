import type { SpaceId } from "../model";
export type ColumnMap = {
  title: string;
  recordId: string;
  details: string | null;
  date: string | null;
  kind: string | null;
  duration: string | null;
};
export type SourceScope = {
  sourceId: string;
  area: SpaceId;
  mode: "test" | "existing";
  columns: ColumnMap;
  schemaHash: string;
  approvedAt: string;
  reportId: string;
  revision: number;
};
export type RecordFields = {
  title: string;
  details: string | null;
  date: string | null;
  kind: "task" | "event" | "note" | "study";
  durationMinutes: number | null;
};
export type Properties = Record<string, unknown>;
export type RemotePage = {
  id: string;
  sourceId: string;
  editedAt: string;
  trashed: boolean;
  properties: Properties;
};
export type SourceSchema = {
  id: string;
  properties: { id: string; name: string; type: string }[];
};
export type ActionState =
  | "pending"
  | "writing"
  | "succeeded"
  | "failed"
  | "uncertain"
  | "conflict"
  | "rejected";
export type SyncAction = {
  id: string;
  version: number;
  connectionHash: string;
  recordId: string;
  sourceId: string;
  pageId: string | null;
  operation: "create" | "update";
  origin: "manual" | "ai";
  proposalId: string | null;
  scope: SourceScope;
  fields: RecordFields;
  payload: Properties;
  digest: string;
  baseline: RemotePage | null;
  state: ActionState;
  createdAt: string;
  approvedAt: string | null;
  lastSuccessAt: string | null;
  retryAt: string | null;
  attempts: number;
  writeDispatched: boolean;
  error: string | null;
  current: RemotePage | null;
  candidates: string[];
  history: {
    at: string;
    event: string;
    digest: string;
    payload?: Properties;
  }[];
};
export type SyncLedger = {
  revision: number;
  scopes: SourceScope[];
  actions: SyncAction[];
  bindings: Record<string, { sourceId: string; pageId: string }>;
  lastSuccessAt: string | null;
  testEvidence: {
    sourceId: string;
    createId: string;
    updateId: string;
    schemaHash: string;
    scopeHash: string;
    connectionHash: string;
    at: string;
  } | null;
};
export type SyncConfig = {
  token: string | null;
  enabled: boolean;
  testIds: string[];
  existingIds: string[];
  connectionHash: string;
};
export type SyncGateway = {
  schema(): Promise<SourceSchema>;
  query(recordId: string): Promise<{ pages: RemotePage[]; more: boolean }>;
  page(id: string): Promise<RemotePage>;
  create(payload: Properties): Promise<RemotePage>;
  update(id: string, payload: Properties): Promise<RemotePage>;
};
export const emptyLedger = (): SyncLedger => ({
  revision: 0,
  scopes: [],
  actions: [],
  bindings: {},
  lastSuccessAt: null,
  testEvidence: null,
});
