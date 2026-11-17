import { postgres, migrate } from './db.js';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const database = postgres(process.env.DATABASE_URL);
try { await migrate(database); console.log('Storage migrations applied.'); }
finally { await database.close(); }
