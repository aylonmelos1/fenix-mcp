BEGIN;

CREATE SCHEMA IF NOT EXISTS fenix_oauth AUTHORIZATION fenix_mcp_migrator;
SET LOCAL search_path = fenix_oauth, pg_catalog;

CREATE TABLE IF NOT EXISTS oauth_schema_version (
  version integer PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS oauth_client_identities (
  client_key text PRIMARY KEY,
  client_kind text NOT NULL CHECK (client_kind IN ('dcr', 'metadata_document')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS oauth_clients (
  client_key text PRIMARY KEY REFERENCES oauth_client_identities(client_key),
  client_data_cipher text NOT NULL,
  client_secret_hash text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS oauth_metadata_initial (
  client_key text PRIMARY KEY REFERENCES oauth_client_identities(client_key),
  document_sha256 text NOT NULL CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
  jwks_uri text NOT NULL DEFAULT '',
  jwks_sha256 text NOT NULL DEFAULT '' CHECK (jwks_sha256 = '' OR jwks_sha256 ~ '^[0-9a-f]{64}$'),
  provenance text NOT NULL,
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  code_hash text PRIMARY KEY,
  client_key text NOT NULL REFERENCES oauth_client_identities(client_key),
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method text NOT NULL,
  resource text NOT NULL DEFAULT '',
  fenix_cipher text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS oauth_codes_client_idx ON oauth_authorization_codes(client_key);

CREATE TABLE IF NOT EXISTS oauth_access_tokens (
  token_hash text PRIMARY KEY,
  client_key text NOT NULL REFERENCES oauth_client_identities(client_key),
  resource text NOT NULL DEFAULT '',
  grant_id text,
  fenix_cipher text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS oauth_access_client_idx ON oauth_access_tokens(client_key);
ALTER TABLE oauth_access_tokens ADD COLUMN IF NOT EXISTS grant_id text;
UPDATE oauth_access_tokens SET grant_id = 'legacy-access-' || token_hash WHERE grant_id IS NULL;
ALTER TABLE oauth_access_tokens ALTER COLUMN grant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS oauth_access_grant_idx ON oauth_access_tokens(grant_id);

CREATE TABLE IF NOT EXISTS oauth_refresh_tokens (
  token_hash text PRIMARY KEY,
  client_key text NOT NULL REFERENCES oauth_client_identities(client_key),
  resource text NOT NULL DEFAULT '',
  grant_id text,
  fenix_cipher text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  replay_cipher text,
  replay_expires_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS oauth_refresh_client_idx ON oauth_refresh_tokens(client_key);
ALTER TABLE oauth_refresh_tokens ADD COLUMN IF NOT EXISTS grant_id text;
UPDATE oauth_refresh_tokens SET grant_id = 'legacy-refresh-' || token_hash WHERE grant_id IS NULL;
ALTER TABLE oauth_refresh_tokens ALTER COLUMN grant_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS oauth_refresh_grant_idx ON oauth_refresh_tokens(grant_id);

CREATE TABLE IF NOT EXISTS oauth_assertion_replays (
  assertion_hash text PRIMARY KEY,
  client_key text NOT NULL REFERENCES oauth_client_identities(client_key),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_assertion_expiry_idx ON oauth_assertion_replays(expires_at);

CREATE TABLE IF NOT EXISTS oauth_revocation_events (
  event_id bigserial PRIMARY KEY,
  client_key text NOT NULL REFERENCES oauth_client_identities(client_key),
  client_kind text NOT NULL CHECK (client_kind IN ('dcr', 'metadata_document')),
  revoked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  affected jsonb NOT NULL DEFAULT '{}'::jsonb,
  operator_label text NOT NULL DEFAULT 'root-tty'
);
CREATE INDEX IF NOT EXISTS oauth_revocations_client_idx ON oauth_revocation_events(client_key, event_id DESC);

CREATE TABLE IF NOT EXISTS oauth_metadata_restores (
  restore_id bigserial PRIMARY KEY,
  client_key text NOT NULL REFERENCES oauth_client_identities(client_key),
  revocation_event_id bigint NOT NULL REFERENCES oauth_revocation_events(event_id),
  document_sha256 text NOT NULL CHECK (document_sha256 ~ '^[0-9a-f]{64}$'),
  jwks_uri text NOT NULL DEFAULT '',
  jwks_sha256 text NOT NULL DEFAULT '' CHECK (jwks_sha256 = '' OR jwks_sha256 ~ '^[0-9a-f]{64}$'),
  provenance text NOT NULL,
  restored_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (revocation_event_id)
);
CREATE INDEX IF NOT EXISTS oauth_restores_client_idx ON oauth_metadata_restores(client_key, restore_id DESC);

CREATE OR REPLACE FUNCTION oauth_restore_metadata(
  p_client_keys text[],
  p_document_sha256 text,
  p_jwks_uri text,
  p_jwks_sha256 text,
  p_provenance text
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, fenix_oauth
AS $fn$
DECLARE
  v_kind text;
  v_client_key text;
  v_event_id bigint;
  v_event_kind text;
  v_existing_id bigint;
  v_existing_doc text;
  v_existing_jwks_uri text;
  v_existing_jwks text;
BEGIN
  SELECT client_key, client_kind INTO v_client_key, v_kind
    FROM fenix_oauth.oauth_client_identities WHERE client_key = ANY(p_client_keys) LIMIT 1;
  IF v_client_key IS NULL THEN
    RAISE EXCEPTION 'metadata client identity does not exist';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_client_key, 77121));
  IF v_kind IS DISTINCT FROM 'metadata_document' THEN
    RAISE EXCEPTION 'restore is permitted only for metadata_document identities';
  END IF;

  SELECT event_id, client_kind INTO v_event_id, v_event_kind FROM fenix_oauth.oauth_revocation_events
    WHERE client_key = v_client_key ORDER BY event_id DESC LIMIT 1;
  IF v_event_id IS NULL OR v_event_kind IS DISTINCT FROM 'metadata_document' THEN
    RAISE EXCEPTION 'no metadata revocation exists';
  END IF;
  IF length(p_provenance) = 0 OR length(p_provenance) > 2048 THEN
    RAISE EXCEPTION 'restore provenance is invalid';
  END IF;
  SELECT restore_id, document_sha256, jwks_uri, jwks_sha256
    INTO v_existing_id, v_existing_doc, v_existing_jwks_uri, v_existing_jwks
    FROM fenix_oauth.oauth_metadata_restores WHERE revocation_event_id = v_event_id AND client_key = v_client_key;
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_doc = p_document_sha256 AND v_existing_jwks_uri = p_jwks_uri AND v_existing_jwks = p_jwks_sha256 THEN
      RETURN v_existing_id;
    END IF;
    RAISE EXCEPTION 'the latest metadata revocation already has a different restore';
  END IF;

  INSERT INTO fenix_oauth.oauth_metadata_restores
    (client_key, revocation_event_id, document_sha256, jwks_uri, jwks_sha256, provenance)
  VALUES (v_client_key, v_event_id, p_document_sha256, p_jwks_uri, p_jwks_sha256, p_provenance)
  RETURNING restore_id INTO v_existing_id;
  RETURN v_existing_id;
END
$fn$;

GRANT CREATE ON SCHEMA fenix_oauth TO fenix_mcp_restore_fn;
ALTER FUNCTION oauth_restore_metadata(text[], text, text, text, text) OWNER TO fenix_mcp_restore_fn;
REVOKE CREATE ON SCHEMA fenix_oauth FROM fenix_mcp_restore_fn;
REVOKE ALL ON FUNCTION oauth_restore_metadata(text[], text, text, text, text) FROM PUBLIC;

INSERT INTO oauth_schema_version(version) VALUES (3) ON CONFLICT (version) DO NOTHING;

GRANT USAGE ON SCHEMA fenix_oauth TO fenix_mcp_runtime, fenix_mcp_revoker, fenix_mcp_metadata_restore, fenix_mcp_restore_fn;

GRANT SELECT, INSERT ON oauth_client_identities, oauth_clients, oauth_metadata_initial TO fenix_mcp_runtime;
GRANT UPDATE (client_secret_hash) ON oauth_clients TO fenix_mcp_runtime;
GRANT SELECT, INSERT ON oauth_authorization_codes, oauth_access_tokens, oauth_refresh_tokens TO fenix_mcp_runtime;
GRANT SELECT, INSERT, DELETE ON oauth_assertion_replays TO fenix_mcp_runtime;
GRANT UPDATE (fenix_cipher) ON oauth_access_tokens, oauth_refresh_tokens TO fenix_mcp_runtime;
GRANT UPDATE (consumed_at, fenix_cipher) ON oauth_authorization_codes TO fenix_mcp_runtime;
GRANT UPDATE (consumed_at, expires_at, replay_cipher, replay_expires_at) ON oauth_refresh_tokens TO fenix_mcp_runtime;
GRANT UPDATE (revoked_at) ON oauth_access_tokens, oauth_refresh_tokens TO fenix_mcp_runtime;
GRANT SELECT ON oauth_revocation_events, oauth_metadata_restores, oauth_schema_version TO fenix_mcp_runtime;

GRANT SELECT ON oauth_client_identities, oauth_clients, oauth_authorization_codes, oauth_access_tokens,
  oauth_refresh_tokens, oauth_revocation_events, oauth_metadata_restores TO fenix_mcp_revoker;
GRANT INSERT ON oauth_revocation_events TO fenix_mcp_revoker;
GRANT UPDATE (revoked_at) ON oauth_clients, oauth_authorization_codes, oauth_access_tokens, oauth_refresh_tokens TO fenix_mcp_revoker;
GRANT USAGE, SELECT ON SEQUENCE oauth_revocation_events_event_id_seq TO fenix_mcp_revoker;

GRANT SELECT ON oauth_client_identities, oauth_revocation_events, oauth_metadata_restores TO fenix_mcp_restore_fn;
GRANT INSERT ON oauth_metadata_restores TO fenix_mcp_restore_fn;
GRANT USAGE, SELECT ON SEQUENCE oauth_metadata_restores_restore_id_seq TO fenix_mcp_restore_fn;
GRANT EXECUTE ON FUNCTION oauth_restore_metadata(text[], text, text, text, text) TO fenix_mcp_metadata_restore;

REVOKE UPDATE, DELETE, TRUNCATE ON oauth_client_identities, oauth_metadata_initial, oauth_revocation_events,
  oauth_metadata_restores, oauth_schema_version FROM fenix_mcp_runtime, fenix_mcp_revoker, fenix_mcp_metadata_restore, fenix_mcp_restore_fn;
REVOKE DELETE, TRUNCATE ON oauth_clients, oauth_authorization_codes, oauth_access_tokens, oauth_refresh_tokens
  FROM fenix_mcp_runtime, fenix_mcp_revoker, fenix_mcp_metadata_restore, fenix_mcp_restore_fn;

COMMIT;
