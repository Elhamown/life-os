-- Run once as the internal database administrator if private Notion tables already exist.
-- Only MADAR's audit enum constraint changes; no Notion operations or existing record deletion.
BEGIN;
ALTER TABLE madar_private_audit DROP CONSTRAINT madar_private_audit_event_check;
ALTER TABLE madar_private_audit ADD CONSTRAINT madar_private_audit_event_check CHECK(event IN ('login','logout','discovery_start','discovery_step','discovery_read','mappings_save','access_denied','ai_request','ai_transcribe','ai_decision','ai_context'));
COMMIT;
