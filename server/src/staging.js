import { createHash } from 'node:crypto';
import { authorize } from './storage.js';
import { check, uuid, object, integer, text } from './validation.js';

export function staging(database, service) {
  async function access(client, actor, projectId, operationId) {
    await authorize(client, uuid(projectId), actor, true);
    const row=(await client.query('SELECT * FROM staged_batches WHERE project_id=$1 AND operation_id=$2 FOR UPDATE',[projectId,uuid(operationId)])).rows[0];
    check(row && row.actor_id===actor,'Upload not found.',404,'not_found');
    return row;
  }
  async function transaction(action) {
    return database.withClient(async client=>{
      await client.query('BEGIN');
      try{const result=await action(client);await client.query('COMMIT');return result;}
      catch(error){await client.query('ROLLBACK');throw error;}
    });
  }
  return {
    async begin(actor,projectId,operationId,body) {
      object(body);uuid(projectId);uuid(operationId);
      check(typeof body.digest==='string'&&/^[a-f0-9]{64}$/.test(body.digest),'Invalid upload digest.');
      integer(body.totalBytes,67108864);integer(body.chunkCount,512);
      check(body.totalBytes>0&&body.chunkCount>0,'Empty upload.');
      return transaction(async client=>{
        await client.query('SELECT id FROM projects WHERE id=$1 FOR UPDATE',[projectId]);
        await authorize(client,projectId,actor,true);
        // Expire abandoned work. Committed headers preserve idempotent retry identity.
        await client.query("DELETE FROM staged_batches WHERE project_id=$1 AND actor_id=$2 AND committed=false AND created_at<now()-interval '24 hours'",[projectId,actor]);
        const old=(await client.query('SELECT * FROM staged_batches WHERE project_id=$1 AND operation_id=$2',[projectId,operationId])).rows[0];
        if(old)check(old.actor_id===actor&&old.digest===body.digest&&old.total_bytes===body.totalBytes&&old.chunk_count===body.chunkCount,'Upload identity reused.',409,'operation_reused');
        else {
          const quota=(await client.query('SELECT count(*) AS count FROM staged_batches WHERE project_id=$1 AND actor_id=$2 AND committed=false',[projectId,actor])).rows[0];
          check(Number(quota.count)<4,'Too many unfinished uploads.',429,'upload_limit');
          await client.query('INSERT INTO staged_batches(project_id,operation_id,actor_id,digest,total_bytes,chunk_count) VALUES($1,$2,$3,$4,$5,$6)',[projectId,operationId,actor,body.digest,body.totalBytes,body.chunkCount]);
        }
        const received=(await client.query('SELECT chunk_index FROM staged_chunks WHERE project_id=$1 AND operation_id=$2 ORDER BY chunk_index',[projectId,operationId])).rows.map(row=>row.chunk_index);
        return {received,committed:Boolean(old?.committed)};
      });
    },
    async chunk(actor,projectId,operationId,index,body) {
      integer(index,511);object(body);text(body.content,262144);
      const bytes=Buffer.byteLength(body.content,'utf8');check(bytes>0&&bytes<=524288,'Upload chunk too large.');
      return transaction(async client=>{
        const row=await access(client,actor,projectId,operationId);
        check(!row.committed,'Upload already committed.',409,'already_committed');
        check(index<row.chunk_count,'Invalid chunk index.');
        const previous=(await client.query('SELECT content FROM staged_chunks WHERE project_id=$1 AND operation_id=$2 AND chunk_index=$3',[projectId,operationId,index])).rows[0];
        if(previous){check(previous.content===body.content,'Chunk identity reused.',409,'operation_reused');return {index};}
        const total=(await client.query('SELECT coalesce(sum(octet_length(content)),0) AS bytes FROM staged_chunks WHERE project_id=$1 AND operation_id=$2',[projectId,operationId])).rows[0];
        check(Number(total.bytes)+bytes<=row.total_bytes,'Upload exceeds declared size.');
        await client.query('INSERT INTO staged_chunks(project_id,operation_id,chunk_index,content) VALUES($1,$2,$3,$4)',[projectId,operationId,index,body.content]);
        return {index};
      });
    },
    async commit(actor,projectId,operationId) {
      const snapshot=await transaction(async client=>{
        const row=await access(client,actor,projectId,operationId);
        if(row.committed)return {committed:true};
        const chunks=(await client.query('SELECT content FROM staged_chunks WHERE project_id=$1 AND operation_id=$2 ORDER BY chunk_index',[projectId,operationId])).rows;
        check(chunks.length===row.chunk_count,'Upload is incomplete.',409,'upload_incomplete');
        const content=chunks.map(chunk=>chunk.content).join('');
        check(Buffer.byteLength(content,'utf8')===row.total_bytes&&createHash('sha256').update(content).digest('hex')===row.digest,'Upload checksum mismatch.');
        let batch;try{batch=JSON.parse(content);}catch{check(false,'Invalid uploaded JSON.');}
        object(batch);
        check(batch.operationId===operationId,'Upload operation identity mismatch.');
        return {batch};
      });
      if(snapshot.committed)return service.receipt(actor,projectId,operationId);
      const receipt=await service.apply(actor,projectId,snapshot.batch,{staged:true});
      await transaction(async client=>{
        await access(client,actor,projectId,operationId);
        await client.query('UPDATE staged_batches SET committed=true WHERE project_id=$1 AND operation_id=$2',[projectId,operationId]);
        await client.query('DELETE FROM staged_chunks WHERE project_id=$1 AND operation_id=$2',[projectId,operationId]);
      });
      return receipt;
    }
  };
}
