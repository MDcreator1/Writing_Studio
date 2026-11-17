'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/shared/js/06a-project-storage-foundation.js'), 'utf8');
const names = ['getProjectFileHandle', 'getProjectDirectoryHandle', 'removeProjectFileIfExists', 'readFileText', 'writeFileText'];
const functions = names.map(name => source.match(new RegExp(`async function ${name}\\([^]*?\\n\\}`))[0]).join('\n');
const split = source.match(/function splitProjectPath\([^]*?\n\}/)[0];
fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
fs.writeFileSync(path.join(root, 'tmp/storage-browser-test.html'), `<!doctype html><meta charset="utf-8"><pre id="result">RUNNING</pre>
<script src="/assets/shared/js/06e-storage-contracts.js"></script>
<script src="/assets/shared/js/06f-local-folder-adapter.js"></script>
<script src="/assets/shared/js/06g-project-repository.js"></script>
<script src="/assets/shared/js/06h-paragraph-model.js"></script>
<script src="/assets/shared/js/06i-working-store.js"></script>
<script src="/assets/shared/js/06j-editor-working-copy.js"></script>
<script src="/assets/shared/js/06k-sync-identity.js"></script>
<script>
let projectDirectoryHandle;
${split}
${functions}
(async()=>{
 const results=[];
 const identity={scopeId:'test-account-profile',projectId:'p1',documentId:'d1'};
 const databaseName='milestone3-test-'+crypto.randomUUID();
 let store=await LmWorkingStore.open(databaseName);
 const paragraphs=LmParagraphModel.fromText('क्‍ष 👩‍💻\\r\\n\\r\\nअंत\\n');
 const operation={...identity,operationId:'op1',baseVersion:0,paragraphs};
 const legacyName='milestone3-upgrade-'+crypto.randomUUID();
 const legacyDb=await new Promise((resolve,reject)=>{
   const request=indexedDB.open(legacyName,1);
   request.onupgradeneeded=()=>{
     request.result.createObjectStore('documents',{keyPath:['scopeId','projectId','documentId']});
     request.result.createObjectStore('outbox',{keyPath:['scopeId','projectId','operationId']});
   };
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
 await new Promise((resolve,reject)=>{
   const tx=legacyDb.transaction(['documents','outbox'],'readwrite');
   tx.objectStore('documents').put({...identity,paragraphs,localVersion:1});
   tx.objectStore('outbox').put({...operation,localVersion:1,state:'queued',fingerprint:JSON.stringify([identity.documentId,0,paragraphs])});
   tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
 });
 try{await LmWorkingStore.open(legacyName);throw Error('Blocked upgrade was not reported')}catch(e){if(!e.message.includes('blocked'))throw e}
 legacyDb.close();
 await new Promise(r=>setTimeout(r,100));
 const upgraded=await LmWorkingStore.open(legacyName);
 if(await upgraded.stage(operation)!==1)throw Error('Upgrade broke legacy retry receipt');
 if((await upgraded.getDocument(identity)).localVersion!==1)throw Error('Upgrade lost old document');
 upgraded.close();results.push('PASS blocked-upgrade recovery / v1 migration / preserved retry receipt');
 const blobName='remote-v3-upgrade-'+crypto.randomUUID();
 const blob={scopeId:'migration-scope',projectId:'migration-project',cacheVersion:7,manifest:{documents:[],metadata:[]},documents:{a:{metadata:{id:'a'},paragraphs:[{text:'पुराना पाठ'}]},b:{metadata:{id:'b'},paragraphs:[{text:'दूसरा पाठ'}]}},metadataRows:{},pendingBatches:[{operationId:'pending-1',payload:'retry'}],conflictArchives:[{id:'archive-1',payload:'backup'}]};
 const old=await new Promise((resolve,reject)=>{const r=indexedDB.open(blobName,3);r.onupgradeneeded=()=>r.result.createObjectStore('remote_projects',{keyPath:['scopeId','projectId']});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 await new Promise((resolve,reject)=>{const tx=old.transaction('remote_projects','readwrite');tx.objectStore('remote_projects').put(blob);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});old.close();
 const normalized=await LmWorkingStore.open(blobName);
 let migrated=await normalized.readRemoteProject(blob.scopeId,blob.projectId);
 if(migrated.documents.a.paragraphs[0].text!=='पुराना पाठ'||migrated.pendingBatches[0].payload!=='retry'||migrated.conflictArchives[0].payload!=='backup')throw Error('v3 migration lost content or recovery');
 if(!Object.isFrozen(migrated.documents.b.paragraphs))throw Error('Cached entities are mutable');
 const puts=[],originalPut=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(value,...args){if(this.name==='remote_entities')puts.push(value.type+':'+value.id);return originalPut.call(this,value,...args);};
 try{await normalized.writeRemoteProject({...migrated,documents:{...migrated.documents,a:{...migrated.documents.a,paragraphs:[{text:'बदला पाठ'}]}}},7,{documents:['a'],metadataRows:[]});}finally{IDBObjectStore.prototype.put=originalPut;}
 if(JSON.stringify(puts)!==JSON.stringify(['documents:a']))throw Error('Single document save rewrote other entities: '+puts.join(','));
 const inspect=await new Promise((resolve,reject)=>{const r=indexedDB.open(blobName,4);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const header=await new Promise((resolve,reject)=>{const tx=inspect.transaction('remote_projects');const r=tx.objectStore('remote_projects').get([blob.scopeId,blob.projectId]);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});inspect.close();
 if(header.documents||header.pendingBatches||header.manifest.documents.length||header.entityVersions.documents.a!==2||header.entityVersions.documents.b!==1)throw Error('Normalized header contains bodies or invalid entity revisions');
 const other=await LmWorkingStore.open(blobName);const fresh=await other.readRemoteProject(blob.scopeId,blob.projectId);
 await other.writeRemoteProject({...fresh,projectInfo:{name:'second tab'}},8,{documents:[],metadataRows:[]});
 try{await normalized.writeRemoteProject(migrated,8,{documents:[],metadataRows:[]});throw Error('Stale normalized write accepted');}catch(e){if(e.code!=='cache_conflict')throw e;}
 migrated=await normalized.readRemoteProject(blob.scopeId,blob.projectId);
 if(migrated.documents.a.paragraphs[0].text!=='बदला पाठ'||migrated.projectInfo.name!=='second tab'||migrated.pendingBatches.length!==1)throw Error('Cross-tab normalized read lost edits');
 normalized.close();other.close();results.push('PASS v3→v4 migration / single-entity writes / immutable cache / compact header / cross-tab CAS');
 const cancel=new AbortController();
 const interrupted=store.stage({...operation,operationId:'cancelled'}, {signal:cancel.signal});cancel.abort();
 try{await interrupted;throw Error('Cancelled stage committed')}catch(e){if(!e.message.includes('cancelled'))throw e}
 if(await store.getDocument(identity))throw Error('Aborted stage leaked document');
 if((await store.pending(identity.scopeId,identity.projectId)).length)throw Error('Aborted stage leaked operation');
 if(await store.stage(operation)!==1)throw Error('Stage version');
 if(await store.stage(operation)!==1)throw Error('Retry is not idempotent');
 try{await store.stage({...operation,operationId:'op2'});throw Error('Conflict accepted')}catch(e){if(!e.message.includes('version conflict'))throw e}
 if((await store.pending(identity.scopeId,identity.projectId)).length!==1)throw Error('Failed transaction leaked outbox');
 if((await store.pending('different-account',identity.projectId)).length!==0)throw Error('Account leakage');
 const expected=LmParagraphModel.toText(paragraphs);store.close();store=await LmWorkingStore.open(databaseName);
 if(LmParagraphModel.toText((await store.getDocument(identity)).paragraphs)!==expected)throw Error('Reopen lost text');
 if((await store.pending(identity.scopeId,identity.projectId)).length!==1)throw Error('Reopen lost pending edits');
 const updated=LmEditorWorkingCopy.reconcile(paragraphs,'बदला टेक्स्ट');
 await store.stage({...identity,...updated,operationId:'op2',baseVersion:1});
 if(LmParagraphModel.toText((await store.readRecovery(identity,1)).paragraphs)!==expected)throw Error('Recovery baseline lost');
 const queued=await store.pending(identity.scopeId,identity.projectId);
 if(queued.length!==2||queued[0].sequence>=queued[1].sequence)throw Error('Outbox ordering failed');
 await store.acknowledge(identity,'op1');await store.acknowledge(identity,'op2');
 if(await store.hasPending())throw Error('Acknowledged queue is still pending');
 const remoteCache={scopeId:identity.scopeId,projectId:'remote-cache-project',pendingBatches:[{operationId:'offline-operation'}]};
 await store.writeRemoteProject(remoteCache,0);
 if(!await store.hasPending())throw Error('Remote pending edits not protected');
 try{await store.writeRemoteProject({...remoteCache,pendingBatches:[]},0);throw Error('Cache conflict accepted')}catch(e){if(e.code!=='cache_conflict')throw e}
 store.close();store=await LmWorkingStore.open(databaseName);
 if((await store.readRemoteProject(identity.scopeId,'remote-cache-project')).pendingBatches.length!==1)throw Error('Remote pending edits lost on reopen');
 await store.writeRemoteProject({...remoteCache,pendingBatches:[]},1);
 results.push('PASS remote project cache / pending protection / compare-and-swap / reopen');
 if(await store.stage(operation)!==1)throw Error('Acknowledged retry lost receipt');
 try{await store.stage({...operation,paragraphs:updated.paragraphs});throw Error('ID collision accepted')}catch(e){if(!e.message.includes('different content'))throw e}
 store.close();results.push('PASS atomic staging / retry / recovery / ordered queue / acknowledgement / isolation / reopen');
 const folder=await (await navigator.storage.getDirectory()).getDirectoryHandle('milestone2',{create:true});
 projectDirectoryHandle=folder;
 const text='हिंदी क्‍ष 👩‍💻\\n\\nअंतिम पंक्ति\\n';
 await writeFileText(await getProjectFileHandle('Chapters/test.txt',{create:true}),text);
 if(await readFileText(await getProjectFileHandle('Chapters/test.txt'))!==text)throw Error('Native file round trip mismatch');
 results.push('PASS native folder/text write-read-reopen');
 const adapter=LmProjectRepository.forFolder(folder);
 const registry=LmSyncIdentity.create(adapter);
 const documentRef={kind:'draft',contentPath:'Drafts/old.txt'};
 const stable=await registry.documentIdentity('test-profile',documentRef);
 await registry.remap(documentRef,{...documentRef,contentPath:'Drafts/renamed.txt'});
 const reloaded=await LmSyncIdentity.create(adapter).documentIdentity('test-profile',{...documentRef,contentPath:'Drafts/renamed.txt'});
 if(stable.projectId!==reloaded.projectId||stable.documentId!==reloaded.documentId)throw Error('Portable identities changed after rename/reopen');
 results.push('PASS persistent project/document IDs and rename/reopen');
 await adapter.writeJson('metadata.json',{drafts:[{title:'नाम',contentPath:'Chapters/test.txt'}]});
 if((await adapter.readJson('metadata.json')).drafts[0].title!=='नाम')throw Error('JSON mismatch');
 results.push('PASS native verified metadata');
 await removeProjectFileIfExists('Chapters/test.txt');
 try{await getProjectFileHandle('Chapters/test.txt');throw Error('Delete failed')}catch(e){if(e.name!=='NotFoundError')throw e}
 results.push('PASS native delete');
 for(const page of ['home.html','story-novel-project-editor.html','project-details.html','news-article-editor.html']){
   const frame=document.createElement('iframe');document.body.append(frame);
   const errors=[];let html=await(await fetch('/'+page)).text();
   if(page==='story-novel-project-editor.html')html=html.split('<script').filter(part=>!part.includes('04-editor-boot.js')).join('<script');
   frame.contentWindow.__testErrors=errors;
   frame.contentDocument.open();
   frame.contentDocument.write('<base href="/">'+'<script>window.onerror=function(m){window.__testErrors.push(String(m))}<'+ '/script>'+html);
   frame.contentDocument.close();
   await new Promise(r=>setTimeout(r,1200));
   if(page==='story-novel-project-editor.html'){
     for(let attempt=0;attempt<50&&typeof frame.contentWindow.addDraft!=='function';attempt++)await new Promise(r=>setTimeout(r,100));
   }
   if(errors.length)throw Error(page+': '+errors.join(';'));
   if(!frame.contentWindow.LmProjectRepository)throw Error(page+' repository not loaded');
   results.push('PASS page script load '+page);
   if(page==='home.html'){
     await frame.contentWindow.eval(\`(async()=>{
       const sandbox=await (await navigator.storage.getDirectory()).getDirectoryHandle('editor-fixture',{create:true});
       const manifest=createProjectManifest('Storage fixture');
       manifest.chapters=[{no:1,title:'Fixture',contentPath:'Chapters/initial.txt',wordCount:2}];
       await LmProjectRepository.forFolder(sandbox).writeText('Chapters/initial.txt','Fixture chapter');
       const handle=await sandbox.getFileHandle(PROJECT_MANIFEST_FILE,{create:true});
       await writeFileText(handle,JSON.stringify(manifest));
       if(parent.location.search.includes('apiPort=')){
         const testFolder=await (await navigator.storage.getDirectory()).getDirectoryHandle('linked-folder-fixture',{create:true});
         const io=LmLocalFolderAdapter.create(testFolder);
         await io.writeJson('Chapters_info.json',{title:'Hybrid fixture',type:'novel',language:'hi',chapters:[],parts:[{title:'Part A',chapters:[{id:'chapter-a',title:'Chapter A',contentPath:'Chapters/a.txt'}]}]});
         await io.writeText('Chapters/a.txt','Part chapter');
         await io.writeJson('Story_Drafts.json',{drafts:[{id:'legacy-a',title:'Folder draft',contentPath:'Drafts/a.txt'}]});
         await io.writeText('Drafts/a.txt','Original');
         const conn=await LmDatabaseProfiles.connect({name:'Hybrid fixture',baseUrl:'http://127.0.0.1:'+new URLSearchParams(parent.location.search).get('apiPort'),token:'browser-synthetic-token'});
         const engine=LmFolderSync.create(testFolder,conn);
         const result=await engine.sync({linkNew:true});
         const link=await engine.readLink();
         const documentId=Object.entries(link.documents).find(([,row])=>row.path==='Drafts/a.txt')[0];
         const state=await conn.adapter.manifest(result.projectId);
         if(result.pushed!==2||state.documents.length!==2||!state.parts.some(part=>state.documents.some(doc=>doc.kind==='chapter'&&doc.part_id===part.id))||!state.metadata.some(row=>row.payload.id==='naming-state'))throw Error('Folder migration failed');
         await conn.adapter.apply(result.projectId,{protocolVersion:1,operationId:crypto.randomUUID(),operations:[
           {type:'part.put',id:state.parts[0].id,baseRevision:state.parts[0].revision,orderKey:Number(state.parts[0].order_key),title:'Part changed online',synopsis:'New part summary'},
           {type:'project.update',baseRevision:state.project.revision,title:state.project.title,author:'Sync Author'}
         ]});
         await engine.sync();
         const syncedInfo=await io.readJson('Chapters_info.json');
         if(syncedInfo.author!=='Sync Author'||syncedInfo.parts[0].synopsis!=='New part summary'||syncedInfo.parts[0].chapters.length!==1)throw Error('Project and Part details did not sync without losing chapters');
         await io.writeText('Drafts/a.txt','Local edit');
         if((await engine.sync()).pushed!==1)throw Error('Local push failed');
         async function serverEdit(text){
           const body=await conn.adapter.readDocument(documentId);
           await conn.adapter.apply(result.projectId,{protocolVersion:1,operationId:crypto.randomUUID(),operations:[{type:'document.patch',id:documentId,baseRevision:body.revision,deletedIds:[],upserts:[{...body.paragraphs[0],text}]}]});
         }
         let unlock;let acquired;const ready=new Promise(resolve=>{acquired=resolve;});
         const localEditor=navigator.locks.request('lekhak-folder-sync',{mode:'shared'},()=>new Promise(resolve=>{unlock=resolve;acquired();}));
         await ready;await serverEdit('Remote edit');
         try{const deferred=await engine.sync();if(!deferred.deferred||await io.readText('Drafts/a.txt')!=='Local edit')throw Error('Active editor download guard failed');}
         finally{unlock();await localEditor;}
         if((await engine.sync()).pulled!==1||await io.readText('Drafts/a.txt')!=='Remote edit')throw Error('Remote pull failed');
         await io.writeText('Drafts/a.txt','Both local');await serverEdit('Both remote');
         const conflict=(await engine.sync()).conflicts[0];
         if(!conflict?.canChoose||await io.readText('Drafts/a.txt')!=='Both local')throw Error('Concurrent changes were not preserved');
         await engine.sync({resolutions:{[conflict.id]:{side:'server',localHash:conflict.localHash,remoteHash:conflict.remoteHash}}});
         if(await io.readText('Drafts/a.txt')!=='Both remote'||await io.readText('.lekhak-sync/backups/'+conflict.localHash+'.txt')!=='Both local')throw Error('Conflict selection did not preserve backup');
         const newDraft=crypto.randomUUID(),paragraph=crypto.randomUUID();
         await conn.adapter.apply(result.projectId,{protocolVersion:1,operationId:crypto.randomUUID(),operations:[{type:'document.create',id:newDraft,kind:'draft',title:'Mobile draft'},{type:'document.patch',id:newDraft,baseRevision:0,deletedIds:[],upserts:[{id:paragraph,orderKey:1024,text:'From phone',separator:''}]}]});
         await engine.sync();await LmFolderSync.create(testFolder,conn).sync();
         const rows=(await io.readJson('Story_Drafts.json')).drafts;
         if(rows.filter(row=>row.id===newDraft).length!==1||await io.readText(rows.find(row=>row.id===newDraft).contentPath)!=='From phone')throw Error('New server draft copy or reopen failed');
         await io.writeJson('Story_Facts.json',{facts:[{id:'fact-1',keyword:'Place',description:'Local fact',createdAt:'2026-01-01T00:00:00.000Z'}]});
         await engine.sync();
         const fact=(await conn.adapter.manifest(result.projectId)).metadata.find(row=>row.kind==='fact'&&row.payload.id==='fact-1');
         if(fact?.payload.description!=='Local fact')throw Error('Metadata push failed');
         await conn.adapter.apply(result.projectId,{protocolVersion:1,operationId:crypto.randomUUID(),operations:[{type:'metadata.put',id:fact.id,kind:'fact',baseRevision:fact.revision,payload:{...fact.payload,description:'Remote fact'}}]});
         await engine.sync();
         if((await io.readJson('Story_Facts.json')).facts[0].description!=='Remote fact')throw Error('Metadata pull failed');
         const homeStore=await LmWorkingStore.open();let reads=0;
         const limited={...conn,adapter:{...conn.adapter,readDocument(...args){reads++;return conn.adapter.readDocument(...args);}}};
         const homeWorkspace=LmRemoteWorkspace.create({connection:limited,store:homeStore});
         await LmDatabaseEditor.prepareNavigation(homeWorkspace,conn.profile.id,result.projectId);
         if(reads!==1)throw Error('Home must load only the first selected document: '+reads);
         homeStore.close();
         window.eval(await (await fetch('/assets/shared/js/06m-database-profiles.js')).text());
         if(!(await LmDatabaseProfiles.resume(conn.profile.id)))throw Error('Database session did not survive script reload');

         openDatabaseConnectionPanel();
         let historyDialog=document.querySelector('.lm-app-panel[data-database-ui]');
         historyDialog.querySelector('[aria-label="Remove Hybrid fixture"]').click();
         for(let i=0;i<100&&LmDatabaseProfiles.list().some(row=>row.id===conn.profile.id);i++)await new Promise(resolve=>setTimeout(resolve,20));
         if(LmDatabaseProfiles.list().some(row=>row.id===conn.profile.id))throw Error('Remove connection button failed');
         historyDialog.close();await new Promise(resolve=>setTimeout(resolve,50));
         const endpoint='http://127.0.0.1:'+new URLSearchParams(parent.location.search).get('apiPort');
         for(const name of ['Remove A','Remove B'])await LmDatabaseProfiles.connect({name,baseUrl:endpoint,token:'browser-synthetic-token'});
         openDatabaseConnectionPanel();historyDialog=document.querySelector('.lm-app-panel[data-database-ui]');
         const confirm=window.confirm;window.confirm=()=>true;
         [...historyDialog.querySelectorAll('button')].find(button=>button.textContent==='सभी connections हटाएँ').click();
         window.confirm=confirm;
         for(let i=0;i<100&&LmDatabaseProfiles.list().length;i++)await new Promise(resolve=>setTimeout(resolve,20));
         if(LmDatabaseProfiles.list().length)throw Error('Clear history failed');
         historyDialog.close();await new Promise(resolve=>setTimeout(resolve,50));
         if(LmDatabaseProfiles.list().some(profile=>profile.id===conn.profile.id))throw Error('Profile removal failed');
         const fixtureRoot=await (await navigator.storage.getDirectory()).getDirectoryHandle('home-delete-fixtures',{create:true});
         await LmDatabasePanel.disconnectHome();
         const library=document.getElementById('storyLibraryBtn');
         const tabs=document.getElementById('homeRecentStorageTabs');
         if(getComputedStyle(library).display!=='none')throw Error('Disconnected Library visible');
         await loadWorkspaceFolder(fixtureRoot);
         await renderHomeRecentProjectsPanel('local');
         if(library.hidden||!tabs.hidden)throw Error('Local Library mode incorrect');
         closeHomeRecentProjectsPanel();
         await LmDatabasePanel.disconnectHome();
         openDatabaseConnectionPanel();
         const setup=document.querySelector('.lm-app-panel[data-database-ui]');
         setup.querySelector('[aria-label="API server URL"]').value=endpoint;
         setup.querySelector('[aria-label="Session token"]').value='browser-synthetic-token';
         [...setup.querySelectorAll('button')].find(button=>button.textContent==='Connect / Test').click();
         for(let i=0;i<100&&!LmDatabasePanel.homeConnection();i++)await new Promise(r=>setTimeout(r,25));
         const connection=LmDatabasePanel.homeConnection();
         if(!connection)throw Error('Home cloud connection failed');
         setup.close();
         await renderHomeRecentProjectsPanel('cloud');
         if(library.hidden||!tabs.hidden||homeRecentStorage!=='cloud')throw Error('Cloud Library mode incorrect');
         closeHomeRecentProjectsPanel();
         openNewStoryPanel();
         if(document.getElementById('homeNewProjectStorage').value!=='cloud')throw Error('Cloud New Project default incorrect');
         closeStoryInfoModal();
         await selectLocalProjectFolder();
         if(workspaceDirectoryHandle)throw Error('Cloud mode allowed unrelated folder selection');
         workspaceDirectoryHandle=fixtureRoot;
         for(const choice of ['local','cloud','both']){
           const handle=await fixtureRoot.getDirectoryHandle(choice,{create:true});
           await LmLocalFolderAdapter.create(handle).writeJson('Chapters_info.json',{title:'Delete '+choice,type:'story',language:'hi',chapters:[],parts:[]});
           const linked=await LmDatabasePanel.linkNewHomeProject(handle);
           const project=(await connection.adapter.manifest(linked.projectId)).project;
           await renderHomeRecentProjectsPanel('cloud');
           if(!document.getElementById('homeRecentProjectsPanelList').textContent.includes(project.title))throw Error('Synced fixture missing');
           const task=removeHomeProject({reference:choice,handle},project);
           document.querySelector('.lm-app-panel form button[value="'+choice+'"]').click();
           await task;
           const cloud=(await LmDatabasePanel.homeProjects()).some(item=>item.id===project.id);
           const local=await fixtureRoot.getDirectoryHandle(choice).then(()=>true,error=>{if(error.name!=='NotFoundError')throw error;return false;});
           if(cloud!==(choice==='local')||local!==(choice==='cloud'))throw Error('Wrong copies retained after '+choice);
           if(local&&await LmFolderSync.create(handle,connection).readLink())throw Error('Cloud-only delete retained sync link');
         }
         closeHomeRecentProjectsPanel();

       }
       await saveProjectHandle(sandbox);
       localStorage.setItem(PROJECT_FOLDER_KEY,sandbox.name);
       localStorage.setItem(PROJECT_MODE_KEY,'local');
     })()\`);
   }
   if(page==='home.html'&&location.search.includes('apiPort='))results.push('PASS folder migration / document and Facts sync / conflict backup / connection history / disconnected, local and cloud Home modes / three synced deletion choices');
   if(page==='story-novel-project-editor.html'){
     if(typeof frame.contentWindow.addDraft!=='function')throw Error('Editor readiness: '+frame.contentWindow.location.href+' scripts='+frame.contentDocument.scripts.length+' errors='+JSON.stringify(frame.contentWindow.__testErrors));
     await frame.contentWindow.eval(\`(async()=>{
       const sandbox=await (await navigator.storage.getDirectory()).getDirectoryHandle('editor-fixture',{create:true});
       const manifest=createProjectManifest('Storage fixture');
       manifest.chapters=[{no:1,title:'Fixture',contentPath:'Chapters/initial.txt',wordCount:2}];
       await LmProjectRepository.forFolder(sandbox).writeText('Chapters/initial.txt','Fixture chapter');
       const writer=await (await sandbox.getFileHandle(PROJECT_MANIFEST_FILE,{create:true})).createWritable();
       await writer.write(JSON.stringify(manifest));await writer.close();
       const connected=await LmEditorWorkingCopy.connectFolder({folderHandle:sandbox,scopeId:'test-profile'});
       if(parent.location.search.includes('legacy=1')){
         window.LmProjectRepository=undefined;window.LmLocalFolderAdapter=undefined;
       }
       if(!await loadLocalProject(sandbox,false))throw Error('Project open failed');
       await addDraft();
       const draft=chapterDrafts[curDraft];
       if(!draft)throw Error('Draft creation failed');
       const workingStore=connected.store;
       const workingIdentity=await connected.registry.documentIdentity('test-profile',{kind:'draft',contentPath:draft.contentPath});
       const editor=document.getElementById('editor');
       editor.textContent='पहला पैराग्राफ\\\\n\\\\nदूसरा पैराग्राफ';
       editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'प'}));
       await saveCurrentProject();
       if((await workingStore.pending(workingIdentity.scopeId,workingIdentity.projectId)).length!==1)throw Error('Editor save did not enqueue operation');
       try{await LmEditorWorkingCopy.assertCacheResetSafe();throw Error('Unsafe cache reset allowed')}catch(e){if(!e.message.includes('pending edits'))throw e}
       const persisted=await readFileText(await getProjectFileHandle(draft.contentPath));
       if(!persisted.includes('पहला पैराग्राफ')||!persisted.includes('दूसरा पैराग्राफ'))throw Error('Editor draft persistence mismatch');
       await loadLocalProject(sandbox,false);
       await ensureDraftContentLoaded(0);
       if(!chapterDrafts[0].content.includes('पहला'))throw Error('Draft reopen mismatch');
       LmEditorWorkingCopy.disconnect();workingStore.close();
     })()\`);
     results.push('PASS editor open / draft input / save / durable queue / cache-reset guard / reopen');
     const apiPort=new URLSearchParams(location.search).get('apiPort');
     if(apiPort){
       frame.style.cssText='position:fixed;inset:0;width:100vw;height:100vh;border:0';
       await frame.contentWindow.eval(\`(async()=>{
         openAdvancedEditorSettings();selectAdvancedEditorTopSection('developer');
         const storageCategory=[...document.querySelectorAll('[data-advanced-developer-category]')].find(node=>node.textContent.includes('Storage & Database'));
         if(!storageCategory)throw Error('Developer storage section missing');storageCategory.click();
         [...document.querySelectorAll('button')].find(node=>node.textContent==='Open storage connections').click();
         closeAdvancedEditorSettings();
         const panel=document.querySelector('.lm-app-panel[data-database-ui]');
         panel.querySelector('[aria-label="Connection name"]').value='Browser connection';
         panel.querySelector('[aria-label="API server URL"]').value='http://127.0.0.1:\${apiPort}';
         panel.querySelector('[aria-label="Session token"]').value='browser-synthetic-token';
         [...panel.querySelectorAll('button')].find(button=>button.textContent==='Connect / Test').click();
         for(let attempt=0;attempt<100&&(!panel.querySelector('select').value||panel.querySelector('select').disabled);attempt++)await new Promise(r=>setTimeout(r,50));
         const profileId=panel.querySelector('select').value;
         if(!profileId)throw Error('Connection panel did not authenticate: '+panel.querySelector('[role="status"]').textContent);
         panel.querySelector('[aria-label="नए project का नाम"]').value='Database browser fixture';
         [...panel.querySelectorAll('button')].find(button=>button.textContent==='Create database project').click();
         for(let attempt=0;attempt<150&&!LmDatabaseEditor.active();attempt++)await new Promise(r=>setTimeout(r,50));
         if(!LmDatabaseEditor.active())throw Error('Database-only editor did not activate: '+panel.querySelector('[role="status"]').textContent);
         if(projectDirectoryHandle!==null)throw Error('Database editor unexpectedly requires folder');
         const editor=document.getElementById('editor');
         editor.textContent='Database में हिंदी draft';
         await manualSave();await LmDatabaseEditor.sync();
         const target=LmDatabaseEditor.current();
         const connection=LmDatabaseProfiles.connection(profileId);
         const documentId=activeEditorDocument().id;
         if(!LmParagraphModel.toText((await connection.adapter.readDocument(documentId)).paragraphs).includes('हिंदी draft'))throw Error('Database editor did not save to server');
         LmDatabaseProfiles.disconnect(profileId);
         editor.textContent='Offline सुरक्षित draft';await manualSave();
         if(!LmDatabaseEditor.current().pending)throw Error('Offline save not staged');
         history.replaceState({},'', '/story-novel-project-editor.html?'+new URLSearchParams({databaseProfile:profileId,databaseProject:target.projectId}));
         LmDatabaseEditor.leave();await init();
         if(!getCleanEditorText().includes('Offline सुरक्षित'))throw Error('Cached database reopen lost edits');
         isAutoSaveEnabled=false;
         editor.focus();editor.textContent='Keyboard offline draft';
         editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'t'}));
         parent.__databaseKeyboardSaveRequested=true;
         const cache=await LmWorkingStore.open();
         const scope=connection.scopeId;
         let keyboardSaved=false;
         for(let attempt=0;attempt<80;attempt++){
           const state=await cache.readRemoteProject(scope,target.projectId);
           if(LmParagraphModel.toText(state.documents[documentId].paragraphs).includes('Keyboard offline')){keyboardSaved=true;break;}
           await new Promise(r=>setTimeout(r,50));
         }
         cache.close();if(!keyboardSaved)throw Error('Keyboard Ctrl+S did not persist draft');
         const reconnected=await LmDatabaseProfiles.connect({id:profileId,name:'Browser connection',baseUrl:'http://127.0.0.1:\${apiPort}',token:'browser-synthetic-token'});
         await LmDatabaseEditor.open(reconnected,target.projectId);await LmDatabaseEditor.sync();
         if(LmDatabaseEditor.current().pending)throw Error('Reconnect did not flush queue');
         if(!LmParagraphModel.toText((await reconnected.adapter.readDocument(documentId)).paragraphs).includes('Keyboard offline'))throw Error('Offline edit did not reach server');
         const firstDraftId=activeEditorDocument().id,addButton=document.getElementById('addChapterBtn');
         if(addButton.textContent!==text().addDraft)throw Error('Existing add button should be labelled New Draft in Database mode');
         addButton.click();
         for(let attempt=0;attempt<100&&activeEditorDocument().id===firstDraftId;attempt++)await new Promise(r=>setTimeout(r,25));
         const secondDocumentId=activeEditorDocument().id;
         if(secondDocumentId===firstDraftId)throw Error('Existing add button did not create a database draft');
         document.getElementById('editor').textContent='Second draft before navigation';
         document.querySelector('[onclick="handleDraftItemClick(event, 0)"]').click();
         for(let attempt=0;attempt<80&&curDraft!==0;attempt++)await new Promise(r=>setTimeout(r,25));
         if(!getCleanEditorText().includes('Keyboard offline'))throw Error('First draft navigation mismatch');
         document.querySelector('[onclick="handleDraftItemClick(event, 1)"]').click();
         for(let attempt=0;attempt<80&&curDraft!==1;attempt++)await new Promise(r=>setTimeout(r,25));
         if(!getCleanEditorText().includes('Second draft before navigation'))throw Error('Navigation lost unsaved draft');
         await LmDatabaseEditor.sync();
         if(!LmParagraphModel.toText((await reconnected.adapter.readDocument(secondDocumentId)).paragraphs).includes('Second draft'))throw Error('Navigation did not persist previous draft');
         if(document.getElementById('databaseEditorBanner')||!document.getElementById('databaseSaveActions'))throw Error('Database save actions misplaced');
         const promote=document.getElementById('promoteDraftBtn');
         if(promote.disabled)throw Error('Existing draft promotion button is disabled');
         promote.click();
         for(let attempt=0;attempt<100&&isDraftActive();attempt++)await new Promise(r=>setTimeout(r,25));
         await LmDatabaseEditor.sync();
         if(isDraftActive()||isChapterEditUnlocked)throw Error('Promoted chapter is not locked');
         document.getElementById('chapterEditBtn').click();
         for(let attempt=0;attempt<100&&!isChapterEditDraftActive();attempt++)await new Promise(r=>setTimeout(r,25));
         if(!isChapterEditDraftActive())throw Error('Chapter unlock did not create recovery');
         const recoveryId=activeEditorDocument().id;
         document.getElementById('editor').textContent='Recovery autosave text';
         await saveCurrentProject();await LmDatabaseEditor.sync();
         if(!LmParagraphModel.toText((await reconnected.adapter.readDocument(secondDocumentId)).paragraphs).includes('Second draft'))throw Error('Autosave overwrote saved chapter');
         await unlockChapterEditing();await unlockChapterEditing();
         if(!document.getElementById('chapter-edit-recovery-modal').classList.contains('is-visible'))throw Error('Recovery review dialog missing');
         await useChapterEditRecovery();
         if(!getCleanEditorText().includes('Recovery autosave'))throw Error('Recovery was not resumed');
         await manualSave();await LmDatabaseEditor.sync();
         if(isChapterEditUnlocked)throw Error('Manual chapter save did not lock editor');
         if(!LmParagraphModel.toText((await reconnected.adapter.readDocument(secondDocumentId)).paragraphs).includes('Recovery autosave'))throw Error('Manual chapter commit failed');
         try{await reconnected.adapter.readDocument(recoveryId);throw Error('Committed recovery still active')}catch(e){if(e.status!==410)throw e}
         await unlockChapterEditing();
         document.getElementById('editor').textContent='Discard this recovery';await saveCurrentProject();await LmDatabaseEditor.sync();
         await unlockChapterEditing();await unlockChapterEditing();await discardChapterEditRecovery();await LmDatabaseEditor.sync();
         if(!LmParagraphModel.toText((await reconnected.adapter.readDocument(secondDocumentId)).paragraphs).includes('Recovery autosave'))throw Error('Discard changed canonical chapter');
         await unlockChapterEditing();document.getElementById('editor').textContent='Local conflict text';await saveCurrentProject();await LmDatabaseEditor.sync();
         const sourceBody=await reconnected.adapter.readDocument(secondDocumentId);
         await reconnected.adapter.apply(target.projectId,{protocolVersion:1,operationId:crypto.randomUUID(),operations:[{type:'document.patch',id:secondDocumentId,baseRevision:sourceBody.revision,deletedIds:[],upserts:[{...sourceBody.paragraphs[0],orderKey:sourceBody.paragraphs[0].orderKey,text:'Other device chapter',separator:''}]}]});
         await manualSave();try{await LmDatabaseEditor.sync();}catch{}
         if(!LmDatabaseEditor.label().includes('conflict'))throw Error('Chapter conflict status was not shown');
         const conflictMenu=document.getElementById('databaseSaveActions');conflictMenu.open=true;
         const conflictButton=conflictMenu.querySelector('[data-database-action="conflict"]');
         if(conflictButton.hidden)throw Error('Conflict control missing from Save menu');
         conflictButton.click();
         let choice;
         for(let attempt=0;attempt<100&&!choice;attempt++){choice=[...document.querySelectorAll('button')].find(button=>button.textContent==='Keep my text as new drafts');if(!choice)await new Promise(r=>setTimeout(r,25));}
         if(!choice)throw Error('Conflict choice dialog missing');choice.click();for(let attempt=0;attempt<120&&conflictButton.disabled;attempt++)await new Promise(r=>setTimeout(r,25));await LmDatabaseEditor.sync();
         if(!isDraftActive()||!getCleanEditorText().includes('Local conflict'))throw Error('Conflict did not preserve local text as draft');
         if(!LmParagraphModel.toText((await reconnected.adapter.readDocument(secondDocumentId)).paragraphs).includes('Other device'))throw Error('Conflict resolution overwrote server chapter');
         toggleCategoryInputPanel(document.querySelector('[onclick="toggleCategoryInputPanel(this)"]'));
         document.getElementById('newNamingCategoryInp').value='Remote names';document.getElementById('categoryInputSaveBtn').click();
         await LmDatabaseEditor.metadataFlush();
         const category=namingData.categories.find(item=>item.title==='Remote names');if(!category)throw Error('Naming category add failed');
         openNamingEntryPanel(category.id);
         document.getElementById('namingNameInp').value='वीर';document.getElementById('namingDescriptionInp').value='पहला विवरण';document.getElementById('namingSaveBtn').click();
         await LmDatabaseEditor.metadataFlush();
         const name=namingData.entries.find(item=>item.name==='वीर');if(!name)throw Error('Naming add failed');
         activeNamingEntryId=name.id;openNameDetailEditPanel();document.getElementById('namingDescriptionInp').value='संशोधित विवरण';document.getElementById('namingSaveBtn').click();
         await LmDatabaseEditor.metadataFlush();
         openFactComposer();document.getElementById('factKeywordInp').value='परीक्षण तथ्य';document.getElementById('factDescriptionInp').value='स्थायी विवरण';document.getElementById('addFactBtn').click();
         await LmDatabaseEditor.metadataFlush();await LmDatabaseEditor.sync();
         const fact=storyFacts.find(item=>item.keyword==='परीक्षण तथ्य');if(!fact)throw Error('Fact add failed');
         await LmDatabaseEditor.open(reconnected,target.projectId);
         if(namingData.entries.find(item=>item.id===name.id)?.description!=='संशोधित विवरण')throw Error('Naming reopen lost description');
         if(!namingData.entries.find(item=>item.id===name.id)?.descriptionHistory.length)throw Error('Naming description history lost');
         if(!storyFacts.some(item=>item.id===fact.id))throw Error('Facts reopen lost metadata');
         activeNamingEntryId=name.id;await deleteActiveNamingEntry();await LmDatabaseEditor.metadataFlush();
         deleteFact(fact.id);await LmDatabaseEditor.metadataFlush();await LmDatabaseEditor.sync();
         const metadata=(await reconnected.adapter.manifest(target.projectId)).metadata;
         if(!metadata.find(item=>item.kind==='naming-entry'&&item.payload.id===name.id)?.deleted)throw Error('Naming delete tombstone missing');
         if(!metadata.find(item=>item.kind==='fact'&&item.payload.id===fact.id)?.deleted)throw Error('Fact delete tombstone missing');
         lmAdvancedWordEditing.loadDictionaryPayload({version:1,categories:['General'],rules:[
           {id:'rule-first',aliases:['shadow'],replace:'first',category:'General',order:9},
           {id:'rule-second',aliases:['shadow'],replace:'second',category:'General',order:0}
         ]},{projectHandle:null});
         if(!await lmAdvancedWordEditing.flush())throw Error('Dictionary metadata save failed');await LmDatabaseEditor.sync();
         await LmDatabaseEditor.open(reconnected,target.projectId);
         if(lmAdvancedWordEditing.getRules().map(rule=>rule.id).join(',')!=='rule-first,rule-second')throw Error('Dictionary rule priority order changed on reopen');
         if(lmAdvancedWordEditing.runReplacementEngine('shadow').text!=='first')throw Error('Dictionary effective winner changed on reopen');
         const dictionary=await readWordEditingDataFromProject();
         dictionary.rules=dictionary.rules.filter(rule=>rule.id!=='rule-first');lmAdvancedWordEditing.loadDictionaryPayload(dictionary,{projectHandle:null});
         if(!await lmAdvancedWordEditing.flush())throw Error('Dictionary deletion save failed');await LmDatabaseEditor.sync();
         const dictionaryRows=(await reconnected.adapter.manifest(target.projectId)).metadata;
         if(!dictionaryRows.find(row=>row.kind==='dictionary-rule'&&row.payload.id==='rule-first')?.deleted)throw Error('Dictionary delete tombstone missing');
         const renamedId=activeEditorDocument().id;beginChapterTitleEdit();document.getElementById('chapterTitleInput').value='Remote renamed draft';
         if(!await commitChapterTitleEdit())throw Error('Database title commit failed');await LmDatabaseEditor.sync();
         if((await reconnected.adapter.manifest(target.projectId)).documents.find(item=>item.id===renamedId)?.title!=='Remote renamed draft')throw Error('Renamed title not saved');
         const originalFactory=LmRemoteWorkspace;let failOnce=true;
         window.LmRemoteWorkspace={...originalFactory,create(options){const workspace=originalFactory.create(options);return {...workspace,putDatasets(...args){if(failOnce){failOnce=false;return Promise.reject(Error('injected quota failure'));}return workspace.putDatasets(...args);}};}};
         await LmDatabaseEditor.open(reconnected,target.projectId);window.LmRemoteWorkspace=originalFactory;
         try{await LmDatabaseEditor.stageMetadata('failure-test',[{kind:'note',entries:[{id:'retry-note',text:'Durable retry note'}]}]);throw Error('Metadata failure not surfaced')}catch(error){if(!error.message.includes('injected quota'))throw error}
         if(!LmDatabaseEditor.metadataUnsaved())throw Error('Failed metadata not protected');
         try{LmDatabaseEditor.leave();throw Error('Unsafe project close allowed')}catch(error){if(!error.message.includes('Metadata'))throw error}
         try{await LmEditorWorkingCopy.assertCacheResetSafe();throw Error('Unsafe metadata cache reset allowed')}catch(error){if(!error.message.includes('Metadata'))throw error}
         const retryMenu=document.getElementById('databaseSaveActions');retryMenu.open=true;
         const retryButton=retryMenu.querySelector('[data-database-action="retry"]');
         if(retryButton.hidden||retryMenu.querySelector('[data-database-action="backup"]').hidden)throw Error('Retry or backup control missing');
         retryButton.click();
         for(let attempt=0;attempt<100&&retryButton.disabled;attempt++)await new Promise(r=>setTimeout(r,25));
         await LmDatabaseEditor.sync();
         if(!retryButton.hidden)throw Error('Retry remains visible after recovery');
         if(LmDatabaseEditor.metadataUnsaved())throw Error('Successful metadata retry remained blocked');
         if(!(await reconnected.adapter.manifest(target.projectId)).metadata.some(row=>row.kind==='note'&&row.payload.id==='retry-note'))throw Error('Retry note not durable');
         const lazyProjectId=crypto.randomUUID(),lazyDraftId=crypto.randomUUID(),lazyChapterId=crypto.randomUUID();
         await reconnected.adapter.createProject({id:lazyProjectId,title:'Lazy browser fixture',type:'novel',language:'hi'});
         const partId=crypto.randomUUID();
         const operations=[{type:"part.put",id:partId,baseRevision:0,title:"Existing database part",synopsis:"Part notes",orderKey:1024}];
         for(const [id,kind,text] of [[lazyDraftId,'draft','पहला उपलब्ध draft'],[lazyChapterId,'chapter','सर्वर वाला पूरा chapter']]){
           operations.push({type:'document.create',id,title:kind,kind,...(kind==='chapter'?{partId}:{})});
           operations.push({type:'document.patch',id,baseRevision:0,deletedIds:[],upserts:LmParagraphModel.fromText(text).map((p,i)=>({...p,orderKey:(i+1)*1024}))});
         }
         await reconnected.adapter.apply(lazyProjectId,{protocolVersion:1,operationId:crypto.randomUUID(),operations});
         let lazyReads=0,missingOffline=false;
         const lazyConnection={...reconnected,adapter:{...reconnected.adapter,async readDocument(...args){if(missingOffline){const error=Error('synthetic offline');error.status=0;throw error;}lazyReads++;return reconnected.adapter.readDocument(...args);}}};
         await LmDatabaseEditor.open(lazyConnection,lazyProjectId,{documentId:lazyDraftId});
         await new Promise(r=>setTimeout(r,1400));
         if(lazyReads!==1||chapterDrafts[0]._contentLoadState!=='loaded'||chapters[0]._contentLoadState!=='unloaded')throw Error('Lazy open downloaded adjacent chapter or mislabelled placeholders');
         if(chapters[0]._wordCount!==4)throw Error('Unloaded chapter word count missing');
         openAdvancedEditorSettings();
         const advanced=document.getElementById('advancedEditorSettingsModal');
         LmDatabaseEditor.renderStorageControls?.();
         const reset=advanced.querySelector('[onclick^="resetAdvancedEditorSetting("]');
         if(!reset||reset.disabled)throw Error('Advanced Settings reset is blocked');
         reset.click();
         const size=advanced.querySelector('[data-advanced-runtime-key="globalFontSize"]');
         size.value='22';size.dispatchEvent(new Event('input',{bubbles:true}));
         const saveAdvanced=advanced.querySelector('[data-advanced-settings-footer] .is-primary');
         if(saveAdvanced.disabled)throw Error('Advanced Settings save is blocked');
         saveAdvanced.click();
         for(let i=0;i<100&&projectManifest.globalTextFormatting?.globalFontSize!==22;i++)await new Promise(r=>setTimeout(r,25));
         if(projectManifest.globalTextFormatting?.globalFontSize!==22)throw Error('Advanced Settings Save did not apply font size');
         await LmDatabaseEditor.metadataFlush();
         closeAdvancedEditorSettings();
         await LmDatabaseEditor.persistAdvancedSettings({formatting:{fontSize:22}});
         await LmDatabaseEditor.sync();
         const preferences=await reconnected.adapter.manifest(lazyProjectId);
         if(preferences.documents.find(d=>d.id===lazyChapterId)?.settings?.formatting?.fontSize!==22)throw Error('Unopened chapter formatting was not saved');
         if(!preferences.metadata.some(row=>row.payload.id==='editor-advanced'&&row.payload.globalTextFormatting?.globalFontSize===22))throw Error('Project formatting was not saved');
         if(lazyReads!==1)throw Error('Settings save loaded chapter text');

         const portable={format:NAMING_PORTABLE_FORMAT,version:NAMING_PORTABLE_VERSION,names:[{name:'सर्वर',aliases:[],category:'Remote',description:'Scan fixture'}]};
         await loadPortableNamingImportFile(new File([JSON.stringify(portable)],'fixture.json'));
         if(namingPortableTransferState.stage!=='complete')throw Error('Naming import failed: '+namingPortableTransferState.warning);
         await LmDatabaseEditor.sync();
         const imported=(await reconnected.adapter.manifest(lazyProjectId)).metadata.find(row=>row.kind==='naming-entry'&&row.payload.name==='सर्वर');
         if(!imported||imported.payload.source?.documentId!==lazyChapterId)throw Error('Naming import did not find name in unloaded chapter');
         const exported=portableNamingExportPayload(await LmInitialRendering.ensureFullNamingData());
         if(!exported.names.some(name=>name.name==='सर्वर'))throw Error('Naming export lost imported name');
         if(chapters[0]._contentLoadState!=='unloaded')throw Error('Naming scan changed lazy document state');
         lazyReads=1;
         missingOffline=true;
         try{await LmDatabaseEditor.navigate('chapter',0);throw Error('Unavailable offline chapter opened')}catch(e){if(e.message!=='synthetic offline')throw e;}
         if(activeEditorDocument().id!==lazyDraftId||!getCleanEditorText().includes('पहला उपलब्ध'))throw Error('Failed lazy navigation replaced active text');
         missingOffline=false;expandedPartIndex=-1;renderChapters();
         const partButton=document.querySelector('[onclick="togglePartExpansion(0)"]');
         if(!partButton||partButton.disabled||projectManifest.parts[0].title!=='Existing database part')throw Error('Database Parts were not rendered');
         partButton.click();
         document.querySelector('[onclick="handleChapterItemClick(event, 0)"]').click();
         for(let attempt=0;attempt<100&&activeEditorDocument().id!==lazyChapterId;attempt++)await new Promise(r=>setTimeout(r,25));
         if(activeEditorDocument().id!==lazyChapterId||!getCleanEditorText().includes('पूरा chapter')||lazyReads!==2)throw Error('Selected chapter not loaded correctly');
         missingOffline=true;await LmDatabaseEditor.navigate('draft',0);
         if(activeEditorDocument().id!==lazyDraftId||lazyReads!==2)throw Error('Cached draft did not open offline');
         missingOffline=false;
         document.getElementById('storySummaryTitle').click();
         document.querySelector('[onclick="beginStoryInfoEdit()"]').click();
         document.getElementById('storyTitleInp').value='Renamed database project';
         document.getElementById('storyAuthorInp').value='Database Author';markStoryInfoEdited();
         document.getElementById('storyInfoSaveBtn').click();
         for(let i=0;i<100&&projectManifest.title!=='Renamed database project';i++)await new Promise(r=>setTimeout(r,25));
         const info=(await reconnected.adapter.manifest(lazyProjectId)).project;
         if(info.title!=='Renamed database project'||info.metadata.author!=='Database Author')throw Error('Project Info form did not save to Database');
         lmAdvancedWordEditing.loadDictionaryPayload({version:1,categories:['General'],rules:[{id:'bulk-draft',aliases:['draft'],replace:'लेखन',category:'General'},{id:'bulk-chapter',aliases:['chapter'],replace:'अध्याय',category:'General'}]},{projectHandle:null});
         await lmAdvancedWordEditing.flush();await LmDatabaseEditor.sync();
         const bulkResult=await lmAdvancedWordEditing.applyDictionaryToAllDrafts();
         if(!bulkResult.changed||bulkResult.count!==2||!getCleanEditorText().includes('लेखन'))throw Error('Database dictionary bulk action failed');
         await LmDatabaseEditor.sync();
         if(!LmParagraphModel.toText((await reconnected.adapter.readDocument(lazyChapterId)).paragraphs).includes('अध्याय'))throw Error('Bulk action skipped saved chapter');
         const bigStore=await LmWorkingStore.open();
         const bigWorkspace=LmRemoteWorkspace.create({connection:lazyConnection,store:bigStore});
         const bigText=Array.from({length:1501},(_,i)=>'draft '+i).join(String.fromCharCode(10));
         const bigId=await bigWorkspace.createDocument(lazyProjectId,{title:'Large browser draft',text:bigText});await bigWorkspace.flush(lazyProjectId);bigStore.close();
         await LmDatabaseEditor.open(lazyConnection,lazyProjectId,{documentId:bigId});
         const bigResult=await lmAdvancedWordEditing.applyDictionaryToAllDrafts();
         if(!bigResult.changed||bigResult.count!==1501)throw Error('Large dictionary action did not cover every paragraph: '+JSON.stringify(bigResult));
         await LmDatabaseEditor.sync();
         const bigSaved=await reconnected.adapter.readDocument(bigId);
         if(bigSaved.paragraphs.length!==1501||bigSaved.paragraphs.some(p=>p.text.includes('draft')))throw Error('Large staged editor save incomplete');
         selectedDraftIndexes.clear();selectedDraftIndexes.add(chapterDrafts.findIndex(d=>d.id===lazyDraftId));selectedDraftIndexes.add(chapterDrafts.findIndex(d=>d.id===bigId));
         openDraftMergePanel();if(document.getElementById('draftDetailsPanel').hidden)throw Error('Database merge panel did not open');
         await confirmDraftMerge(true);await LmDatabaseEditor.sync();
         const copyMergeId=activeEditorDocument().id;
         if(copyMergeId===bigId||copyMergeId===lazyDraftId||!getCleanEditorText().includes('पहला उपलब्ध लेखन'))throw Error('Copy & Merge did not open merged text');
         if((await reconnected.adapter.manifest(lazyProjectId)).documents.find(d=>d.id===lazyDraftId).deleted)throw Error('Copy merge removed source');
         selectedDraftIndexes.clear();selectedDraftIndexes.add(chapterDrafts.findIndex(d=>d.id===lazyDraftId));selectedDraftIndexes.add(chapterDrafts.findIndex(d=>d.id===bigId));
         openDraftMergePanel();await confirmDraftMerge(false);await LmDatabaseEditor.sync();
         const mergeManifest=await reconnected.adapter.manifest(lazyProjectId);
         if(!mergeManifest.documents.find(d=>d.id===lazyDraftId).deleted||!mergeManifest.documents.find(d=>d.id===bigId).deleted||mergeManifest.documents.find(d=>d.id===copyMergeId).deleted)throw Error('Merge source deletion/preserved copy incorrect');
         const refreshId=activeEditorDocument().id,refreshText=getCleanEditorText(),refreshMetadata=mergeManifest.documents.find(d=>d.id===refreshId);
         await reconnected.adapter.apply(lazyProjectId,{protocolVersion:1,operationId:crypto.randomUUID(),operations:[{type:'document.patch',id:refreshId,baseRevision:refreshMetadata.revision,title:'Other device title',upserts:[],deletedIds:[]}]});
         const syncMenu=document.getElementById('databaseSaveActions');syncMenu.open=true;syncMenu.querySelector('[data-database-action="sync"]').click();
         for(let attempt=0;attempt<100&&activeEditorDocument().title!=='Other device title';attempt++)await new Promise(r=>setTimeout(r,50));
         if(activeEditorDocument().title!=='Other device title'||getCleanEditorText()!==refreshText)throw Error('Sync did not refresh remote metadata while preserving selected text');




         const draftCount=chapterDrafts.length;
         const controls=['editorAutoScrollApplyAllBtn','editorAutoScrollClickRepositionToggleBtn','toolDockToggle','wordEditingCollectSettingsBtn'];
         if(controls.some(id=>document.getElementById(id)?.hasAttribute('data-database-disabled')))throw Error('Database filter disabled an editor control');
         document.getElementById('toolDockToggle').click();
         if(document.getElementById('toolDockToggle').getAttribute('aria-expanded')!=='true')throw Error('Writing Tools did not open');
         document.getElementById('toolDockToggle').click();
         const trigger=document.getElementById('textImportTrigger');
         if(trigger.disabled)throw Error('Text Import trigger is disabled');
         trigger.click();
         if(document.getElementById('textImportModal')?.hidden!==false)throw Error('Text Import trigger did not open the panel');
         openDroppedTextImportText('A raw draft from text import '.repeat(textImportActionMinimumWords()));
         await runRawTextImport();
         if(!getCleanEditorText().includes('A raw draft from text import'))throw Error('Raw imported draft was not opened: '+textImportState?.error);
         await LmTextImportProgress.apply({importTarget:'chapters',remainderText:'Keep this remainder'},[{title:'Imported chapter fixture',text:'Chapter imported from text'}]);
         await LmDatabaseEditor.sync();
         const importedDocs=(await reconnected.adapter.manifest(lazyProjectId)).documents;
         if(!importedDocs.some(doc=>doc.title==='Imported chapter fixture'&&doc.part_id===partId))throw Error('Advanced import did not save chapter in the Part');
         if(importedDocs.filter(doc=>doc.kind==='draft'&&!doc.deleted).length!==draftCount+2)throw Error('Raw draft and advanced remainder not persisted');

         await LmDatabaseEditor.deletePart(0);
         const detached=(await reconnected.adapter.manifest(lazyProjectId));
         if(!detached.parts.find(part=>part.id===partId)?.deleted||detached.documents.find(doc=>doc.id===lazyChapterId)?.part_id!==null)throw Error('Part deletion did not move chapter to Raw');
         await LmDatabaseEditor.moveChaptersToDraft([chapters.findIndex(item=>item.id===lazyChapterId)]);
         await LmDatabaseEditor.sync();
         const converted=(await reconnected.adapter.manifest(lazyProjectId)).documents.find(doc=>doc.id===lazyChapterId);
         if(converted?.kind!=='draft'||activeEditorDocument()?.id!==lazyChapterId)throw Error('Saved chapter did not become active draft');
         parent.__databaseScreenshotRequested='database-editor';
         for(let attempt=0;attempt<50&&parent.__databaseScreenshotRequested;attempt++)await new Promise(r=>setTimeout(r,50));
         LmDatabaseEditor.leave();
       })()\`);
       results.push('PASS Text Import trigger / raw draft / advanced chapter and remainder');
       results.push('PASS Sync button refresh / other-device title / selected text preservation');
       results.push('PASS Database merge panel / Copy & Merge / source preservation / atomic Merge');
       results.push('PASS Database dictionary bulk action / 1501-paragraph staged save / editor reopen');
       results.push('PASS on-demand chapter loading / no adjacent folder reads / offline unavailable guard / cached offline navigation');
       results.push('PASS Database UI connect / create / same editor / server save / offline edit / startup restore / keyboard Ctrl+S / reconnect');
       results.push('PASS draft promotion / locked chapter / recovery autosave / review resume / atomic commit / discard / conflict recovery');
       results.push('PASS Naming/Facts UI add / description history / durable metadata queue / reopen / explicit delete tombstones');
       results.push('PASS dictionary metadata save / alias priority / reopen / explicit deletion');
       results.push('PASS title commit / metadata failure injection / cache-reset and project-close guard / durable retry');
     }
   }
   if(page==='news-article-editor.html'&&location.search.includes('apiPort=')){
     await frame.contentWindow.eval(\`(async()=>{
       const base='http://127.0.0.1:'+new URLSearchParams(parent.location.search).get('apiPort');
       const conn=await LmDatabaseProfiles.connect({name:'News browser fixture',baseUrl:base,token:'browser-synthetic-token'});
       const handle=await (await navigator.storage.getDirectory()).getDirectoryHandle('news-hybrid-test',{create:true});
       const io=LmLocalFolderAdapter.create(handle);
       await io.writeJson('Chapters_info.json',{title:'News migration test',type:'news',language:'hi'});
       await io.writeJson('NewsDesk_Articles.json',{articles:[{id:'fixture-news-article',headline:'Local headline',bodyHTML:'<p><b>News body</b></p>'}]});
       const sync=LmFolderSync.create(handle,conn);
       const result=await sync.sync({linkNew:true});
       await LmNewsDatabaseEditor.open(conn,result.projectId);
       if(document.getElementById('newsHeadline').value!=='Local headline')throw Error('News project did not open imported article');
       document.getElementById('newsHeadline').value='Server headline';
       await saveNewsArticle(true);await sync.sync();
       const rows=(await io.readJson('NewsDesk_Articles.json')).articles;
       if(rows[0].headline!=='Server headline'||!rows[0].bodyHTML.includes('<b>News body</b>'))throw Error('News edit did not sync to folder');
       await LmNewsDatabaseEditor.leave();
     })()\`);
     results.push('PASS News folder migration / same editor / article save and download');
   }
   frame.remove();
 }
 document.getElementById('result').textContent=results.join('\\n')+'\\nBROWSER_PASS';
})().catch(e=>document.getElementById('result').textContent='BROWSER_FAIL '+e.stack);
</script>`);
console.log('Browser harness: tmp/storage-browser-test.html');
