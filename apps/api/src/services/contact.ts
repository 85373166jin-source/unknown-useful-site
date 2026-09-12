const encoder = new TextEncoder();

const BASE64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

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

export function normalizePhone(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const digits = trimmed.replace(/[^\d]/g, '');
  if (!digits) {
    return null;
  }

  // China mobile numbers are 11 digits. Accept an optional leading +86 country
  // code and drop it so callers always store the canonical national number.
  if (digits.length === 13 && digits.startsWith('86')) {
    return digits.slice(2);
  }
  if (digits.length === 11) {
    return digits;
  }
  return null;
}

export function normalizeEmail(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return normalized ? normalized : null;
}

export async function hmacContact(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

export function maskPhone(value: string): string {
  const digits = value.replace(/[^\d]/g, '');
  if (digits.length < 7) {
    return digits ? `${digits.slice(0, 1)}****` : '****';
  }
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

export function maskEmail(value: string): string {
  const atIndex = value.lastIndexOf('@');
  if (atIndex <= 0) {
    return value ? `${value.slice(0, 1)}***` : '***';
  }
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  const visibleLocal = local.length > 2 ? local.slice(0, 2) : local.slice(0, 1);
  return `${visibleLocal}***@${domain}`;
}
