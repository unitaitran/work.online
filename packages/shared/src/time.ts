// Ngày theo lịch ("YYYY-MM-DD") dùng chung cho client và server.
// Mọi luật theo ngày (chấm công, giới hạn XP, quẻ, kỳ đánh giá) so sánh khoá ngày này,
// không so mili giây, nên không lệch vì giờ mùa hè hay đổi múi giờ.

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Khoá ngày theo lịch ở múi giờ `timeZone` (mặc định: múi giờ của máy). */
export function dayKey(date: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(date);
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function isDayKey(value: unknown): value is string {
  return typeof value === 'string' && DAY_KEY.test(value);
}

function utcOf(key: string): number {
  const m = DAY_KEY.exec(key);
  if (!m) return Number.NaN;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Số ngày lịch từ `from` tới `to` (âm nếu `to` đứng trước). */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcOf(to) - utcOf(from)) / 86_400_000);
}

/** Cộng `days` ngày vào một khoá ngày. */
export function addDays(key: string, days: number): string {
  const d = new Date(utcOf(key) + days * 86_400_000);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getUTCFullYear())}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
