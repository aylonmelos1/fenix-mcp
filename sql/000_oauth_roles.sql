DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fenix_mcp_migrator') THEN
    CREATE ROLE fenix_mcp_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fenix_mcp_runtime') THEN
    CREATE ROLE fenix_mcp_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fenix_mcp_revoker') THEN
    CREATE ROLE fenix_mcp_revoker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fenix_mcp_metadata_restore') THEN
    CREATE ROLE fenix_mcp_metadata_restore LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fenix_mcp_restore_fn') THEN
    CREATE ROLE fenix_mcp_restore_fn NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname IN ('fenix_mcp_migrator', 'fenix_mcp_runtime', 'fenix_mcp_revoker',
                      'fenix_mcp_metadata_restore', 'fenix_mcp_restore_fn')
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
        OR (rolname = 'fenix_mcp_restore_fn' AND rolcanlogin)
        OR (rolname <> 'fenix_mcp_restore_fn' AND NOT rolcanlogin))
  ) THEN
    RAISE EXCEPTION 'Existing Fenix OAuth roles have unsafe attributes; review them before continuing.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members AS membership
    JOIN pg_roles AS member_role ON member_role.oid = membership.member
    JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid
    WHERE member_role.rolname IN ('fenix_mcp_migrator', 'fenix_mcp_runtime', 'fenix_mcp_revoker',
                                  'fenix_mcp_metadata_restore', 'fenix_mcp_restore_fn')
      AND NOT (member_role.rolname = 'fenix_mcp_migrator' AND granted_role.rolname = 'fenix_mcp_restore_fn')
  ) THEN
    RAISE EXCEPTION 'Existing Fenix OAuth roles have unexpected role memberships; review them before continuing.';
  END IF;
END
$roles$;

GRANT fenix_mcp_restore_fn TO fenix_mcp_migrator;
