'use strict';

(function initializeDatabasePanel(root) {
  let dialog=null;
  let folderSession=null;
  let folderTimer=null;
  const folderSessions=new Map();
  const rateLimitMessage='Server की request सीमा पूरी हो गई है। एक मिनट बाद फिर कोशिश करें।';
  const folderKey=profile=>'lekhak-linked-folder:'+JSON.stringify([profile.instanceId,profile.userId]);
  function stopFolderSync(){
    clearInterval(folderTimer);
    folderTimer=null;
    folderSession=null;
    folderSessions.clear();
  }
  async function runFolderSync(session, options){
    if(session.task){
      if(!options)return session.task;
      await session.task.catch(()=>{});
      if(!folderSessions.has(session.id))throw new Error('Folder connection बदल गया।');
    }
    session.task=(async()=>{
      try{
        session.result=await session.engine.sync({ ...options, onProgress:message=>session.progress?.(message) });
        session.error='';
        return session.result;
      }catch(error){
        if(error.status===429)session.retryAt=Date.now()+60000;
        session.error=error.status===429?rateLimitMessage:error.message;
        throw error;
      }
      finally{session.task=null;session.render?.();}
    })();
    return session.task;
  }
  const style=document.createElement('style');
  style.textContent='[data-database-disabled]{opacity:.45!important;cursor:not-allowed!important}';
  document.head.append(style);
  style.textContent+='body[data-database-editor] #ai-panel,body[data-database-editor] #aiBtn{display:none!important}';
  function element(tag,text,attributes={}){
    const node=document.createElement(tag);if(text)node.textContent=text;
    for(const [key,value] of Object.entries(attributes))node.setAttribute(key,value);
    return node;
  }
  function createAppPanel(label){
    const previous=document.activeElement;
    const panel=element('section','',{role:'region','aria-label':label,tabindex:'-1'});
    panel.classList.add('lm-app-panel');
    panel.open=true;
    panel.close=()=>{
      if(!panel.open)return;
      panel.open=false;
      panel.remove();
      queueMicrotask(()=>panel.dispatchEvent(new Event('close')));
      if(previous?.isConnected)previous.focus({preventScroll:true});
    };
    panel.addEventListener('keydown',event=>{
      if(event.key!=='Escape')return;
      event.preventDefault();
      event.stopPropagation();
      if(panel.dispatchEvent(new Event('cancel',{cancelable:true})))panel.close();
    });
    return panel;
  }
  root.LmAppPanel=Object.freeze({create:createAppPanel});
  let homeConnection=null;
  let homeSynced=false;
  function updateHomeStorage(){
    if(!isHomePage())return;
    const library=document.getElementById('storyLibraryBtn');
    if(library)library.hidden=!(workspaceDirectoryHandle||homeConnection);
    const active=Boolean(workspaceDirectoryHandle||homeConnection);
    const profile=document.getElementById('homeProfileButton');
    if(profile){
      profile.textContent=active?(homeConnection?.profile.name?.[0]||'G').toUpperCase():'Login';
      profile.classList.toggle('is-profile',active);
      profile.setAttribute('aria-label',active?'Open profile':'Login');
    }
    const folder=document.getElementById('projectBtn');
    if(folder){
      folder.hidden=!active;
      const label=homeConnection?(homeSynced?'Change synced folder':'Link local folder'):'Open workspace folder';
      folder.title=label;folder.setAttribute('aria-label',label);
    }
    const tabs=document.getElementById('homeRecentStorageTabs');
    if(tabs)tabs.hidden=!homeSynced;
  }
  async function clearHomeFolder(){
    workspaceDirectoryHandle=null;
    clearActiveStoryState();
    await deleteStoredDirectoryHandle(WORKSPACE_HANDLE_KEY);
    await deleteStoredDirectoryHandle(PROJECT_HANDLE_KEY);
    localStorage.removeItem(WORKSPACE_FOLDER_KEY);
    localStorage.removeItem(PROJECT_MODE_KEY);
    updateHomeStorage();
  }
  async function disconnectHome(){
    setHomeMenuStatus();
    const active=homeConnection;
    const running=[...folderSessions.values()].map(session=>session.task).filter(Boolean);
    stopFolderSync();
    await Promise.allSettled(running);
    if(active?.role)await active.adapter.request('/logout',{method:'POST'}).catch(()=>{});
    if(active)root.LmDatabaseProfiles.disconnect(active.profile.id);
    homeConnection=null;
    homeSynced=false;
    await clearHomeFolder();
    closeStoryLibraryPanel();
    closeHomeRecentProjectsPanel();
    closeStoryInfoModal();
  }

  async function homeProjects(){
    if(!homeConnection)return [];
    const rows=[];
    let after;
    do {
      const page=await homeConnection.adapter.listProjects(after);
      rows.push(...page.projects);
      after=page.projects.length===50?page.projects.at(-1).id:null;
    }while(after);
    return rows;
  }
  async function openHomeProject(id,type){
    if(!homeConnection)throw new Error('पहले Database connection खोलें।');
    const store=await root.LmWorkingStore.open();
    try{
      const workspace=root.LmRemoteWorkspace.create({connection:homeConnection,store});
      if(type==='news')await workspace.openProject(id,{refresh:true,lazy:true});
      else await root.LmDatabaseEditor.prepareNavigation(workspace,homeConnection.profile.id,id);
      location.href=(type==='news'?'news-article-editor.html':'story-novel-project-editor.html')+'?'+
        new URLSearchParams({databaseProfile:homeConnection.profile.id,databaseProject:id});
    }finally{store.close();}
  }
  function open(prefill){
    if(dialog?.open){dialog.focus();return;}
    dialog=createAppPanel('Storage & Database');
    dialog.dataset.databaseUi='true';
    dialog.append(element('h2','Storage & Database'));
    dialog.append(element('p','API URL और session key से जुड़ें। कनेक्शन इसी browser tab में Home और editor के बीच चलता रहेगा। Disconnect दबाने से इस tab की key हटेगी।'));
    const select=element('select','',{'aria-label':'Connection profile'});
    select.append(element('option','नया connection',{value:''}));
    for(const profile of root.LmDatabaseProfiles.list())select.append(element('option',profile.name,{value:profile.id}));
    if(!prefill?.authenticated)dialog.append(select);
    const input=(label,type='text')=>{
      const wrapper=element('label',label);wrapper.style.cssText='display:block;margin:12px 0';
      const field=element('input','',{type,'aria-label':label,autocomplete:'off'});field.style.cssText='display:block;width:100%;box-sizing:border-box;padding:8px;margin-top:4px';wrapper.append(field);dialog.append(wrapper);return field;
    };
    const name=input('Connection name'),url=input('API server URL'),token=input('Session token','password');
    if(prefill?.baseUrl){name.value=prefill.name||'';url.value=prefill.baseUrl;}
    const status=element('p','',{role:'status','aria-live':'polite'});dialog.append(status);
    const projects=element('div','',{'aria-label':'Database projects'});
    const history=element('div','',{'aria-label':'Saved connections'});
    const folderPanel=element('div','',{'aria-label':'Folder sync'});
    dialog.append(history,folderPanel);
    let connection=null,store=null,workspace=null,busy=false;
    let folderRenderKey='',pendingFolderHandle=null;
    async function action(operation){
      if(busy)return;busy=true;status.textContent='काम चल रहा है…';
      const controls=[...dialog.querySelectorAll('button,input,select')].map(node=>[node,node.disabled]);controls.forEach(([node])=>{node.disabled=true;});
      try{await operation();}catch(error){status.textContent=error.status===429?rateLimitMessage:error.message;}finally{busy=false;controls.forEach(([node,disabled])=>{node.disabled=disabled;});}
    }
    const button=(text,operation)=>{
      const node=element('button',text,{type:'button'});node.style.cssText='margin:4px;padding:7px 12px';
      node.addEventListener('click',()=>void action(operation));dialog.append(node);return node;
    };
    function clearSelection(){
      connection=null;workspace=null;store?.close();store=null;projects.replaceChildren();
    }
    function renderHistory(){
      const profiles=root.LmDatabaseProfiles.list();
      const selected=select.value;
      select.replaceChildren(element('option','नया connection',{value:''}));
      history.replaceChildren();
      for(const profile of profiles){
        select.append(element('option',profile.name,{value:profile.id}));
        const row=element('div');
        row.append(element('span',profile.name+' '));
        const remove=element('button','×',{type:'button','aria-label':'Remove '+profile.name,title:'Remove '+profile.name});
        remove.onclick=()=>void action(()=>removeHistory([profile.id]));
        row.append(remove);history.append(row);
      }
      select.value=profiles.some(profile=>profile.id===selected)?selected:'';
      if(profiles.length){
        const clear=element('button','सभी connections हटाएँ',{type:'button'});
        clear.onclick=()=>{if(root.confirm('सभी saved connections हटाएँ?'))void action(()=>removeHistory(profiles.map(profile=>profile.id)));};
        history.append(clear);
      }
    }
    async function removeHistory(ids){
      await root.LmDatabaseProfiles.remove(ids);
      if(ids.includes(folderSession?.connection.profile.id))stopFolderSync();
      if(ids.includes(homeConnection?.profile.id)){homeConnection=null;homeSynced=false;updateHomeStorage();}
      if(ids.includes(select.value)){
        clearSelection();select.value='';name.value='';url.value='';token.value='';
      }
      renderHistory();renderFolder();
      status.textContent='Connection history अपडेट हुई।';
    }
    function renderFolder(){
      if(!dialog?.isConnected)return;
      const session=folderSession;
      const result=session?.result;
      const key=JSON.stringify([session?.handle.name,session?.error,result?.pushed,result?.pulled,result?.deferred,
        result?.conflicts.map(item=>[item.id,item.reason,item.localHash,item.remoteHash])]);
      if(key===folderRenderKey)return;
      folderRenderKey=key;
      folderPanel.replaceChildren();
      if(!session)return;
      folderPanel.append(element('p',session.handle.name+' · '+(session.error ||
        (result ? result.pushed+' भेजे, '+result.pulled+' मिले, '+result.conflicts.length+' टकराव'+
          (result.deferred ? ' · '+result.deferred+' बदलाव local editor बंद होने पर उतरेंगे' : '') : 'Sync तैयार है'))));
      for(const conflict of result?.conflicts || []){
        const details=element('details');
        details.append(element('summary',conflict.title+' · '+conflict.reason));
        if(conflict.canChoose){
          for(const [side,label,content] of [['folder','Folder वाला रखें',conflict.localText],['server','Database वाला रखें',conflict.remoteText]]){
            const preview=element('pre',content);
            preview.style.cssText='white-space:pre-wrap;max-height:12rem;overflow:auto';
            const choose=element('button',label,{type:'button'});
            choose.onclick=()=>void action(async()=>{
              await runFolderSync(session,{resolutions:{[conflict.id]:{
                side,localHash:conflict.localHash,remoteHash:conflict.remoteHash
              }}});
              status.textContent='Folder sync जाँचा गया।';
            });
            details.append(preview,choose);
          }
        }
        folderPanel.append(details);
      }
    }
    function startFolderSync(handle,id=folderKey(connection.profile)){
      const session={id,handle,connection,engine:root.LmFolderSync.create(handle,connection),render:renderFolder,
        progress:message=>{if(busy && status.isConnected)status.textContent=message;}};
      folderSessions.set(id,session);
      folderSession=session;
      if(!folderTimer)folderTimer=setInterval(async()=>{
        if([...folderSessions.values()].some(item=>item.task))return;
        for(const item of folderSessions.values()){
          if(Date.now()>=(item.retryAt||0))await runFolderSync(item).catch(()=>{});
        }
      },15000);
      return session;
    }
    select.addEventListener('change',()=>{
      const profile=root.LmDatabaseProfiles.list().find(item=>item.id===select.value);
      name.value=profile?.name||'';url.value=profile?.baseUrl||'';token.value='';
      clearSelection();
    });
    async function openProject(projectId,type){
      if(document.getElementById('editor') && hasActiveStory())await saveCurrentProject();
      if(type!=='news')await root.LmNewsDatabaseEditor?.leave();
      if(type==='news'){
        if(root.LmNewsDatabaseEditor){
          await root.LmNewsDatabaseEditor.open(connection,projectId);
          dialog.close();
        }else{
          await workspace.openProject(projectId,{refresh:true,lazy:true});
          root.location.href='news-article-editor.html?'+new URLSearchParams({databaseProfile:connection.profile.id,databaseProject:projectId});
        }
        return;
      }
      if(document.getElementById('editor')){
        await root.LmDatabaseEditor.open(connection,projectId);
        dialog.close();
      }else{
        await root.LmDatabaseEditor.prepareNavigation(workspace,connection.profile.id,projectId);
        const query=new URLSearchParams({databaseProfile:connection.profile.id,databaseProject:projectId});
        root.location.href='story-novel-project-editor.html?'+query;
      }
    }
    async function list(after=''){
      if(isHomePage()){status.textContent='Connected. Recent Projects → Cloud खोलें।';return;}
      const result=await connection.adapter.listProjects(after);
      if(!after){
        projects.replaceChildren();
        for(const [type,title] of [['novel','Novels'],['story','Stories'],['news','News Articles']]){
          const section=element('section','',{'data-project-type':type});
          section.append(element('h3',title));
          projects.append(section);
        }
      }
      for(const project of result.projects){
        const row=element('div');row.style.cssText='padding:8px 0;border-bottom:1px solid var(--border,#ddd)';
        row.append(element('span',project.title+' '));
        const choose=element('button','Open project',{type:'button'});
        choose.disabled=project.type==='news' && !connection.capabilities?.features?.includes('owner-workspace');
        choose.addEventListener('click',()=>void action(()=>openProject(project.id,project.type)));
        row.append(choose);
        projects.querySelector('[data-project-type="'+project.type+'"]')?.append(row);
      }
      if(result.projects.length===50){const more=element('button','और projects',{type:'button'});more.onclick=()=>{more.remove();void action(()=>list(result.projects.at(-1).id));};projects.append(more);}
      status.textContent=result.projects.length?'Project चुनें।':'इस connection में कोई project नहीं है।';
    }
    button('Connect / Test',async()=>{
      connection=await root.LmDatabaseProfiles.connect({id:select.value||undefined,name:name.value,baseUrl:url.value,token:token.value});
      const localBefore=isHomePage()?workspaceDirectoryHandle:null;
      if(isHomePage()){
        homeConnection=connection;
        homeSynced=false;
      }
      if(folderSession && folderSession.connection!==connection){stopFolderSync();renderFolder();}
      token.value='';store?.close();store=await root.LmWorkingStore.open();workspace=root.LmRemoteWorkspace.create({connection,store});
      renderHistory();select.value=connection.profile.id;await list();
      if(isHomePage() && root.LmFolderSync){
        const key=folderKey(connection.profile);
        const ids=JSON.parse(localStorage.getItem(key+':projects')||'[]');
        const savedRoot=await readStoredDirectoryHandle(key+':workspace');
        const handles=[];
        for(const id of ids.length?ids:[key]){
          const saved=await readStoredDirectoryHandle(id);
          if(saved)handles.push({id,saved});
        }
        if(savedRoot||handles.length){
          await clearHomeFolder();
          pendingLinkedWorkspace=savedRoot;
          pendingLinkedFolders=handles;
          await resumeLinkedFolders(false);
        }else if(localBefore){
          if(root.confirm('खुले Local workspace को Database से sync करें? Cancel से फ़ोल्डर बंद होगा।')){
            pendingWorkspace=localBefore;
            await chooseProjectFolder(localBefore);
          }else await clearHomeFolder();
        }else{
          offerFolderSync.hidden=false;
        }
        updateHomeStorage();

      }
    });
    let pendingWorkspace=null,pendingLinkedWorkspace=null,pendingLinkedFolders=[];
    let offerFolderSync,allowLinkedFolders,acceptPickedFolder;
    async function resumeLinkedFolders(request){
      const canAccess=async handle=>verifyProjectPermission(handle,request);
      const handles=[];
      if(pendingLinkedWorkspace&&!await canAccess(pendingLinkedWorkspace)){
        allowLinkedFolders.hidden=false;return;
      }
      for(const item of pendingLinkedFolders){
        if(!await canAccess(item.saved)){allowLinkedFolders.hidden=false;return;}
        handles.push(item);
      }
      if(pendingLinkedWorkspace)await loadWorkspaceFolder(pendingLinkedWorkspace);
      for(const {id,saved} of handles)startFolderSync(saved,id);
      homeSynced=true;
      allowLinkedFolders.hidden=true;
      updateHomeStorage();
    }
    if(isHomePage() && root.LmFolderSync){
      offerFolderSync=element('p','इस connection में Local workspace sync करना है? नीचे फ़ोल्डर चुनें या Cloud में काम जारी रखें।');
      offerFolderSync.hidden=true;
      dialog.append(offerFolderSync);
      allowLinkedFolders=button('Synced फ़ोल्डर की अनुमति दें',async()=>resumeLinkedFolders(true));
      allowLinkedFolders.hidden=true;
      const projectChoices=element('div','',{class:'folder-upload-choices','aria-label':'Projects in selected folder'});
      folderPanel.after(projectChoices);
      async function chooseProjectFolder(handle){
        projectChoices.replaceChildren();
        try{
          await handle.getFileHandle('Chapters_info.json');
        }catch(error){
          if(error.name!=='NotFoundError')throw error;
          const candidates=[];
          for await(const child of handle.values()){
            if(child.kind!=='directory')continue;
            try{
              await child.getFileHandle('Chapters_info.json');
              candidates.push({category:'Local',child});
            }catch(error){if(error.name!=='NotFoundError')throw error;}
          }
          for(const category of ['Novels','Stories','News Articles']){
            let directory;
            try{directory=await handle.getDirectoryHandle(category);}
            catch(error){if(error.name==='NotFoundError')continue;throw error;}
            for await(const child of directory.values()){
              if(child.kind!=='directory')continue;
              try{await child.getFileHandle('Chapters_info.json');}
              catch(error){if(error.name==='NotFoundError')continue;throw error;}
              candidates.push({category,child});
            }
          }
          pendingWorkspace=handle;
          if(!candidates.length){
            await activateSyncedWorkspace(handle);
            status.textContent='खाली workspace जुड़ गया। New Project में storage चुनें।';
            return;
          }
          const selectedConnection=connection;
          const choices=candidates.map(({category,child})=>{
            const label=element('label');
            label.style.display='block';
            const checkbox=element('input','',{type:'checkbox'});
            label.append(checkbox,document.createTextNode(' '+category+' / '+child.name));
            projectChoices.append(label);
            return {checkbox,child};
          });
          const selectAll=element('button','सभी चुनें',{type:'button'});
          const upload=element('button','चुने हुए प्रोजेक्ट अपलोड करें',{type:'button'});
          const count=element('p','',{role:'status'});
          function updateCount(){
            const selected=choices.filter(({checkbox})=>checkbox.checked).length;
            count.textContent=selected+' अपलोड के लिए · '+(choices.length-selected)+' इस बार लोकल में';
            upload.disabled=!selected;
          }
          selectAll.onclick=()=>{
            const checked=choices.some(({checkbox})=>!checkbox.checked);
            choices.forEach(({checkbox})=>{checkbox.checked=checked;});
            updateCount();
          };
          choices.forEach(({checkbox})=>checkbox.addEventListener('change',updateCount));
          upload.onclick=()=>void action(async()=>{
            if(connection!==selectedConnection)throw new Error('कनेक्शन बदल गया है। फ़ोल्डर दोबारा चुनें।');
            const selected=choices.filter(({checkbox})=>checkbox.checked);
            if(!root.confirm(selected.length+' प्रोजेक्ट इस खाते में लिंक और अपलोड करें?'))return;
            const failures=[];
            let completed=0;
            for(const {child} of selected){
              status.textContent=(completed+failures.length+1)+' / '+selected.length+' · '+child.name;
              try{
                const result=await linkFolder(child,{confirmed:true,refresh:false});
                if(result.conflicts.length)failures.push(child.name+' — sync conflict');
                else completed++;
              }catch(error){failures.push(child.name+' — '+error.message);if(error.status===429)break;}
            }
            await list();
            status.textContent=completed+' / '+selected.length+' प्रोजेक्ट जुड़े। '+failures.join(' · ');
          });
          const actions=element('div','',{class:'folder-upload-actions'});
          upload.classList.add('lm-app-panel-primary');
          actions.append(selectAll,upload);
          projectChoices.append(count,actions);
          updateCount();
          status.textContent='इस workspace से Database में जोड़ने वाला प्रोजैक्ट चुनें।';
          return;
        }
        await linkFolder(handle);
      }
      async function activateSyncedWorkspace(handle){
        await loadWorkspaceFolder(handle);
        await saveStoredDirectoryHandle(handle,folderKey(connection.profile)+':workspace');
        if(connection.capabilities?.schemaVersion>=6)
          await connection.adapter.request('/workspace/folder',{method:'POST',body:{path:handle.name}});
        homeSynced=true;
        updateHomeStorage();
      }
      async function linkFolder(handle,{confirmed=false,refresh=true}={}){
        const engine=root.LmFolderSync.create(handle,connection);
        const existing=await engine.readLink();
        const preview=await engine.preview();
        const names=preview.documents.map(item=>item.title+' — '+item.path);
        if(!confirmed&&!root.confirm((existing?'इस folder का sync चालू करें?':'Database में इस folder की पहली copy बनाएँ?')+
          '\n\n'+connection.profile.name+' · '+(preview.manifest.title||handle.name)+' · '+names.length+' documents\n'+names.slice(0,20).join('\n')+
          (names.length>20?'\n…':'')))return;
        const key=folderKey(connection.profile);
        if(prefill?.folder && pendingWorkspace && workspaceDirectoryHandle && workspaceDirectoryHandle!==pendingWorkspace){
          const running=[...folderSessions.values()].map(session=>session.task).filter(Boolean);
          stopFolderSync();
          await Promise.allSettled(running);
          localStorage.removeItem(key+':projects');
        }
        const initial=startFolderSync(handle);
        const result=await runFolderSync(initial,{linkNew:true});
        const id=key+':'+result.projectId;
        await saveStoredDirectoryHandle(handle,id);
        const ids=JSON.parse(localStorage.getItem(key+':projects')||'[]');
        localStorage.setItem(key+':projects',JSON.stringify([...new Set([...ids,id])]));
        folderSessions.delete(initial.id);
        initial.id=id;
        folderSessions.set(id,initial);
        if(pendingWorkspace&&(!homeSynced||workspaceDirectoryHandle!==pendingWorkspace))await activateSyncedWorkspace(pendingWorkspace);
        else{homeSynced=true;updateHomeStorage();}
        if(refresh)await list();
        status.textContent=result.conflicts.length?'टकरावों की समीक्षा करें।':'Folder जुड़ गया। Home खुला रहने पर sync अपने आप चलेगा।';
        return result;
      }
      const allowFolder=button('Folder editing की अनुमति दें',async()=>{
        const handle=pendingFolderHandle;
        if(!connection||!handle)throw new Error('पहले project folder चुनें।');
        if(await handle.requestPermission({mode:'readwrite'})!=='granted')throw new Error('Folder editing की अनुमति नहीं मिली।');
        pendingFolderHandle=null;allowFolder.hidden=true;
        await chooseProjectFolder(handle);
      });
      allowFolder.hidden=true;
      acceptPickedFolder=async handle=>{
        if(!connection)throw new Error('पहले Database connection खोलें।');
        if(homeSynced&&!prefill?.folder)throw new Error('Use the Home folder button to change the synced workspace.');
        if(!root.showDirectoryPicker)throw new Error('Folder sync के लिए PC पर Chrome या Edge खोलें।');
        pendingFolderHandle=null;allowFolder.hidden=true;
        if(!(await verifyProjectPermission(handle,false))){
          pendingFolderHandle=handle;allowFolder.hidden=false;
          status.textContent='आगे बढ़ने के लिए Folder editing की अनुमति दें।';return;
        }
        await chooseProjectFolder(handle);
      };
      button('Project folder को Database से जोड़ें',async()=>acceptPickedFolder(await root.showDirectoryPicker({mode:'readwrite'})));
      button('Folder sync अभी चलाएँ',async()=>{
        if(!folderSession)throw new Error('पहले project folder जोड़ें।');
        for(const session of folderSessions.values())await runFolderSync(session);
        status.textContent='Folder sync जाँचा गया।';
      });
    }
    if(!isHomePage()){
    const projectTitle=input('नए project का नाम');projectTitle.maxLength=300;
    const projectType=element('select','',{'aria-label':'Project type'});
    for(const [value,title] of [['novel','Novel'],['story','Story'],['news','News Article']])projectType.append(element('option',title,{value}));
    dialog.append(projectType);
    button('Create database project',async()=>{
      if(!workspace)throw new Error('पहले connection खोलें।');
      const title=projectTitle.value.trim();if(!title)throw new Error('Project का नाम दें।');
      const intentKey='lm_database_create_intent_v1';
      let intent;try{intent=JSON.parse(root.localStorage.getItem(intentKey)||'null');}catch{}
      const type=projectType.value;
      if(type==='news'&&!connection.capabilities?.features?.includes('owner-workspace'))throw new Error('News workspace के लिए server schema upgrade चाहिए।');
      if(!intent || intent.profileId!==connection.profile.id || intent.title!==title || intent.type!==type){intent={id:root.LmParagraphModel.newId(),profileId:connection.profile.id,title,type};root.localStorage.setItem(intentKey,JSON.stringify(intent));}
      let state;
      try{state=await workspace.createProject({id:intent.id,title,type});}
      catch(error){if(error.status!==409)throw error;state=await workspace.openProject(intent.id,{refresh:true,lazy:true});if(state.manifest.project.title!==title || state.manifest.project.type!==type)throw new Error('Project identity/title mismatch.');}
      if(type!=='news'&&!Object.keys(state.documents).length)await workspace.createDocument(state.projectId,{title:'Draft 1'});
      await workspace.flush(state.projectId);root.localStorage.removeItem(intentKey);
      await openProject(state.projectId,type);
    });
    }
    button('Cached project खोलें',async()=>{
      let remembered;try{remembered=JSON.parse(root.localStorage.getItem('lm_database_editor_selection_v1')||'null');}catch{}
      const profile=root.LmDatabaseProfiles.list().find(item=>item.id===(select.value||remembered?.profileId));
      if(!remembered || !profile || remembered.profileId!==profile.id)throw new Error('इस profile का cached project नहीं मिला।');
      const cache=await root.LmWorkingStore.open();
      try{if(!await cache.readRemoteProject(JSON.stringify([profile.instanceId,profile.userId,profile.id]),remembered.projectId))throw new Error('Cached project उपलब्ध नहीं है।');}finally{cache.close();}
      root.location.href='story-novel-project-editor.html?'+new URLSearchParams({databaseProfile:profile.id,databaseProject:remembered.projectId});
    });
    button('Local folder चुनें',async()=>{dialog.close();await selectLocalProjectFolder();});
    button('Disconnect',async()=>{if(isHomePage()){await disconnectHome();clearSelection();renderFolder();status.textContent='Disconnected';return;}const profileId=connection?.profile.id||select.value;if(profileId)root.LmDatabaseProfiles.disconnect(profileId);if(homeConnection?.profile.id===profileId)homeConnection=null;if(folderSession?.connection.profile.id===profileId)stopFolderSync();clearSelection();renderFolder();status.textContent='Disconnected; pending edits device पर सुरक्षित हैं।';});
    button('Close',async()=>dialog.close());
    dialog.append(projects);
    renderHistory();
    const preferred=root.LmDatabaseEditor?.current()?.profileId||root.LmNewsDatabaseEditor?.current()?.profileId;
    if(preferred){select.value=preferred;select.dispatchEvent(new Event('change'));}
    dialog.addEventListener('close',()=>{token.value='';store?.close();dialog.remove();dialog=null;},{once:true});
    dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
    document.body.append(dialog);dialog.focus();
    if(folderSession){folderSession.render=renderFolder;renderFolder();}
    if(prefill?.authenticated && homeConnection && isHomePage()){
      connection=homeConnection;
      for(const field of [name,url,token])field.parentElement.hidden=true;
      select.hidden=true;history.hidden=true;
      for(const node of dialog.querySelectorAll('button'))if(node.textContent==='Connect / Test')node.hidden=true;
      const heading=dialog.querySelector('h2');
      heading.textContent='Choose projects to sync';
      dialog.setAttribute('aria-label','Choose projects to sync');
      heading.nextElementSibling.hidden=true;
      if(prefill.folder){
        dialog.classList.add('folder-upload-panel');
        for(const node of dialog.querySelectorAll('button')){
          if(['Project folder को Database से जोड़ें','Cached project खोलें','Local folder चुनें','Disconnect','Folder sync अभी चलाएँ'].includes(node.textContent))node.hidden=true;
        }
        void action(()=>acceptPickedFolder(prefill.folder));
      }
    }
  }
  function settingsHtml(index,active){return '<section class="advanced-developer-settings-section" data-advanced-developer-section="'+index+'" '+(active?'':'hidden')+'><h4>Cloud administration</h4><button type="button" onclick="openCloudAdmin()">View users and projects</button></section>';}
  async function restoreCloudFolder(connection,container){
    if(!isHomePage())return false;
    if(homeSynced){container?.remove();return true;}
    const key=folderKey(connection.profile);
    let handle=await readStoredDirectoryHandle(key+':workspace');
    const ids=JSON.parse(localStorage.getItem(key+':projects')||'[]');
    if(!handle)handle=await readStoredDirectoryHandle(ids[0]||key);
    const hint=connection.capabilities?.schemaVersion>=6
      ?(await connection.adapter.request('/workspace/folder')).path:null;
    if(!handle&&!hint)return;
    async function activate(selected){
      await loadWorkspaceFolder(selected);
      await saveStoredDirectoryHandle(selected,key+':workspace');
      if(!hint&&connection.capabilities?.schemaVersion>=6)
        await connection.adapter.request('/workspace/folder',{method:'POST',body:{path:selected.name}});
      for(const id of ids.length?ids:[key]){
        const saved=await readStoredDirectoryHandle(id);
        if(saved&&await verifyProjectPermission(saved,false))
          folderSessions.set(id,{id,handle:saved,connection,engine:root.LmFolderSync.create(saved,connection)});
      }
      folderSession=[...folderSessions.values()].at(-1)||null;
      if(!folderTimer)folderTimer=setInterval(async()=>{
        if([...folderSessions.values()].some(item=>item.task))return;
        for(const item of folderSessions.values()){
          if(Date.now()>=(item.retryAt||0))await runFolderSync(item).catch(()=>{});
        }
      },15000);
      homeSynced=true;
      updateHomeStorage();
      setHomeMenuStatus(`Workspace ready: ${selected.name || 'Selected folder'}`);
      container?.remove();
      return true;
    }
    async function containsProjects(selected){
      if(!selected)return false;
      try{
        await selected.getFileHandle('Chapters_info.json');
        return true;
      }catch(error){if(error.name!=='NotFoundError')throw error;}
      for await(const entry of selected.values()){
        if(entry.kind!=='directory')continue;
        try{await entry.getFileHandle('Chapters_info.json');return true;}
        catch(error){if(error.name!=='NotFoundError')throw error;}
        if(!['Novels','Stories','News Articles'].includes(entry.name))continue;
        for await(const child of entry.values()){
          if(child.kind!=='directory')continue;
          try{await child.getFileHandle('Chapters_info.json');return true;}
          catch(error){if(error.name!=='NotFoundError')throw error;}
        }
      }
      return false;
    }
    async function findProjects(selected){
      try{return await containsProjects(selected);}
      catch(error){if(error.name==='NotFoundError')return false;throw error;}
    }
    if(handle&&await verifyProjectPermission(handle,false)){
      if(await findProjects(handle))return activate(handle);
      handle=null;
    }
    if(!container)return;
    const note=element('p',hint||handle?.name||'');
    const access=element('button',handle?'Allow synced folder access':'Select synced folder',{type:'button'});
    access.onclick=async()=>{
      access.disabled=true;
      try{
        const selected=handle||await root.showDirectoryPicker({mode:'readwrite'});
        if(!await verifyProjectPermission(selected,true))throw new Error('Folder access was not granted.');
        if(await findProjects(selected))await activate(selected);
        else showRecovery();
      }catch(error){
        if(error.name==='NotFoundError')showRecovery();
        else{note.textContent=error.message;access.disabled=false;}
      }
    };
    function showRecovery(){
      note.textContent='Local project not found. Download cloud projects to a new local workspace?';
      const download=element('button','Download to Local Folder',{type:'button'});
      const cloud=element('button','Continue Cloud Only',{type:'button'});
      download.onclick=async()=>{
        download.disabled=true;cloud.disabled=true;
        try{
          const target=await root.showDirectoryPicker({mode:'readwrite'});
          if(!await verifyProjectPermission(target,true))throw new Error('Folder access was not granted.');
          const projects=await homeProjects();
          if(!projects.length)throw new Error('No cloud projects are available.');
          const replacement=[];
          for(const project of projects){
            note.textContent='Downloading '+project.title+'…';
            const category=await target.getDirectoryHandle({novel:'Novels',story:'Stories',news:'News Articles'}[project.type],{create:true});
            const name=project.id;
            try{await category.getDirectoryHandle(name);throw new Error('A destination already exists for '+project.title);}
            catch(error){if(error.name!=='NotFoundError')throw error;}
            const child=await category.getDirectoryHandle(name,{create:true});
            await root.LmFolderSync.create(child,connection).restoreFromCloud(project.id);
            const id=key+':'+project.id;
            replacement.push({id,child});
          }
          for(const {id,child} of replacement)await saveStoredDirectoryHandle(child,id);
          ids.splice(0,ids.length,...replacement.map(item=>item.id));
          localStorage.setItem(key+':projects',JSON.stringify(ids));
          await connection.adapter.request('/workspace/folder',{method:'POST',body:{path:target.name}});
          await activate(target);
        }catch(error){note.textContent=error.message;download.disabled=false;cloud.disabled=false;}
      };
      cloud.onclick=async()=>{
        download.disabled=true;cloud.disabled=true;
        try{
          await connection.adapter.request('/workspace/folder',{method:'POST',body:{path:null}});
          stopFolderSync();
          for(const id of [...ids,key,key+':workspace'])await deleteStoredDirectoryHandle(id);
          localStorage.removeItem(key+':projects');
          await clearHomeFolder();
          container.remove();
        }catch(error){note.textContent=error.message;download.disabled=false;cloud.disabled=false;}
      };
      container.replaceChildren(note,download,cloud);
    }
    container.append(note,access);
    if(!handle)showRecovery();
  }
  async function openHomeFolder(){
    if(!homeConnection)return selectLocalProjectFolder();
    try{
      if(!root.showDirectoryPicker)throw new Error('Choose a local folder in Chrome or Edge on a computer.');
      const folder=await root.showDirectoryPicker({mode:'readwrite'});
      if(dialog?.open){
        dialog.addEventListener('close',()=>open({authenticated:true,folder}),{once:true});
        dialog.close();
      }else open({authenticated:true,folder});
    }catch(error){if(error.name!=='AbortError')showMiniReminder(error.message);}
  }
  let homeProfilePanel;
  function openHomeProfile(){
    if(!homeConnection&&!workspaceDirectoryHandle)return openCloudLogin();
    if(homeProfilePanel?.open){homeProfilePanel.close();return;}
    const button=document.getElementById('homeProfileButton');
    const panel=createAppPanel('Profile');
    homeProfilePanel=panel;
    panel.classList.add('home-profile-panel');
    const name=homeConnection?.profile.name||'Guest';
    const header=element('header','',{class:'home-profile-header'});
    header.append(element('span',name[0].toUpperCase(),{class:'home-profile-avatar','aria-hidden':'true'}));
    const identity=element('div');
    identity.append(element('strong',name),element('small',homeConnection?.role==='admin'?'Admin':homeConnection?'Writer':'Guest'));
    header.append(identity);
    panel.append(header);
    function detail(symbol,value){
      const row=element('p','',{class:'home-profile-detail'});
      row.append(element('span',symbol,{'aria-hidden':'true'}),element('span',value));
      panel.append(row);
      return row.lastElementChild;
    }
    if(workspaceDirectoryHandle)detail('▰',workspaceDirectoryHandle.name);
    if(homeConnection){
      const count=detail('☁','Loading cloud projects…');
      void homeProjects().then(projects=>{count.textContent=projects.length+' cloud project'+(projects.length===1?'':'s');},
        ()=>{count.textContent='Cloud project count unavailable';});
    }
    const logout=element('button','Log out',{type:'button'});
    logout.onclick=async()=>{
      logout.disabled=true;
      try{await disconnectHome();panel.close();}
      catch(error){showMiniReminder(error.message);logout.disabled=false;}
    };
    panel.append(logout);
    const dismiss=event=>{if(!panel.contains(event.target)&&!button.contains(event.target))panel.close();};
    document.addEventListener('pointerdown',dismiss);
    panel.addEventListener('close',()=>{
      document.removeEventListener('pointerdown',dismiss);
      button.setAttribute('aria-expanded','false');
    },{once:true});
    button.setAttribute('aria-expanded','true');
    document.body.append(panel);
    panel.focus();
  }
  async function openCloudLogin(){
    if(dialog?.open){dialog.querySelector('#cloudLoginUser')?.focus({preventScroll:true});return;}
    const panel=createAppPanel('Cloud Login');
    panel.dataset.databaseUi='cloud-login';
    dialog=panel;
    const host=document.getElementById('homeLoginSection');
    panel.classList.add('cloud-login');
    panel.setAttribute('aria-labelledby','cloudLoginTitle');
    panel.innerHTML=`
      <button class="cloud-login-close" type="button" data-close aria-label="Close sign-in">×</button>
      <header>
        <span class="cloud-login-brand">Lekhak Manch</span>
        <h2 id="cloudLoginTitle">Sign in</h2>
        <p data-intro>Open your cloud projects and pick up where you left off.</p>
      </header>
      <form novalidate>
        <input id="cloudLoginUser" placeholder="User ID" aria-label="User ID" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" aria-describedby="cloudLoginUserError" required>
        <p id="cloudLoginUserError" class="cloud-login-field-error" aria-live="polite"></p>
        <div class="cloud-login-password">
          <input id="cloudLoginPassword" placeholder="Password" aria-label="Password" name="password" type="password" autocomplete="current-password" aria-describedby="cloudLoginPasswordError" required>
          <button type="button" data-password aria-controls="cloudLoginPassword" aria-pressed="false">Show</button>
        </div>
        <p id="cloudLoginPasswordError" class="cloud-login-field-error" aria-live="polite"></p>
        <button class="cloud-login-submit" type="submit">Sign in</button>
        <button class="cloud-login-switch" type="button" data-register>Register</button>
        <div class="cloud-login-local" data-local><button type="button" data-guest>Open local workspace</button><p>Write locally without an account.</p></div>
      </form>
      <p class="cloud-login-status" role="status"></p>
      <div class="cloud-login-projects" data-projects></div>`;
    const form=panel.querySelector('form'),status=panel.querySelector('[role="status"]');
    const projects=panel.querySelector('[data-projects]');
    const passwordToggle=panel.querySelector('[data-password]');
    passwordToggle.innerHTML=root.lmIcon('eye');
    passwordToggle.setAttribute('aria-label','Show password');
    let registering=false;
    const switchMode=panel.querySelector('[data-register]');
    const guest=panel.querySelector('[data-guest]');
    guest.closest('[data-local]').hidden=!isHomePage();
    const fields=form.elements;
    function fieldError(field,message=''){
      fields[field].setAttribute('aria-invalid',String(Boolean(message)));
      document.getElementById(fields[field].getAttribute('aria-describedby')).textContent=message;
    }
    for(const field of ['username','password'])fields[field].addEventListener('input',()=>fieldError(field));
    guest.onclick=async()=>{
      try{
        await selectLocalProjectFolder();
        if(workspaceDirectoryHandle){updateHomeStorage();panel.close();}
      }catch(error){status.textContent=error.message;}
    };
    switchMode.onclick=()=>{
      registering=!registering;
      fieldError('username');fieldError('password');
      panel.querySelector('h2').textContent=registering?'Create an account':'Sign in';
      panel.querySelector('[data-intro]').textContent=registering?'Choose a User ID and a password of at least 12 characters.':'Open your cloud projects and pick up where you left off.';
      form.elements.password.autocomplete=registering?'new-password':'current-password';
      form.elements.password.minLength=registering?12:0;
      form.elements.password.value='';
      form.querySelector('[type=submit]').textContent=registering?'Create account':'Sign in';
      switchMode.textContent=registering?'Back to sign in':'Register';
      status.textContent='';
    };
    passwordToggle.onclick=()=>{
      const input=form.elements.password;
      const visible=input.type==='password';
      input.type=visible?'text':'password';
      passwordToggle.setAttribute('aria-label',visible?'Hide password':'Show password');
      passwordToggle.setAttribute('aria-pressed',String(visible));
    };
    panel.querySelector('[data-close]').onclick=()=>panel.close();
    if(host)panel.querySelector('[data-close]').remove();
    panel.addEventListener('close',()=>{form.reset();panel.remove();dialog=null;},{once:true});
    if(host){
      const intro=element('div','',{class:'home-login-intro'});
      intro.innerHTML=`<h2>Pick up where you left off.</h2>
        <p>A writing studio for stories, novels, and news.</p>
        <figure class="home-login-excerpt">
          <figcaption>Chapter 1 · The Return</figcaption>
          <blockquote>When she returned to the city, the station still smelled of cardamom tea.</blockquote>
        </figure>`;
      panel.classList.remove('lm-app-panel');
      panel.classList.add('home-login-card');
      const back=element('button','',{type:'button',class:'home-login-back','aria-label':'Back to overview'});
      back.innerHTML=root.lmIcon('chevronLeft');
      back.onclick=()=>panel.close();
      host.replaceChildren(back,panel,intro);
      const overview=document.getElementById('homeOverviewPanel');
      const wasHidden=overview?.hidden;
      if(overview)overview.hidden=true;
      host.hidden=false;
      document.getElementById('homeProfileButton')?.setAttribute('aria-expanded','true');
      panel.addEventListener('close',()=>{
        host.hidden=true;
        if(overview)overview.hidden=wasHidden;
        host.replaceChildren();
        document.getElementById('homeProfileButton')?.setAttribute('aria-expanded','false');
      },{once:true});
    }else document.body.append(panel);
    panel.querySelector('#cloudLoginUser').focus();
    form.onsubmit=async event=>{
      event.preventDefault();
      const submit=form.querySelector('[type=submit]');
      if(submit.disabled)return;
      const user=fields.username.value.trim();
      const pass=fields.password.value;
      const userError=!user?'Enter your User ID.':registering&&!/^[a-z0-9][a-z0-9._-]{2,31}$/i.test(user)?'Use 3–32 letters, numbers, dots, hyphens or underscores.':'';
      const passwordError=!pass?'Enter your password.':registering&&pass.length<12?'Use at least 12 characters.':'';
      fieldError('username',userError);fieldError('password',passwordError);
      status.textContent='';
      if(userError||passwordError){fields[userError?'username':'password'].focus();return;}
      submit.disabled=true;
      submit.textContent=registering?'Creating account…':'Signing in…';
      switchMode.disabled=true;
      status.textContent='';
      status.removeAttribute('data-error');
      try{
        const {username,password}=form.elements;
        const response=await fetch(registering?'/api/v1/register':'/api/v1/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:username.value.trim(),password:password.value})});
        const result=await response.json();
        if(!panel.open)return;
        if(!response.ok){
          const message=result.error?.message||'Sign in failed.';
          const field=response.status===409?'username':response.status===401?'password':null;
          if(field){fieldError(field,message);fields[field].focus();return;}
          throw new Error(message);
        }
        const sessionAdapter=root.LmRemoteAdapter.create({baseUrl:location.origin,token:result.token});
        const identity=await sessionAdapter.connect();
        const saved=root.LmDatabaseProfiles.list().find(profile=>profile.baseUrl===location.origin&&profile.userId===identity.account.userId&&profile.instanceId===identity.capabilities.instanceId);
        const previous=await root.LmDatabaseProfiles.currentSession();
        if(homeConnection && homeConnection.profile.userId!==identity.account.userId)await disconnectHome();
        if(previous){
          await previous.adapter.request('/logout',{method:'POST'}).catch(()=>{});
          root.LmDatabaseProfiles.disconnect(previous.profile.id);
        }
        homeConnection=await root.LmDatabaseProfiles.connect({id:saved?.id,name:username.value.trim(),baseUrl:location.origin,token:result.token});
        password.value='';
        if(isHomePage()&&workspaceDirectoryHandle&&!homeSynced)await clearHomeFolder();
        updateHomeStorage();
        panel.querySelector('h2').textContent='Your projects';
        panel.querySelector('[data-intro]').textContent='Choose a project to open.';
        form.hidden=true;
        status.textContent='';
        projects.replaceChildren();
        if(isHomePage()){
          const link=element('button','Link Local Folder',{type:'button'});
          link.onclick=openHomeFolder;
          projects.append(link);
        }
        if(isHomePage()){
          const permission=element('div');
          projects.prepend(permission);
          if(await restoreCloudFolder(homeConnection,permission) && !registering){
            panel.close();
            return;
          }
        }
        const available=await homeProjects();
        if(!available.length)status.textContent='No cloud projects yet.';
        for(const project of available){
          const button=element('button',project.title,{type:'button'});
          button.onclick=()=>void openHomeProject(project.id,project.type).catch(error=>{status.textContent=error.message;});
          projects.append(button);
        }
      }catch(error){form.hidden=false;form.elements.password.value='';status.dataset.error='true';status.textContent=error.message;}
      finally{submit.disabled=false;switchMode.disabled=false;submit.textContent=registering?'Create account':'Sign in';}
    };
  }
  async function openCloudAdmin(){
    const connection=await root.LmDatabaseProfiles.currentSession();
    if(connection?.role!=='admin')return;
    const data=await connection.adapter.request('/admin/users');
    const panel=createAppPanel('Cloud administration');
    panel.dataset.databaseUi='admin';
    panel.classList.add('cloud-admin-panel');
    panel.append(element('h2','Cloud users and projects'));
    for(const account of data.accounts){
      const section=element('details');
      section.append(element('summary',account.username+' · '+account.role));
      for(const project of data.projects.filter(item=>item.userId===account.userId)){
        const row=element('details');
        row.append(element('summary',project.title+' · '+project.type));
        row.addEventListener('toggle',async()=>{
          if(!row.open||row.querySelector('pre'))return;
          const output=element('pre','Loading…');
          output.style.whiteSpace='pre-wrap';
          row.append(output);
          try{
            const data=await connection.adapter.request('/admin/projects/'+encodeURIComponent(project.id));
            output.textContent=JSON.stringify(data,null,2);
          }catch(error){output.textContent=error.message;}
        });
        section.append(row);
      }
      panel.append(section);
    }
    const close=element('button','Close',{type:'button'});
    close.onclick=()=>panel.close();
    panel.append(close);
    panel.addEventListener('close',()=>panel.remove(),{once:true});
    document.body.append(panel);
    panel.focus();
  }
  root.openCloudLogin=openCloudLogin;
  root.openCloudAdmin=()=>openCloudAdmin().catch(error=>showMiniReminder(error.message));
  root.openDatabaseConnectionPanel=openCloudLogin;
  root.LmDatabasePanel=Object.freeze({open,settingsHtml,homeProjects,openHomeProject,
    homeConnection:()=>homeConnection,homeSynced:()=>homeSynced,updateHomeStorage,disconnectHome,openHomeProfile,openHomeFolder,
    async restoreHomeCloud(){
      homeConnection=await root.LmDatabaseProfiles.currentSession();
      if(homeConnection)await restoreCloudFolder(homeConnection);
      updateHomeStorage();
    },
    async withFolderSyncPaused(projectId, action){
      const id=homeConnection?folderKey(homeConnection.profile)+':'+projectId:null;
      const session=folderSessions.get(id);
      if(session)session.retryAt=Infinity;
      try {
        await session?.task;
        const result=await action();
        if(id){
          folderSessions.delete(id);
          if(folderSession?.id===id)folderSession=[...folderSessions.values()].at(-1)||null;
          const key=folderKey(homeConnection.profile)+':projects';
          localStorage.setItem(key,JSON.stringify(JSON.parse(localStorage.getItem(key)||'[]').filter(item=>item!==id)));
        }
        return result;
      }finally{if(session)session.retryAt=0;}
    },
    async deleteHomeProject(project){
      if(!homeConnection)throw new Error('पहले Database connection खोलें।');
      const store=await root.LmWorkingStore.open();
      try {
        if(await store.hasPending([homeConnection.scopeId]))throw new Error('पहले pending Database saves sync करें।');
        const key=folderKey(homeConnection.profile);
        const id=key+':'+project.id;
        await folderSessions.get(id)?.task;
        await homeConnection.adapter.deleteProject(project.id,project.revision);
        folderSessions.delete(id);
        if(folderSession?.id===id)folderSession=[...folderSessions.values()].at(-1)||null;
        const saved=JSON.parse(localStorage.getItem(key+':projects')||'[]');
        localStorage.setItem(key+':projects',JSON.stringify(saved.filter(item=>item!==id)));
      }finally{store.close();}
    },
    async createHomeProject(details){
      if(!homeConnection)throw new Error('पहले Database connection खोलें।');
      const store=await root.LmWorkingStore.open();
      try{
        const workspace=root.LmRemoteWorkspace.create({connection:homeConnection,store});
        const result=await workspace.createProject(details);
        if(details.type!=='news')await workspace.createDocument(result.projectId,{title:'Draft 1'});
        await workspace.flush(result.projectId);
        await openHomeProject(result.projectId,details.type);
      }finally{store.close();}
    },
    async linkNewHomeProject(handle){
      if(!homeConnection)throw new Error('पहले Database connection खोलें।');
      const result=await root.LmFolderSync.create(handle,homeConnection).sync({linkNew:true});
      const key=folderKey(homeConnection.profile);
      const id=key+':'+result.projectId;
      await saveStoredDirectoryHandle(handle,id);
      const ids=JSON.parse(localStorage.getItem(key+':projects')||'[]');
      localStorage.setItem(key+':projects',JSON.stringify([...new Set([...ids,id])]));
      if(result.conflicts.length)throw new Error('Sync conflicts need review.');
      return result;
    }
  });
})(window);
