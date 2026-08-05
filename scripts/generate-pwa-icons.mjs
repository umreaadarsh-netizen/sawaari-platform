/**
 * Generates the SAWAARI PWA icons (192×192 and 512×512 PNG) with zero
 * dependencies. Renders the logo — a teal→forest gradient circle with a white
 * lightning bolt and a charcoal curved road with dashed centreline — at 4×
 * supersampling, then encodes a PNG by hand (zlib + CRC32).
 *
 * Run:  node scripts/generate-pwa-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

// ---- minimal PNG encoder --------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 4);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---- logo rendering -------------------------------------------------------

const C_LIGHT = [0x34, 0xd3, 0x99]; // vibrant turquoise/teal (top-left)
const C_DARK = [0x0b, 0x6e, 0x5f]; // deep teal/forest (bottom-right)
const C_ROAD = [0x11, 0x18, 0x26]; // charcoal road surface
const C_DASH = [0xff, 0xff, 0xff]; // white bolt + centreline dashes

const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Render the logo at `size`×`size` RGBA. The circle radius is `radiusFrac` of
 * the canvas so the artwork sits inside the maskable safe zone.
 */
function renderIcon(size, radiusFrac) {
  const S = 4; // supersample factor
  const W = size * S;
  const cx = size / 2;
  const cy = size / 2;
  const R = size * radiusFrac;

  // Lightning bolt, unit coords relative to R, y-down. Sits upper-centre.
  const bolt = [
    [0.10, -0.52],
    [-0.14, 0.04],
    [0.02, 0.04],
    [-0.08, 0.44],
    [0.16, -0.05],
    [0.03, -0.05],
  ].map(([x, y]) => [cx + x * R, cy + y * R]);

  // Curved road: charcoal sector sweeping lower-left → bottom → right (angles
  // in y-down atan2 space: 0° = right, 90° = bottom, 180° = left).
  const A0 = (10 * Math.PI) / 180;
  const A1 = (155 * Math.PI) / 180;
  const roadInner = 0.52 * R;
  const dashR = 0.74 * R; // radius of the dashed centreline
  const dashHalf = 0.05 * R;
  const dashCycle = 0.2 * R; // dash + gap arc length
  const dashOn = 0.11 * R; // dash arc length

  const rgba = Buffer.alloc(W * W * 4);
  for (let y = 0; y < W; y++) {
    const py = y / S;
    for (let x = 0; x < W; x++) {
      const px = x / S;
      const dx = px - cx;
      const dy = py - cy;
      const d = Math.hypot(dx, dy);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      if (d <= R) {
        const t = Math.min(1, Math.max(0, (px / size + py / size) / 2));
        [r, g, b] = mix(C_LIGHT, C_DARK, t);
        a = 255;
        const theta = Math.atan2(dy, dx) < 0 ? Math.atan2(dy, dx) + 2 * Math.PI : Math.atan2(dy, dx);
        if (theta >= A0 && theta <= A1 && d >= roadInner) {
          [r, g, b] = C_ROAD; // road surface
          const s = theta * dashR;
          if ((s % dashCycle) < dashOn && Math.abs(d - dashR) <= dashHalf) {
            [r, g, b] = C_DASH; // dashed centreline
          }
        }
        if (pointInPolygon(px, py, bolt)) {
          [r, g, b] = C_DASH; // bolt sits on top of everything
        }
      }
      const idx = (y * W + x) * 4;
      rgba[idx] = r;
      rgba[idx + 1] = g;
      rgba[idx + 2] = b;
      rgba[idx + 3] = a;
    }
  }

  // Box-downsample S×S blocks to the final size.
  const out = Buffer.alloc(size * size * 4);
  const n = S * S;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let sa = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const idx = ((y * S + sy) * W + (x * S + sx)) * 4;
          sr += rgba[idx];
          sg += rgba[idx + 1];
          sb += rgba[idx + 2];
          sa += rgba[idx + 3];
        }
      }
      const oi = (y * size + x) * 4;
      out[oi] = Math.round(sr / n);
      out[oi + 1] = Math.round(sg / n);
      out[oi + 2] = Math.round(sb / n);
      out[oi + 3] = Math.round(sa / n);
    }
  }
  return encodePng(size, size, out);
}

// ---- write the icons ------------------------------------------------------

mkdirSync(PUBLIC_DIR, { recursive: true });
for (const size of [192, 512]) {
  const png = renderIcon(size, 0.42);
  const file = join(PUBLIC_DIR, `icon-${size}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes, ${size}×${size})`);
}
