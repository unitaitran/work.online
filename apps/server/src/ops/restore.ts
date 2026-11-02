// Khôi phục SQLite từ một bản sao lưu. DỪNG server trước khi chạy (xem docs/RUNBOOK.md).
//
//   node dist/restore.js <tệp sao lưu> [--force]
//
// Kiểm tra toàn vẹn bản sao, giữ lại DB hiện tại thành <DB_PATH>.before-restore-<thời gian>,
// rồi chép bản sao vào DB_PATH và chạy migration (nếu bản sao cũ hơn mã nguồn).
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from '../db/database';

export function restoreDatabase(backupFile: string, dbPath: string, force: boolean): string | null {
  if (!existsSync(backupFile)) throw new Error(`backup not found: ${backupFile}`);
  const check = new Database(backupFile, { readonly: true, fileMustExist: true });
  try {
    const result = check.pragma('integrity_check', { simple: true });
    if (result !== 'ok') throw new Error(`backup is corrupt: ${String(result)}`);
  } finally {
    check.close();
  }
  let kept: string | null = null;
  if (existsSync(dbPath)) {
    if (!force) throw new Error(`${dbPath} exists; stop the server and pass --force to replace it`);
    kept = `${dbPath}.before-restore-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    renameSync(dbPath, kept);
    for (const suffix of ['-wal', '-shm']) rmSync(`${dbPath}${suffix}`, { force: true });
  }
  mkdirSync(dirname(dbPath), { recursive: true });
  copyFileSync(backupFile, dbPath);
  const db = new Database(dbPath);
  try {
    runMigrations(db);
  } finally {
    db.close();
  }
  return kept;
}

const isMain = process.argv[1] !== undefined && basename(process.argv[1]).startsWith('restore');
if (isMain) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node dist/restore.js <backup.sqlite> [--force]');
    process.exit(1);
  }
  const dbPath = process.env.DB_PATH ?? 'data/dilam.sqlite';
  const kept = restoreDatabase(file, dbPath, process.argv.includes('--force'));
  console.log(`restored ${file} -> ${dbPath}${kept ? ` (previous database kept at ${kept})` : ''}`);
}
