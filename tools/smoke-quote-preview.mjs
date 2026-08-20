// ===== 专项验证：聊天引用预览条（v3.7.x） =====
// 链路：进聊天页 → 发消息 → 点气泡选「引用」→ 输入栏上方出现引用预览条
//       （显示引用了什么 + ✕ 删除）→ 点 ✕ 删除 → 再引用 → 发送 → 气泡带引用块且预览条消失。
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
  '--user-data-dir=' + join(process.env.TEMP || '/tmp', 'mochi-quote-preview-' + Date.now()),
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
// 收集页面 JS 异常（跨导航持续注入）
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: "(function(){window.__smokeErrs=[];window.addEventListener('error',function(e){try{window.__smokeErrs.push(String(e.message||e.error||'err'));}catch(_){}});})()" });

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

// 进聊天页
await evalJs("(function(){var a=document.querySelector('.app[data-app=\"chat\"]');if(a)a.click();return true;})()");
await sleep(900);
check('聊天页已进入（输入栏可见）', await evalJs("(function(){var p=document.getElementById('page-chat');return !!p&&!p.hidden&&!!document.getElementById('chat-input');})()"));

const SRC = '这是被引用的源消息QUOTE_SRC_9527';
const REPLY = '引用回复验证QUOTE_REPLY_9527';

// 用例 1：发消息 → 点气泡选「引用」→ 预览条出现
await evalJs("(function(){var i=document.getElementById('chat-input');i.textContent='" + SRC + "';document.getElementById('chat-send').click();return true;})()");
await sleep(400);
const c1 = await evalJs("(function(){var b=Array.from(document.querySelectorAll('#chat-body .msg-bubble')).find(function(x){return x.textContent.indexOf('" + SRC + "')>=0;});if(!b){b=Array.from(document.querySelectorAll('#chat-body .msg-bubble'))[0];}if(!b)return JSON.stringify({found:false});b.click();return JSON.stringify({found:true,bubbleText:b.textContent.slice(0,40)});})()") || '{}';
check('源消息气泡存在并已点击', JSON.parse(c1).found === true);
await sleep(300);
check('气泡操作菜单出现', await evalJs("(function(){var m=document.getElementById('msg-actions');return !!m&&!m.hidden;})()"));
await evalJs("(function(){var b=document.querySelector('#msg-actions .ma-btn[data-act=\"quote\"]');if(b)b.click();return true;})()");
await sleep(300);
const c2 = JSON.parse(await evalJs("(function(){var d=document.getElementById('chat-draft');var q=document.getElementById('chat-draft-quote');var txt=q.querySelector('.chat-draft-quote-text');var x=q.querySelector('.chat-draft-quote-x');return JSON.stringify({draftHidden:d.hidden,quoteHidden:q.hidden,text:txt?txt.textContent:'',hasX:!!x});})()") || '{}');
check('点引用后草稿区可见（输入栏上方出现预览条）', c2.draftHidden === false, 'draftHidden=' + c2.draftHidden);
check('预览条未隐藏且含引用内容', c2.quoteHidden === false && c2.text.indexOf('QUOTE_SRC_9527') >= 0, c2.text);
check('预览条有 ✕ 删除按钮', c2.hasX === true);

// 用例 2：点 ✕ 删除引用 → 预览条消失
await evalJs("(function(){var x=document.querySelector('#chat-draft-quote .chat-draft-quote-x');if(x)x.click();return true;})()");
await sleep(250);
const c3 = JSON.parse(await evalJs("(function(){var d=document.getElementById('chat-draft');var q=document.getElementById('chat-draft-quote');return JSON.stringify({draftHidden:d.hidden,quoteHidden:q.hidden});})()") || '{}');
check('点 ✕ 后引用预览条消失', c3.quoteHidden === true && c3.draftHidden === true, 'draftHidden=' + c3.draftHidden);

// 用例 3：再引用 → 输入文字 → 发送 → 气泡带引用块且预览条消失
await evalJs("(function(){var b=Array.from(document.querySelectorAll('#chat-body .msg-bubble')).find(function(x){return x.textContent.indexOf('QUOTE_SRC_9527')>=0;});if(b)b.click();return true;})()");
await sleep(250);
await evalJs("(function(){var b=document.querySelector('#msg-actions .ma-btn[data-act=\"quote\"]');if(b)b.click();return true;})()");
await sleep(250);
const c4 = JSON.parse(await evalJs("(function(){var d=document.getElementById('chat-draft');return JSON.stringify({draftHidden:d.hidden});})()") || '{}');
check('再次引用后预览条重新出现', c4.draftHidden === false);
await evalJs("(function(){var i=document.getElementById('chat-input');i.textContent='" + REPLY + "';document.getElementById('chat-send').click();return true;})()");
await sleep(500);
const c5 = JSON.parse(await evalJs("(function(){var b=Array.from(document.querySelectorAll('#chat-body .msg-bubble')).find(function(x){return x.textContent.indexOf('QUOTE_REPLY_9527')>=0;});var q=b?b.querySelector('.msg-quote'):null;var d=document.getElementById('chat-draft');return JSON.stringify({found:!!b,hasQuote:!!q,quoteText:q?q.textContent:'',draftHidden:d.hidden});})()") || '{}');
check('发送后新气泡存在', c5.found === true);
check('新气泡带引用块且内容正确', c5.hasQuote === true && c5.quoteText.indexOf('QUOTE_SRC_9527') >= 0, c5.quoteText.slice(0, 40));
check('发送后引用预览条消失', c5.draftHidden === true);

// 用例 4：无 JS 异常
await sleep(300);
const errs = await evalJs('(window.__smokeErrs||[]).length') || 0;
check('全程无 JS 异常', errs === 0, String(errs));

try { if (ws) ws.close(); } catch (e) {}
try { chrome.kill(); } catch (e) {}
try { server.close(); } catch (e) {}

const fails = results.filter((r) => !r.ok).length;
console.log('\n结果：' + (results.length - fails) + '/' + results.length + ' 项通过');
process.exit(fails ? 1 : 0);
