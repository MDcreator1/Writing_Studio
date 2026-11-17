'use strict';
const assert=require('node:assert/strict');
require('../assets/shared/js/06l-remote-adapter.js');
const remote=globalThis.LmRemoteAdapter;
(async()=>{
  let requests=0;
  const adapter=remote.create({baseUrl:'https://example.test',token:'synthetic',timeoutMs:5,fetchImpl:(_url,options)=>{
    requests++;
    return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted')),{once:true}));
  }});
  await assert.rejects(adapter.request('/me'),error=>error.code==='uncertain');
  adapter.disconnect();
  await assert.rejects(adapter.request('/me'),error=>error.code==='disconnected');
  assert.equal(requests,1);
  const invalid=remote.create({baseUrl:'http://localhost:8788',token:'synthetic',fetchImpl:async()=>({ok:true,status:200,json:async()=>({documentId:'d',revision:1,paragraphs:[],nextAfter:0})})});
  await assert.rejects(invalid.readDocument('d'),error=>error.code==='invalid_response');
  assert.throws(()=>remote.create({baseUrl:'https://example.test?token=secret',token:'synthetic'}));
  assert.throws(()=>remote.create({baseUrl:'https://example.test',token:'two words'}));
  console.log('remote adapter: timeout, disconnect, malformed cursor and credential URL rejection passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
