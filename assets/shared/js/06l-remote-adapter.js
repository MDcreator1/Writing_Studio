'use strict';

(function initializeRemoteAdapter(root) {
  class RemoteError extends Error {
    constructor(message, code, status = 0) { super(message); this.name = 'RemoteError'; this.code = code; this.status = status; }
  }
  function normalizeUrl(value) {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) throw new Error('Use an API URL without credentials, query or fragment.');
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname))) throw new Error('Remote API connections require HTTPS.');
    return url.href.replace(/\/+$/, '');
  }
  function create({ baseUrl, token, timeoutMs = 15000, fetchImpl = root.fetch.bind(root) }) {
    const endpoint = normalizeUrl(baseUrl);
    if (typeof token !== 'string' || !token || /\s/.test(token)) throw new Error('A valid session token is required.');
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error('Invalid request timeout.');
    let active = true;
    const controllers = new Set();
    async function request(path, { method = 'GET', body, requestTimeout=timeoutMs } = {}) {
      if (!active) throw new RemoteError('Connection is closed.', 'disconnected');
      if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Invalid API path.');
      const controller = new AbortController(); controllers.add(controller);
      const timer = setTimeout(() => controller.abort(), requestTimeout);
      try {
        const response = await fetchImpl(endpoint + '/api/v1' + path, {
          method, signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store',
          headers: { Authorization: 'Bearer ' + token, ...(body === undefined ? {} : { 'Content-Type':'application/json' }) },
          body: body === undefined ? undefined : JSON.stringify(body)
        });
        let payload;
        try { payload = await response.json(); } catch { throw new RemoteError('API returned an invalid response.', 'invalid_response', response.status); }
        if (!response.ok) throw new RemoteError(payload.error?.message || 'Remote request failed.', payload.error?.code || 'remote_error', response.status);
        if (!active) throw new RemoteError('Connection changed during request.', 'disconnected');
        return payload;
      } catch (error) {
        if (error instanceof RemoteError) throw error;
        throw new RemoteError(controller.signal.aborted ? 'Remote request timed out or was cancelled.' : 'Could not reach the storage server.', controller.signal.aborted ? 'uncertain' : 'network');
      } finally { clearTimeout(timer); controllers.delete(controller); }
    }
    async function connect(expected = {}) {
      const [capabilities, account] = await Promise.all([request('/capabilities'), request('/me')]);
      if (capabilities.protocolVersion !== 1 || ![1,2,3,4,5,6].includes(capabilities.schemaVersion) || !Array.isArray(capabilities.features) || !capabilities.features.includes('operation-receipts')) throw new RemoteError('Server protocol is incompatible.', 'protocol_mismatch');
      if (expected.instanceId && capabilities.instanceId !== expected.instanceId) throw new RemoteError('This profile points to a different server instance.', 'identity_mismatch');
      if (expected.userId && account.userId !== expected.userId) throw new RemoteError('This profile belongs to a different account.', 'identity_mismatch');
      if (typeof account.userId !== 'string' || typeof capabilities.instanceId !== 'string') throw new RemoteError('Server identity is missing.', 'invalid_response');
      return { capabilities, account };
    }
    async function readDocument(documentId,{revision:expectedRevision,scan=false}={}) {
      const paragraphs = []; let revision=expectedRevision; let after = null;
      const seen = new Set();
      do {
        const query = new URLSearchParams({ limit:'100' });
        if(scan)query.set('scan','1');
        if (revision !== undefined) query.set('revision', String(revision));
        if (after !== null) query.set('after', String(after));
        const page = await request('/documents/' + encodeURIComponent(documentId) + '/paragraphs?' + query);
        if (!Array.isArray(page.paragraphs) || !Number.isSafeInteger(page.revision) || (revision !== undefined && page.revision !== revision)) throw new RemoteError('Document pages are inconsistent.', 'invalid_response');
        revision = page.revision;
        for (const paragraph of page.paragraphs) {
          if (seen.has(paragraph.id)) throw new RemoteError('Duplicate paragraph in document pages.', 'invalid_response');
          seen.add(paragraph.id);
          paragraphs.push({ id:paragraph.id, text:paragraph.text, separator:paragraph.separator, orderKey:Number(paragraph.order_key) });
        }
        const next = page.nextAfter;
        if (next !== null && (!page.paragraphs.length || !Number.isSafeInteger(Number(next)) || (after !== null && Number(next) <= Number(after)))) throw new RemoteError('Invalid continuation cursor.', 'invalid_response');
        after = next;
      } while (after !== null);
      // New, not-yet-filled documents are represented as an empty document.
      return { documentId, revision, paragraphs };
    }
    async function apply(projectId,batch){
      const serialized=JSON.stringify(batch);
      let nodes=0;const visit=value=>{if(++nodes>15000)return;if(value&&typeof value==='object')for(const child of Object.values(value)){visit(child);if(nodes>15000)break;}};visit(batch);
      const large=serialized.length>262144||nodes>15000||batch.operations.length>900||batch.operations.some(op=>(op.upserts?.length||0)+(op.deletedIds?.length||0)>900);
      const path='/projects/'+encodeURIComponent(projectId);
      if(!large)return request(path+'/operations',{method:'POST',body:batch});
      const capabilities=await request('/capabilities');
      if(!capabilities.features?.includes('staged-batches'))throw new RemoteError('Server update required for large saves. Edits remain on this device.','staging_unsupported');
      const bytes=new TextEncoder().encode(serialized);
      if(bytes.length>67108864)throw new RemoteError('Save exceeds the 64 MiB upload limit. Split the document or operation.','upload_limit');
      const digest=Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',bytes)),byte=>byte.toString(16).padStart(2,'0')).join('');
      const chunks=[];
      for(let offset=0;offset<serialized.length;){let end=Math.min(offset+131072,serialized.length);const code=serialized.charCodeAt(end-1);if(code>=0xd800&&code<=0xdbff)end--;chunks.push(serialized.slice(offset,end));offset=end;}
      const upload=path+'/uploads/'+encodeURIComponent(batch.operationId);
      const state=await request(upload,{method:'POST',body:{digest,totalBytes:bytes.length,chunkCount:chunks.length}});
      if(!state.committed){
        if(!Array.isArray(state.received))throw new RemoteError('Invalid upload status.','invalid_response');
        const received=new Set(state.received);
        for(let index=0;index<chunks.length;index++)if(!received.has(index))await request(upload+'/chunks/'+index,{method:'POST',body:{content:chunks[index]}});
      }
      return request(upload+'/commit',{method:'POST',requestTimeout:120000});
    }
    return Object.freeze({ request, connect, readDocument,
      listProjects: (after = '') => request('/projects' + (after ? '?after='+encodeURIComponent(after) : '')),
      deleteProject: (id,baseRevision) => request('/projects/'+encodeURIComponent(id)+'/delete',{method:'POST',body:{baseRevision}}),
      createProject: project => request('/projects', { method:'POST', body:project }),
      manifest: id => request('/projects/'+encodeURIComponent(id)+'/manifest'),
      apply,
      receipt: (id,operationId) => request('/projects/'+encodeURIComponent(id)+'/operations/'+encodeURIComponent(operationId)),
      disconnect() { active = false; for (const controller of controllers) controller.abort(); }
    });
  }
  root.LmRemoteAdapter = Object.freeze({ create, normalizeUrl, RemoteError });
})(typeof window === 'undefined' ? globalThis : window);
