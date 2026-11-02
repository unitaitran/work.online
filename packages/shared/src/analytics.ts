// Thống kê ẩn danh (Phase 7): chỉ đếm số lần mỗi loại sự kiện mỗi ngày. Không cookie,
// không id người chơi, không IP. Người chơi tắt được; trình duyệt bật Do Not Track thì mặc định tắt.
import { z } from 'zod';

export const ANALYTICS_EVENTS = [
  'session_start',
  'office_enter',
  'shop_open',
  'company_open',
  'wall_open',
  'leaderboard_open',
  'brag_open',
] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export const analyticsRequestSchema = z.strictObject({ event: z.enum(ANALYTICS_EVENTS) });
