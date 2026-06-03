/* ── Web Crypto API PBKDF2 패스워드 해싱 유틸리티 ──
 *
 * 포맷: "pbkdf2v1:<salt_hex>:<hash_hex>"
 * 레거시 SHA-256 (salt 없는 64자 hex)도 verifyPassword에서 자동 처리.
 * signIn 성공 시 localDataService가 레거시 해시를 PBKDF2로 자동 업그레이드함.
 */

const ITERATIONS = 200_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const V2_PREFIX = "pbkdf2v1";

function bufToHex(buf: Uint8Array): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuf(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

async function pbkdf2Hash(plain: string, salt: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(plain),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    HASH_BITS
  );
  return bufToHex(new Uint8Array(bits));
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await pbkdf2Hash(plain, salt);
  return `${V2_PREFIX}:${bufToHex(salt)}:${hash}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (stored.startsWith(`${V2_PREFIX}:`)) {
    const parts = stored.split(":");
    if (parts.length !== 3) return false;
    const [, saltHex, expectedHash] = parts;
    const actualHash = await pbkdf2Hash(plain, hexToBuf(saltHex));
    return actualHash === expectedHash;
  }

  // 레거시 SHA-256 경로 (prefix 없는 64자 hex)
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plain));
  return bufToHex(new Uint8Array(buf)) === stored;
}

export function isLegacyHash(stored: string): boolean {
  return !stored.startsWith(`${V2_PREFIX}:`);
}
