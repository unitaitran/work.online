// Sao lưu SQLite trực tuyến (không cần dừng server) bằng API backup của SQLite,
// giữ N bản gần nhất, tuỳ chọn chạy lệnh tải lên nơi lưu ngoài máy chủ.
//
//   node dist/backup.js            (dùng DB_PATH, BACKUP_DIR, BACKUP_KEEP, BACKUP_UPLOAD_CMD)
//
// BACKUP_UPLOAD_CMD ví dụ: `rclone copy {file} remote:dilam-backups` ({file} = đường dẫn bản sao).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';

export interface BackupOptions {
  dbPath: string;
  dir: string;
  keep: number;
  now?: Date;
}

/** Tên tệp theo thời gian UTC, sắp xếp được theo chữ: dilam-20261102-1350.sqlite */
export function backupName(now: Date): string {
  const iso = now.toISOString();
  return `dilam-${iso.slice(0, 10).replace(/-/g, '')}-${iso.slice(11, 16).replace(':', '')}${iso.slice(17, 19)}.sqlite`;
}

export async function backupDatabase(options: BackupOptions): Promise<string> {
  mkdirSync(options.dir, { recursive: true });
  const target = join(options.dir, backupName(options.now ?? new Date()));
  const db = new Database(options.dbPath, { readonly: true, fileMustExist: true });
  try {
    await db.backup(target);
  } finally {
    db.close();
  }
  // Bản sao là MỘT tệp (bỏ chế độ WAL) để dễ chép đi nơi khác; kiểm tra toàn vẹn.
  const check = new Database(target);
  try {
    check.pragma('journal_mode = DELETE');
    const result = check.pragma('integrity_check', { simple: true });
    if (result !== 'ok') throw new Error(`backup integrity check failed: ${String(result)}`);
  } finally {
    check.close();
  }
  // Giữ `keep` bản mới nhất.
  const files = readdirSync(options.dir)
    .filter((name) => /^dilam-\d{8}-\d{6}\.sqlite$/.test(name))
    .sort();
  for (const old of files.slice(0, Math.max(0, files.length - options.keep))) {
    rmSync(join(options.dir, old), { force: true });
  }
  return target;
}

/** Chạy lệnh tải lên (không qua shell; {file} thay bằng đường dẫn bản sao). */
export function uploadBackup(command: string, file: string): void {
  const parts = command
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p.replace('{file}', file));
  const [bin, ...args] = parts;
  if (!bin) return;
  execFileSync(bin, args, { stdio: 'inherit' });
}

const isMain = process.argv[1] !== undefined && basename(process.argv[1]).startsWith('backup');
if (isMain) {
  const dbPath = process.env.DB_PATH ?? 'data/dilam.sqlite';
  const dir = process.env.BACKUP_DIR ?? 'backups';
  const keep = Number(process.env.BACKUP_KEEP ?? 14);
  const file = await backupDatabase({ dbPath, dir, keep });
  console.log(`backup written: ${file}`);
  const upload = process.env.BACKUP_UPLOAD_CMD;
  if (upload) uploadBackup(upload, file);
}
