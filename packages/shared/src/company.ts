// Luật mở công ty (Phase 3 chỉ có điều kiện; mở công ty thật làm ở Phase 6).
// Thiết kế: một toà nhà có tối đa 30 công ty, mỗi công ty là một tầng = một server/phòng riêng.
import { BALANCE } from './balance';
import { levelFor } from './levels';
import type { ProgressState } from './progress';

export type CompanyBlocker = 'level' | 'employed';

export function canOpenCompany(state: ProgressState): { ok: boolean; missing: CompanyBlocker[] } {
  const missing: CompanyBlocker[] = [];
  if (levelFor(state.xp) < BALANCE.company.unlockLevel) missing.push('level');
  // Phải rời công ty đang làm trước khi mở công ty riêng.
  if (state.employer !== null) missing.push('employed');
  return { ok: missing.length === 0, missing };
}

/** Nghỉ việc ở công ty hiện tại (giữ nguyên cấp, XP, chức danh). */
export function leaveCompany(state: ProgressState): ProgressState {
  return state.employer === null ? state : { ...state, employer: null };
}

/** Toà nhà còn chỗ cho công ty mới không (mỗi công ty một tầng). */
export function buildingHasRoom(companiesInBuilding: number): boolean {
  return companiesInBuilding < BALANCE.company.maxCompaniesPerBuilding;
}
