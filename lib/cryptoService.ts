/* ── AES-GCM localStorage 암호화 서비스 ──
 *
 * 랜덤 256-bit 키를 최초 실행 시 생성해 별도 localStorage 슬롯에 보관.
 * 환자 노트(pt_local_notes)를 암호화해 평문 노출을 방지.
 * 내보내기/가져오기는 localDataService에서 복호화 후 처리해 서식이 유지됨.
 */

const ENC_KEY_STORAGE = "pt_enc_key_v1";

let _cachedKey: CryptoKey | null = null;

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

async function getKey(): Promise<CryptoKey> {
  if (_cachedKey) return _cachedKey;
  if (typeof window === "undefined") throw new Error("browser-only");

  const stored = window.localStorage.getItem(ENC_KEY_STORAGE);
  if (stored) {
    _cachedKey = await crypto.subtle.importKey(
      "raw",
      hexToBuf(stored),
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
    return _cachedKey;
  }

  _cachedKey = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const exported = await crypto.subtle.exportKey("raw", _cachedKey);
  window.localStorage.setItem(ENC_KEY_STORAGE, bufToHex(new Uint8Array(exported)));
  return _cachedKey;
}

export async function encryptData(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv); // 반환값 대신 원본 버퍼 사용 → ArrayBuffer 타입 유지
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return `${bufToHex(iv)}:${bufToHex(new Uint8Array(ciphertext))}`;
}

export async function decryptData(encrypted: string): Promise<string> {
  const sep = encrypted.indexOf(":");
  if (sep !== 24) throw new Error("invalid format"); // IV는 항상 24자 hex (12 bytes)
  const key = await getKey();
  const iv = hexToBuf(encrypted.slice(0, sep));
  const ciphertext = hexToBuf(encrypted.slice(sep + 1));
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

/** 테스트/초기화 시 캐시 무효화 */
export function invalidateEncKeyCache(): void {
  _cachedKey = null;
}
