import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db/database';
import { createSqliteRepositories } from '../db/repositories';
import { createAccountService } from '../game/accounts';
import { backupDatabase, backupName } from './backup';
import { restoreDatabase } from './restore';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) {
    try {
      rmSync(d, { recursive: true, force: true });
    } catch {
      // bỏ qua: thư mục tạm có thể đã bị xoá
    }
  }
});
const temp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'dilam-ops-'));
  dirs.push(d);
  return d;
};

describe('sao lưu và khôi phục', () => {
  it('sao lưu khi server đang mở DB, khôi phục sang máy mới đọc lại đúng dữ liệu', async () => {
    const dir = temp();
    const dbPath = join(dir, 'live.sqlite');
    const db = openDatabase(dbPath);
    const repos = createSqliteRepositories(db);
    const { userId } = createAccountService(repos, { tokenTtlDays: 30 }).create('Asia/Ho_Chi_Minh');
    repos.characters.save(
      userId,
      { name: 'Sao Lưu', appearance: { skin: 1, hairStyle: 'bun', hairColor: 2, outfit: 'suit' } },
      1,
    );
    // DB vẫn đang mở (như server đang chạy) khi sao lưu.
    const file = await backupDatabase({ dbPath, dir: join(dir, 'backups'), keep: 3 });
    db.close();

    const restoredPath = join(temp(), 'new', 'dilam.sqlite');
    expect(restoreDatabase(file, restoredPath, false)).toBeNull();
    const rDb = openDatabase(restoredPath);
    const restored = createSqliteRepositories(rDb);
    expect(restored.characters.get(userId)?.name).toBe('Sao Lưu');
    expect(restored.users.count()).toBe(1);
    rDb.close();
  });

  it('giữ N bản mới nhất; khôi phục đè cần --force và giữ lại DB cũ', async () => {
    const dir = temp();
    const dbPath = join(dir, 'live.sqlite');
    openDatabase(dbPath).close();
    for (let i = 0; i < 5; i += 1) {
      await backupDatabase({
        dbPath,
        dir: join(dir, 'b'),
        keep: 3,
        now: new Date(Date.UTC(2026, 10, 2, 1, i)),
      });
    }
    const files = readdirSync(join(dir, 'b')).sort();
    // Chỉ còn 3 bản mới nhất, mỗi bản đúng một tệp (không kèm -wal/-shm).
    expect(files).toEqual([2, 3, 4].map((i) => backupName(new Date(Date.UTC(2026, 10, 2, 1, i)))));
    const latest = join(dir, 'b', files.at(-1) ?? '');
    expect(() => restoreDatabase(latest, dbPath, false)).toThrow(/--force/);
    const kept = restoreDatabase(latest, dbPath, true);
    expect(kept).toContain('before-restore');
  });
});
