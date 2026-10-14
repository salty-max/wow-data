// The client's textures (BLP2: palette, DXT1/3/5 or plain BGRA, the first
// mip level) as RGBA, and RGBA as a PNG: enough to draw a zone's map from its
// tiles without an image library.
import { deflateSync } from "node:zlib";

export type Image = { width: number; height: number; data: Uint8Array };

export function decodeBlp(buf: Uint8Array): Image {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (String.fromCharCode(...buf.subarray(0, 4)) !== "BLP2") throw new Error("not a BLP2 file");
  const encoding = buf[8],
    alphaDepth = buf[9],
    alphaEncoding = buf[10];
  const width = v.getUint32(12, true),
    height = v.getUint32(16, true);
  const offset = v.getUint32(20, true),
    size = v.getUint32(84, true);
  const src = buf.subarray(offset, offset + size);
  const out = new Uint8Array(width * height * 4);
  if (encoding === 1) {
    // a palette (BGRA, its alpha unused) and the alpha after the indices
    const pixels = width * height;
    for (let i = 0; i < pixels; i++) {
      const p = 148 + src[i] * 4;
      out[i * 4] = buf[p + 2];
      out[i * 4 + 1] = buf[p + 1];
      out[i * 4 + 2] = buf[p];
      let a = 255;
      if (alphaDepth === 8) a = src[pixels + i];
      else if (alphaDepth === 4) a = ((src[pixels + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17;
      else if (alphaDepth === 1) a = (src[pixels + (i >> 3)] >> (i & 7)) & 1 ? 255 : 0;
      out[i * 4 + 3] = a;
    }
  } else if (encoding === 3) {
    for (let i = 0; i < width * height; i++) {
      out[i * 4] = src[i * 4 + 2];
      out[i * 4 + 1] = src[i * 4 + 1];
      out[i * 4 + 2] = src[i * 4];
      out[i * 4 + 3] = src[i * 4 + 3];
    }
  } else if (encoding === 2) {
    const kind = alphaEncoding === 0 ? 1 : alphaEncoding === 1 ? 3 : 5;
    const blockSize = kind === 1 ? 8 : 16;
    const bw = Math.max(1, (width + 3) >> 2),
      bh = Math.max(1, (height + 3) >> 2);
    const colors = new Uint8Array(16),
      alphas = new Uint8Array(16);
    for (let by = 0; by < bh; by++)
      for (let bx = 0; bx < bw; bx++) {
        const b = (by * bw + bx) * blockSize;
        alphas.fill(255);
        if (kind === 3) for (let i = 0; i < 16; i++) alphas[i] = ((src[b + (i >> 1)] >> ((i & 1) * 4)) & 15) * 17;
        else if (kind === 5) dxt5Alpha(src, b, alphas);
        const c = kind === 1 ? b : b + 8;
        dxtColors(src, c, colors, kind === 1, alphaDepth > 0);
        for (let i = 0; i < 16; i++) {
          const x = bx * 4 + (i & 3),
            y = by * 4 + (i >> 2);
          if (x >= width || y >= height) continue;
          const sel = (src[c + 4 + (i >> 2)] >> ((i & 3) * 2)) & 3;
          const o = (y * width + x) * 4;
          out[o] = colors[sel * 4];
          out[o + 1] = colors[sel * 4 + 1];
          out[o + 2] = colors[sel * 4 + 2];
          out[o + 3] = kind === 1 ? colors[sel * 4 + 3] : alphas[i];
        }
      }
  } else throw new Error(`BLP encoding ${encoding}`);
  return { width, height, data: out };
}

// a DXT block's four colors (RGBA each). DXT1 with its first color not the
// greater: three, and black (transparent, with alpha); DXT3 and 5: always four
function dxtColors(src: Uint8Array, at: number, out: Uint8Array, dxt1: boolean, punch: boolean) {
  const c0 = src[at] | (src[at + 1] << 8),
    c1 = src[at + 2] | (src[at + 3] << 8);
  const rgb = (c: number) => [((c >> 11) & 31) * 255 / 31, ((c >> 5) & 63) * 255 / 63, (c & 31) * 255 / 31];
  const a = rgb(c0),
    b = rgb(c1);
  const set = (i: number, r: number, g: number, bl: number, al = 255) => {
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = bl;
    out[i * 4 + 3] = al;
  };
  set(0, a[0], a[1], a[2]);
  set(1, b[0], b[1], b[2]);
  if (c0 > c1 || !dxt1) {
    set(2, (2 * a[0] + b[0]) / 3, (2 * a[1] + b[1]) / 3, (2 * a[2] + b[2]) / 3);
    set(3, (a[0] + 2 * b[0]) / 3, (a[1] + 2 * b[1]) / 3, (a[2] + 2 * b[2]) / 3);
  } else {
    set(2, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
    set(3, 0, 0, 0, punch ? 0 : 255);
  }
}

function dxt5Alpha(src: Uint8Array, at: number, out: Uint8Array) {
  const a0 = src[at],
    a1 = src[at + 1];
  const table = [a0, a1];
  if (a0 > a1) for (let i = 1; i < 7; i++) table.push(((7 - i) * a0 + i * a1) / 7);
  else {
    for (let i = 1; i < 5; i++) table.push(((5 - i) * a0 + i * a1) / 5);
    table.push(0, 255);
  }
  // 48 bits of 3-bit indices
  let bits = 0n;
  for (let i = 0; i < 6; i++) bits |= BigInt(src[at + 2 + i]) << BigInt(8 * i);
  for (let i = 0; i < 16; i++) out[i] = table[Number((bits >> BigInt(3 * i)) & 7n)];
}

// RGBA as a PNG (opaque: RGB), each row Paeth-filtered
export function encodePng(img: Image): Uint8Array {
  const { width, height, data } = img;
  let opaque = true;
  for (let i = 3; i < data.length; i += 4)
    if (data[i] !== 255) {
      opaque = false;
      break;
    }
  const bpp = opaque ? 3 : 4;
  const stride = width * bpp;
  const raw = new Uint8Array((stride + 1) * height);
  const row = new Uint8Array(stride),
    prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) for (let k = 0; k < bpp; k++) row[x * bpp + k] = data[(y * width + x) * 4 + k];
    const o = y * (stride + 1);
    raw[o] = 4;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? row[i - bpp] : 0,
        b = prev[i],
        c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c,
        pa = Math.abs(p - a),
        pb = Math.abs(p - b),
        pc = Math.abs(p - c);
      raw[o + 1 + i] = (row[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
    }
    prev.set(row);
  }
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, body.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(body, 8);
    v.setUint32(8 + body.length, Bun.hash.crc32(out.subarray(4, 8 + body.length)) >>> 0);
    return out;
  };
  const ihdr = new Uint8Array(13);
  const h = new DataView(ihdr.buffer);
  h.setUint32(0, width);
  h.setUint32(4, height);
  ihdr.set([8, opaque ? 2 : 6, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 6 })), chunk("IEND", new Uint8Array())];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    png.set(p, at);
    at += p.length;
  }
  return png;
}
