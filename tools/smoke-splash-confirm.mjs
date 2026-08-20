// ===== 专项验证：开屏「我已知晓」确认层（v3.7.x） =====
// 链路：数据就绪 → 点【点击进入】→ 确认层出现 → 点【我已知晓】→ 开屏关闭进入页面。
// 以及：公告被隐藏（notice.json hide）时点击进入不弹确认层、直接进入。
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
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-splash-confirm-' + Date.now()),
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
const waitReady = async () => {
  for (let i = 0; i < 50; i++) { if (await evalJs('!!window.__mochiDataReady')) return; await sleep(200); }
};
// 数据就绪后按钮靠 300ms 轮询刷新（空数据场景 mochi-restore-done 不派发），
// 多等一会确保 enterEl 已可点、确认层逻辑稳定
const waitEnterReady = async () => {
  await waitReady();
  await sleep(1200);
};

await cdpConnect();
await cdp('Page.enable');
await cdp('Runtime.enable');

const results = [];
function check(desc, ok, detail) {
  results.push({ desc, ok: !!ok });
  console.log((ok ? 'PASS' : 'FAIL') + '  ' + desc + (detail ? '  [' + detail + ']' : ''));
}

// ---- 用例 1：点进入 → 确认层出现（不直接进入） ----
await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
await waitEnterReady();
check('数据就绪后可点击进入', await evalJs("(function(){return !document.getElementById('splash-enter').hidden;})()"));

await evalJs("(function(){document.getElementById('splash-enter').click();return true;})()");
await sleep(400);
const st1 = await evalJs("(function(){var c=document.getElementById('splash-confirm');var s=document.getElementById('splash');return JSON.stringify({confirmVisible:!c.hidden,confirmText:(c.querySelector('.splash-confirm-text')||{}).textContent||'',splashStillThere:!s.classList.contains('hide')});})()") || '{}';
const st1j = JSON.parse(st1);
check('点进入后确认层出现', st1j.confirmVisible === true);
check('确认层含报修说明文案', (st1j.confirmText || '').indexOf('报修') >= 0 && (st1j.confirmText || '').indexOf('手机型号') >= 0);
check('确认层出现时开屏未关闭', st1j.splashStillThere === true);

// ---- 用例 2：点【我已知晓】→ 确认层关闭 + 开屏关闭进入 ----
await evalJs("(function(){document.getElementById('splash-confirm-ok').click();return true;})()");
await sleep(900);
const st2 = await evalJs("(function(){var c=document.getElementById('splash-confirm');var s=document.getElementById('splash');return JSON.stringify({confirmGone:c===null||c.parentNode===null||c.hidden,splashGone:s===null||s.parentNode===null});})()") || '{}';
const st2j = JSON.parse(st2);
check('点【我已知晓】后确认层消失', st2j.confirmGone === true);
check('点【我已知晓】后开屏关闭进入页面', st2j.splashGone === true);

// ---- 用例 3：确认层内点文字（非按钮）不触发进入/不误关 ----
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
await waitEnterReady();
await evalJs("(function(){document.getElementById('splash-enter').click();return true;})()");
await sleep(300);
await evalJs("(function(){var t=document.querySelector('.splash-confirm-text');t.click();return true;})()");
await sleep(300);
const st3 = await evalJs("(function(){var c=document.getElementById('splash-confirm');return JSON.stringify({confirmVisible:!c.hidden});})()") || '{}';
check('点确认层文字不误关闭', JSON.parse(st3).confirmVisible === true);
await evalJs("(function(){document.getElementById('splash-confirm-ok').click();return true;})()");
await sleep(700);

// ---- 用例 4：公告被隐藏 → 点进入直接进入、不弹确认层 ----
// 用 Page.addScriptToEvaluateOnNewDocument 在每次导航前注入 fetch 劫持（navigate 后上下文重置）
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "(function(){var o=window.fetch;window.fetch=function(u,opts){if(String(u).indexOf('notice.json')>=0){return Promise.resolve(new Response(JSON.stringify({hide:true}),{status:200,headers:{'Content-Type':'application/json'}}));}return o.apply(window,arguments);};})()" });
await cdp('Page.navigate', { url: baseUrl + '/index.html' });
await sleep(2500);
await waitEnterReady();
// 先确认公告已被远程隐藏（fetch 劫持生效、clock.js 已把 notice 置 none）
for (let i = 0; i < 20; i++) {
  if (await evalJs("document.getElementById('splash-notice').style.display==='none'")) break;
  await sleep(200);
}
await evalJs("(function(){document.getElementById('splash-enter').click();return true;})()");
// 在开屏 400ms 淡出移除前检查：确认层应保持 hidden，且开屏开始隐藏
await sleep(250);
const st4 = await evalJs("(function(){var c=document.getElementById('splash-confirm');var s=document.getElementById('splash');return JSON.stringify({confirmHidden:c.hidden,splashHiding:s.classList.contains('hide')});})()") || '{}';
const st4j = JSON.parse(st4);
check('公告隐藏时点进入不弹确认层', st4j.confirmHidden === true);
check('公告隐藏时点进入直接关闭开屏', st4j.splashHiding === true);

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}

const fails = results.filter((r) => !r.ok).length;
console.log('\n结果：' + (results.length - fails) + '/' + results.length + ' 项通过');
process.exit(fails ? 1 : 0);
