const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

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
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Brand color + white medical cross, centered on a rounded background.
function drawIcon(size) {
  const px = Buffer.alloc(size * size * 4);
  const bg = [0xfd, 0x7e, 0x14, 0xff]; // #fd7e14
  const white = [0xff, 0xff, 0xff, 0xff];

  // Rounded-corner background radius ~12% of size
  const r = Math.round(size * 0.14);
  const inset = Math.round(size * 0.02);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // Rounded rect test
      const dx = Math.max(Math.abs(x + 0.5 - size / 2) - (size / 2 - inset - r), 0);
      const dy = Math.max(Math.abs(y + 0.5 - size / 2) - (size / 2 - inset - r), 0);
      const outside = dx * dx + dy * dy > r * r;
      // White cross centered
      const t = Math.round(size * 0.16); // arm thickness
      const l = size * 0.64;             // arm length
      const cx = size / 2, cy = size / 2;
      const inH = Math.abs(x - cx) * 2 < t && Math.abs(y - cy) * 2 < l;
      const inV = Math.abs(y - cy) * 2 < t && Math.abs(x - cx) * 2 < l;
      const cross = inH || inV;

      if (!outside) {
        px[i]     = cross ? white[0] : bg[0];
        px[i + 1] = cross ? white[1] : bg[1];
        px[i + 2] = cross ? white[2] : bg[2];
        px[i + 3] = cross ? white[3] : bg[3];
      }
      // outside stays transparent black => transparent
    }
  }
  return px;
}

const outDir = path.join(__dirname, '..', 'icons');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
for (const size of [192, 512]) {
  const png = encodePng(size, drawIcon(size));
  const file = path.join(outDir, 'icon-' + size + '.png');
  fs.writeFileSync(file, png);
  console.log('wrote', file, png.length, 'bytes');
}