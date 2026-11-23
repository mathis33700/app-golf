// Genere icon-192.png et icon-512.png : drapeau sur green, fond noir pur.
// Sans dependance : rasterisation avec sur-echantillonnage 4x4 et encodage PNG via zlib.
// Usage : node tools/make-icons.js   (depuis la racine du depot)
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// Dessin sur une grille de 512. Tout tient dans la zone sure des icones "maskable" (cercle de 80 %).
const BG = [0, 0, 0], WHITE = [255, 255, 255], RED = [226, 49, 43], CUP = [0, 0, 0];
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const inRect = (x, y, x0, y0, x1, y1) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
function inTri(x, y, a, b, c) {
  const s = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
  const d1 = s([x, y], a, b), d2 = s([x, y], b, c), d3 = s([x, y], c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
}
function colorAt(x, y) {
  // ordre : du fond vers l'avant
  let c = BG;
  if (inEllipse(x, y, 256, 352, 150, 40)) c = WHITE;            // green
  if (inEllipse(x, y, 238, 350, 22, 7)) c = CUP;                // trou
  if (inRect(x, y, 232, 116, 244, 350)) c = WHITE;              // mat
  if (inTri(x, y, [244, 116], [244, 222], [362, 169])) c = RED; // drapeau
  return c;
}

function render(size) {
  const k = 512 / size, SS = 4, px = Buffer.alloc(size * (size * 3 + 1));
  for (let j = 0; j < size; j++) {
    px[j * (size * 3 + 1)] = 0; // filtre PNG "none"
    for (let i = 0; i < size; i++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = colorAt((i + (sx + 0.5) / SS) * k, (j + (sy + 0.5) / SS) * k);
        r += c[0]; g += c[1]; b += c[2];
      }
      const o = j * (size * 3 + 1) + 1 + i * 3, n = SS * SS;
      px[o] = Math.round(r / n); px[o + 1] = Math.round(g / n); px[o + 2] = Math.round(b / n);
    }
  }
  return png(size, size, px);
}

const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = buf => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}

const root = path.join(__dirname, '..');
for (const s of [192, 512]) {
  const out = path.join(root, `icon-${s}.png`);
  fs.writeFileSync(out, render(s));
  console.log(out, fs.statSync(out).size + ' octets');
}
