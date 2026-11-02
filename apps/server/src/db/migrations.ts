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
  {
    version: 5,
    sql: `
      -- Băm IP (HMAC với khoá bí mật của server) chỉ để phát hiện tài khoản phụ tự vào công ty mình.
      ALTER TABLE users ADD COLUMN ip_hash TEXT;
      CREATE TABLE server_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE companies (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        name_key TEXT NOT NULL UNIQUE,
        industry TEXT NOT NULL,
        color INTEGER NOT NULL,
        icon TEXT NOT NULL,
        building INTEGER NOT NULL,
        floor INTEGER NOT NULL,
        economy TEXT NOT NULL,
        hiring INTEGER NOT NULL DEFAULT 1,
        ipo_count INTEGER NOT NULL DEFAULT 0,
        event_day TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE company_members (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        role INTEGER NOT NULL DEFAULT 0,
        joined_at INTEGER NOT NULL,
        suspicious INTEGER NOT NULL DEFAULT 0,
        last_promo_day TEXT
      );
      CREATE INDEX company_members_company ON company_members(company_id);
      CREATE TABLE company_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role INTEGER NOT NULL DEFAULT 0,
        at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
      );
      CREATE INDEX company_applications_company ON company_applications(company_id, status);
      CREATE INDEX company_applications_user ON company_applications(user_id, at);
      CREATE TABLE company_bans (
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (company_id, user_id)
      );
      CREATE TABLE company_invites (
        code_hash TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        uses_left INTEGER NOT NULL
      );
      CREATE INDEX company_invites_company ON company_invites(company_id, created_at);
      CREATE TABLE company_feed (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        at INTEGER NOT NULL,
        kind TEXT NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX company_feed_company ON company_feed(company_id, id);
      CREATE TABLE user_badges (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        badge TEXT NOT NULL,
        at INTEGER NOT NULL,
        PRIMARY KEY (user_id, badge)
      );
      CREATE TABLE job_offers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        company_name TEXT NOT NULL,
        at INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending'
      );
      CREATE INDEX job_offers_user ON job_offers(user_id, at);
    `,
  },
  {
    version: 6,
    sql: `
      -- Thống kê ẩn danh: chỉ đếm theo ngày và loại sự kiện, KHÔNG có người chơi hay IP.
      CREATE TABLE analytics_daily (
        day TEXT NOT NULL,
        event TEXT NOT NULL,
        count INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (day, event)
      );
    `,
  },
  {
    version: 7,
    sql: `
      -- Đăng ký / đăng nhập: tên đăng nhập + mật khẩu (băm scrypt). Tài khoản khách bị xoá khi rời đi.
      ALTER TABLE users ADD COLUMN username TEXT;
      ALTER TABLE users ADD COLUMN password_hash TEXT;
      ALTER TABLE users ADD COLUMN guest INTEGER NOT NULL DEFAULT 0;
      CREATE UNIQUE INDEX users_username ON users(username) WHERE username IS NOT NULL;
      CREATE INDEX users_guest_seen ON users(guest, last_seen_at);
      -- Công ty: tỉnh/thành đặt trụ sở và khung cấp tuyển dụng do CEO đặt.
      ALTER TABLE companies ADD COLUMN province TEXT NOT NULL DEFAULT 'ho-chi-minh';
      ALTER TABLE companies ADD COLUMN hiring_bands TEXT;
    `,
  },
];
