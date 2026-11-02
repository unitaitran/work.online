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
    /** Tên tầng văn phòng; giai điệu nhạc nền cũng sinh từ tên này. */
    floorName: 'Văn phòng Mây Hồng · Tầng 7',
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
  interact: {
    labels: {
      desk: 'Ngồi vào bàn làm việc',
      meeting: 'Ngồi ghế phòng họp',
      sofa: 'Ngồi sofa nghỉ trưa',
      coffee: 'Pha cà phê',
      fridge: 'Mở tủ lạnh',
      printer: 'Dùng máy in',
      plant: 'Tưới cây',
      window: 'Ngắm thành phố',
    },
    prompt: (label: string) => `Chạm để dùng · ${label}`,
    keyHint: ' (E)',
    standUp: 'Đứng dậy',
    results: {
      desk: 'Vào guồng làm việc thôi! Bàn phím lách cách vui tai.',
      meeting: 'Phòng họp đang yên tĩnh, ngồi nghĩ ý tưởng một chút.',
      sofa: 'Ngả lưng năm phút, nạp lại năng lượng.',
      coffee: 'Một ly cà phê sữa đá thơm lừng, tỉnh cả người!',
      fridge: 'Tủ lạnh toàn trà sữa có dán tên người khác. Thôi đóng lại vậy.',
      printer: 'Máy in rè rè một hồi rồi nhả ra… đúng một trang trắng.',
      plant: 'Bạn tưới cây. Lá xanh mướt hẳn lên!',
    },
    window: {
      morning: 'Nắng sớm trải vàng thành phố. Một ngày mới thật đẹp!',
      afternoon: 'Nắng chiều ấm áp. Cố thêm chút nữa là hết giờ rồi!',
      night: 'Thành phố đã lên đèn. Muộn rồi, nhớ về nghỉ ngơi nhé!',
    },
    seatTaken: (name: string) => `${name} đang ngồi chỗ này rồi.`,
  },
  npc: {
    going: {
      work: 'Về chỗ làm việc',
      coffee: 'Đi pha cà phê',
      meeting: 'Đi họp',
      stroll: 'Đi dạo một vòng',
    },
    doing: {
      work: 'Đang chạy deadline',
      coffee: 'Đang pha cà phê',
      meeting: 'Đang họp',
      stroll: 'Đang thư giãn',
    },
  },
  audio: {
    on: 'Âm thanh: bật',
    off: 'Âm thanh: tắt',
    volume: 'Âm lượng',
  },
  coach: {
    step: (index: number, total: number) => `${String(index)}/${String(total)}`,
    skip: 'Bỏ qua',
    next: 'Tiếp',
    done: 'Vào việc thôi!',
    cards: [
      {
        title: 'Chào mừng tới Văn phòng Mây Hồng!',
        body: 'Tầng 7 là nơi bạn bắt đầu sự nghiệp. Đi một vòng làm quen với mọi người nhé.',
        bodyTouch: null,
      },
      {
        title: 'Đi lại',
        body: 'Dùng WASD hoặc phím mũi tên, hoặc bấm lên sàn để đi tới. Kéo chuột để xoay góc nhìn, cuộn để phóng to.',
        bodyTouch:
          'Dùng cần gạt bên trái hoặc chạm lên sàn để đi tới. Kéo để xoay góc nhìn, chụm hai ngón để phóng to.',
      },
      {
        title: 'Chạm để dùng',
        body: 'Lại gần máy pha cà phê, máy in, cây cảnh hay bàn trống sẽ hiện nút “Chạm để dùng” (hoặc phím E). Bấm thẳng vào đồ vật cũng được.',
        bodyTouch:
          'Lại gần máy pha cà phê, máy in, cây cảnh hay bàn trống sẽ hiện nút “Chạm để dùng”. Chạm thẳng vào đồ vật cũng được.',
      },
      {
        title: 'Đồng nghiệp và âm thanh',
        body: 'Bong bóng trên đầu đồng nghiệp cho biết họ đang làm gì. Âm thanh bật sau lần chạm đầu tiên, chỉnh ở góc trên màn hình.',
        bodyTouch: null,
      },
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
