// MỌI hằng số cân bằng nằm ở đây để chỉnh một chỗ. Đây là giá trị khởi điểm,
// cần chỉnh lại sau khi chơi thử thật (xem docs/BALANCE.md).

export const BALANCE = {
  /** Giới hạn mềm mỗi ngày: phần vượt chỉ nhận `overCapRate`. */
  dailySoftCap: 190,
  overCapRate: 0.5,

  checkIn: { base: 20, perStreakDay: 5, streakCap: 7 },
  /**
   * Phiên gõ phím tập trung: XP đã nhỏ giọt mỗi phút trong lúc ngồi (xem `work`); hết phiên trọn
   * vẹn thì thêm thưởng `completed` theo số phút.
   */
  focus: { completed: { 1: 3, 3: 10, 5: 20 } as Record<number, number> },
  /**
   * XP nhỏ giọt mỗi phút trọn khi đang ngồi máy (`desk`), đang phiên tập trung (`focus`)
   * hoặc ngồi phòng họp (`meeting`). Treo máy vẫn tăng từ từ, có giới hạn phút mỗi ngày.
   */
  work: { desk: 2, focus: 4, meeting: 2 },
  /** Mỗi `per` dòng thư công sở (cộng dồn qua các phiên) được `xp`. */
  lines: { per: 50, xp: 5 },
  taskDone: 15,
  coffeeGift: 8,
  /** Công quả: tưới cây, lau bàn... */
  chore: 12,
  /** Xin quẻ: chỉ lần đầu mỗi ngày. */
  fortune: 10,
  /** Được chủ công ty thăng chức (tối đa một lần mỗi ngày). */
  companyPromotion: 30,
  /** Tham gia thành công một sự kiện phòng. */
  roomEvent: 8,
  /** Uống trà sữa khi được rủ (tự trả 5 xu, chỉ được XP, không sinh xu). */
  milkTea: 10,
  /** Hoàn thành một việc sếp giao. */
  mission: 25,
  /** Số lần mỗi ngày còn được tính XP (chống bấm lặp). */
  perDayLimits: {
    coffeeGift: 5,
    chore: 6,
    taskDone: 5,
    /** Phút ngồi máy được tính XP mỗi ngày (cả trong và ngoài phiên tập trung). */
    deskMinutes: 180,
    meetingMinutes: 60,
    roomEvent: 8,
    /** Số cốc trà sữa được tính XP mỗi ngày (chặn uống liên tục lấy XP). */
    milkTea: 3,
    companyPromotion: 1,
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
    daysToCompany: 40,
    /** ... và sau `daysToMax` ngày tới cấp tối đa. */
    daysToMax: 400,
    /** Độ cong đoạn đầu (cấp 1 → mở công ty): > 1 thì đầu nhanh, càng về sau càng chậm. */
    earlyExponent: 1.3,
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
