// Hồ sơ công khai của người chơi trong phòng, đọc từ DB (không tin client).
import {
  DEFAULT_APPEARANCE,
  jobTagFor,
  levelFor,
  parseBands,
  titleFor,
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

/** Chức danh theo nơi làm: chủ công ty là CEO, nhân viên theo khung cấp của công ty. */
export function jobOf(repos: Repositories, userId: string, level: number): JobTag {
  if (repos.companies.byOwner(userId))
    return jobTagFor({ owner: true, bands: parseBands(null) }, level);
  const member = repos.companies.member(userId);
  const company = member ? repos.companies.get(member.companyId) : null;
  return company
    ? jobTagFor({ owner: false, bands: parseBands(company.hiringBands) }, level)
    : null;
}
