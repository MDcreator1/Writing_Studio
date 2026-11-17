'use strict';

(function initializeWorkingStore(root) {
  const entityTypes=['documents','metadataRows','pendingBatches','conflictArchives'];
  function components(value){return {
    documents:value.documents||{},metadataRows:value.metadataRows||{},
    pendingBatches:Object.fromEntries((value.pendingBatches||[]).map(item=>[item.operationId,item])),
    conflictArchives:Object.fromEntries((value.conflictArchives||[]).map(item=>[item.id,item]))
  };}
  function headerOf(value){
    const header={...value,manifest:value.manifest?{...value.manifest,documents:[],metadata:[]}:undefined};
    for(const key of entityTypes)delete header[key];
    delete header.entityIds;delete header.entityVersions;
    return structuredClone(header);
  }
  function freeze(value,seen=new WeakSet()){
    if(value&&typeof value==='object'&&!seen.has(value)){seen.add(value);for(const child of Object.values(value))freeze(child,seen);Object.freeze(value);}
    return value;
  }
  function open(name = 'lekhak-sync-working-v1') {
    return new Promise((resolve, reject) => {
      let blocked = false;
      const request = root.indexedDB.open(name, 4);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: ['scopeId', 'projectId', 'documentId'] });
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: ['scopeId', 'projectId', 'operationId'] });
        if (!db.objectStoreNames.contains('recovery')) db.createObjectStore('recovery', { keyPath: ['scopeId', 'projectId', 'documentId', 'localVersion'] });
        if (!db.objectStoreNames.contains('sequences')) db.createObjectStore('sequences', { keyPath: ['scopeId', 'projectId'] });
        if (!db.objectStoreNames.contains('remote_projects')) db.createObjectStore('remote_projects', { keyPath: ['scopeId','projectId'] });
        if (!db.objectStoreNames.contains('remote_entities')) db.createObjectStore('remote_entities',{keyPath:['scopeId','projectId','type','id']});
        const projects=request.transaction.objectStore('remote_projects');
        const entities=request.transaction.objectStore('remote_entities');
        const cursor=projects.openCursor();
        cursor.onsuccess=()=>{const item=cursor.result;if(!item)return;
          if(!item.value.entityIds){
            const value=item.value,parts=components(value),header=headerOf(value);header.entityIds={};header.entityVersions={};
            for(const type of entityTypes){header.entityIds[type]=Object.keys(parts[type]);header.entityVersions[type]={};
              for(const [id,payload] of Object.entries(parts[type])){header.entityVersions[type][id]=1;entities.put({scopeId:value.scopeId,projectId:value.projectId,type,id,version:1,value:payload});}}
            item.update(header);
          }item.continue();};
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => { blocked = true; reject(new Error('Working store upgrade is blocked by another tab.')); };
      request.onsuccess = () => {
        const db = request.result;
        if (blocked) { db.close(); return; }
        db.onversionchange = () => db.close();
        resolve(create(db));
      };
    });
  }

  function create(db) {
    const entityCache=new Map();
    const cacheKey=(scopeId,projectId,type,id)=>JSON.stringify([scopeId,projectId,type,id]);
    function validateIdentity(value, keys) {
      for (const key of keys) if (typeof value[key] !== 'string' || !value[key]) throw new Error(`Missing ${key}.`);
    }
    function getDocument(identity) {
      validateIdentity(identity, ['scopeId', 'projectId', 'documentId']);
      return new Promise((resolve, reject) => {
        const tx = db.transaction('documents', 'readonly');
        const request = tx.objectStore('documents').get([identity.scopeId, identity.projectId, identity.documentId]);
        let value;
        request.onsuccess = () => { value = request.result || null; };
        tx.oncomplete = () => resolve(value);
        tx.onabort = () => reject(tx.error || new Error('Read aborted.'));
      });
    }
    function stage(input, options = {}) {
      validateIdentity(input, ['scopeId', 'projectId', 'documentId', 'operationId']);
      if (!Number.isSafeInteger(input.baseVersion) || input.baseVersion < 0) throw new Error('Invalid base version.');
      root.LmParagraphModel.validate(input.paragraphs);
      // Clone before queuing: callers may keep typing while IndexedDB commits.
      const snapshot = structuredClone(input);
      const fingerprint = JSON.stringify([snapshot.documentId, snapshot.baseVersion, snapshot.paragraphs, snapshot.changes || null]);
      return new Promise((resolve, reject) => {
        const tx = db.transaction(['documents', 'outbox', 'recovery', 'sequences'], 'readwrite');
        const documents = tx.objectStore('documents');
        const outbox = tx.objectStore('outbox');
        let failure;
        let result;
        const abort = message => { failure = new Error(message); tx.abort(); };
        const cancel = () => { failure = new Error('Staging cancelled.'); tx.abort(); };
        const cleanup = () => options.signal?.removeEventListener('abort', cancel);
        tx.onabort = () => { cleanup(); reject(failure || tx.error || new Error('Staging aborted.')); };
        tx.oncomplete = () => { cleanup(); resolve(result); };
        if (options.signal?.aborted) { cancel(); return; }
        options.signal?.addEventListener('abort', cancel, { once: true });
        const receipt = outbox.get([snapshot.scopeId, snapshot.projectId, snapshot.operationId]);
        receipt.onsuccess = () => {
          if (receipt.result) {
            const legacyFingerprint = JSON.stringify([snapshot.documentId, snapshot.baseVersion, snapshot.paragraphs]);
            if (receipt.result.fingerprint !== fingerprint && (snapshot.changes || receipt.result.fingerprint !== legacyFingerprint)) return abort('Operation ID reused with different content.');
            result = receipt.result.localVersion;
            return;
          }
          const request = documents.get([snapshot.scopeId, snapshot.projectId, snapshot.documentId]);
          request.onsuccess = () => {
            const previous = request.result;
            if ((previous?.localVersion || 0) !== snapshot.baseVersion) return abort('Local document version conflict.');
            result = snapshot.baseVersion + 1;
            if (previous) tx.objectStore('recovery').put(previous);
            documents.put({ scopeId: snapshot.scopeId, projectId: snapshot.projectId,
              documentId: snapshot.documentId, localVersion: result, paragraphs: snapshot.paragraphs });
            const sequenceRequest = tx.objectStore('sequences').get([snapshot.scopeId, snapshot.projectId]);
            sequenceRequest.onsuccess = () => {
            const sequence = (sequenceRequest.result?.sequence || 0) + 1;
            tx.objectStore('sequences').put({ scopeId: snapshot.scopeId, projectId: snapshot.projectId, sequence });
            outbox.put({ scopeId: snapshot.scopeId, projectId: snapshot.projectId, sequence,
              operationId: snapshot.operationId, documentId: snapshot.documentId,
              baseVersion: snapshot.baseVersion, localVersion: result,
              changes: snapshot.changes || null, paragraphs: snapshot.paragraphs, fingerprint, state: 'queued' });
            };
          };
        };
      });
    }
    function pending(scopeId, projectId) {
      validateIdentity({ scopeId, projectId }, ['scopeId', 'projectId']);
      return new Promise((resolve, reject) => {
        const tx = db.transaction('outbox', 'readonly');
        const request = tx.objectStore('outbox').getAll(root.IDBKeyRange.bound([scopeId, projectId], [scopeId, projectId, []]));
        let value;
        request.onsuccess = () => { value = request.result; };
        tx.oncomplete = () => resolve(value.filter(item => item.state === 'queued').sort((a, b) => (a.sequence || 0) - (b.sequence || 0)));
        tx.onabort = () => reject(tx.error || new Error('Outbox read aborted.'));
      });
    }
    function readRecovery(identity, version) {
      validateIdentity(identity, ['scopeId', 'projectId', 'documentId']);
      return new Promise((resolve, reject) => {
        const tx = db.transaction('recovery', 'readonly');
        const request = tx.objectStore('recovery').get([identity.scopeId, identity.projectId, identity.documentId, version]);
        let result;
        request.onsuccess = () => { result = request.result || null; };
        tx.oncomplete = () => resolve(result);
        tx.onabort = () => reject(tx.error || new Error('Recovery read aborted.'));
      });
    }
    function acknowledge(identity, operationId) {
      validateIdentity(identity, ['scopeId', 'projectId']);
      return new Promise((resolve, reject) => {
        const tx = db.transaction('outbox', 'readwrite');
        const store = tx.objectStore('outbox');
        const request = store.get([identity.scopeId, identity.projectId, operationId]);
        request.onsuccess = () => { if (request.result) store.put({ ...request.result, state: 'acknowledged' }); };
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || new Error('Acknowledgement aborted.'));
      });
    }
    function hasPending(scopeIds) {
      const matchesScope = value => !scopeIds || scopeIds.includes(value.scopeId);
      return new Promise((resolve, reject) => {
        const tx = db.transaction(['outbox','remote_projects'], 'readonly');
        let found = false;
        const request = tx.objectStore('outbox').openCursor();
        request.onsuccess = () => { const cursor = request.result; if (cursor) { if(matchesScope(cursor.value) && cursor.value.state === 'queued') found = true; else cursor.continue(); } };
        const projects = tx.objectStore('remote_projects').openCursor();
        projects.onsuccess = () => { const cursor = projects.result; if(cursor) { if(matchesScope(cursor.value) && (cursor.value.pendingBatches?.length || cursor.value.conflictArchives?.length || cursor.value.entityIds?.pendingBatches?.length || cursor.value.entityIds?.conflictArchives?.length)) found = true; else cursor.continue(); } };
        tx.oncomplete = () => resolve(found);
        tx.onabort = () => reject(tx.error || new Error('Pending check aborted.'));
      });
    }
    function readRemoteProject(scopeId, projectId) {
      validateIdentity({scopeId,projectId},['scopeId','projectId']);
      return new Promise((resolve,reject) => {
        const tx=db.transaction(['remote_projects','remote_entities'],'readonly');
        const request=tx.objectStore('remote_projects').get([scopeId,projectId]);
        let header;const loaded=new Map();
        request.onsuccess=()=>{
          header=request.result||null;if(!header)return;
          for(const type of entityTypes)for(const id of header.entityIds[type]||[]){
            const key=cacheKey(scopeId,projectId,type,id),version=header.entityVersions[type][id];
            if(entityCache.get(key)?.version===version)continue;
            const entity=tx.objectStore('remote_entities').get([scopeId,projectId,type,id]);
            entity.onsuccess=()=>{if(!entity.result){tx.abort();return;}loaded.set(key,{version,value:freeze(entity.result.value)});};
          }
        };
        tx.oncomplete=()=>{
          if(!header){resolve(null);return;}
          for(const [key,value] of loaded)entityCache.set(key,value);
          const parts={};for(const type of entityTypes)parts[type]=Object.fromEntries((header.entityIds[type]||[]).map(id=>[id,entityCache.get(cacheKey(scopeId,projectId,type,id)).value]));
          const result={...header,documents:parts.documents,metadataRows:parts.metadataRows,
            pendingBatches:(header.entityIds.pendingBatches||[]).map(id=>parts.pendingBatches[id]),conflictArchives:(header.entityIds.conflictArchives||[]).map(id=>parts.conflictArchives[id])};
          if(result.manifest){result.manifest.documents=Object.values(parts.documents).map(item=>item.metadata);result.manifest.metadata=Object.values(parts.metadataRows);}
          resolve(result);
        };
        tx.onabort=()=>reject(tx.error || new Error('Remote cache read aborted.'));
      });
    }
    function writeRemoteProject(value, expectedVersion, dirty={}) {
      validateIdentity(value,['scopeId','projectId']);
      const captured=headerOf(value),parts=components(value),snapshots={},ids={};
      for(const type of entityTypes){
        ids[type]=Object.keys(parts[type]);snapshots[type]={};
        const dirtyIds=dirty[type]===undefined?null:new Set(dirty[type]);
        for(const [id,payload] of Object.entries(parts[type])){
          if(!id||['__proto__','constructor','prototype'].includes(id))throw new Error('Invalid remote entity ID.');
          const cached=entityCache.get(cacheKey(value.scopeId,value.projectId,type,id));
          const changed=type==='documents'||type==='metadataRows'?dirtyIds===null||dirtyIds.has(id)||!cached:cached?.value!==payload;
          if(changed)snapshots[type][id]=structuredClone(payload);
        }
      }
      return new Promise((resolve,reject) => {
        const tx=db.transaction(['remote_projects','remote_entities'],'readwrite');
        const store=tx.objectStore('remote_projects');
        const entities=tx.objectStore('remote_entities');let conflict=false;const saved=[];
        const request=store.get([captured.scopeId,captured.projectId]);
        request.onsuccess=()=>{
          if((request.result?.cacheVersion || 0)!==expectedVersion){conflict=true;tx.abort();return;}
          const versions={};
          for(const type of entityTypes){versions[type]={};const present=new Set(ids[type]);
            for(const id of request.result?.entityIds?.[type]||[])if(!present.has(id))entities.delete([captured.scopeId,captured.projectId,type,id]);
            for(const id of ids[type]){
              const oldVersion=request.result?.entityVersions?.[type]?.[id]||0;
              const changed=Object.hasOwn(snapshots[type],id);versions[type][id]=oldVersion+(changed?1:0);
              if(changed){const record={scopeId:captured.scopeId,projectId:captured.projectId,type,id,version:versions[type][id],value:snapshots[type][id]};entities.put(record);saved.push(record);}
            }
          }
          store.put({...captured,entityIds:ids,entityVersions:versions,cacheVersion:expectedVersion+1});
        };
        tx.oncomplete=()=>{for(const record of saved)entityCache.set(cacheKey(record.scopeId,record.projectId,record.type,record.id),{version:record.version,value:freeze(record.value)});resolve(expectedVersion+1);};
        tx.onabort=()=>{const error=tx.error || new Error('Remote cache version changed.');if(conflict)error.code='cache_conflict';reject(error);};
      });
    }
    return Object.freeze({ stage, getDocument, pending, readRecovery, acknowledge, hasPending, readRemoteProject, writeRemoteProject, close: () => db.close() });
  }
  root.LmWorkingStore = Object.freeze({ open });
})(typeof window === 'undefined' ? globalThis : window);
