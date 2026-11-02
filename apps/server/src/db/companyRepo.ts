// Truy cập dữ liệu công ty (Phase 6). Tách riêng để đổi DB sau này.
import type { CompanyEconomy, CompanyIcon, Industry } from '@dilam/shared';
import type { Db } from './database';

export interface CompanyRow {
  id: string;
  ownerId: string;
  name: string;
  nameKey: string;
  industry: Industry;
  color: number;
  icon: CompanyIcon;
  building: number;
  floor: number;
  economy: CompanyEconomy;
  hiring: boolean;
  ipoCount: number;
  eventDay: string | null;
  createdAt: number;
}

export interface MemberRow {
  userId: string;
  companyId: string;
  role: number;
  joinedAt: number;
  suspicious: boolean;
  lastPromoDay: string | null;
}

export interface ApplicationRow {
  id: number;
  companyId: string;
  userId: string;
  at: number;
  status: string;
}

export interface CompanyRepo {
  create(row: CompanyRow): void;
  get(id: string): CompanyRow | null;
  byOwner(userId: string): CompanyRow | null;
  byNameKey(key: string): CompanyRow | null;
  all(): CompanyRow[];
  count(): number;
  saveEconomy(id: string, economy: CompanyEconomy): void;
  update(
    id: string,
    fields: Partial<Pick<CompanyRow, 'industry' | 'ipoCount' | 'eventDay' | 'hiring'>>,
  ): void;
  /** Tầng còn trống đầu tiên: toà nhà mỗi toà tối đa `perBuilding` công ty. */
  nextFloor(perBuilding: number): { building: number; floor: number };

  member(userId: string): MemberRow | null;
  members(companyId: string): MemberRow[];
  addMember(row: MemberRow): void;
  removeMember(userId: string): void;
  setRole(userId: string, role: number, promoDay: string | null): void;

  apply(companyId: string, userId: string, at: number): number;
  applications(companyId: string): ApplicationRow[];
  application(id: number): ApplicationRow | null;
  pendingOf(userId: string): ApplicationRow[];
  setApplication(id: number, status: string): void;
  applicationsSince(userId: string, since: number): number;

  ban(companyId: string, userId: string): void;
  isBanned(companyId: string, userId: string): boolean;

  addInvite(codeHash: string, companyId: string, at: number, expiresAt: number, uses: number): void;
  invitesSince(companyId: string, since: number): number;
  useInvite(codeHash: string, now: number): string | null;

  addFeed(companyId: string, at: number, kind: string, data: Record<string, string | number>): void;
  feed(
    companyId: string,
    limit: number,
  ): { at: number; kind: string; data: Record<string, string | number> }[];

  addBadge(userId: string, badge: string, at: number): void;
  badges(userId: string): string[];

  addOffer(userId: string, companyName: string, at: number): void;
  offers(userId: string): { id: number; companyName: string; at: number; status: string }[];
  lastOfferAt(userId: string): number | null;
  setOffer(id: number, status: string): void;
}

interface CompanyDbRow {
  id: string;
  owner_id: string;
  name: string;
  name_key: string;
  industry: string;
  color: number;
  icon: string;
  building: number;
  floor: number;
  economy: string;
  hiring: number;
  ipo_count: number;
  event_day: string | null;
  created_at: number;
}

const toCompany = (row: CompanyDbRow | undefined): CompanyRow | null =>
  row
    ? {
        id: row.id,
        ownerId: row.owner_id,
        name: row.name,
        nameKey: row.name_key,
        industry: row.industry as Industry,
        color: row.color,
        icon: row.icon as CompanyIcon,
        building: row.building,
        floor: row.floor,
        economy: JSON.parse(row.economy) as CompanyEconomy,
        hiring: row.hiring === 1,
        ipoCount: row.ipo_count,
        eventDay: row.event_day,
        createdAt: row.created_at,
      }
    : null;

interface MemberDbRow {
  user_id: string;
  company_id: string;
  role: number;
  joined_at: number;
  suspicious: number;
  last_promo_day: string | null;
}

const toMember = (row: MemberDbRow | undefined): MemberRow | null =>
  row
    ? {
        userId: row.user_id,
        companyId: row.company_id,
        role: row.role,
        joinedAt: row.joined_at,
        suspicious: row.suspicious === 1,
        lastPromoDay: row.last_promo_day,
      }
    : null;

interface AppDbRow {
  id: number;
  company_id: string;
  user_id: string;
  at: number;
  status: string;
}
const toApp = (row: AppDbRow): ApplicationRow => ({
  id: row.id,
  companyId: row.company_id,
  userId: row.user_id,
  at: row.at,
  status: row.status,
});

export function createCompanyRepo(db: Db): CompanyRepo {
  const q = {
    create: db.prepare(
      `INSERT INTO companies (id, owner_id, name, name_key, industry, color, icon, building, floor, economy, hiring, ipo_count, event_day, created_at)
       VALUES (@id, @ownerId, @name, @nameKey, @industry, @color, @icon, @building, @floor, @economy, @hiring, @ipoCount, @eventDay, @createdAt)`,
    ),
    get: db.prepare('SELECT * FROM companies WHERE id = ?'),
    byOwner: db.prepare('SELECT * FROM companies WHERE owner_id = ?'),
    byName: db.prepare('SELECT * FROM companies WHERE name_key = ?'),
    all: db.prepare('SELECT * FROM companies ORDER BY building, floor'),
    count: db.prepare('SELECT COUNT(*) AS n FROM companies'),
    floors: db.prepare('SELECT building, floor FROM companies'),
    economy: db.prepare('UPDATE companies SET economy = ? WHERE id = ?'),
    member: db.prepare('SELECT * FROM company_members WHERE user_id = ?'),
    members: db.prepare('SELECT * FROM company_members WHERE company_id = ? ORDER BY joined_at'),
    addMember: db.prepare(
      `INSERT INTO company_members (user_id, company_id, role, joined_at, suspicious, last_promo_day)
       VALUES (@userId, @companyId, @role, @joinedAt, @suspicious, @lastPromoDay)
       ON CONFLICT(user_id) DO UPDATE SET company_id = excluded.company_id, role = excluded.role,
       joined_at = excluded.joined_at, suspicious = excluded.suspicious, last_promo_day = NULL`,
    ),
    removeMember: db.prepare('DELETE FROM company_members WHERE user_id = ?'),
    setRole: db.prepare(
      'UPDATE company_members SET role = ?, last_promo_day = ? WHERE user_id = ?',
    ),
    apply: db.prepare(
      'INSERT INTO company_applications (company_id, user_id, at) VALUES (?, ?, ?)',
    ),
    apps: db.prepare(
      "SELECT * FROM company_applications WHERE company_id = ? AND status = 'pending' ORDER BY id",
    ),
    app: db.prepare('SELECT * FROM company_applications WHERE id = ?'),
    pendingOf: db.prepare(
      "SELECT * FROM company_applications WHERE user_id = ? AND status = 'pending'",
    ),
    setApp: db.prepare('UPDATE company_applications SET status = ? WHERE id = ?'),
    appsSince: db.prepare(
      'SELECT COUNT(*) AS n FROM company_applications WHERE user_id = ? AND at >= ?',
    ),
    ban: db.prepare('INSERT OR IGNORE INTO company_bans (company_id, user_id) VALUES (?, ?)'),
    isBanned: db.prepare('SELECT 1 FROM company_bans WHERE company_id = ? AND user_id = ?'),
    addInvite: db.prepare(
      'INSERT INTO company_invites (code_hash, company_id, created_at, expires_at, uses_left) VALUES (?, ?, ?, ?, ?)',
    ),
    invitesSince: db.prepare(
      'SELECT COUNT(*) AS n FROM company_invites WHERE company_id = ? AND created_at >= ?',
    ),
    getInvite: db.prepare('SELECT * FROM company_invites WHERE code_hash = ?'),
    useInvite: db.prepare(
      'UPDATE company_invites SET uses_left = uses_left - 1 WHERE code_hash = ?',
    ),
    addFeed: db.prepare(
      'INSERT INTO company_feed (company_id, at, kind, data) VALUES (?, ?, ?, ?)',
    ),
    feed: db.prepare(
      'SELECT at, kind, data FROM company_feed WHERE company_id = ? ORDER BY id DESC LIMIT ?',
    ),
    addBadge: db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge, at) VALUES (?, ?, ?)'),
    badges: db.prepare('SELECT badge FROM user_badges WHERE user_id = ? ORDER BY at'),
    addOffer: db.prepare('INSERT INTO job_offers (user_id, company_name, at) VALUES (?, ?, ?)'),
    offers: db.prepare(
      "SELECT id, company_name, at, status FROM job_offers WHERE user_id = ? AND status = 'pending' ORDER BY id DESC",
    ),
    lastOffer: db.prepare('SELECT MAX(at) AS at FROM job_offers WHERE user_id = ?'),
    setOffer: db.prepare('UPDATE job_offers SET status = ? WHERE id = ?'),
  };

  return {
    create(row) {
      q.create.run({
        ...row,
        economy: JSON.stringify(row.economy),
        hiring: row.hiring ? 1 : 0,
      });
    },
    get: (id) => toCompany(q.get.get(id) as CompanyDbRow | undefined),
    byOwner: (userId) => toCompany(q.byOwner.get(userId) as CompanyDbRow | undefined),
    byNameKey: (key) => toCompany(q.byName.get(key) as CompanyDbRow | undefined),
    all: () =>
      (q.all.all() as CompanyDbRow[])
        .map((row) => toCompany(row))
        .filter((c): c is CompanyRow => c !== null),
    count: () => (q.count.get() as { n: number }).n,
    saveEconomy(id, economy) {
      q.economy.run(JSON.stringify(economy), id);
    },
    update(id, fields) {
      const sets: string[] = [];
      const values: (string | number | null)[] = [];
      if (fields.industry !== undefined) {
        sets.push('industry = ?');
        values.push(fields.industry);
      }
      if (fields.ipoCount !== undefined) {
        sets.push('ipo_count = ?');
        values.push(fields.ipoCount);
      }
      if (fields.eventDay !== undefined) {
        sets.push('event_day = ?');
        values.push(fields.eventDay);
      }
      if (fields.hiring !== undefined) {
        sets.push('hiring = ?');
        values.push(fields.hiring ? 1 : 0);
      }
      if (sets.length === 0) return;
      db.prepare(`UPDATE companies SET ${sets.join(', ')} WHERE id = ?`).run(...values, id);
    },
    nextFloor(perBuilding) {
      const used = new Set(
        (q.floors.all() as { building: number; floor: number }[]).map(
          (r) => `${String(r.building)}-${String(r.floor)}`,
        ),
      );
      for (let building = 1; ; building += 1) {
        for (let floor = 1; floor <= perBuilding; floor += 1) {
          if (!used.has(`${String(building)}-${String(floor)}`)) return { building, floor };
        }
      }
    },
    member: (userId) => toMember(q.member.get(userId) as MemberDbRow | undefined),
    members: (companyId) =>
      (q.members.all(companyId) as MemberDbRow[])
        .map((row) => toMember(row))
        .filter((m): m is MemberRow => m !== null),
    addMember(row) {
      q.addMember.run({ ...row, suspicious: row.suspicious ? 1 : 0 });
    },
    removeMember(userId) {
      q.removeMember.run(userId);
    },
    setRole(userId, role, promoDay) {
      q.setRole.run(role, promoDay, userId);
    },
    apply: (companyId, userId, at) => Number(q.apply.run(companyId, userId, at).lastInsertRowid),
    applications: (companyId) => (q.apps.all(companyId) as AppDbRow[]).map(toApp),
    application(id) {
      const row = q.app.get(id) as AppDbRow | undefined;
      return row ? toApp(row) : null;
    },
    pendingOf: (userId) => (q.pendingOf.all(userId) as AppDbRow[]).map(toApp),
    setApplication(id, status) {
      q.setApp.run(status, id);
    },
    applicationsSince: (userId, since) => (q.appsSince.get(userId, since) as { n: number }).n,
    ban(companyId, userId) {
      q.ban.run(companyId, userId);
    },
    isBanned: (companyId, userId) => q.isBanned.get(companyId, userId) !== undefined,
    addInvite(codeHash, companyId, at, expiresAt, uses) {
      q.addInvite.run(codeHash, companyId, at, expiresAt, uses);
    },
    invitesSince: (companyId, since) => (q.invitesSince.get(companyId, since) as { n: number }).n,
    useInvite(codeHash, now) {
      const row = q.getInvite.get(codeHash) as
        { company_id: string; expires_at: number; uses_left: number } | undefined;
      if (!row || row.expires_at <= now || row.uses_left <= 0) return null;
      q.useInvite.run(codeHash);
      return row.company_id;
    },
    addFeed(companyId, at, kind, data) {
      q.addFeed.run(companyId, at, kind, JSON.stringify(data));
    },
    feed: (companyId, limit) =>
      (q.feed.all(companyId, limit) as { at: number; kind: string; data: string }[]).map((row) => ({
        at: row.at,
        kind: row.kind,
        data: JSON.parse(row.data) as Record<string, string | number>,
      })),
    addBadge(userId, badge, at) {
      q.addBadge.run(userId, badge, at);
    },
    badges: (userId) => (q.badges.all(userId) as { badge: string }[]).map((r) => r.badge),
    addOffer(userId, companyName, at) {
      q.addOffer.run(userId, companyName, at);
    },
    offers: (userId) =>
      (
        q.offers.all(userId) as { id: number; company_name: string; at: number; status: string }[]
      ).map((r) => ({ id: r.id, companyName: r.company_name, at: r.at, status: r.status })),
    lastOfferAt: (userId) => (q.lastOffer.get(userId) as { at: number | null }).at,
    setOffer(id, status) {
      q.setOffer.run(status, id);
    },
  };
}
