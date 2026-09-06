const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------- Minimal 5x7 bitmap font (uppercase + digits + space) ----------
const FONT = {
  A: ["01110","10001","10001","11111","10001","10001","10001"],
  B: ["11110","10001","10001","11110","10001","10001","11110"],
  C: ["01111","10000","10000","10000","10000","10000","01111"],
  D: ["11110","10001","10001","10001","10001","10001","11110"],
  E: ["11111","10000","10000","11110","10000","10000","11111"],
  F: ["11111","10000","10000","11110","10000","10000","10000"],
  G: ["01111","10000","10000","10111","10001","10001","01110"],
  H: ["10001","10001","10001","11111","10001","10001","10001"],
  I: ["11111","00100","00100","00100","00100","00100","11111"],
  J: ["00111","00010","00010","00010","00010","10010","01100"],
  K: ["10001","10010","10100","11000","10100","10010","10001"],
  L: ["10000","10000","10000","10000","10000","10000","11111"],
  M: ["10001","11011","10101","10101","10001","10001","10001"],
  N: ["10001","10001","11001","10101","10011","10001","10001"],
  O: ["01110","10001","10001","10001","10001","10001","01110"],
  P: ["11110","10001","10001","11110","10000","10000","10000"],
  Q: ["01110","10001","10001","10001","10101","10010","01101"],
  R: ["11110","10001","10001","11110","10100","10010","10001"],
  S: ["01111","10000","10000","01110","00001","00001","11110"],
  T: ["11111","00100","00100","00100","00100","00100","00100"],
  U: ["10001","10001","10001","10001","10001","10001","01110"],
  V: ["10001","10001","10001","10001","10001","01010","00100"],
  W: ["10001","10001","10001","10101","10101","11011","10001"],
  X: ["10001","10001","01010","00100","01010","10001","10001"],
  Y: ["10001","10001","01010","00100","00100","00100","00100"],
  Z: ["11111","00001","00010","00100","01000","10000","11111"],
  "0": ["01110","10001","10001","10001","10001","10001","01110"],
  "1": ["00100","01100","00100","00100","00100","00100","01110"],
  "2": ["01110","10001","00001","00010","00100","01000","11111"],
  "3": ["11110","00001","00001","01110","00001","00001","11110"],
  "4": ["00010","00110","01010","10010","11111","00010","00010"],
  "5": ["11111","10000","11110","00001","00001","10001","01110"],
  "6": ["01110","10000","10000","11110","10001","10001","01110"],
  "7": ["11111","00001","00010","00100","01000","01000","01000"],
  "8": ["01110","10001","10001","01110","10001","10001","01110"],
  "9": ["01110","10001","10001","01111","00001","00001","01110"],
  " ": ["00000","00000","00000","00000","00000","00000","00000"],
  "-": ["00000","00000","00000","11111","00000","00000","00000"]
};

const CHAR_W = 5, CHAR_H = 7, SPACING = 1;

function textWidth(str) {
  let w = 0;
  for (let i = 0; i < str.length; i++) {
    if (i > 0) w += SPACING;
    w += CHAR_W;
  }
  return w;
}

function drawTextPixels(str, px, x0, y0, size, ink, on) {
  let cx = x0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const glyph = FONT[ch] || FONT[' '];
    const cell = Math.max(1, Math.round(size / 64));
    for (let row = 0; row < CHAR_H; row++) {
      const bits = glyph[row];
      for (let col = 0; col < CHAR_W; col++) {
        if (bits[col] === '1') {
          for (let dy = 0; dy < cell; dy++) {
            for (let dx = 0; dx < cell; dx++) {
              on(px, cx + col * cell + dx, y0 + row * cell + dy, size, ink);
            }
          }
        }
      }
    }
    cx += (CHAR_W + SPACING) * cell;
  }
}

// ---------- PNG encoder ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 1);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// ---------- Icon drawing ----------
const ORANGE = [0xfd, 0x7e, 0x14, 0xff];
const WHITE  = [0xff, 0xff, 0xff, 0xff];
const GREEN  = [0x16, 0xa0, 0x34, 0xff]; // brighter green, easier to read

function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4); // transparent initially
  const S = size;

  // Background: orange rounded square filling nearly the whole icon
  const radius = Math.round(S * 0.18);
  const inset = Math.round(S * 0.03);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = Math.max(Math.abs(x + 0.5 - S / 2) - (S / 2 - inset - radius), 0);
      const dy = Math.max(Math.abs(y + 0.5 - S / 2) - (S / 2 - inset - radius), 0);
      if (dx * dx + dy * dy <= radius * radius) setPx(px, x, y, S, ORANGE);
    }
  }

  const cx = S / 2;

  // Crate / asset box: lid band + body
  const bodyW = S * 0.40, bodyH = S * 0.26;
  const bodyTop = S * 0.14;
  const bodyX = cx - bodyW / 2;
  const lidH = S * 0.07;
  const crBody = Math.round(S * 0.04);

  // Body (white rounded rect)
  fillRoundedRect(px, bodyX, bodyTop, bodyW, bodyH, crBody, S, WHITE);

  // Lid band (slightly taller on top, orange outline feel): a white tray with a
  // thin shadow line between lid and body
  fillRoundedRect(px, bodyX - S * 0.02, bodyTop - lidH, bodyW + S * 0.04, bodyH + lidH, crBody, S, WHITE);
  // separate the lid from the body with a thin orange line
  fillHLine(px, bodyX, bodyTop + 1, bodyW, Math.max(1, Math.round(S * 0.01)), S, ORANGE);

  // Green check centered in the box body
  const ck = S * 0.15;
  const cy = bodyTop + (bodyH) / 2 + lidH * 0.0;
  drawCheck(px, cx, bodyTop + bodyH / 2 + lidH / 2, ck, S, GREEN);

  // Name: single compact centered line
  const label = 'LUBAGA';
  const cell = Math.max(3, Math.round(S / 68));
  const tw = textWidth(label) * cell;
  const th = CHAR_H * cell;
  const tx = Math.round(cx - tw / 2);
  const ty = Math.round(S * 0.70);
  drawTextPixels(label, px, tx, ty, S, WHITE, (p, gx, gy, sz, ink) => setPx(p, gx, gy, sz, ink));

  // Soft anti-alias pass: 3x3 weighted blur keeps edges smooth, not pixelated
  return blurAlpha(px, S, 1);
}

// Paint a single horizontal line (thickness th) as a rectangle.
function fillHLine(px, x, y, w, th, S, c) {
  const y0 = Math.floor(y), y1 = Math.floor(y + th);
  const x0 = Math.floor(x), x1 = Math.floor(x + w);
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      if (xx >= 0 && yy >= 0 && xx < S && yy < S) setPx(px, xx, yy, S, c);
    }
  }
}

// Simple separable box blur (radius 1) over RGB+A, ignoring transparent px.
function blurAlpha(px, S, radius) {
  const tmp = Buffer.from(px);
  const apply = (buf, src, srcW) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        for (let ch = 0; ch < 4; ch++) {
          let sum = 0, cnt = 0;
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const xx = x + dx, yy = y + dy;
              if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
              const si = (yy * S + xx) * 4;
              if (src[si + 3] < 8) continue; // skip transparent
              sum += src[si + ch];
              cnt++;
            }
          }
          buf[(y * S + x) * 4 + ch] = cnt ? Math.round(sum / cnt) : 0;
        }
      }
    }
  };
  apply(tmp, px, S);
  return tmp;
}

function setPx(px, x, y, S, c) {
  if (x < 0 || y < 0 || x >= S || y >= S) return;
  const i = (Math.floor(y) * S + Math.floor(x)) * 4;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3];
}

function fillRoundedRect(px, x, y, w, h, r, S, c) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.ceil(x + w), y1 = Math.ceil(y + h);
  for (let yy = y0; yy <= y1; yy++) {
    for (let xx = x0; xx <= x1; xx++) {
      if (xx < 0 || yy < 0 || xx >= S || yy >= S) continue;
      const dx = Math.max(Math.abs(xx + 0.5 - (x + w / 2)) - (w / 2 - r), 0);
      const dy = Math.max(Math.abs(yy + 0.5 - (y + h / 2)) - (h / 2 - r), 0);
      if (dx * dx + dy * dy <= r * r) setPx(px, xx, yy, S, c);
    }
  }
}

function drawCheck(px, cx, cy, size, S, c) {
  // A simple check mark drawn as two lines
  const t = Math.max(2, Math.round(S * 0.025));
  // Points of the check: bottom-left, middle, top-right
  const p1x = cx - size, p1y = cy + size * 0.25;
  const p2x = cx - size * 0.15, p2y = cy + size * 0.75;
  const p3x = cx + size, p3y = cy - size * 0.75;
  drawThickLine(px, p1x, p1y, p2x, p2y, t, S, c);
  drawThickLine(px, p2x, p2y, p3x, p3y, t, S, c);
}

function drawThickLine(px, x0, y0, x1, y1, t, S, c) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const steps = Math.max(1, Math.ceil(len));
  for (let i = 0; i <= steps; i++) {
    const px_ = x0 + dx * i / steps;
    const py = y0 + dy * i / steps;
    for (let ox = -t; ox <= t; ox++) {
      for (let oy = -t; oy <= t; oy++) {
        if (ox * ox + oy * oy <= t * t) setPx(px, Math.round(px_ + ox), Math.round(py + oy), S, c);
      }
    }
  }
}

const outDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
for (const size of [192, 512]) {
  const png = encodePng(size, drawIcon(size));
  const file = path.join(outDir, 'icon-' + size + '.png');
  fs.writeFileSync(file, png);
  console.log('wrote', file, png.length, 'bytes');
}
