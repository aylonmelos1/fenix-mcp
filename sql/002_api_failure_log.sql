BEGIN;

CREATE TABLE IF NOT EXISTS fenix_oauth.fenix_api_failures (
  incident_id uuid PRIMARY KEY,
  grant_key text NOT NULL CHECK (grant_key ~ '^[0-9a-f]{64}$'),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  operation_id text NOT NULL CHECK (length(operation_id) BETWEEN 1 AND 160),
  method text NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  path_template text NOT NULL CHECK (path_template LIKE '/api/v1/%' AND length(path_template) <= 1000),
  http_status integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  error_code text NOT NULL CHECK (length(error_code) <= 120),
  error_name text NOT NULL CHECK (length(error_name) <= 120),
  validation_fields jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(validation_fields) = 'array'),
  response_keys jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(response_keys) = 'array'),
  response_content_type text CHECK (response_content_type IS NULL OR length(response_content_type) <= 100),
  response_body_type text CHECK (response_body_type IS NULL OR length(response_body_type) <= 40),
  outcome text NOT NULL CHECK (outcome IN ('not_dispatched', 'uncertain', 'not_applicable')),
  UNIQUE (incident_id, grant_key)
);

CREATE INDEX IF NOT EXISTS fenix_api_failures_grant_time_idx
  ON fenix_oauth.fenix_api_failures(grant_key, occurred_at DESC);
CREATE INDEX IF NOT EXISTS fenix_api_failures_grant_operation_time_idx
  ON fenix_oauth.fenix_api_failures(grant_key, operation_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS fenix_oauth.fenix_api_failure_reports (
  report_id bigserial PRIMARY KEY,
  incident_id uuid NOT NULL,
  grant_key text NOT NULL CHECK (grant_key ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  goal_summary text NOT NULL CHECK (length(goal_summary) BETWEEN 1 AND 1000),
  steps_attempted text NOT NULL CHECK (length(steps_attempted) BETWEEN 1 AND 2000),
  observed_result text NOT NULL CHECK (length(observed_result) BETWEEN 1 AND 1000),
  analysis text NOT NULL DEFAULT '' CHECK (length(analysis) <= 1000),
  recommended_next_step text NOT NULL CHECK (length(recommended_next_step) BETWEEN 1 AND 1000),
  FOREIGN KEY (incident_id, grant_key)
    REFERENCES fenix_oauth.fenix_api_failures(incident_id, grant_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS fenix_api_failure_reports_incident_time_idx
  ON fenix_oauth.fenix_api_failure_reports(incident_id, grant_key, created_at);

GRANT SELECT, INSERT, DELETE ON fenix_oauth.fenix_api_failures TO fenix_mcp_runtime;
GRANT SELECT, INSERT ON fenix_oauth.fenix_api_failure_reports TO fenix_mcp_runtime;
GRANT USAGE, SELECT ON SEQUENCE fenix_oauth.fenix_api_failure_reports_report_id_seq TO fenix_mcp_runtime;
REVOKE UPDATE, TRUNCATE ON fenix_oauth.fenix_api_failures, fenix_oauth.fenix_api_failure_reports FROM fenix_mcp_runtime;
REVOKE DELETE, TRUNCATE ON fenix_oauth.fenix_api_failure_reports FROM fenix_mcp_runtime;

INSERT INTO fenix_oauth.oauth_schema_version(version) VALUES (4) ON CONFLICT (version) DO NOTHING;

COMMIT;
