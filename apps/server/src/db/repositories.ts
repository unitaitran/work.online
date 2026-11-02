// Lớp truy cập dữ liệu. Logic game chỉ thấy các interface ở đây; đổi sang Postgres thì viết
// bản cài đặt khác cho cùng interface.
import {
  appearanceSchema,
  levelFor,
  migrateProgress,
  type ProgressState,
  type Profile,
} from '@dilam/shared';
import type { Db } from './database';

export interface UserRecord {
  id: string;
  tokenHash: string;
  tokenExpiresAt: number;
  recoveryHash: string;
  timeZone: string;
  createdAt: number;
  lastSeenAt: number;
}

export interface UserRepo {
  create(user: UserRecord): void;
  byTokenHash(tokenHash: string): UserRecord | null;
  byRecoveryHash(recoveryHash: string): UserRecord | null;
  byId(id: string): UserRecord | null;
  setToken(id: string, tokenHash: string, expiresAt: number): void;
  touch(id: string, now: number, tokenExpiresAt: number): void;
  setTimeZone(id: string, timeZone: string): void;
  setRecovery(id: string, recoveryHash: string): void;
  delete(id: string): void;
  count(): number;
}

export interface CharacterRepo {
  get(userId: string): Profile | null;
  save(userId: string, profile: Profile, now: number): void;
  /** Tên của nhiều người (để hiển thị xếp hạng, danh bạ). */
  names(userIds: readonly string[]): Map<string, string>;
}

export interface ProgressRecord {
  state: ProgressState;
  imported: boolean;
}

export interface ProgressRepo {
  get(userId: string): ProgressRecord | null;
  save(userId: string, state: ProgressState, now: number): void;
  markImported(userId: string): void;
}

export interface ActivityLogEntry {
  userId: string;
  at: number;
  kind: string;
  xp: number;
  coins: number;
  detail?: unknown;
}

export interface ActivityLogRepo {
  add(entry: ActivityLogEntry): void;
  recent(userId: string, limit: number): ActivityLogEntry[];
}

export interface ActionRepo {
  /** Ghi khoá hành động; false nếu đã có (gửi trùng). */
  claim(userId: string, actionId: string, at: number): boolean;
  pruneBefore(at: number): void;
}

export interface Repositories {
  users: UserRepo;
  characters: CharacterRepo;
  progress: ProgressRepo;
  activity: ActivityLogRepo;
  actions: ActionRepo;
  /** Chạy nhiều thao tác trong một transaction. */
  transaction<T>(fn: () => T): T;
}

// ---------------------------------------------------------------------------
// SQLite
// ---------------------------------------------------------------------------

interface UserRow {
  id: string;
  token_hash: string;
  token_expires_at: number;
  recovery_hash: string;
  time_zone: string;
  created_at: number;
  last_seen_at: number;
}

const toUser = (row: UserRow | undefined): UserRecord | null =>
  row
    ? {
        id: row.id,
        tokenHash: row.token_hash,
        tokenExpiresAt: row.token_expires_at,
        recoveryHash: row.recovery_hash,
        timeZone: row.time_zone,
        createdAt: row.created_at,
        lastSeenAt: row.last_seen_at,
      }
    : null;

export function createSqliteRepositories(db: Db): Repositories {
  const q = {
    userInsert: db.prepare(
      `INSERT INTO users (id, token_hash, token_expires_at, recovery_hash, time_zone, created_at, last_seen_at)
       VALUES (@id, @tokenHash, @tokenExpiresAt, @recoveryHash, @timeZone, @createdAt, @lastSeenAt)`,
    ),
    userByToken: db.prepare('SELECT * FROM users WHERE token_hash = ?'),
    userByRecovery: db.prepare('SELECT * FROM users WHERE recovery_hash = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userSetToken: db.prepare('UPDATE users SET token_hash = ?, token_expires_at = ? WHERE id = ?'),
    userTouch: db.prepare('UPDATE users SET last_seen_at = ?, token_expires_at = ? WHERE id = ?'),
    userSetTz: db.prepare('UPDATE users SET time_zone = ? WHERE id = ?'),
    userSetRecovery: db.prepare('UPDATE users SET recovery_hash = ? WHERE id = ?'),
    userDelete: db.prepare('DELETE FROM users WHERE id = ?'),
    userCount: db.prepare('SELECT COUNT(*) AS n FROM users'),
    charGet: db.prepare('SELECT name, appearance FROM characters WHERE user_id = ?'),
    charSave: db.prepare(
      `INSERT INTO characters (user_id, name, appearance, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET name = excluded.name, appearance = excluded.appearance,
       updated_at = excluded.updated_at`,
    ),
    progGet: db.prepare('SELECT data, imported FROM progress WHERE user_id = ?'),
    progSave: db.prepare(
      `INSERT INTO progress (user_id, data, xp, level, coins, reputation, branch, department, streak, updated_at)
       VALUES (@userId, @data, @xp, @level, @coins, @reputation, @branch, @department, @streak, @now)
       ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, xp = excluded.xp, level = excluded.level,
       coins = excluded.coins, reputation = excluded.reputation, branch = excluded.branch,
       department = excluded.department, streak = excluded.streak, updated_at = excluded.updated_at`,
    ),
    progImported: db.prepare('UPDATE progress SET imported = 1 WHERE user_id = ?'),
    logAdd: db.prepare(
      'INSERT INTO activity_log (user_id, at, kind, xp, coins, detail) VALUES (?, ?, ?, ?, ?, ?)',
    ),
    actionClaim: db.prepare(
      'INSERT OR IGNORE INTO processed_actions (user_id, action_id, at) VALUES (?, ?, ?)',
    ),
    actionPrune: db.prepare('DELETE FROM processed_actions WHERE at < ?'),
    logRecent: db.prepare(
      'SELECT user_id, at, kind, xp, coins, detail FROM activity_log WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    ),
  };

  const users: UserRepo = {
    create(user) {
      q.userInsert.run(user);
    },
    byTokenHash: (hash) => toUser(q.userByToken.get(hash) as UserRow | undefined),
    byRecoveryHash: (hash) => toUser(q.userByRecovery.get(hash) as UserRow | undefined),
    byId: (id) => toUser(q.userById.get(id) as UserRow | undefined),
    setToken(id, tokenHash, expiresAt) {
      q.userSetToken.run(tokenHash, expiresAt, id);
    },
    touch(id, now, expiresAt) {
      q.userTouch.run(now, expiresAt, id);
    },
    setTimeZone(id, timeZone) {
      q.userSetTz.run(timeZone, id);
    },
    setRecovery(id, recoveryHash) {
      q.userSetRecovery.run(recoveryHash, id);
    },
    delete(id) {
      q.userDelete.run(id);
    },
    count: () => (q.userCount.get() as { n: number }).n,
  };

  const characters: CharacterRepo = {
    get(userId) {
      const row = q.charGet.get(userId) as { name: string; appearance: string } | undefined;
      if (!row) return null;
      const appearance = appearanceSchema.safeParse(JSON.parse(row.appearance));
      return appearance.success ? { name: row.name, appearance: appearance.data } : null;
    },
    save(userId, profile, now) {
      q.charSave.run(userId, profile.name, JSON.stringify(profile.appearance), now);
    },
    names(userIds) {
      const result = new Map<string, string>();
      if (userIds.length === 0) return result;
      const placeholders = userIds.map(() => '?').join(',');
      const rows = db
        .prepare(`SELECT user_id, name FROM characters WHERE user_id IN (${placeholders})`)
        .all(...userIds) as { user_id: string; name: string }[];
      for (const row of rows) result.set(row.user_id, row.name);
      return result;
    },
  };

  const progress: ProgressRepo = {
    get(userId) {
      const row = q.progGet.get(userId) as { data: string; imported: number } | undefined;
      if (!row) return null;
      const migrated = migrateProgress(JSON.parse(row.data), Date.now());
      if (!migrated.ok) throw new Error(`corrupt progress for user`);
      return { state: migrated.state, imported: row.imported === 1 };
    },
    save(userId, state, now) {
      q.progSave.run({
        userId,
        data: JSON.stringify(state),
        xp: state.xp,
        level: levelFor(state.xp),
        coins: state.coins,
        reputation: state.reputation,
        branch: state.branch,
        department: state.department,
        streak: state.checkIn.streak,
        now,
      });
    },
    markImported(userId) {
      q.progImported.run(userId);
    },
  };

  const activity: ActivityLogRepo = {
    add(entry) {
      q.logAdd.run(
        entry.userId,
        entry.at,
        entry.kind,
        entry.xp,
        entry.coins,
        entry.detail === undefined ? null : JSON.stringify(entry.detail),
      );
    },
    recent(userId, limit) {
      const rows = q.logRecent.all(userId, limit) as {
        user_id: string;
        at: number;
        kind: string;
        xp: number;
        coins: number;
        detail: string | null;
      }[];
      return rows.map((row) => ({
        userId: row.user_id,
        at: row.at,
        kind: row.kind,
        xp: row.xp,
        coins: row.coins,
        detail: row.detail === null ? undefined : (JSON.parse(row.detail) as unknown),
      }));
    },
  };

  const actions: ActionRepo = {
    claim: (userId, actionId, at) => q.actionClaim.run(userId, actionId, at).changes === 1,
    pruneBefore(at) {
      q.actionPrune.run(at);
    },
  };

  return {
    users,
    characters,
    progress,
    activity,
    actions,
    transaction: (fn) => db.transaction(fn)(),
  };
}
