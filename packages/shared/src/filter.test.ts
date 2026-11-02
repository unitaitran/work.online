import { describe, expect, it } from 'vitest';
import { checkText, foldText } from './filter';

const check = (text: string) => checkText(text, { maxLength: 140 });

describe('bộ lọc nội dung', () => {
  it('chuẩn hoá: bỏ dấu, chữ thường, leet', () => {
    expect(foldText('Đi LÀM Ônline!!')).toBe('di lam online');
    expect(foldText('G00gl3')).toBe('google');
  });

  it('cho qua câu bình thường, kể cả chữ trùng khi bỏ dấu', () => {
    for (const text of [
      'Hôm nay họp lâu quá trời',
      'Các bạn ơi cà phê hết rồi',
      'Buổi chiều buồn ngủ ghê',
      'Sếp khen báo cáo lớn quá',
      'Deadline dí sát nút 😭',
      'Mình thích làm việc thông minh',
    ]) {
      expect(check(text)).toEqual({ ok: true, text });
    }
  });

  it('chặn từ tục (có dấu, không dấu, leet, viết dính)', () => {
    expect(check('đ m sếp')).toMatchObject({ ok: true });
    expect(check('dm sếp')).toEqual({ ok: false, reason: 'profanity' });
    expect(check('VCL thật')).toEqual({ ok: false, reason: 'profanity' });
    expect(check('what the fuck')).toEqual({ ok: false, reason: 'profanity' });
    expect(check('m0th3rfuck3r')).toEqual({ ok: false, reason: 'profanity' });
    expect(check('đồ ngu')).toEqual({ ok: false, reason: 'profanity' });
  });

  it('chặn thương hiệu thật (tuỳ chọn)', () => {
    expect(check('Công ty Google mới')).toEqual({ ok: false, reason: 'brand' });
    expect(check('G.o.o.g.l.e')).toEqual({ ok: false, reason: 'brand' });
    expect(check('Vinamilk 2')).toEqual({ ok: false, reason: 'brand' });
    expect(checkText('Google', { maxLength: 24, blockBrands: false })).toMatchObject({ ok: true });
  });

  it('chặn số điện thoại, đường dẫn, email', () => {
    expect(check('gọi mình 0912 345 678')).toEqual({ ok: false, reason: 'phone' });
    expect(check('+84 912345678')).toEqual({ ok: false, reason: 'phone' });
    expect(check('vào https://abc.xyz nha')).toEqual({ ok: false, reason: 'link' });
    expect(check('ghé shop-cua-toi.vn')).toEqual({ ok: false, reason: 'link' });
    expect(check('mail a.b@c.com')).toEqual({ ok: false, reason: 'email' });
    expect(check('họp lúc 10 giờ 30 phút')).toMatchObject({ ok: true });
  });

  it('rỗng, quá dài', () => {
    expect(check('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(check('a'.repeat(141))).toEqual({ ok: false, reason: 'too_long' });
    expect(check('😀'.repeat(140))).toMatchObject({ ok: true });
  });
});
