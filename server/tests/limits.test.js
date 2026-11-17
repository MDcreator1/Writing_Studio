import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createApi, tokenDigest } from '../src/http.js';

test('transport limits, preflight, canonical token validation and sanitized failure', async () => {
  const actor=randomUUID();
  let calls=0;
  const server=createApi({instanceId:randomUUID(),tokens:new Map([[tokenDigest('token'),actor]]),maxBytes:100,rateLimit:4,scanRateLimit:1,
    allowedOrigins:['http://localhost:8000'],database:{withClient:async()=>{calls++;throw Error('SECRET SQL CONNECTION STRING');}}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port+'/api/v1';
  try {
    let response=await fetch(base+'/projects',{method:'OPTIONS',headers:{Origin:'http://localhost:8000'}});
    assert.equal(response.status,204);
    response=await fetch(base+'/projects',{method:'POST',headers:{Authorization:'Bearer token','Content-Type':'text/plain'},body:'{}'});
    assert.equal(response.status,415);
    response=await fetch(base+'/projects',{method:'POST',headers:{Authorization:'Bearer token','Content-Type':'application/json'},body:JSON.stringify({text:'x'.repeat(101)})});
    assert.equal(response.status,413);
    response=await fetch(base+'/projects',{headers:{Authorization:'Bearer token'}});
    assert.equal(response.status,500);assert.ok(!(await response.text()).includes('SECRET'));
    response=await fetch(base+'/me',{headers:{Authorization:'Bearer token'}});assert.equal(response.status,200);
    response=await fetch(base+'/me',{headers:{Authorization:'Bearer token'}});assert.equal(response.status,429);
    assert.ok(Number(response.headers.get('retry-after'))>=1);
    const scan=base+'/documents/'+randomUUID()+'/paragraphs?scan=1';
    response=await fetch(scan,{headers:{Authorization:'Bearer token'}});
    assert.equal(response.status,500,'interactive request limit must not block scan reads');
    response=await fetch(scan,{headers:{Authorization:'Bearer token'}});
    assert.equal(response.status,429);
    assert.equal(calls,2);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
