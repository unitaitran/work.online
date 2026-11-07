// Cửa hàng (Phase 5A): danh mục tự thiết kế, giá theo đường cong "món đầu mua được sau 1-2 ngày
// chơi, món hiếm cần khoảng 3 tuần chơi đều". Xu chỉ là điểm trong game, không quy đổi tiền thật.
import { z } from 'zod';

export type ItemCategory = 'top' | 'hat' | 'accessory' | 'desk' | 'chair' | 'pet';
export const ITEM_CATEGORIES: readonly ItemCategory[] = [
  'top',
  'hat',
  'accessory',
  'desk',
  'chair',
  'pet',
];

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic';

export type ItemBuffType =
  | 'focus_xp'
  | 'task_xp'
  | 'coffee_xp'
  | 'chore_xp'
  | 'idle_xp'
  | 'streak_bonus'
  | 'lines_xp'
  | 'reputation';

export interface ItemBuff {
  type: ItemBuffType;
  percent?: number;
  flat?: number;
  description: string;
}

/** Ô trang bị: mỗi ô một món; đồ bàn được đặt tối đa DESK_SLOTS món. */
export type EquipSlot = 'top' | 'hat' | 'accessory' | 'chair' | 'pet' | 'desk';
export const DESK_SLOTS = 3;

/** Hình dáng dựng bằng code (client tra theo `model`). */
export interface ShopItem {
  id: string;
  name: string;
  category: ItemCategory;
  price: number;
  rarity: Rarity;
  /** Chức danh tối thiểu để mua (nếu có). */
  minTitle?: number | undefined;
  /** Mã hình (client dựng theo mã này) và màu chính. */
  model: string;
  color: number;
  description: string;
  /** Tính năng / hiệu ứng hỗ trợ (nếu có). */
  buff?: ItemBuff | undefined;
}

type Row = [
  id: string,
  name: string,
  category: ItemCategory,
  price: number,
  rarity: Rarity,
  model: string,
  color: number,
  description: string,
  minTitle?: number | undefined,
  buff?: ItemBuff | undefined,
];

const ROWS: readonly Row[] = [
  // Áo (đổi màu bộ đồ đang mặc)
  [
    'top-mint',
    'Áo thun bạc hà',
    'top',
    90,
    'common',
    'tint',
    0x9fe0c8,
    'Mát mắt cả ngày deadline.',
  ],
  ['top-peach', 'Áo đào sữa', 'top', 90, 'common', 'tint', 0xffc4a8, 'Dịu dàng như email cảm ơn.'],
  [
    'top-sky',
    'Sơ mi trời xanh',
    'top',
    140,
    'common',
    'tint',
    0x8fc7ff,
    'Nhìn là thấy muốn đi họp.',
  ],
  [
    'top-lemon',
    'Áo chanh vàng',
    'top',
    140,
    'common',
    'tint',
    0xffe27a,
    'Năng lượng sáng thứ Hai.',
  ],
  [
    'top-lilac',
    'Áo len tím oải hương',
    'top',
    260,
    'uncommon',
    'tint',
    0xc9b2ee,
    'Ấm áp như sếp khen.',
    undefined,
    { type: 'idle_xp', percent: 5, description: '+5% XP khi ngồi máy' },
  ],
  [
    'top-forest',
    'Áo khoác xanh rừng',
    'top',
    420,
    'uncommon',
    'tint',
    0x4f8a64,
    'Phong cách dân văn phòng đi phượt.',
    undefined,
    { type: 'chore_xp', percent: 10, description: '+10% XP công quả' },
  ],
  [
    'top-night',
    'Vest đêm sao',
    'top',
    1200,
    'rare',
    'tint',
    0x29305a,
    'Dành cho buổi thuyết trình quan trọng.',
    7,
    { type: 'focus_xp', percent: 15, description: '+15% XP gõ phím tập trung' },
  ],
  [
    'top-gold',
    'Vest ánh kim',
    'top',
    3000,
    'epic',
    'tint',
    0xd8b25a,
    'Chỉ dành cho người đã lên Senior.',
    13,
    { type: 'streak_bonus', percent: 25, description: '+25% thưởng chuỗi chấm công' },
  ],
  // Nón
  ['hat-cap', 'Nón lưỡi trai', 'hat', 120, 'common', 'cap', 0xff8a65, 'Đội ngược cho ngầu.'],
  [
    'hat-beanie',
    'Nón len',
    'hat',
    160,
    'common',
    'beanie',
    0x6c8ed4,
    'Phòng lạnh điều hoà.',
    undefined,
    { type: 'idle_xp', percent: 5, description: '+5% XP khi ngồi máy' },
  ],
  [
    'hat-bucket',
    'Nón tai bèo',
    'hat',
    220,
    'uncommon',
    'bucket',
    0xe8d9a8,
    'Sẵn sàng đi team building.',
    undefined,
    { type: 'task_xp', percent: 10, description: '+10% XP lật task' },
  ],
  [
    'hat-party',
    'Nón sinh nhật',
    'hat',
    300,
    'uncommon',
    'party',
    0xff7eb6,
    'Ngày nào cũng là ngày vui.',
    undefined,
    { type: 'coffee_xp', percent: 15, description: '+15% XP tặng cà phê' },
  ],
  [
    'hat-chef',
    'Mũ đầu bếp pantry',
    'hat',
    520,
    'rare',
    'chef',
    0xfdfdfd,
    'Chủ xị pha cà phê.',
    undefined,
    { type: 'coffee_xp', percent: 25, description: '+25% XP tặng cà phê' },
  ],
  [
    'hat-crown',
    'Vương miện giấy',
    'hat',
    2600,
    'epic',
    'crown',
    0xf2c14e,
    'Vua chấm công đúng giờ.',
    9,
    { type: 'streak_bonus', percent: 20, description: '+20% thưởng chuỗi chấm công' },
  ],
  [
    'hat-sprout',
    'Mầm cây trên đầu',
    'hat',
    680,
    'rare',
    'sprout',
    0x7cc576,
    'Ý tưởng đang nảy mầm.',
    undefined,
    { type: 'chore_xp', percent: 20, description: '+20% XP công quả' },
  ],
  // Phụ kiện
  [
    'acc-glasses',
    'Kính cận tròn',
    'accessory',
    100,
    'common',
    'glasses',
    0x3a3340,
    'Nhìn rõ từng con số KPI.',
    undefined,
    { type: 'task_xp', percent: 10, description: '+10% XP lật task' },
  ],
  [
    'acc-sunglasses',
    'Kính râm',
    'accessory',
    240,
    'uncommon',
    'sunglasses',
    0x1e1e24,
    'Deadline không làm mình lóa mắt.',
    undefined,
    { type: 'lines_xp', percent: 15, description: '+15% XP viết thư công sở' },
  ],
  [
    'acc-headphones',
    'Tai nghe chống ồn',
    'accessory',
    360,
    'uncommon',
    'headphones',
    0x4a4f5c,
    'Chế độ tập trung bật.',
    undefined,
    { type: 'focus_xp', percent: 15, description: '+15% XP gõ phím tập trung' },
  ],
  [
    'acc-scarf',
    'Khăn quàng',
    'accessory',
    180,
    'common',
    'scarf',
    0xd9534f,
    'Gió máy lạnh mạnh quá.',
  ],
  ['acc-tie', 'Cà vạt chấm bi', 'accessory', 150, 'common', 'tie', 0x5a7bd6, 'Lịch sự mà vẫn vui.'],
  [
    'acc-bowtie',
    'Nơ cổ',
    'accessory',
    280,
    'uncommon',
    'bowtie',
    0xe0575b,
    'Chuẩn bị lên sân khấu tất niên.',
    undefined,
    { type: 'coffee_xp', percent: 10, description: '+10% XP tặng cà phê' },
  ],
  [
    'acc-backpack',
    'Ba lô công sở',
    'accessory',
    450,
    'rare',
    'backpack',
    0x6b8f71,
    'Đựng đủ sạc, ô, và đồ ăn vặt.',
    undefined,
    { type: 'task_xp', percent: 15, description: '+15% XP lật task' },
  ],
  [
    'acc-lanyard',
    'Dây đeo thẻ vàng',
    'accessory',
    1800,
    'epic',
    'lanyard',
    0xf2c14e,
    'Thẻ VIP ra vào mọi tầng.',
    8,
    { type: 'reputation', flat: 1, description: '+1 Uy tín khi giúp đồng nghiệp' },
  ],
  // Đồ bàn
  [
    'desk-cactus',
    'Xương rồng mini',
    'desk',
    80,
    'common',
    'cactus',
    0x6fb36a,
    'Không cần tưới mỗi ngày.',
    undefined,
    { type: 'chore_xp', percent: 15, description: '+15% XP công quả' },
  ],
  [
    'desk-mug',
    'Cốc "Sếp số 1"',
    'desk',
    100,
    'common',
    'mug',
    0xffffff,
    'Tặng chính mình.',
    undefined,
    { type: 'coffee_xp', percent: 20, description: '+20% XP tặng cà phê' },
  ],
  [
    'desk-lamp',
    'Đèn bàn',
    'desk',
    200,
    'common',
    'lamp',
    0xffd479,
    'Ánh sáng cho đêm chạy báo cáo.',
    undefined,
    { type: 'focus_xp', percent: 10, description: '+10% XP gõ phím tập trung' },
  ],
  [
    'desk-nameplate',
    'Bảng tên gỗ',
    'desk',
    160,
    'common',
    'nameplate',
    0xb07a4a,
    'Để ai cũng biết bàn của bạn.',
    undefined,
    { type: 'reputation', flat: 1, description: '+1 Uy tín khi giúp đồng nghiệp' },
  ],
  [
    'desk-frame',
    'Khung ảnh gia đình',
    'desk',
    240,
    'uncommon',
    'frame',
    0xe8b4b8,
    'Động lực mỗi ngày.',
    undefined,
    { type: 'idle_xp', percent: 10, description: '+10% XP khi ngồi máy' },
  ],
  [
    'desk-bonsai',
    'Cây bonsai',
    'desk',
    640,
    'rare',
    'bonsai',
    0x5f9e5a,
    'Kiên nhẫn như chờ duyệt ngân sách.',
    undefined,
    { type: 'chore_xp', percent: 25, description: '+25% XP công quả' },
  ],
  [
    'desk-globe',
    'Quả địa cầu',
    'desk',
    520,
    'rare',
    'globe',
    0x5aa0d8,
    'Mơ về chuyến công tác nước ngoài.',
    undefined,
    { type: 'lines_xp', percent: 20, description: '+20% XP viết thư công sở' },
  ],
  [
    'desk-trophy',
    'Cúp nhân viên xuất sắc',
    'desk',
    2400,
    'epic',
    'trophy',
    0xf2c14e,
    'Ai cũng xứng đáng một lần.',
    6,
    { type: 'task_xp', percent: 25, description: '+25% XP lật task' },
  ],
  [
    'desk-duck',
    'Vịt cao su gỡ lỗi',
    'desk',
    120,
    'common',
    'duck',
    0xffd34d,
    'Kể lỗi cho vịt nghe là ra.',
    undefined,
    { type: 'task_xp', percent: 15, description: '+15% XP lật task' },
  ],
  // Ghế
  [
    'chair-cushion',
    'Ghế có gối tựa',
    'chair',
    300,
    'common',
    'cushion',
    0xf2a07b,
    'Lưng đỡ mỏi hơn hẳn.',
    undefined,
    { type: 'idle_xp', percent: 10, description: '+10% XP khi ngồi máy' },
  ],
  [
    'chair-gaming',
    'Ghế công thái học',
    'chair',
    900,
    'uncommon',
    'gaming',
    0x3d4a6b,
    'Ngồi cả ngày không mệt.',
    undefined,
    { type: 'idle_xp', percent: 20, description: '+20% XP khi ngồi máy' },
  ],
  [
    'chair-bean',
    'Ghế lười',
    'chair',
    1400,
    'rare',
    'bean',
    0x8fc7ff,
    'Thư giãn sau giờ họp.',
    undefined,
    { type: 'coffee_xp', percent: 20, description: '+20% XP tặng cà phê' },
  ],
  [
    'chair-throne',
    'Ghế giám đốc da',
    'chair',
    3200,
    'epic',
    'throne',
    0x5a3a2a,
    'Chỗ ngồi của Senior.',
    13,
    { type: 'idle_xp', percent: 35, description: '+35% XP khi ngồi máy' },
  ],
  // Thú cưng
  [
    'pet-cat',
    'Mèo văn phòng',
    'pet',
    1100,
    'rare',
    'cat',
    0xf2b880,
    'Hay nằm lên bàn phím.',
    undefined,
    { type: 'lines_xp', percent: 25, description: '+25% XP viết thư công sở' },
  ],
  [
    'pet-dog',
    'Cún giữ cửa',
    'pet',
    1100,
    'rare',
    'dog',
    0xd9a066,
    'Vẫy đuôi mỗi lần bạn chấm công.',
    undefined,
    { type: 'streak_bonus', percent: 20, description: '+20% thưởng chuỗi chấm công' },
  ],
  [
    'pet-cactus',
    'Xương rồng biết nhìn',
    'pet',
    700,
    'uncommon',
    'cactuspet',
    0x6fb36a,
    'Luôn quay về phía bạn.',
    undefined,
    { type: 'chore_xp', percent: 15, description: '+15% XP công quả' },
  ],
  [
    'pet-fish',
    'Bể cá cảnh',
    'pet',
    900,
    'uncommon',
    'fishtank',
    0x8fd3ff,
    'Ngắm cá cho dịu mắt.',
    undefined,
    { type: 'focus_xp', percent: 15, description: '+15% XP gõ phím tập trung' },
  ],
  [
    'pet-robot',
    'Robot hút bụi',
    'pet',
    2800,
    'epic',
    'robot',
    0xdfe4ea,
    'Dọn sạch vụn bánh quy.',
    5,
    { type: 'chore_xp', percent: 30, description: '+30% XP công quả' },
  ],
];

export const SHOP_ITEMS: readonly ShopItem[] = ROWS.map(
  ([id, name, category, price, rarity, model, color, description, minTitle, buff]) => ({
    id,
    name,
    category,
    price,
    rarity,
    model,
    color,
    description,
    ...(minTitle !== undefined ? { minTitle } : {}),
    ...(buff !== undefined ? { buff } : {}),
  }),
);

const BY_ID = new Map(SHOP_ITEMS.map((item) => [item.id, item]));

export function shopItem(id: string): ShopItem | null {
  return BY_ID.get(id) ?? null;
}

/** Ô trang bị của một món. */
export function slotOf(item: ShopItem): EquipSlot {
  return item.category;
}

/** Trang bị đang dùng: mỗi ô một món (đồ bàn tối đa DESK_SLOTS). */
export interface Equipment {
  top: string | null;
  hat: string | null;
  accessory: string | null;
  chair: string | null;
  pet: string | null;
  desk: string[];
}

export const EMPTY_EQUIPMENT: Equipment = {
  top: null,
  hat: null,
  accessory: null,
  chair: null,
  pet: null,
  desk: [],
};

/** Danh sách id đang trang bị (gửi cho người khác trong phòng). */
export function equippedIds(e: Equipment): string[] {
  return [e.top, e.hat, e.accessory, e.chair, e.pet, ...e.desk].filter(
    (id): id is string => id !== null,
  );
}

/** Đọc lại trang bị từ danh sách id (dữ liệu từ server), bỏ id lạ. */
export function equipmentFromIds(ids: readonly string[]): Equipment {
  const e: Equipment = { ...EMPTY_EQUIPMENT, desk: [] };
  for (const id of ids) {
    const item = shopItem(id);
    if (!item) continue;
    if (item.category === 'desk') {
      if (e.desk.length < DESK_SLOTS && !e.desk.includes(id)) e.desk.push(id);
    } else {
      e[item.category] = id;
    }
  }
  return e;
}

export const buyRequestSchema = z.strictObject({ itemId: z.string().min(1).max(40) });
export const equipRequestSchema = z.strictObject({
  itemId: z.string().min(1).max(40),
  equip: z.boolean(),
});

export type ShopError = 'unknown_item' | 'owned' | 'not_enough_coins' | 'locked' | 'not_owned';

export interface InventoryResponse {
  coins: number;
  owned: string[];
  equipped: string[];
}
