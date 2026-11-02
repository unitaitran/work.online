// Hồ sơ công khai của người chơi trong phòng, đọc từ DB (không tin client).
import { DEFAULT_APPEARANCE, titleFor, type PlayerProfile } from '@dilam/shared';
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
    equipped: repos.inventory.equipped(userId),
  };
}
