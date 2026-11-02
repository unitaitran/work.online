import { HAIR_COLORS, HAIR_STYLES, OUTFITS, SKIN_TONES } from '../avatar/appearance';
import { pick, randomVietnameseName } from '../avatar/names';
import type { NpcSpec } from './npcAgent';
import { seededRng } from './schedule';

/** Bàn làm việc riêng của 3 đồng nghiệp (các bàn còn lại để người chơi ngồi). */
const NPC_DESKS = ['desk-1', 'desk-4', 'desk-6'];

/** 3 đồng nghiệp cố định, sinh từ hạt giống: tải lại trang vẫn là những người đó. */
export function createNpcRoster(seed = 2026): NpcSpec[] {
  const rng = seededRng(seed);
  const names = new Set<string>();
  return NPC_DESKS.map((deskId, i) => {
    let name = randomVietnameseName(rng);
    while (names.has(name)) name = randomVietnameseName(rng);
    names.add(name);
    return {
      id: `npc-${String(i)}`,
      name,
      deskId,
      appearance: {
        skin: Math.floor(rng() * SKIN_TONES.length),
        hairStyle: pick(HAIR_STYLES, rng),
        hairColor: Math.floor(rng() * HAIR_COLORS.length),
        outfit: OUTFITS[(i + 1) % OUTFITS.length] ?? 'shirt',
      },
    };
  });
}
