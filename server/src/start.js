import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { postgres, schemaVersion } from './db.js';
import { createApi } from './http.js';
import { createLanServer } from './lan.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const tokens = new Map(JSON.parse(process.env.LEKHAK_AUTH_TOKENS || '[]').map(item => [item.tokenSha256,item.userId]));
const accounts = JSON.parse(process.env.LEKHAK_CLOUD_ACCOUNTS || '[]');
const { LEKHAK_ADMIN_USERNAME: adminUsername, LEKHAK_ADMIN_PASSWORD: adminPassword } = process.env;
if (adminUsername !== undefined || adminPassword !== undefined) {
  const admins = accounts.filter(account => account.role === 'admin');
  if (admins.length !== 1) throw new Error('Admin overrides require exactly one configured admin account.');
  const [admin] = admins;
  if (adminUsername !== undefined) {
    const username = adminUsername.trim();
    if (!username || username.length > 128) throw new Error('LEKHAK_ADMIN_USERNAME must contain 1 to 128 characters.');
    admin.username = username;
  }
  if (adminPassword !== undefined) {
    if (adminPassword.length < 12 || adminPassword.length > 1024) {
      throw new Error('LEKHAK_ADMIN_PASSWORD must contain 12 to 1024 characters.');
    }
    const salt = randomBytes(16);
    admin.passwordHash = salt.toString('hex') + ':' + scryptSync(adminPassword, salt, 64).toString('hex');
  }
}
const database = postgres(process.env.DATABASE_URL);
let server;
try {
  await database.withClient(async client => {
    const result = await client.query('SELECT max(version) AS version FROM schema_migrations');
    if (result.rows[0]?.version !== schemaVersion) throw new Error('Run the compatible storage migration before starting the server.');
  });
  server = createApi({ database, tokens, accounts, adminEnvKey: adminUsername !== undefined || adminPassword !== undefined
      ? createHash('sha256').update(JSON.stringify([adminUsername,adminPassword])).digest('hex') : null, instanceId: process.env.LEKHAK_INSTANCE_ID,
    allowedOrigins: (process.env.LEKHAK_ALLOWED_ORIGINS || '').split(',').filter(Boolean) });
  const { LEKHAK_TLS_CERT: cert, LEKHAK_TLS_KEY: key } = process.env;
  if (cert || key) {
    if (!cert || !key) throw new Error('Both LAN certificate paths are required.');
    server = await createLanServer(server, { cert, key });
  }
} catch (error) { await database.close(); throw error; }
server.listen(Number(process.env.PORT || 8788), process.env.HOST || '127.0.0.1', () => console.log('Lekhak storage API ready.'));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => database.close()));
