// Chức danh đang hiển thị phụ thuộc nơi làm:
// - Văn phòng chung (Mây Hồng / công ty NPC): thang 13 chức danh tự lên theo cấp.
// - Tự mở công ty: CEO.
// - Làm ở công ty người chơi khác: vị trí theo cấp hiện tại và khung cấp CEO đặt cho từng vị trí.
// Cấp (XP) là của người chơi, không mất khi đổi chỗ làm; chỉ chức danh đổi theo nơi làm.
import { POSITION_NAMES, memberPosition, type HiringBands, type Position } from './hiring';
import { titleName, type Branch } from './levels';

/** 'ceo' = chủ công ty; Position = nhân viên công ty người chơi; null = thang chức danh chung. */
export type JobTag = 'ceo' | Position | null;

export const CEO_TITLE = 'CEO';

/** Công ty người chơi đang làm (null nếu làm ở văn phòng chung). */
export interface Workplace {
  owner: boolean;
  bands: HiringBands;
}

export function jobTagFor(workplace: Workplace | null, level: number): JobTag {
  if (!workplace) return null;
  return workplace.owner ? 'ceo' : memberPosition(workplace.bands, level);
}

/** Tên chức danh để hiển thị. `title` là bậc trong thang chung (dùng khi job = null). */
export function jobName(job: JobTag, title: number, branch: Branch | null): string {
  if (job === 'ceo') return CEO_TITLE;
  if (job !== null) return POSITION_NAMES[job];
  return titleName(title, branch);
}
