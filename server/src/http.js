import { createServer } from 'node:http';
import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { ApiError, check, uuid, integer } from './validation.js';
import { schemaVersion } from './db.js';
import { storage } from './storage.js';
import { promisify } from 'node:util';
import { staging } from './staging.js';

export function tokenDigest(token) { return createHash('sha256').update(token).digest('hex'); }

export function createApi({ database, tokens, instanceId, allowedOrigins = [], maxBytes = 2 * 1024 * 1024, rateLimit = 300, scanRateLimit = 1800, accounts = [] }) {
  uuid(instanceId);
  check(tokens instanceof Map && (tokens.size > 0 || accounts.length > 0), 'At least one configured account token is required.');
  for (const [digest, userId] of tokens) { check(/^[a-f0-9]{64}$/.test(digest), 'Token configuration must contain SHA-256 digests.'); uuid(userId); }
  const service = storage(database);
  const uploads = staging(database,service);
  const rates = new Map();
  const sessions = new Map();
  const loginAttempts = new Map();
  const derive = promisify(scrypt);
  const accountByName = new Map();
  for(const account of accounts){
    uuid(account.userId);
    check(typeof account.username==='string' && account.username.length>0 && !accountByName.has(account.username.toLowerCase()),'Invalid account username.');
    check(/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(account.passwordHash),'Invalid account password hash.');
    accountByName.set(account.username.toLowerCase(),account);
  }

  const numeric = (value, fallback, max) => {
    if (value === null) return fallback;
    check(typeof value === 'string' && /^\d+$/.test(value), 'Query parameter must be a non-negative integer.');
    return integer(Number(value), max);
  };
  async function jsonBody(request) {
    check((request.headers['content-type'] || '').split(';')[0] === 'application/json', 'Use application/json.', 415, 'content_type');
    if(Number(request.headers['content-length'])>maxBytes){request.resume();throw new ApiError(413,'payload_limit','Request is too large.');}
    let length = 0; const chunks = [];
    for await (const chunk of request.iterator({destroyOnReturn:false})) {
      length += chunk.length;
      if(length>maxBytes)request.resume();
      check(length <= maxBytes, 'Request is too large.', 413, 'payload_limit');
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { throw new ApiError(400, 'invalid_json', 'Invalid JSON.'); }
  }
  const server = createServer(async (request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, value) => { response.writeHead(status); response.end(JSON.stringify(value)); };
    try {
      const origin = request.headers.origin;
      if (origin) {
        check(allowedOrigins.includes(origin), 'Origin is not allowed.', 403, 'origin_denied');
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
      }
      if (request.method === 'OPTIONS') {
        response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
        response.writeHead(204); response.end(); return;
      }
      const url = new URL(request.url, 'http://localhost');
      const segments = url.pathname.split('/').filter(Boolean);
      check(segments[0] === 'api' && segments[1] === 'v1', 'Route not found.', 404, 'not_found');
      if (request.method === 'GET' && segments.length === 3 && segments[2] === 'capabilities') return send(200, {
        protocolVersion: 1, schemaVersion, instanceId, maxBatchOperations: 1000, maxBodyBytes: maxBytes,
        features: ['paragraph-records','revision-checks','operation-receipts','change-feed','metadata-records','staged-batches','owner-workspace','project-info','render-summaries',...(accounts.length?['cloud-login']:[])]
      });
      if(request.method==='POST' && ['/api/v1/login','/api/v1/register'].includes(url.pathname)){
        const registering=url.pathname.endsWith('/register');
        const now=Date.now();
        for(const [key,value] of sessions)if(value.expires<=now)sessions.delete(key);
        for(const [key,value] of loginAttempts)if(value.until<=now)loginAttempts.delete(key);
        const ip=request.socket.remoteAddress;
        const attempts=loginAttempts.get(ip)||{count:0,until:now+60000};
        attempts.count++;
        loginAttempts.set(ip,attempts);
        check(attempts.count<=8,'Try again in a minute.',429,'rate_limited');
        const body=await jsonBody(request);
        check(typeof body.username==='string' && body.username.length<=128 && typeof body.password==='string' && body.password.length<=1024,'Invalid credentials.',401,'unauthenticated');
        const username=body.username.trim().toLowerCase();
        if(registering){
          check(/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username),'User ID must be 3–32 letters, numbers, dots, hyphens or underscores.');
          check(body.password.length>=12,'Use a password with at least 12 characters.');
          check(!accountByName.has(username),'User ID is already in use.',409,'username_taken');
          const salt=randomBytes(16);
          const hash=await derive(body.password,salt,64);
          const result=await database.withClient(client=>client.query(
            'INSERT INTO cloud_accounts(username,user_id,password_hash) VALUES($1,$2,$3) ON CONFLICT(username) DO NOTHING RETURNING user_id',
            [username,randomUUID(),salt.toString('hex')+':'+hash.toString('hex')]));
          check(result.rows.length,'User ID is already in use.',409,'username_taken');
          const token=randomBytes(32).toString('base64url');
          sessions.set(tokenDigest(token),{account:{username,userId:result.rows[0].user_id,role:'user'},expires:now+8*60*60*1000});
          return send(201,{token});
        }
        const account=accountByName.get(username)||await database.withClient(async client=>(await client.query(
          'SELECT username,user_id AS "userId",password_hash AS "passwordHash" FROM cloud_accounts WHERE username=$1',[username])).rows[0]);
        const [salt,digest]=(account?.passwordHash||'0'.repeat(32)+':'+ '0'.repeat(128)).split(':');
        const hash=await derive(body.password,Buffer.from(salt,'hex'),64);
        check(account && timingSafeEqual(hash,Buffer.from(digest,'hex')),'Invalid credentials.',401,'unauthenticated');
        const token=randomBytes(32).toString('base64url');
        sessions.set(tokenDigest(token),{account,expires:now+8*60*60*1000});
        return send(200,{token});
      }
      const auth = request.headers.authorization || '';
      check(/^Bearer [^\s]+$/.test(auth), 'Authentication required.', 401, 'unauthenticated');
      const digest=tokenDigest(auth.slice(7));
      const session=sessions.get(digest);
      if(session?.expires<=Date.now())sessions.delete(digest);
      const account=sessions.get(digest)?.account;
      const actor = account?.userId || tokens.get(digest);
      check(actor, 'Invalid credentials.', 401, 'unauthenticated');
      const minute = Math.floor(Date.now()/60000);
      const scan = request.method === 'GET' && segments.length === 5 &&
        segments[2] === 'documents' && segments[4] === 'paragraphs' && url.searchParams.get('scan') === '1';
      const rateKey = scan ? actor + ':scan' : actor;
      const rate = rates.get(rateKey);
      const count = rate?.minute === minute ? rate.count + 1 : 1;
      rates.set(rateKey, { minute, count });
      if (count > (scan ? scanRateLimit : rateLimit)) {
        const retryAfter = Math.max(1, 60 - Math.floor(Date.now()/1000)%60);
        response.setHeader('Retry-After', String(retryAfter));
        throw new ApiError(429,'rate_limited',scan ? 'Scan limit reached. Try the scan again in a moment.' : 'Too many requests. Try again in a moment.');
      }
      if(request.method==='POST'&&url.pathname==='/api/v1/logout'){
        sessions.delete(digest);
        return send(200,{ok:true});
      }
      if(request.method==='GET'&&url.pathname==='/api/v1/admin/users'){
        check(account?.role==='admin','Administrator access required.',403,'forbidden');
        const users=await database.withClient(client=>client.query(
          'SELECT w.owner_id AS "userId", p.id, p.title, p.type, p.language, p.updated_at FROM workspaces w JOIN projects p ON p.workspace_id=w.id WHERE NOT (p.metadata ? $1) ORDER BY p.updated_at DESC',['deletedAt']));
        const registered=await database.withClient(client=>client.query('SELECT username,user_id AS "userId" FROM cloud_accounts ORDER BY username'));
        return send(200,{accounts:[...accounts,...registered.rows].map(user=>({userId:user.userId,username:user.username,role:user.role==='admin'?'admin':'user'})),projects:users.rows});
      }
      if(request.method==='GET'&&segments.length===5&&segments[2]==='admin'&&segments[3]==='projects'){
        check(account?.role==='admin','Administrator access required.',403,'forbidden');
        const id=uuid(segments[4]);
        const owner=await database.withClient(async client=>(await client.query(
          'SELECT w.owner_id FROM projects p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=$1',[id])).rows[0]?.owner_id);
        check(owner,'Project not found.',404,'not_found');
        return send(200,await service.manifest(owner,id));
      }
      if (request.method === 'GET' && segments.length === 3 && segments[2] === 'me') return send(200, account?{userId:actor,role:account.role==='admin'?'admin':'user'}:{userId:actor});
      if(url.pathname==='/api/v1/workspace/folder'){
        await service.workspace(actor);
        if(request.method==='POST'){
          const {path}=await jsonBody(request);
          check(path===null||(typeof path==='string'&&path.trim()&&path.length<=2048),'Invalid folder path.');
          await database.withClient(client=>client.query('UPDATE workspaces SET folder_hint=$2 WHERE owner_id=$1',[actor,path?.trim()??null]));
        }
        if(['GET','POST'].includes(request.method)){
          const result=await database.withClient(client=>client.query('SELECT folder_hint FROM workspaces WHERE owner_id=$1',[actor]));
          return send(200,{path:result.rows[0]?.folder_hint||null});
        }
      }
      if (request.method === 'GET' && segments.length === 3 && segments[2] === 'workspace') return send(200, await service.workspace(actor));
      if (segments[2] === 'projects') {
        if (segments.length === 3) {
          if (request.method === 'POST') return send(201, await service.createProject(actor, await jsonBody(request)));
          if (request.method === 'GET') {
            const after = url.searchParams.get('after'); if (after) uuid(after);
            const limit = numeric(url.searchParams.get('limit'),50,100); check(limit > 0,'Limit must be positive.');
            return send(200, { projects: await service.listProjects(actor,after,limit) });
          }
        }
        const projectId = uuid(segments[3]);
        if(segments.length===5 && segments[4]==='delete' && request.method==='POST')return send(200,await service.deleteProject(actor,projectId,await jsonBody(request)));
        if(segments[4]==='uploads'&&request.method==='POST'){
          const operationId=uuid(segments[5]);
          if(segments.length===6)return send(200,await uploads.begin(actor,projectId,operationId,await jsonBody(request)));
          if(segments.length===7&&segments[6]==='commit')return send(200,await uploads.commit(actor,projectId,operationId));
          if(segments.length===8&&segments[6]==='chunks'&&/^\d+$/.test(segments[7]))return send(200,await uploads.chunk(actor,projectId,operationId,Number(segments[7]),await jsonBody(request)));
        }
        if (segments.length === 5 && request.method === 'GET' && segments[4] === 'manifest') return send(200,await service.manifest(actor,projectId));
        if (segments.length === 5 && segments[4] === 'operations' && request.method === 'POST') return send(200,await service.apply(actor,projectId,await jsonBody(request)));
        if (segments.length === 6 && segments[4] === 'operations' && request.method === 'GET') return send(200,await service.receipt(actor,projectId,segments[5]));
        if (segments.length === 5 && segments[4] === 'changes' && request.method === 'GET') {
          const after = numeric(url.searchParams.get('after'),0,2147483647);
          const limit = numeric(url.searchParams.get('limit'),50,100); check(limit>0,'Limit must be positive.');
          return send(200,await service.changes(actor,projectId,after,limit));
        }
      }
      if (segments[2] === 'documents' && (segments.length === 5 || (segments.length === 7 && segments[5] === 'around')) && segments[4] === 'paragraphs' && request.method === 'GET') {
        const revision = url.searchParams.get('revision'); const after = url.searchParams.get('after');
        check(after === null || revision !== null, 'Continuation requires a document revision.');
        const limit = numeric(url.searchParams.get('limit'),50,100); check(limit>0,'Limit must be positive.');
        return send(200,await service.paragraphs(actor,segments[3],revision===null?undefined:numeric(revision,0,2147483647),after===null?undefined:numeric(after,0,2147483647),limit,segments[6]));
      }
      throw new ApiError(404,'not_found','Route not found.');
    } catch (error) {
      if (response.destroyed) return;
      const status = error instanceof ApiError ? error.status : ['23505','23503','23514','22P02'].includes(error.code) ? 409 : 500;
      send(status, { error: { code: error instanceof ApiError ? error.code : status===409?'constraint_conflict':'internal', message: error instanceof ApiError ? error.message : status===409?'The requested change violates a data constraint.':'Server could not complete the request.' } });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return server;
}
