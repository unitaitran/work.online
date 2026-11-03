import { describe, expect, it } from 'vitest';
import { addWork, COMPANY, offerDone, projectOffers, type CompanyEconomy } from './company';

const base: CompanyEconomy = {
  stage: 0,
  treasury: 800,
  reputation: 0,
  projectsDone: 0,
  staff: [],
  project: null,
  lastSettle: 0,
};

describe('dự án mời thầu mỗi ngày', () => {
  it('5 dự án mỗi ngày, cố định theo công ty và ngày', () => {
    const a = projectOffers('c1', '2026-11-03', 0);
    expect(a).toHaveLength(COMPANY.offersPerDay);
    expect(COMPANY.offersPerDay).toBe(5);
    expect(projectOffers('c1', '2026-11-03', 0)).toEqual(a);
  });

  it('xong dự án thì đánh dấu đã xong; sang ngày khác bỏ mã cũ', () => {
    const [today] = projectOffers('c1', '2026-11-03', 0);
    if (!today) throw new Error('no offer');
    const done = addWork({ ...base, project: { ...today, progress: 0 } }, today.work).economy;
    expect(offerDone(done, today.id)).toBe(true);
    expect(done.projectsDone).toBe(1);

    const [tomorrow] = projectOffers('c1', '2026-11-04', 0);
    if (!tomorrow) throw new Error('no offer');
    const next = addWork({ ...done, project: { ...tomorrow, progress: 0 } }, tomorrow.work).economy;
    expect(next.doneOffers).toEqual([tomorrow.id]);
    expect(offerDone(next, today.id)).toBe(false);
  });

  it('bản lưu cũ không có danh sách: coi như chưa xong', () => {
    expect(offerDone(base, '2026-11-03-0')).toBe(false);
  });
});
