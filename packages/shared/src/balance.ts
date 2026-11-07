// MỌI hằng số cân bằng nằm ở đây để chỉnh một chỗ. Đây là giá trị khởi điểm,
// cần chỉnh lại sau khi chơi thử thật (xem docs/BALANCE.md).

export const BALANCE = {
  /** Giới hạn mềm mỗi ngày (thang điểm 10x): phần vượt chỉ nhận `overCapRate`. */
  dailySoftCap: 2500,
  overCapRate: 0.5,

  checkIn: { base: 200, perStreakDay: 50, streakCap: 7 },
  /**
   * Phiên gõ phím tập trung: XP đã nhỏ giọt mỗi phút trong lúc ngồi (xem `work`); hết phiên trọn
   * vẹn thì thêm thưởng `completed` theo số phút.
   */
  focus: { completed: { 1: 50, 3: 120, 5: 250 } as Record<number, number> },
  /**
   * XP nhỏ giọt mỗi phút trọn khi đang ngồi máy (`desk`), đang phiên tập trung (`focus`)
   * hoặc ngồi phòng họp (`meeting`). Treo máy tăng thong thả (2 XP/phút ≈ 6 XP/3 phút, tương đương 0.6 XP/3p cũ),
   * có giới hạn phút mỗi ngày.
   */
  work: { desk: 2, focus: 10, meeting: 4 },
  /** Mỗi `per` dòng thư công sở (cộng dồn qua các phiên) được `xp`. */
  lines: { per: 50, xp: 50 },
  taskDone: 150,
  coffeeGift: 80,
  /** Công quả: tưới cây, lau bàn... */
  chore: 120,
  /** Xin quẻ: chỉ lần đầu mỗi ngày. */
  fortune: 100,
  /** Được chủ công ty thăng chức (tối đa một lần mỗi ngày). */
  companyPromotion: 300,
  /** Tham gia thành công một sự kiện phòng. */
  roomEvent: 80,
  /** Uống trà sữa khi được rủ (tự trả 5 xu, chỉ được XP, không sinh xu). */
  milkTea: 100,
  /**
   * Công ty xong một dự án: base + perDifficulty × độ khó. Không sinh xu (xu thưởng trừ
   * từ quỹ), tối đa 2 lần/ngày vì công ty đông người xong dự án rất nhanh.
   */
  companyProject: { base: 40, perDifficulty: 20 },
  /** Hoàn thành một việc sếp giao. */
  mission: 250,
  /** Số lần mỗi ngày còn được tính XP (chống bấm lặp). */
  perDayLimits: {
    coffeeGift: 5,
    chore: 6,
    taskDone: 5,
    /** Phút ngồi máy được tính XP mỗi ngày (cả trong và ngoài phiên tập trung). */
    deskMinutes: 240,
    meetingMinutes: 60,
    roomEvent: 8,
    /** Số cốc trà sữa được tính XP mỗi ngày (chặn uống liên tục lấy XP). */
    milkTea: 3,
    companyPromotion: 1,
    companyProject: 2,
  },

  /** Cân bằng thể lực (Stamina) - giới hạn 30 phút làm việc liên tiếp */
  stamina: {
    baseMax: 100,
    /** Tối đa 30 phút làm việc liên tục: 100 / (30 * 60) ≈ 0.0556 điểm/s */
    drainPerSecond: 100 / 1800,
    /** Hồi thụ động khi đứng/đi lại (điểm/s): ~2.5 điểm/phút */
    passiveRegenPerSecond: 2.5 / 60,
    /** Hồi khi ngắm cửa sổ (điểm/s): ~8 điểm/phút */
    windowRegenPerSecond: 8 / 60,
    /** Hồi khi ngồi ghế sofa phòng nghỉ (điểm/s): ~16 điểm/phút (đầy sau ~6 phút) */
    breakroomRegenPerSecond: 16 / 60,
    /** Hồi khi ngồi ghế massage (điểm/s): ~25 điểm/phút (đầy sau ~4 phút) */
    massageRegenPerSecond: 25 / 60,
    /** Hồi khi chơi game phòng nghỉ (điểm/s): ~20 điểm/phút */
    consoleRegenPerSecond: 20 / 60,
    /** Hồi tức thì khi uống cà phê / nước (điểm). */
    drinkBoost: 20,
    /** Ngưỡng tối thiểu để hồi phục khỏi trạng thái kiệt sức. */
    exhaustedThreshold: 15,
  },

  /** Xu (điểm trong game): tỉ lệ theo XP thực nhận (0.05 để giữ cân bằng với giá shop) và thưởng thêm khi xong việc sếp giao. */
  coins: { perXp: 0.05, missionBonus: 20 },
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
    /** CEO giao thêm tối đa chừng này việc mỗi ngày (không tính vào việc của sếp NPC). */
    ceoPerDay: 5,
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
