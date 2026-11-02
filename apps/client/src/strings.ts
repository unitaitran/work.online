// Mọi chuỗi hiển thị cho người chơi nằm ở đây (tiếng Việt).
// Tên game nằm ở @dilam/shared (GAME_NAME) vì server cũng dùng.

export const STRINGS = {
  hud: {
    tagline: 'Văn phòng đang mở cửa, mời bạn vào ca!',
    connectButton: 'Thử kết nối',
  },
  connection: {
    /** Tin gửi lên server khi bấm "Thử kết nối". */
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
