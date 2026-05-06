import type { NoteData, TherapistRecord } from "@/types";

const AUTO_BACKUPS_KEY = "pt_auto_backups";
const MAX_AUTO_BACKUPS = 10;
const PBKDF2_ITERATIONS = 210_000;

export interface BackupPayload {
  app: "PT-NOTE";
  version: 3;
  reason: "manual" | "auto";
  exportedAt: string;
  notes: NoteData[];
  therapists: TherapistRecord[];
}

export interface AutoBackupEntry {
  id: string;
  createdAt: string;
  reason: BackupPayload["reason"];
  notesCount: number;
  therapistsCount: number;
  payload: BackupPayload;
}

interface EncryptedBackupEnvelope {
  format: "pt-note-encrypted-backup";
  version: 1;
  createdAt: string;
  kdf: {
    name: "PBKDF2";
    hash: "SHA-256";
    iterations: number;
    salt: string;
  };
  cipher: {
    name: "AES-GCM";
    iv: string;
    data: string;
  };
}

export function createBackupPayload({
  notes,
  therapists,
  reason,
  now = new Date(),
}: {
  notes: NoteData[];
  therapists: TherapistRecord[];
  reason: BackupPayload["reason"];
  now?: Date;
}): BackupPayload {
  return {
    app: "PT-NOTE",
    version: 3,
    reason,
    exportedAt: now.toISOString(),
    notes,
    therapists,
  };
}

export function validateBackupPayload(payload: unknown): {
  notesCount: number;
  therapistsCount: number;
} {
  if (!payload || typeof payload !== "object") {
    throw new Error("백업 파일 형식이 올바르지 않습니다.");
  }

  const candidate = payload as Partial<BackupPayload>;
  if (candidate.app !== "PT-NOTE" || candidate.version !== 3) {
    throw new Error("PT-NOTE 백업 파일이 아닙니다.");
  }

  if (!Array.isArray(candidate.notes) || !Array.isArray(candidate.therapists)) {
    throw new Error("백업 파일에 노트 또는 치료사 데이터가 없습니다.");
  }

  candidate.notes.forEach((note) => {
    if (!note || typeof note.id !== "string" || typeof note.savedAt !== "string") {
      throw new Error("백업 파일의 노트 데이터가 손상되었습니다.");
    }
  });

  candidate.therapists.forEach((therapist) => {
    if (!therapist || typeof therapist.uid !== "string" || typeof therapist.name !== "string") {
      throw new Error("백업 파일의 치료사 데이터가 손상되었습니다.");
    }
  });

  return {
    notesCount: candidate.notes.length,
    therapistsCount: candidate.therapists.length,
  };
}

export function saveAutoBackup(payload: BackupPayload): AutoBackupEntry {
  validateBackupPayload(payload);
  const entry: AutoBackupEntry = {
    id: `backup-${payload.exportedAt}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: payload.exportedAt,
    reason: payload.reason,
    notesCount: payload.notes.length,
    therapistsCount: payload.therapists.length,
    payload,
  };

  const backups = [entry, ...readAutoBackups()].slice(0, MAX_AUTO_BACKUPS);
  writeAutoBackups(backups);
  return entry;
}

export function listAutoBackups(): AutoBackupEntry[] {
  return readAutoBackups();
}

export function parsePlainBackupText(text: string): BackupPayload {
  try {
    const parsed = JSON.parse(text) as BackupPayload;
    validateBackupPayload(parsed);
    return parsed;
  } catch (err) {
    if (err instanceof Error && err.message.includes("백업")) throw err;
    throw new Error("백업 파일을 읽을 수 없습니다.");
  }
}

export async function encryptBackupPayload(
  payload: BackupPayload,
  passphrase: string
): Promise<string> {
  validateBackupPayload(payload);
  assertPassphrase(passphrase);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(passphrase, salt);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(encoded)
  );

  const envelope: EncryptedBackupEnvelope = {
    format: "pt-note-encrypted-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    kdf: {
      name: "PBKDF2",
      hash: "SHA-256",
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
    },
    cipher: {
      name: "AES-GCM",
      iv: bytesToBase64(iv),
      data: bytesToBase64(new Uint8Array(encrypted)),
    },
  };

  return JSON.stringify(envelope);
}

export async function decryptBackupText(
  encryptedText: string,
  passphrase: string
): Promise<BackupPayload> {
  assertPassphrase(passphrase);
  let envelope: EncryptedBackupEnvelope;
  try {
    envelope = JSON.parse(encryptedText) as EncryptedBackupEnvelope;
  } catch {
    throw new Error("암호화 백업 파일을 읽을 수 없습니다.");
  }

  if (envelope.format !== "pt-note-encrypted-backup" || envelope.version !== 1) {
    throw new Error("지원하지 않는 암호화 백업 파일입니다.");
  }

  try {
    const salt = base64ToBytes(envelope.kdf.salt);
    const iv = base64ToBytes(envelope.cipher.iv);
    const data = base64ToBytes(envelope.cipher.data);
    const key = await deriveAesKey(passphrase, salt);
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(data)
    );
    const payload = JSON.parse(new TextDecoder().decode(decrypted)) as BackupPayload;
    validateBackupPayload(payload);
    return payload;
  } catch (err) {
    if (err instanceof Error && err.message.includes("백업")) throw err;
    throw new Error("비밀번호가 다르거나 백업 파일이 손상되었습니다.");
  }
}

function readAutoBackups(): AutoBackupEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(AUTO_BACKUPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is AutoBackupEntry => {
        return (
          !!entry &&
          typeof entry.id === "string" &&
          typeof entry.createdAt === "string" &&
          !!entry.payload
        );
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch {
    return [];
  }
}

function writeAutoBackups(backups: AutoBackupEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTO_BACKUPS_KEY, JSON.stringify(backups));
}

async function deriveAesKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function assertPassphrase(passphrase: string) {
  if (passphrase.trim().length < 8) {
    throw new Error("백업 비밀번호는 8자 이상이어야 합니다.");
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
