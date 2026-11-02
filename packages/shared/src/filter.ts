// Bộ lọc nội dung do người chơi nhập (tên, tường than thở, tên công ty).
// Chuẩn hoá (bỏ dấu, chữ thường, đổi ký tự kiểu "leet") rồi so với danh sách chặn.
// Danh sách tự soạn, cố ý ngắn và có thể mở rộng; đây là lớp lọc cơ bản, kèm báo cáo và quản trị.

export type FilterReason =
  'empty' | 'too_long' | 'profanity' | 'brand' | 'phone' | 'link' | 'email';

export type FilterResult = { ok: true; text: string } | { ok: false; reason: FilterReason };

/**
 * Từ tục, xúc phạm (tiếng Việt không dấu và tiếng Anh). Từ ngắn so theo từ, từ dài so cả chuỗi dính.
 * Tránh từ trùng với chữ thường gặp khi bỏ dấu (ví dụ "lớn", "các", "buổi").
 */
const PROFANITY = [
  'dit',
  'djt',
  'dcm',
  'dmm',
  'dm',
  'vcl',
  'vkl',
  'vl',
  'cl',
  'clm',
  'cho chet',
  'do ngu',
  'oc cho',
  'thang ngu',
  'cave',
  'fuck',
  'fucking',
  'shit',
  'bitch',
  'asshole',
  'dick',
  'pussy',
  'cunt',
  'bastard',
  'motherfucker',
  'nigger',
  'retard',
];

/** Tên công ty, thương hiệu có thật (không dùng trong game). */
export const BLOCKED_BRANDS = [
  'google',
  'facebook',
  'meta',
  'apple',
  'microsoft',
  'amazon',
  'samsung',
  'tiktok',
  'bytedance',
  'shopee',
  'lazada',
  'tiki',
  'grab',
  'gojek',
  'viettel',
  'vinamilk',
  'vingroup',
  'vinfast',
  'vietcombank',
  'techcombank',
  'mobifone',
  'vnpt',
  'fpt',
  'masan',
  'momo',
  'zalo',
  'netflix',
  'nvidia',
  'tesla',
  'starbucks',
  'highlands',
  'phuc long',
  'trung nguyen',
  'the coffee house',
  'cocacola',
  'coca cola',
  'pepsi',
  'honda',
  'toyota',
  'yamaha',
  'sony',
  'nokia',
  'oppo',
  'xiaomi',
  'huawei',
  'openai',
  'anthropic',
];

const LEET: Readonly<Record<string, string>> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

/** Chữ thường, bỏ dấu tiếng Việt, đổi ký tự leet; giữ chữ, số và khoảng trắng. */
export function foldText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[013457@$]/g, (ch) => LEET[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matches(folded: string, list: readonly string[]): boolean {
  const words = ` ${folded} `;
  const compact = folded.replace(/ /g, '');
  return list.some((entry) => {
    const term = foldText(entry);
    if (words.includes(` ${term} `)) return true;
    // Từ dài (≥ 6 chữ) còn bắt cả khi viết dính hoặc chèn ký tự: "g.o.o.g.l.e", "fuckk".
    const termCompact = term.replace(/ /g, '');
    return termCompact.length >= 6 && compact.includes(termCompact);
  });
}

const PHONE = /(?:\+?84|0)(?:[\s.-]?\d){8,10}/;
const LINK = /(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|vn|io|me|ly|gg|xyz|info|co)\b/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;

export interface FilterOptions {
  maxLength: number;
  /** Có chặn tên thương hiệu thật không (tên công ty, tường chung: có). */
  blockBrands?: boolean;
}

/** Kiểm tra một đoạn văn bản người chơi nhập. Trả về văn bản đã gộp khoảng trắng nếu hợp lệ. */
export function checkText(raw: string, options: FilterOptions): FilterResult {
  const text = raw.normalize('NFC').replace(/\p{C}/gu, '').replace(/\s+/g, ' ').trim();
  if (text === '') return { ok: false, reason: 'empty' };
  if (Array.from(text).length > options.maxLength) return { ok: false, reason: 'too_long' };
  if (EMAIL.test(text)) return { ok: false, reason: 'email' };
  if (LINK.test(text)) return { ok: false, reason: 'link' };
  if (PHONE.test(text.replace(/[()]/g, ''))) return { ok: false, reason: 'phone' };
  const folded = foldText(text);
  if (matches(folded, PROFANITY)) return { ok: false, reason: 'profanity' };
  if (options.blockBrands !== false && matches(folded, BLOCKED_BRANDS)) {
    return { ok: false, reason: 'brand' };
  }
  return { ok: true, text };
}
