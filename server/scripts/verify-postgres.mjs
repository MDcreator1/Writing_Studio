import { spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// All data belongs to this randomly named, disposable test container.
const name = 'lekhak-verification-' + randomUUID();
const password = randomBytes(24).toString('hex');
const cwd = fileURLToPath(new URL('../', import.meta.url));
let created = false;
function docker(args, { timeout = 30000, env = process.env } = {}) {
  const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout, env });
  if (result.error) throw new Error('Docker did not respond: ' + result.error.message);
  if (result.status !== 0) throw new Error((result.stderr || 'Docker command failed.').trim());
  return result.stdout.trim();
}
try {
  console.log('Checking local Docker engine…');
  docker(['version', '--format', '{{.Server.Version}}'], { timeout: 15000 });
  console.log('Starting isolated PostgreSQL 17 test container…');
  docker(['run', '--detach', '--name', name, '--label', 'lekhak.purpose=verification',
    '--publish', '127.0.0.1::5432', '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_DB=lekhak_test',
    'postgres:17'], { timeout: 300000, env: { ...process.env, POSTGRES_PASSWORD: password } });
  created = true;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { docker(['exec', name, 'pg_isready', '-U', 'postgres', '-d', 'lekhak_test'], { timeout: 5000 }); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  if (!ready) throw new Error('PostgreSQL did not become ready.');
  const address = docker(['port', name, '5432/tcp']);
  const port = address.match(/^127\.0\.0\.1:(\d+)$/)?.[1];
  if (!port) throw new Error('Unexpected test port binding.');
  const result = spawnSync(process.execPath, ['--test', 'tests/storage-api.test.js'], {
    cwd, stdio: 'inherit', windowsHide: true, timeout: 120000,
    env: { ...process.env, LEKHAK_TEST_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/lekhak_test` }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Live PostgreSQL tests failed.');
  console.log('Live PostgreSQL API verification passed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (created) {
    try { docker(['rm', '--force', '--volumes', name]); }
    catch (error) { console.error(`Test container cleanup failed (${name}): ${error.message}`); process.exitCode = 1; }
  }
}
