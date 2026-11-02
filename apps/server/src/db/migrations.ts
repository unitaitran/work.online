// Migration đánh số tăng dần. KHÔNG sửa migration đã phát hành; thêm migration mới.
export interface Migration {
  version: number;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        token_expires_at INTEGER NOT NULL,
        recovery_hash TEXT NOT NULL UNIQUE,
        time_zone TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE TABLE characters (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        appearance TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE progress (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data TEXT NOT NULL,
        xp INTEGER NOT NULL,
        level INTEGER NOT NULL,
        coins INTEGER NOT NULL,
        reputation INTEGER NOT NULL,
        branch TEXT,
        department TEXT,
        streak INTEGER NOT NULL,
        imported INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        xp INTEGER NOT NULL DEFAULT 0,
        coins INTEGER NOT NULL DEFAULT 0,
        detail TEXT
      );
      CREATE INDEX activity_log_user_at ON activity_log(user_id, at);
      CREATE TABLE wall_posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        reports INTEGER NOT NULL DEFAULT 0,
        hidden INTEGER NOT NULL DEFAULT 0,
        UNIQUE (user_id, day)
      );
    `,
  },
  {
    version: 2,
    sql: `
      -- Khoá chống gửi trùng hành động (idempotency), dọn định kỳ.
      CREATE TABLE processed_actions (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        action_id TEXT NOT NULL,
        at INTEGER NOT NULL,
        PRIMARY KEY (user_id, action_id)
      );
      CREATE INDEX processed_actions_at ON processed_actions(at);
    `,
  },
  {
    version: 3,
    sql: `
      -- Sổ cái xu: MỌI biến động xu (cộng, trừ, lý do, số dư sau). Tổng delta = số xu hiện có.
      CREATE TABLE coin_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        at INTEGER NOT NULL,
        delta INTEGER NOT NULL,
        reason TEXT NOT NULL,
        balance INTEGER NOT NULL CHECK (balance >= 0)
      );
      CREATE INDEX coin_ledger_user ON coin_ledger(user_id, id);
      CREATE TABLE inventory (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        item_id TEXT NOT NULL,
        acquired_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, item_id)
      );
      CREATE TABLE equipment (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        items TEXT NOT NULL
      );
      -- Cây người chơi đã tưới, ở lại trong phòng (tối đa 30 mỗi loại phòng).
      CREATE TABLE room_plants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room_kind TEXT NOT NULL,
        x REAL NOT NULL,
        z REAL NOT NULL,
        kind INTEGER NOT NULL,
        owner_name TEXT NOT NULL,
        at INTEGER NOT NULL
      );
      CREATE INDEX room_plants_kind ON room_plants(room_kind, id);
    `,
  },
  {
    version: 4,
    sql: `
      ALTER TABLE users ADD COLUMN leaderboard_hidden INTEGER NOT NULL DEFAULT 0;
      CREATE INDEX activity_log_at ON activity_log(at);
      CREATE TABLE wall_reports (
        post_id INTEGER NOT NULL REFERENCES wall_posts(id) ON DELETE CASCADE,
        reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        at INTEGER NOT NULL,
        PRIMARY KEY (post_id, reporter_id)
      );
      CREATE INDEX wall_posts_created ON wall_posts(created_at);
    `,
  },
];
