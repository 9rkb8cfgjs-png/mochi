import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, normalize, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const candidates = [process.env.CHROME_PATH,'C://Program Files\\Google\\Chrome\\Application\\chrome.exe','C://Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe','C://Program Files\\Microsoft\\Edge\\Application\\msedge.exe','C://Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
const types = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json' };
const server = createServer((req,res)=>{ try { let p=normalize(join(root,decodeURIComponent(req.url.split('?')[0]))); if(!p.startsWith(root)){res.writeHead(403);res.end();return;} if(statSync(p).isDirectory())p=join(p,'index.html'); res.writeHead(200,{'Content-Type':types[extname(p)]||'application/octet-stream'}); res.end(readFileSync(p)); } catch(e){ res.writeHead(404); res.end('nf'); } });
await new Promise((r)=>server.listen(0,'127.0.0.1',r));
const baseUrl='http://127.0.0.1:'+server.address().port;
const cdpPort=9300+Math.floor(Math.random()*500);
const chrome=spawn(chromePath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--user-data-dir='+join(process.env.TEMP||'/tmp','mochi-probe-c-'+Date.now()),'--remote-debugging-port='+cdpPort,'about:blank'],{stdio:'ignore'});
let ws=null,msgId=0; const pend=new Map();
async function cdpConnect(){ for(let i=0;i<60;i++){ try{ const list=await(await fetch('http://127.0.0.1:'+cdpPort+'/json')).json(); const page=list.find(t=>t.type==='page'); if(page){ ws=new WebSocket(page.webSocketDebuggerUrl); await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej;}); ws.onmessage=(ev)=>{const m=JSON.parse(ev.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}}; return; } }catch(e){} await sleep(150); } throw new Error('无法连接'); }
function cdp(method,params={}){ const id=++msgId; return new Promise((res)=>{pend.set(id,res);ws.send(JSON.stringify({id,method,params}));}); }
async function evalJs(expr){ try{ const r=await cdp('Runtime.evaluate',{expression:expr,returnByValue:true}); if(r&&r.exceptionDetails)return null; return r&&r.result?r.result.value:null; }catch(e){return null;} }
async function shot(name){ const r=await cdp('Page.captureScreenshot',{format:'png'}); if(r&&r.data){ writeFileSync(join(root,'tools',name),Buffer.from(r.data,'base64')); console.log('saved',name); } }
await cdpConnect(); await cdp('Page.enable'); await cdp('Runtime.enable');
await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
await cdp('Page.navigate',{url:baseUrl+'/index.html'}); await sleep(2500);
for(let i=0;i<40;i++){ if(await evalJs('!!window.__mochiDataReady'))break; await sleep(300); }
await evalJs("(function(){var s=document.getElementById('splash');if(s&&!s.classList.contains('hide'))s.click();return true;})()"); await sleep(900);
await evalJs("(function(){document.querySelectorAll('.page').forEach(function(p){p.hidden=(p.id!=='page-theme');});return true;})()"); await sleep(300);
// 打开小组件颜色弹窗
await evalJs("(function(){var r=document.getElementById('row-widget-color');if(r)r.click();return true;})()"); await sleep(400);
const info = await evalJs("(function(){var sw=document.getElementById('modal-swatches');var custom=document.getElementById('modal-custom');var color=document.getElementById('modal-color');var pills=document.getElementById('modal-pills');return JSON.stringify({swCount:sw?sw.children.length:0,swHidden:sw?sw.hidden:null,customHidden:custom?custom.hidden:null,colorHidden:color?color.hidden:null,pills:pills?pills.textContent:''});})()");
console.log('小组件颜色弹窗:', info);
await shot('color-picker.png');
// 再开按钮颜色
await evalJs("(function(){var m=document.getElementById('modal-mask');if(m)m.hidden=true;return true;})()"); await sleep(200);
await evalJs("(function(){var r=document.getElementById('row-widget-btn');if(r)r.click();return true;})()"); await sleep(400);
const info2 = await evalJs("(function(){var sw=document.getElementById('modal-swatches');return JSON.stringify({swCount:sw?sw.children.length:0,customHidden:document.getElementById('modal-custom')?document.getElementById('modal-custom').hidden:null});})()");
console.log('按钮颜色弹窗:', info2);
await shot('color-btn.png');
try{ws.close();}catch(e){} try{chrome.kill();}catch(e){} try{server.close();}catch(e){}
