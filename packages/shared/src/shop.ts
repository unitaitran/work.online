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
  minTitle?: number;
  /** Mã hình (client dựng theo mã này) và màu chính. */
  model: string;
  color: number;
  description: string;
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
  minTitle?: number,
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
  ],
  // Nón
  ['hat-cap', 'Nón lưỡi trai', 'hat', 120, 'common', 'cap', 0xff8a65, 'Đội ngược cho ngầu.'],
  ['hat-beanie', 'Nón len', 'hat', 160, 'common', 'beanie', 0x6c8ed4, 'Phòng lạnh điều hoà.'],
  [
    'hat-bucket',
    'Nón tai bèo',
    'hat',
    220,
    'uncommon',
    'bucket',
    0xe8d9a8,
    'Sẵn sàng đi team building.',
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
  ],
  ['hat-chef', 'Mũ đầu bếp pantry', 'hat', 520, 'rare', 'chef', 0xfdfdfd, 'Chủ xị pha cà phê.'],
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
  ],
  ['desk-mug', 'Cốc "Sếp số 1"', 'desk', 100, 'common', 'mug', 0xffffff, 'Tặng chính mình.'],
  [
    'desk-lamp',
    'Đèn bàn',
    'desk',
    200,
    'common',
    'lamp',
    0xffd479,
    'Ánh sáng cho đêm chạy báo cáo.',
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
  ],
  ['chair-bean', 'Ghế lười', 'chair', 1400, 'rare', 'bean', 0x8fc7ff, 'Thư giãn sau giờ họp.'],
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
  ],
  // Thú cưng
  ['pet-cat', 'Mèo văn phòng', 'pet', 1100, 'rare', 'cat', 0xf2b880, 'Hay nằm lên bàn phím.'],
  [
    'pet-dog',
    'Cún giữ cửa',
    'pet',
    1100,
    'rare',
    'dog',
    0xd9a066,
    'Vẫy đuôi mỗi lần bạn chấm công.',
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
  ],
  ['pet-fish', 'Bể cá cảnh', 'pet', 900, 'uncommon', 'fishtank', 0x8fd3ff, 'Ngắm cá cho dịu mắt.'],
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
  ],
];

export const SHOP_ITEMS: readonly ShopItem[] = ROWS.map(
  ([id, name, category, price, rarity, model, color, description, minTitle]) => ({
    id,
    name,
    category,
    price,
    rarity,
    model,
    color,
    description,
    ...(minTitle !== undefined ? { minTitle } : {}),
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
