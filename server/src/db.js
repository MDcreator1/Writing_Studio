import { readFile } from 'node:fs/promises';
import pg from 'pg';

const migrationFiles = ['001_storage.sql', '002_staged_batches.sql', '003_owner_workspaces.sql', '004_render_summaries.sql', '005_cloud_accounts.sql', '006_workspace_folder.sql'];
export const schemaVersion = migrationFiles.length;

export function postgres(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 10, connectionTimeoutMillis: 10000,
    statement_timeout: 15000, idle_in_transaction_session_timeout: 20000 });
  return {
    async withClient(action) {
      const client = await pool.connect();
      try { return await action(client); } finally { client.release(); }
    },
    close: () => pool.end()
  };
}

export async function migrate(database) {
  const migrations = await Promise.all(migrationFiles.map(file => readFile(new URL('../migrations/'+file, import.meta.url), 'utf8')));
  return database.withClient(async client => {
    await client.query('BEGIN');
    try {
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
      await client.query('LOCK TABLE schema_migrations IN EXCLUSIVE MODE');
      const result = await client.query('SELECT version FROM schema_migrations ORDER BY version');
      if (result.rows.some(row => row.version > migrations.length)) throw new Error('Database schema is newer than this server.');
      for(let index=0;index<migrations.length;index++)if(!result.rows.some(row=>row.version===index+1))await client.query(migrations[index]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
  });
}
