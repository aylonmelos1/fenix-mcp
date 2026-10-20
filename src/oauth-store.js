import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { OAuthCrypto } from './oauth-crypto.js';

const { Pool } = pg;
const SCHEMA_VERSION = 3;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const REPLAY_TTL_MS = 30 * 1000;

export class OAuthStoreError extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'OAuthStoreError';
    this.code = 'oauth_store_unavailable';
  }
}

export class OAuthStoreOperationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OAuthStoreOperationError';
    this.code = 'oauth_store_operation';
  }
}

export class PgOAuthStore {
  constructor({ connectionString, hmacKeyring, encryptionKeyring, logger = console, poolOptions = {}, expectedDatabaseTarget = null }) {
    if (!connectionString) throw new Error('OAUTH_DATABASE_URL is required when OAuth persistence is enabled');
    this.crypto = new OAuthCrypto({ hmacKeyring, encryptionKeyring });
    this.emptySessionCipher = this.crypto.encryptJson({});
    this.logger = logger;
    this.expectedDatabaseTarget = expectedDatabaseTarget;
    this.pool = new Pool({ connectionString, max: 12, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30000, ...poolOptions });
    this.pool.on('error', (error) => this.logger.error(`[fenix-mcp] oauth store idle connection error: ${error.message}`));
  }

  close() {
    return this.pool.end();
  }

  async initialize() {
    try {
      const client = await this.pool.connect();
      try {
        await this.assertDatabaseTarget(client);
        const { rows } = await client.query('SELECT max(version)::int AS version FROM fenix_oauth.oauth_schema_version');
        if (rows[0]?.version !== SCHEMA_VERSION) throw new Error(`OAuth schema version mismatch (expected ${SCHEMA_VERSION})`);
      } finally {
        client.release();
      }
    } catch (error) {
      throw new OAuthStoreError('OAuth database/schema is unavailable or incompatible', error);
    }
  }

  async assertDatabaseTarget(client) {
    const expected = this.expectedDatabaseTarget;
    if (!expected) return;
    const connection = client.connectionParameters;
    if (connection?.host !== expected.host || Number(connection?.port) !== expected.port || connection?.database !== expected.database) {
      throw new Error('Configured PostgreSQL endpoint does not match the dedicated Fenix instance');
    }
    const { rows } = await client.query(`
      SELECT current_database() AS database
    `);
    const row = rows[0];
    if (row?.database !== expected.database) {
      throw new Error('Connected PostgreSQL identity does not match the configured dedicated Fenix instance');
    }
  }

  async ready() {
    const client = await this.pool.connect().catch((error) => { throw new OAuthStoreError('OAuth database is unavailable', error); });
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '1500ms'");
      await this.assertDatabaseTarget(client);
      const { rows } = await client.query('SELECT max(version)::int AS version FROM fenix_oauth.oauth_schema_version');
      if (rows[0]?.version !== SCHEMA_VERSION) throw new Error('OAuth schema version mismatch');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw new OAuthStoreError('OAuth database/schema is unavailable or incompatible', error);
    } finally {
      client.release();
    }
  }

  clientKey(clientId) {
    return this.crypto.hash(clientId);
  }

  async withTransaction(work) {
    const client = await this.pool.connect().catch((error) => { throw new OAuthStoreError('OAuth database is unavailable', error); });
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if (error?.name === 'OAuthError' || error instanceof OAuthStoreError || error instanceof OAuthStoreOperationError) throw error;
      throw new OAuthStoreError('OAuth database operation failed', error);
    } finally {
      client.release();
    }
  }

  async lockClient(tx, clientKey) {
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 77121))', [clientKey]);
  }

  async queryIdentity(tx, clientId, { forUpdate = false } = {}) {
    const hashes = this.crypto.lookupHashes(clientId);
    const suffix = forUpdate ? ' FOR UPDATE' : '';
    const { rows } = await tx.query(`SELECT client_key, client_kind FROM fenix_oauth.oauth_client_identities WHERE client_key = ANY($1::text[])${suffix}`, [hashes]);
    return rows[0] || null;
  }

  async assertActive(tx, clientKey, expectedKind) {
    const { rows: identities } = await tx.query(
      `SELECT i.client_kind, c.revoked_at AS client_revoked_at
       FROM fenix_oauth.oauth_client_identities i LEFT JOIN fenix_oauth.oauth_clients c USING (client_key)
       WHERE i.client_key = $1`, [clientKey]
    );
    const identity = identities[0];
    if (!identity || (expectedKind && identity.client_kind !== expectedKind)) return false;
    const { rows: revocations } = await tx.query(
      'SELECT event_id, client_kind FROM fenix_oauth.oauth_revocation_events WHERE client_key = $1 ORDER BY event_id DESC LIMIT 1', [clientKey]
    );
    const latest = revocations[0];
    if (!latest) return !identity.client_revoked_at;
    if (identity.client_kind !== 'metadata_document' || latest.client_kind !== 'metadata_document') return false;
    const { rows: restores } = await tx.query(
      'SELECT restore_id FROM fenix_oauth.oauth_metadata_restores WHERE client_key = $1 AND revocation_event_id = $2 LIMIT 1',
      [clientKey, latest.event_id]
    );
    const restored = restores.length > 0;
    if (identity.client_revoked_at && !restored) return false;
    return restored;
  }

  async findClient(clientId) {
    const client = await this.pool.connect().catch((error) => { throw new OAuthStoreError('OAuth database is unavailable', error); });
    try {
      const { rows } = await client.query(
        `SELECT i.client_key, i.client_kind, c.client_data_cipher, c.client_secret_hash, c.revoked_at
         FROM fenix_oauth.oauth_client_identities i
         JOIN fenix_oauth.oauth_clients c USING (client_key)
         WHERE i.client_key = ANY($1::text[])`, [this.crypto.lookupHashes(clientId)]
      );
      const row = rows[0];
      if (!row) return null;
      const allowed = await this.assertActive(client, row.client_key, row.client_kind);
      if (!allowed || row.revoked_at) return null;
      const data = this.crypto.decryptJson(row.client_data_cipher);
      return { ...data, client_id: clientId, client_kind: row.client_kind, client_key: row.client_key, client_secret_hash: row.client_secret_hash };
    } catch (error) {
      if (error instanceof OAuthStoreError) throw error;
      throw new OAuthStoreError('OAuth client lookup failed', error);
    } finally {
      client.release();
    }
  }

  verifyClientSecret(client, secret) {
    return Boolean(client?.client_secret_hash && this.crypto.matchesHash(secret, client.client_secret_hash));
  }

  async registerClient({ clientId, kind, data, clientSecret }) {
    return this.withTransaction(async (tx) => {
      const existing = await this.queryIdentity(tx, clientId);
      const key = existing?.client_key || this.clientKey(clientId);
      await this.lockClient(tx, key);
      if (existing && existing.client_kind !== kind) throw new OAuthStoreOperationError('OAuth client identity kind is immutable');
      await tx.query(
        `INSERT INTO fenix_oauth.oauth_client_identities(client_key, client_kind) VALUES($1, $2)
         ON CONFLICT (client_key) DO NOTHING`, [key, kind]
      );
      const cipher = this.crypto.encryptJson(data);
      const secretHash = clientSecret ? this.crypto.hash(clientSecret) : null;
      await tx.query(
        `INSERT INTO fenix_oauth.oauth_clients AS existing_client(client_key, client_data_cipher, client_secret_hash)
         VALUES($1, $2, $3) ON CONFLICT (client_key) DO UPDATE
           SET client_secret_hash = COALESCE(EXCLUDED.client_secret_hash, existing_client.client_secret_hash)`, [key, cipher, secretHash]
      );
      const status = await this.assertActive(tx, key, kind);
      if (!status) throw new OAuthStoreOperationError('OAuth client is revoked');
      return key;
    });
  }

  async registerMetadata({ clientId, client, documentSha256, jwksSha256, provenance = 'initial-tls-fetch' }) {
    return this.withTransaction(async (tx) => {
      const existing = await this.queryIdentity(tx, clientId);
      const key = existing?.client_key || this.clientKey(clientId);
      await this.lockClient(tx, key);
      if (existing && existing.client_kind !== 'metadata_document') throw new OAuthStoreOperationError('OAuth client identity kind is immutable');
      await tx.query(
        `INSERT INTO fenix_oauth.oauth_client_identities(client_key, client_kind) VALUES($1, 'metadata_document')
         ON CONFLICT (client_key) DO NOTHING`, [key]
      );
      await tx.query(
        `INSERT INTO fenix_oauth.oauth_clients(client_key, client_data_cipher, client_secret_hash)
         VALUES($1, $2, NULL) ON CONFLICT (client_key) DO NOTHING`, [key, this.crypto.encryptJson(client)]
      );
      await tx.query(
        `INSERT INTO fenix_oauth.oauth_metadata_initial(client_key, document_sha256, jwks_uri, jwks_sha256, provenance)
         VALUES($1, $2, $3, $4, $5) ON CONFLICT (client_key) DO NOTHING`,
        [key, documentSha256, client.jwks_uri || '', jwksSha256 || '', provenance]
      );
      const approval = await this.metadataApprovalByKey(tx, key);
      if (!approval || approval.blocked || approval.documentSha256 !== documentSha256 || approval.jwksUri !== (client.jwks_uri || '') || approval.jwksSha256 !== (jwksSha256 || '')) {
        return { clientKey: key, approved: false, approval };
      }
      const active = await this.assertActive(tx, key, 'metadata_document');
      return { clientKey: key, approved: active, approval };
    });
  }

  async metadataApprovalByKey(tx, key) {
    const { rows: initialRows } = await tx.query(
      `SELECT m.document_sha256, m.jwks_uri, m.jwks_sha256, c.revoked_at AS client_revoked_at
       FROM fenix_oauth.oauth_metadata_initial m JOIN fenix_oauth.oauth_clients c USING (client_key)
       WHERE m.client_key = $1`, [key]
    );
    const initial = initialRows[0];
    const { rows: revocations } = await tx.query(
      'SELECT event_id FROM fenix_oauth.oauth_revocation_events WHERE client_key = $1 ORDER BY event_id DESC LIMIT 1', [key]
    );
    const latestRevocationId = revocations[0]?.event_id || null;
    let restored = null;
    if (latestRevocationId) {
      const { rows } = await tx.query(
        `SELECT document_sha256, jwks_uri, jwks_sha256 FROM fenix_oauth.oauth_metadata_restores
         WHERE client_key = $1 AND revocation_event_id = $2 LIMIT 1`, [key, latestRevocationId]
      );
      restored = rows[0] || null;
    }
    if ((latestRevocationId && !restored) || (initial?.client_revoked_at && !restored)) {
      return { blocked: true, documentSha256: '', jwksUri: '', jwksSha256: '' };
    }
    const source = restored || initial;
    if (!source) return null;
    return {
      blocked: false,
      documentSha256: source.document_sha256,
      jwksUri: source.jwks_uri,
      jwksSha256: source.jwks_sha256
    };
  }

  async metadataApproval(clientId) {
    const client = await this.pool.connect().catch((error) => { throw new OAuthStoreError('OAuth database is unavailable', error); });
    try {
      const identity = await this.queryIdentity(client, clientId);
      if (!identity || identity.client_kind !== 'metadata_document') return null;
      const approval = await this.metadataApprovalByKey(client, identity.client_key);
      return approval ? { ...approval, clientKey: identity.client_key } : null;
    } catch (error) {
      if (error instanceof OAuthStoreError) throw error;
      throw new OAuthStoreError('OAuth metadata approval lookup failed', error);
    } finally {
      client.release();
    }
  }

  async insertCode({ code, clientKey, redirectUri, codeChallenge, codeChallengeMethod, resource, fenix, expiresAt }) {
    return this.withTransaction(async (tx) => {
      await this.lockClient(tx, clientKey);
      if (!await this.assertActive(tx, clientKey)) throw new Error('OAuth client is revoked');
      const hashes = this.crypto.lookupHashes(code);
      const { rows } = await tx.query('SELECT code_hash FROM fenix_oauth.oauth_authorization_codes WHERE code_hash = ANY($1::text[]) LIMIT 1', [hashes]);
      if (rows.length) throw new OAuthStoreOperationError('Authorization code collision');
      await tx.query(
        `INSERT INTO fenix_oauth.oauth_authorization_codes
         (code_hash, client_key, redirect_uri, code_challenge, code_challenge_method, resource, fenix_cipher, expires_at)
         VALUES($1, $2, $3, $4, $5, $6, $7, to_timestamp($8 / 1000.0))`,
        [this.crypto.hash(code), clientKey, redirectUri, codeChallenge, codeChallengeMethod, resource || '', this.crypto.encryptJson(fenix), expiresAt]
      );
    });
  }

  async peekCode(code) {
    try {
      const { rows } = await this.pool.query(
        `SELECT code_hash, client_key, redirect_uri, code_challenge, code_challenge_method, resource, expires_at, consumed_at, revoked_at
         FROM fenix_oauth.oauth_authorization_codes WHERE code_hash = ANY($1::text[]) LIMIT 1`, [this.crypto.lookupHashes(code)]
      );
      return rows[0] || null;
    } catch (error) {
      throw new OAuthStoreError('OAuth authorization-code lookup failed', error);
    }
  }

  async peekRefresh(refreshToken) {
    try {
      const { rows } = await this.pool.query(
        `SELECT token_hash, client_key, resource, grant_id, expires_at, consumed_at, revoked_at
         FROM fenix_oauth.oauth_refresh_tokens WHERE token_hash = ANY($1::text[]) LIMIT 1`, [this.crypto.lookupHashes(refreshToken)]
      );
      return rows[0] || null;
    } catch (error) {
      throw new OAuthStoreError('OAuth refresh-token lookup failed', error);
    }
  }

  async redeemCode({ code, clientKey, codeVerifier, codeChallengeMethod, codeChallenge, redirectUri, clientId, issueRefresh = true }) {
    return this.withTransaction(async (tx) => {
      await this.lockClient(tx, clientKey);
      if (!await this.assertActive(tx, clientKey)) throw new OAuthStoreOperationError('OAuth client is revoked');
      const { rows } = await tx.query(
        `SELECT * FROM fenix_oauth.oauth_authorization_codes
         WHERE code_hash = ANY($1::text[]) FOR UPDATE`, [this.crypto.lookupHashes(code)]
      );
      const row = rows[0];
      if (!row || row.client_key !== clientKey || row.revoked_at || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) {
        throw new OAuthStoreOperationError('Authorization code is invalid, expired, consumed, or revoked');
      }
      if (row.code_challenge_method !== codeChallengeMethod || row.code_challenge !== codeChallenge) throw new OAuthStoreOperationError('Authorization code parameters changed');
      if (row.redirect_uri !== redirectUri) throw new OAuthStoreOperationError('redirect_uri mismatch');
      const fenix = this.crypto.decryptJson(row.fenix_cipher);
      await tx.query(
        'UPDATE fenix_oauth.oauth_authorization_codes SET consumed_at = clock_timestamp(), fenix_cipher = $2 WHERE code_hash = $1',
        [row.code_hash, this.emptySessionCipher]
      );
      return await this.insertTokenPair(tx, clientKey, fenix, row.resource, randomToken(), issueRefresh);
    });
  }

  createTokenResponse(accessToken, refreshToken) {
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: Math.floor(ACCESS_TTL_MS / 1000),
      ...(refreshToken ? { refresh_token: refreshToken } : {})
    };
  }

  async insertTokenPair(tx, clientKey, fenix, resource = '', grantId = randomToken(), issueRefresh = true) {
    const accessToken = randomToken();
    const refreshToken = issueRefresh ? randomToken() : null;
    const now = Date.now();
    await tx.query(
      `INSERT INTO fenix_oauth.oauth_access_tokens(token_hash, client_key, resource, grant_id, fenix_cipher, expires_at)
       VALUES($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0))`,
      [this.crypto.hash(accessToken), clientKey, resource || '', grantId, this.crypto.encryptJson(fenix), now + ACCESS_TTL_MS]
    );
    if (refreshToken) {
      await tx.query(
        `INSERT INTO fenix_oauth.oauth_refresh_tokens(token_hash, client_key, resource, grant_id, fenix_cipher, expires_at)
         VALUES($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0))`,
        [this.crypto.hash(refreshToken), clientKey, resource || '', grantId, this.crypto.encryptJson(fenix), now + REFRESH_TTL_MS]
      );
    }
    return this.createTokenResponse(accessToken, refreshToken);
  }

  async issueTokens(clientKey, fenix, resource = '') {
    return this.withTransaction(async (tx) => {
      await this.lockClient(tx, clientKey);
      if (!await this.assertActive(tx, clientKey)) throw new OAuthStoreOperationError('OAuth client is revoked');
      return this.insertTokenPair(tx, clientKey, fenix, resource);
    });
  }

  async rotateRefresh({ refreshToken, clientKey }) {
    return this.withTransaction(async (tx) => {
      await this.lockClient(tx, clientKey);
      if (!await this.assertActive(tx, clientKey)) throw new OAuthStoreOperationError('OAuth client is revoked');
      const hashes = this.crypto.lookupHashes(refreshToken);
      const { rows: preRows } = await tx.query(
        'SELECT token_hash FROM fenix_oauth.oauth_refresh_tokens WHERE token_hash = ANY($1::text[]) LIMIT 1', [hashes]
      );
      const tokenHash = preRows[0]?.token_hash;
      if (!tokenHash) throw new OAuthStoreOperationError('Refresh token is invalid or expired');
      const { rows } = await tx.query('SELECT * FROM fenix_oauth.oauth_refresh_tokens WHERE token_hash = $1 FOR UPDATE', [tokenHash]);
      const stored = rows[0];
      if (!stored || stored.client_key !== clientKey || stored.revoked_at || new Date(stored.expires_at).getTime() <= Date.now()) {
        throw new OAuthStoreOperationError('Refresh token is invalid or expired');
      }
      if (stored.consumed_at) {
        if (stored.replay_cipher && stored.replay_expires_at && new Date(stored.replay_expires_at).getTime() > Date.now()) {
          return this.crypto.decryptJson(stored.replay_cipher);
        }
        throw new OAuthStoreOperationError('Refresh token has already been used');
      }
      const fenix = this.crypto.decryptJson(stored.fenix_cipher);
      const response = await this.insertTokenPair(tx, clientKey, fenix, stored.resource, stored.grant_id, true);
      const replayCipher = this.crypto.encryptJson(response);
      await tx.query(
        `UPDATE fenix_oauth.oauth_refresh_tokens
         SET consumed_at = clock_timestamp(), expires_at = to_timestamp($2 / 1000.0), replay_cipher = $3,
             replay_expires_at = to_timestamp($4 / 1000.0)
         WHERE token_hash = $1`, [tokenHash, Date.now() + REFRESH_TTL_MS, replayCipher, Date.now() + REPLAY_TTL_MS]
      );
      return response;
    });
  }

  async verifyAccessToken(token) {
    let result;
    try {
      const { rows } = await this.pool.query(
        `SELECT t.client_key, t.resource, t.grant_id, t.fenix_cipher, t.expires_at, t.revoked_at, c.revoked_at AS client_revoked_at,
                c.client_data_cipher, i.client_kind
         FROM fenix_oauth.oauth_access_tokens t
         JOIN fenix_oauth.oauth_clients c USING (client_key)
         JOIN fenix_oauth.oauth_client_identities i USING (client_key)
         WHERE t.token_hash = ANY($1::text[]) LIMIT 1`, [this.crypto.lookupHashes(token)]
      );
      result = rows[0];
    } catch (error) {
      throw new OAuthStoreError('OAuth access-token lookup failed', error);
    }
    if (!result || result.revoked_at || (result.client_revoked_at && result.client_kind !== 'metadata_document') || new Date(result.expires_at).getTime() <= Date.now()) {
      const err = new Error('Unknown, expired, or revoked access token.');
      err.name = 'OAuthError';
      err.code = 'invalid_token';
      throw err;
    }
    const client = await this.pool.connect().catch((error) => { throw new OAuthStoreError('OAuth database is unavailable', error); });
    try {
      if (!await this.assertActive(client, result.client_key)) {
        const err = new Error('Revoked access token.');
        err.name = 'OAuthError';
        err.code = 'invalid_token';
        throw err;
      }
    } catch (error) {
      if (error?.name === 'OAuthError') throw error;
      throw new OAuthStoreError('OAuth client status lookup failed', error);
    } finally {
      client.release();
    }
    const fenix = this.crypto.decryptJson(result.fenix_cipher);
    const clientData = this.crypto.decryptJson(result.client_data_cipher);
    const info = {
      token,
      clientId: clientData.client_id || result.client_key,
      scopes: [],
      expiresAt: Math.floor(new Date(result.expires_at).getTime() / 1000),
      extra: { fenix, grantId: result.grant_id }
    };
    if (result.resource) {
      try { info.resource = new URL(result.resource); } catch { /* ignore malformed stored resource */ }
    }
    return info;
  }

  async updateSession(grantId, fenix) {
    if (typeof grantId !== 'string' || !grantId) throw new OAuthStoreOperationError('OAuth grant is missing');
    const cipher = this.crypto.encryptJson(fenix);
    return this.withTransaction(async (tx) => {
      await tx.query(
        `UPDATE fenix_oauth.oauth_access_tokens SET fenix_cipher = $2
         WHERE grant_id = $1 AND revoked_at IS NULL AND expires_at > clock_timestamp()`, [grantId, cipher]
      );
      await tx.query(
        `UPDATE fenix_oauth.oauth_refresh_tokens SET fenix_cipher = $2
         WHERE grant_id = $1 AND revoked_at IS NULL AND expires_at > clock_timestamp()`, [grantId, cipher]
      );
    });
  }

  async claimClientAssertion(clientKey, jti, expiresAt) {
    const lookup = this.crypto.lookupHashes(`${clientKey}\n${jti}`);
    const activeHash = this.crypto.hash(`${clientKey}\n${jti}`);
    return this.withTransaction(async (tx) => {
      await tx.query('DELETE FROM fenix_oauth.oauth_assertion_replays WHERE expires_at <= clock_timestamp()');
      const { rows } = await tx.query(
        'SELECT assertion_hash FROM fenix_oauth.oauth_assertion_replays WHERE assertion_hash = ANY($1::text[]) LIMIT 1', [lookup]
      );
      if (rows.length) return false;
      const { rowCount } = await tx.query(
        `INSERT INTO fenix_oauth.oauth_assertion_replays(assertion_hash, client_key, expires_at)
         VALUES($1, $2, to_timestamp($3)) ON CONFLICT DO NOTHING`, [activeHash, clientKey, expiresAt]
      );
      return rowCount === 1;
    });
  }

  async revokeGrantForToken(token, clientKey) {
    if (typeof token !== 'string' || !token || typeof clientKey !== 'string' || !clientKey) return false;
    const hashes = this.crypto.lookupHashes(token);
    return this.withTransaction(async (tx) => {
      await this.lockClient(tx, clientKey);
      const { rows } = await tx.query(
        `SELECT grant_id FROM fenix_oauth.oauth_access_tokens
         WHERE token_hash = ANY($1::text[]) AND client_key = $2
         UNION ALL
         SELECT grant_id FROM fenix_oauth.oauth_refresh_tokens
         WHERE token_hash = ANY($1::text[]) AND client_key = $2
         LIMIT 1`, [hashes, clientKey]
      );
      const grantId = rows[0]?.grant_id;
      if (!grantId) return false;
      await tx.query(
        `UPDATE fenix_oauth.oauth_access_tokens SET revoked_at = clock_timestamp(), fenix_cipher = $3
         WHERE grant_id = $1 AND client_key = $2 AND revoked_at IS NULL`, [grantId, clientKey, this.emptySessionCipher]
      );
      await tx.query(
        `UPDATE fenix_oauth.oauth_refresh_tokens SET revoked_at = clock_timestamp(), fenix_cipher = $3
         WHERE grant_id = $1 AND client_key = $2 AND revoked_at IS NULL`, [grantId, clientKey, this.emptySessionCipher]
      );
      return true;
    });
  }

  async pruneExpiredSessions() {
    return this.withTransaction(async (tx) => {
      for (const table of ['oauth_authorization_codes', 'oauth_access_tokens', 'oauth_refresh_tokens']) {
        await tx.query(
          `UPDATE fenix_oauth.${table} SET fenix_cipher = $1
           WHERE expires_at <= clock_timestamp() AND fenix_cipher <> $1`, [this.emptySessionCipher]
        );
      }
    });
  }
}

function randomToken() {
  return randomBytes(32).toString('base64url');
}
