// Mã lưu để chuyển tiến độ sang thiết bị khác: "DLO.<phiên bản>.<dữ liệu base64url>.<crc32>".
// Checksum chỉ để phát hiện mã chép thiếu/sai, KHÔNG phải bảo mật: Phase 4 server
// sẽ kiểm tra lại giới hạn hợp lý khi nhập (không tin dữ liệu từ client).
import { migrateProgress, PROGRESS_VERSION, type ProgressState } from './progress';

const PREFIX = 'DLO';

// ---------- UTF-8 và base64url (không phụ thuộc DOM hay Node) ----------

function utf8Encode(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) bytes.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else
      bytes.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 63),
        0x80 | ((cp >> 6) & 63),
        0x80 | (cp & 63),
      );
  }
  return bytes;
}

function utf8Decode(bytes: readonly number[]): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i] ?? 0;
    let cp: number;
    let extra: number;
    if (b < 0x80) [cp, extra] = [b, 0];
    else if (b >= 0xf0) [cp, extra] = [b & 7, 3];
    else if (b >= 0xe0) [cp, extra] = [b & 15, 2];
    else [cp, extra] = [b & 31, 1];
    for (let k = 1; k <= extra; k += 1) cp = (cp << 6) | ((bytes[i + k] ?? 0) & 63);
    out += String.fromCodePoint(cp);
    i += extra + 1;
  }
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64urlEncode(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = [(n >> 18) & 63, (n >> 12) & 63, (n >> 6) & 63, n & 63];
    const take = i + 2 < bytes.length ? 4 : i + 1 < bytes.length ? 3 : 2;
    for (let k = 0; k < take; k += 1) out += B64.charAt(chars[k] ?? 0);
  }
  return out;
}

function base64urlDecode(text: string): number[] | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i += 4) {
    const chunk = text.slice(i, i + 4);
    let n = 0;
    for (let k = 0; k < 4; k += 1)
      n = (n << 6) | (k < chunk.length ? B64.indexOf(chunk[k] ?? 'A') : 0);
    bytes.push((n >> 16) & 255);
    if (chunk.length > 2) bytes.push((n >> 8) & 255);
    if (chunk.length > 3) bytes.push(n & 255);
  }
  return bytes;
}

// ---------- CRC32 ----------

const CRC_TABLE = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

export function crc32(text: string): string {
  let crc = 0xffffffff;
  for (const byte of utf8Encode(text)) crc = (CRC_TABLE[(crc ^ byte) & 255] ?? 0) ^ (crc >>> 8);
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, '0');
}

// ---------- Mã lưu ----------

export function encodeSaveCode(state: ProgressState): string {
  const body = `${PREFIX}.${String(PROGRESS_VERSION)}.${base64urlEncode(utf8Encode(JSON.stringify(state)))}`;
  return `${body}.${crc32(body)}`;
}

export type SaveCodeError = 'format' | 'checksum' | 'version' | 'data';

export type DecodeResult =
  | { ok: true; state: ProgressState; migratedFrom: number | null }
  | { ok: false; error: SaveCodeError };

export function decodeSaveCode(input: string, now: number): DecodeResult {
  const code = input.trim().replace(/\s+/g, '');
  const parts = code.split('.');
  if (parts.length !== 4 || parts[0] !== PREFIX) return { ok: false, error: 'format' };
  const [, versionText = '', payload = '', checksum = ''] = parts;
  if (crc32(`${PREFIX}.${versionText}.${payload}`) !== checksum.toLowerCase()) {
    return { ok: false, error: 'checksum' };
  }
  const version = Number(versionText);
  if (!Number.isInteger(version) || version < 1 || version > PROGRESS_VERSION) {
    return { ok: false, error: 'version' };
  }
  const bytes = base64urlDecode(payload);
  if (!bytes) return { ok: false, error: 'format' };
  let data: unknown;
  try {
    data = JSON.parse(utf8Decode(bytes));
  } catch {
    return { ok: false, error: 'data' };
  }
  const migrated = migrateProgress(data, now);
  return migrated.ok
    ? { ok: true, state: migrated.state, migratedFrom: migrated.migratedFrom }
    : { ok: false, error: migrated.reason === 'unknown_version' ? 'version' : 'data' };
}
