/* ── Web Crypto API PBKDF2 패스워드 해싱 유틸리티 ──
 *
 * 저장 포맷 (세 자매 앱 공통): "pbkdf2v1:<salt_hex>:<hash_hex>" (200k iterations)
 * 검증만 지원하는 구형 포맷 — signIn 성공 시 localDataService 가 pbkdf2v1 로 자동 업그레이드:
 *  - "pbkdf2$<iterations>$<salt_b64>$<hash_b64>" (구 Antigravity 포맷)
 *  - 솔트 없는 64자 hex SHA-256 (최초 버전)
 */

const ITERATIONS = 200_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;
const V2_PREFIX = "pbkdf2v1";
const B64_PREFIX = "pbkdf2$";
// 가져온 백업의 해시가 반복 횟수를 지정하므로 너무 약하거나(오프라인 공격) 너무 큰(로그인 멈춤) 값은 거부
const MIN_ITERATIONS = 100_000;
const MAX_ITERATIONS = 1_000_000;

function bufToHex(buf: Uint8Array<ArrayBuffer>): string {
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuf(hex: string): Uint8Array<ArrayBuffer> {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    arr[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return arr;
}

function b64ToBuf(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

async function pbkdf2Bits(plain: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array<ArrayBuffer>> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(plain),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    keyMaterial,
    HASH_BITS
  );
  return new Uint8Array(bits);
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashPassword(plain: string): Promise<string> {
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt); // 반환값 대신 원본 버퍼 사용 → ArrayBuffer 타입 유지
  const hash = await pbkdf2Bits(plain, salt, ITERATIONS);
  return `${V2_PREFIX}:${bufToHex(salt)}:${bufToHex(hash)}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  // 빈 해시 = 비밀번호 미설정 계정 (v3 백업 복원 등) — 항상 로그인 거부
  if (!stored) return false;

  if (stored.startsWith(`${V2_PREFIX}:`)) {
    const parts = stored.split(":");
    if (parts.length !== 3 || !/^[0-9a-f]{32}$/i.test(parts[1]) || !/^[0-9a-f]{64}$/i.test(parts[2])) return false;
    const actual = await pbkdf2Bits(plain, hexToBuf(parts[1]), ITERATIONS);
    return constantTimeEqual(actual, hexToBuf(parts[2]));
  }

  if (stored.startsWith(B64_PREFIX)) {
    const parts = stored.split("$");
    if (parts.length !== 4 || !/^\d+$/.test(parts[1])) return false;
    const iterations = Number(parts[1]);
    if (iterations < MIN_ITERATIONS || iterations > MAX_ITERATIONS) return false;
    let salt: Uint8Array<ArrayBuffer>, expected: Uint8Array<ArrayBuffer>;
    try { salt = b64ToBuf(parts[2]); expected = b64ToBuf(parts[3]); } catch { return false; }
    if (expected.length !== HASH_BITS / 8) return false;
    return constantTimeEqual(await pbkdf2Bits(plain, salt, iterations), expected);
  }

  // 레거시 SHA-256 경로 (prefix 없는 64자 hex)
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(plain));
  return bufToHex(new Uint8Array(buf)) === stored;
}

/** pbkdf2v1 이 아닌 모든 해시 — 로그인 성공 시 pbkdf2v1 로 재해싱 대상 */
export function isLegacyHash(stored: string): boolean {
  return !stored.startsWith(`${V2_PREFIX}:`);
}
