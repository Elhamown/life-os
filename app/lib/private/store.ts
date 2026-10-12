import "server-only";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import type { AuditEntry, AuditEvent } from "../notion/types";
import { seal, unseal } from "./crypto";
import { PrivateError } from "./errors";
export interface QueryExecutor {
  query<T extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<T[]>;
}
export interface Store {
  readWorkspace?(): Promise<{ revision: number; data: unknown } | null>;
  saveWorkspace?(revision: number, data: unknown): Promise<boolean>;
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown): Promise<void>;
  putUnderLease(key: string, value: unknown, leaseId: string): Promise<boolean>;
  putAudited(
    key: string,
    value: unknown,
    event: AuditEvent,
    count: number,
    leaseId?: string,
  ): Promise<void>;
  session(idHash: string): Promise<boolean>;
  createSession(idHash: string, expires: string): Promise<void>;
  revokeSession(idHash: string): Promise<void>;
  consume(key: string, limit: number, seconds: number): Promise<boolean>;
  lease(key: string, id: string): Promise<boolean>;
  release(key: string, id: string): Promise<void>;
  audit(
    event: AuditEvent,
    outcome: AuditEntry["outcome"],
    count?: number,
  ): Promise<void>;
  logs(): Promise<AuditEntry[]>;
}
export class SqlStore implements Store {
  constructor(
    private db: QueryExecutor,
    private key: string,
  ) {}
  async readWorkspace() {
    const rows = await this.db.query<{ revision: number; ciphertext: string }>(
      "SELECT revision,ciphertext FROM madar_workspace WHERE owner='owner'",
    );
    return rows[0]
      ? {
          revision: rows[0].revision,
          data: unseal<unknown>(
            rows[0].ciphertext,
            this.key,
            "workspace:owner",
          ),
        }
      : null;
  }
  async saveWorkspace(revision: number, data: unknown) {
    const rows = await this.db.query(
      "INSERT INTO madar_workspace(owner,revision,ciphertext) SELECT 'owner',1,$2 WHERE $1::integer=0 ON CONFLICT(owner) DO NOTHING RETURNING revision",
      [revision, seal(data, this.key, "workspace:owner")],
    );
    if (rows.length) return true;
    if (revision === 0) return false;
    return (
      (
        await this.db.query(
          "UPDATE madar_workspace SET revision=revision+1,ciphertext=$2,updated_at=NOW() WHERE owner='owner' AND revision=$1 RETURNING revision",
          [revision, seal(data, this.key, "workspace:owner")],
        )
      ).length === 1
    );
  }
  async get<T>(name: string) {
    const rows = await this.db.query<{ ciphertext: string }>(
      "SELECT ciphertext FROM madar_private_state WHERE name=$1",
      [name],
    );
    return rows[0] ? unseal<T>(rows[0].ciphertext, this.key, name) : null;
  }
  async put(name: string, value: unknown) {
    await this.db.query(
      "INSERT INTO madar_private_state(name,ciphertext) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET ciphertext=EXCLUDED.ciphertext",
      [name, seal(value, this.key, name)],
    );
  }
  async putUnderLease(name: string, value: unknown, leaseId: string) {
    const rows = await this.db.query(
      "WITH active AS (SELECT name FROM madar_private_leases WHERE name='notion-workflow' AND lease_id=$3 AND expires_at>clock_timestamp() FOR UPDATE) INSERT INTO madar_private_state(name,ciphertext) SELECT $1,$2 FROM active ON CONFLICT(name) DO UPDATE SET ciphertext=EXCLUDED.ciphertext RETURNING name",
      [name, seal(value, this.key, name), leaseId],
    );
    return rows.length === 1;
  }
  async putAudited(
    name: string,
    value: unknown,
    event: AuditEvent,
    count: number,
    leaseId?: string,
  ) {
    const rows = await this.db.query(
      "WITH active AS (SELECT name FROM madar_private_leases WHERE name='notion-workflow' AND lease_id=$6 AND expires_at>clock_timestamp() FOR UPDATE), saved AS (INSERT INTO madar_private_state(name,ciphertext) SELECT $1,$2 WHERE $6::text IS NULL OR EXISTS(SELECT 1 FROM active) ON CONFLICT(name) DO UPDATE SET ciphertext=EXCLUDED.ciphertext RETURNING name) INSERT INTO madar_private_audit(id,event,outcome,record_count) SELECT $3::uuid,$4,'ok',$5::integer FROM saved RETURNING id",
      [
        name,
        seal(value, this.key, name),
        randomUUID(),
        event,
        count,
        leaseId ?? null,
      ],
    );
    if (!rows.length) throw new PrivateError("WORKFLOW_BUSY", 409, 5);
  }
  async session(idHash: string) {
    return (
      (
        await this.db.query(
          "SELECT id_hash FROM madar_private_sessions WHERE id_hash=$1 AND expires_at>NOW()",
          [idHash],
        )
      ).length === 1
    );
  }
  async createSession(idHash: string, expires: string) {
    await this.db.query(
      "DELETE FROM madar_private_sessions WHERE expires_at<=NOW()",
    );
    await this.db.query(
      "INSERT INTO madar_private_sessions(id_hash,expires_at) VALUES($1,$2)",
      [idHash, expires],
    );
  }
  async revokeSession(idHash: string) {
    await this.db.query("DELETE FROM madar_private_sessions WHERE id_hash=$1", [
      idHash,
    ]);
  }
  async consume(name: string, limit: number, seconds: number) {
    const rows = await this.db.query<{ attempts: number }>(
      "INSERT INTO madar_private_limits(name,attempts,expires_at) VALUES($1,1,NOW()+($2::int*INTERVAL '1 second')) ON CONFLICT(name) DO UPDATE SET attempts=CASE WHEN madar_private_limits.expires_at<=NOW() THEN 1 ELSE madar_private_limits.attempts+1 END, expires_at=CASE WHEN madar_private_limits.expires_at<=NOW() THEN EXCLUDED.expires_at ELSE madar_private_limits.expires_at END RETURNING attempts",
      [name, seconds],
    );
    return rows[0].attempts <= limit;
  }
  async lease(name: string, id: string) {
    return (
      (
        await this.db.query(
          "INSERT INTO madar_private_leases(name,lease_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '90 seconds') ON CONFLICT(name) DO UPDATE SET lease_id=EXCLUDED.lease_id,expires_at=EXCLUDED.expires_at WHERE madar_private_leases.expires_at<=NOW() RETURNING lease_id",
          [name, id],
        )
      ).length === 1
    );
  }
  async release(name: string, id: string) {
    await this.db.query(
      "DELETE FROM madar_private_leases WHERE name=$1 AND lease_id=$2",
      [name, id],
    );
  }
  async audit(event: AuditEvent, outcome: AuditEntry["outcome"], count = 0) {
    await this.db.query(
      "INSERT INTO madar_private_audit(id,event,outcome,record_count) VALUES($1,$2,$3,$4)",
      [randomUUID(), event, outcome, Math.max(0, Math.floor(count))],
    );
  }
  async logs() {
    const rows = await this.db.query<{
      id: string;
      at: string;
      event: AuditEvent;
      outcome: AuditEntry["outcome"];
      count: number;
    }>(
      "SELECT id,created_at::text AS at,event,outcome,record_count AS count FROM madar_private_audit ORDER BY created_at DESC LIMIT 100",
    );
    return rows;
  }
}
let database: ReturnType<typeof postgres> | undefined;
export function productionStore(url: string, key: string): Store {
  // DATABASE_URL uses the provider's verified TLS configuration; never disable certificate verification.
  database ??= postgres(url, {
    max: 1, // Single-owner workload: serialize pool access and limit serverless connections.
    connect_timeout: 5,
    idle_timeout: 10,
    prepare: false,
    connection: { statement_timeout: 10000 },
    onnotice: () => undefined,
  });
  const connection = database;
  return new SqlStore(
    {
      async query<T extends Record<string, unknown>>(
        text: string,
        values: unknown[] = [],
      ) {
        return (await connection.unsafe(
          text,
          values as postgres.ParameterOrJSON<never>[],
        )) as unknown as T[];
      },
    },
    key,
  );
}
