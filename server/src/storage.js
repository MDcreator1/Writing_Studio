import { createHash } from 'node:crypto';
import { ApiError, check, uuid, text, integer, object, canonical, jsonValue } from './validation.js';

const kinds = ['chapter', 'draft', 'recovery', 'trash', 'article'];
const metadataKinds = ['naming-category','naming-entry','fact','dictionary-rule','project-settings','note','news-article'];

function projectInfoFields(input) {
  const fields = {};
  if (input.author !== undefined) fields.author = text(input.author);
  if (input.synopsis !== undefined) fields.synopsis = text(input.synopsis, 100000);
  return fields;
}

export async function authorize(client, projectId, actor) {
  const ownership = await client.query('SELECT 1 FROM projects p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=$1 AND w.owner_id=$2 AND NOT (p.metadata ? \'deletedAt\')', [uuid(projectId), actor]);
  check(ownership.rows.length, 'Workspace access denied.', 403, 'forbidden');
}

async function transaction(client, action) {
  await client.query('BEGIN');
  try { const result = await action(); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
}

export function storage(database) {
  const projectTypes = ['novel', 'story', 'news'];
  async function ensureWorkspace(client, actor) {
    await client.query('INSERT INTO workspaces(id,owner_id) VALUES($1,$1) ON CONFLICT(owner_id) DO NOTHING', [actor]);
    return (await client.query('SELECT id FROM workspaces WHERE owner_id=$1', [actor])).rows[0].id;
  }
  return {
    async workspace(actor) {
      return database.withClient(async client => ({ id: await ensureWorkspace(client, actor), types: projectTypes }));
    },
    async createProject(actor, body) {
      object(body); const id = uuid(body.id);
      check(projectTypes.includes(body.type), 'Invalid project type.');
      check(['hi','en'].includes(body.language), 'Invalid language.');
      check(text(body.title).trim(), 'Project title is required.');
      return database.withClient(client => transaction(client, async () => {
        const exists = await client.query('SELECT id FROM projects WHERE id=$1', [id]);
        if (exists.rows.length) {
          await authorize(client, id, actor, true);
          throw new ApiError(409, 'conflict', 'Project already exists.');
        }
        const workspaceId = await ensureWorkspace(client, actor);
        const metadata = projectInfoFields(body);
        await client.query('INSERT INTO projects(id,title,type,language,workspace_id,metadata) VALUES($1,$2,$3,$4,$5,$6)', [id,body.title,body.type,body.language,workspaceId,metadata]);
        await client.query("INSERT INTO memberships(project_id,user_id,role) VALUES($1,$2,'owner')", [id,actor]);
        return { id, revision: 0 };
      }));
    },
    async listProjects(actor, after, limit) {
      return database.withClient(async client => {
        const result = await client.query('SELECT p.id,p.title,p.type,p.language,p.revision,p.workspace_id FROM projects p JOIN workspaces w ON w.id=p.workspace_id WHERE w.owner_id=$1 AND NOT (p.metadata ? \'deletedAt\') AND ($2::uuid IS NULL OR p.id>$2) ORDER BY p.id LIMIT $3', [actor,after || null,limit]);
        return result.rows;
      });
    },
    async deleteProject(actor, projectId, body) {
      uuid(projectId); integer(body.baseRevision);
      return database.withClient(client => transaction(client, async () => {
        const result=await client.query('SELECT p.revision,p.metadata FROM projects p JOIN workspaces w ON w.id=p.workspace_id WHERE p.id=$1 AND w.owner_id=$2 FOR UPDATE OF p',[projectId,actor]);
        const row=result.rows[0];
        check(row,'Workspace access denied.',403,'forbidden');
        if(row.metadata.deletedAt)return {id:projectId,deleted:true};
        check(row.revision===body.baseRevision,'Project changed. Refresh the list and try again.',409,'revision_conflict');
        await client.query('UPDATE projects SET metadata=$2,revision=revision+1,updated_at=now() WHERE id=$1',[projectId,{...row.metadata,deletedAt:new Date().toISOString()}]);
        return {id:projectId,deleted:true};
      }));
    },
    async manifest(actor, projectId) {
      return database.withClient(client => transaction(client, async () => {
        // Lock protects metadata reads from mixing with a concurrent batch.
        const project = await client.query('SELECT * FROM projects WHERE id=$1 FOR SHARE', [uuid(projectId)]);
        await authorize(client, projectId, actor);
        const documents = await client.query("SELECT d.*, CASE WHEN s.revision=d.revision THEN jsonb_build_object('wordCount',s.word_count,'paragraphCount',s.paragraph_count) END AS render_stats FROM documents d LEFT JOIN document_render_stats s ON s.document_id=d.id WHERE d.project_id=$1 ORDER BY CASE WHEN jsonb_typeof(d.settings->'documentOrder')='number' THEN (d.settings->>'documentOrder')::numeric ELSE 0 END,d.id", [projectId]);
        const parts = await client.query('SELECT * FROM parts WHERE project_id=$1 ORDER BY order_key,id', [projectId]);
        const metadata = await client.query('SELECT * FROM metadata_records WHERE project_id=$1 ORDER BY kind,id', [projectId]);
        const naming = await client.query('SELECT revision,category_counts,document_source_counts FROM naming_render_stats WHERE project_id=$1',[projectId]);
        return { project: project.rows[0], documents: documents.rows, parts: parts.rows, metadata: metadata.rows,
          rendering: { naming: naming.rows[0] || null } };
      }));
    },
    async apply(actor, projectId, body, {staged=false}={}) {
      object(body); uuid(projectId); uuid(body.operationId);
      jsonValue(body,staged?1500000:20000);
      check(body.protocolVersion === 1, 'Unsupported protocol version.', 409, 'protocol_mismatch');
      check(Array.isArray(body.operations) && body.operations.length > 0 && body.operations.length <= (staged?10000:1000), 'Batch exceeds the operation limit.');
      const hash = createHash('sha256').update(canonical(body)).digest('hex');
      return database.withClient(client => transaction(client, async () => {
        const project = await client.query('SELECT revision,type,language,metadata FROM projects WHERE id=$1 FOR UPDATE', [projectId]);
        await authorize(client, projectId, actor, true);
        const receipt = await client.query('SELECT actor_id,request_hash,response FROM operation_receipts WHERE project_id=$1 AND operation_id=$2', [projectId,body.operationId]);
        if (receipt.rows.length) {
          check(receipt.rows[0].actor_id === actor && receipt.rows[0].request_hash === hash, 'Operation ID was reused.', 409, 'operation_reused');
          return receipt.rows[0].response;
        }
        const revision = project.rows[0].revision + 1;
        const touched = new Set();
        const patched = new Set();
        let namingChanged=false;
        for (const operation of body.operations) {
          object(operation);
          if (operation.deleted !== undefined) check(typeof operation.deleted === 'boolean', 'Deleted must be a boolean.');
          if (operation.type === 'project.update') {
            integer(operation.baseRevision);
            check(operation.baseRevision === project.rows[0].revision, 'Project revision changed.', 409, 'revision_conflict');
            check(text(operation.title).trim(), 'Project title required.');
            const previous=project.rows[0];
            const type=operation.projectType ?? previous.type;
            const language=operation.language ?? previous.language;
            check(projectTypes.includes(type) && ['hi','en'].includes(language),'Invalid project type or language.');
            check((type==='news')===(previous.type==='news'),'Changing between News and Story requires a conversion.');
            await client.query('UPDATE projects SET title=$2,type=$3,language=$4,metadata=$5 WHERE id=$1',
              [projectId,operation.title,type,language,{...previous.metadata,...projectInfoFields(operation)}]);
          } else if (operation.type === 'part.put') {
            uuid(operation.id); text(operation.title); integer(operation.orderKey); integer(operation.baseRevision);
            const old = await client.query('SELECT revision FROM parts WHERE project_id=$1 AND id=$2', [projectId,operation.id]);
            check((old.rows[0]?.revision || 0) === operation.baseRevision, 'Part revision changed.', 409, 'revision_conflict');
            if(operation.requireEmpty===true && operation.deleted===true){
              const remaining=await client.query("SELECT 1 FROM documents WHERE project_id=$1 AND part_id=$2 AND kind='chapter' AND NOT deleted LIMIT 1",[projectId,operation.id]);
              check(!remaining.rows.length,'Part still contains chapters. Sync and try again.',409,'revision_conflict');
            }
            const synopsis = operation.synopsis === undefined ? null : text(operation.synopsis,100000);
            await client.query("INSERT INTO parts(project_id,id,title,order_key,revision,deleted,synopsis) VALUES($1,$2,$3,$4,$5,$6,coalesce($7,'')) ON CONFLICT(project_id,id) DO UPDATE SET title=$3,order_key=$4,revision=$5,deleted=$6,synopsis=coalesce($7,parts.synopsis)", [projectId,operation.id,operation.title,operation.orderKey,revision,Boolean(operation.deleted),synopsis]);
          } else if (operation.type === 'document.create') {
            uuid(operation.id); text(operation.title); check(kinds.includes(operation.kind), 'Invalid document kind.');
            if (operation.partId) uuid(operation.partId);
            if(operation.kind==='chapter'){const duplicate=await client.query("SELECT id FROM documents WHERE project_id=$1 AND kind='chapter' AND deleted=false AND lower(trim(title))=lower(trim($2))",[projectId,operation.title]);check(!duplicate.rows.length,'A chapter with this title already exists.',409,'revision_conflict');}
            await client.query('INSERT INTO documents(id,project_id,part_id,kind,title,settings,revision) VALUES($1,$2,$3,$4,$5,$6,0)', [operation.id,projectId,operation.partId || null,operation.kind,operation.title,{}]);
            touched.add(operation.id);
          } else if (operation.type === 'document.patch') {
            uuid(operation.id); integer(operation.baseRevision);
            const old = await client.query('SELECT * FROM documents WHERE id=$1 AND project_id=$2', [operation.id,projectId]);
            check(old.rows.length, 'Document not found.', 404, 'not_found');
            const document = old.rows[0];
            check(document.revision === operation.baseRevision, 'Document revision changed.', 409, 'revision_conflict');
            check(!patched.has(operation.id), 'Document may be patched once per batch.');
            patched.add(operation.id);
            touched.add(operation.id);
            check(Array.isArray(operation.upserts) && Array.isArray(operation.deletedIds) && operation.upserts.length + operation.deletedIds.length <= (staged?100000:1000), 'Invalid paragraph patch.');
            const ids = new Set();
            for (const paragraph of operation.upserts) {
              uuid(paragraph.id); integer(paragraph.orderKey); text(paragraph.text,1048576);
              check(!/[\r\n]/.test(paragraph.text), 'Paragraph text contains a line separator.');
              check(['','\n','\r','\r\n'].includes(paragraph.separator), 'Invalid paragraph separator.');
              check(!ids.has(paragraph.id), 'Duplicate paragraph ID.'); ids.add(paragraph.id);

            }
            if(operation.upserts.length)await client.query('INSERT INTO paragraphs(id,document_id,order_key,text,separator,revision,deleted) SELECT row.id,$2,row."orderKey",row.text,row.separator,$3,false FROM jsonb_to_recordset($1::jsonb) AS row(id uuid,"orderKey" bigint,text text,separator text) ON CONFLICT(document_id,id) DO UPDATE SET order_key=EXCLUDED.order_key,text=EXCLUDED.text,separator=EXCLUDED.separator,revision=EXCLUDED.revision,deleted=false',[JSON.stringify(operation.upserts),operation.id,revision]);
            for (const id of operation.deletedIds) {
              uuid(id); check(!ids.has(id), 'Paragraph cannot be updated and deleted together.'); ids.add(id);

            }
            if(operation.deletedIds.length){const deleted=await client.query('UPDATE paragraphs SET deleted=true,revision=$3 WHERE document_id=$1 AND id=ANY($2::uuid[]) RETURNING id',[operation.id,operation.deletedIds,revision]);check(deleted.rows.length===operation.deletedIds.length,'Deleted paragraph does not exist.');}
            const rows = (await client.query('SELECT order_key,separator FROM paragraphs WHERE document_id=$1 AND deleted=false ORDER BY order_key,id', [operation.id])).rows;
            check(rows.length > 0 && rows.every((row,index) => (index === rows.length-1 ? row.separator === '' : row.separator !== '') && (index === 0 || row.order_key !== rows[index-1].order_key)), 'Invalid paragraph order or final separator.');
            if (operation.title !== undefined) text(operation.title);
            if (operation.kind !== undefined) check(kinds.includes(operation.kind), 'Invalid document kind.');
            if (operation.partId !== undefined && operation.partId !== null) uuid(operation.partId);
            const settings = operation.settings === undefined ? document.settings : object(operation.settings);
            if(settings.documentOrder!==undefined)integer(settings.documentOrder);
            check(Object.keys(settings).every(key => !['text','content','body','paragraphs'].includes(key)), 'Body text cannot be stored as document settings.');
            if((operation.kind??document.kind)==='chapter'&&!(operation.deleted??document.deleted)){
              const duplicate=await client.query("SELECT id FROM documents WHERE project_id=$1 AND id<>$2 AND kind='chapter' AND deleted=false AND lower(trim(title))=lower(trim($3))",[projectId,operation.id,operation.title??document.title]);
              check(!duplicate.rows.length,'A chapter with this title already exists.',409,'revision_conflict');
            }
            await client.query('UPDATE documents SET title=$3,kind=$4,part_id=$5,settings=$6,deleted=$7,revision=$8 WHERE id=$1 AND project_id=$2', [operation.id,projectId,operation.title ?? document.title,operation.kind ?? document.kind,operation.partId === undefined ? document.part_id : operation.partId,settings,operation.deleted === undefined ? document.deleted : Boolean(operation.deleted),revision]);
          } else if (operation.type === 'metadata.put') {
            uuid(operation.id); integer(operation.baseRevision); check(metadataKinds.includes(operation.kind), 'Invalid metadata kind.'); object(operation.payload);
            if(operation.kind==='news-article')check(project.rows[0].type==='news','News article records require a News project.');
            if(operation.kind==='naming-entry')namingChanged=true;
            const old = await client.query('SELECT revision FROM metadata_records WHERE project_id=$1 AND kind=$2 AND id=$3', [projectId,operation.kind,operation.id]);
            check((old.rows[0]?.revision || 0) === operation.baseRevision, 'Metadata revision changed.', 409, 'revision_conflict');
            await client.query('INSERT INTO metadata_records(project_id,kind,id,payload,revision,deleted) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(project_id,kind,id) DO UPDATE SET payload=$4,revision=$5,deleted=$6', [projectId,operation.kind,operation.id,operation.payload,revision,Boolean(operation.deleted)]);
          } else throw new ApiError(400, 'validation', 'Unsupported operation.');
        }
        const response = { operationId: body.operationId, revision, documentIds: [...touched] };
        if(touched.size){
          const ids=[...touched];
          await client.query('UPDATE documents SET revision=$2 WHERE id=ANY($1::uuid[]) AND project_id=$3',[ids,revision,projectId]);
          await client.query('SELECT lekhak_refresh_document_stats($1::uuid[])',[ids]);
        }
        if(namingChanged)await client.query('SELECT lekhak_refresh_naming_stats($1,$2)',[projectId,revision]);
        await client.query('UPDATE projects SET revision=$2,updated_at=now() WHERE id=$1', [projectId,revision]);
        // node-postgres encodes JS arrays as SQL arrays unless serialized explicitly.
        await client.query('INSERT INTO change_log(project_id,revision,operation_id,changes) VALUES($1,$2,$3,$4)', [projectId,revision,body.operationId,JSON.stringify(body.operations)]);
        await client.query('INSERT INTO operation_receipts(project_id,operation_id,actor_id,request_hash,response) VALUES($1,$2,$3,$4,$5)', [projectId,body.operationId,actor,hash,response]);
        return response;
      }));
    },
    async paragraphs(actor, documentId, revision, after, limit, aroundId) {
      return database.withClient(client => transaction(client, async () => {
        const result = await client.query('SELECT * FROM documents WHERE id=$1 FOR SHARE', [uuid(documentId)]);
        check(result.rows.length, 'Document not found.', 404, 'not_found');
        const document = result.rows[0]; await authorize(client, document.project_id, actor);
        check(!document.deleted, 'Document is deleted.', 410, 'deleted');
        check(revision === undefined || document.revision === revision, 'Document changed; reload ranges.', 409, 'snapshot_changed');
        if (aroundId) {
          const anchor = await client.query('SELECT order_key FROM paragraphs WHERE document_id=$1 AND id=$2 AND deleted=false', [documentId,uuid(aroundId)]);
          check(anchor.rows.length, 'Paragraph not found.', 404, 'not_found');
          const preceding = await client.query('SELECT order_key FROM paragraphs WHERE document_id=$1 AND deleted=false AND order_key<=$2 ORDER BY order_key DESC LIMIT $3', [documentId,anchor.rows[0].order_key,Math.floor(limit/2)+1]);
          after = Number(preceding.rows.at(-1).order_key)-1;
        }
        const rows = (await client.query('SELECT id,order_key,text,separator,revision FROM paragraphs WHERE document_id=$1 AND deleted=false AND order_key>$2 ORDER BY order_key,id LIMIT $3', [documentId,after ?? -1,limit+1])).rows;
        const hasMore = rows.length > limit; const items = rows.slice(0,limit);
        return { documentId, revision: document.revision, paragraphs: items, nextAfter: hasMore ? items.at(-1).order_key : null };
      }));
    },
    async changes(actor, projectId, after, limit) {
      return database.withClient(async client => {
        await authorize(client, projectId, actor);
        const rows = (await client.query('SELECT revision,operation_id,changes FROM change_log WHERE project_id=$1 AND revision>$2 ORDER BY revision LIMIT $3', [projectId,after,limit])).rows;
        return { changes: rows, cursor: rows.at(-1)?.revision || after };
      });
    },
    async receipt(actor, projectId, operationId) {
      return database.withClient(async client => {
        await authorize(client, projectId, actor);
        const rows = (await client.query('SELECT response FROM operation_receipts WHERE project_id=$1 AND operation_id=$2 AND actor_id=$3', [projectId,uuid(operationId),actor])).rows;
        check(rows.length, 'Receipt not found.', 404, 'not_found'); return rows[0].response;
      });
    }
  };
}
