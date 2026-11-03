import { describe, expect, it } from 'vitest';
import { DEFAULT_LADDER } from './hiring';
import { CEO_TITLE, jobName, jobTagFor } from './job';
import { titleForLevel } from './levels';

describe('chức danh theo nơi làm', () => {
  it('văn phòng chung: theo thang chức danh chung', () => {
    expect(jobTagFor(null, 160)).toBeNull();
    expect(jobName(jobTagFor(null, 1), titleForLevel(1), null)).toBe('Thực tập sinh');
  });

  it('tự mở công ty: luôn là CEO, kể cả cấp thấp', () => {
    const own = { owner: true, ladder: DEFAULT_LADDER };
    expect(jobTagFor(own, 150)).toBe(CEO_TITLE);
    expect(jobName(jobTagFor(own, 2), titleForLevel(2), null)).toBe(CEO_TITLE);
  });

  it('sang công ty người khác: chức danh theo lộ trình công ty, không giữ chức danh cũ', () => {
    const other = { owner: false, ladder: DEFAULT_LADDER };
    expect(jobTagFor(other, 30)).toBe('Fresher');
    expect(jobName(jobTagFor(other, 30), titleForLevel(30), 'manager')).toBe('Fresher');
    expect(jobTagFor(other, 120)).toBe('Senior');
  });
});
