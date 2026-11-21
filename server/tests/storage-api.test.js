import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash, scryptSync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { migrate } from '../src/db.js';
import { createApi, tokenDigest } from '../src/http.js';

let db, server, base;
const live = Boolean(process.env.LEKHAK_TEST_DATABASE_URL);
const schema = 'lekhak_test_' + randomUUID().replaceAll('-', '');
let schemaCreated = false;
const owner = randomUUID(), outsider = randomUUID(), viewer = randomUUID();
const projectId = randomUUID(), documentId = randomUUID(), firstId = randomUUID(), lastId = randomUUID();
let queue = Promise.resolve();
const database = { async withClient(action) {
  if (live) {
    const client = await db.connect();
    try { return await action(client); } finally { client.release(); }
  }
  const client = { query: (sql, params) => !params && sql.includes(';') ? db.exec(sql) : db.query(sql,params) };
  const task = queue.then(() => action(client)); queue = task.catch(() => {}); return task;
}};
const token = 'test-owner-token-only';
const adminId = randomUUID();
const adminPassword = 'test-admin-credential';
const adminSalt = Buffer.alloc(16, 9);
const adminHash = adminSalt.toString('hex') + ':' + scryptSync(adminPassword,adminSalt,64).toString('hex');
async function request(route, { method='GET', body, auth=token, origin } = {}) {
  const response = await fetch(base+route, { method,
    headers: { ...(auth?{Authorization:'Bearer '+auth}:{}), ...(body===undefined?{}:{'Content-Type':'application/json'}), ...(origin?{Origin:origin}:{}) },
    body: body===undefined?undefined:JSON.stringify(body) });
  return { status:response.status, data: await response.json(), headers: response.headers };
}
const batch = operations => ({ protocolVersion:1, operationId:randomUUID(), operations });
before(async () => {
  if (live) {
    db = new pg.Pool({ connectionString:process.env.LEKHAK_TEST_DATABASE_URL, options:'-c search_path='+schema });
    await db.query('CREATE SCHEMA "'+schema+'"'); schemaCreated=true;
  } else db = new PGlite();
  // Upgrade a populated v1 database, rather than testing only an empty install.
  const oldSql=await readFile(new URL('../migrations/001_storage.sql',import.meta.url),'utf8');
  await database.withClient(client=>client.query(oldSql));
  const oldProject=randomUUID(),oldDocument=randomUUID(),oldParagraph=randomUUID();
  await db.query("INSERT INTO projects(id,title,type,language,revision) VALUES($1,'Existing v1 project','novel','hi',7)",[oldProject]);
  const oldOwner=randomUUID();
  await db.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'owner')",[oldProject,oldOwner]);
  await db.query("INSERT INTO documents(id,project_id,kind,title,revision) VALUES($1,$2,'chapter','Existing chapter',7)",[oldDocument,oldProject]);
  await db.query("INSERT INTO paragraphs(id,document_id,order_key,text,separator,revision) VALUES($1,$2,1024,'पहले से सुरक्षित पाठ','',7)",[oldParagraph,oldDocument]);
  await migrate(database); await migrate(database);
  const stats=(await db.query('SELECT word_count,paragraph_count FROM document_render_stats WHERE document_id=$1',[oldDocument])).rows[0];
  assert.equal(Number(stats.word_count),4);
  assert.equal(Number(stats.paragraph_count),1);
  assert.equal((await db.query('SELECT text FROM paragraphs WHERE id=$1',[oldParagraph])).rows[0].text,'पहले से सुरक्षित पाठ');
  assert.equal((await db.query('SELECT workspace_id FROM projects WHERE id=$1',[oldProject])).rows[0].workspace_id,oldOwner);
  assert.deepEqual((await db.query('SELECT version FROM schema_migrations ORDER BY version')).rows.map(row=>row.version),[1,2,3,4,5,6,7,8]);
  server = createApi({ database, accounts:[{userId:adminId,username:'test-admin',role:'admin',passwordHash:adminHash}], instanceId:randomUUID(), allowedOrigins:['http://localhost:8000'],
    tokens:new Map([[tokenDigest(token),owner],[tokenDigest('outsider-token'),outsider],[tokenDigest('viewer-token'),viewer]]) });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port+'/api/v1';
});
after(async () => {
  if(server) await new Promise(resolve=>server.close(resolve));
  if(db && live) { if(schemaCreated)await db.query('DROP SCHEMA "'+schema+'" CASCADE'); await db.end(); }
  else if(db) await db.close();
});

test('authentication, CORS and schema capabilities', async () => {
  assert.equal((await request('/capabilities',{auth:null})).data.schemaVersion,8);
  assert.equal((await request('/workspace',{auth:null})).status,401);
  assert.equal((await request('/me',{auth:null})).status,401);
  assert.equal((await request('/me',{auth:'bad'})).status,401);
  assert.equal((await request('/me',{origin:'https://untrusted.invalid'})).status,403);
  assert.equal((await request('/me',{origin:'http://localhost:8000'})).headers.get('access-control-allow-origin'),'http://localhost:8000');
  assert.equal((await request('/me')).data.userId,owner);
});

test('create project and enforce owner/viewer isolation', async () => {
  const created=await request('/projects',{method:'POST',body:{id:projectId,title:'लेखक',type:'novel',language:'hi'}});
  assert.equal(created.status,201);
  assert.equal((await request('/projects')).data.projects.length,1);
  assert.equal((await request('/projects',{auth:'outsider-token'})).data.projects.length,0);
  assert.equal((await request('/projects/'+projectId+'/manifest',{auth:'outsider-token'})).status,403);
  await db.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'viewer')",[projectId,viewer]);
  assert.equal((await request('/projects/'+projectId+'/manifest',{auth:'viewer-token'})).status,403);
  assert.equal((await request('/projects/'+projectId+'/operations',{method:'POST',auth:'viewer-token',body:batch([{type:'project.update',title:'bad',baseRevision:0}])})).status,403);
});

test('one session owns a workspace with Novels, Stories and News Articles', async () => {
  const auth='outsider-token';
  const workspace=(await request('/workspace',{auth})).data;
  assert.equal(workspace.id,outsider);
  assert.deepEqual(workspace.types,['novel','story','news']);
  for(const type of workspace.types){
    const id=randomUUID();
    assert.equal((await request('/projects',{auth,method:'POST',body:{id,title:type,type,language:'hi',author:'Writer',synopsis:'Synopsis'}})).status,201);
    assert.equal((await request('/projects/'+id+'/manifest')).status,403);
    const manifest=(await request('/projects/'+id+'/manifest',{auth})).data;
    assert.equal(manifest.project.workspace_id,workspace.id);
    assert.equal(manifest.project.metadata.author,'Writer');
    const ops=[{type:'project.update',title:type+' revised',author:'Another writer',language:'en',baseRevision:0}];
    if(type==='news')ops.push({type:'metadata.put',id:randomUUID(),kind:'news-article',payload:{id:'article-a',headline:'Headline'},baseRevision:0});
    assert.equal((await request('/projects/'+id+'/operations',{auth,method:'POST',body:batch(ops)})).status,200);
    const updated=(await request('/projects/'+id+'/manifest',{auth})).data;
    assert.equal(updated.project.title,type+' revised');
    assert.equal(updated.project.metadata.synopsis,'Synopsis');
    assert.equal(updated.project.language,'en');
    if(type==='news')assert.equal(updated.metadata[0].payload.headline,'Headline');
  }
  assert.equal((await request('/projects',{auth})).data.projects.length,3);
  assert.equal((await request('/projects')).data.projects.length,1);
});

let creation;
test('atomically create document with paragraph rows and retry receipt', async () => {
  creation=batch([
    {type:'document.create',id:documentId,title:'अध्याय',kind:'chapter'},
    {type:'document.patch',id:documentId,baseRevision:0,deletedIds:[],upserts:[
      {id:firstId,orderKey:1024,text:'क्‍ष 👩‍💻',separator:'\r\n'},
      {id:lastId,orderKey:2048,text:'अंत',separator:''}
    ]}
  ]);
  const initial=await request('/projects/'+projectId+'/operations',{method:'POST',body:creation});
  assert.equal(initial.status,200,JSON.stringify(initial.data)); assert.equal(initial.data.revision,1);
  const retry=await request('/projects/'+projectId+'/operations',{method:'POST',body:creation});
  assert.deepEqual(retry.data,initial.data);
  const collision=await request('/projects/'+projectId+'/operations',{method:'POST',body:{...creation,operations:[{type:'project.update',title:'collision',baseRevision:1}]}});
  assert.equal(collision.status,409);
  assert.deepEqual((await request('/projects/'+projectId+'/operations/'+creation.operationId)).data,initial.data);
  const storedChanges = await db.query('SELECT changes FROM change_log WHERE project_id=$1 AND revision=1', [projectId]);
  assert.deepEqual(storedChanges.rows[0].changes, creation.operations);
  const bodyColumns=await db.query("SELECT column_name FROM information_schema.columns WHERE table_name='documents'");
  assert.ok(!bodyColumns.rows.some(row=>['text','content','body'].includes(row.column_name)));
});

test('paragraph pagination is revision coherent and project scoped', async () => {
  const page=await request('/documents/'+documentId+'/paragraphs?limit=1');
  assert.equal(page.data.paragraphs[0].text,'क्‍ष 👩‍💻');
  assert.equal(page.data.paragraphs[0].separator,'\r\n');
  const next=await request('/documents/'+documentId+'/paragraphs?limit=1&revision=1&after='+page.data.nextAfter);
  assert.equal(next.data.paragraphs[0].id,lastId);
  assert.equal(next.data.nextAfter,null);
  assert.equal((await request('/documents/'+documentId+'/paragraphs?after=1024')).status,400);
  assert.equal((await request('/documents/'+documentId+'/paragraphs?revision=0')).status,409);
  assert.equal((await request('/documents/'+documentId+'/paragraphs',{auth:'outsider-token'})).status,403);
  const around=await request('/documents/'+documentId+'/paragraphs/around/'+lastId+'?limit=1');
  assert.equal(around.data.paragraphs[0].id,lastId);
});

test('failed batch rolls back paragraph writes, metadata, revision and receipt', async () => {
  const failed=batch([
    {type:'document.patch',id:documentId,baseRevision:1,deletedIds:[],upserts:[{id:firstId,orderKey:1024,text:'must rollback',separator:'\r\n'}]},
    {type:'metadata.put',id:randomUUID(),kind:'unsupported',baseRevision:0,payload:{}}
  ]);
  assert.equal((await request('/projects/'+projectId+'/operations',{method:'POST',body:failed})).status,400);
  const page=await request('/documents/'+documentId+'/paragraphs');
  assert.equal(page.data.revision,1); assert.equal(page.data.paragraphs[0].text,'क्‍ष 👩‍💻');
  assert.equal((await request('/projects/'+projectId+'/operations/'+failed.operationId)).status,404);
  assert.equal((await request('/projects/'+projectId+'/changes')).data.changes.length,1);
});

test('competing edits: one commit, one revision conflict; stale ranges restart', async () => {
  const change=text=>batch([{type:'document.patch',id:documentId,baseRevision:1,deletedIds:[],upserts:[{id:firstId,orderKey:1024,text,separator:'\r\n'}]}]);
  const results=await Promise.all(['one','two'].map(text=>request('/projects/'+projectId+'/operations',{method:'POST',body:change(text)})));
  assert.deepEqual(results.map(result=>result.status).sort(),[200,409]);
  assert.equal((await request('/documents/'+documentId+'/paragraphs?revision=1')).status,409);
  assert.equal((await request('/projects/'+projectId+'/changes?after=1')).data.changes.length,1);
});

test('metadata and soft delete/restore are durable change-feed operations', async () => {
  const factId=randomUUID();
  const saved=await request('/projects/'+projectId+'/operations',{method:'POST',body:batch([
    {type:'metadata.put',id:factId,kind:'fact',baseRevision:0,payload:{text:'स्थायी तथ्य'}},
    {type:'document.patch',id:documentId,baseRevision:2,deleted:true,deletedIds:[],upserts:[]}
  ])});
  assert.equal(saved.status,200,JSON.stringify(saved.data));
  assert.equal((await request('/documents/'+documentId+'/paragraphs')).status,410);
  const manifest=await request('/projects/'+projectId+'/manifest');
  assert.equal(manifest.data.metadata[0].payload.text,'स्थायी तथ्य');
  const restored=await request('/projects/'+projectId+'/operations',{method:'POST',body:batch([{type:'document.patch',id:documentId,baseRevision:3,deleted:false,deletedIds:[],upserts:[]}])});
  assert.equal(restored.status,200);
  assert.equal((await request('/documents/'+documentId+'/paragraphs')).status,200);
});

test('invalid ordering, payload and query values are rejected without leaking SQL', async () => {
  const invalid=batch([{type:'document.patch',id:documentId,baseRevision:4,deletedIds:[],upserts:[{id:firstId,orderKey:1024,text:'invalid newline\n',separator:''}]}]);
  assert.equal((await request('/projects/'+projectId+'/operations',{method:'POST',body:invalid})).status,400);
  assert.equal((await request('/projects?limit=999')).status,400);
  assert.equal((await request('/projects?after=not-a-uuid')).status,400);
  assert.equal((await request('/projects?limit=')).status,400);
  const badBoolean=batch([{type:'document.patch',id:documentId,baseRevision:4,deleted:'false',deletedIds:[],upserts:[]}]);
  assert.equal((await request('/projects/'+projectId+'/operations',{method:'POST',body:badBoolean})).status,400);
  const badMetadata=batch([{type:'metadata.put',id:randomUUID(),kind:'fact',baseRevision:0,payload:{text:'bad\0value'}}]);
  assert.equal((await request('/projects/'+projectId+'/operations',{method:'POST',body:badMetadata})).status,400);
  const bad=await fetch(base+'/projects',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{'});
  assert.equal(bad.status,400);
});

test('paragraph soft deletion emits a tombstone; failed duplicate ordering rolls back', async () => {
  const removed=batch([{type:'document.patch',id:documentId,baseRevision:4,deletedIds:[firstId],upserts:[]}]);
  const result=await request('/projects/'+projectId+'/operations',{method:'POST',body:removed});
  assert.equal(result.status,200);
  assert.equal((await request('/documents/'+documentId+'/paragraphs')).data.paragraphs.length,1);
  const raw=await db.query('SELECT deleted FROM paragraphs WHERE document_id=$1 AND id=$2',[documentId,firstId]);
  assert.equal(raw.rows[0].deleted,true);
  const badOrder=batch([{type:'document.patch',id:documentId,baseRevision:5,deletedIds:[],upserts:[{id:firstId,orderKey:2048,text:'duplicate order',separator:'\n'}]}]);
  assert.equal((await request('/projects/'+projectId+'/operations',{method:'POST',body:badOrder})).status,400);
  assert.equal((await request('/documents/'+documentId+'/paragraphs')).data.revision,5);
});

test('staged large saves resume, isolate accounts and commit atomically', async () => {
  const largeProject=randomUUID(),largeDocument=randomUUID(),operationId=randomUUID();
  assert.equal((await request('/projects',{method:'POST',body:{id:largeProject,title:'Large fixture',type:'novel',language:'hi'}})).status,201);
  const paragraphs=Array.from({length:1601},(_,index)=>({id:randomUUID(),orderKey:(index+1)*1024,text:index+':'+('हिंदी 👩‍💻 '.repeat(90)),separator:index===1600?'':'\n'}));
  const payload={protocolVersion:1,operationId,operations:[{type:'document.create',id:largeDocument,kind:'draft',title:'Large draft'},{type:'document.patch',id:largeDocument,baseRevision:0,deletedIds:[],upserts:paragraphs}]};
  assert.equal((await request('/projects/'+largeProject+'/operations',{method:'POST',body:payload})).status,413);
  const content=JSON.stringify(payload),chunks=Array.from({length:Math.ceil(content.length/60000)},(_,i)=>content.slice(i*60000,(i+1)*60000));
  // Split away from UTF-16 boundaries; JSON strings may contain emoji.
  for(let i=0;i<chunks.length-1;i++){const last=chunks[i].charCodeAt(chunks[i].length-1);if(last>=0xd800&&last<=0xdbff){chunks[i+1]=chunks[i].slice(-1)+chunks[i+1];chunks[i]=chunks[i].slice(0,-1);}}
  const info={digest:createHash('sha256').update(content).digest('hex'),totalBytes:Buffer.byteLength(content),chunkCount:chunks.length};
  const path='/projects/'+largeProject+'/uploads/'+operationId;
  assert.equal((await request(path,{method:'POST',body:info,auth:'outsider-token'})).status,403);
  assert.equal((await request(path,{method:'POST',body:info})).status,200);
  assert.equal((await request(path+'/chunks/0',{method:'POST',body:{content:chunks[0]}})).status,200);
  assert.equal((await request(path+'/chunks/0',{method:'POST',body:{content:'different'}})).status,409);
  assert.equal((await request(path+'/commit',{method:'POST'})).data.error.code,'upload_incomplete');
  assert.equal((await request('/projects/'+largeProject+'/manifest')).data.documents.length,0,'Partial uploads must not create a visible draft');
  const resumed=await request(path,{method:'POST',body:info});assert.deepEqual(resumed.data.received,[0]);
  assert.equal((await request(path,{method:'POST',body:{...info,digest:'0'.repeat(64)}})).status,409);
  for(let index=1;index<chunks.length;index++)assert.equal((await request(path+'/chunks/'+index,{method:'POST',body:{content:chunks[index]}})).status,200);
  const committed=await request(path+'/commit',{method:'POST'});assert.equal(committed.status,200,JSON.stringify(committed.data));
  assert.deepEqual((await request(path+'/commit',{method:'POST'})).data,committed.data);
  const saved=await db.query('SELECT count(*) AS count FROM paragraphs WHERE document_id=$1',[largeDocument]);assert.equal(Number(saved.rows[0].count),1601);
  const staged=await db.query('SELECT count(*) AS count FROM staged_chunks WHERE project_id=$1',[largeProject]);assert.equal(Number(staged.rows[0].count),0,'Committed upload payload must be removed');
  assert.equal((await request('/projects/'+largeProject+'/manifest')).data.project.revision,1);
});

test('embedded database backup restores paragraphs, tombstones and receipts together', async t => {
  if (live) { t.skip('PGlite backup format test; production uses pg_dump/pg_restore.'); return; }
  const backup = await db.dumpDataDir();
  const restored = new PGlite({ loadDataDir:backup });
  try {
    const receipts=await restored.query('SELECT count(*) AS count FROM operation_receipts WHERE project_id=$1',[projectId]);
    assert.equal(Number(receipts.rows[0].count),5);
    const tombstone=await restored.query('SELECT deleted FROM paragraphs WHERE document_id=$1 AND id=$2',[documentId,firstId]);
    assert.equal(tombstone.rows[0].deleted,true);
    const project=await restored.query('SELECT revision FROM projects WHERE id=$1',[projectId]);
    assert.equal(project.rows[0].revision,5);
  } finally { await restored.close(); }
});


test('admin opens and edits another user project, moderates accounts and transfers retained projects', async () => {
  const signIn = (username,password) => request('/login',{method:'POST',auth:null,body:{username,password}});
  const administrator = await signIn('test-admin',adminPassword);
  assert.equal(administrator.status,200);
  const auth = administrator.data.token;
  const post = (path,body,session=auth) => request(path,{method:'POST',auth:session,body});
  const writer = await post('/register',{username:'moderation-writer',password:'test-writer-credential'},null);
  assert.equal(writer.status,201);
  const writerToken = writer.data.token;
  const writerId = (await request('/me',{auth:writerToken})).data.userId;
  const id = randomUUID();
  assert.equal((await post('/projects',{id,title:'Moderation example',type:'story',language:'en'},writerToken)).status,201);
  assert.equal((await request('/admin/users',{auth:writerToken})).status,403);
  assert.equal((await request('/projects/'+id+'/manifest',{auth})).status,200);
  assert.equal((await post('/projects/'+id+'/operations',batch([{type:'project.update',title:'Admin edit',baseRevision:0}]))).status,200);
  assert.equal((await post('/admin/projects/'+id,{action:'block'})).status,200);
  assert.equal((await request('/projects/'+id+'/manifest',{auth:writerToken})).status,404);
  assert.equal((await post('/admin/users/'+writerId,{status:'deleted',projects:'keep'})).status,200);
  assert.equal((await request('/me',{auth:writerToken})).status,401);
  assert.equal((await request('/admin/users',{auth})).data.projects.find(project=>project.id===id).orphan,true);
  assert.equal((await post('/admin/projects/'+id,{action:'transfer',userId:adminId})).status,200);
  assert.equal((await request('/admin/users',{auth})).data.projects.find(project=>project.id===id).orphan,false);
  assert.equal((await post('/admin/projects/'+id,{action:'delete'})).status,200);
  assert.equal((await request('/admin/users',{auth})).data.projects.some(project=>project.id===id),false);
  const secondWriter = await post('/register',{username:'deletion-writer',password:'test-writer-credential'},null);
  assert.equal(secondWriter.status,201);
  const secondToken = secondWriter.data.token;
  const secondId = (await request('/me',{auth:secondToken})).data.userId;
  const linkedId = randomUUID();
  assert.equal((await post('/projects',{id:linkedId,title:'Linked story',type:'story',language:'en'},secondToken)).status,201);
  assert.equal((await post('/admin/users/'+secondId,{status:'deleted',projects:'delete'})).status,200);
  const updated = (await request('/admin/users',{auth})).data;
  assert.equal(updated.accounts.find(user=>user.userId===secondId).status,'deleted');
  assert.equal(updated.projects.some(project=>project.id===linkedId),false);
  assert.equal((await post('/admin/credentials',{username:'test-admin-renamed',currentPassword:adminPassword,password:'new-test-admin-credential'})).status,200);
  assert.equal((await request('/me',{auth})).status,401);
  assert.equal((await signIn('test-admin-renamed','new-test-admin-credential')).status,200);
});
