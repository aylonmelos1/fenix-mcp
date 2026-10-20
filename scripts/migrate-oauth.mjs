import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const { Client } = pg;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const connectionString = process.env.OAUTH_ADMIN_DATABASE_URL;
if (!connectionString) {
  console.error('Set OAUTH_ADMIN_DATABASE_URL to a PostgreSQL admin connection before running this migration.');
  process.exit(1);
}

const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  for (const file of ['sql/000_oauth_roles.sql', 'sql/001_oauth_store.sql']) {
    await client.query(await readFile(resolve(root, file), 'utf8'));
    console.log(`Applied ${file}`);
  }
  for (const [role, variable] of [
    ['fenix_mcp_runtime', 'FENIX_MCP_RUNTIME_PASSWORD'],
    ['fenix_mcp_migrator', 'FENIX_MCP_MIGRATOR_PASSWORD'],
    ['fenix_mcp_revoker', 'FENIX_MCP_REVOKER_PASSWORD'],
    ['fenix_mcp_metadata_restore', 'FENIX_MCP_METADATA_RESTORE_PASSWORD']
  ]) {
    const password = process.env[variable];
    if (!password) continue;
    const { rows } = await client.query("SELECT format('ALTER ROLE %I PASSWORD %L', $1, $2) AS statement", [role, password]);
    await client.query(rows[0].statement);
    console.log(`Set password for ${role}`);
  }
} catch (error) {
  console.error(`OAuth migration failed (${error?.code || error?.name || 'error'}).`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
