// Hồ sơ công khai của người chơi trong phòng, đọc từ DB (không tin client).
import {
  DEFAULT_APPEARANCE,
  jobTagFor,
  levelFor,
  parseLadder,
  titleFor,
  ladderUnlockLevels,
  type CareerUnlock,
  type JobTag,
  type PlayerProfile,
} from '@dilam/shared';
import { playerCodeOf } from '../auth/secrets';
import type { Repositories } from '../db/repositories';

export function publicProfile(repos: Repositories, userId: string): Omit<PlayerProfile, 'sid'> {
  const character = repos.characters.get(userId);
  const progress = repos.progress.get(userId);
  const code = playerCodeOf(userId);
  return {
    code,
    name: character?.name ?? code,
    appearance: character?.appearance ?? DEFAULT_APPEARANCE,
    title: progress ? titleFor(progress.state.xp) : 1,
    branch: progress?.state.branch ?? null,
    job: jobOf(repos, userId, progress ? levelFor(progress.state.xp) : 1),
    equipped: repos.inventory.equipped(userId),
  };
}

/** Chức danh theo nơi làm: chủ công ty là CEO, nhân viên theo bậc trong lộ trình công ty. */
export function jobOf(repos: Repositories, userId: string, level: number): JobTag {
  if (repos.companies.byOwner(userId)) {
    return jobTagFor({ owner: true, ladder: parseLadder(null) }, level);
  }
  const member = repos.companies.member(userId);
  const company = member ? repos.companies.get(member.companyId) : null;
  return company
    ? jobTagFor({ owner: false, ladder: parseLadder(company.hiringBands) }, level)
    : null;
}

/** Mốc chọn phòng ban / nhánh: nhân viên công ty người chơi theo lộ trình CEO đặt. */
export function careerUnlockOf(repos: Repositories, userId: string): CareerUnlock | undefined {
  if (repos.companies.byOwner(userId)) return undefined;
  const member = repos.companies.member(userId);
  const company = member ? repos.companies.get(member.companyId) : null;
  return company ? ladderUnlockLevels(parseLadder(company.hiringBands)) : undefined;
}
