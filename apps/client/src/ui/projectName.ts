// Tên dự án theo ngành (tách riêng để main.ts dùng mà không kéo cả bảng công ty vào gói đầu).
import { STRINGS } from '../strings';

/** Tên dự án theo ngành và chỉ số tên (dùng cho danh sách, bảng tin, thông báo). */
export function projectNameOf(industry: string, nameIndex: number): string {
  const names = STRINGS.company.project.names[industry] ?? [];
  return names[nameIndex % Math.max(1, names.length)] ?? '';
}
