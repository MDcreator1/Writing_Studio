import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { check, uuid } from './validation.js';

export function cloudAdministration(database, accounts, { envKey = null } = {}) {
  const orphanOwner = '00000000-0000-4000-8000-000000000008';
  async function transaction(action) {
    return database.withClient(async client => {
      await client.query('BEGIN');
      try {
        const result = await action(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }
  async function configuredAccounts() {
    if (!accounts.some(account => account.role === 'admin')) return accounts;
    const { rows } = await database.withClient(client => client.query(
      'SELECT user_id AS "userId",username,password_hash AS "passwordHash" FROM admin_credentials WHERE env_key IS NOT DISTINCT FROM $1',[envKey]));
    return accounts.map(account => account.role === 'admin'
      ? { ...account, ...rows.find(row => row.userId === account.userId) } : account);
  }
  async function transfer(client, id, owner) {
    await client.query('INSERT INTO workspaces(id,owner_id) VALUES($1,$1) ON CONFLICT(owner_id) DO NOTHING', [owner]);
    await client.query('UPDATE projects SET workspace_id=(SELECT id FROM workspaces WHERE owner_id=$2) WHERE id=$1', [id,owner]);
    await client.query('DELETE FROM memberships WHERE project_id=$1', [id]);
    await client.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'owner')", [id,owner]);
  }
  return {
    configuredAccounts, orphanOwner,
    async credentials(account, body) {
      check(typeof body.currentPassword === 'string' && body.currentPassword.length <= 1024, 'Enter your current password.');
      const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      check(/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username), 'Use 3–32 letters, numbers, dots, hyphens or underscores.');
      check(typeof body.password === 'string' && body.password.length >= 12 && body.password.length <= 1024, 'Use 12–1024 characters for the new password.');
      const [salt, hash] = account.passwordHash.split(':');
      check(timingSafeEqual(scryptSync(body.currentPassword,Buffer.from(salt,'hex'),64),Buffer.from(hash,'hex')), 'Current password is incorrect.',403);
      const newSalt = randomBytes(16);
      const passwordHash = newSalt.toString('hex') + ':' + scryptSync(body.password,newSalt,64).toString('hex');
      const configured = await configuredAccounts();
      check(!configured.some(user => user.userId !== account.userId && user.username.toLowerCase() === username), 'Username is already in use.',409);
      await database.withClient(async client => {
        check(!(await client.query('SELECT 1 FROM cloud_accounts WHERE username=$1',[username])).rows.length, 'Username is already in use.',409);
        await client.query('INSERT INTO admin_credentials(user_id,username,password_hash,env_key) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET username=$2,password_hash=$3,env_key=$4',[account.userId,username,passwordHash,envKey]);
      });
      return {ok:true};
    },
    async users() {
      const configured = (await configuredAccounts()).map(({userId,username,role}) => ({userId,username,role,status:'active',managed:false}));
      return database.withClient(async client => {
        const { rows } = await client.query('SELECT user_id AS "userId",username,status FROM cloud_accounts ORDER BY username');
        const users = [...configured,...rows.map(row => ({...row,role:'user',managed:true}))];
        const owners = new Set(users.filter(user => user.status !== 'deleted').map(user => user.userId));
        const projects = (await client.query(`SELECT w.owner_id AS "userId",p.id,p.title,p.type,p.admin_blocked AS blocked
          FROM projects p LEFT JOIN workspaces w ON w.id=p.workspace_id WHERE NOT (p.metadata ? 'deletedAt') ORDER BY p.updated_at DESC`)).rows;
        return {accounts:users,projects:projects.map(project => ({...project,orphan:!owners.has(project.userId)}))};
      });
    },
    async user(id, body) {
      check(['active','blocked','banned','deleted'].includes(body.status), 'Invalid account action.');
      check(['keep','block','delete'].includes(body.projects), 'Choose what happens to the projects.');
      check(!accounts.some(account => account.userId === id), 'Configured accounts are managed by the server.');
      return transaction(async client => {
        const user = (await client.query('SELECT status FROM cloud_accounts WHERE user_id=$1 FOR UPDATE',[id])).rows[0];
        check(user && user.status !== 'deleted', 'User not found.',404);
        await client.query('UPDATE cloud_accounts SET status=$2 WHERE user_id=$1',[id,body.status]);
        if (body.projects !== 'keep') {
          const update = body.projects === 'block' ? 'admin_blocked=true' : "metadata=metadata || jsonb_build_object('deletedAt',now())";
          await client.query(`UPDATE projects SET ${update},revision=revision+1,updated_at=now()
            WHERE workspace_id=(SELECT id FROM workspaces WHERE owner_id=$1) AND NOT (metadata ? 'deletedAt')`,[id]);
        }
        return {ok:true};
      });
    },
    async project(id, body) {
      return transaction(async client => {
        const project = (await client.query('SELECT workspace_id FROM projects WHERE id=$1 FOR UPDATE',[id])).rows[0];
        check(project, 'Project not found.',404);
        if (body.action === 'transfer') {
          const target = uuid(body.userId);
          const registered = await client.query("SELECT 1 FROM cloud_accounts WHERE user_id=$1 AND status='active' FOR UPDATE",[target]);
          check(registered.rows.length || accounts.some(account => account.userId === target), 'Choose an active account.');
          await transfer(client,id,target);
        } else if (body.action === 'block' || body.action === 'unblock') {
          await client.query('UPDATE projects SET admin_blocked=$2 WHERE id=$1',[id,body.action === 'block']);
        } else if (body.action === 'delete') {
          await client.query("UPDATE projects SET metadata=metadata || jsonb_build_object('deletedAt',now()),revision=revision+1,updated_at=now() WHERE id=$1",[id]);
        } else {
          check(false,'Invalid project action.');
        }
        return {ok:true};
      });
    },
    async ensureOwner(projectId) {
      await transaction(async client => {
        const { rows } = await client.query('SELECT workspace_id FROM projects WHERE id=$1 FOR UPDATE',[projectId]);
        if (rows.length && !rows[0].workspace_id) await transfer(client,projectId,orphanOwner);
      });
    }
  };
}
