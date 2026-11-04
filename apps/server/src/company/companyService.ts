// Công ty ở server (Phase 6A + 6B). Mọi tính toán ở đây, luật và hằng số ở packages/shared/company.ts.
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  acceptOffer,
  applyCompanyEvent,
  BALANCE,
  canOpenCompany,
  checkCompanyName,
  COMPANY,
  COMPANY_COLORS,
  companyEventFor,
  companyNameKey,
  dayKey,
  DEFAULT_PROVINCE,
  DEPARTMENTS,
  entryStepFor,
  LADDER_NAME_MAX,
  parseLadder,
  stepName,
  validateLadder,
  type CompanyLadder,
  ipoBonus,
  levelFor,
  makeEvent,
  MAX_STAGE,
  MISSION_TEMPLATES,
  NPC_COMPANIES,
  projectOffers,
  offerDone,
  settleEconomy,
  addWork,
  stageConfig,
  stageProgress,
  startMission,
  titleFor,
  type CompanyDetail,
  type CompanyEconomy,
  type CompanyPublic,
  type FoundCompanyRequest,
  type Industry,
  type MyCompanyResponse,
  type ProgressState,
  type StaffRank,
  checkText,
  type ProjectOffer,
  type CompanyPerk,
  COMPANY_SHOP,
  uniformHex,
  type ServerMessage,
  projectBonusCoins,
  type Mission,
} from '@dilam/shared';
import { hashSecret, playerCodeOf } from '../auth/secrets';
import type { CompanyRow } from '../db/companyRepo';
import type { Repositories } from '../db/repositories';
import type { ProgressEngine } from '../game/progressEngine';

const DAY_MS = 86_400_000;
/** Ngày công ty (dự án, sự kiện) theo giờ Việt Nam. */
const COMPANY_TZ = 'Asia/Ho_Chi_Minh';
const INVITE_TTL_MS = 3 * DAY_MS;
const OFFER_EVERY_MS = 3 * DAY_MS;
/** Mã công ty NPC mặc định (Văn phòng Công Sở). */
const DEFAULT_EMPLOYER = BALANCE.company.defaultEmployer;

export type CompanyError =
  | 'not_found'
  | 'not_owner'
  | 'not_member'
  | 'level'
  | 'employed'
  | 'capital'
  | 'owner'
  | 'name'
  | 'name_taken'
  | 'building_full'
  | 'no_offer'
  | 'offer_done'
  | 'owned'
  | 'busy'
  | 'not_enough'
  | 'max_staff'
  | 'max_rank'
  | 'not_ready'
  | 'not_ipo'
  | 'no_event'
  | 'too_senior'
  | 'banned'
  | 'limit'
  | 'already'
  | 'not_hiring'
  | 'bad_code'
  | 'level_band'
  | 'ladder_empty'
  | 'ladder_order'
  | 'ladder_unlock_step'
  | 'ladder_unlock_early'
  | 'self';

export type Result<T = undefined> =
  { ok: true; value: T } | { ok: false; error: CompanyError; reason?: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: CompanyError, reason?: string): Result<never> =>
  reason ? { ok: false, error, reason } : { ok: false, error };

export interface CompanyHooks {
  /** Số người đang ở phòng công ty. */
  online(companyId: string): number;
  /** Đẩy tiến độ mới cho người chơi (sau khi đổi xu/XP/việc). */
  push(userId: string): void;
  /** Đưa người chơi ra khỏi phòng công ty (bị đuổi, công ty đổi). */
  evict(userId: string, companyId: string): void;
  /** Hồ sơ trong phòng đổi (chức danh, công ty). */
  profileChanged(userId: string): void;
  /** Phòng công ty đổi tên / đồ / đồng phục: báo mọi người trong phòng tải lại. */
  companyChanged?(companyId: string): void;
  /** Báo nhân viên: CEO vừa giao việc (nếu đang online). */
  missionAssigned?(userId: string, mission: Mission): void;
  /** Báo chủ công ty: vừa hoàn thành dự án (nếu đang online). */
  projectDone?(ownerId: string, message: Extract<ServerMessage, { type: 'project_done' }>): void;
}

export class CompanyService {
  private readonly ipSecret: string;

  constructor(
    private readonly repos: Repositories,
    private readonly engine: ProgressEngine,
    private readonly now: () => number,
    private readonly hooks: CompanyHooks,
  ) {
    this.ipSecret = repos.setting('ip_hash_secret', () => randomBytes(32).toString('hex'));
  }

  // ---------- Tiện ích ----------

  /** Băm IP bằng HMAC với khoá bí mật của server (không lưu IP thật). */
  hashIp(ip: string): string {
    return createHmac('sha256', this.ipSecret).update(ip).digest('hex').slice(0, 32);
  }

  private today(): string {
    return dayKey(new Date(this.now()), COMPANY_TZ);
  }

  private totalEarned(userId: string): number {
    return this.repos.ledger
      .recent(userId, 100_000)
      .filter((e) => e.delta > 0 && e.reason.startsWith('earn:'))
      .reduce((sum, e) => sum + e.delta, 0);
  }

  private state(userId: string): ProgressState {
    return this.engine.state(userId);
  }

  private setState(userId: string, state: ProgressState): void {
    this.engine.save(userId, state);
  }

  private changeCoins(userId: string, delta: number, reason: string): boolean {
    const state = this.state(userId);
    const balance = state.coins + delta;
    if (balance < 0) return false;
    this.setState(userId, { ...state, coins: balance });
    this.repos.ledger.add(userId, this.now(), delta, reason, balance);
    return true;
  }

  /** Ghi bảng tin (tên dự án, thưởng, uy tín, tổng số dự án) và báo CEO. */
  private projectCompleted(company: CompanyRow, project: ProjectOffer, done: number): void {
    this.repos.companies.addFeed(company.id, this.now(), 'project_done', {
      industry: company.industry,
      nameIndex: project.nameIndex,
      difficulty: project.difficulty,
      reward: project.reward,
      reputation: project.reputation,
      done,
    });
    const message = {
      type: 'project_done',
      industry: company.industry,
      nameIndex: project.nameIndex,
      difficulty: project.difficulty,
      reward: project.reward,
      reputation: project.reputation,
    } as const;
    const paid = this.payProjectBonus(company.id, project, message);
    this.hooks.projectDone?.(company.ownerId, { ...message, paid });
  }

  /**
   * Thưởng nhân viên khi xong dự án: xu theo độ khó và vai trò (trừ từ quỹ, hết quỹ thì thôi) và
   * XP qua luật shared (giới hạn mỗi ngày). Thực tập sinh và tài khoản nghi là phụ thì không được.
   */
  private payProjectBonus(
    companyId: string,
    project: ProjectOffer,
    message: Extract<ServerMessage, { type: 'project_done' }>,
  ): { people: number; coins: number } {
    const company = this.repos.companies.get(companyId);
    if (!company) return { people: 0, coins: 0 };
    let treasury = company.economy.treasury;
    const lines: string[] = [];
    let people = 0;
    for (const member of this.repos.companies.members(companyId)) {
      if (member.suspicious) continue;
      if (member.role < 1) {
        // Thực tập sinh: không được chia thưởng nhưng vẫn được báo dự án xong.
        this.hooks.projectDone?.(member.userId, {
          ...message,
          bonus: { coins: 0, xp: 0, intern: true },
        });
        continue;
      }
      const want = projectBonusCoins(project.difficulty, member.role);
      const coins = Math.min(want, Math.max(0, treasury));
      if (coins > 0 && this.changeCoins(member.userId, coins, 'company:project')) {
        treasury -= coins;
      }
      const before = this.state(member.userId).xp;
      this.engine.grant(
        member.userId,
        makeEvent('company-project', this.now(), 0, { difficulty: project.difficulty }),
      );
      const xp = this.state(member.userId).xp - before;
      // Báo từng người đúng phần mình nhận (kể cả hôm nay đã nhận đủ thưởng: 0 xu, 0 XP).
      this.hooks.push(member.userId);
      this.hooks.projectDone?.(member.userId, { ...message, bonus: { coins, xp } });
      if (coins > 0 || xp > 0) {
        people += 1;
        const name = this.repos.characters.get(member.userId)?.name ?? '';
        lines.push(`${name} +${String(coins)} xu +${String(xp)} XP`);
      }
    }
    const coins = company.economy.treasury - treasury;
    if (treasury !== company.economy.treasury) {
      this.repos.companies.saveEconomy(companyId, { ...company.economy, treasury });
    }
    // Bảng tin: ai nhận bao nhiêu (người offline vẫn xem được).
    if (lines.length > 0) {
      this.repos.companies.addFeed(companyId, this.now(), 'project_bonus', {
        summary: lines.join(', '),
        coins,
      });
    }
    return { people, coins };
  }

  /** Tính kinh tế theo giờ thật tới bây giờ, lưu lại, ghi bảng tin nếu xong dự án. */
  private settle(company: CompanyRow): CompanyRow {
    const result = settleEconomy(company.economy, this.now());
    if (result.economy === company.economy) return company;
    this.repos.companies.saveEconomy(company.id, result.economy);
    if (result.completed) {
      this.projectCompleted(company, result.completed, result.economy.projectsDone);
      // Thưởng nhân viên đã trừ quỹ: đọc lại.
      return this.repos.companies.get(company.id) ?? { ...company, economy: result.economy };
    }
    return { ...company, economy: result.economy };
  }

  private publicView(company: CompanyRow): CompanyPublic {
    return {
      id: company.id,
      name: company.name,
      industry: company.industry,
      color: company.color,
      icon: company.icon,
      stage: company.economy.stage,
      building: company.building,
      floor: company.floor,
      members: this.repos.companies.members(company.id).length,
      hiring: company.hiring,
      province: company.province,
      hiringBands: parseLadder(company.hiringBands),
      ipoCount: company.ipoCount,
      online: this.hooks.online(company.id),
      perks: company.economy.perks ?? [],
      uniform: uniformHex(company.economy),
      staff: company.economy.staff
        .filter((s) => s.awayUntil <= this.now())
        .map((s) => ({ id: s.id, nameIndex: s.nameIndex })),
    };
  }

  private ownerCompany(userId: string): Result<CompanyRow> {
    const company = this.repos.companies.byOwner(userId);
    return company ? ok(this.settle(company)) : fail('not_owner');
  }

  /** Công ty của người chơi (chủ hoặc thành viên). */
  companyOf(userId: string): CompanyRow | null {
    const owned = this.repos.companies.byOwner(userId);
    if (owned) return owned;
    const member = this.repos.companies.member(userId);
    return member ? this.repos.companies.get(member.companyId) : null;
  }

  /** Quyền vào phòng công ty: chủ hoặc thành viên. */
  canEnter(userId: string, companyId: string): boolean {
    return this.companyOf(userId)?.id === companyId;
  }

  roomCapacity(companyId: string): number {
    const company = this.repos.companies.get(companyId);
    return company ? stageConfig(company.economy.stage).roomCapacity : 0;
  }

  get(companyId: string): CompanyPublic | null {
    const company = this.repos.companies.get(companyId);
    return company ? this.publicView(company) : null;
  }

  directory(): CompanyPublic[] {
    return this.repos.companies.all().map((c) => this.publicView(c));
  }

  // ---------- Chi tiết ----------

  detail(userId: string): CompanyDetail | null {
    const found = this.companyOf(userId);
    if (!found) return null;
    const company = this.settle(found);
    const isOwner = company.ownerId === userId;
    const today = this.today();
    const event = isOwner && company.eventDay !== today ? companyEventFor(company.id, today) : null;
    const memberIds = [
      company.ownerId,
      ...this.repos.companies.members(company.id).map((m) => m.userId),
    ];
    const names = this.repos.characters.names(memberIds);
    const ladder = parseLadder(company.hiringBands);
    const levelOf = (id: string): number => levelFor(this.state(id).xp);
    const members = [
      {
        code: playerCodeOf(company.ownerId),
        name: names.get(company.ownerId) ?? '',
        role: 3,
        owner: true,
        title: titleFor(this.state(company.ownerId).xp),
        level: levelOf(company.ownerId),
        position: null,
        joinedAt: company.createdAt,
      },
      ...this.repos.companies.members(company.id).map((m) => ({
        code: playerCodeOf(m.userId),
        name: names.get(m.userId) ?? '',
        role: m.role,
        owner: false,
        title: titleFor(this.state(m.userId).xp),
        level: levelOf(m.userId),
        position: stepName(ladder, levelOf(m.userId)),
        joinedAt: m.joinedAt,
      })),
    ];
    const applications = isOwner
      ? this.repos.companies.applications(company.id).map((a) => ({
          id: a.id,
          code: playerCodeOf(a.userId),
          name: this.repos.characters.get(a.userId)?.name ?? '',
          title: titleFor(this.state(a.userId).xp),
          level: levelOf(a.userId),
          position: ((): string | null => {
            const step = entryStepFor(ladder, levelOf(a.userId));
            return step === null ? null : (ladder.steps[step]?.name ?? null);
          })(),
          at: a.at,
        }))
      : [];
    return {
      company: this.publicView(company),
      isOwner,
      economy: company.economy,
      wearingUniform: (company.economy.uniformOn ?? []).includes(playerCodeOf(userId)),
      offers: isOwner ? projectOffers(company.id, today, company.economy.stage) : [],
      stage: stageProgress(company.economy),
      event,
      members,
      applications,
      feed: this.repos.companies.feed(company.id, 30),
    };
  }

  my(userId: string): MyCompanyResponse {
    const state = this.state(userId);
    const owns = this.repos.companies.byOwner(userId) !== null;
    const found = canOpenCompany(state, {
      totalEarned: this.totalEarned(userId),
      ownsCompany: owns,
    });
    this.maybeOffer(userId, state);
    return {
      detail: this.detail(userId),
      found: { ok: found.ok, missing: found.missing, capital: found.capital },
      employer: state.employer,
      offers: this.repos.companies.offers(userId).map((o) => ({
        id: o.id,
        companyName: o.companyName,
        at: o.at,
      })),
      badges: this.repos.companies.badges(userId),
      pendingApplications: this.repos.companies.pendingOf(userId).map((a) => a.id),
    };
  }

  // ---------- 6A: mở công ty và điều hành ----------

  found(userId: string, request: FoundCompanyRequest): Result<CompanyDetail> {
    const state = this.state(userId);
    const owns = this.repos.companies.byOwner(userId) !== null;
    const check = canOpenCompany(state, {
      totalEarned: this.totalEarned(userId),
      ownsCompany: owns,
    });
    if (!check.ok) return fail(check.missing[0] ?? 'level');
    const name = checkCompanyName(request.name);
    if (!name.ok) return fail('name', name.reason);
    const key = companyNameKey(name.name);
    if (this.repos.companies.byNameKey(key)) return fail('name_taken');
    if (request.color >= COMPANY_COLORS.length) return fail('name');
    const spot = this.repos.companies.nextFloor(BALANCE.company.maxCompaniesPerBuilding);
    const id = randomUUID().slice(0, 12);
    const now = this.now();
    this.repos.transaction(() => {
      if (!this.changeCoins(userId, -check.capital, 'company:capital')) throw new Error('capital');
      const economy: CompanyEconomy = {
        stage: 0,
        treasury: check.capital,
        reputation: 0,
        projectsDone: 0,
        staff: [],
        project: null,
        lastSettle: now,
      };
      this.repos.companies.create({
        id,
        ownerId: userId,
        name: name.name,
        nameKey: key,
        industry: request.industry,
        color: request.color,
        icon: request.icon,
        building: spot.building,
        floor: spot.floor,
        economy,
        hiring: true,
        ipoCount: 0,
        eventDay: null,
        createdAt: now,
        province: request.province ?? DEFAULT_PROVINCE,
        hiringBands: null,
      });
      // Chủ công ty làm ở chính công ty mình.
      this.setState(userId, { ...this.state(userId), employer: `company:${id}` });
      this.repos.companies.addFeed(id, now, 'founded', { name: name.name });
    });
    this.hooks.push(userId);
    this.hooks.profileChanged(userId);
    const detail = this.detail(userId);
    return detail ? ok(detail) : fail('not_found');
  }

  acceptProject(userId: string, offerId: string): Result<CompanyDetail> {
    const owned = this.ownerCompany(userId);
    if (!owned.ok) return owned;
    const company = owned.value;
    if (company.economy.project) return fail('busy');
    const offer = projectOffers(company.id, this.today(), company.economy.stage).find(
      (o) => o.id === offerId,
    );
    if (!offer) return fail('no_offer');
    if (offerDone(company.economy, offer.id)) return fail('offer_done');
    this.repos.companies.saveEconomy(company.id, {
      ...company.economy,
      project: { ...offer, progress: 0 },
      lastSettle: this.now(),
    });
    return this.detailOk(userId);
  }

  hire(userId: string): Result<CompanyDetail> {
    const owned = this.ownerCompany(userId);
    if (!owned.ok) return owned;
    const e = owned.value.economy;
    if (e.staff.length >= stageConfig(e.stage).maxStaff) return fail('max_staff');
    const cost = COMPANY.hireCost[0] ?? 0;
    if (e.treasury < cost) return fail('not_enough');
    const id = e.staff.reduce((max, s) => Math.max(max, s.id + 1), 0);
    const seed = Number.parseInt(hashSecret(`${owned.value.id}|${String(id)}`).slice(0, 6), 16);
    this.repos.companies.saveEconomy(owned.value.id, {
      ...e,
      treasury: e.treasury - cost,
      staff: [
        ...e.staff,
        {
          id,
          nameIndex: seed % 1000,
          rank: 0,
          department: DEPARTMENTS[seed % DEPARTMENTS.length] ?? 'dev',
          awayUntil: 0,
        },
      ],
    });
    this.repos.companies.addFeed(owned.value.id, this.now(), 'npc_hired', {
      nameIndex: seed % 1000,
    });
    return this.detailOk(userId);
  }

  promoteStaff(userId: string, staffId: number): Result<CompanyDetail> {
    const owned = this.ownerCompany(userId);
    if (!owned.ok) return owned;
    const e = owned.value.economy;
    const staff = e.staff.find((s) => s.id === staffId);
    if (!staff) return fail('not_found');
    if (staff.rank >= 2) return fail('max_rank');
    const rank = (staff.rank + 1) as StaffRank;
    const cost = COMPANY.promoteCost[rank] ?? 0;
    if (e.treasury < cost) return fail('not_enough');
    this.repos.companies.saveEconomy(owned.value.id, {
      ...e,
      treasury: e.treasury - cost,
      staff: e.staff.map((s) => (s.id === staffId ? { ...s, rank } : s)),
    });
    this.repos.companies.addFeed(owned.value.id, this.now(), 'npc_promoted', {
      nameIndex: staff.nameIndex,
      rank,
    });
    return this.detailOk(userId);
  }

  resolveEvent(userId: string, choice: 0 | 1): Result<CompanyDetail> {
    const owned = this.ownerCompany(userId);
    if (!owned.ok) return owned;
    const company = owned.value;
    const today = this.today();
    const kind = company.eventDay === today ? null : companyEventFor(company.id, today);
    if (!kind) return fail('no_event');
    this.repos.transaction(() => {
      this.repos.companies.saveEconomy(
        company.id,
        applyCompanyEvent(company.economy, kind, choice, this.now()),
      );
      this.repos.companies.update(company.id, { eventDay: today });
      this.repos.companies.addFeed(company.id, this.now(), 'event', { kind, choice });
    });
    return this.detailOk(userId);
  }

  // ---------- Cửa hàng công ty (tiêu quỹ) ----------

  /** Mua đồ cho công ty: ghế massage, máy chơi game, decor bàn, đồng phục (kèm màu). */
  buyPerk(userId: string, perk: CompanyPerk, color?: number): Result<CompanyDetail> {
    const owned = this.ownerCompany(userId);
    if (!owned.ok) return owned;
    const company = owned.value;
    const e = company.economy;
    const perks = e.perks ?? [];
    if (perks.includes(perk)) return fail('owned');
    const cost = COMPANY_SHOP.perks[perk];
    if (e.treasury < cost) return fail('not_enough');
    this.repos.companies.saveEconomy(company.id, {
      ...e,
      treasury: e.treasury - cost,
      perks: [...perks, perk],
      ...(perk === 'uniform' ? { uniformColor: color ?? company.color } : {}),
    });
    this.repos.companies.addFeed(company.id, this.now(), 'perk_bought', { perk, cost });
    this.hooks.companyChanged?.(company.id);
    return this.detailOk(userId);
  }

  /** Đổi màu đồng phục (đã mua). Người đang mặc đổi màu theo. */
  recolorUniform(userId: string, color: number): Result<CompanyDetail> {
    const owned = this.ownerCompany(userId);
    if (!owned.ok) return owned;
    const company = owned.value;
    const e = company.economy;
    if (!(e.perks ?? []).includes('uniform')) return fail('not_found');
    if (e.uniformColor === color) return this.detailOk(userId);
    const cost = COMPANY_SHOP.uniformRecolor;
    if (e.treasury < cost) return fail('not_enough');
    this.repos.companies.saveEconomy(company.id, {
      ...e,
      treasury: e.treasury - cost,
      uniformColor: color,
    });
    this.refreshWearers(company);
    this.hooks.companyChanged?.(company.id);
    return this.detailOk(userId);
  }

  /** Đổi tên công ty (qua bộ lọc từ cấm và thương hiệu, không trùng công ty khác). */
  rename(userId: string, raw: string): Result<CompanyDetail> {
    const owned = this.ownerCompany(userId);
    if (!owned.ok) return owned;
    const company = owned.value;
    const name = checkCompanyName(raw);
    if (!name.ok) return fail('name', name.reason);
    const key = companyNameKey(name.name);
    const other = this.repos.companies.byNameKey(key);
    if (other && other.id !== company.id) return fail('name_taken');
    if (name.name === company.name) return this.detailOk(userId);
    const cost = COMPANY_SHOP.rename;
    if (company.economy.treasury < cost) return fail('not_enough');
    this.repos.transaction(() => {
      this.repos.companies.saveEconomy(company.id, {
        ...company.economy,
        treasury: company.economy.treasury - cost,
      });
      this.repos.companies.update(company.id, { name: name.name, nameKey: key });
      this.repos.companies.addFeed(company.id, this.now(), 'renamed', {
        from: company.name,
        name: name.name,
      });
    });
    this.hooks.companyChanged?.(company.id);
    return this.detailOk(userId);
  }

  /** Mỗi người (chủ hoặc nhân viên) tự chọn mặc đồng phục hay không. */
  wearUniform(userId: string, wear: boolean): Result<CompanyDetail> {
    const company = this.companyOf(userId);
    if (!company) return fail('not_found');
    const e = company.economy;
    if (!(e.perks ?? []).includes('uniform')) return fail('not_found');
    const code = playerCodeOf(userId);
    const others = (e.uniformOn ?? []).filter((c) => c !== code);
    this.repos.companies.saveEconomy(company.id, {
      ...e,
      uniformOn: wear ? [...others, code] : others,
    });
    this.hooks.profileChanged(userId);
    return this.detailOk(userId);
  }

  /** Người đang mặc đồng phục: cập nhật hồ sơ trong phòng (đổi màu áo). */
  private refreshWearers(company: CompanyRow): void {
    const codes = new Set(company.economy.uniformOn ?? []);
    const ids = [company.ownerId, ...this.repos.companies.members(company.id).map((m) => m.userId)];
    for (const id of ids) if (codes.has(playerCodeOf(id))) this.hooks.profileChanged(id);
  }

  upgrade(userId: string): Result<CompanyDetail> {
    const owned = this.ownerCompany(userId);
    if (!owned.ok) return owned;
    const e = owned.value.economy;
    const progress = stageProgress(e);
    if (progress.ipo) return fail('not_ready');
    if (!progress.ready) return fail('not_ready');
    this.repos.companies.saveEconomy(owned.value.id, { ...e, stage: e.stage + 1 });
    this.repos.companies.addFeed(owned.value.id, this.now(), 'stage_up', { stage: e.stage + 1 });
    return this.detailOk(userId);
  }

  /** IPO: huy hiệu vĩnh viễn, chọn ngành mới, bắt đầu lại từ Garage với thưởng ≤ 5% quỹ. */
  ipo(userId: string, industry: Industry): Result<CompanyDetail> {
    const owned = this.ownerCompany(userId);
    if (!owned.ok) return owned;
    const company = owned.value;
    const e = company.economy;
    const progress = stageProgress(e);
    if (e.stage < MAX_STAGE || !progress.ready) return fail('not_ipo');
    const bonus = ipoBonus(e.treasury);
    const count = company.ipoCount + 1;
    this.repos.transaction(() => {
      this.changeCoins(userId, bonus, 'company:ipo');
      this.repos.companies.addBadge(userId, `ipo-${String(count)}`, this.now());
      this.repos.companies.update(company.id, { industry, ipoCount: count });
      this.repos.companies.saveEconomy(company.id, {
        stage: 0,
        treasury: COMPANY.minCapital,
        reputation: 0,
        projectsDone: 0,
        staff: [],
        project: null,
        lastSettle: this.now(),
        // Đồ đã mua (phòng nghỉ, decor, đồng phục) giữ lại sau IPO.
        ...(e.perks ? { perks: e.perks } : {}),
        ...(e.uniformColor !== undefined ? { uniformColor: e.uniformColor } : {}),
        ...(e.uniformOn ? { uniformOn: e.uniformOn } : {}),
      });
      this.repos.companies.addFeed(company.id, this.now(), 'ipo', { count, bonus });
    });
    this.hooks.push(userId);
    return this.detailOk(userId);
  }

  /** Người chơi làm việc trong phòng công ty: XP thực nhận thành điểm công việc cho dự án. */
  contribute(userId: string, companyId: string, xp: number): void {
    if (xp <= 0 || !this.canEnter(userId, companyId)) return;
    const company = this.repos.companies.get(companyId);
    if (!company) return;
    const settled = this.settle(company);
    const result = addWork(settled.economy, xp * COMPANY.playerWorkPerXp);
    if (result.workAdded === 0) return;
    this.repos.companies.saveEconomy(company.id, result.economy);
    if (result.completed) {
      this.projectCompleted(company, result.completed, result.economy.projectsDone);
    }
  }

  /**
   * CEO đặt lộ trình công ty: các bậc (tên, cấp bắt đầu, đang tuyển), mốc chọn phòng ban / nhánh
   * (không sớm hơn mức chung), và bật/tắt nhận đơn. Tên bậc qua bộ lọc từ cấm.
   */
  setHiring(userId: string, ladder: CompanyLadder, hiring?: boolean): Result<CompanyDetail> {
    const owned = this.ownerCompany(userId);
    if (!owned.ok) return owned;
    const invalid = validateLadder(ladder);
    if (invalid) return fail(`ladder_${invalid}`);
    const steps = [];
    for (const step of ladder.steps) {
      const name = checkText(step.name, { maxLength: LADDER_NAME_MAX, blockBrands: true });
      if (!name.ok) return fail('name', name.reason);
      steps.push({ ...step, name: name.text });
    }
    this.repos.companies.update(owned.value.id, {
      hiringBands: JSON.stringify({ ...ladder, steps }),
      ...(hiring === undefined ? {} : { hiring }),
    });
    return this.detailOk(userId);
  }

  /** Các công ty đặt ở cùng một toà nhà (cho bản đồ toà nhà). */
  inBuilding(building: number): CompanyPublic[] {
    return this.repos.companies
      .all()
      .filter((c) => c.building === building)
      .map((c) => this.publicView(c));
  }

  // ---------- 6B: vào làm ở công ty người chơi khác ----------

  apply(userId: string, companyId: string): Result<number> {
    const company = this.repos.companies.get(companyId);
    if (!company) return fail('not_found');
    if (company.ownerId === userId) return fail('self');
    if (!company.hiring) return fail('not_hiring');
    // Người đã lên Senior thì tự mở công ty, không xin làm nhân viên.
    if (levelFor(this.state(userId).xp) >= BALANCE.company.unlockLevel) return fail('too_senior');
    if (this.repos.companies.isBanned(companyId, userId)) return fail('banned');
    // Cấp phải rơi vào một bậc đang tuyển trong lộ trình của công ty.
    if (entryStepFor(parseLadder(company.hiringBands), levelFor(this.state(userId).xp)) === null) {
      return fail('level_band');
    }
    if (this.repos.companies.member(userId)?.companyId === companyId) return fail('already');
    if (this.repos.companies.pendingOf(userId).some((a) => a.companyId === companyId)) {
      return fail('already');
    }
    if (
      this.repos.companies.applicationsSince(userId, this.now() - DAY_MS) >=
      COMPANY.applicationsPerDay
    ) {
      return fail('limit');
    }
    return ok(this.repos.companies.apply(companyId, userId, this.now()));
  }

  decide(ownerId: string, applicationId: number, approve: boolean): Result<CompanyDetail> {
    const owned = this.ownerCompany(ownerId);
    if (!owned.ok) return owned;
    const application = this.repos.companies.application(applicationId);
    if (application?.companyId !== owned.value.id || application.status !== 'pending') {
      return fail('not_found');
    }
    this.repos.companies.setApplication(applicationId, approve ? 'approved' : 'rejected');
    if (approve) this.join(application.userId, owned.value);
    return this.detailOk(ownerId);
  }

  createInvite(ownerId: string): Result<string> {
    const owned = this.ownerCompany(ownerId);
    if (!owned.ok) return owned;
    if (
      this.repos.companies.invitesSince(owned.value.id, this.now() - DAY_MS) >=
      COMPANY.invitesPerDay
    ) {
      return fail('limit');
    }
    const code = randomBytes(5).toString('hex').toUpperCase();
    this.repos.companies.addInvite(
      hashSecret(`invite|${code}`),
      owned.value.id,
      this.now(),
      this.now() + INVITE_TTL_MS,
      1,
    );
    return ok(code);
  }

  joinByCode(userId: string, rawCode: string): Result<CompanyDetail> {
    const code = rawCode.trim().toUpperCase();
    if (levelFor(this.state(userId).xp) >= BALANCE.company.unlockLevel) return fail('too_senior');
    if (this.repos.companies.byOwner(userId)) return fail('self');
    const companyId = this.repos.companies.useInvite(hashSecret(`invite|${code}`), this.now());
    const company = companyId ? this.repos.companies.get(companyId) : null;
    if (!company) return fail('bad_code');
    if (company.ownerId === userId) return fail('self');
    if (this.repos.companies.isBanned(company.id, userId)) return fail('banned');
    this.join(userId, company);
    return this.detailOk(userId);
  }

  private join(userId: string, company: CompanyRow): void {
    const previous = this.repos.companies.member(userId);
    if (previous && previous.companyId !== company.id) this.hooks.evict(userId, previous.companyId);
    // Phát hiện cơ bản tài khoản phụ: cùng IP băm với chủ thì không nhận thưởng thăng chức.
    const ownerIp = this.repos.users.ipHash(company.ownerId);
    const suspicious = ownerIp !== null && ownerIp === this.repos.users.ipHash(userId);
    this.repos.transaction(() => {
      this.repos.companies.addMember({
        userId,
        companyId: company.id,
        role: 0,
        joinedAt: this.now(),
        suspicious,
        lastPromoDay: null,
      });
      for (const a of this.repos.companies.pendingOf(userId))
        this.repos.companies.setApplication(a.id, 'withdrawn');
      this.setState(userId, { ...this.state(userId), employer: `company:${company.id}` });
      this.repos.companies.addFeed(company.id, this.now(), 'member_joined', {
        name: this.repos.characters.get(userId)?.name ?? '',
      });
    });
    this.hooks.push(userId);
  }

  /** Rời công ty đang làm (bất cứ lúc nào). Chủ không rời được công ty của mình. */
  leave(userId: string): Result {
    if (this.repos.companies.byOwner(userId)) return fail('self');
    const member = this.repos.companies.member(userId);
    this.repos.transaction(() => {
      if (member) {
        this.repos.companies.removeMember(userId);
        this.repos.companies.addFeed(member.companyId, this.now(), 'member_left', {
          name: this.repos.characters.get(userId)?.name ?? '',
        });
      }
      this.setState(userId, { ...this.state(userId), employer: null });
    });
    if (member) this.hooks.evict(userId, member.companyId);
    this.hooks.push(userId);
    return ok(undefined);
  }

  /**
   * Giải thể công ty (công cụ dev): mọi người (chủ và nhân viên) về làm ở Văn phòng Công Sở,
   * bị đưa ra khỏi phòng công ty, rồi xoá công ty.
   */
  dissolve(companyId: string): boolean {
    const company = this.repos.companies.get(companyId);
    if (!company) return false;
    const people = [
      company.ownerId,
      ...this.repos.companies.members(companyId).map((m) => m.userId),
    ];
    this.repos.transaction(() => {
      for (const userId of people) {
        if (this.repos.progress.get(userId)) {
          this.setState(userId, { ...this.state(userId), employer: DEFAULT_EMPLOYER });
        }
      }
      this.repos.companies.deleteCompany(companyId);
    });
    for (const userId of people) {
      this.hooks.evict(userId, companyId);
      this.hooks.push(userId);
      this.hooks.profileChanged(userId);
    }
    return true;
  }

  /** Tìm công ty theo tên (không phân biệt hoa thường, dấu cách thừa). */
  findByName(name: string): CompanyRow | null {
    return this.repos.companies.byNameKey(companyNameKey(name));
  }

  /** Quay lại Văn phòng Công Sở (công ty NPC mặc định). */
  rejoinDefault(userId: string): Result {
    if (this.repos.companies.byOwner(userId) || this.repos.companies.member(userId))
      return fail('employed');
    this.setState(userId, { ...this.state(userId), employer: DEFAULT_EMPLOYER });
    this.hooks.push(userId);
    return ok(undefined);
  }

  kick(ownerId: string, code: string, ban: boolean): Result<CompanyDetail> {
    const owned = this.ownerCompany(ownerId);
    if (!owned.ok) return owned;
    const member = this.repos.companies
      .members(owned.value.id)
      .find((m) => playerCodeOf(m.userId) === code);
    if (!member) return fail('not_member');
    this.repos.transaction(() => {
      this.repos.companies.removeMember(member.userId);
      if (ban) this.repos.companies.ban(owned.value.id, member.userId);
      this.setState(member.userId, { ...this.state(member.userId), employer: null });
      this.repos.companies.addFeed(owned.value.id, this.now(), 'member_left', {
        name: this.repos.characters.get(member.userId)?.name ?? '',
      });
    });
    this.hooks.evict(member.userId, owned.value.id);
    this.hooks.push(member.userId);
    return this.detailOk(ownerId);
  }

  /**
   * Chủ xét thăng chức (vai trò trong công ty). Thưởng XP đi qua luật trong shared
   * (sự kiện company-promotion, tối đa 1 lần/ngày); không thưởng nếu nghi tài khoản phụ hoặc mới vào.
   */
  promoteMember(ownerId: string, code: string): Result<CompanyDetail> {
    const owned = this.ownerCompany(ownerId);
    if (!owned.ok) return owned;
    const member = this.repos.companies
      .members(owned.value.id)
      .find((m) => playerCodeOf(m.userId) === code);
    if (!member) return fail('not_member');
    if (member.role >= 2) return fail('max_rank');
    const today = this.today();
    const role = member.role + 1;
    const eligible =
      !member.suspicious &&
      member.lastPromoDay !== today &&
      this.now() - member.joinedAt >= COMPANY.promotionMinDays * DAY_MS;
    this.repos.companies.setRole(member.userId, role, today);
    if (eligible) {
      const player = { userId: member.userId, timeZone: 'Asia/Ho_Chi_Minh' };
      this.engine.grant(player.userId, makeEvent('company-promotion', this.now(), 0, { role }));
    }
    this.repos.companies.addFeed(owned.value.id, this.now(), 'member_promoted', {
      name: this.repos.characters.get(member.userId)?.name ?? '',
      role,
    });
    this.hooks.push(member.userId);
    return this.detailOk(ownerId);
  }

  /** Giao việc cho nhân viên thật: thêm vào việc trong ngày của họ (theo giới hạn 3 việc/ngày). */
  assignTask(ownerId: string, code: string, templateId: string): Result<CompanyDetail> {
    const owned = this.ownerCompany(ownerId);
    if (!owned.ok) return owned;
    const member = this.repos.companies
      .members(owned.value.id)
      .find((m) => playerCodeOf(m.userId) === code);
    if (!member) return fail('not_member');
    const template = MISSION_TEMPLATES.find((t) => t.id === templateId);
    if (!template) return fail('not_found');
    const mission = startMission(template, this.now());
    const assigned = this.engine.assignMission(member.userId, mission);
    if (!assigned) return fail('busy');
    this.hooks.push(member.userId);
    this.hooks.missionAssigned?.(member.userId, mission);
    return this.detailOk(ownerId);
  }

  // ---------- Offer từ công ty NPC ----------

  private maybeOffer(userId: string, state: ProgressState): void {
    // Chỉ người đang làm ở công ty NPC hoặc công ty người chơi còn nhỏ mới nhận offer.
    if (this.repos.companies.byOwner(userId)) return;
    const member = this.repos.companies.member(userId);
    if (member) {
      const company = this.repos.companies.get(member.companyId);
      if (company && company.economy.stage > 1) return;
    } else if (state.employer === null) return;
    if (levelFor(state.xp) >= BALANCE.company.unlockLevel) return;
    if (this.repos.companies.offers(userId).length > 0) return;
    const last = this.repos.companies.lastOfferAt(userId);
    if (last !== null && this.now() - last < OFFER_EVERY_MS) return;
    if (last === null && this.now() - (this.repos.users.byId(userId)?.createdAt ?? 0) < DAY_MS)
      return;
    const pick =
      NPC_COMPANIES[
        Number.parseInt(hashSecret(`${userId}|${String(this.now())}`).slice(0, 4), 16) %
          NPC_COMPANIES.length
      ] ?? 'Bánh Mì Sáng Tạo';
    this.repos.companies.addOffer(userId, pick, this.now());
  }

  decideOffer(userId: string, offerId: number, accept: boolean): Result {
    const offer = this.repos.companies.offers(userId).find((o) => o.id === offerId);
    if (!offer) return fail('not_found');
    this.repos.companies.setOffer(offerId, accept ? 'accepted' : 'declined');
    if (accept) {
      const member = this.repos.companies.member(userId);
      if (member) {
        this.repos.companies.removeMember(userId);
        this.hooks.evict(userId, member.companyId);
      }
      this.setState(userId, acceptOffer(this.state(userId), `npc:${offer.companyName}`));
      this.hooks.profileChanged(userId);
    }
    this.hooks.push(userId);
    return ok(undefined);
  }

  private detailOk(userId: string): Result<CompanyDetail> {
    const detail = this.detail(userId);
    return detail ? ok(detail) : fail('not_found');
  }
}
