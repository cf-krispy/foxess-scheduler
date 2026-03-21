import type { FoxessApiResponse } from '../../types';

const FOXESS_BASE = 'https://www.foxesscloud.com';

// ---------------------------------------------------------------------------
// Request header builder
//
// FoxESS developer-portal API keys authenticate via three headers:
//   token     — the API key, lowercased
//   timestamp — Unix ms as a string
//   signature — MD5( path + "\r\n" + token + "\r\n" + timestamp )
//               where "\r\n" is the literal 4-character string \r\n, NOT CRLF
//
// SubtleCrypto does not support MD5, so we implement it in pure TypeScript.
// ---------------------------------------------------------------------------

function buildHeaders(apiKey: string, path: string): Record<string, string> {
  const token     = apiKey.toLowerCase();
  const timestamp = Date.now().toString();
  // Literal backslash-r-backslash-n separator (4 chars), not actual CRLF
  const sigInput  = `${path}\\r\\n${token}\\r\\n${timestamp}`;
  const signature = md5(sigInput);

  return {
    'Content-Type': 'application/json',
    'token':        token,
    'timestamp':    timestamp,
    'signature':    signature,
    'lang':         'en',
  };
}

// ---------------------------------------------------------------------------
// GET / POST
// ---------------------------------------------------------------------------

export async function foxessGet<T = unknown>(
  path: string,
  apiKey: string,
  params: Record<string, string> = {},
): Promise<FoxessApiResponse<T>> {
  const url = new URL(`${FOXESS_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), {
    method:  'GET',
    headers: buildHeaders(apiKey, path),
  });

  if (!res.ok) {
    throw new Error(`FoxESS HTTP ${res.status} on ${path}: ${await res.text()}`);
  }
  return res.json() as Promise<FoxessApiResponse<T>>;
}

export async function foxessPost<T = unknown>(
  path: string,
  apiKey: string,
  body: Record<string, unknown>,
): Promise<FoxessApiResponse<T>> {
  const res = await fetch(`${FOXESS_BASE}${path}`, {
    method:  'POST',
    headers: buildHeaders(apiKey, path),
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`FoxESS HTTP ${res.status} on ${path}: ${await res.text()}`);
  }
  return res.json() as Promise<FoxessApiResponse<T>>;
}

// ---------------------------------------------------------------------------
// Pure-TypeScript MD5 (RFC 1321)
// Cloudflare Workers' SubtleCrypto does not expose MD5.
// Input must be ASCII (FoxESS paths, lowercased API keys, digit timestamps).
// ---------------------------------------------------------------------------

function md5(str: string): string {
  function safeAdd(x: number, y: number): number {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }

  function rol(n: number, s: number): number {
    return (n << s) | (n >>> (32 - s));
  }

  function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return safeAdd(rol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }

  /* eslint-disable @typescript-eslint/no-shadow */
  const ff = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn((b & c) | (~b & d), a, b, x, s, t);
  const gg = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn((b & d) | (c & ~d), a, b, x, s, t);
  const hh = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn(b ^ c ^ d, a, b, x, s, t);
  const ii = (a: number, b: number, c: number, d: number, x: number, s: number, t: number) =>
    cmn(c ^ (b | ~d), a, b, x, s, t);
  /* eslint-enable */

  // Convert ASCII string → array of little-endian 32-bit words
  function str2words(s: string): number[] {
    const w: number[] = [];
    for (let i = 0; i < s.length * 8; i += 8) {
      w[i >> 5] = (w[i >> 5] ?? 0) | ((s.charCodeAt(i / 8) & 0xff) << (i % 32));
    }
    return w;
  }

  // Convert array of 32-bit words → lowercase hex string
  function words2hex(w: number[]): string {
    const h = '0123456789abcdef';
    let out = '';
    for (let i = 0; i < w.length * 4; i++) {
      out += h[(w[i >> 2] >> ((i % 4) * 8 + 4)) & 0xf] +
             h[(w[i >> 2] >> ((i % 4) * 8))     & 0xf];
    }
    return out;
  }

  const bitLen = str.length * 8;
  const x = str2words(str);

  // Append MD5 padding: 0x80 bit, then zeros, then 64-bit little-endian length
  x[bitLen >> 5] = (x[bitLen >> 5] ?? 0) | (0x80 << (bitLen % 32));
  x[(((bitLen + 64) >>> 9) << 4) + 14] = bitLen;

  let a =  1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d =  271733878;

  for (let i = 0; i < x.length; i += 16) {
    const oa = a, ob = b, oc = c, od = d;

    // Round 1 — FF
    a = ff(a,b,c,d, x[i],     7, -680876936);   d = ff(d,a,b,c, x[i+1], 12, -389564586);
    c = ff(c,d,a,b, x[i+2],  17,  606105819);   b = ff(b,c,d,a, x[i+3], 22,-1044525330);
    a = ff(a,b,c,d, x[i+4],   7, -176418897);   d = ff(d,a,b,c, x[i+5], 12, 1200080426);
    c = ff(c,d,a,b, x[i+6],  17,-1473231341);   b = ff(b,c,d,a, x[i+7], 22,  -45705983);
    a = ff(a,b,c,d, x[i+8],   7, 1770035416);   d = ff(d,a,b,c, x[i+9], 12,-1958414417);
    c = ff(c,d,a,b, x[i+10], 17,     -42063);   b = ff(b,c,d,a, x[i+11],22,-1990404162);
    a = ff(a,b,c,d, x[i+12],  7, 1804603682);   d = ff(d,a,b,c, x[i+13],12,  -40341101);
    c = ff(c,d,a,b, x[i+14], 17,-1502002290);   b = ff(b,c,d,a, x[i+15],22, 1236535329);

    // Round 2 — GG
    a = gg(a,b,c,d, x[i+1],   5, -165796510);   d = gg(d,a,b,c, x[i+6],  9,-1069501632);
    c = gg(c,d,a,b, x[i+11], 14,  643717713);   b = gg(b,c,d,a, x[i],   20, -373897302);
    a = gg(a,b,c,d, x[i+5],   5, -701558691);   d = gg(d,a,b,c, x[i+10], 9,   38016083);
    c = gg(c,d,a,b, x[i+15], 14, -660478335);   b = gg(b,c,d,a, x[i+4], 20, -405537848);
    a = gg(a,b,c,d, x[i+9],   5,  568446438);   d = gg(d,a,b,c, x[i+14], 9,-1019803690);
    c = gg(c,d,a,b, x[i+3],  14, -187363961);   b = gg(b,c,d,a, x[i+8], 20, 1163531501);
    a = gg(a,b,c,d, x[i+13],  5,-1444681467);   d = gg(d,a,b,c, x[i+2],  9,  -51403784);
    c = gg(c,d,a,b, x[i+7],  14, 1735328473);   b = gg(b,c,d,a, x[i+12],20,-1926607734);

    // Round 3 — HH
    a = hh(a,b,c,d, x[i+5],   4,    -378558);   d = hh(d,a,b,c, x[i+8], 11,-2022574463);
    c = hh(c,d,a,b, x[i+11], 16, 1839030562);   b = hh(b,c,d,a, x[i+14],23,  -35309556);
    a = hh(a,b,c,d, x[i+1],   4,-1530992060);   d = hh(d,a,b,c, x[i+4], 11, 1272893353);
    c = hh(c,d,a,b, x[i+7],  16, -155497632);   b = hh(b,c,d,a, x[i+10],23,-1094730640);
    a = hh(a,b,c,d, x[i+13],  4,  681279174);   d = hh(d,a,b,c, x[i],   11, -358537222);
    c = hh(c,d,a,b, x[i+3],  16, -722521979);   b = hh(b,c,d,a, x[i+6], 23,   76029189);
    a = hh(a,b,c,d, x[i+9],   4, -640364487);   d = hh(d,a,b,c, x[i+12],11, -421815835);
    c = hh(c,d,a,b, x[i+15], 16,  530742520);   b = hh(b,c,d,a, x[i+2], 23, -995338651);

    // Round 4 — II
    a = ii(a,b,c,d, x[i],     6, -198630844);   d = ii(d,a,b,c, x[i+7], 10, 1126891415);
    c = ii(c,d,a,b, x[i+14], 15,-1416354905);   b = ii(b,c,d,a, x[i+5], 21,  -57434055);
    a = ii(a,b,c,d, x[i+12],  6, 1700485571);   d = ii(d,a,b,c, x[i+3], 10,-1894986606);
    c = ii(c,d,a,b, x[i+10], 15,   -1051523);   b = ii(b,c,d,a, x[i+1], 21,-2054922799);
    a = ii(a,b,c,d, x[i+8],   6, 1873313359);   d = ii(d,a,b,c, x[i+15],10,  -30611744);
    c = ii(c,d,a,b, x[i+6],  15,-1560198380);   b = ii(b,c,d,a, x[i+13],21, 1309151649);
    a = ii(a,b,c,d, x[i+4],   6, -145523070);   d = ii(d,a,b,c, x[i+11],10,-1120210379);
    c = ii(c,d,a,b, x[i+2],  15,  718787259);   b = ii(b,c,d,a, x[i+9], 21, -343485551);

    a = safeAdd(a, oa); b = safeAdd(b, ob);
    c = safeAdd(c, oc); d = safeAdd(d, od);
  }

  return words2hex([a, b, c, d]);
}
