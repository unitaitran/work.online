// 34 đơn vị hành chính cấp tỉnh (6 thành phố trực thuộc trung ương + 28 tỉnh) để chọn nơi đặt
// trụ sở công ty. Toạ độ (vĩ độ, kinh độ) gần đúng của trung tâm hành chính, chỉ để vẽ chấm
// trên bản đồ sơ đồ.
export type Region = 'north' | 'central' | 'south';

export interface Province {
  id: string;
  name: string;
  region: Region;
  /** Thành phố trực thuộc trung ương. */
  city: boolean;
  lat: number;
  lon: number;
}

const p = (
  id: string,
  name: string,
  region: Region,
  lat: number,
  lon: number,
  city = false,
): Province => ({ id, name, region, city, lat, lon });

export const PROVINCES: readonly Province[] = [
  // Miền Bắc
  p('ha-noi', 'Hà Nội', 'north', 21.03, 105.85, true),
  p('hai-phong', 'Hải Phòng', 'north', 20.86, 106.68, true),
  p('lai-chau', 'Lai Châu', 'north', 22.4, 103.46),
  p('dien-bien', 'Điện Biên', 'north', 21.39, 103.02),
  p('son-la', 'Sơn La', 'north', 21.33, 103.91),
  p('lang-son', 'Lạng Sơn', 'north', 21.85, 106.76),
  p('quang-ninh', 'Quảng Ninh', 'north', 20.95, 107.08),
  p('cao-bang', 'Cao Bằng', 'north', 22.67, 106.26),
  p('tuyen-quang', 'Tuyên Quang', 'north', 21.82, 105.21),
  p('lao-cai', 'Lào Cai', 'north', 21.72, 104.9),
  p('thai-nguyen', 'Thái Nguyên', 'north', 21.59, 105.85),
  p('phu-tho', 'Phú Thọ', 'north', 21.32, 105.4),
  p('bac-ninh', 'Bắc Ninh', 'north', 21.18, 106.07),
  p('hung-yen', 'Hưng Yên', 'north', 20.65, 106.05),
  p('ninh-binh', 'Ninh Bình', 'north', 20.25, 105.97),
  // Miền Trung và Tây Nguyên
  p('hue', 'Huế', 'central', 16.46, 107.59, true),
  p('da-nang', 'Đà Nẵng', 'central', 16.05, 108.2, true),
  p('thanh-hoa', 'Thanh Hóa', 'central', 19.81, 105.78),
  p('nghe-an', 'Nghệ An', 'central', 18.67, 105.68),
  p('ha-tinh', 'Hà Tĩnh', 'central', 18.34, 105.9),
  p('quang-tri', 'Quảng Trị', 'central', 17.47, 106.6),
  p('quang-ngai', 'Quảng Ngãi', 'central', 15.12, 108.8),
  p('gia-lai', 'Gia Lai', 'central', 13.77, 109.22),
  p('khanh-hoa', 'Khánh Hòa', 'central', 12.24, 109.19),
  p('lam-dong', 'Lâm Đồng', 'central', 11.94, 108.44),
  p('dak-lak', 'Đắk Lắk', 'central', 12.67, 108.04),
  // Miền Nam
  p('ho-chi-minh', 'TP. Hồ Chí Minh', 'south', 10.78, 106.7, true),
  p('can-tho', 'Cần Thơ', 'south', 10.03, 105.78, true),
  p('dong-nai', 'Đồng Nai', 'south', 10.95, 106.82),
  p('tay-ninh', 'Tây Ninh', 'south', 10.53, 106.41),
  p('vinh-long', 'Vĩnh Long', 'south', 10.25, 105.97),
  p('dong-thap', 'Đồng Tháp', 'south', 10.36, 106.36),
  p('ca-mau', 'Cà Mau', 'south', 9.18, 105.15),
  p('an-giang', 'An Giang', 'south', 10.01, 105.08),
];

export const PROVINCE_IDS = PROVINCES.map((province) => province.id) as [string, ...string[]];

export const DEFAULT_PROVINCE = 'ho-chi-minh';

export const REGION_NAMES: Readonly<Record<Region, string>> = {
  north: 'Miền Bắc',
  central: 'Miền Trung và Tây Nguyên',
  south: 'Miền Nam',
};

export function provinceOf(id: string): Province | null {
  return PROVINCES.find((province) => province.id === id) ?? null;
}
