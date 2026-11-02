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

export interface LedgerEntry {
  at: number;
  delta: number;
  reason: string;
  balance: number;
}

export interface LedgerRepo {
  add(userId: string, at: number, delta: number, reason: string, balance: number): void;
  sum(userId: string): number;
  recent(userId: string, limit: number): LedgerEntry[];
}

export interface InventoryRepo {
  owned(userId: string): string[];
  has(userId: string, itemId: string): boolean;
  /** false nếu đã có món này. */
  add(userId: string, itemId: string, at: number): boolean;
  equipped(userId: string): string[];
  setEquipped(userId: string, items: readonly string[]): void;
}

export interface RoomPlant {
  id: number;
  x: number;
  z: number;
  kind: number;
  ownerName: string;
  at: number;
}

export interface PlantRepo {
  list(roomKind: string): RoomPlant[];
  add(roomKind: string, plant: Omit<RoomPlant, 'id'>): RoomPlant;
  /** Giữ tối đa `max` cây mới nhất; trả về id các cây bị bỏ. */
  trim(roomKind: string, max: number): number[];
}

export interface LeaderboardEntry {
  userId: string;
  name: string;
  xp: number;
  totalXp: number;
  branch: string | null;
}

export interface SocialRepo {
  setLeaderboardHidden(userId: string, hidden: boolean): void;
  isLeaderboardHidden(userId: string): boolean;
  /** XP kiếm được từ `since` (ms), không tính người đã ẩn, lọc theo phòng ban nếu có. */
  leaderboard(since: number, department: string | null): LeaderboardEntry[];
}

export interface WallRow {
  id: number;
  userId: string;
  day: string;
  text: string;
  createdAt: number;
  reports: number;
  hidden: boolean;
}

export interface WallRepo {
  /** false nếu hôm nay người này đã đăng. */
  add(userId: string, day: string, text: string, at: number): boolean;
  visible(limit: number): WallRow[];
  reported(limit: number): WallRow[];
  get(id: number): WallRow | null;
  reportedBy(userId: string, ids: readonly number[]): Set<number>;
  /** Ghi báo cáo; trả số báo cáo mới, hoặc null nếu đã báo cáo rồi. */
  report(postId: number, reporterId: string, at: number): number | null;
  setHidden(id: number, hidden: boolean): void;
  delete(id: number): void;
}

export interface Repositories {
  users: UserRepo;
  characters: CharacterRepo;
  progress: ProgressRepo;
  activity: ActivityLogRepo;
  actions: ActionRepo;
  ledger: LedgerRepo;
  inventory: InventoryRepo;
  plants: PlantRepo;
  social: SocialRepo;
  wall: WallRepo;
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
    ledgerAdd: db.prepare(
      'INSERT INTO coin_ledger (user_id, at, delta, reason, balance) VALUES (?, ?, ?, ?, ?)',
    ),
    ledgerSum: db.prepare('SELECT COALESCE(SUM(delta), 0) AS s FROM coin_ledger WHERE user_id = ?'),
    ledgerRecent: db.prepare(
      'SELECT at, delta, reason, balance FROM coin_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    ),
    invOwned: db.prepare('SELECT item_id FROM inventory WHERE user_id = ? ORDER BY acquired_at'),
    invHas: db.prepare('SELECT 1 FROM inventory WHERE user_id = ? AND item_id = ?'),
    invAdd: db.prepare(
      'INSERT OR IGNORE INTO inventory (user_id, item_id, acquired_at) VALUES (?, ?, ?)',
    ),
    equipGet: db.prepare('SELECT items FROM equipment WHERE user_id = ?'),
    equipSet: db.prepare(
      'INSERT INTO equipment (user_id, items) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET items = excluded.items',
    ),
    plantList: db.prepare(
      'SELECT id, x, z, kind, owner_name, at FROM room_plants WHERE room_kind = ? ORDER BY id',
    ),
    plantAdd: db.prepare(
      'INSERT INTO room_plants (room_kind, x, z, kind, owner_name, at) VALUES (?, ?, ?, ?, ?, ?)',
    ),
    plantOld: db.prepare(
      'SELECT id FROM room_plants WHERE room_kind = ? ORDER BY id DESC LIMIT -1 OFFSET ?',
    ),
    plantDelete: db.prepare('DELETE FROM room_plants WHERE id = ?'),
    setHidden: db.prepare('UPDATE users SET leaderboard_hidden = ? WHERE id = ?'),
    getHidden: db.prepare('SELECT leaderboard_hidden AS h FROM users WHERE id = ?'),
    board: db.prepare(
      `SELECT a.user_id AS userId, COALESCE(c.name, '') AS name, SUM(a.xp) AS xp,
              p.xp AS totalXp, p.branch AS branch
       FROM activity_log a
       JOIN users u ON u.id = a.user_id
       JOIN progress p ON p.user_id = a.user_id
       LEFT JOIN characters c ON c.user_id = a.user_id
       WHERE a.at >= @since AND a.xp > 0 AND u.leaderboard_hidden = 0
         AND (@department IS NULL OR p.department = @department)
       GROUP BY a.user_id
       ORDER BY xp DESC, a.user_id
       LIMIT 500`,
    ),
    wallAdd: db.prepare(
      'INSERT OR IGNORE INTO wall_posts (user_id, day, text, created_at) VALUES (?, ?, ?, ?)',
    ),
    wallVisible: db.prepare('SELECT * FROM wall_posts WHERE hidden = 0 ORDER BY id DESC LIMIT ?'),
    wallReported: db.prepare(
      'SELECT * FROM wall_posts WHERE reports > 0 ORDER BY hidden DESC, reports DESC, id DESC LIMIT ?',
    ),
    wallGet: db.prepare('SELECT * FROM wall_posts WHERE id = ?'),
    wallReport: db.prepare(
      'INSERT OR IGNORE INTO wall_reports (post_id, reporter_id, at) VALUES (?, ?, ?)',
    ),
    wallBump: db.prepare('UPDATE wall_posts SET reports = reports + 1 WHERE id = ?'),
    wallSetHidden: db.prepare('UPDATE wall_posts SET hidden = ? WHERE id = ?'),
    wallDelete: db.prepare('DELETE FROM wall_posts WHERE id = ?'),
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

  const ledger: LedgerRepo = {
    add(userId, at, delta, reason, balance) {
      q.ledgerAdd.run(userId, at, delta, reason, balance);
    },
    sum: (userId) => (q.ledgerSum.get(userId) as { s: number }).s,
    recent: (userId, limit) => q.ledgerRecent.all(userId, limit) as LedgerEntry[],
  };

  const inventory: InventoryRepo = {
    owned: (userId) => (q.invOwned.all(userId) as { item_id: string }[]).map((row) => row.item_id),
    has: (userId, itemId) => q.invHas.get(userId, itemId) !== undefined,
    add: (userId, itemId, at) => q.invAdd.run(userId, itemId, at).changes === 1,
    equipped(userId) {
      const row = q.equipGet.get(userId) as { items: string } | undefined;
      if (!row) return [];
      const parsed = JSON.parse(row.items) as unknown;
      return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
    },
    setEquipped(userId, items) {
      q.equipSet.run(userId, JSON.stringify(items));
    },
  };

  const plants: PlantRepo = {
    list: (roomKind) =>
      (
        q.plantList.all(roomKind) as {
          id: number;
          x: number;
          z: number;
          kind: number;
          owner_name: string;
          at: number;
        }[]
      ).map((row) => ({
        id: row.id,
        x: row.x,
        z: row.z,
        kind: row.kind,
        ownerName: row.owner_name,
        at: row.at,
      })),
    add(roomKind, plant) {
      const info = q.plantAdd.run(
        roomKind,
        plant.x,
        plant.z,
        plant.kind,
        plant.ownerName,
        plant.at,
      );
      return { ...plant, id: Number(info.lastInsertRowid) };
    },
    trim(roomKind, max) {
      const old = (q.plantOld.all(roomKind, max) as { id: number }[]).map((row) => row.id);
      for (const id of old) q.plantDelete.run(id);
      return old;
    },
  };

  const social: SocialRepo = {
    setLeaderboardHidden(userId, hidden) {
      q.setHidden.run(hidden ? 1 : 0, userId);
    },
    isLeaderboardHidden: (userId) =>
      (q.getHidden.get(userId) as { h: number } | undefined)?.h === 1,
    leaderboard: (since, department) => q.board.all({ since, department }) as LeaderboardEntry[],
  };

  interface WallDbRow {
    id: number;
    user_id: string;
    day: string;
    text: string;
    created_at: number;
    reports: number;
    hidden: number;
  }
  const toWall = (row: WallDbRow): WallRow => ({
    id: row.id,
    userId: row.user_id,
    day: row.day,
    text: row.text,
    createdAt: row.created_at,
    reports: row.reports,
    hidden: row.hidden === 1,
  });
  const wall: WallRepo = {
    add: (userId, day, text, at) => q.wallAdd.run(userId, day, text, at).changes === 1,
    visible: (limit) => (q.wallVisible.all(limit) as WallDbRow[]).map(toWall),
    reported: (limit) => (q.wallReported.all(limit) as WallDbRow[]).map(toWall),
    get(id) {
      const row = q.wallGet.get(id) as WallDbRow | undefined;
      return row ? toWall(row) : null;
    },
    reportedBy(userId, ids) {
      if (ids.length === 0) return new Set();
      const rows = db
        .prepare(
          `SELECT post_id FROM wall_reports WHERE reporter_id = ? AND post_id IN (${ids.map(() => '?').join(',')})`,
        )
        .all(userId, ...ids) as { post_id: number }[];
      return new Set(rows.map((row) => row.post_id));
    },
    report(postId, reporterId, at) {
      return db.transaction(() => {
        if (q.wallReport.run(postId, reporterId, at).changes === 0) return null;
        q.wallBump.run(postId);
        return (q.wallGet.get(postId) as WallDbRow | undefined)?.reports ?? null;
      })();
    },
    setHidden(id, hidden) {
      q.wallSetHidden.run(hidden ? 1 : 0, id);
    },
    delete(id) {
      q.wallDelete.run(id);
    },
  };

  return {
    users,
    characters,
    progress,
    activity,
    actions,
    ledger,
    inventory,
    plants,
    social,
    wall,
    transaction: (fn) => db.transaction(fn)(),
  };
}
