'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  let apiServer,engine;
  let apiPort;
  if(process.argv.includes('--database')){
    const {PGlite}=require('../server/node_modules/@electric-sql/pglite');
    const {migrate}=await import('../server/src/db.js');
    const {createApi,tokenDigest}=await import('../server/src/http.js');
    engine=new PGlite();let queue=Promise.resolve();
    const database={withClient(action){const task=queue.then(()=>action({query:(sql,params)=>!params&&sql.includes(';')?engine.exec(sql):engine.query(sql,params)}));queue=task.catch(()=>{});return task;}};
    await migrate(database);
    apiServer=createApi({database,instanceId:randomUUID(),tokens:new Map([[tokenDigest('browser-synthetic-token'),randomUUID()]]),allowedOrigins:['http://127.0.0.1:8766']});
    await new Promise(resolve=>apiServer.listen(0,'127.0.0.1',resolve));apiPort=apiServer.address().port;
  }
  const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--no-first-run', '--disable-gpu', '--remote-debugging-port=9238',
    `--user-data-dir=${path.join(os.tmpdir(), 'lekhak-m2-cdp-' + Date.now())}`, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    let pages;
    for (let i = 0; i < 40; i++) {
      try { pages = await (await fetch('http://127.0.0.1:9238/json')).json(); break; } catch { await sleep(250); }
    }
    if (!pages) throw new Error('Test Chrome did not start');
    socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0;
    const requests = new Map();
    socket.onmessage = event => { const response = JSON.parse(event.data); if(response.method==='Runtime.exceptionThrown')console.error(JSON.stringify(response.params.exceptionDetails)); if (requests.has(response.id)) { requests.get(response.id)(response); requests.delete(response.id); } };
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const requestId = ++id;
      const timer = setTimeout(() => { requests.delete(requestId); reject(new Error('CDP timeout')); }, 15000);
      requests.set(requestId, response => { clearTimeout(timer); response.error ? reject(new Error(JSON.stringify(response.error))) : resolve(response.result); });
      socket.send(JSON.stringify({ id: requestId, method, params }));
    });
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
    const query=new URLSearchParams();if(process.argv.includes('--legacy'))query.set('legacy','1');if(apiPort)query.set('apiPort',String(apiPort));
    await send('Page.navigate', { url: 'http://127.0.0.1:8766/tmp/storage-browser-test.html?' + query });
    let result = '';
    for (let i = 0; i < 200; i++) {
      await sleep(200);
      const response = await send('Runtime.evaluate', { expression: '({text:document.getElementById("result")?.textContent,keyboard:Boolean(window.__databaseKeyboardSaveRequested),screenshot:window.__databaseScreenshotRequested})', returnByValue: true });
      const observed=response.result.value || {};
      result=observed.text || '';
      if(observed.screenshot==='database-editor'){
        const screenshot=await send('Page.captureScreenshot',{format:'png'});
        fs.writeFileSync(path.join(__dirname,'../tmp/database-editor.png'),Buffer.from(screenshot.data,'base64'));
        await send('Runtime.evaluate',{expression:'window.__databaseScreenshotRequested=false'});
      }
      if(observed.keyboard){
        await send('Runtime.evaluate',{expression:'window.__databaseKeyboardSaveRequested=false'});
        await send('Input.dispatchKeyEvent',{type:'keyDown',modifiers:2,windowsVirtualKeyCode:83,nativeVirtualKeyCode:83,key:'s',code:'KeyS'});
        await send('Input.dispatchKeyEvent',{type:'keyUp',modifiers:0,windowsVirtualKeyCode:83,nativeVirtualKeyCode:83,key:'s',code:'KeyS'});
      }
      if (/BROWSER_PASS|BROWSER_FAIL/.test(result)) break;
    }
    console.log(result);
    if (!result.includes('BROWSER_PASS')) process.exitCode = 1;
    await send('Browser.close');
  } finally {
    socket?.close();
    browser.kill();
    if(apiServer)await new Promise(resolve=>apiServer.close(resolve));
    if(engine)await engine.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
