const encoder = new TextEncoder();

const ALGORITHM = 'pbkdf2-sha256';
const ITERATIONS = 100000;
const SALT_BYTES = 16;
const HASH_BYTES = 32;

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

function base64UrlToBytes(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }

  const output: number[] = [];
  let buffer = 0;
  let bitCount = 0;

  for (const char of value) {
    const index = BASE64URL_ALPHABET.indexOf(char);
    if (index === -1) {
      return null;
    }
    buffer = (buffer << 6) | index;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      output.push((buffer >> bitCount) & 0xff);
    }
  }

  return new Uint8Array(output);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) {
    difference |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return difference === 0;
}

async function derivePasswordBits(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS },
    keyMaterial,
    HASH_BYTES * 8
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derivePasswordBits(password, salt);
  return `${ALGORITHM}$${ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(hash)}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, iterationsText, saltEncoded, hashEncoded] = encoded.split('$');
  if (algorithm !== ALGORITHM || iterationsText !== String(ITERATIONS) || !saltEncoded || !hashEncoded) {
    return false;
  }

  const salt = base64UrlToBytes(saltEncoded);
  const expectedHash = base64UrlToBytes(hashEncoded);
  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = await derivePasswordBits(password, salt);
  return constantTimeEqual(actualHash, expectedHash);
}
