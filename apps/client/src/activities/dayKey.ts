// Ngày theo lịch địa phương ("YYYY-MM-DD"). Mọi phép so sánh ngày (chấm công, quẻ KPI)
// đi qua khoá ngày này thay vì so mili giây, nên không bị lệch vì giờ mùa hè hay đổi múi giờ.

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

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDayKey(value: unknown): value is string {
  return typeof value === 'string' && DAY_KEY.test(value);
}

/** Số ngày lịch từ `from` tới `to` (âm nếu `to` đứng trước). Tính bằng UTC nên không dính giờ mùa hè. */
export function daysBetween(from: string, to: string): number {
  const a = DAY_KEY.exec(from);
  const b = DAY_KEY.exec(to);
  if (!a || !b) return Number.NaN;
  const utc = (m: RegExpExecArray): number =>
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}
