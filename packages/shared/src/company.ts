// Công ty (Phase 6): điều kiện mở, các giai đoạn, dự án, nhân viên NPC, sự kiện công ty, IPO.
// Mọi hằng số cân bằng ở COMPANY; server tính, client chỉ hiển thị. Không có kết cục thua cứng:
// tiền quỹ không bao giờ âm, offline lâu chỉ không tăng.
import type { CompanyPerk } from './companyShop';
import { z } from 'zod';
import { BALANCE } from './balance';
import { checkText, foldText } from './filter';
import { levelFor, xpForLevel, MAX_LEVEL } from './levels';
import { PROVINCE_IDS } from './provinces';
import type { ProgressState } from './progress';
import { hashString, seededRng } from './rng';

// ---------------------------------------------------------------------------
// Cấu hình
// ---------------------------------------------------------------------------

export type Industry = 'tech' | 'cafe' | 'commerce' | 'creative';
export const INDUSTRIES: readonly Industry[] = ['tech', 'cafe', 'commerce', 'creative'];

export const COMPANY_COLORS = [
  0xff8a65, 0x6c8ed4, 0x5fb27a, 0xb48cf2, 0xf2c14e, 0xe0575b, 0x4fb3bf, 0x8a6a4a,
] as const;
export const COMPANY_ICONS = [
  'star',
  'leaf',
  'rocket',
  'cup',
  'gear',
  'heart',
  'diamond',
  'sun',
] as const;
export type CompanyIcon = (typeof COMPANY_ICONS)[number];

export type StaffRank = 0 | 1 | 2;
/** Thực tập sinh, nhân viên, chuyên viên cao cấp. */
export const STAFF_RANKS: readonly StaffRank[] = [0, 1, 2];

export interface StageConfig {
  /** Số nhân viên NPC tối đa. */
  maxStaff: number;
  /** Số người chơi tối đa trong phòng công ty. */
  roomCapacity: number;
  /** Độ khó dự án tối đa nhận được. */
  maxDifficulty: number;
  /** Điều kiện lên giai đoạn tiếp theo (hoặc IPO ở giai đoạn cuối). */
  next: { projects: number; reputation: number; staff: number; reserve: number };
}

export const COMPANY = {
  /** Vốn tối thiểu; vốn thật = max(minCapital, capitalShare × tổng xu đã kiếm). */
  minCapital: 800,
  capitalShare: 0.25,
  nameMax: 32,
  /** Giai đoạn: Garage, Co-working, Công ty nhỏ, Công ty vừa, Tập đoàn. */
  stages: [
    {
      maxStaff: 2,
      roomCapacity: 6,
      maxDifficulty: 2,
      next: { projects: 4, reputation: 20, staff: 1, reserve: 500 },
    },
    {
      maxStaff: 4,
      roomCapacity: 10,
      maxDifficulty: 3,
      next: { projects: 10, reputation: 70, staff: 3, reserve: 1500 },
    },
    {
      maxStaff: 7,
      roomCapacity: 20,
      maxDifficulty: 4,
      next: { projects: 20, reputation: 170, staff: 6, reserve: 4000 },
    },
    {
      maxStaff: 11,
      roomCapacity: 30,
      maxDifficulty: 5,
      next: { projects: 34, reputation: 330, staff: 9, reserve: 9000 },
    },
    {
      maxStaff: 15,
      roomCapacity: 40,
      maxDifficulty: 5,
      next: { projects: 50, reputation: 520, staff: 12, reserve: 16000 },
    },
  ] as readonly StageConfig[],
  /** Điểm công việc mỗi giờ của NPC theo cấp (thực tập, nhân viên, cao cấp). */
  staffWorkPerHour: [1.2, 2.2, 3.4] as readonly number[],
  /** Lương mỗi giờ (xu, trừ vào quỹ). */
  staffSalaryPerHour: [0.4, 0.8, 1.3] as readonly number[],
  hireCost: [150, 0, 0] as readonly number[],
  promoteCost: [0, 300, 700] as readonly number[],
  /** Gộp tối đa chừng này giờ mỗi lần tính (offline lâu chỉ không tăng). */
  maxSettleHours: 24,
  /** Điểm công việc từ hoạt động của người chơi trong phòng công ty: 1 điểm / XP thực nhận. */
  playerWorkPerXp: 1,
  /** Thưởng IPO tối đa (tỉ lệ quỹ chuyển cho chủ). */
  ipoBonusShare: 0.05,
  /** Số dự án mời thầu mỗi ngày; mỗi dự án chỉ làm được một lần trong ngày. */
  offersPerDay: 5,
  /** Chống lạm dụng. */
  applicationsPerDay: 5,
  invitesPerDay: 10,
  /** Thưởng thăng chức trong công ty (XP), tối đa một lần mỗi ngày mỗi người, chỉ khi đã vào ≥ 3 ngày. */
  promotionXp: 30,
  promotionMinDays: 3,
  /** Offer từ công ty khác: giảm nhẹ uy tín. */
  offerReputationLoss: 0.1,
} as const;

export const MAX_STAGE = COMPANY.stages.length - 1;

const FIRST_STAGE: StageConfig = {
  maxStaff: 2,
  roomCapacity: 6,
  maxDifficulty: 2,
  next: { projects: 4, reputation: 20, staff: 1, reserve: 500 },
};

export function stageConfig(stage: number): StageConfig {
  return COMPANY.stages[Math.min(Math.max(stage, 0), MAX_STAGE)] ?? FIRST_STAGE;
}

// ---------------------------------------------------------------------------
// Mở công ty
// ---------------------------------------------------------------------------

export type CompanyBlocker = 'level' | 'employed' | 'capital' | 'owner';

/** Vốn cần để mở công ty. */
export function requiredCapital(totalEarned: number): number {
  return Math.max(COMPANY.minCapital, Math.floor(totalEarned * COMPANY.capitalShare));
}

export function canOpenCompany(
  state: ProgressState,
  options: { totalEarned?: number; ownsCompany?: boolean } = {},
): { ok: boolean; missing: CompanyBlocker[]; capital: number } {
  const missing: CompanyBlocker[] = [];
  const capital = requiredCapital(options.totalEarned ?? 0);
  if (levelFor(state.xp) < BALANCE.company.unlockLevel) missing.push('level');
  // Phải rời công ty đang làm trước khi mở công ty riêng.
  if (state.employer !== null) missing.push('employed');
  if (options.totalEarned !== undefined && state.coins < capital) missing.push('capital');
  if (options.ownsCompany) missing.push('owner');
  return { ok: missing.length === 0, missing, capital };
}

/** Nghỉ việc ở công ty hiện tại (giữ nguyên cấp, XP, chức danh). */
export function leaveCompany(state: ProgressState): ProgressState {
  return state.employer === null ? state : { ...state, employer: null };
}

/** Toà nhà còn chỗ cho công ty mới không (mỗi công ty một tầng). */
export function buildingHasRoom(companiesInBuilding: number): boolean {
  return companiesInBuilding < BALANCE.company.maxCompaniesPerBuilding;
}

export const foundCompanyRequestSchema = z.strictObject({
  name: z.string().min(1).max(120),
  industry: z.enum(INDUSTRIES as [Industry, ...Industry[]]),
  color: z
    .number()
    .int()
    .min(0)
    .max(COMPANY_COLORS.length - 1),
  icon: z.enum(COMPANY_ICONS),
  /** Tỉnh/thành đặt trụ sở (thiếu thì mặc định TP. Hồ Chí Minh). */
  province: z.enum(PROVINCE_IDS).optional(),
});
export type FoundCompanyRequest = z.infer<typeof foundCompanyRequestSchema>;

/** Kiểm tra tên công ty: bộ lọc từ cấm + thương hiệu thật. Trả tên đã chuẩn hoá. */
export function checkCompanyName(
  raw: string,
): { ok: true; name: string } | { ok: false; reason: string } {
  const result = checkText(raw, { maxLength: COMPANY.nameMax, blockBrands: true });
  return result.ok ? { ok: true, name: result.text } : { ok: false, reason: result.reason };
}

/** Khoá so trùng tên (không phân biệt hoa thường, dấu). */
export function companyNameKey(name: string): string {
  return foldText(name).replace(/ /g, '');
}

// ---------------------------------------------------------------------------
// Dự án
// ---------------------------------------------------------------------------

export interface ProjectOffer {
  id: string;
  /** Chỉ số tên trong danh sách tên dự án theo ngành (client có chuỗi). */
  nameIndex: number;
  difficulty: number;
  /** Điểm công việc cần. */
  work: number;
  /** Thưởng xu vào quỹ công ty. */
  reward: number;
  reputation: number;
}

export function projectWork(difficulty: number): number {
  return Math.round(160 * difficulty ** 1.35);
}

export function projectReward(difficulty: number): number {
  return Math.round(150 * difficulty ** 1.5);
}

/**
 * Thưởng xu cho nhân viên khi công ty xong dự án, trừ từ quỹ công ty (không tự sinh xu): theo độ
 * khó (1–5) và vai trò. Thực tập sinh (vai trò 0) không được thưởng.
 */
export const PROJECT_BONUS_COINS: Readonly<Record<number, readonly number[]>> = {
  1: [3, 4, 5, 6, 7],
  2: [5, 6, 8, 9, 10],
};

export function projectBonusCoins(difficulty: number, role: number): number {
  const table = PROJECT_BONUS_COINS[Math.min(2, role)];
  if (!table) return 0;
  return table[Math.max(1, Math.min(5, Math.round(difficulty))) - 1] ?? 0;
}

/** Ba dự án mời thầu mỗi ngày, theo hạt giống (công ty, ngày) nên server tái tạo được. */
export function projectOffers(companyId: string, day: string, stage: number): ProjectOffer[] {
  const rng = seededRng(hashString(`projects|${companyId}|${day}`));
  const max = stageConfig(stage).maxDifficulty;
  return Array.from({ length: COMPANY.offersPerDay }, (_, i) => {
    const difficulty = Math.max(1, Math.min(max, Math.ceil(rng() * max)));
    return {
      id: `${day}-${String(i)}`,
      nameIndex: Math.floor(rng() * 1000),
      difficulty,
      work: projectWork(difficulty),
      reward: projectReward(difficulty),
      reputation: difficulty * 3,
    };
  });
}

// ---------------------------------------------------------------------------
// Trạng thái công ty và tính theo giờ
// ---------------------------------------------------------------------------

export interface NpcStaff {
  id: number;
  nameIndex: number;
  rank: StaffRank;
  department: string;
  /** Đang nghỉ phép tới lúc này (sự kiện "nhân viên xin nghỉ"). */
  awayUntil: number;
}

export interface CompanyEconomy {
  stage: number;
  treasury: number;
  reputation: number;
  projectsDone: number;
  staff: NpcStaff[];
  /** Dự án đang làm. */
  project: (ProjectOffer & { progress: number }) | null;
  lastSettle: number;
  /** Đồ đã mua ở cửa hàng công ty. */
  perks?: CompanyPerk[];
  /** Màu đồng phục (chỉ số COMPANY_COLORS). */
  uniformColor?: number;
  /** Mã nhân viên công khai của những người đang chọn mặc đồng phục. */
  uniformOn?: string[];
  /** Mã các dự án mời thầu đã xong (mã có ngày, chỉ giữ của hôm nay). Bản lưu cũ không có. */
  doneOffers?: string[];
}

/** Dự án mời thầu này đã làm xong hôm nay chưa. */
export function offerDone(economy: CompanyEconomy, offerId: string): boolean {
  return economy.doneOffers?.includes(offerId) ?? false;
}

export interface SettleResult {
  economy: CompanyEconomy;
  /** Dự án vừa xong (nếu có). */
  completed: ProjectOffer | null;
  workAdded: number;
  salaryPaid: number;
}

function sameOfferDay(a: string, b: string): boolean {
  return a.slice(0, a.lastIndexOf('-')) === b.slice(0, b.lastIndexOf('-'));
}

/** Cộng điểm công việc vào dự án đang làm; xong thì nhận thưởng. */
export function addWork(economy: CompanyEconomy, points: number): SettleResult {
  const project = economy.project;
  if (!project || points <= 0) {
    return { economy, completed: null, workAdded: 0, salaryPaid: 0 };
  }
  const progress = Math.min(project.work, project.progress + points);
  if (progress < project.work) {
    return {
      economy: { ...economy, project: { ...project, progress } },
      completed: null,
      workAdded: points,
      salaryPaid: 0,
    };
  }
  return {
    economy: {
      ...economy,
      project: null,
      treasury: economy.treasury + project.reward,
      reputation: economy.reputation + project.reputation,
      projectsDone: economy.projectsDone + 1,
      // Chỉ giữ mã của cùng ngày với dự án vừa xong (mã dạng "ngày-số").
      doneOffers: [
        ...(economy.doneOffers ?? []).filter((id) => sameOfferDay(id, project.id)),
        project.id,
      ],
    },
    completed: project,
    workAdded: points,
    salaryPaid: 0,
  };
}

/**
 * Tính theo giờ thật từ lần trước: NPC làm việc và nhận lương. Gộp tối đa 24 giờ mỗi lần
 * (offline lâu chỉ không tăng). Quỹ không đủ trả lương thì NPC chỉ làm phần được trả (không âm).
 */
export function settleEconomy(economy: CompanyEconomy, now: number): SettleResult {
  const hours = Math.min(
    COMPANY.maxSettleHours,
    Math.max(0, (now - economy.lastSettle) / 3_600_000),
  );
  if (hours <= 0) return { economy, completed: null, workAdded: 0, salaryPaid: 0 };
  const working = economy.staff.filter((s) => s.awayUntil <= now);
  // Không có dự án thì NPC nghỉ, không trả lương.
  if (!economy.project || working.length === 0) {
    return {
      economy: { ...economy, lastSettle: now },
      completed: null,
      workAdded: 0,
      salaryPaid: 0,
    };
  }
  const salary =
    working.reduce((sum, s) => sum + (COMPANY.staffSalaryPerHour[s.rank] ?? 0), 0) * hours;
  const paidShare = salary > 0 ? Math.min(1, economy.treasury / salary) : 1;
  const salaryPaid = Math.floor(salary * paidShare);
  const work =
    working.reduce((sum, s) => sum + (COMPANY.staffWorkPerHour[s.rank] ?? 0), 0) *
    hours *
    paidShare;
  const paid = { ...economy, treasury: economy.treasury - salaryPaid, lastSettle: now };
  const result = addWork(paid, work);
  return { ...result, salaryPaid };
}

export type StageBlocker = 'projects' | 'reputation' | 'staff' | 'reserve' | 'max';

export function stageProgress(economy: CompanyEconomy): {
  ready: boolean;
  missing: StageBlocker[];
  ipo: boolean;
} {
  const cfg = stageConfig(economy.stage);
  const missing: StageBlocker[] = [];
  if (economy.projectsDone < cfg.next.projects) missing.push('projects');
  if (economy.reputation < cfg.next.reputation) missing.push('reputation');
  if (economy.staff.length < cfg.next.staff) missing.push('staff');
  if (economy.treasury < cfg.next.reserve) missing.push('reserve');
  return { ready: missing.length === 0, missing, ipo: economy.stage >= MAX_STAGE };
}

/** Thưởng IPO cho chủ: tối đa 5% quỹ. */
export function ipoBonus(treasury: number): number {
  return Math.floor(treasury * COMPANY.ipoBonusShare);
}

// ---------------------------------------------------------------------------
// Sự kiện công ty (có lựa chọn, không có kết cục thua)
// ---------------------------------------------------------------------------

export type CompanyEventKind = 'client_cancel' | 'rush_deadline' | 'staff_leave';
export const COMPANY_EVENT_KINDS: readonly CompanyEventKind[] = [
  'client_cancel',
  'rush_deadline',
  'staff_leave',
];

/** Áp lựa chọn (0 hoặc 1) của một sự kiện công ty. Mọi kết quả đều không làm số liệu âm. */
export function applyCompanyEvent(
  economy: CompanyEconomy,
  kind: CompanyEventKind,
  choice: 0 | 1,
  now: number,
): CompanyEconomy {
  const project = economy.project;
  switch (kind) {
    case 'client_cancel':
      // 0: thương lượng giữ khách (tốn chút quỹ, giữ dự án); 1: chấp nhận (dự án dừng, được bồi thường).
      if (choice === 0) {
        return {
          ...economy,
          treasury: Math.max(0, economy.treasury - 50),
          reputation: economy.reputation + 2,
        };
      }
      return {
        ...economy,
        project: null,
        treasury: economy.treasury + (project ? Math.floor(project.reward * 0.3) : 0),
      };
    case 'rush_deadline':
      // 0: tăng ca (thêm tiến độ, tốn lương làm thêm); 1: xin gia hạn (mất chút uy tín).
      if (choice === 0 && project) {
        return {
          ...economy,
          treasury: Math.max(0, economy.treasury - 80),
          project: {
            ...project,
            progress: Math.min(project.work, project.progress + project.work * 0.2),
          },
        };
      }
      return { ...economy, reputation: Math.max(0, economy.reputation - 2) };
    case 'staff_leave': {
      // 0: duyệt nghỉ một ngày (người đó tạm vắng); 1: thưởng để giữ chân (tốn quỹ).
      const staff = economy.staff[0];
      if (!staff) return economy;
      if (choice === 0) {
        return {
          ...economy,
          staff: economy.staff.map((s, i) => (i === 0 ? { ...s, awayUntil: now + 86_400_000 } : s)),
        };
      }
      return {
        ...economy,
        treasury: Math.max(0, economy.treasury - 120),
        reputation: economy.reputation + 1,
      };
    }
  }
}

/** Có sự kiện công ty hôm nay không (khoảng 1/3 số ngày), chọn theo hạt giống. */
export function companyEventFor(companyId: string, day: string): CompanyEventKind | null {
  const rng = seededRng(hashString(`company-event|${companyId}|${day}`));
  if (rng() > 0.35) return null;
  return COMPANY_EVENT_KINDS[Math.floor(rng() * COMPANY_EVENT_KINDS.length)] ?? null;
}

// ---------------------------------------------------------------------------
// Offer (Phase 6B)
// ---------------------------------------------------------------------------

/** Công ty NPC (tên tự đặt, không có thật) gửi offer cho người chơi. */
export const NPC_COMPANIES = [
  'Bánh Mì Sáng Tạo',
  'Ốc Sên Logistics',
  'Cú Đêm Studio',
  'Gió Lào Media',
  'Hạt Tiêu Tech',
] as const;

/** Nhận offer: lên ngay một cấp, đổi công ty, giảm nhẹ uy tín. */
export function acceptOffer(state: ProgressState, employer: string): ProgressState {
  const level = levelFor(state.xp);
  const xp = level >= MAX_LEVEL ? state.xp : xpForLevel(level + 1);
  return {
    ...state,
    xp,
    employer,
    reputation: Math.max(0, Math.floor(state.reputation * (1 - COMPANY.offerReputationLoss))),
  };
}

export const companyRoomKind = (companyId: string): string => `company:${companyId}`;
