import { randomBytes } from 'node:crypto';

for (const variable of ['OAUTH_HMAC_KEYRING_JSON', 'OAUTH_ENCRYPTION_KEYRING_JSON']) {
  const keyring = JSON.stringify({ active: 'v1', keys: { v1: randomBytes(32).toString('base64') } });
  console.log(`${variable}='${keyring}'`);
}
