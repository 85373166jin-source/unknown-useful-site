const encoder = new TextEncoder();

const TOKEN_BYTES = 32;
const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Sessions are valid for 30 days after creation. Task 5 persists
 * sessionExpiresAt() as `sessions.expires_at` and treats a session as expired
 * when `expires_at <= Date.now()` even if `revoked_at` is still NULL.
 */
export const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

export function sessionExpiresAt(now = Date.now()): number {
  return now + SESSION_LIFETIME_MS;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const first = bytes[i] ?? 0;
    const second = bytes[i + 1];
    const third = bytes[i + 2];

    result += BASE64URL_ALPHABET[first >> 2];
    result += BASE64URL_ALPHABET[((first & 0x03) << 4) | ((second ?? 0) >> 4)];
    if (second !== undefined) {
      result += BASE64URL_ALPHABET[((second & 0x0f) << 2) | ((third ?? 0) >> 6)];
    }
    if (third !== undefined) {
      result += BASE64URL_ALPHABET[third & 0x3f];
    }
  }
  return result;
}

async function hmacSha256Base64Url(value: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pepper),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function issueSessionToken(pepper: string): Promise<{ token: string; tokenHash: string }> {
  const tokenBytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
  const token = bytesToBase64Url(tokenBytes);
  const tokenHash = await hmacSha256Base64Url(token, pepper);
  return { token, tokenHash };
}

export async function hashSessionToken(token: string, pepper: string): Promise<string> {
  return hmacSha256Base64Url(token, pepper);
}
