// Luật thuần của các mini-game công quả.
export type ChoreKind = 'water' | 'wipe' | 'tidy' | 'unjam';

/** Thời gian mỗi trò (giây). */
export const CHORE_SECONDS: Readonly<Record<ChoreKind, number>> = {
  water: 10,
  wipe: 8,
  tidy: 8,
  unjam: 6,
};

/** Vạch xanh của bình tưới (tỉ lệ mực nước). */
export const WATER_ZONE = { min: 0.7, max: 0.92 } as const;
/** Tổng quãng chà (px) để lau sạch. */
export const WIPE_TARGET = 1800;
export const UNJAM_TAPS = 12;
export const TIDY_CUPS = 5;

export function waterResult(level: number): 'low' | 'ok' | 'over' {
  if (level > WATER_ZONE.max) return 'over';
  if (level >= WATER_ZONE.min) return 'ok';
  return 'low';
}

/** Vị trí cốc bẩn (phần trăm khung), không chồng lên nhau. */
export function newTidyCups(rng: () => number, count = TIDY_CUPS): { x: number; y: number }[] {
  const cups: { x: number; y: number }[] = [];
  let guard = 0;
  while (cups.length < count && guard < 500) {
    guard += 1;
    const cup = { x: 5 + rng() * 80, y: 10 + rng() * 70 };
    if (cups.every((c) => Math.hypot(c.x - cup.x, c.y - cup.y) > 18)) cups.push(cup);
  }
  return cups;
}

/** Máy in có kẹt giấy lần này không (kẹt thì thành công quả gỡ kẹt). */
export function printerJams(rng: () => number): boolean {
  return rng() < 0.35;
}
