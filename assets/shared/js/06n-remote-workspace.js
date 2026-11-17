'use strict';

(function initializeRemoteWorkspace(root) {
  function withOrder(paragraphs, previous) {
    const old = new Map((previous || []).map(item => [item.id,item.orderKey]));
    const result = paragraphs.map(item => ({...item,orderKey:old.get(item.id)}));
    const tails=[],tailIndices=[],predecessors=new Int32Array(result.length);predecessors.fill(-1);
    for(let i=0;i<result.length;i++)if(Number.isSafeInteger(result[i].orderKey)){
      let low=0,high=tails.length;
      while(low<high){const middle=(low+high)>>1;if(tails[middle]<result[i].orderKey)low=middle+1;else high=middle;}
      if(low)predecessors[i]=tailIndices[low-1];tails[low]=result[i].orderKey;tailIndices[low]=i;
    }
    const stable=new Set();let cursor=tailIndices.at(-1);
    while(cursor!==undefined&&cursor>=0){stable.add(cursor);cursor=predecessors[cursor];}
    result.forEach((item,index)=>{if(!stable.has(index))item.orderKey=undefined;});
    let last=result.find(item=>item.orderKey!==undefined)?.orderKey===0?-1:0;
    for(let index=0;index<result.length;index++) {
      if(result[index].orderKey !== undefined) {
        last=result[index].orderKey;continue;
      }
      let end=index;
      while(end<result.length && result[end].orderKey===undefined)end++;
      let step=end===result.length?1024:Math.floor((result[end].orderKey-last)/(end-index+1));
      while(step<1){end++;while(end<result.length&&result[end].orderKey===undefined)end++;step=end===result.length?1024:Math.floor((result[end].orderKey-last)/(end-index+1));}
      for(let cursor=index;cursor<end;cursor++){last+=step;result[cursor].orderKey=last;}
      index=end-1;
    }
    return result;
  }
  function create({connection,store}) {
    if(!connection?.scopeId || !connection.adapter || !store)throw new Error('Connected profile and working store are required.');
    const {scopeId,adapter}=connection;
    const flushing=new Map();
    const loading=new Map();
    const read=id=>store.readRemoteProject(scopeId,id);
    const metadataKey=(kind,id)=>kind+':'+id;
    const metadataRows=manifest=>Object.fromEntries((manifest.metadata||[]).map(row=>[metadataKey(row.kind,row.id),{...row,remoteRevision:row.revision}]));
    const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
    async function mutate(id,action) {
      for(let attempt=0;attempt<8;attempt++) {
        const previous=await read(id);
        if(!previous)throw new Error('Project is not cached.');
        const copyMap=source=>{
          const target={...source},dirty=new Set();
          const proxy=new Proxy(target,{
            get(object,key){if(typeof key==='string'&&Object.hasOwn(object,key)&&!dirty.has(key)){object[key]=structuredClone(object[key]);dirty.add(key);}return Reflect.get(object,key);},
            set(object,key,value){dirty.add(key);object[key]=value;return true;},
            deleteProperty(object,key){dirty.add(key);return Reflect.deleteProperty(object,key);}
          });return {target,dirty,proxy};
        };
        const {documents:oldDocuments={},metadataRows:oldMetadata={},pendingBatches=[],conflictArchives=[],manifest,...header}=previous;
        const {documents:manifestDocuments=[],metadata:ignoredMetadata,...projectInfo}=manifest;
        const docs=copyMap(oldDocuments),metadata=copyMap(oldMetadata);
        const next={...structuredClone(header),manifest:{...structuredClone(projectInfo),documents:[...manifestDocuments],metadata:[]},documents:docs.proxy,metadataRows:metadata.proxy,pendingBatches:[...pendingBatches],conflictArchives:[...conflictArchives]};
        const result=action(next);
        const dirty={documents:next.documents===docs.proxy?[...docs.dirty]:Object.keys(next.documents),metadataRows:next.metadataRows===metadata.proxy?[...metadata.dirty]:Object.keys(next.metadataRows)};
        if(next.documents===docs.proxy)next.documents=docs.target;
        if(next.metadataRows===metadata.proxy)next.metadataRows=metadata.target;
        try {await store.writeRemoteProject(next,previous.cacheVersion,dirty);return result;}
        catch(error){if(error.code!=='cache_conflict')throw error;}
      }
      throw new Error('Another session is editing this project. Retry the operation.');
    }
    async function openProject(projectId,{refresh=false,lazy=false}={}) {
      const cached=await read(projectId);
      if(cached && !refresh)return cached;
      let manifest,documents;
      try {
        manifest=await adapter.manifest(projectId);
        documents={};
        for(const metadata of manifest.documents.filter(item=>!item.deleted)) {
          if(lazy){documents[metadata.id]={metadata,paragraphs:null,remoteParagraphs:null,remoteRevision:metadata.revision,created:false,hydrated:false};continue;}
          const body=await adapter.readDocument(metadata.id,{revision:metadata.revision});
          const paragraphs=body.paragraphs.length?body.paragraphs:root.LmParagraphModel.fromText('');
          root.LmParagraphModel.validate(paragraphs);
          documents[metadata.id]={metadata,paragraphs,remoteParagraphs:body.paragraphs,remoteRevision:body.revision,created:false};
        }
      } catch(error) {
        if(cached && error.status===0)return cached;
        throw error;
      }
      if(!cached) {
        const state={scopeId,projectId,manifest,documents,metadataRows:metadataRows(manifest),pendingBatches:[],lastError:null};
        try {await store.writeRemoteProject(state,0);}catch(error){if(error.code!=='cache_conflict')throw error;}
      } else await mutate(projectId,state=>{
        if(state.manifest.project.revision>manifest.project.revision)return;
        const merged=structuredClone(documents);
        const refreshedManifest=structuredClone(manifest);
        const dirty=new Set(state.pendingBatches.flatMap(batch=>(batch.targets||[batch]).map(target=>target.documentId)));
        for(const [id,document] of Object.entries(state.documents))if(dirty.has(id)||(merged[id] && (document.remoteRevision>merged[id].remoteRevision || (lazy && document.remoteRevision===merged[id].remoteRevision && Array.isArray(document.paragraphs)))))merged[id]=document;
        const remoteIds=new Set(manifest.documents.map(item=>item.id));
        refreshedManifest.documents.push(...state.manifest.documents.filter(item=>dirty.has(item.id)&&!remoteIds.has(item.id)));
        state.documents=merged;state.manifest=refreshedManifest;
        const metadata=metadataRows(manifest);
        const dirtyMetadata=new Set(state.pendingBatches.flatMap(batch=>(batch.metadataTargets||[]).map(target=>metadataKey(target.kind,target.id))));
        for(const [key,row] of Object.entries(state.metadataRows||{}))if(dirtyMetadata.has(key)||row.remoteRevision>(metadata[key]?.remoteRevision||0))metadata[key]=row;
        state.metadataRows=metadata;
      });
      return read(projectId);
    }
    async function ensureDocument(projectId,documentId) {
      const key=JSON.stringify([projectId,documentId]);
      if(loading.has(key))return loading.get(key);
      const task=(async()=>{
        for(let attempt=0;attempt<2;attempt++){
        const state=await read(projectId),document=state?.documents[documentId];
        if(!document || document.metadata.deleted)throw new Error('Document is not available in this project.');
        if(Array.isArray(document.paragraphs))return document;
        if(typeof adapter.readDocument!=='function'){const error=new Error('यह document इस डिवाइस पर उपलब्ध नहीं है। Connection खोलें।');error.status=0;throw error;}
        const revision=document.remoteRevision;
        let body;
        try{body=await adapter.readDocument(documentId,{revision});}
        catch(error){if(error.code==='snapshot_changed'&&attempt===0){await openProject(projectId,{refresh:true,lazy:true});continue;}throw error;}
        if(body.revision!==revision)throw new Error('Document revision changed. Refresh the project before opening it.');
        const paragraphs=body.paragraphs.length?body.paragraphs:root.LmParagraphModel.fromText('');
        root.LmParagraphModel.validate(paragraphs);
        await mutate(projectId,next=>{
          const latest=next.documents[documentId];
          if(!latest || latest.metadata.deleted || latest.remoteRevision!==revision)throw new Error('Document changed while loading. Open it again.');
          if(Array.isArray(latest.paragraphs))return;
          latest.paragraphs=paragraphs;latest.remoteParagraphs=body.paragraphs;latest.hydrated=true;
        });
        return (await read(projectId)).documents[documentId];
        }
      })();
      loading.set(key,task);
      try{return await task;}finally{loading.delete(key);}
    }
    async function readDocumentForScan(projectId,documentId) {
      const document=(await read(projectId))?.documents[documentId];
      if(!document||document.metadata.deleted)throw new Error('Document is not available in this project.');
      if(Array.isArray(document.paragraphs))return document.paragraphs;
      if(typeof adapter.readDocument!=='function')throw new Error('Connect to the database to scan uncached documents.');
      const body=await adapter.readDocument(documentId,{revision:document.remoteRevision,scan:true});
      if(body.revision!==document.remoteRevision)throw new Error('Document changed during scan. Refresh the project and try again.');
      return body.paragraphs;
    }
    async function createProject({title,type='novel',language='hi',id=root.LmParagraphModel.newId(),author,synopsis}) {
      await adapter.createProject({id,title,type,language,author,synopsis});
      return openProject(id);
    }
    async function createDocument(projectId,{title,kind='draft',id=root.LmParagraphModel.newId(),text=''}) {
      if(!['draft','chapter','article','recovery'].includes(kind))throw new Error('Unsupported document kind.');
      if(typeof title!=='string'||!title.trim()||title.length>300)throw new Error('A document title of 1–300 characters is required.');
      const paragraphs=withOrder(root.LmParagraphModel.fromText(text),[]);
      const operationId=root.LmParagraphModel.newId();
      await mutate(projectId,state=>{
        if(state.documents[id])throw new Error('Document already exists.');
        const order=Object.values(state.documents).reduce((max,item)=>Math.max(max,Number(item.metadata.settings?.documentOrder)||0),0)+1024;
        const metadata={id,project_id:projectId,title,kind,part_id:null,revision:0,settings:{documentOrder:order},deleted:false};
        state.documents[id]={metadata,paragraphs,remoteParagraphs:[],remoteRevision:0,created:true};
        state.manifest.documents.push(metadata);
        state.pendingBatches.push({operationId,documentId:id,paragraphs,title,kind,settings:metadata.settings,create:true,wireBatch:null});
      });
      return id;
    }
    async function saveDocument(projectId,documentId,text) {
      if(typeof text!=='string')throw new Error('Document text must be a string.');
      const operationId=root.LmParagraphModel.newId();
      return mutate(projectId,state=>{
        const document=state.documents[documentId];
        if(!document || !Array.isArray(document.paragraphs))throw new Error('Document text must be loaded before saving.');
        if(root.LmParagraphModel.toText(document.paragraphs)===text)return null;
        const reconciled=root.LmEditorWorkingCopy.reconcile(document.paragraphs,text);
        const paragraphs=withOrder(reconciled.paragraphs,document.paragraphs);
        document.paragraphs=paragraphs;
        state.pendingBatches.push({operationId,documentId,paragraphs,title:document.metadata.title,kind:document.metadata.kind,create:false,wireBatch:null});
        return operationId;
      });
    }
    async function transaction(projectId,changes,{checkState,sourceRemap={},allowOrder=false}={}) {
      if(!Array.isArray(changes)||!changes.length)throw new Error('A document transaction requires changes.');
      const captured=structuredClone(changes),operationId=root.LmParagraphModel.newId();
      return mutate(projectId,state=>{
        checkState?.(state);
        const seen=new Set(),targets=[],maintenance=[];
        let metadataChanged=false;
        for(const change of captured){
          const id=change.id;if(!id||seen.has(id))throw new Error('Document transaction IDs must be unique.');seen.add(id);
          let document=state.documents[id];
          if(change.create){
            if(document)throw new Error('Document already exists.');
            if(!['chapter','draft','recovery','trash','article'].includes(change.kind))throw new Error('Invalid document kind.');
            const order=allowOrder&&Number.isInteger(change.settings?.documentOrder)?change.settings.documentOrder:Object.values(state.documents).reduce((max,item)=>Math.max(max,Number(item.metadata.settings?.documentOrder)||0),0)+1024;
            const metadata={id,project_id:projectId,title:change.title||'',kind:change.kind,part_id:null,settings:{documentOrder:order},deleted:false,revision:0};
            document={metadata,paragraphs:[],remoteParagraphs:[],remoteRevision:0,created:true};
            state.documents[id]=document;state.manifest.documents.push(metadata);
          }
          if(!document || (!change.settingsOnly&&!Array.isArray(document.paragraphs)))throw new Error('Document text must be loaded before editing.');
          const previousMetadata={...document.metadata};
          if(change.text!==undefined){const next=root.LmEditorWorkingCopy.reconcile(document.paragraphs.length?document.paragraphs:undefined,change.text);document.paragraphs=withOrder(next.paragraphs,document.paragraphs);}
          if(!change.settingsOnly&&!document.paragraphs.length)document.paragraphs=withOrder(root.LmParagraphModel.fromText(''),[]);
          for(const key of ['title','kind','settings','deleted'])if(change[key]!==undefined)document.metadata[key]=change[key];
          if(!allowOrder&&previousMetadata.settings?.documentOrder!==undefined)document.metadata.settings={...document.metadata.settings,documentOrder:previousMetadata.settings.documentOrder};
          if(change.partId!==undefined)document.metadata.part_id=change.partId;
          const manifestIndex=state.manifest.documents.findIndex(item=>item.id===id);
          if(manifestIndex>=0)state.manifest.documents[manifestIndex]=document.metadata;
          targets.push({documentId:id,...(change.settingsOnly?{settingsOnly:true}:{paragraphs:document.paragraphs}),title:document.metadata.title,kind:document.metadata.kind,
            settings:document.metadata.settings,partId:document.metadata.part_id,deleted:document.metadata.deleted,create:Boolean(change.create)});
          if(change.create||previousMetadata.settings?.documentOrder!==document.metadata.settings?.documentOrder||previousMetadata.kind!==document.metadata.kind||previousMetadata.title!==document.metadata.title||previousMetadata.deleted!==document.metadata.deleted)metadataChanged=true;
        }
        if(metadataChanged){
          const indexes=new Map();
          for(const kind of ['chapter','draft'])Object.values(state.documents).filter(item=>item.metadata.kind===kind&&!item.metadata.deleted)
            .sort((a,b)=>(a.metadata.settings?.documentOrder||0)-(b.metadata.settings?.documentOrder||0)||a.metadata.id.localeCompare(b.metadata.id)).forEach((item,index)=>indexes.set(item.metadata.id,index));
          for(const row of Object.values(state.metadataRows||{}))if(row.kind==='naming-entry'&&!row.deleted&&row.payload.source){
            const oldSourceId=String(row.payload.source.documentId),mappedId=sourceRemap[oldSourceId];
            const document=state.documents[mappedId||oldSourceId];if(!document)continue;
            const payload=structuredClone(row.payload),index=indexes.get(document.metadata.id);
            payload.source=index===undefined?null:{...payload.source,...(mappedId?{documentId:mappedId,documentKey:'database/'+mappedId}:{}),documentType:document.metadata.kind,documentTitle:document.metadata.title,documentIndex:index,documentNo:index+1};
            if(canonical(payload.source)!==canonical(row.payload.source)){row.payload=payload;maintenance.push({kind:row.kind,id:row.id,payload,deleted:false,maintenance:true});}
          }
        }
        state.pendingBatches.push({operationId,targets,metadataTargets:maintenance,wireBatch:null});return operationId;
      });
    }
    const sourceSignature=document=>JSON.stringify([document.metadata.title,root.LmParagraphModel.toText(document.paragraphs)]);
    async function hash(value){return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(byte=>byte.toString(16).padStart(2,'0')).join('');}
    async function beginRecovery(projectId,sourceId){
      const state=await read(projectId),source=state?.documents[sourceId];
      if(!source||source.metadata.kind!=='chapter'||source.metadata.deleted)throw new Error('A saved chapter is required.');
      const existing=Object.values(state.documents).find(document=>document.metadata.kind==='recovery'&&!document.metadata.deleted&&document.metadata.settings?.sourceDocumentId===sourceId);
      if(existing)return existing.metadata.id;
      const signature=sourceSignature(source),id=root.LmParagraphModel.newId(),sourceBaseHash=await hash(signature);
      await transaction(projectId,[{id,create:true,kind:'recovery',title:source.metadata.title,text:root.LmParagraphModel.toText(source.paragraphs),
        settings:{sourceDocumentId:sourceId,sourceBaseHash,documentSettings:source.metadata.settings}}],{checkState:current=>{
          if(sourceSignature(current.documents[sourceId])!==signature)throw new Error('Chapter changed while opening recovery.');
          if(Object.values(current.documents).some(item=>item.metadata.kind==='recovery'&&!item.metadata.deleted&&item.metadata.settings?.sourceDocumentId===sourceId))throw new Error('Recovery was created by another session. Reopen the chapter.');
        }});
      return id;
    }
    async function commitRecovery(projectId,recoveryId){
      const state=await read(projectId),recovery=state?.documents[recoveryId];
      if(!recovery||recovery.metadata.kind!=='recovery'||recovery.metadata.deleted)throw new Error('Recovery is unavailable.');
      const source=state.documents[recovery.metadata.settings?.sourceDocumentId];
      if(!source||source.metadata.deleted||source.metadata.kind!=='chapter')throw new Error('Original chapter is unavailable; recovery was preserved.');
      const signature=sourceSignature(source),recoverySignature=sourceSignature(recovery);
      if(await hash(signature)!==recovery.metadata.settings.sourceBaseHash)throw new Error('Original chapter changed; recovery was preserved for review.');
      await transaction(projectId,[{id:source.metadata.id,text:root.LmParagraphModel.toText(recovery.paragraphs),title:recovery.metadata.title,settings:recovery.metadata.settings.documentSettings||source.metadata.settings},
        {id:recoveryId,deleted:true}],{checkState:current=>{
          if(sourceSignature(current.documents[source.metadata.id])!==signature||sourceSignature(current.documents[recoveryId])!==recoverySignature||current.documents[recoveryId].metadata.deleted)throw new Error('Chapter or recovery changed during commit. Retry after review.');
        }});
      return source.metadata.id;
    }
    async function discardRecovery(projectId,recoveryId){
      return transaction(projectId,[{id:recoveryId,deleted:true}],{checkState:state=>{if(state.documents[recoveryId]?.metadata.kind!=='recovery')throw new Error('Expected a recovery document.');}});
    }
    async function transformDocuments(projectId,transform){
      if(typeof transform!=='function')throw new Error('A text transform is required.');
      let state=await read(projectId);
      const ids=Object.values(state.documents).filter(item=>!item.metadata.deleted&&['draft','chapter','recovery'].includes(item.metadata.kind)).map(item=>item.metadata.id).sort();
      for(const id of ids)await ensureDocument(projectId,id);
      state=await read(projectId);
      const fingerprint=document=>{const {revision,...metadata}=document.metadata;return canonical({metadata,paragraphs:document.paragraphs});};
      const signatures=new Map(ids.map(id=>[id,fingerprint(state.documents[id])]));
      const changes=new Map();let count=0;
      for(let index=0;index<ids.length;index++){
        const id=ids[index],text=root.LmParagraphModel.toText(state.documents[id].paragraphs),result=transform(text);
        if(!result||typeof result.text!=='string'||!Number.isSafeInteger(result.count)||result.count<0)throw new Error('Invalid text transform result.');
        if(result.text!==text){changes.set(id,{id,text:result.text});count+=result.count;}
        if(index%16===15)await new Promise(resolve=>setTimeout(resolve,0));
      }
      for(const id of ids){
        const recovery=state.documents[id],sourceId=recovery.metadata.settings?.sourceDocumentId;
        if(recovery.metadata.kind!=='recovery'||!changes.has(sourceId))continue;
        const source=state.documents[sourceId];
        if(!source||await hash(sourceSignature(source))!==recovery.metadata.settings.sourceBaseHash)throw new Error('Resolve chapter recovery before applying replacements across the project.');
        changes.set(id,{...(changes.get(id)||{id}),settings:{...recovery.metadata.settings,sourceBaseHash:await hash(JSON.stringify([source.metadata.title,changes.get(sourceId).text]))}});
      }
      if(!changes.size)return {count:0,changed:false};
      await transaction(projectId,[...changes.values()],{checkState:latest=>{
        const currentIds=Object.values(latest.documents).filter(item=>!item.metadata.deleted&&['draft','chapter','recovery'].includes(item.metadata.kind)).map(item=>item.metadata.id).sort();
        if(JSON.stringify(currentIds)!==JSON.stringify(ids)||ids.some(id=>fingerprint(latest.documents[id])!==signatures.get(id)))throw new Error('Project changed during replacements. No bulk changes were saved; retry.');
      }});
      return {count,changed:true};
    }
    async function mergeDrafts(projectId,documentIds,{copy=false}={}){
      const ids=[...new Set(documentIds)];if(ids.length<2||ids.length!==documentIds.length)throw new Error('Select at least two distinct drafts.');
      for(const id of ids)await ensureDocument(projectId,id);
      let state=await read(projectId);
      const order=items=>items.sort((a,b)=>(a.metadata.settings?.documentOrder||0)-(b.metadata.settings?.documentOrder||0)||a.metadata.id.localeCompare(b.metadata.id));
      const drafts=order(Object.values(state.documents).filter(item=>item.metadata.kind==='draft'&&!item.metadata.deleted));
      const selected=new Set(ids),sources=drafts.filter(item=>selected.has(item.metadata.id));
      if(sources.length!==ids.length)throw new Error('Selected drafts changed. Select them again.');
      const id=root.LmParagraphModel.newId(),title=(sources[0].metadata.title+' — Merged').slice(0,300);
      const text=sources.map(item=>root.LmParagraphModel.toText(item.paragraphs).replace(/\r\n?/g,'\n').trim()).join('\n\n');
      const insertion=copy?0:drafts.findIndex(item=>selected.has(item.metadata.id));
      const remaining=copy?[...drafts]:drafts.filter(item=>!selected.has(item.metadata.id));
      const before=insertion?remaining[insertion-1].metadata.settings?.documentOrder||0:-1;
      const after=remaining[insertion]?.metadata.settings?.documentOrder;
      let position=after===undefined?before+1024:Math.floor((before+after)/2);
      const rebalance=position<=before||(after!==undefined&&position>=after);
      if(rebalance){for(const item of remaining)await ensureDocument(projectId,item.metadata.id);state=await read(projectId);position=(insertion+1)*1024;}
      const fingerprint=document=>{const {revision,...metadata}=document.metadata;return canonical({metadata,paragraphs:document.paragraphs});};
      const guarded=rebalance?[...sources,...remaining.map(item=>state.documents[item.metadata.id])]:sources;
      const signatures=new Map(guarded.map(item=>[item.metadata.id,fingerprint(item)]));
      const settings={...sources[0].metadata.settings,documentOrder:position,notes:sources.flatMap(item=>item.metadata.settings?.notes||[])};
      const changes=[{id,create:true,kind:'draft',title,text,settings}];
      if(!copy)changes.push(...sources.map(item=>({id:item.metadata.id,deleted:true})));
      if(rebalance)remaining.forEach((item,index)=>changes.push({id:item.metadata.id,settings:{...state.documents[item.metadata.id].metadata.settings,documentOrder:(index+(index>=insertion?2:1))*1024}}));
      await transaction(projectId,changes,{allowOrder:true,sourceRemap:copy?{}:Object.fromEntries(ids.map(sourceId=>[sourceId,id])),checkState:latest=>{
        const latestDrafts=order(Object.values(latest.documents).filter(item=>item.metadata.kind==='draft'&&!item.metadata.deleted));
        if(JSON.stringify(latestDrafts.map(item=>item.metadata.id))!==JSON.stringify(drafts.map(item=>item.metadata.id))||guarded.some(item=>fingerprint(latest.documents[item.metadata.id])!==signatures.get(item.metadata.id)))throw new Error('Drafts changed during merge. No sources were removed.');
      }});
      return id;
    }
    async function promoteDraft(projectId,draftId,{partId=null}={}){
      return transaction(projectId,[{id:draftId,kind:'chapter',partId}],{checkState:state=>{
        const draft=state.documents[draftId];if(!draft||draft.metadata.kind!=='draft'||draft.metadata.deleted)throw new Error('An active draft is required.');
        if(partId&&!state.manifest.parts.some(part=>part.id===partId&&!part.deleted))throw new Error('Part is no longer available.');
        if(Object.values(state.documents).some(item=>item.metadata.kind==='chapter'&&!item.metadata.deleted&&item.metadata.title.trim().toLocaleLowerCase()===draft.metadata.title.trim().toLocaleLowerCase()))throw new Error('A chapter with this title already exists.');
      }});
    }
    async function renameDocument(projectId,documentId,title){
      title=String(title).trim();if(!title||title.length>300)throw new Error('Document title must contain 1–300 characters.');
      const state=await read(projectId),document=state?.documents[documentId];if(!document||document.metadata.deleted)throw new Error('Document is unavailable.');
      if(document.metadata.title===title)return;
      const signature=sourceSignature(document),changes=[{id:documentId,title}];
      if(document.metadata.kind==='chapter'){
        if(Object.values(state.documents).some(item=>item.metadata.kind==='chapter'&&!item.metadata.deleted&&item.metadata.id!==documentId&&item.metadata.title.trim().toLocaleLowerCase()===title.toLocaleLowerCase()))throw new Error('A chapter with this title already exists.');
        const recovery=Object.values(state.documents).find(item=>item.metadata.kind==='recovery'&&!item.metadata.deleted&&item.metadata.settings?.sourceDocumentId===documentId);
        if(recovery){
          if(await hash(signature)!==recovery.metadata.settings.sourceBaseHash)throw new Error('Resolve existing chapter recovery before renaming.');
          changes.push({id:recovery.metadata.id,title:recovery.metadata.title===document.metadata.title?title:recovery.metadata.title,
            settings:{...recovery.metadata.settings,sourceBaseHash:await hash(JSON.stringify([title,root.LmParagraphModel.toText(document.paragraphs)]))}});
        }
      }
      return transaction(projectId,changes,{checkState:current=>{if(sourceSignature(current.documents[documentId])!==signature)throw new Error('Document changed while renaming.');}});
    }
    async function putDatasets(projectId,datasets){
      if(!Array.isArray(datasets)||!datasets.length)throw new Error('Metadata datasets are required.');
      const allowed=['naming-category','naming-entry','fact','dictionary-rule','project-settings','note','news-article'];
      const captured=structuredClone(datasets),before=await read(projectId);
      const previous=before?.metadataRows||metadataRows(before.manifest);
      const existingByLegacy=new Map(Object.values(previous).map(row=>[metadataKey(row.kind,String(row.payload?.id??row.id)),row]));
      const datasetKinds=new Set();
      const prepared=[];
      for(const dataset of captured){
        if(!allowed.includes(dataset.kind)||!Array.isArray(dataset.entries))throw new Error('Invalid metadata dataset.');
        if(datasetKinds.has(dataset.kind))throw new Error('Combine repeated metadata kinds into one dataset.');datasetKinds.add(dataset.kind);
        const legacyIds=new Set();
        for(const payload of dataset.entries){
          const legacyId=String(payload?.id??'');if(!legacyId||legacyIds.has(legacyId))throw new Error('Metadata entry IDs must be present and unique.');legacyIds.add(legacyId);
          const existing=existingByLegacy.get(metadataKey(dataset.kind,legacyId));
          let id=existing?.id;
          if(!id){const bytes=new Uint8Array(await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([projectId,dataset.kind,legacyId]))));bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;const hex=[...bytes.slice(0,16)].map(value=>value.toString(16).padStart(2,'0')).join('');id=hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20);}
          prepared.push({kind:dataset.kind,id,payload,deleted:false});
        }
      }
      const operationId=root.LmParagraphModel.newId();
      return mutate(projectId,state=>{
        state.metadataRows=state.metadataRows||metadataRows(state.manifest);
        const targets=[];
        for(const dataset of captured)if(dataset.removeMissing){
          const present=new Set(dataset.entries.map(entry=>String(entry.id)));
          for(const row of Object.values(state.metadataRows))if(row.kind===dataset.kind&&!row.deleted&&!present.has(String(row.payload?.id??row.id)))targets.push({kind:row.kind,id:row.id,payload:row.payload,deleted:true});
        }
        for(const target of prepared){const old=state.metadataRows[metadataKey(target.kind,target.id)];if(!old||old.deleted||canonical(old.payload)!==canonical(target.payload))targets.push(target);}
        if(!targets.length)return null;
        if(targets.length>10000)throw new Error('Metadata import exceeds the staged batch limit of 10000 records.');
        for(const target of targets){const key=metadataKey(target.kind,target.id),old=state.metadataRows[key];state.metadataRows[key]={...target,revision:old?.revision||0,remoteRevision:old?.remoteRevision||0};}
        state.pendingBatches.push({operationId,metadataTargets:targets,wireBatch:null});return operationId;
      });
    }
    async function resolveConflict(projectId,choice){
      if(!['server','drafts'].includes(choice))throw new Error('Choose the server version or recover local text as drafts.');
      const before=await read(projectId);
      if(before?.lastError?.code!=='revision_conflict'||!before.pendingBatches.length)throw new Error('There is no revision conflict to resolve.');
      if(choice==='drafts'&&before.pendingBatches.some(batch=>batch.metadataTargets?.some(target=>!target.maintenance)))throw new Error('Metadata conflicts cannot become text drafts. Export the recovery archive or review the server version.');
      const pendingIdentity=JSON.stringify(before.pendingBatches);
      const manifest=await adapter.manifest(projectId),documents={};
      for(const metadata of manifest.documents.filter(item=>!item.deleted)){
        const body=await adapter.readDocument(metadata.id,{revision:metadata.revision});
        const paragraphs=body.paragraphs.length?body.paragraphs:root.LmParagraphModel.fromText('');
        root.LmParagraphModel.validate(paragraphs);
        documents[metadata.id]={metadata,paragraphs,remoteParagraphs:body.paragraphs,remoteRevision:body.revision,created:false};
      }
      const archiveId=root.LmParagraphModel.newId();
      await mutate(projectId,state=>{
        if(JSON.stringify(state.pendingBatches)!==pendingIdentity)throw new Error('Pending edits changed during conflict review. Review them again.');
        const affected=[...new Set(state.pendingBatches.flatMap(batch=>(batch.targets||[batch]).map(target=>target.documentId)))];
        const localDocuments=Object.fromEntries(affected.filter(id=>state.documents[id]).map(id=>[id,structuredClone(state.documents[id])]));
        state.conflictArchives=state.conflictArchives||[];
        state.conflictArchives.push({id:archiveId,createdAt:new Date().toISOString(),documents:localDocuments,pendingBatches:structuredClone(state.pendingBatches)});
        state.manifest=structuredClone(manifest);state.documents=structuredClone(documents);state.metadataRows=metadataRows(manifest);state.pendingBatches=[];state.lastError=null;
        if(choice==='drafts')for(const document of Object.values(localDocuments)){
          if(document.metadata.deleted)continue;
          const id=root.LmParagraphModel.newId();
          const paragraphs=withOrder(root.LmParagraphModel.fromText(root.LmParagraphModel.toText(document.paragraphs)),[]);
          const title=(document.metadata.title+' — recovered').slice(0,300);
          const metadata={id,project_id:projectId,kind:'draft',title,part_id:null,settings:{},revision:0,deleted:false};
          state.documents[id]={metadata,paragraphs,remoteParagraphs:[],remoteRevision:0,created:true};state.manifest.documents.push(metadata);
          state.pendingBatches.push({operationId:root.LmParagraphModel.newId(),documentId:id,paragraphs,title,kind:'draft',create:true,wireBatch:null});
        }
      });
      return read(projectId);
    }
    async function flush(projectId) {
      if(flushing.has(projectId))return flushing.get(projectId);
      const task=(async()=>{
        while(true) {
          let outgoing;
          await mutate(projectId,state=>{
            let queued=state.pendingBatches[0];
            if(!queued)return;
            if(!queued.wireBatch) {
              queued=structuredClone(queued);state.pendingBatches[0]=queued;
              const operations=[];
              for(const target of queued.targets||(queued.documentId?[queued]:[])){
              const document=state.documents[target.documentId];
              if(target.settingsOnly){
                operations.push({type:'document.patch',id:target.documentId,baseRevision:document.remoteRevision,settings:target.settings,upserts:[],deletedIds:[]});
                continue;
              }
              const previous=new Map(document.remoteParagraphs.map(item=>[item.id,item]));
              const nextIds=new Set(target.paragraphs.map(item=>item.id));
              const upserts=target.paragraphs.filter(item=>{
                const old=previous.get(item.id);
                return !old||old.text!==item.text||old.separator!==item.separator||old.orderKey!==item.orderKey;
              });
              if(target.create)operations.push({type:'document.create',id:target.documentId,title:target.title,kind:target.kind});
              operations.push({type:'document.patch',id:target.documentId,baseRevision:target.create?0:document.remoteRevision,title:target.title,kind:target.kind,upserts,
                ...(target.settings===undefined?{}:{settings:target.settings}),...(target.partId===undefined?{}:{partId:target.partId}),...(target.deleted===undefined?{}:{deleted:target.deleted}),
                deletedIds:[...previous.keys()].filter(id=>!nextIds.has(id))});
              }
              for(const target of queued.metadataTargets||[]){const row=state.metadataRows[metadataKey(target.kind,target.id)];operations.push({type:'metadata.put',id:target.id,kind:target.kind,payload:target.payload,deleted:target.deleted,baseRevision:row.remoteRevision});}
              queued.wireBatch={protocolVersion:1,operationId:queued.operationId,operations};
            }
            outgoing=structuredClone(queued);
          });
          if(!outgoing)return read(projectId);
          let receipt;
          try {receipt=await adapter.apply(projectId,outgoing.wireBatch);}
          catch(error) {
            await mutate(projectId,state=>{state.lastError={code:error.code||'remote_error',status:error.status||0};});
            throw error;
          }
          if(receipt.operationId!==outgoing.operationId||!Number.isSafeInteger(receipt.revision))throw new Error('Invalid server receipt. Pending edits were retained.');
          await mutate(projectId,state=>{
            for(const target of outgoing.targets||(outgoing.documentId?[outgoing]:[])){
            const document=state.documents[target.documentId];
            if(document.remoteRevision<=receipt.revision) {
              document.remoteRevision=receipt.revision;if(!target.settingsOnly)document.remoteParagraphs=target.paragraphs;document.created=false;
              document.metadata.revision=receipt.revision;
              const metadataIndex=state.manifest.documents.findIndex(item=>item.id===target.documentId);if(metadataIndex>=0)state.manifest.documents[metadataIndex]={...state.manifest.documents[metadataIndex],revision:receipt.revision};
            }
            }
            for(const target of outgoing.metadataTargets||[]){const row=state.metadataRows[metadataKey(target.kind,target.id)];row.remoteRevision=Math.max(row.remoteRevision,receipt.revision);row.revision=row.remoteRevision;}
            state.pendingBatches=state.pendingBatches.filter(batch=>batch.operationId!==outgoing.operationId);
            state.manifest.project.revision=Math.max(state.manifest.project.revision,receipt.revision);
            state.lastError=null;
          });
        }
      })();
      flushing.set(projectId,task);
      try{return await task;}finally{flushing.delete(projectId);}
    }
    return Object.freeze({openProject,ensureDocument,readDocumentForScan,createProject,createDocument,saveDocument,transaction,beginRecovery,commitRecovery,discardRecovery,transformDocuments,mergeDrafts,promoteDraft,renameDocument,putDatasets,resolveConflict,flush,read,
      async status(projectId){const state=await read(projectId);return {pending:state?.pendingBatches.length||0,lastError:state?.lastError||null};}});
  }
  root.LmRemoteWorkspace=Object.freeze({create,withOrder});
})(typeof window==='undefined'?globalThis:window);
