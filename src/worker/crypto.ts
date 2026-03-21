/// <reference types="@cloudflare/workers-types" />

// ---------------------------------------------------------------------------
// Session cookie encryption — AES-256-GCM via SubtleCrypto
//
// The session cookie value is:   base64url( IV || AES-GCM-ciphertext )
// where:
//   IV          = 12 random bytes (96-bit, standard for AES-GCM)
//   ciphertext  = AES-256-GCM encrypt( JSON.stringify(payload) )
//   key         = HKDF-SHA-256 derived from COOKIE_ENCRYPTION_KEY secret
//
// HKDF normalises the raw secret to a 256-bit AES key regardless of its
// input length or entropy distribution.
// ---------------------------------------------------------------------------

const HKDF_SALT = new TextEncoder().encode('foxess-session-v1');
const IV_BYTES   = 12; // 96-bit IV, required by AES-GCM spec

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function uint8ToBase64url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToUint8(str: string): Uint8Array {
  const b64    = str.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'HKDF',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: HKDF_SALT, info: new Uint8Array() },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Encrypt `payload` and return a base64url-encoded token suitable for use as
 * a cookie value.  Format: base64url( IV[12] || AES-GCM-ciphertext )
 */
export async function encryptSession(
  secret: string,
  payload: object,
): Promise<string> {
  const key        = await deriveKey(secret);
  const iv         = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plaintext  = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);

  const packed = new Uint8Array(IV_BYTES + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), IV_BYTES);
  return uint8ToBase64url(packed);
}

/**
 * Decrypt a token produced by `encryptSession`.
 * Returns the parsed payload, or `null` if the token is invalid / tampered.
 */
export async function decryptSession<T>(
  secret: string,
  token: string,
): Promise<T | null> {
  try {
    const packed     = base64urlToUint8(token);
    if (packed.length <= IV_BYTES) return null;

    const iv         = packed.slice(0, IV_BYTES);
    const ciphertext = packed.slice(IV_BYTES);
    const key        = await deriveKey(secret);
    const plaintext  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch {
    // Decryption failure (wrong key, truncated, tampered) → treat as no session
    return null;
  }
}
