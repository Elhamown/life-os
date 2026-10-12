-- Internal MADAR PostgreSQL only. Never run against Notion or an existing application schema.
CREATE TABLE IF NOT EXISTS madar_private_state(name text PRIMARY KEY, ciphertext text NOT NULL);
CREATE TABLE IF NOT EXISTS madar_private_sessions(id_hash text PRIMARY KEY, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS madar_private_limits(name text PRIMARY KEY, attempts integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS madar_private_leases(name text PRIMARY KEY, lease_id text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS madar_private_audit(id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT NOW(), event text NOT NULL CHECK(event IN ('login','logout','discovery_start','discovery_step','discovery_read','mappings_save','access_denied','ai_request','ai_transcribe','ai_decision','ai_context','sync_scope','sync_prepare','sync_attempt','sync_result','sync_review')), outcome text NOT NULL CHECK(outcome IN ('ok','denied','error')), record_count integer NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS madar_private_audit_created ON madar_private_audit(created_at DESC);

-- Additive workspace schema v1. Existing private integration state is untouched.
CREATE TABLE IF NOT EXISTS madar_workspace(owner text PRIMARY KEY CHECK(owner='owner'), revision integer NOT NULL CHECK(revision>0), ciphertext text NOT NULL, updated_at timestamptz NOT NULL DEFAULT NOW());
