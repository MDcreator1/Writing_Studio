import { postgres, schemaVersion } from './db.js';
import { createApi } from './http.js';
import { createLanServer } from './lan.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const tokens = new Map(JSON.parse(process.env.LEKHAK_AUTH_TOKENS || '[]').map(item => [item.tokenSha256,item.userId]));
const database = postgres(process.env.DATABASE_URL);
let server;
try {
  await database.withClient(async client => {
    const result = await client.query('SELECT max(version) AS version FROM schema_migrations');
    if (result.rows[0]?.version !== schemaVersion) throw new Error('Run the compatible storage migration before starting the server.');
  });
  server = createApi({ database, tokens, accounts:JSON.parse(process.env.LEKHAK_CLOUD_ACCOUNTS || '[]'), instanceId: process.env.LEKHAK_INSTANCE_ID,
    allowedOrigins: (process.env.LEKHAK_ALLOWED_ORIGINS || '').split(',').filter(Boolean) });
  const { LEKHAK_TLS_CERT: cert, LEKHAK_TLS_KEY: key } = process.env;
  if (cert || key) {
    if (!cert || !key) throw new Error('Both LAN certificate paths are required.');
    server = await createLanServer(server, { cert, key });
  }
} catch (error) { await database.close(); throw error; }
server.listen(Number(process.env.PORT || 8788), process.env.HOST || '127.0.0.1', () => console.log('Lekhak storage API ready.'));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal, () => server.close(() => database.close()));
