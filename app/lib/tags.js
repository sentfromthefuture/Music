// Reads the tags embedded in an uploaded audio file (MP3 ID3v2 / ID3v1, WAV INFO) in the browser, so the
// admin reviewing an upload can see what the file itself claims. These are only CLAIMS made by the file:
// they can be missing, copied from another song or faked, so they are evidence for a human, never proof.
// No third-party code: a small parser, nothing is uploaded anywhere except the saved result.
const MAX = 200;
const clean = (s) => String(s || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX);

const ID3_FRAMES = {
  TIT2: 'title', TT2: 'title', TPE1: 'artist', TP1: 'artist', TALB: 'album', TAL: 'album',
  TCOP: 'copyright', TCR: 'copyright', TSRC: 'isrc', TRC: 'isrc', TPUB: 'publisher', TPB: 'publisher',
  TCOM: 'composer', TCM: 'composer', TYER: 'year', TYE: 'year', TDRC: 'year',
};

function decodeText(bytes, enc) {
  try {
    if (enc === 1) { // UTF-16 with byte order mark
      const be = bytes[0] === 0xfe && bytes[1] === 0xff;
      return new TextDecoder(be ? 'utf-16be' : 'utf-16le').decode(bytes.subarray(bytes[0] === 0xff || bytes[0] === 0xfe ? 2 : 0));
    }
    if (enc === 2) return new TextDecoder('utf-16be').decode(bytes);
    if (enc === 3) return new TextDecoder('utf-8').decode(bytes);
    return new TextDecoder('windows-1252').decode(bytes);
  } catch { return ''; }
}

const synchsafe = (b, o) => ((b[o] & 0x7f) << 21) | ((b[o + 1] & 0x7f) << 14) | ((b[o + 2] & 0x7f) << 7) | (b[o + 3] & 0x7f);
const be32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;

function parseId3v2(buf) {
  const out = {};
  if (buf.length < 10 || buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return out; // "ID3"
  const major = buf[3];
  if (major < 2 || major > 4) return out;
  const total = Math.min(synchsafe(buf, 6) + 10, buf.length);
  let pos = 10;
  if (major >= 3 && (buf[5] & 0x40) && total > 14) pos += major === 4 ? synchsafe(buf, 10) : be32(buf, 10) + 4; // extended header
  const idLen = major === 2 ? 3 : 4, hdr = major === 2 ? 6 : 10;
  while (pos + hdr <= total) {
    const id = String.fromCharCode(...buf.subarray(pos, pos + idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break; // padding reached
    const size = major === 2 ? (buf[pos + 3] << 16) | (buf[pos + 4] << 8) | buf[pos + 5] : major === 4 ? synchsafe(buf, pos + 4) : be32(buf, pos + 4);
    const start = pos + hdr, end = start + size;
    if (size <= 0 || end > total) break;
    const key = ID3_FRAMES[id];
    if (key && !out[key]) {
      const text = clean(decodeText(buf.subarray(start + 1, end), buf[start]));
      if (text) out[key] = key === 'year' ? text.slice(0, 4) : text;
    }
    pos = end;
  }
  return out;
}

function parseId3v1(tail) {
  const out = {};
  if (tail.length < 128 || tail[0] !== 0x54 || tail[1] !== 0x41 || tail[2] !== 0x47) return out; // "TAG"
  const f = (a, b) => clean(new TextDecoder('windows-1252').decode(tail.subarray(a, b)));
  if (f(3, 33)) out.title = f(3, 33);
  if (f(33, 63)) out.artist = f(33, 63);
  if (f(63, 93)) out.album = f(63, 93);
  if (f(93, 97)) out.year = f(93, 97);
  return out;
}

const INFO = { INAM: 'title', IART: 'artist', IPRD: 'album', ICOP: 'copyright', ICRD: 'year' };

async function parseWavInfo(file) {
  const out = {};
  const read = async (a, n) => new Uint8Array(await file.slice(a, a + n).arrayBuffer());
  const head = await read(0, 12);
  if (String.fromCharCode(...head.subarray(0, 4)) !== 'RIFF' || String.fromCharCode(...head.subarray(8, 12)) !== 'WAVE') return out;
  let pos = 12, guard = 0;
  while (pos + 8 <= file.size && guard++ < 200) {
    const h = await read(pos, 8);
    const id = String.fromCharCode(...h.subarray(0, 4));
    const size = h[4] | (h[5] << 8) | (h[6] << 16) | (h[7] << 24 >>> 0);
    if (id === 'LIST' && size >= 4 && size < 65536) {
      const body = await read(pos + 8, size);
      if (String.fromCharCode(...body.subarray(0, 4)) === 'INFO') {
        let p = 4;
        while (p + 8 <= body.length) {
          const cid = String.fromCharCode(...body.subarray(p, p + 4));
          const csz = body[p + 4] | (body[p + 5] << 8) | (body[p + 6] << 16) | (body[p + 7] << 24 >>> 0);
          const key = INFO[cid];
          if (key && csz > 0 && p + 8 + csz <= body.length) {
            const text = clean(decodeText(body.subarray(p + 8, p + 8 + csz), 3));
            if (text && !out[key]) out[key] = key === 'year' ? text.slice(0, 4) : text;
          }
          p += 8 + csz + (csz % 2);
        }
      }
    }
    pos += 8 + size + (size % 2);
  }
  return out;
}

// -> { title?, artist?, album?, year?, copyright?, isrc?, publisher?, composer? }  ({} when the file has no tags)
export async function readAudioTags(file) {
  try {
    const first = new Uint8Array(await file.slice(0, 262144).arrayBuffer());
    let tags = parseId3v2(first);
    if (!Object.keys(tags).length && file.size >= 128) {
      const v1 = parseId3v1(new Uint8Array(await file.slice(file.size - 128).arrayBuffer()));
      if (Object.keys(v1).length) tags = v1;
    }
    if (!Object.keys(tags).length) tags = await parseWavInfo(file);
    return tags;
  } catch (e) { console.error('readAudioTags', e); return {}; }
}

// The column that stores the result needs supabase/upload-tags.sql; until it exists nothing is read or saved.
let probe = null;
export function uploadTagsEnabled(supabase) {
  if (!probe) probe = Promise.all(['tracks', 'beats'].map((t) => supabase.from(t).select('upload_tags').limit(1)))
    .then((rs) => rs.every((r) => !r.error)).catch(() => false);
  return probe;
}

// One-tap searches for the admin. Built only from text, never fetched by the app.
export function searchLinks({ title, artist, isrc }) {
  const q = [title, artist].filter(Boolean).join(' ').trim();
  if (!q) return [];
  const e = encodeURIComponent;
  const links = [
    { label: 'Google', href: `https://www.google.com/search?q=${e(`"${title || ''}" ${artist ? `"${artist}"` : ''}`.trim())}` },
    { label: 'YouTube', href: `https://www.youtube.com/results?search_query=${e(q)}` },
    { label: 'MusicBrainz', href: `https://musicbrainz.org/search?query=${e(q)}&type=recording&method=indexed` },
  ];
  if (isrc && /^[A-Za-z]{2}[A-Za-z0-9]{3}\d{7}$/.test(String(isrc).replace(/[-\s]/g, ''))) {
    links.push({ label: 'ISRC', href: `https://musicbrainz.org/isrc/${e(String(isrc).replace(/[-\s]/g, '').toUpperCase())}` });
  }
  return links;
}
