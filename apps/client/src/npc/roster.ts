import { HAIR_COLORS, HAIR_STYLES, OUTFITS, SKIN_TONES } from '../avatar/appearance';
import { pick, randomVietnameseName } from '../avatar/names';
import type { NpcSpec } from './npcAgent';
import { seededRng } from './schedule';

/** Bàn làm việc riêng của 3 đồng nghiệp (các bàn còn lại để người chơi ngồi). */
const NPC_DESKS = ['desk-1', 'desk-8', 'desk-12'];

/** Bàn cho nhân viên NPC của công ty người chơi (rải đều phòng; tối đa 10 NPC). */
const STAFF_DESKS = [
  'desk-1',
  'desk-8',
  'desk-12',
  'desk-4',
  'desk-17',
  'desk-20',
  'desk-6',
  'desk-15',
  'desk-22',
  'desk-10',
];

/** Tên nhân viên NPC theo mã tên (giống danh sách nhân sự trong bảng công ty). */
export function staffName(nameIndex: number): string {
  return randomVietnameseName(seededRng(nameIndex + 17));
}

/** NPC ở phòng công ty: đúng số nhân viên NPC đang đi làm, đúng tên trong bảng nhân sự. */
export function createStaffRoster(staff: readonly { id: number; nameIndex: number }[]): NpcSpec[] {
  return staff.slice(0, STAFF_DESKS.length).map((member, i) => {
    const rng = seededRng(member.nameIndex * 31 + 7);
    return {
      id: `staff-${String(member.id)}`,
      name: staffName(member.nameIndex),
      deskId: STAFF_DESKS[i] ?? 'desk-1',
      appearance: {
        skin: Math.floor(rng() * SKIN_TONES.length),
        hairStyle: pick(HAIR_STYLES, rng),
        hairColor: Math.floor(rng() * HAIR_COLORS.length),
        outfit: pick(OUTFITS, rng),
      },
    };
  });
}

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
