// ===== 专项验证：内置音效库 + 预设胶囊（v3.7.x） =====
// 链路：加载 → 进音效设置页 → 三组预设胶囊渲染/默认内置高亮 →
//       点胶囊切换（写 sfx-*-b + 试听合成）→ 静音不播 → 自定义优先级与替换 →
//       清除回落 → ring 循环播放/停止 → contact-switched 刷新 → 无 JS 异常。
// 需要 Node 21+ + 本机 Chrome/Edge；找不到时用 CHROME_PATH 指定。
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, statSync } from 'node:fs';
import { join, normalize, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = normalize(dirname(fileURLToPath(import.meta.url)) + '/..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const candidates = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium'
].filter(Boolean);
const chromePath = candidates.find((p) => { try { return statSync(p).isFile(); } catch (e) { return false; } });
if (!chromePath) { console.error('找不到 Chrome/Edge，请设置 CHROME_PATH'); process.exit(1); }
if (typeof WebSocket !== 'function') { console.error('需要 Node 21+'); process.exit(1); }

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = createServer((req, res) => {
  try {
    let p = normalize(join(root, decodeURIComponent(req.url.split('?')[0])));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (statSync(p).isDirectory()) p = join(p, 'index.html');
    res.writeHead(200, { 'Content-Type': types[extname(p)] || 'application/octet-stream' });
    res.end(readFileSync(p));
  } catch (e) { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = 'http://127.0.0.1:' + server.address().port;

const cdpPort = 9800 + Math.floor(Math.random() * 100);
const chrome = spawn(chromePath, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-sfx-builtin-' + Date.now()),
  '--remote-debugging-port=' + cdpPort, 'about:blank'
], { stdio: 'ignore' });

let ws = null, msgId = 0;
const pend = new Map();
async function cdpConnect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + cdpPort + '/json')).json();
      const page = list.find((t) => t.type === 'page');
      if (page) {
        ws = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        ws.onmessage = (ev) => {
          const m = JSON.parse(ev.data);
          if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
        };
        return;
      }
    } catch (e) {}
    await sleep(150);
  }
  throw new Error('无法连接无头浏览器');
}
function cdp(method, params = {}) {
  const id = ++msgId;
  return new Promise((res) => { pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
async function evalJs(expr) {
  try {
    const r = await cdp('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r && r.exceptionDetails) return null;
    return r && r.result ? r.result.value : null;
  } catch (e) { return null; }
}

await cdpConnect();
await cdp('Page.enable');
await cdp('Runtime.enable');
// 收集页面 JS 异常 + 在 sfx.js 前注入 AudioContext/Audio 计数探针
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "(function(){window.__smokeErrs=[];window.addEventListener('error',function(e){try{window.__smokeErrs.push(String(e.message||e.error||'err'));}catch(_){}});try{window.__sfxBufSrc=0;var AC=window.AudioContext||window.webkitAudioContext;if(AC){var o1=AC.prototype.createBufferSource;AC.prototype.createBufferSource=function(){window.__sfxBufSrc++;return o1.apply(this,arguments);};}window.__sfxAudioPlay=0;var A=window.Audio;if(A){var o2=A.prototype.play;A.prototype.play=function(){window.__sfxAudioPlay++;return o2.apply(this,arguments);};}}catch(e){}})()" });

const results = [];
function check(desc, ok, detail) {
  results.push({ desc, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + detail + ']' : ''));
}

await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
for (let i = 0; i < 50; i++) { if (await evalJs('!!window.__mochiDataReady')) break; await sleep(200); }
await sleep(800);

// 进入：点开屏进入按钮 → 有确认层则点【我已知晓】
await evalJs("(function(){var e=document.getElementById('splash-enter');if(e&&!e.hidden)e.click();return true;})()");
await sleep(400);
await evalJs("(function(){var c=document.getElementById('splash-confirm');if(c&&!c.hidden){var b=c.querySelector('#splash-confirm-ok');if(b)b.click();}return true;})()");
await sleep(900);

// 模拟生成最小静音 WAV dataURL（用于"自定义音频"路径）
const makeWav = "(function(){var sr=8000,n=Math.round(sr*0.05),buf=new ArrayBuffer(44+n),v=new DataView(buf);function ws(o,s){for(var i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));}ws(0,'RIFF');v.setUint32(4,36+n,true);ws(8,'WAVE');ws(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr,true);v.setUint16(32,1,true);v.setUint16(34,8,true);ws(36,'data');v.setUint32(40,n,true);for(var i=0;i<n;i++)v.setUint8(44+i,128);var bytes=new Uint8Array(buf),bin='';for(var i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);return 'data:audio/wav;base64,'+btoa(bin);})()";

// 打开音效设置页（row-sfx-settings 是事件委托入口）
await evalJs("(function(){var r=document.getElementById('row-sfx-settings');if(r)r.click();return true;})()");
await sleep(400);
check('音效设置页已打开', await evalJs("(function(){var p=document.getElementById('page-sfx-settings');return !!p&&!p.hidden;})()"));

// —— 用例 1：三组预设胶囊渲染、数量正确 ——
const c1 = JSON.parse(await evalJs("(function(){function cnt(id){var el=document.getElementById(id);return el?el.querySelectorAll('.sfx-preset').length:-1;}return JSON.stringify({ring:cnt('sfx-ring-presets'),in:cnt('sfx-in-presets'),out:cnt('sfx-out-presets')});})()") || '{}');
check('来电铃声预设胶囊 3 个（静音+温馨铃+经典铃）', c1.ring === 3, 'ring=' + c1.ring);
check('联系人消息预设胶囊 7 个（静音+6 内置）', c1.in === 7, 'in=' + c1.in);
check('我发消息预设胶囊 5 个（静音+4 内置）', c1.out === 5, 'out=' + c1.out);

// —— 用例 2：默认内置生效 + 默认胶囊高亮 + 状态显示 ——
const c2 = JSON.parse(await evalJs("(function(){var val=function(id){var el=document.getElementById(id);return el?el.textContent:'';};function on(id,label){var el=document.getElementById(id);var b=el?Array.from(el.querySelectorAll('.sfx-preset')).find(function(x){return x.textContent===label;}):null;return b?b.classList.contains('on'):false;}return JSON.stringify({ring:val('sfx-ring-val'),in:val('sfx-in-val'),out:val('sfx-out-val'),ringOn:on('sfx-ring-presets','温馨铃'),inOn:on('sfx-in-presets','气泡'),outOn:on('sfx-out-presets','气泡'),noneOn:on('sfx-in-presets','静音')});})()") || '{}');
check('默认来电铃声=温馨铃', c2.ring === '温馨铃', c2.ring);
check('默认联系人消息=气泡', c2.in === '气泡', c2.in);
check('默认我发送和回复消息=气泡（与联系人同一种）', c2.out === '气泡', c2.out);
check('默认内置胶囊高亮（温馨铃/气泡/气泡）', c2.ringOn === true && c2.inOn === true && c2.outOn === true);
check('默认静音胶囊不高亮', c2.noneOn === false);

// —— 用例 3：记录合成基线（全局探针，其他模块可能已用过 AudioContext，只比较增量）——
const baseBufSrc = await evalJs('window.__sfxBufSrc') || 0;
check('记录合成基线（无异常）', typeof baseBufSrc === 'number', 'base=' + baseBufSrc);

// —— 用例 4：点「叮咚」胶囊 → 写 sfx-in-b + 状态更新 + 试听合成播放 ——
const c4 = JSON.parse(await evalJs("(function(){var b=Array.from(document.querySelectorAll('#sfx-in-presets .sfx-preset')).find(function(x){return x.textContent==='叮咚';});if(b)b.click();var s=window.activeStore();var bid=null;try{bid=s.get('sfx-in-b');}catch(e){}var val=document.getElementById('sfx-in-val');var onDing=document.getElementById('sfx-in-presets').querySelector('.sfx-preset.on');return JSON.stringify({clicked:!!b,bid:bid,val:val?val.textContent:'',onText:onDing?onDing.textContent:''});})()") || '{}');
check('点「叮咚」写入 sfx-in-b=ding', c4.clicked === true && c4.bid === 'ding', 'bid=' + c4.bid);
check('状态栏显示「叮咚」', c4.val === '叮咚', c4.val);
check('高亮切到「叮咚」', c4.onText === '叮咚', c4.onText);
const spyAfterDing = await evalJs('window.__sfxBufSrc') || 0;
check('点击即试听（Web Audio 合成播放 +1）', spyAfterDing === baseBufSrc + 1, 'bufSrc=' + spyAfterDing);

// —— 用例 5：playSfx('in') 内置路径触发合成 ——
await evalJs("(function(){if(window.playSfx)window.playSfx('in');return true;})()");
await sleep(200);
const spyAfterPlay = await evalJs('window.__sfxBufSrc') || 0;
check('playSfx(in) 内置路径播放', spyAfterPlay === spyAfterDing + 1, 'bufSrc=' + spyAfterPlay);

// —— 用例 6：点「静音」→ 写入 none，静音后 playSfx 不播放 ——
await evalJs("(function(){var b=Array.from(document.querySelectorAll('#sfx-in-presets .sfx-preset')).find(function(x){return x.textContent==='静音';});if(b)b.click();return true;})()");
await sleep(200);
const c6 = JSON.parse(await evalJs("(function(){var s=window.activeStore();var val=document.getElementById('sfx-in-val');var on=document.getElementById('sfx-in-presets').querySelector('.sfx-preset.on');return JSON.stringify({bid:s.get('sfx-in-b'),val:val?val.textContent:'',onText:on?on.textContent:''});})()") || '{}');
check('点「静音」写入 sfx-in-b=none', c6.bid === 'none', 'bid=' + c6.bid);
check('状态栏显示「静音」', c6.val === '静音', c6.val);
check('高亮切到「静音」', c6.onText === '静音', c6.onText);
await evalJs("(function(){if(window.playSfx)window.playSfx('in');return true;})()");
await sleep(200);
const spyAfterMute = await evalJs('window.__sfxBufSrc') || 0;
check('静音后 playSfx(in) 不播放', spyAfterMute === spyAfterPlay, 'bufSrc=' + spyAfterMute);

// —— 用例 7：自定义音频存在时点内置胶囊 → 自定义被替换（优先级无歧义）——
await evalJs("(function(){var s=window.activeStore();s.set('sfx-in'," + makeWav + ");var val=document.getElementById('sfx-in-val');return val?val.textContent:'';})()");
await evalJs("(function(){var b=Array.from(document.querySelectorAll('#sfx-in-presets .sfx-preset')).find(function(x){return x.textContent==='水滴';});if(b)b.click();return true;})()");
await sleep(300);
const c7 = JSON.parse(await evalJs("(function(){var s=window.activeStore();return JSON.stringify({custom:s.get('sfx-in'),bid:s.get('sfx-in-b'),val:document.getElementById('sfx-in-val').textContent,on:document.getElementById('sfx-in-presets').querySelector('.sfx-preset.on').textContent});})()") || '{}');
check('选内置替换自定义（sfx-in 已清除）', c7.custom === null || c7.custom === undefined || c7.custom === '', 'custom=' + String(c7.custom).slice(0, 20));
check('选内置后 sfx-in-b=drop', c7.bid === 'drop', 'bid=' + c7.bid);
check('状态栏显示「水滴」且高亮', c7.val === '水滴' && c7.on === '水滴', c7.val);
const spyAfterDrop = await evalJs('window.__sfxBufSrc') || 0;

// —— 用例 8：自定义音频存在时 playSfx 走 Audio 路径（优先自定义）——
await evalJs("(function(){var s=window.activeStore();s.set('sfx-in'," + makeWav + ");s.set('sfx-in-b','bubble');if(window.playSfx)window.playSfx('in');return true;})()");
await sleep(300);
const c8 = JSON.parse(await evalJs("(function(){var s=window.activeStore();return JSON.stringify({custom:!!s.get('sfx-in'),bufSrc:window.__sfxBufSrc,audioPlay:window.__sfxAudioPlay});})()") || '{}');
check('自定义存在时 playSfx 走 Audio 播放', c8.custom === true && c8.audioPlay > 0, 'audioPlay=' + c8.audioPlay);
check('自定义存在时不再走 Web Audio 合成', c8.bufSrc === spyAfterDrop, 'bufSrc=' + c8.bufSrc);

// —— 用例 9：「清除」只清自定义、回落内置 ——
await evalJs("(function(){document.getElementById('sfx-in-clear').click();return true;})()");
await sleep(300);
const c9 = JSON.parse(await evalJs("(function(){var s=window.activeStore();return JSON.stringify({custom:s.get('sfx-in'),bid:s.get('sfx-in-b'),val:document.getElementById('sfx-in-val').textContent});})()") || '{}');
check('清除后自定义音频移除', c9.custom === null || c9.custom === undefined || c9.custom === '', 'custom=' + String(c9.custom));
check('清除后状态回落内置（气泡）', c9.val === '气泡', 'val=' + c9.val);

// —— 用例 10：来电铃声内置循环播放 + stopSfx 停止 ——
await evalJs("(function(){var b=Array.from(document.querySelectorAll('#sfx-ring-presets .sfx-preset')).find(function(x){return x.textContent==='经典铃';});if(b)b.click();return true;})()");
await sleep(200);
const c10 = JSON.parse(await evalJs("(function(){var s=window.activeStore();return JSON.stringify({bid:s.get('sfx-ring-b'),val:document.getElementById('sfx-ring-val').textContent});})()") || '{}');
check('点「经典铃」写入 sfx-ring-b=ring-classic', c10.bid === 'ring-classic' && c10.val === '经典铃', 'bid=' + c10.bid);
const spyAfterClassic = await evalJs('window.__sfxBufSrc') || 0;
await evalJs("(function(){if(window.playSfx)window.playSfx('ring');if(window.stopSfx)window.stopSfx('ring');return true;})()");
await sleep(200);
const spyAfterRing = await evalJs('window.__sfxBufSrc') || 0;
check('playSfx(ring)+stopSfx 无异常（合成+1）', spyAfterRing === spyAfterClassic + 1, 'bufSrc=' + spyAfterRing);

// —— 用例 11：切桌面（contact-switched）后预设重渲染无异常 ——
await evalJs("(function(){document.dispatchEvent(new Event('contact-switched'));return true;})()");
await sleep(300);
const c11 = JSON.parse(await evalJs("(function(){var cnt=document.querySelectorAll('#sfx-in-presets .sfx-preset').length;var val=document.getElementById('sfx-in-val').textContent;return JSON.stringify({cnt:cnt,val:val});})()") || '{}');
check('切桌面后胶囊重渲染数量不变', c11.cnt === 7, 'cnt=' + c11.cnt);
check('切桌面后状态保持（气泡）', c11.val === '气泡', 'val=' + c11.val);

// —— 用例 12：无 JS 异常 ——
await sleep(300);
const errs = await evalJs('(window.__smokeErrs||[]).length') || 0;
if (errs) console.log('JS 异常：' + (await evalJs('JSON.stringify(window.__smokeErrs)')));
check('全程无 JS 异常', errs === 0, String(errs));

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}

const fails = results.filter((r) => !r.ok).length;
console.log('\n结果：' + (results.length - fails) + '/' + results.length + ' 项通过');
process.exit(fails ? 1 : 0);
