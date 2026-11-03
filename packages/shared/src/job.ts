// Chức danh đang hiển thị phụ thuộc nơi làm:
// - Văn phòng chung (Công Sở / công ty NPC): thang 13 chức danh tự lên theo cấp.
// - Tự mở công ty: CEO.
// - Làm ở công ty người chơi khác: tên bậc trong lộ trình CEO đặt, theo cấp hiện tại.
// Cấp (XP) là của người chơi, không mất khi đổi chỗ làm; chỉ chức danh đổi theo nơi làm.
import { stepName, type CompanyLadder } from './hiring';
import { titleName, type Branch } from './levels';

/** Tên chức danh ở nơi làm (CEO hoặc tên bậc của công ty); null = thang chức danh chung. */
export type JobTag = string | null;

export const CEO_TITLE = 'CEO';

/** Công ty người chơi đang làm (null nếu làm ở văn phòng chung). */
export interface Workplace {
  owner: boolean;
  ladder: CompanyLadder;
}

export function jobTagFor(workplace: Workplace | null, level: number): JobTag {
  if (!workplace) return null;
  return workplace.owner ? CEO_TITLE : stepName(workplace.ladder, level);
}

/** Tên chức danh để hiển thị. `title` là bậc trong thang chung (dùng khi job = null). */
export function jobName(job: JobTag, title: number, branch: Branch | null): string {
  return job ?? titleName(title, branch);
}
