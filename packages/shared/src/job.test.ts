import { describe, expect, it } from 'vitest';
import { DEFAULT_HIRING_BANDS } from './hiring';
import { CEO_TITLE, jobName, jobTagFor } from './job';
import { titleForLevel } from './levels';

describe('chức danh theo nơi làm', () => {
  it('văn phòng chung: theo thang chức danh chung', () => {
    expect(jobTagFor(null, 160)).toBeNull();
    expect(jobName(jobTagFor(null, 1), titleForLevel(1), null)).toBe('Thực tập sinh');
  });

  it('tự mở công ty: luôn là CEO, kể cả cấp thấp', () => {
    const own = { owner: true, bands: DEFAULT_HIRING_BANDS };
    expect(jobTagFor(own, 150)).toBe('ceo');
    expect(jobName(jobTagFor(own, 2), titleForLevel(2), null)).toBe(CEO_TITLE);
  });

  it('sang công ty người khác: vị trí theo cấp và khung của công ty, không giữ chức danh cũ', () => {
    const other = {
      owner: false,
      bands: { ...DEFAULT_HIRING_BANDS, intern: null, fresher: { min: 1, max: 40 } },
    };
    expect(jobTagFor(other, 30)).toBe('fresher');
    expect(jobName(jobTagFor(other, 30), titleForLevel(30), 'manager')).toBe('Fresher');
    expect(jobTagFor(other, 120)).toBe('senior');
  });
});
