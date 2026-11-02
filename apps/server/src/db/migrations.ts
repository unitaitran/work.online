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
];
