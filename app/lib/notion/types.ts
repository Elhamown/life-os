import type { SpaceId } from "../model";
export type SchemaProperty = {
  id: string;
  name: string;
  type: string;
  relation?: {
    dataSourceId: string | null;
    databaseId: string | null;
    syncedPropertyId: string | null;
  };
};
export type InventoryItem = {
  id: string;
  kind: "page" | "data_source" | "database";
  title: string;
  parentId: string | null;
  createdAt: string | null;
  editedAt: string | null;
  schema: SchemaProperty[];
  verified: boolean;
};
export type DiscoveryWarning = {
  code:
    | "INACCESSIBLE"
    | "PARTIAL_OBJECT"
    | "SEARCH_INCOMPLETE"
    | "LIMIT_REACHED"
    | "CURSOR_INVALID"
    | "RATE_LIMITED";
  id?: string;
};
export type DiscoveryJob = {
  id: string;
  revision: number;
  startedAt: string;
  updatedAt: string;
  status: "running" | "complete" | "partial";
  searchDone: boolean;
  cursor: string | null;
  seenCursors: string[];
  sources: string[];
  databases: string[];
  visitedSources: string[];
  visitedDatabases: string[];
  items: InventoryItem[];
  warnings: DiscoveryWarning[];
  retryAt: string | null;
};
export type Mapping = {
  sourceId: string;
  area: SpaceId;
  aiIngestion: false;
  approvedAt: string;
  reportId: string;
};
export type Suggestion = {
  sourceId: string;
  area: SpaceId | null;
  reason: string;
};
export type DuplicateGroup = { ids: string[]; reason: "schema" | "title" };
export type AuditEvent =
  | "login"
  | "logout"
  | "discovery_start"
  | "discovery_step"
  | "discovery_read"
  | "mappings_save"
  | "access_denied";
export type AuditEntry = {
  id: string;
  at: string;
  event: AuditEvent;
  outcome: "ok" | "denied" | "error";
  count: number;
};
export type AuditView = {
  id: string;
  revision: number;
  startedAt: string;
  updatedAt: string;
  status: DiscoveryJob["status"];
  items: InventoryItem[];
  warnings: DiscoveryWarning[];
  retryAt: string | null;
  suggestions: Suggestion[];
  duplicates: DuplicateGroup[];
  scope: string;
};
