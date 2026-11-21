'use strict';

(function initializeDatabaseEditor(root) {
  let current=null;
  let epoch=0;
  let navigation=Promise.resolve();
  const selectionKey='lm_database_editor_selection_v1';
  function active(){return Boolean(current);}
  function label() {
    if(!current)return '';
    if(current.error?.status===409)return 'Sync conflict • edits इस डिवाइस पर सुरक्षित हैं';
    return current.pending ? 'इस डिवाइस पर सुरक्षित • server sync बाकी' : 'अंतिम save server पर synced';
  }
  function leave({clearRoute=false}={}){
    if(current && (current.metadataInFlight || current.metadataFailures?.size || root.lmAdvancedWordEditing?.hasPendingSave()))throw new Error('Metadata अभी save नहीं हुई है। Retry या recovery export के बाद project बदलें।');
    for(const node of document.querySelectorAll('[data-database-disabled]')){if('disabled' in node)node.disabled=node.dataset.databaseDisabled==='true';node.removeAttribute('data-database-disabled');node.removeAttribute('aria-disabled');}
    if(current){
      const addButton=document.getElementById('addChapterBtn');
      if(addButton)addButton.textContent=text().addChapter;
    }
    current?.store.close();current=null;epoch++;document.body.removeAttribute('data-database-editor');document.getElementById('databaseSaveActions')?.remove();
    if(clearRoute){const url=new URL(root.location.href);if(url.searchParams.has('databaseProject')){url.searchParams.delete('databaseProject');url.searchParams.delete('databaseProfile');root.history.replaceState({},'',url);}}
  }
  function remember(){if(current)root.localStorage.setItem(selectionKey,JSON.stringify({profileId:current.profile.id,projectId:current.projectId,documentId:activeEditorDocument()?.id}));}
  function renderStorageControls(){
    const addButton=document.getElementById('addChapterBtn');
    if(addButton)addButton.textContent=text().addDraft;
    const anchor=document.getElementById('save-status');
    let menu=document.getElementById('databaseSaveActions');
    if(anchor && !menu){
      menu=document.createElement('details');
      menu.id='databaseSaveActions';
      menu.className='database-save-actions';
      menu.dataset.databaseUi='true';
      const summary=document.createElement('summary');
      summary.title='Database save and sync';
      menu.append(summary);
      const controls=document.createElement('div');
      controls.className='database-save-menu';
      for(const [key,title,action] of [
        ['sync','Sync now',refreshProject],
        ['retry','Retry save',retryMetadata],
        ['conflict','टकराव देखें',resolveConflict],
        ['backup','Download recovery backup',exportRecovery]
      ]){
        const button=document.createElement('button');
        button.type='button';
        button.dataset.databaseAction=key;
        button.textContent=title;
        button.addEventListener('click',async()=>{
          button.disabled=true;
          try{await action();menu.open=false;}
          catch(error){showMiniReminder(error.message);}
          finally{button.disabled=false;}
        });
        controls.append(button);
      }
      menu.append(controls);
      anchor.after(menu);
    }
    if(menu){
      const failed=Boolean(current.metadataFailures.size);
      const conflict=current.error?.code==='revision_conflict';
      const summary=menu.querySelector('summary');
      summary.textContent=failed||conflict?'DB · समीक्षा':current.pending?'DB · बाकी':'DB · सेव';
      summary.setAttribute('aria-label',failed?'Database metadata save failed':label());
      menu.querySelector('[data-database-action="retry"]').hidden=!failed;
      menu.querySelector('[data-database-action="conflict"]').hidden=!conflict;
      menu.querySelector('[data-database-action="backup"]').hidden=!(current.hasRecovery||current.pending||failed);
    }
    for(const node of document.querySelectorAll('[onclick]')){
      if(node.closest('[data-database-ui],#advancedEditorSettingsModal,#textImportModal,#advancedDraftPromoteModal'))continue;
      const calls=[...(node.getAttribute('onclick')||'').matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map(match=>match[1]);
      if(node.id==='aiBtn'||node.closest('#ai-panel')||!calls.length||calls.some(name=>!allowed.has(name)&&!['stopPropagation','preventDefault'].includes(name))){
        if(!node.hasAttribute('data-database-disabled'))node.dataset.databaseDisabled=String(Boolean(node.disabled));
        if('disabled' in node)node.disabled=true;node.setAttribute('aria-disabled','true');
      }
    }
  }
  function materialize(state,preferredId,{activateRecovery=false}={}) {
    const metadata=state.manifest.project;
    const advanced=Object.values(state.metadataRows||state.manifest.metadata||[]).find(row=>!row.deleted&&row.kind==='project-settings'&&row.payload.id==='editor-advanced')?.payload;
    const documentPreferences=settings=>({...(settings?.formatting||{}),editorSettings:settings?.editorSettings});
    const parts=(state.manifest.parts||[]).filter(part=>!part.deleted);
    const partIndexes=new Map(parts.map((part,index)=>[part.id,index]));
    const partChapters=new Map();
    projectManifest=normalizeProjectManifest({
      ...createProjectManifest(metadata.title),globalTextFormatting:advanced?.globalTextFormatting,autoScroll:advanced?.autoScroll,smartPaste:advanced?.smartPaste,title:metadata.title,type:metadata.type,language:metadata.language,
      author:metadata.metadata?.author,synopsis:metadata.metadata?.synopsis,
      createdAt:metadata.created_at,updatedAt:metadata.updated_at,
      parts:parts.map((part,index)=>({no:index+1,title:part.title,synopsis:part.synopsis,chapters:[]}))
    });
    chapters=[];chapterDrafts=[];chapterTrashDrafts=[];chapterEditDrafts={};
    const orderedDocuments=Object.values(state.documents).sort((a,b)=>(a.metadata.settings?.documentOrder||0)-(b.metadata.settings?.documentOrder||0)||a.metadata.id.localeCompare(b.metadata.id));
    for(const document of orderedDocuments){
      if(document.metadata.deleted)continue;
      const body=Array.isArray(document.paragraphs)?root.LmParagraphModel.toText(document.paragraphs):null;
      const source={...document.metadata,...documentPreferences(document.metadata.settings),contentPath:'database/'+document.metadata.id,
        wordCount:body===null?document.metadata.render_stats?.wordCount:storageWordCountFromText(body),
        content:body===null?'':textToEditorHTML(body)};
      let item;
      if(document.metadata.kind==='draft'){
        item=normalizeDraft(source,chapterDrafts.length);chapterDrafts.push(item);
      }else if(document.metadata.kind==='chapter'){
        const partIndex=partIndexes.get(document.metadata.part_id)??-1;
        const chapterIndex=partChapters.get(partIndex)||0;
        partChapters.set(partIndex,chapterIndex+1);
        item=normalizeChapter(source,chapters.length,partIndex,chapterIndex);
        chapters.push(item);
        (partIndex<0?projectManifest.chapters:projectManifest.parts[partIndex].chapters).push(item);
      }
      if(item){item._contentLoadState=Array.isArray(document.paragraphs)?'loaded':'unloaded';item._contentPresented=Array.isArray(document.paragraphs);}
    }
    for(const document of Object.values(state.documents)){
      if(document.metadata.kind!=='recovery'||document.metadata.deleted||!Array.isArray(document.paragraphs))continue;
      const index=chapters.findIndex(chapter=>chapter.id===document.metadata.settings?.sourceDocumentId);if(index<0)continue;
      const chapterKey=chapterEditDraftKey(index);
      const content=textToEditorHTML(root.LmParagraphModel.toText(document.paragraphs));
      chapterEditDrafts[chapterKey]=normalizeChapterEditDraft({id:document.metadata.id,chapterKey,chapterIndex:index,title:document.metadata.title,
        ...documentPreferences(document.metadata.settings?.documentSettings),content,contentPath:'database/'+document.metadata.id,lastAutosavedHTML:content,lastAutosavedText:root.LmParagraphModel.toText(document.paragraphs)},chapterKey);
    }
    const allRows=Object.values(state.metadataRows||Object.fromEntries((state.manifest.metadata||[]).map(row=>[row.kind+':'+row.id,row])));
    const rows=allRows.filter(row=>!row.deleted);
    const summary=state.manifest.rendering?.naming;
    const pendingNaming=state.pendingBatches.some(batch=>batch.metadataTargets?.some(target=>target.kind==='naming-entry'));
    if(current)current.namingSummary=summary&&!pendingNaming&&!allRows.some(row=>row.kind==='naming-entry'&&row.revision>summary.revision)?summary:null;
    const namingState=rows.find(row=>row.kind==='project-settings'&&row.payload.id==='naming-state')?.payload||{};
    namingData=normalizeNamingData({...namingState,categories:rows.filter(row=>row.kind==='naming-category').map(row=>row.payload),entries:rows.filter(row=>row.kind==='naming-entry').map(row=>row.payload)});
    storyFacts=normalizeStoryFacts(rows.filter(row=>row.kind==='fact').map(row=>row.payload));
    activeSidePanel='naming';
    const dictionaryState=rows.find(row=>row.kind==='project-settings'&&row.payload.id==='dictionary-state')?.payload||{};
    const rules=rows.filter(row=>row.kind==='dictionary-rule').map(row=>row.payload);
    const byId=new Map(rules.map(rule=>[rule.id,rule]));
    const ruleIds=dictionaryState.ruleIds||rules.map(rule=>rule.id);
    const ordered=[...ruleIds.filter(id=>byId.has(id)).map(id=>byId.get(id)),...rules.filter(rule=>!ruleIds.includes(rule.id))];
    if(current){current.dictionaryData={...dictionaryState,rules:ordered};delete current.dictionaryData.id;delete current.dictionaryData.ruleIds;root.lmAdvancedWordEditing?.loadDictionaryPayload(current.dictionaryData,{projectHandle:null});}
    curDraft=Math.max(0,chapterDrafts.findIndex(item=>item.id===preferredId));curChap=0;
    activeEditorMode=chapterDrafts.length?'draft':'chapter';
    if(!chapterDrafts.length)curDraft=-1;
    isDraftTrashMode=false;curTrashDraft=-1;activeChapterEditKey=null;isChapterEditUnlocked=false;
    const chapterIndex=chapters.findIndex(chapter=>chapter.id===preferredId);
    const recovery=Object.values(chapterEditDrafts).find(item=>item.id===preferredId);
    if(chapterIndex>=0 || recovery){
      curChap=recovery?recovery.chapterIndex:chapterIndex;
      curDraft=-1;
      activeEditorMode='chapter';
      curPart=chapters[curChap]?.partIndex??-1;
      if(curPart>=0)expandedPartIndex=curPart;
    }
    if(recovery && activateRecovery){isChapterEditUnlocked=true;activeChapterEditKey=recovery.chapterKey;}
    isProjectDataLoading=false;lastSavedChapterHTML='';
  }
  async function loadSelection(workspace,projectId,preferredId){
    let state=await workspace.read(projectId);
    const available=Object.values(state.documents).filter(item=>!item.metadata.deleted);
    const ordered=available.filter(item=>['draft','chapter'].includes(item.metadata.kind)).sort((a,b)=>(a.metadata.settings?.documentOrder||0)-(b.metadata.settings?.documentOrder||0)||a.metadata.id.localeCompare(b.metadata.id));
    const selected=available.find(item=>item.metadata.id===preferredId)||ordered.find(item=>item.metadata.kind==='draft')||ordered[0];
    if(!selected)return state;
    const sourceId=selected.metadata.kind==='recovery'?selected.metadata.settings?.sourceDocumentId:selected.metadata.id;
    const ids=new Set([selected.metadata.id,sourceId,...available.filter(item=>item.metadata.kind==='recovery'&&item.metadata.settings?.sourceDocumentId===sourceId).map(item=>item.metadata.id)].filter(Boolean));
    for(const id of ids)await workspace.ensureDocument(projectId,id);
    return workspace.read(projectId);
  }
  async function open(connection,projectId,{documentId}={}) {
    if(current)await prepareLeave();
    const nextEpoch=++epoch;
    const store=await root.LmWorkingStore.open();
    const workspace=root.LmRemoteWorkspace.create({connection,store});
    let state;
    try{
      state=await workspace.openProject(projectId,{lazy:true,refresh:true});
      if(!Object.values(state.documents).some(item=>!item.metadata.deleted && ['draft','chapter'].includes(item.metadata.kind))){
        await workspace.createDocument(projectId,{title:'Draft 1'});state=await workspace.read(projectId);
      }
      state=await loadSelection(workspace,projectId,documentId);
      if(nextEpoch!==epoch){store.close();return false;}
      setActiveProjectFolder(null);
      root.LmWorkspaceSectionLoader?.reset?.();
      current={profile:connection.profile,connection,workspace,store,projectId,pending:state.pendingBatches.length,error:state.lastError,hasRecovery:Boolean(state.conflictArchives?.length),metadataQueue:Promise.resolve(),metadataInFlight:0,metadataFailures:new Map()};
      root.LmProjectRepository.sessions.activate({mode:'database',projectId,remoteProjectId:projectId,profileId:connection.profile.id,accountId:connection.profile.userId});
      materialize(state,documentId,{activateRecovery:true});document.body.dataset.databaseEditor='true';
      for(const name of ['closeNameDetailPanel','closeNamingEntryPanel','closeCategoryActionPanel','closePartDetailsPanel','closeChapterDetailsPanel','closeDraftActionsPanel','closeFactComposer'])root[name]?.();
      loadPasteCopySettings();remember();renderStorageControls();
      if(typeof renderChapters==='function')renderChapters();
      if(typeof loadEditor==='function')loadEditor();
      root.renderTags?.();root.renderFacts?.();
      if(current.pending)void sync().catch(()=>{});
      return true;
    }catch(error){store.close();throw error;}
  }
  async function restore() {
    const query=new URLSearchParams(root.location.search);
    if(!query.has('databaseProject'))return false;
    const profile=root.LmDatabaseProfiles.list().find(item=>item.id===query.get('databaseProfile'));
    if(!profile)throw new Error('Database profile नहीं मिला। Home पर connection खोलें।');
    const connected=await root.LmDatabaseProfiles.resume(profile.id).catch(()=>null);
    const offline={manifest:async()=>{const error=new Error('Connection फिर से खोलें।');error.status=0;throw error;},apply:async()=>{const error=new Error('Connection फिर से खोलें।');error.status=0;error.code='disconnected';throw error;}};
    return open(connected||{profile,scopeId:JSON.stringify([profile.instanceId,profile.userId,profile.id]),adapter:offline},query.get('databaseProject'),
      {documentId:rememberedDocument(profile.id,query.get('databaseProject'))});
  }
  function rememberedDocument(profileId,projectId){
    try {
      const remembered=JSON.parse(root.localStorage.getItem(selectionKey)||'{}');
      if(remembered.profileId===profileId && remembered.projectId===projectId)return remembered.documentId;
    } catch {}
  }
  async function prepareNavigation(workspace,profileId,projectId){
    await workspace.openProject(projectId,{refresh:true,lazy:true});
    await loadSelection(workspace,projectId,rememberedDocument(profileId,projectId));
  }
  async function save({skipEditorFlush=false}={}) {
    const captured=current;if(!captured)return;
    const document=activeEditorDocument();
    if(!skipEditorFlush && typeof flushEditorHTMLMemoryCommit==='function')await flushEditorHTMLMemoryCommit();
    if(current!==captured || document?.id!==activeEditorDocument()?.id)throw new Error('Project या document बदल गया है।');
    if(!document || (!isDraftActive()&&!isChapterEditDraftActive()))return;
    const text=getCleanEditorText();
    const html=getCleanEditorHTML();
    await captured.workspace.saveDocument(captured.projectId,document.id,text);
    if(document.id===activeEditorDocument()?.id && getCleanEditorHTML()===html)activeEditorDocument().content=html;
    const status=await captured.workspace.status(captured.projectId);
    if(current===captured){captured.pending=status.pending;remember();renderStorageControls();}
    // Local durability completes the editor save. Network runs independently.
    if(current===captured)void sync().catch(()=>{});
  }
  async function manualSave(){
    if(isEditingChapterTitle && !await commitChapterTitleEdit())return;
    const captured=current,documentItem=activeEditorDocument();
    if(typeof flushEditorHTMLMemoryCommit==='function')await flushEditorHTMLMemoryCommit();
    if(current!==captured || documentItem?.id!==activeEditorDocument()?.id)throw new Error('Document बदल गया है।');
    const html=getCleanEditorHTML();
    const recovery=isChapterEditDraftActive();
    const editor=document.getElementById('editor'),editable=editor?.contentEditable;
    if(recovery && editor)editor.contentEditable='false';
    try{
    await save({skipEditorFlush:true});
    if(recovery && current===captured){
      const sourceId=await captured.workspace.commitRecovery(captured.projectId,documentItem.id);
      await repaint(captured,sourceId);void sync().catch(()=>{});
    }
    if(current===captured && documentItem?.id===activeEditorDocument()?.id && getCleanEditorHTML()===html){
      rememberCurrentChapterSaved(html);setSaveStatusDot('saved',label());
    }
    }finally{if(editor && documentItem?.id===activeEditorDocument()?.id)editor.contentEditable=editable;}
  }
  async function sync(){
    const captured=current;if(!captured)return;
    try{await captured.workspace.flush(captured.projectId);}
    finally{
      const status=await captured.workspace.status(captured.projectId);
      if(current===captured){captured.pending=status.pending;captured.error=status.lastError;renderStorageControls();if(getCleanEditorHTML()===lastSavedChapterHTML)setSaveStatusDot('saved',label());}
    }
  }
  function refreshProject(){
    const captured=current;
    const task=navigation.then(async()=>{
      if(!captured||current!==captured)return;
      const editor=document.getElementById('editor'),id=activeEditorDocument()?.id,editable=editor?.contentEditable,recovery=isChapterEditDraftActive();
      if(editor)editor.contentEditable='false';
      try{
        await prepareLeave();await sync();
        if(current!==captured)return;
        await captured.workspace.openProject(captured.projectId,{refresh:true,lazy:true});
        await repaint(captured,id,{activateRecovery:recovery,expectedDocumentId:id});
      }finally{if(editor&&current===captured&&activeEditorDocument()?.id===id)editor.contentEditable=editable;}
    });
    navigation=task.catch(()=>{});return task;
  }
  async function repaint(captured,documentId,options={}){
    await root.lmAdvancedWordEditing?.flushPending();
    await captured.metadataQueue.catch(()=>{});if(captured.metadataFailures.size)throw new Error('Metadata save failed; retry before changing document.');
    const state=await loadSelection(captured.workspace,captured.projectId,documentId);if(current!==captured)return false;
    if(options.expectedDocumentId!==undefined && activeEditorDocument()?.id!==options.expectedDocumentId)return false;
    materialize(state,documentId,options);captured.pending=state.pendingBatches.length;captured.error=state.lastError;captured.hasRecovery=Boolean(state.conflictArchives?.length);
    loadPasteCopySettings();renderChapters();loadEditor();remember();renderStorageControls();return true;
  }
  async function toggleRecovery(){
    const captured=current;if(!captured||isDraftActive())return;
    if(captured.error?.status===409)throw new Error('पहले Conflict review पूरा करें। आपकी edits सुरक्षित हैं।');
    const sourceId=chapters[curChap]?.id;if(!sourceId)return;
    if(isChapterEditUnlocked){
      await save();await repaint(captured,sourceId);return;
    }
    if(chapterEditDrafts[chapterEditDraftKey(curChap)]){showChapterEditRecoveryPanel(curChap);return;}
    const id=await captured.workspace.beginRecovery(captured.projectId,sourceId);
    await repaint(captured,id,{activateRecovery:true});void sync().catch(()=>{});
  }
  async function useRecovery(){
    const index=Number.isInteger(pendingChapterEditRecoveryIndex)?pendingChapterEditRecoveryIndex:curChap;
    const id=chapterEditDrafts[chapterEditDraftKey(index)]?.id;
    closeChapterEditRecoveryPanel();if(id&&current)await repaint(current,id,{activateRecovery:true});
  }
  async function discardRecovery(){
    const captured=current;if(!captured)return;
    const index=Number.isInteger(pendingChapterEditRecoveryIndex)?pendingChapterEditRecoveryIndex:curChap;
    const sourceId=chapters[index]?.id,id=chapterEditDrafts[chapterEditDraftKey(index)]?.id;
    closeChapterEditRecoveryPanel();if(!id)return;
    await captured.workspace.discardRecovery(captured.projectId,id);await repaint(captured,sourceId);void sync().catch(()=>{});
  }
  function promoteDraft(index,destination='part'){
    const captured=current;
    const targetId=chapterDrafts[index]?.id;
    if(!captured||!targetId)throw new Error('एक draft चुनें।');
    const task=navigation.then(async()=>{
      if(current!==captured)return;
      const editor=document.getElementById('editor');
      const oldId=activeEditorDocument()?.id;
      const editable=editor?.contentEditable;
      if(editor)editor.contentEditable='false';
      try{
        await prepareLeave();
        await captured.workspace.ensureDocument(captured.projectId,targetId);
        if(current!==captured)return;
        const state=await captured.workspace.read(captured.projectId);
        const partId=destination==='raw'?null:state.manifest.parts.filter(part=>!part.deleted).at(-1)?.id||null;
        await captured.workspace.promoteDraft(captured.projectId,targetId,{partId});
        await repaint(captured,targetId);
        void sync().catch(()=>{});
      }finally{if(editor&&current===captured&&activeEditorDocument()?.id===oldId)editor.contentEditable=editable;}
    });
    navigation=task.catch(()=>{});
    return task;
  }
  function promoteCurrent(){
    if(!isDraftActive())throw new Error('एक draft चुनें।');
    return promoteDraft(curDraft);
  }
  function saveStructure(operationsFor){
    const captured=current;
    const task=navigation.then(async()=>{
      if(!captured||current!==captured)throw new Error('Project बदल गया।');
      const activeId=activeEditorDocument()?.id;
      const editor=document.getElementById('editor'),editable=editor?.contentEditable;
      if(editor)editor.contentEditable='false';
      try{
        await prepareLeave();
        await captured.workspace.flush(captured.projectId);
        const state=await captured.workspace.read(captured.projectId);
        if(current!==captured)throw new Error('Project बदल गया।');
        const operations=await operationsFor(state,captured);
        if(current!==captured)throw new Error('Project बदल गया।');
        await captured.connection.adapter.apply(captured.projectId,{
          protocolVersion:1,operationId:root.LmParagraphModel.newId(),operations
        });
        await captured.workspace.openProject(captured.projectId,{refresh:true,lazy:true});
        await repaint(captured,activeId,{activateRecovery:true});
      }finally{
        if(editor&&current===captured&&activeEditorDocument()?.id===activeId)editor.contentEditable=editable;
      }
    });
    navigation=task.catch(()=>{});
    return task;
  }
  function saveProjectInfo(values){
    return saveStructure(async (state,captured)=>{
      if(captured.connection.capabilities?.schemaVersion<3)throw new Error('Project Info save करने के लिए Database schema upgrade चाहिए।');
      const project=state.manifest.project;
      const {project:latest}=await captured.connection.adapter.manifest(captured.projectId);
      const details=item=>[item.title,item.type,item.language,item.metadata?.author||'',item.metadata?.synopsis||''];
      if(JSON.stringify(details(project))!==JSON.stringify(details(latest))){
        throw new Error('Project Info दूसरे डिवाइस पर बदली। Sync now चलाकर दोबारा खोलें।');
      }
      return [{type:'project.update',baseRevision:latest.revision,title:values.title||project.title,
        projectType:values.type||project.type,language:values.language||project.language,
        author:values.author,synopsis:values.synopsis}];
    });
  }
  function savePart(index,values){
    return saveStructure((state,captured)=>{
      if(captured.connection.capabilities?.schemaVersion<3)throw new Error('Part details save करने के लिए Database schema upgrade चाहिए।');
      const part=state.manifest.parts.filter(item=>!item.deleted)[index];
      if(!part)throw new Error('Part उपलब्ध नहीं है।');
      return [{type:'part.put',id:part.id,baseRevision:part.revision,orderKey:Number(part.order_key),
        title:values.title,synopsis:values.synopsis}];
    });
  }
  function deletePart(index){
    return saveStructure(async (state,captured)=>{
      const part=state.manifest.parts.filter(item=>!item.deleted)[index];
      if(!part)throw new Error('Part उपलब्ध नहीं है।');
      const latest=await captured.connection.adapter.manifest(captured.projectId);
      const parts=latest.parts.filter(item=>!item.deleted);
      if(!parts.some(item=>item.id===part.id&&item.revision===part.revision))throw new Error('Part बदला है। Sync now चलाएँ।');
      const chapters=latest.documents.filter(item=>!item.deleted&&item.kind==='chapter'&&item.part_id===part.id);
      if(chapters.length&&parts.at(-1)?.id!==part.id)throw new Error('केवल खाली Part या आखिरी Part हटा सकते हैं।');
      return [...chapters.map(item=>({type:'document.patch',id:item.id,baseRevision:item.revision,partId:null,upserts:[],deletedIds:[]})),
        {type:'part.put',id:part.id,baseRevision:part.revision,orderKey:Number(part.order_key),title:part.title,deleted:true,requireEmpty:true}];
    });
  }
  function moveChaptersToDraft(indexes){
    const captured=current,ids=[...new Set(indexes.map(index=>chapters[index]?.id).filter(Boolean))];
    const task=navigation.then(async()=>{
      if(!captured||current!==captured||!ids.length)return;
      await prepareLeave();
      const changes=[];
      for(const id of ids){
        await captured.workspace.ensureDocument(captured.projectId,id);
        const state=await captured.workspace.read(captured.projectId);
        const recovery=Object.values(state.documents).find(item=>!item.metadata.deleted&&item.metadata.kind==='recovery'&&item.metadata.settings?.sourceDocumentId===id);
        const change={id,kind:'draft',partId:null};
        if(recovery){
          const edit=await captured.workspace.ensureDocument(captured.projectId,recovery.metadata.id);
          change.text=root.LmParagraphModel.toText(edit.paragraphs);
          change.settings=edit.metadata.settings.documentSettings||state.documents[id].metadata.settings;
          changes.push({id:edit.metadata.id,deleted:true});
        }
        changes.push(change);
      }
      if(current!==captured)throw new Error('Project बदल गया।');
      await captured.workspace.transaction(captured.projectId,changes,{checkState:state=>{
        if(ids.some(id=>state.documents[id]?.metadata.kind!=='chapter'||state.documents[id]?.metadata.deleted))throw new Error('Chapter बदल गया।');
      }});
      closeChapterDetailsPanel();closeDraftActionsPanel();
      selectedChapterIndexes.clear();
      void sync().catch(()=>{});
      await repaint(captured,ids[0]);
    });
    navigation=task.catch(()=>{});
    return task;
  }
  function addPart(){
    return saveStructure(state=>{
      const parts=state.manifest.parts.filter(part=>!part.deleted);
      const partId=root.LmParagraphModel.newId();
      const orderKey=Math.max(0,...parts.map(part=>Number(part.order_key)))+1024;
      const operations=[{type:'part.put',id:partId,baseRevision:0,orderKey,title:defaultPartTitle(parts.length)}];
      for(const document of state.manifest.documents){
        if(!document.deleted&&document.kind==='chapter'&&!document.part_id){
          operations.push({type:'document.patch',id:document.id,baseRevision:document.revision,partId,
            upserts:[],deletedIds:[]});
        }
      }
      return operations;
    });
  }
  async function commitTitle(){
    if(!isEditingChapterTitle)return true;
    const captured=current,documentItem=activeEditorDocument(),input=document.getElementById('chapterTitleInput');
    if(!captured||!documentItem||!input)return false;
    const title=input.value.trim(),recovery=isChapterEditDraftActive();
    input.disabled=true;
    try{
      await save();await captured.metadataQueue;
      await captured.workspace.renameDocument(captured.projectId,documentItem.id,title);
      isEditingChapterTitle=false;input.hidden=true;
      await repaint(captured,documentItem.id,{activateRecovery:recovery});void sync().catch(()=>{});return true;
    }catch(error){showMiniReminder(error.message);return false;}
    finally{input.disabled=false;}
  }
  async function resolveConflict(){
    const captured=current;if(!captured)return;
    await save();try{await sync();}catch{}
    const state=await captured.workspace.read(captured.projectId);
    if(state.lastError?.code!=='revision_conflict')throw new Error('अभी कोई revision conflict नहीं है।');
    const metadataConflict=state.pendingBatches.some(batch=>batch.metadataTargets?.some(target=>!target.maintenance));
    const choice=await root.requestAdvancedSettingsDecision({title:'Sync conflict review',message:metadataConflict?'Metadata दोनों जगह बदली है। Server version लेने पर local metadata recovery backup में सुरक्षित रहेगी।':'Server और device दोनों पर बदलाव हैं। Device text को नए drafts में रखें या server version खोलें। पुरानी local edits recovery backup में सुरक्षित रहेंगी।',actions:[{value:false,label:'Cancel'},{value:'server',label:'Use server version'},...(metadataConflict?[]:[{value:'drafts',label:'Keep my text as new drafts'}])]});
    if(!choice||current!==captured)return;
    const resolved=await captured.workspace.resolveConflict(captured.projectId,choice);
    const target=Object.values(resolved.documents).filter(document=>document.created&&!document.metadata.deleted).at(-1)?.metadata.id;
    await repaint(captured,target);if(choice==='drafts')void sync().catch(()=>{});
  }
  async function exportRecovery(){
    const captured=current;if(!captured)return;
    const state=await captured.workspace.read(captured.projectId);
    if(!state.conflictArchives?.length&&!captured.metadataFailures.size&&!state.pendingBatches.length)throw new Error('कोई pending recovery backup नहीं है।');
    const blob=new Blob([JSON.stringify({version:1,projectId:captured.projectId,archives:state.conflictArchives||[],pendingBatches:state.pendingBatches,documents:state.documents,metadataRows:state.metadataRows,unsavedMetadata:[...captured.metadataFailures.values()]},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),anchor=document.createElement('a');anchor.href=url;anchor.download='lekhak-recovery-'+captured.projectId+'.json';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function stageMetadata(owner,datasets){
    const captured=current;if(!captured)return Promise.resolve(false);
    if(datasets.some(dataset=>dataset.kind==='naming-entry'))captured.namingSummary=null;
    const snapshot=structuredClone(datasets);captured.metadataInFlight++;
    setSidePanelSaveLine('busy','Metadata इस डिवाइस पर save हो रही है');
    const operation=captured.metadataQueue.catch(()=>{}).then(()=>captured.workspace.putDatasets(captured.projectId,snapshot));
    const task=operation.then(result=>{captured.metadataFailures.delete(owner);return result;},error=>{captured.metadataFailures.set(owner,snapshot);if(current===captured)showMiniReminder('Metadata save नहीं हुई: '+error.message);throw error;}).finally(async()=>{
      captured.metadataInFlight--;
      if(current===captured){const status=await captured.workspace.status(captured.projectId);captured.pending=status.pending;renderStorageControls();if(!captured.metadataInFlight&&!captured.metadataFailures.size)setSidePanelSaveLine('saved','इस डिवाइस पर सुरक्षित');}
    });
    captured.metadataQueue=task;
    void task.then(()=>{if(current===captured)void sync().catch(()=>{});},()=>{});
    return task;
  }
  function persistNaming(options={}){
    const data=normalizeNamingData(options.authoritativeData||namingData);
    const {categories,entries,...settings}=data;
    return stageMetadata('naming',[{kind:'naming-category',entries:categories,removeMissing:options.allowCategoryRemoval===true},
      {kind:'naming-entry',entries,removeMissing:options.allowEntryRemoval===true},
      {kind:'project-settings',entries:[{...settings,id:'naming-state'}]}]);
  }
  async function persistAdvancedSettings({autoScroll,autoScrollFields,formatting,activeSettings}={}){
    const captured=current;if(!captured)return;
    const activeId=activeEditorDocument()?.id;
    const projectSettings=structuredClone({id:'editor-advanced',autoScroll:projectManifest.autoScroll,
      globalTextFormatting:projectManifest.globalTextFormatting,smartPaste:projectManifest.smartPaste});
    const state=await captured.workspace.read(captured.projectId);
    if(current!==captured)throw new Error('Project changed while saving settings.');
    const changes=[];
    for(const item of Object.values(state.documents)){
      const {id,kind,deleted}=item.metadata;
      if(deleted||!['chapter','draft','recovery'].includes(kind))continue;
      if(!autoScroll&&!formatting&&!(activeSettings&&id===activeId))continue;
      const settings={...item.metadata.settings};
      const target=kind==='recovery'?{...settings.documentSettings}:settings;
      if(autoScroll){
        const draft={editorSettings:target.editorSettings};
        if(autoScrollFields)overwriteDocumentFromEditorAutoScrollPanel(draft,autoScroll,autoScrollFields);
        else overwriteDocumentAutoScrollSettings(draft,autoScroll);
        target.editorSettings=draft.editorSettings;
      }
      if(formatting)target.formatting=formatting;
      if(activeSettings&&id===activeId)target.editorSettings=activeSettings;
      if(kind==='recovery')settings.documentSettings=target;
      changes.push({id,settings,settingsOnly:true});
    }
    if(changes.length)await captured.workspace.transaction(captured.projectId,changes);
    if(current!==captured)throw new Error('Project changed while saving settings.');
    await stageMetadata('advanced-settings',[{kind:'project-settings',entries:[projectSettings]}]);
  }
  function persistFacts(facts=storyFacts){return stageMetadata('facts',[{kind:'fact',entries:normalizeStoryFacts(facts),removeMissing:true}]);}
  function persistDictionary(payload){
    const snapshot=structuredClone(payload),{rules=[],...settings}=snapshot;
    if(current)current.dictionaryData=snapshot;
    return stageMetadata('dictionary',[{kind:'dictionary-rule',entries:rules,removeMissing:true},
      {kind:'project-settings',entries:[{...settings,id:'dictionary-state',ruleIds:rules.map(rule=>rule.id)}]}]);
  }
  async function prepareLeave(){
    const captured=current;if(!captured)return;
    await root.lmAdvancedWordEditing?.flushPending();
    await captured.metadataQueue.catch(()=>{});
    if(captured.metadataFailures.size)throw new Error('पहले unsaved metadata retry करें।');
    await save();
  }
  async function retryMetadata(){
    const captured=current;if(!captured)return;
    const failed=[...captured.metadataFailures];
    if(!failed.length)return;
    for(const [owner,datasets] of failed)await stageMetadata(owner,datasets);
  }
  root.addEventListener('beforeunload',event=>{if(current&&(current.metadataInFlight||current.metadataFailures?.size||root.lmAdvancedWordEditing?.hasPendingSave())){event.preventDefault();event.returnValue='';}});
  function importTextDocuments(documents,{raw=false,checkpoint,onCommitted}={}){
    const captured=current;
    const task=navigation.then(async()=>{
      if(!captured||current!==captured)throw new Error('Project changed before import.');
      if(documents.length>5000)throw new Error('Import up to 5000 documents at a time.');
      await prepareLeave();
      const state=await captured.workspace.read(captured.projectId);
      const partId=raw?null:(state.manifest.parts||[]).filter(part=>!part.deleted).at(-1)?.id??null;
      const changes=documents.map(item=>({...item,id:root.LmParagraphModel.newId(),create:true,
        ...(item.kind==='chapter'?{partId}:{})}));
      await checkpoint?.();
      if(current!==captured)throw new Error('Project changed before import.');
      await captured.workspace.transaction(captured.projectId,changes);
      onCommitted?.();
      void sync().catch(()=>{});
      await repaint(captured,changes[0].id);
      return changes[0].id;
    });
    navigation=task.catch(()=>{});
    return task;
  }
  async function addDraft(){
    const captured=current;if(!captured)return;
    const editor=document.getElementById('editor'),oldId=activeEditorDocument()?.id,editable=editor?.contentEditable;
    if(editor)editor.contentEditable='false';
    try{
      await save();if(current!==captured)return;
      const title='Draft '+(chapterDrafts.length+1);
      const id=await captured.workspace.createDocument(captured.projectId,{title});
      if(current!==captured)return;
      materialize(await captured.workspace.read(captured.projectId),id);
      captured.pending=(await captured.workspace.status(captured.projectId)).pending;
      loadPasteCopySettings();renderChapters();loadEditor();remember();renderStorageControls();void sync().catch(()=>{});
    }finally{if(editor&&current===captured&&activeEditorDocument()?.id===oldId)editor.contentEditable=editable;}
  }
  function transformAllDocuments(transform){
    const captured=current;
    const task=navigation.then(async()=>{
      if(!captured||current!==captured)return {count:0,changed:false};
      const editor=document.getElementById('editor'),id=activeEditorDocument()?.id,editable=editor?.contentEditable,recovery=isChapterEditDraftActive();
      if(editor)editor.contentEditable='false';
      try{
        await prepareLeave();if(current!==captured)throw new Error('Project changed.');
        const result=await captured.workspace.transformDocuments(captured.projectId,transform);
        await repaint(captured,id,{activateRecovery:recovery,expectedDocumentId:id});
        void sync().catch(()=>{});return result;
      }finally{if(editor&&current===captured&&activeEditorDocument()?.id===id)editor.contentEditable=editable;}
    });
    navigation=task.catch(()=>{});return task;
  }
  function mergeDrafts(ids,options={}){
    const captured=current;
    const task=navigation.then(async()=>{
      if(!captured||current!==captured)throw new Error('Project बदल गया है।');
      const editor=document.getElementById('editor'),oldId=activeEditorDocument()?.id,editable=editor?.contentEditable;
      if(editor)editor.contentEditable='false';
      try{
        await prepareLeave();if(current!==captured)throw new Error('Project बदल गया है।');
        const id=await captured.workspace.mergeDrafts(captured.projectId,ids,options);
        selectedDraftIndexes.clear();selectedChapterIndexes.clear();
        await repaint(captured,id);void sync().catch(()=>{});return id;
      }finally{if(editor&&current===captured&&activeEditorDocument()?.id===oldId)editor.contentEditable=editable;}
    });
    navigation=task.catch(()=>{});return task;
  }
  function navigate(kind,index){
    const captured=current;
    const task=navigation.then(async()=>{
      if(!captured || current!==captured)return;
      const list=kind==='draft'?chapterDrafts:chapters;
      if(!Number.isInteger(index)||index<0||index>=list.length)return;
      const editor=document.getElementById('editor'),oldId=activeEditorDocument()?.id,editable=editor?.contentEditable;
      if(editor)editor.contentEditable='false';
      try{
        await save();if(current!==captured)return;
        const targetId=list[index].id;
        if(!await repaint(captured,targetId,{expectedDocumentId:oldId}))return;
        clearTimeout(autoSaveTimer);stopTimedAutoSave();
        selectedDraftIndexes.clear();selectedChapterIndexes.clear();
      }finally{if(editor&&current===captured&&activeEditorDocument()?.id===oldId)editor.contentEditable=editable;}
    });
    navigation=task.catch(()=>{});return task;
  }
  async function readDocumentText(id,projectId){
    const captured=current;
    if(!captured||captured.projectId!==projectId)throw new Error('Project changed during scan.');
    const paragraphs=await captured.workspace.readDocumentForScan(projectId,id);
    if(current!==captured)throw new Error('Project changed during scan.');
    return paragraphs.length?root.LmParagraphModel.toText(paragraphs):'';
  }
  const allowed=new Set(['pickExternalWorkspaceProject','showMyFolderLibrary','openChapterDetailsPanel','closeChapterDetailsPanel','moveChapterToDraft','openChapterRecentToDraftPanel','convertRecentChaptersToDraftFromPanel','adjustChapterToDraftCount','deletePartIfEmpty','deletePartKeepingChapters','applyEditorAutoScrollPanelSettingsToAllDocuments','toggleEditorAutoScrollClickReposition',
    'findTag','toggleToolDock','toggleDockSelect','toggleDockSelectFromTrigger','selectDockOption','toggleFontTools',
    'openWordEditingCollectSettings','openWordEditingTemporaryNames','adjustWordEditingCollectMinimum','openCategoryManagerPanel',
    'nextMatch','prevMatch','toggleReplacePanel','replaceOne','replaceAll','doSmartCopy','runAdvancedGlobalStyleApply',
    'toggleEditorAutoScroll','toggleEditorAutoScrollMode','toggleEditorAutoScrollEmptyOnly','setReviewMargin','openTextImportPanel','openPortableNamingImportPicker','exportPortableNamingData','closePortableNamingTransferPanel','updatePortableNamingImportDecision','applyPortableNamingImport','openPortableNamingDescriptionPreview','closePortableNamingDescriptionPreview','applyPortableNamingBulkDecision','selectPortableNamingSection','deepScanAllNamingEntries','switchSidePanel','toggleCategoryInputPanel','setCategoryInputPanel','addNamingCategory','toggleNamingCategory','openNamingEntryPanel','closeNamingEntryPanel','saveNamingEntry','addNamingSimilarName','removeNamingSimilarName','showNameDetail','openNameDetailEditPanel','closeNameDetailPanel','openNameDeleteReminder','closeNameDeleteReminder','deleteActiveNamingEntry','openFactComposer','closeFactComposer','addFact','toggleFactPin','openFactDetailPanel','closeFactDetailPanel','openFactDetailEditPanel','openFactDeleteReminder','closeFactDeleteReminder','deleteFact','clearFactSearchFilter','showMoreFacts','showLessFacts','toggleNamingColorLegendPanel','toggleNamingSearchMode','showAllNamingCategories','toggleNamingSortPanel','closeNamingSortPanel','setNamingSortOption','toggleCategorySortPanel','closeCategorySortPanel','setCategorySortOption','hideExistingNamesForCategory','showExistingNamesForCategory','showAllNamesForCategory',
    'selectLocalProjectFolder','allowSelectedWorkspaceFolder','openDraftActionsPanel','openSidebarDraftPromoteModePanel','promoteActiveDraftToChapter','confirmDraftPromoteDestination','openDraftMergePanel','confirmDraftMerge','closeDraftActionsPanel','beginChapterTitleEdit','cancelChapterTitleEdit','commitChapterTitleEdit','unlockChapterEditing','useChapterEditRecovery','discardChapterEditRecovery','closeChapterEditRecoveryPanel','handleChapterEditRecoveryBackdrop','toggleEditorQuickSettingPin','stepAdvancedNumberInput','openAdvancedEditorSettings','closeAdvancedEditorSettings','selectAdvancedEditorTopSection','selectAdvancedEditorSettingsCategory','openDatabaseConnectionPanel',
    'switchDraft','switchChap','handleDraftItemClick','handleChapterItemClick','togglePartExpansion','openPartDetailsPanel','closePartDetailsPanel','beginPartDetailsTitleEdit','beginPartDetailsSummaryEdit','savePartDetailsPanel','addPart','toggleRawChapterExpansion','toggleChapterListOverflowPanel','beginStoryInfoEdit','saveStoryInfo','openStoryInfoModal','closeStoryInfoModal','openStoryDetailsFromSummaryMenu','openProjectDetailsFromSummary','addDraft','addChapter','manualSave','toggleDark','toggleThemePanel','selectThemeMode','toggleMoreThemeOptions',
    'toggleWordEditingQuickPanel','toggleWordEditingKeepSetting','openWordEditingEditorControls','openAdvancedWordEditing','toggleFocus','exitFocus','toggleEditorSettings','toggleEditorSettingsPanel','closeEditorSettingsPanel','openFind','closeFind','toggleFind','findNext','findPrev','copyChapterTitleInReviewMode']);
  document.addEventListener('click',event=>{
    if(!current || event.target.closest('[data-database-ui],#advancedEditorSettingsModal,#textImportModal,#advancedDraftPromoteModal'))return;
    const target=event.target.closest('[onclick]');if(!target)return;
    if(target.id==='aiBtn'||target.closest('#ai-panel')){event.preventDefault();event.stopImmediatePropagation();return;}
    const calls=[...(target.getAttribute('onclick')||'').matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map(match=>match[1]);
    if(calls.some(name=>!allowed.has(name)&&!['stopPropagation','preventDefault'].includes(name))){event.preventDefault();event.stopImmediatePropagation();showMiniReminder('यह tool Database mode में अभी उपलब्ध नहीं है। आपका draft text सुरक्षित है।');}
  },true);
  document.addEventListener('beforeinput',event=>{if(current && String(event.inputType).startsWith('format'))event.preventDefault();},true);
  document.addEventListener('keydown',event=>{
    if(!current || event.isComposing || event.getModifierState?.('AltGraph') || event.target.closest?.('[data-database-ui]'))return;
    const editor=document.getElementById('editor');
    const inside=editor?.contains(event.target);
    const unsupportedModifier=(event.ctrlKey||event.metaKey)&&!['s','f','c','v','x','a','z','y'].includes(event.key.toLowerCase());
    const sidebarDelete=!inside && !['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName)&&['Delete','Backspace'].includes(event.key);
    if(unsupportedModifier||sidebarDelete){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  for(const type of ['dragstart','drop','dblclick'])document.addEventListener(type,event=>{
    if(!current || event.target.closest?.('[data-database-ui]') || document.getElementById('editor')?.contains(event.target))return;
    if(type==='drop'&&(event.target.closest?.('#workspaceFolderDropTarget,#homeWorkspaceFolderDropTarget')||root.textImportHasExternalDropPayload?.(event)))return;
    event.preventDefault();event.stopImmediatePropagation();
  },true);
  root.LmDatabaseEditor=Object.freeze({active,open,restore,prepareNavigation,readDocumentText,projectIdentity:()=>current?.projectId||null,save,manualSave,sync,refreshProject,importTextDocuments,addDraft,navigate,transformAllDocuments,mergeDrafts,toggleRecovery,useRecovery,discardRecovery,promoteCurrent,promoteDraft,saveProjectInfo,savePart,deletePart,moveChaptersToDraft,addPart,commitTitle,resolveConflict,exportRecovery,persistNaming,persistAdvancedSettings,persistFacts,persistDictionary,retryMetadata,prepareLeave,stageMetadata,namingSummary:()=>current?.namingSummary||null,dictionaryPayload:()=>current?.dictionaryData||null,metadataBusy:()=>Boolean(current?.metadataInFlight),metadataUnsaved:()=>Boolean(current?.metadataInFlight||current?.metadataFailures?.size||root.lmAdvancedWordEditing?.hasPendingSave()),metadataFlush:()=>current?.metadataQueue||Promise.resolve(),leave,label,remember,
    current:()=>current?{profileId:current.profile.id,projectId:current.projectId,pending:current.pending}:null});
})(window);
