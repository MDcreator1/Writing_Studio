'use strict';

(function initializeDatabaseProfiles(root) {
  const KEY = 'lm_database_profiles_v1';
  const connections = new Map();
  const sessionKey = profile => 'lm_db_tab:' + JSON.stringify([profile.id,profile.baseUrl,profile.instanceId,profile.userId]);
  function list() {
    const value = JSON.parse(root.localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(value)) throw new Error('Database profile settings are invalid.');
    return value.map(profile => ({ id:profile.id, name:profile.name, baseUrl:profile.baseUrl, instanceId:profile.instanceId, userId:profile.userId }));
  }
  async function connect({ id, name, baseUrl, token }) {
    const profileId = id || root.LmParagraphModel.newId();
    const previous = list().find(profile => profile.id === profileId);
    if (previous && root.LmRemoteAdapter.normalizeUrl(baseUrl) !== previous.baseUrl) throw new Error('Use a new profile when changing the server URL.');
    const adapter = root.LmRemoteAdapter.create({ baseUrl, token });
    try {
      const identity = await adapter.connect(previous || {});
      const profile = { id:profileId, name:String(name || previous?.name || 'Database'), baseUrl:root.LmRemoteAdapter.normalizeUrl(baseUrl), instanceId:identity.capabilities.instanceId, userId:identity.account.userId };
      const stored = list().filter(item => item.id !== profileId);
      stored.push(profile);
      root.localStorage.setItem(KEY,JSON.stringify(stored));
      connections.get(profileId)?.adapter.disconnect();
      const connection = Object.freeze({ profile:Object.freeze(profile), adapter, role:identity.account.role, capabilities:identity.capabilities,
        scopeId:JSON.stringify([profile.instanceId,profile.userId,profile.id]) });
      connections.set(profileId,connection);
      try { root.sessionStorage?.setItem(sessionKey(profile),token); } catch {}
      return connection;
    } catch(error) { adapter.disconnect(); throw error; }
  }
  async function resume(id) {
    if(connections.has(id))return connections.get(id);
    const profile=list().find(item=>item.id===id);
    if(!profile)return null;
    let token;
    try { token=root.sessionStorage?.getItem(sessionKey(profile)); } catch {}
    if(!token)return null;
    try{return await connect({...profile,token});}
    catch(error){
      if(error.status===401||error.status===403||error.code==='identity_mismatch')forgetSession(profile);
      throw error;
    }
  }
  function forgetSession(profile){
    if(profile)try{root.sessionStorage?.removeItem(sessionKey(profile));}catch{}
  }
  function disconnect(id) {
    forgetSession(connections.get(id)?.profile||list().find(profile=>profile.id===id));
    connections.get(id)?.adapter.disconnect();
    connections.delete(id);
  }
  async function remove(ids) {
    const selected = list().filter(profile => ids.includes(profile.id));
    if (selected.some(profile => [root.LmDatabaseEditor?.current()?.profileId,root.LmNewsDatabaseEditor?.current()?.profileId].includes(profile.id))) {
      throw new Error('पहले इस profile का editor बंद करें।');
    }
    const scopes = selected.map(profile => JSON.stringify([profile.instanceId, profile.userId, profile.id]));
    const store = await root.LmWorkingStore.open();
    try {
      if (await store.hasPending(scopes)) throw new Error('इस connection में pending saves या recovery बाकी हैं।');
      root.localStorage.setItem(KEY, JSON.stringify(list().filter(profile => !ids.includes(profile.id))));
      selected.forEach(profile => {forgetSession(profile);disconnect(profile.id);});
    } finally { store.close(); }
  }
  async function currentSession(){
    for(const profile of list().filter(item=>item.baseUrl===root.location.origin)){
      const connection=await resume(profile.id).catch(()=>null);
      if(connection?.role)return connection;
    }
    return null;
  }
  root.LmDatabaseProfiles = Object.freeze({ list, connect, resume, currentSession, disconnect, remove, connection:id => connections.get(id) || null });
})(typeof window === 'undefined' ? globalThis : window);
