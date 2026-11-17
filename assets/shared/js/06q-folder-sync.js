'use strict';

(function initializeFolderSync(root) {
  const journalPath = '.lekhak-sync/folder-link.json';
  const manifestPath = 'Chapters_info.json';
  const draftsPath = 'Story_Drafts.json';
  const supported = kind => kind === 'chapter' || kind === 'draft';
  const id = () => root.LmParagraphModel.newId();
  let releaseEditorLock, editorLockReady;

  function holdLocalEditor() {
    if (!root.navigator?.locks || !root.document?.querySelector('#editor,#newsBodyEditor')) return;
    if (!editorLockReady) {
      editorLockReady = new Promise((resolve, reject) => {
        root.navigator.locks.request('lekhak-folder-sync', { mode: 'shared' }, () =>
          new Promise(release => { releaseEditorLock = release; resolve(); })).catch(reject);
      });
    }
    return editorLockReady;
  }

  function releaseLocalEditor() {
    releaseEditorLock?.();
    releaseEditorLock = null;
    editorLockReady = null;
  }

  async function optionalJson(folder, path, fallback) {
    try { return await folder.readJson(path); }
    catch (error) { if (error.name === 'NotFoundError') return fallback; throw error; }
  }

  async function digest(value) {
    const bytes = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function inventory(folder, { preview = false, onProgress = () => {} } = {}) {
    const manifest = await folder.readJson(manifestPath);
    if (manifest.type === 'news') return { manifest, documents: [] };
    if (!['novel', 'story'].includes(manifest.type || 'novel')) throw new Error('Story या Novel का project folder चुनें।');
    const drafts = await optionalJson(folder, draftsPath, { drafts: [] });
    const groups = [
      ...(manifest.parts || []).map((part, index) => ({ kind: 'chapter', rows: part.chapters || [], file: manifestPath, part: index })),
      { kind: 'chapter', rows: manifest.chapters || [], file: manifestPath, part: null },
      { kind: 'draft', rows: Array.isArray(drafts) ? drafts : drafts.drafts || [], file: draftsPath, part: null }
    ];
    const documents = [];
    const paths = new Set();
    const total = groups.reduce((count, group) => count + group.rows.length, 0);
    for (const group of groups) {
      for (const [index, row] of group.rows.entries()) {
        const fallback = group.kind === 'draft' ? draftFilePath(index) : chapterFilePath(documents.length);
        const path = root.LmLocalFolderAdapter.pathParts(row.contentPath || row.content_path || fallback).join('/');
        const pathKey = path.toLowerCase();
        if (!/\.txt$/i.test(path) || path.startsWith('.lekhak-sync/') || paths.has(pathKey)) throw new Error('अमान्य या दोहराया गया TXT path: ' + path);
        paths.add(pathKey);
        const title = String(row.title || (group.kind === 'draft' ? 'Draft ' : 'Chapter ') + (index + 1)).trim();
        if (!title || title.length > 300) throw new Error('Document title 1–300 characters होना चाहिए: ' + path);
        const document = { kind: group.kind, path, title, legacyId: row.id == null ? null : String(row.id),
          file: group.file, part: group.part, index };
        if (!preview) {
          onProgress('फ़ाइल पढ़ रहे हैं ' + (documents.length + 1) + '/' + total + ' · ' + path);
          try { document.text = await folder.readText(path); }
          catch (error) { throw new Error('फ़ाइल नहीं पढ़ी जा सकी (' + path + '): ' + error.message, { cause: error }); }
          document.hash = await digest([group.kind, title, document.text]);
        }
        documents.push(document);
      }
    }
    return { manifest, documents };
  }

  function newsDatasets(state) {
    const articles=state.articles||[];
    return [
      {kind:'news-article',entries:articles,removeMissing:true},
      {kind:'project-settings',entries:[{id:'news-state',wordTarget:state.wordTarget||800,
        currentArticleId:state.currentArticleId||'',articleIds:articles.map(article=>article.id)}]}
    ];
  }

  function sanitizeNewsArticle(article) {
    function safeHtml(value) {
      const parsed=new DOMParser().parseFromString(value||'','text/html');
      parsed.body.querySelectorAll('script,style,iframe,object,embed,svg,math,form,template').forEach(node=>node.remove());
      const tags=new Set(['P','DIV','BR','B','STRONG','I','EM','U','S','STRIKE','SPAN','FONT','A','OL','UL','LI','BLOCKQUOTE','H1','H2','H3','H4','HR','SUB','SUP']);
      const styles=['color','background-color','font-size','font-family','font-weight','font-style','text-decoration','text-align'];
      for(const node of parsed.body.querySelectorAll('*')){
        if(!tags.has(node.tagName)){node.replaceWith(...node.childNodes);continue;}
        const preserved=styles.map(name=>[name,node.style.getPropertyValue(name)]).filter(([,value])=>value&&!/url\s*\(/i.test(value));
        const href=node.getAttribute('href');
        const fontAttrs=node.tagName==='FONT'?['face','size','color'].map(name=>[name,node.getAttribute(name)]):[];
        for(const attribute of [...node.attributes])node.removeAttribute(attribute.name);
        for(const [name,value] of preserved)node.style.setProperty(name,value);
        for(const [name,value] of fontAttrs)if(value)node.setAttribute(name,value);
        if(node.tagName==='A'&&href&&/^(https?:|mailto:)/i.test(href))node.setAttribute('href',href);
      }
      return parsed.body.innerHTML;
    }
    const normalized={...article};
    normalized.bodyHTML=safeHtml(normalized.bodyHTML);
    normalized.sections=(normalized.sections||[]).map(section=>({...section,bodyHTML:safeHtml(section.bodyHTML)}));
    return normalized;
  }
  function newsFromRows(rows) {
    const state=rows.find(row=>!row.deleted&&row.kind==='project-settings'&&row.payload.id==='news-state')?.payload||{};
    const articles=rows.filter(row=>!row.deleted&&row.kind==='news-article').map(row=>sanitizeNewsArticle(row.payload));
    const order=new Map((state.articleIds||[]).map((articleId,index)=>[articleId,index]));
    articles.sort((a,b)=>(order.get(a.id)??Infinity)-(order.get(b.id)??Infinity));
    return {version:1,projectType:'newsdesk',wordTarget:state.wordTarget||800,currentArticleId:state.currentArticleId||'',articles};
  }

  function create(handle, connection) {
    const folder = root.LmLocalFolderAdapter.create(handle);
    const { adapter, profile } = connection;
    const account = [profile.instanceId, profile.userId];
    const legacyServer=connection.capabilities?.schemaVersion<3;

    async function readLink() {
      const link = await optionalJson(folder, journalPath, null);
      if (link && (link.version !== 1 || JSON.stringify(link.account) !== JSON.stringify(account))) {
        throw new Error('यह folder किसी दूसरे database account या server से जुड़ा है।');
      }
      return link;
    }

    function uploadOperations(documentId, local, remote, body, order, partId) {
      const previous = body?.paragraphs || [];
      const reconciled = root.LmEditorWorkingCopy.reconcile(previous, local.text);
      const paragraphs = root.LmRemoteWorkspace.withOrder(reconciled.paragraphs, previous);
      const old = new Map(previous.map(item => [item.id, item]));
      const active = new Set(paragraphs.map(item => item.id));
      const upserts = paragraphs.filter(item => {
        const before = old.get(item.id);
        return !before || before.text !== item.text || before.separator !== item.separator || before.orderKey !== item.orderKey;
      });
      const operations = remote ? [] : [{ type: 'document.create', id: documentId, kind: local.kind, title: local.title,
        ...(partId ? { partId } : {}) }];
      operations.push({
        type: 'document.patch', id: documentId, baseRevision: body?.revision ?? 0,
        title: local.title, kind: local.kind, upserts, deletedIds: previous.filter(item => !active.has(item.id)).map(item => item.id),
        ...(remote ? {} : { settings: { documentOrder: order } })
      });
      return operations;
    }

    async function initializeParts(snapshot, link, remoteManifest, persist) {
      const titles = (snapshot.manifest.parts || []).map((part, index) => String(part.title || 'Part ' + (index + 1)));
      if (!titles.length) return;
      if (!link.parts) {
        link.parts = titles.map((title,index) => ({ id: id(), title, synopsis:snapshot.manifest.parts[index].synopsis||'' }));
        await persist();
      }
      if (JSON.stringify(link.parts.map(part => part.title)) !== JSON.stringify(titles)) {
        throw new Error('पहली copy के दौरान Parts की सूची बदल गई।');
      }
      const existing = new Set((remoteManifest.parts || []).map(part => part.id));
      const operations = link.parts.flatMap((part, index) => existing.has(part.id) ? [] : [
        { type: 'part.put', id: part.id, title: part.title, synopsis:part.synopsis||'', orderKey: (index + 1) * 1024, baseRevision: 0 }
      ]);
      if (operations.length) await adapter.apply(link.projectId, { protocolVersion: 1, operationId: id(), operations });
    }

    async function syncPartDetails(snapshot, link, remoteManifest, resolutions, conflicts, persist, pushOnly) {
      const mapped=link.parts||[];
      const remote=remoteManifest.parts.filter(part=>!part.deleted);
      const payload=await folder.readJson(manifestPath);
      const local=payload.parts||[];
      const oldTitles=new Map(mapped.map((part,index)=>[part.title,index]));
      if(local.length!==mapped.length||remote.length!==mapped.length||
          remote.some((part,index)=>part.id!==mapped[index].id)||
          local.some((part,index)=>oldTitles.has(part.title)&&oldTitles.get(part.title)!==index)){
        conflicts.push({id:'parts-structure',title:'Parts',reason:'Parts की संख्या या क्रम बदला। संरचना की समीक्षा करें।'});
        return {changedServer:false,deferred:0};
      }
      const updated=structuredClone(mapped);
      const operations=[];
      const folderUpdates=new Map();
      let deferred=0;
      const details=part=>({title:part.title,synopsis:part.synopsis||''});
      for(let index=0;index<mapped.length;index++){
        const original=mapped[index],localInfo=details(local[index]),serverInfo=details(remote[index]);
        const [baseline,localHash,remoteHash]=await Promise.all([digest(details(original)),digest(localInfo),digest(serverInfo)]);
        if(localHash===remoteHash){Object.assign(updated[index],localInfo);continue;}
        const resolution=resolutions['part-'+original.id];
        const choice=resolution?.localHash===localHash&&resolution?.remoteHash===remoteHash?resolution.side:null;
        if(choice==='folder'||baseline===remoteHash){
          operations.push({type:'part.put',id:original.id,baseRevision:remote[index].revision,
            orderKey:Number(remote[index].order_key),...localInfo});
          if(choice==='folder')await folder.writeJson('.lekhak-sync/backups/part-'+original.id+'-'+remoteHash+'.json',serverInfo);
          Object.assign(updated[index],localInfo);
        }else if(choice==='server'||baseline===localHash){
          if(pushOnly){deferred++;continue;}
          Object.assign(updated[index],serverInfo);
          folderUpdates.set(index,serverInfo);
        }else{
          conflicts.push({id:'part-'+original.id,title:original.title,reason:'दोनों तरफ़ Part details बदली।',canChoose:true,
            localHash,remoteHash,localText:JSON.stringify(localInfo,null,2),remoteText:JSON.stringify(serverInfo,null,2)});
        }
      }
      if(operations.length)await adapter.apply(link.projectId,{protocolVersion:1,operationId:id(),operations});
      if(folderUpdates.size){
        const before=JSON.stringify(payload);
        await folder.writeJson('.lekhak-sync/backups/parts-'+await digest(payload)+'.json',payload);
        if(JSON.stringify(await folder.readJson(manifestPath))!==before)throw new Error('Parts sync के दौरान बदले।');
        payload.parts=local.map((part,index)=>({...part,...folderUpdates.get(index)}));
        await folder.writeJson(manifestPath,payload);
        snapshot.manifest.parts=payload.parts;
      }
      if(JSON.stringify(updated)!==JSON.stringify(mapped)){link.parts=updated;await persist();}
      return {changedServer:operations.length>0,deferred};
    }

    async function download(local, remote, body) {
      if (local.kind !== remote.kind) throw new Error('Draft/Chapter प्रकार दोनों जगह अलग हैं।');
      const payload = await folder.readJson(local.file);
      const rows = local.part !== null ? payload.parts?.[local.part]?.chapters :
        local.file === draftsPath ? (Array.isArray(payload) ? payload : payload.drafts) : payload.chapters;
      const row = rows?.[local.index];
      const rowPath = row && (row.contentPath || row.content_path || local.path);
      if (!rowPath || root.LmLocalFolderAdapter.pathParts(rowPath).join('/') !== local.path ||
          (row.title && String(row.title).trim() !== local.title) || await folder.readText(local.path) !== local.text) {
        throw new Error('Folder sync के दौरान फ़ाइल बदली। अगला sync फिर कोशिश करेगा।');
      }
      const text = root.LmParagraphModel.toText(body.paragraphs);
      if (text !== local.text) {
        await folder.writeText('.lekhak-sync/backups/' + local.hash + '.txt', local.text, { verify: true });
        if (await folder.readText(local.path) !== local.text) throw new Error('Folder file backup के दौरान बदली।');
        await folder.writeText(local.path, text, { verify: true });
      }
      if (local.title !== remote.title) {
        const latest = await folder.readJson(local.file);
        if (JSON.stringify(latest) !== JSON.stringify(payload)) throw new Error('Document सूची sync के दौरान बदली।');
        row.title = remote.title;
        await folder.writeJson(local.file, payload);
      }
    }

    async function addLocal(remote, body, link) {
      const file = remote.kind === 'chapter' ? manifestPath : draftsPath;
      const path = (remote.kind === 'chapter' ? 'Chapters/' : 'Drafts/') + 'Sync-' + remote.id + '.txt';
      const payload = await optionalJson(folder, file, { drafts: [] });
      const linkedPart = remote.part_id && link.parts?.find(part => part.id === remote.part_id);
      const part = linkedPart && payload.parts?.find(item => item.title === linkedPart.title);
      const rows = remote.kind === 'chapter' ? ((part || payload).chapters ||= []) :
        Array.isArray(payload) ? payload : (payload.drafts ||= []);
      const text = root.LmParagraphModel.toText(body.paragraphs);
      try {
        if (await folder.readText(path) !== text) throw new Error('नई server copy के नाम पर दूसरी local file मौजूद है: ' + path);
      } catch (error) {
        if (error.name !== 'NotFoundError') throw error;
        await folder.writeText(path, text, { verify: true });
      }
      const latest = await optionalJson(folder, file, { drafts: [] });
      const expected = structuredClone(payload);
      if (remote.kind === 'chapter') {
        const latestPart = part && latest.parts?.find(item => item.title === linkedPart.title);
        if (part && !latestPart) throw new Error('नई copy जोड़ते समय Part बदला।');
        (latestPart || latest).chapters ||= [];
      }
      if (remote.kind === 'draft' && !Array.isArray(latest) && !latest.drafts) latest.drafts = [];
      if (JSON.stringify(latest) !== JSON.stringify(expected)) throw new Error('नई copy जोड़ते समय document सूची बदली।');
      rows.push({ id: remote.id, title: remote.title, contentPath: path });
      await folder.writeJson(file, payload);
      return path;
    }

    function databaseSource(entry, link) {
      if (!entry.source) return entry;
      const found = Object.entries(link.documents).filter(([, row]) =>
        row.kind === entry.source.documentType &&
        (row.path === entry.source.documentKey || (row.legacyId && row.legacyId === String(entry.source.documentId))));
      if (found.length !== 1) return entry;
      const [documentId] = found[0];
      return { ...entry, source: { ...entry.source, documentId, documentKey: 'database/' + documentId } };
    }

    function folderSource(entry, link) {
      const source = entry.source;
      const document = source && link.documents[source.documentId];
      if (!document) return entry;
      const updated = { ...source, documentKey: document.path };
      if (document.legacyId) updated.documentId = document.legacyId;
      else delete updated.documentId;
      return { ...entry, source: updated };
    }

    function metadataGroup(key, value, link) {
      const setting = (kind, payload) => ({ kind, payload });
      if (key === 'news') return newsDatasets(value).flatMap(dataset=>dataset.entries.map(payload=>setting(dataset.kind,payload)));
      if (key === 'naming') {
        const { entries, categories, ...rest } = normalizeNamingData(value);
        return [...categories.map(item => setting('naming-category', item)),
          ...entries.map(item => setting('naming-entry', databaseSource(item, link))),
          setting('project-settings', { ...rest, id: 'naming-state' })];
      }
      if (key === 'facts') {
        const facts = Array.isArray(value) ? value : value.facts || [];
        const stamped = facts.filter(Boolean).map((fact, index) => {
          const item = typeof fact === 'string' ? { description: fact } : fact;
          return { ...item, id: item.id || 'folder-fact-' + index, createdAt: item.createdAt || item.time || '1970-01-01T00:00:00.000Z' };
        });
        return normalizeStoryFacts(stamped).map(item => setting('fact', item));
      }
      const { rules = [], ...rest } = value;
      return [...rules.map(item => setting('dictionary-rule', item)),
        setting('project-settings', { ...rest, id: 'dictionary-state', ruleIds: rules.map(item => item.id) })];
    }

    function folderMetadata(key, rows, link) {
      if (key === 'news') return newsFromRows(rows);
      const values = kind => rows.filter(row => row.kind === kind).map(row => row.payload);
      if (key === 'facts') return { facts: values('fact') };
      const { id: ignored, ruleIds = [], ...settings } = values('project-settings')[0] || {};
      if (key === 'naming') return { ...settings, schemaVersion: settings.schemaVersion || 2,
        categories: values('naming-category'), entries: values('naming-entry').map(entry => folderSource(entry, link)) };
      const rules = values('dictionary-rule');
      const ids = new Map(rules.map(rule => [rule.id, rule]));
      return { ...settings, version: settings.version || 1, rules: [
        ...ruleIds.filter(ruleId => ids.has(ruleId)).map(ruleId => ids.get(ruleId)),
        ...rules.filter(rule => !ruleIds.includes(rule.id))
      ] };
    }

    const rowKey = row => JSON.stringify([row.kind, String(row.payload.id ?? row.id)]);
    function canonical(value) {
      if (Array.isArray(value)) return value.map(canonical);
      if (!value || typeof value !== 'object') return value;
      return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
    }
    const rowHash = rows => digest(rows.map(row => [rowKey(row), canonical(row.payload)]).sort((a,b) => a[0].localeCompare(b[0])));

    async function syncMetadata(snapshot, link, manifest, resolutions, conflicts, persist, pushOnly) {
      const groups = snapshot.manifest.type==='news' ? [
        {key:'news',file:'NewsDesk_Articles.json',fallback:{articles:[]},kinds:['news-article'],settings:'news-state'}
      ] : [
        { key: 'naming', file: 'Story_Naming.json', fallback: snapshot.manifest.namingData || {}, kinds: ['naming-category','naming-entry'], settings: 'naming-state' },
        { key: 'facts', file: 'Story_Facts.json', fallback: { facts: snapshot.manifest.facts || snapshot.manifest.storyFacts || [] }, kinds: ['fact'] },
        { key: 'dictionary', file: 'Story_Word_Editing.json', fallback: { version: 1, rules: [] }, kinds: ['dictionary-rule'], settings: 'dictionary-state' }
      ];
      link.metadata ||= {};
      let deferred = 0;
      for (const group of groups) {
        const { key, file, fallback, kinds, settings } = group;
        const local = await optionalJson(folder, file, fallback);
        const localRows = metadataGroup(key, local, link);
        const localHash = await digest(canonical(local));
        const serverRows = (manifest.metadata || []).filter(row =>
          kinds.includes(row.kind) || (settings && row.kind === 'project-settings' && row.payload.id === settings));
        const remoteRows = serverRows.filter(row => !row.deleted);
        const remoteHash = await rowHash(remoteRows);
        const previous = link.metadata[key];
        if (previous?.localHash === localHash && previous?.remoteHash === remoteHash) continue;
        const wantedHash = await rowHash(localRows);
        const resolution = resolutions[key];
        const choice = resolution?.localHash === localHash && resolution?.remoteHash === remoteHash ? resolution.side : null;
        if (wantedHash === remoteHash) {
          link.metadata[key] = { localHash, remoteHash };
        } else if (choice === 'folder' || (!previous && !remoteRows.length) || previous?.remoteHash === remoteHash) {
          if (await digest(canonical(await optionalJson(folder, file, fallback))) !== localHash) throw new Error(file + ' sync के दौरान बदली।');
          const found = new Map(serverRows.map(row => [rowKey(row), row]));
          const expected = new Map();
          const operations = [];
          for (const row of localRows) {
            const identity = rowKey(row);
            if (row.payload.id == null || expected.has(identity)) throw new Error('Metadata ID अमान्य है: ' + file);
            expected.set(identity, row);
            const old = found.get(identity);
            if (old && !old.deleted && JSON.stringify(canonical(old.payload)) === JSON.stringify(canonical(row.payload))) continue;
            operations.push({ type: 'metadata.put', id: old?.id || id(), kind: row.kind,
              payload: row.payload, baseRevision: old?.revision || 0 });
          }
          for (const row of remoteRows) if (!expected.has(rowKey(row))) operations.push({
            type: 'metadata.put', id: row.id, kind: row.kind, payload: row.payload, baseRevision: row.revision, deleted: true
          });
          if (choice === 'folder') await folder.writeJson('.lekhak-sync/backups/' + key + '-' + remoteHash + '.json', folderMetadata(key, remoteRows, link));
          if (operations.length) await adapter.apply(link.projectId, { protocolVersion: 1, operationId: id(), operations });
          link.metadata[key] = { localHash, remoteHash: wantedHash };
        } else if (choice === 'server' || previous?.localHash === localHash) {
          if (pushOnly && choice === 'server') throw new Error('Database copy लगाने के लिए local editor बंद करें।');
          if (pushOnly) { deferred++; continue; }
          const replacement = folderMetadata(key, remoteRows, link);
          await folder.writeJson('.lekhak-sync/backups/' + key + '-' + localHash + '.json', local);
          if (await digest(canonical(await optionalJson(folder, file, fallback))) !== localHash) throw new Error(file + ' sync के दौरान बदली।');
          await folder.writeJson(file, replacement);
          link.metadata[key] = { localHash: await digest(canonical(replacement)), remoteHash };
        } else {
          conflicts.push({ id: key, title: file, reason: 'Folder और Database में अलग बदलाव हैं।', canChoose: true,
            localHash, remoteHash, localText: JSON.stringify(local, null, 2),
            remoteText: JSON.stringify(folderMetadata(key, remoteRows, link), null, 2) });
          continue;
        }
        await persist();
      }
      return deferred;
    }

    async function syncProjectInfo(link, remote, resolutions, conflicts, persist, pushOnly) {
      const payload = await folder.readJson(manifestPath);
      const local = {title:String(payload.title||handle.name||'Untitled').trim(),...(legacyServer?{}:{
        author:payload.author||'',synopsis:payload.synopsis||'',language:payload.language==='hi'?'hi':'en'})};
      const server = {title:remote.title,...(legacyServer?{}:{
        author:remote.metadata?.author||'',synopsis:remote.metadata?.synopsis||'',language:remote.language})};
      const baseline=legacyServer?{title:link.projectInfo?.title||link.title||server.title}:
        link.projectInfo||{title:link.title||server.title,author:'',synopsis:'',language:server.language};
      const localHash=await digest(local),remoteHash=await digest(server);
      if(localHash===remoteHash){
        if(await digest(baseline)!==localHash||!link.projectInfo){link.projectInfo=local;await persist();}
        return 0;
      }
      const baselineHash=await digest(baseline);
      const resolution=resolutions['project-info'];
      const choice=resolution?.localHash===localHash&&resolution?.remoteHash===remoteHash?resolution.side:null;
      if(choice==='folder'||baselineHash===remoteHash){
        if(choice==='folder')await folder.writeJson('.lekhak-sync/backups/project-info-'+remoteHash+'.json',server);
        await adapter.apply(link.projectId,{protocolVersion:1,operationId:id(),operations:[
          {type:'project.update',baseRevision:remote.revision,...local}
        ]});
        link.projectInfo=local;
      }else if(choice==='server'||baselineHash===localHash){
        if(pushOnly)return 1;
        await folder.writeJson('.lekhak-sync/backups/project-info-'+localHash+'.json',local);
        if(JSON.stringify(await folder.readJson(manifestPath))!==JSON.stringify(payload))throw new Error('Project सूची sync के दौरान बदली।');
        await folder.writeJson(manifestPath,{...payload,...server});
        link.projectInfo=server;
      }else{
        conflicts.push({id:'project-info',title:'Project Info',reason:'दोनों तरफ़ Project Info बदली।',canChoose:true,
          localHash,remoteHash,localText:JSON.stringify(local,null,2),remoteText:JSON.stringify(server,null,2)});
        return 0;
      }
      await persist();
      return 0;
    }

    async function sync({ linkNew = false, resolutions = {}, onProgress = () => {} } = {}) {
      const run = async (pushOnly) => {
        const snapshot = await inventory(folder, { onProgress });
        if(legacyServer&&snapshot.manifest.type==='news')throw new Error('News sync के लिए Database schema upgrade चाहिए।');
        onProgress('Database से प्रोजैक्ट की स्थिति देख रहे हैं…');
        let link = await readLink();
        if (pushOnly && (!link || link.initializing)) throw new Error('पहली copy बनाने के लिए इस browser का local editor बंद करें।');
        if (!link) {
          if (!linkNew) throw new Error('पहले इस folder को Database से जोड़ें।');
          const title = String(snapshot.manifest.title || handle.name || 'Untitled').trim();
          if (!title || title.length > 300) throw new Error('Project title 1–300 characters होना चाहिए।');
          link = { version: 1, account, projectId: id(), initializing: true, documents: {} };
          await folder.writeJson(journalPath, link);
        }
        let remoteManifest;
        try { remoteManifest = await adapter.manifest(link.projectId); }
        catch (error) {
          if (!link.initializing || ![403, 404].includes(error.status)) throw error;
          await adapter.createProject({ id: link.projectId, title: String(snapshot.manifest.title || handle.name || 'Untitled').trim(),
            type: snapshot.manifest.type || 'novel', language: snapshot.manifest.language === 'hi' ? 'hi' : 'en',
            author:snapshot.manifest.author||'',synopsis:snapshot.manifest.synopsis||'' });
          remoteManifest = await adapter.manifest(link.projectId);
        }
        const remoteById = new Map(remoteManifest.documents.map(item => [item.id, item]));
        const conflicts = [];
        const used = new Set();
        let pushed = 0, pulled = 0, deferred = 0;
        const persist = () => folder.writeJson(journalPath, link);
        let additions = [];
        let additionBytes = 0;
        async function uploadAdditions() {
          if (!additions.length) return;
          await persist();
          for (const { local } of additions) {
            if (await folder.readText(local.path) !== local.text) throw new Error('Upload से पहले local file बदली: ' + local.path);
          }
          onProgress('Database में भेज रहे हैं · इस बार ' + pushed + ' दस्तावेज़ भेजे गए');
          const receipt = await adapter.apply(link.projectId, {
            protocolVersion: 1, operationId: id(), operations: additions.flatMap(item => item.operations)
          });
          for (const { local, documentId } of additions) {
            Object.assign(link.documents[documentId], { baseline: local.hash, remoteRevision: receipt.revision });
          }
          pushed += additions.length;
          await persist();
          additions = [];
          additionBytes = 0;
        }
        let changedParts=false;
        if (link.initializing) await initializeParts(snapshot, link, remoteManifest, persist);
        else if(!legacyServer&&snapshot.manifest.type!=='news'){
          const result=await syncPartDetails(snapshot,link,remoteManifest,resolutions,conflicts,persist,pushOnly);
          changedParts=result.changedServer;
          deferred+=result.deferred;
        }
        for (const [index, local] of snapshot.documents.entries()) {
          onProgress('Database sync ' + (index + 1) + '/' + snapshot.documents.length + ' · ' + local.title);
          const candidates = Object.entries(link.documents).filter(([, entry]) => entry.path === local.path ||
            (local.legacyId && entry.legacyId === local.legacyId && entry.kind === local.kind &&
              snapshot.documents.filter(item => item.legacyId === local.legacyId && item.kind === local.kind).length === 1));
          if (candidates.length > 1 || candidates.some(([key]) => used.has(key))) throw new Error('Folder में document identity दोहराई गई है: ' + local.path);
          const imported = remoteById.get(local.legacyId);
          const importedPath = (local.kind === 'chapter' ? 'Chapters/' : 'Drafts/') + 'Sync-' + local.legacyId + '.txt';
          const documentId = candidates[0]?.[0] || (imported && local.path === importedPath ? imported.id : id());
          used.add(documentId);
          let entry = link.documents[documentId];
          if (!entry) {
            entry = link.documents[documentId] = { path: local.path, legacyId: local.legacyId, kind: local.kind, baseline: null };
          }
          const remote = remoteById.get(documentId);
          if (remote?.deleted || (!remote && entry.baseline)) {
            conflicts.push({ id: documentId, title: local.title, reason: 'Server से document हट गया। Folder copy सुरक्षित है।' });
            continue;
          }
          if (remote && !supported(remote.kind)) {
            conflicts.push({ id: documentId, title: local.title, reason: 'Server पर document का प्रकार बदल गया।' });
            continue;
          }
          if (!remote) {
            const linkedPart = local.part === null ? null : link.parts?.[local.part];
            const partId = linkedPart?.title === snapshot.manifest.parts?.[local.part]?.title ? linkedPart?.id : undefined;
            const operations = uploadOperations(documentId, local, null, null, (index + 1) * 1024, partId);
            const bytes = new TextEncoder().encode(JSON.stringify(operations)).length;
            if (additions.length >= 8 || additionBytes + bytes > 950000) await uploadAdditions();
            additions.push({ local, documentId, operations });
            additionBytes += bytes;
            continue;
          }
          if (remote && entry.remoteRevision === remote.revision && entry.baseline === local.hash &&
              entry.path === local.path && entry.legacyId === local.legacyId) continue;
          const body = remote ? await adapter.readDocument(documentId, { revision: remote.revision }) : null;
          const remoteHash = body ? await digest([remote.kind, remote.title, root.LmParagraphModel.toText(body.paragraphs)]) : null;
          let baseline = local.hash;
          let remoteRevision = remote?.revision;
          if (remoteHash !== local.hash) {
            const choice = resolutions[documentId];
            const reviewed = choice?.localHash === local.hash && choice?.remoteHash === remoteHash ? choice.side : null;
            if (reviewed === 'folder' || (entry.baseline && remoteHash === entry.baseline)) {
              if (await folder.readText(local.path) !== local.text) throw new Error('Upload से पहले local file बदली: ' + local.path);
              if (reviewed === 'folder' && body) await folder.writeText('.lekhak-sync/backups/' + remoteHash + '.txt', root.LmParagraphModel.toText(body.paragraphs), { verify: true });
              const receipt = await adapter.apply(link.projectId, {
                protocolVersion: 1, operationId: id(),
                operations: uploadOperations(documentId, local, remote, body)
              });
              remoteRevision = receipt.revision;
              pushed++;
            } else if (local.kind === remote.kind && (reviewed === 'server' || (entry.baseline && local.hash === entry.baseline))) {
              if (pushOnly && reviewed === 'server') throw new Error('Database copy लगाने के लिए local editor बंद करें।');
              if (pushOnly) { deferred++; continue; }
              await download(local, remote, body);
              baseline = remoteHash;
              pulled++;
            } else {
              conflicts.push({ id: documentId, title: local.title, reason: 'Folder और Database में अलग बदलाव हैं।',
                localHash: local.hash, remoteHash, localText: local.text, remoteText: root.LmParagraphModel.toText(body.paragraphs),
                canChoose: local.kind === remote.kind });
              continue;
            }
          }
          link.documents[documentId] = { path: local.path, legacyId: local.legacyId, kind: local.kind, baseline, remoteRevision };
          await persist();
        }
        await uploadAdditions();
        for (const remote of remoteManifest.documents) {
          if (used.has(remote.id) || remote.deleted || !supported(remote.kind)) continue;
          const previous = link.documents[remote.id];
          if (previous?.baseline) {
            conflicts.push({ id: remote.id, title: remote.title, reason: 'Folder की सूची से document हट गया। Database copy सुरक्षित है।' });
            continue;
          }
          if (pushOnly) { deferred++; continue; }
          const body = await adapter.readDocument(remote.id, { revision: remote.revision });
          const path = await addLocal(remote, body, link);
          link.documents[remote.id] = { path, legacyId: remote.id, kind: remote.kind, remoteRevision: remote.revision,
            baseline: await digest([remote.kind, remote.title, root.LmParagraphModel.toText(body.paragraphs)]) };
          await persist();
          pulled++;
        }
        if (!link.initializing || !conflicts.length) {
          onProgress('Naming, Facts और Dictionary की जाँच कर रहे हैं…');
          const latest = pushed || changedParts || link.initializing ? await adapter.manifest(link.projectId) : remoteManifest;
          deferred += await syncProjectInfo(link, latest.project, resolutions, conflicts, persist, pushOnly);
          deferred += await syncMetadata(snapshot, link, latest, resolutions, conflicts, persist, pushOnly);
        }
        if (link.initializing && !conflicts.length) {
          link.initializing = false;
          await persist();
        }
        return { projectId: link.projectId, pushed, pulled, deferred, conflicts };
      };
      if (!root.navigator?.locks) throw new Error('Folder sync के लिए Web Locks वाला browser चाहिए।');
      return root.navigator.locks.request('lekhak-folder-sync-worker', { ifAvailable: true }, worker => {
        if (!worker) throw new Error('दूसरे tab में sync चल रहा है।');
        return root.navigator.locks.request('lekhak-folder-sync', { ifAvailable: true }, editorGuard => run(!editorGuard));
      });
    }
    async function restoreFromCloud(projectId) {
      const remote=await adapter.manifest(projectId);
      const project=remote.project;
      const parts=remote.parts.filter(part=>!part.deleted);
      const link={version:1,account,projectId,initializing:false,documents:{},
        parts:parts.map(part=>({id:part.id,title:part.title,synopsis:part.synopsis||''}))};
      const manifest={title:project.title,type:project.type,language:project.language,
        author:project.metadata?.author||'',synopsis:project.metadata?.synopsis||'',
        createdAt:project.created_at,updatedAt:project.updated_at,chapters:[],
        parts:link.parts.map(part=>({title:part.title,synopsis:part.synopsis,chapters:[]}))};
      await folder.writeJson(manifestPath,manifest);
      if(project.type!=='news')await folder.writeJson(draftsPath,{drafts:[]});
      for(const item of remote.documents){
        if(item.deleted||!supported(item.kind))continue;
        const body=await adapter.readDocument(item.id,{revision:item.revision,scan:true});
        const path=await addLocal(item,body,link);
        link.documents[item.id]={path,legacyId:item.id,kind:item.kind,remoteRevision:item.revision,
          baseline:await digest([item.kind,item.title,root.LmParagraphModel.toText(body.paragraphs)])};
      }
      const metadata=remote.metadata.filter(row=>!row.deleted);
      const groups=project.type==='news'?[['news','NewsDesk_Articles.json',['news-article'],'news-state']]:[
        ['naming','Story_Naming.json',['naming-category','naming-entry'],'naming-state'],
        ['facts','Story_Facts.json',['fact']],
        ['dictionary','Story_Word_Editing.json',['dictionary-rule'],'dictionary-state']
      ];
      for(const [key,file,kinds,settings] of groups){
        const rows=metadata.filter(row=>kinds.includes(row.kind)||(settings&&row.kind==='project-settings'&&row.payload.id===settings));
        const payload=folderMetadata(key,rows,link);
        await folder.writeJson(file,payload);
        link.metadata ||= {};
        link.metadata[key]={localHash:await digest(canonical(payload)),remoteHash:await rowHash(rows)};
      }
      await folder.writeJson(journalPath,link);
    }

    return { readLink, sync, restoreFromCloud, preview: () => inventory(folder, { preview: true }) };
  }

  root.LmFolderSync = Object.freeze({ create, holdLocalEditor, releaseLocalEditor, newsDatasets, newsFromRows });
})(typeof window === 'undefined' ? globalThis : window);
