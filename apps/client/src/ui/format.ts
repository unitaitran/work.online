/** Giờ dạng HH:MM:SS theo kiểu Việt Nam. `timeZone` để trống thì dùng giờ máy. */
export function formatClock(epochMs: number, timeZone?: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  }).format(epochMs);
}
