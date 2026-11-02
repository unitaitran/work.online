// MỌI hằng số cân bằng nằm ở đây để chỉnh một chỗ. Đây là giá trị khởi điểm,
// cần chỉnh lại sau khi chơi thử thật (xem docs/BALANCE.md).

export const BALANCE = {
  /** Giới hạn mềm mỗi ngày: phần vượt chỉ nhận `overCapRate`. */
  dailySoftCap: 190,
  overCapRate: 0.25,

  checkIn: { base: 20, perStreakDay: 5, streakCap: 7 },
  /** Phiên gõ phím tập trung: trọn phiên theo số phút; dừng sớm thì mỗi phút trọn được `partialPerMinute`. */
  focus: { completed: { 1: 10, 3: 35, 5: 70 } as Record<number, number>, partialPerMinute: 5 },
  /** Mỗi `per` dòng kinh công sở (cộng dồn qua các phiên) được `xp`. */
  lines: { per: 50, xp: 10 },
  taskDone: 15,
  coffeeGift: 8,
  /** Công quả: tưới cây, lau bàn... */
  chore: 12,
  /** Xin quẻ: chỉ lần đầu mỗi ngày. */
  fortune: 10,
  /** Hoàn thành một việc sếp giao. */
  mission: 40,
  /** Ngồi họp ở phòng họp: XP mỗi phút trọn, tối đa mỗi lần ngồi. */
  meeting: { perMinute: 4, maxMinutesPerSession: 15 },
  /** Số lần mỗi ngày còn được tính XP (chống bấm lặp). */
  perDayLimits: {
    coffeeGift: 5,
    chore: 6,
    taskDone: 5,
    meetingMinutes: 30,
  },

  /** Xu (điểm trong game): tỉ lệ theo XP thực nhận và thưởng thêm khi xong việc sếp giao. */
  coins: { perXp: 0.5, missionBonus: 20 },
  /** Uy tín cộng cho mỗi lần giúp đồng nghiệp. */
  reputationPerHelp: 1,

  /** Phòng ban: hệ số cho loại hoạt động được ưu đãi. */
  departmentBuff: 1.3,

  levels: {
    max: 500,
    /** Chơi đều đúng mức giới hạn mỗi ngày thì sau `daysToCompany` ngày tới cấp mở công ty. */
    daysToCompany: 5,
    /** ... và sau `daysToMax` ngày tới cấp tối đa. */
    daysToMax: 150,
    /** Độ cong đoạn đầu (cấp 1 → mở công ty): > 1 thì đầu nhanh, càng về sau càng chậm. */
    earlyExponent: 1.25,
    /** Đoạn sau: pha trộn tuyến tính (giữ độ dốc liền mạch) và luỹ thừa. */
    lateLinearShare: 0.1,
    lateExponent: 1.6,
  },

  /**
   * 13 chức danh, tự lên khi đạt cấp tối thiểu (vài cấp một bậc).
   * Bậc cuối (Senior) đúng bằng cấp mở công ty.
   */
  titleLevels: [1, 5, 12, 22, 35, 50, 65, 80, 95, 110, 125, 138, 150] as readonly number[],
  departmentFromTitle: 3,
  /** Chọn nhánh ở bậc này (trước bậc đầu tiên có tên theo nhánh). */
  branchFromTitle: 5,

  missions: {
    perDay: 3,
    /** Sếp giao việc đầu tiên sau chừng này kể từ khi vào văn phòng trong ngày. */
    firstDelayMs: 20_000,
    /** Nghỉ giữa hai việc. */
    cooldownMs: 90_000,
  },

  company: {
    /** Cấp tối thiểu để mở công ty riêng. */
    unlockLevel: 150,
    /** Một toà nhà = tối đa chừng này công ty; mỗi công ty là một tầng (một server/phòng). */
    maxCompaniesPerBuilding: 30,
    /** Công ty mặc định người chơi mới vào làm. */
    defaultEmployer: 'may-hong',
  },

  log: { maxEntries: 60 },
} as const;

export type Balance = typeof BALANCE;
