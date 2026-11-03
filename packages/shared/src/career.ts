// Lựa chọn sự nghiệp: phòng ban và nhánh, mỗi thứ chọn một lần. Mặc định mở theo mức chung
// (GLOBAL_UNLOCK); làm ở công ty người chơi thì theo lộ trình CEO đặt (không sớm hơn mức chung).
import { GLOBAL_UNLOCK } from './hiring';
import { levelFor, type Branch, type Department } from './levels';
import type { ProgressState } from './progress';

/** Cấp mở khoá chọn phòng ban / nhánh (mặc định: mức chung). */
export interface CareerUnlock {
  department: number;
  branch: number;
}

export function needsDepartment(
  state: ProgressState,
  unlock: CareerUnlock = GLOBAL_UNLOCK,
): boolean {
  return levelFor(state.xp) >= unlock.department && state.department === null;
}

export function needsBranch(state: ProgressState, unlock: CareerUnlock = GLOBAL_UNLOCK): boolean {
  return levelFor(state.xp) >= unlock.branch && state.branch === null;
}

export function chooseDepartment(
  state: ProgressState,
  department: Department,
  unlock: CareerUnlock = GLOBAL_UNLOCK,
): ProgressState {
  return needsDepartment(state, unlock) ? { ...state, department } : state;
}

export function chooseBranch(
  state: ProgressState,
  branch: Branch,
  unlock: CareerUnlock = GLOBAL_UNLOCK,
): ProgressState {
  return needsBranch(state, unlock) ? { ...state, branch } : state;
}
