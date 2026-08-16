// ===== 生成 PWA 图标（深色底 + 简约白色爱心）=====
// 用法：node gen-icons.mjs  → 生成 src/pwa/icon-192.png、icon-512.png、icon-180.png、icon-maskable-512.png
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), 'src', 'pwa');
mkdirSync(outDir, { recursive: true });

// ---------- 最小 PNG 编码（RGBA，无依赖） ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(size, pixelFn) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      const o = y * stride + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- 爱心判定（心形公式，4x4 超采样抗锯齿） ----------
// (x²+y²-1)³ - x²y³ ≤ 0，范围 x∈[-1.2,1.2], y∈[-1.25,1.3]
// 注意：图片坐标 y 向下增长，公式坐标 y 向上，需取反，否则爱心会上下颠倒
function heartCover(px, py, cx, cy, scale) {
  let hit = 0;
  const steps = 4;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const x = (px + (i + 0.5) / steps - cx) / scale;
      const y = -(py + (j + 0.5) / steps - cy) / scale;
      const f = (x * x + y * y - 1) ** 3 - x * x * y ** 3;
      if (f <= 0) hit++;
    }
  }
  return hit / (steps * steps);
}

// 圆角矩形覆盖率（深色底）
function roundRectCover(sx, sy, size, radius) {
  const steps = 3;
  let inside = 0;
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const px = sx + (i + 0.5) / steps;
      const py = sy + (j + 0.5) / steps;
      const dx = Math.min(px, size - 1 - px);
      const dy = Math.min(py, size - 1 - py);
      if (dx < 0 || dy < 0) continue;
      if (dx >= radius || dy >= radius) { inside++; continue; }
      const cx = radius - dx, cy = radius - dy;
      if (cx * cx + cy * cy <= radius * radius) inside++;
    }
  }
  return inside / (steps * steps);
}

const BG = [255, 255, 255]; // 白色底
const HEART = [255, 255, 255]; // 白色爱心填充
const OUTLINE = [17, 17, 17]; // #111111 细描边

// 普通图标：白色底（不透明，圆角外也是白——避免系统把透明区域渲染成黑角）+ 白色爱心（细描边），与开屏 logo 同风格
function makeIcon(size) {
  const radius = size * 0.22;
  const cy = size / 2 + size * 0.02; // 心形重心略偏上
  const scale = size * 0.30;
  const stroke = size * 0.022; // 描边粗细
  return encodePng(size, (x, y) => {
    const sx = x + 0.5, sy = y + 0.5;
    const bg = roundRectCover(sx, sy, size, radius);
    const ink = heartCover(sx, sy, size / 2, cy, scale);
    const inkBig = heartCover(sx, sy, size / 2, cy, scale + stroke);
    let c = BG;
    if (inkBig > 0 && ink < 0.5) c = OUTLINE;   // 爱心边缘 → 描边
    else if (ink >= 0.5) c = HEART;             // 爱心内部 → 白色填充
    return [c[0], c[1], c[2], 255];             // 全图不透明（白底），杜绝黑角
  });
}

// maskable：白色铺满整张，白色爱心（细描边）收进中央安全区
function makeMaskable(size) {
  const cy = size / 2 + size * 0.015;
  const scale = size * 0.235;
  const stroke = size * 0.017;
  return encodePng(size, (x, y) => {
    const sx = x + 0.5, sy = y + 0.5;
    const ink = heartCover(sx, sy, size / 2, cy, scale);
    const inkBig = heartCover(sx, sy, size / 2, cy, scale + stroke);
    let c = BG;
    if (inkBig > 0 && ink < 0.5) c = OUTLINE;
    else if (ink >= 0.5) c = HEART;
    return [c[0], c[1], c[2], 255];
  });
}

writeFileSync(join(outDir, 'icon-192.png'), makeIcon(192));
writeFileSync(join(outDir, 'icon-512.png'), makeIcon(512));
writeFileSync(join(outDir, 'icon-180.png'), makeIcon(180));
writeFileSync(join(outDir, 'icon-maskable-512.png'), makeMaskable(512));
console.log('已生成图标 → src/pwa/');