// Mọi chuỗi hiển thị cho người chơi nằm ở đây (tiếng Việt).
// Tên game nằm ở @dilam/shared (GAME_NAME) vì server cũng dùng.

export const STRINGS = {
  creator: {
    title: 'Làm thẻ nhân viên',
    subtitle: 'Ngày đầu đi làm! Chọn diện mạo cho thật xinh rồi vào văn phòng nhé.',
    nameLabel: 'Tên trên thẻ',
    namePlaceholder: 'Ví dụ: Nguyễn Minh Anh',
    randomName: 'Thỉnh tên',
    randomNameHint: 'Xin một cái tên ngẫu nhiên',
    skin: 'Màu da',
    hairStyle: 'Kiểu tóc',
    hairColor: 'Màu tóc',
    outfit: 'Trang phục',
    pose: 'Thử tư thế',
    enter: 'Vào văn phòng',
    rotateHint: 'Kéo để xoay nhân vật',
  },
  skinTones: ['Da trắng hồng', 'Da sáng', 'Da bánh mật', 'Da nâu'],
  hairColors: ['Tóc đen', 'Tóc nâu đậm', 'Tóc hạt dẻ', 'Tóc vàng nhạt', 'Tóc tím khoai môn'],
  hairStyles: {
    short: 'Ngắn',
    bun: 'Búi',
    long: 'Dài',
    ponytail: 'Đuôi ngựa',
  },
  outfits: {
    shirt: 'Sơ mi trắng',
    suit: 'Vest',
    hoodie: 'Hoodie',
    sweater: 'Áo len',
  },
  poses: {
    stand: 'Đứng',
    walk: 'Đi',
    sit: 'Ngồi',
    type: 'Gõ phím',
  },
  office: {
    editCard: 'Sửa thẻ',
    qualityLabel: 'Đồ họa',
    qualityModes: {
      auto: 'Tự động',
      low: 'Thấp',
      medium: 'Vừa',
      high: 'Cao',
    },
    hintDesktop:
      'WASD hoặc phím mũi tên để đi · Bấm lên sàn để đi tới đó · Kéo chuột để xoay · Cuộn để phóng to',
    hintTouch: 'Cần gạt để đi · Chạm sàn để đi tới · Kéo để xoay · Chụm hai ngón để phóng to',
    qualityLowered: (levelLabel: string) =>
      `Máy hơi đuối nên đồ họa đã tự hạ xuống mức ${levelLabel}.`,
    stats: (fps: number, cpuMs: number, drawCalls: number, levelLabel: string) =>
      `${String(fps)} fps · CPU ${cpuMs.toFixed(2)} ms · ${String(drawCalls)} draw call · ${levelLabel}`,
    joystick: 'Cần gạt di chuyển',
  },
  storage: {
    blocked:
      'Trình duyệt đang chặn lưu dữ liệu: nhân vật vẫn dùng được nhưng sẽ mất khi tải lại trang.',
    saveFailed: 'Không lưu được thẻ nhân viên vào máy. Bạn vẫn vào văn phòng bình thường.',
  },
  /** Họ và tên phổ biến cho nút "Thỉnh tên". */
  names: {
    surnames: [
      'Nguyễn',
      'Trần',
      'Lê',
      'Phạm',
      'Hoàng',
      'Huỳnh',
      'Phan',
      'Vũ',
      'Võ',
      'Đặng',
      'Bùi',
      'Đỗ',
      'Hồ',
      'Ngô',
      'Dương',
      'Lý',
    ],
    givenNames: [
      'Minh Anh',
      'Gia Huy',
      'Bảo Ngọc',
      'Quốc Bảo',
      'Thu Trang',
      'Đức Minh',
      'Ngọc Hân',
      'Hoàng Nam',
      'Khánh Linh',
      'Tuấn Kiệt',
      'Phương Thảo',
      'Thành Đạt',
      'Mai Anh',
      'Hải Đăng',
      'Thanh Hương',
      'Văn Long',
      'Thùy Dung',
      'Minh Khôi',
      'Hà My',
      'Quang Huy',
      'Lan Chi',
      'Trung Kiên',
      'Thảo Vy',
      'Nhật Minh',
    ],
  },
  connection: {
    /** Tin gửi lên server khi thử kết nối (dùng lại ở Phase 4). */
    testMessage: 'Chào buổi sáng từ bàn làm việc!',
    connecting: 'Đang gọi lên server…',
    success: (text: string, clock: string, roundTripMs: number) =>
      `Server nhắn lại: “${text}” lúc ${clock} (mất ${String(roundTripMs)} ms)`,
    connectFailed: 'Không kết nối được tới server. Server đã chạy chưa?',
    timeout: 'Server không trả lời kịp. Thử lại sau nhé.',
    badReply: 'Server trả lời một tin không đọc được.',
    serverErrors: {
      bad_message: 'Server không hiểu tin vừa gửi.',
      rate_limited: 'Bạn bấm nhanh quá, nghỉ tay một chút rồi thử lại.',
    },
  },
  errors: {
    webglUnavailable:
      'Trình duyệt hoặc máy này chưa bật được đồ họa 3D (WebGL). Bạn thử trình duyệt khác nhé.',
  },
} as const;
