// Mô phỏng một người chơi đều đặn điều hành công ty (dùng cho test cân bằng và docs/BALANCE.md).
import {
  addWork,
  COMPANY,
  MAX_STAGE,
  projectOffers,
  settleEconomy,
  stageConfig,
  stageProgress,
  type CompanyEconomy,
} from './company';

export interface SimOptions {
  /** Điểm công việc người chơi góp mỗi ngày (≈ XP kiếm trong phòng công ty). */
  playerWorkPerDay: number;
  days: number;
}

const HIRE_COST = COMPANY.hireCost[0] ?? 150;

/** Trả về ngày (tính từ lúc mở) đạt mỗi giai đoạn; phần tử cuối là ngày IPO. */
export function simulateCompany(options: SimOptions): number[] {
  const DAY = 86_400_000;
  let e: CompanyEconomy = {
    stage: 0,
    treasury: COMPANY.minCapital,
    reputation: 0,
    projectsDone: 0,
    staff: [],
    project: null,
    lastSettle: 0,
  };
  const reached: number[] = [0];
  for (let day = 1; day <= options.days; day += 1) {
    const dayKey = `sim-${String(day)}`;
    // Chọn dự án khó nhất được phép khi rảnh.
    const takeProject = (): void => {
      if (e.project) return;
      const offers = projectOffers('sim', dayKey, e.stage).sort(
        (a, b) => b.difficulty - a.difficulty,
      );
      const best = offers[0];
      if (best) e = { ...e, project: { ...best, progress: 0 } };
    };
    takeProject();
    // Người chơi góp công trong ngày (chia làm vài phiên, nhận dự án mới giữa chừng).
    let left = options.playerWorkPerDay;
    while (left > 0) {
      takeProject();
      const need = e.project ? e.project.work - e.project.progress : left;
      const chunk = Math.min(left, need);
      e = addWork(e, chunk).economy;
      left -= chunk;
    }
    // NPC làm cả ngày (tính 4 lần mỗi ngày).
    for (let q = 1; q <= 4; q += 1) {
      takeProject();
      e = settleEconomy(e, (day - 1) * DAY + q * (DAY / 4)).economy;
    }
    // Tuyển và thăng chức NPC khi dư quỹ (giữ lại dự trữ để lên giai đoạn).
    const cfg = stageConfig(e.stage);
    const keep = cfg.next.reserve * 0.5;
    if (e.staff.length < cfg.maxStaff && e.treasury - HIRE_COST > keep) {
      e = {
        ...e,
        treasury: e.treasury - HIRE_COST,
        staff: [
          ...e.staff,
          { id: e.staff.length, nameIndex: 0, rank: 0, department: 'dev', awayUntil: 0 },
        ],
      };
    }
    const junior = e.staff.find((s) => s.rank < 2);
    if (junior) {
      const cost = COMPANY.promoteCost[junior.rank + 1] ?? Infinity;
      if (e.treasury - cost > keep * 1.5) {
        e = {
          ...e,
          treasury: e.treasury - cost,
          staff: e.staff.map((s) => (s === junior ? { ...s, rank: (s.rank + 1) as 0 | 1 | 2 } : s)),
        };
      }
    }
    if (stageProgress(e).ready) {
      reached.push(day);
      if (e.stage >= MAX_STAGE) return reached;
      e = { ...e, stage: e.stage + 1 };
    }
  }
  return reached;
}
