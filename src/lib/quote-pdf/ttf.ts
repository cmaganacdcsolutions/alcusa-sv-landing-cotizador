// Minimal TrueType reader exposing just the slice of the fontkit API that
// pdf-lib's CustomFontEmbedder consumes. Replaces @pdf-lib/fontkit (~384 KB
// gzip) because our three brand fonts are pre-subset static TTFs
// (scripts/subset-pdf-fonts.py): no shaping, kerning or woff decoding needed.
// Trade-off: no GPOS kerning / ligatures (Latin text only).

export interface TtfGlyph {
  id: number;
  codePoints: number[];
  advanceWidth: number;
}

export interface TtfFont {
  unitsPerEm: number;
  postscriptName: string;
  ascent: number;
  descent: number;
  capHeight: number;
  xHeight: number;
  italicAngle: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  cff: boolean;
  post: { isFixedPitch: boolean };
  head: { macStyle: { italic: boolean } };
  characterSet: number[];
  glyphForCodePoint(cp: number): TtfGlyph;
  layout(text: string, features?: unknown): { glyphs: TtfGlyph[] };
}

export interface TtfFontkit {
  create(data: Uint8Array): TtfFont;
}

function parse(data: Uint8Array): TtfFont {
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tables = new Map<string, number>();
  const n = v.getUint16(4);
  for (let i = 0; i < n; i++) {
    const o = 12 + i * 16;
    tables.set(String.fromCharCode(...data.subarray(o, o + 4)), v.getUint32(o + 8));
  }
  const t = (tag: string): number => {
    const off = tables.get(tag);
    if (off === undefined) throw new Error(`TTF: missing ${tag} table`);
    return off;
  };

  const head = t('head');
  const unitsPerEm = v.getUint16(head + 18);
  const bbox = {
    minX: v.getInt16(head + 36),
    minY: v.getInt16(head + 38),
    maxX: v.getInt16(head + 40),
    maxY: v.getInt16(head + 42),
  };
  const italicMac = (v.getUint16(head + 44) & 2) !== 0;
  const hhea = t('hhea');
  const ascent = v.getInt16(hhea + 4);
  const descent = v.getInt16(hhea + 6);
  const numHM = v.getUint16(hhea + 34);
  const hmtx = t('hmtx');
  const post = t('post');
  const italicAngle = v.getInt32(post + 4) / 65536;
  const isFixedPitch = v.getUint32(post + 12) !== 0;
  const os2 = tables.get('OS/2');
  const os2Version = os2 === undefined ? 0 : v.getUint16(os2);
  const xHeight = os2 !== undefined && os2Version >= 2 ? v.getInt16(os2 + 86) : 0;
  const capHeight = os2 !== undefined && os2Version >= 2 ? v.getInt16(os2 + 88) : 0;

  // name id 6 (PostScript name), platform 3 (UTF-16BE) or 1 (Mac Roman/ASCII)
  let postscriptName = '';
  const nameT = t('name');
  const count = v.getUint16(nameT + 2);
  const strOff = nameT + v.getUint16(nameT + 4);
  for (let i = 0; i < count; i++) {
    const r = nameT + 6 + i * 12;
    if (v.getUint16(r + 6) !== 6) continue;
    const len = v.getUint16(r + 8);
    const off = strOff + v.getUint16(r + 10);
    const utf16 = v.getUint16(r) === 3 || v.getUint16(r) === 0;
    let s = '';
    for (let k = 0; k < len; k += utf16 ? 2 : 1) s += String.fromCharCode(utf16 ? v.getUint16(off + k) : data[off + k]!);
    postscriptName = s;
    if (utf16) break;
  }

  // cmap: prefer a Unicode format 4 subtable (what the subsetter emits)
  const cmapT = t('cmap');
  const map = new Map<number, number>();
  const nt = v.getUint16(cmapT + 2);
  let sub = -1;
  for (let i = 0; i < nt; i++) {
    const pid = v.getUint16(cmapT + 4 + i * 8);
    const eid = v.getUint16(cmapT + 6 + i * 8);
    const off = cmapT + v.getUint32(cmapT + 8 + i * 8);
    if (v.getUint16(off) === 4 && ((pid === 3 && eid === 1) || pid === 0)) {
      sub = off;
      break;
    }
  }
  if (sub < 0) throw new Error('TTF: no Unicode cmap format 4');
  const segX2 = v.getUint16(sub + 6);
  const endO = sub + 14;
  const startO = endO + segX2 + 2;
  const deltaO = startO + segX2;
  const rangeO = deltaO + segX2;
  for (let s = 0; s < segX2; s += 2) {
    const end = v.getUint16(endO + s);
    const start = v.getUint16(startO + s);
    const delta = v.getInt16(deltaO + s);
    const ro = v.getUint16(rangeO + s);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let gid: number;
      if (ro === 0) gid = (c + delta) & 0xffff;
      else {
        const g = v.getUint16(rangeO + s + ro + (c - start) * 2);
        gid = g === 0 ? 0 : (g + delta) & 0xffff;
      }
      if (gid !== 0) map.set(c, gid);
    }
  }

  const advance = (gid: number): number => v.getUint16(hmtx + Math.min(gid, numHM - 1) * 4);
  const glyphs = new Map<number, TtfGlyph>();
  const glyphFor = (gid: number, cp?: number): TtfGlyph => {
    let g = glyphs.get(gid);
    if (!g) {
      g = { id: gid, codePoints: cp === undefined ? [] : [cp], advanceWidth: advance(gid) };
      glyphs.set(gid, g);
    }
    return g;
  };

  return {
    unitsPerEm,
    postscriptName,
    ascent,
    descent,
    capHeight,
    xHeight,
    italicAngle,
    bbox,
    cff: false,
    post: { isFixedPitch },
    head: { macStyle: { italic: italicMac } },
    characterSet: [...map.keys()].sort((a, b) => a - b),
    glyphForCodePoint: (cp) => glyphFor(map.get(cp) ?? 0, map.has(cp) ? cp : undefined),
    layout: (text) => ({ glyphs: Array.from(text, (ch) => glyphFor(map.get(ch.codePointAt(0)!) ?? 0, ch.codePointAt(0)!)) }),
  };
}

export const ttfFontkit: TtfFontkit = { create: parse };
