// Lựa chọn sự nghiệp: phòng ban (từ chức danh 3) và nhánh (từ chức danh 5). Mỗi thứ chọn một lần.
import { BALANCE } from './balance';
import { titleFor, type Branch, type Department } from './levels';
import type { ProgressState } from './progress';

export function needsDepartment(state: ProgressState): boolean {
  return titleFor(state.xp) >= BALANCE.departmentFromTitle && state.department === null;
}

export function needsBranch(state: ProgressState): boolean {
  return titleFor(state.xp) >= BALANCE.branchFromTitle && state.branch === null;
}

export function chooseDepartment(state: ProgressState, department: Department): ProgressState {
  return needsDepartment(state) ? { ...state, department } : state;
}

export function chooseBranch(state: ProgressState, branch: Branch): ProgressState {
  return needsBranch(state) ? { ...state, branch } : state;
}
