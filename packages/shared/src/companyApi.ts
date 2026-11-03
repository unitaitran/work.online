// Kiểu dữ liệu REST của công ty (Phase 6).
import { z } from 'zod';
import type {
  CompanyEconomy,
  CompanyEventKind,
  CompanyIcon,
  Industry,
  ProjectOffer,
  StageBlocker,
} from './company';
import type { CompanyLadder } from './hiring';

export interface CompanyPublic {
  id: string;
  name: string;
  industry: Industry;
  color: number;
  icon: CompanyIcon;
  stage: number;
  building: number;
  floor: number;
  members: number;
  hiring: boolean;
  /** Tỉnh/thành đặt trụ sở (id trong PROVINCES). */
  province: string;
  /** Khung cấp tuyển dụng theo vị trí. */
  /** Lộ trình công ty (các bậc, cấp bắt đầu, đang tuyển, mốc mở khoá). */
  hiringBands: CompanyLadder;
  ipoCount: number;
  /** Số người đang ở phòng công ty. */
  online: number;
}

export interface CompanyMemberView {
  /** Mã nhân viên công khai. */
  code: string;
  name: string;
  role: number;
  owner: boolean;
  title: number;
  /** Cấp hiện tại và vị trí theo khung tuyển dụng (chủ: null). */
  level: number;
  /** Tên bậc ở công ty (null: ngoài lộ trình). */
  position: string | null;
  joinedAt: number;
}

export interface CompanyApplicationView {
  id: number;
  code: string;
  name: string;
  title: number;
  level: number;
  /** Vị trí sẽ nhận nếu duyệt (theo khung hiện tại). */
  /** Bậc sẽ vào (null: cấp không hợp bậc nào đang tuyển). */
  position: string | null;
  at: number;
}

export interface CompanyFeedEntry {
  at: number;
  kind: string;
  /** Dữ liệu cho câu thông báo (client ghép chuỗi tiếng Việt). */
  data: Record<string, string | number>;
}

export interface CompanyDetail {
  company: CompanyPublic;
  isOwner: boolean;
  economy: CompanyEconomy;
  offers: ProjectOffer[];
  stage: { ready: boolean; missing: StageBlocker[]; ipo: boolean };
  event: CompanyEventKind | null;
  members: CompanyMemberView[];
  applications: CompanyApplicationView[];
  feed: CompanyFeedEntry[];
}

export interface JobOfferView {
  id: number;
  companyName: string;
  at: number;
}

export interface MyCompanyResponse {
  /** Công ty đang thuộc (chủ hoặc nhân viên); null nếu không. */
  detail: CompanyDetail | null;
  /** Điều kiện mở công ty riêng. */
  found: { ok: boolean; missing: string[]; capital: number };
  /** Công ty NPC đang làm (mặc định "may-hong", hoặc "npc:<tên>"). */
  employer: string | null;
  offers: JobOfferView[];
  badges: string[];
  pendingApplications: number[];
}

export const projectAcceptSchema = z.strictObject({ offerId: z.string().min(1).max(40) });
export const staffIdSchema = z.strictObject({ staffId: z.number().int().nonnegative() });
export const memberCodeSchema = z.strictObject({
  code: z.string().regex(/^NV-[0-9A-F]{6}$/),
  ban: z.boolean().optional(),
});
export const applySchema = z.strictObject({ companyId: z.string().min(1).max(40) });
export const decideApplicationSchema = z.strictObject({
  applicationId: z.number().int().nonnegative(),
  approve: z.boolean(),
});
export const inviteCodeSchema = z.strictObject({ code: z.string().min(6).max(20) });
export const eventChoiceSchema = z.strictObject({ choice: z.union([z.literal(0), z.literal(1)]) });
export const ipoSchema = z.strictObject({
  industry: z.enum(['tech', 'cafe', 'commerce', 'creative']),
});
export const assignTaskSchema = z.strictObject({
  code: z.string().regex(/^NV-[0-9A-F]{6}$/),
  templateId: z.string().min(1).max(40),
});
export const offerDecisionSchema = z.strictObject({
  offerId: z.number().int().nonnegative(),
  accept: z.boolean(),
});
