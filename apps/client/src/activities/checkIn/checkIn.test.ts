import { describe, expect, it } from 'vitest';
import { daysBetween, dayKey } from '../dayKey';
import {
  checkIn,
  EMPTY_CHECK_IN,
  hasCheckedInToday,
  visibleStreak,
  type CheckInState,
} from './checkIn';

const VN = 'Asia/Ho_Chi_Minh'; // UTC+7
const LA = 'America/Los_Angeles'; // UTC-8 (mùa đông) / -7 (mùa hè)
const TOKYO = 'Asia/Tokyo'; // UTC+9

/** Chấm liên tiếp các mốc thời gian, trả về trạng thái cuối và danh sách kết quả. */
function run(times: [string, string?][], start: CheckInState = EMPTY_CHECK_IN) {
  let state = start;
  const statuses: string[] = [];
  for (const [iso, tz] of times) {
    const r = checkIn(state, new Date(iso), tz);
    statuses.push(r.status);
    state = r.state;
  }
  return { state, statuses };
}

describe('dayKey / daysBetween', () => {
  it('ngày theo lịch của múi giờ', () => {
    const t = new Date('2026-11-02T20:00:00Z');
    expect(dayKey(t, VN)).toBe('2026-11-03'); // 3:00 sáng ở VN
    expect(dayKey(t, LA)).toBe('2026-11-02'); // 12:00 trưa ở LA
  });

  it('khoảng cách ngày lịch, kể cả qua tháng, qua năm và năm nhuận', () => {
    expect(daysBetween('2026-11-02', '2026-11-03')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2026-11-03', '2026-11-02')).toBe(-1);
    expect(Number.isNaN(daysBetween('hỏng', '2026-11-02'))).toBe(true);
  });

  it('ngày đổi giờ mùa hè vẫn là 1 ngày', () => {
    expect(
      daysBetween(
        dayKey(new Date('2026-03-08T06:00:00Z'), LA),
        dayKey(new Date('2026-03-09T06:00:00Z'), LA),
      ),
    ).toBe(1);
  });
});

describe('chấm công', () => {
  it('lần đầu: chuỗi 1', () => {
    const { state, statuses } = run([['2026-11-02T01:00:00Z', VN]]);
    expect(statuses).toEqual(['checked']);
    expect(state).toMatchObject({ lastDay: '2026-11-02', streak: 1, total: 1 });
  });

  it('mỗi ngày chỉ một lần', () => {
    const { state, statuses } = run([
      ['2026-11-02T01:00:00Z', VN],
      ['2026-11-02T10:00:00Z', VN],
    ]);
    expect(statuses).toEqual(['checked', 'already']);
    expect(state.total).toBe(1);
  });

  it('ngày liên tiếp: chuỗi tăng; nghỉ một ngày: chuỗi về 1, tổng vẫn cộng', () => {
    const { state, statuses } = run([
      ['2026-11-02T01:00:00Z', VN],
      ['2026-11-03T01:00:00Z', VN],
      ['2026-11-04T01:00:00Z', VN],
      ['2026-11-06T01:00:00Z', VN],
    ]);
    expect(statuses).toEqual(['checked', 'checked', 'checked', 'checked']);
    expect(state).toMatchObject({ streak: 1, total: 4 });
  });

  it('qua nửa đêm địa phương là ngày mới (dù UTC chưa sang ngày)', () => {
    // 23:30 và 00:30 giờ VN = 16:30 và 17:30 UTC cùng ngày.
    const { state, statuses } = run([
      ['2026-11-02T16:30:00Z', VN],
      ['2026-11-02T17:30:00Z', VN],
    ]);
    expect(statuses).toEqual(['checked', 'checked']);
    expect(state.streak).toBe(2);
  });

  it('bay sang múi giờ chậm hơn (ngày lịch lùi lại): không chấm lại, không mất chuỗi', () => {
    const { state, statuses } = run([
      ['2026-11-02T01:00:00Z', VN],
      ['2026-11-03T01:00:00Z', VN], // 08:00 ngày 3 ở VN
      ['2026-11-03T05:00:00Z', LA], // 21:00 ngày 2 ở LA
      ['2026-11-04T01:00:00Z', LA], // 17:00 ngày 3 ở LA: vẫn là "hôm nay" đã chấm
      ['2026-11-04T17:00:00Z', LA], // 09:00 ngày 4 ở LA: ngày mới
    ]);
    expect(statuses).toEqual(['checked', 'checked', 'already', 'already', 'checked']);
    expect(state).toMatchObject({ lastDay: '2026-11-04', streak: 3, total: 3 });
  });

  it('bay sang múi giờ nhanh hơn: sang ngày mới sớm hơn nhưng không nhảy cóc chuỗi', () => {
    const { state, statuses } = run([
      ['2026-11-02T20:00:00Z', LA], // 12:00 ngày 2 ở LA
      ['2026-11-02T21:00:00Z', TOKYO], // 06:00 ngày 3 ở Tokyo
      ['2026-11-02T23:00:00Z', TOKYO], // vẫn ngày 3
    ]);
    expect(statuses).toEqual(['checked', 'checked', 'already']);
    expect(state.streak).toBe(2);
  });

  it('chuỗi hiển thị về 0 khi đã bỏ lỡ', () => {
    const { state } = run([['2026-11-02T01:00:00Z', VN]]);
    expect(visibleStreak(state, new Date('2026-11-03T01:00:00Z'), VN)).toBe(1);
    expect(visibleStreak(state, new Date('2026-11-05T01:00:00Z'), VN)).toBe(0);
    expect(hasCheckedInToday(state, new Date('2026-11-02T12:00:00Z'), VN)).toBe(true);
    expect(hasCheckedInToday(state, new Date('2026-11-03T01:00:00Z'), VN)).toBe(false);
  });
});
