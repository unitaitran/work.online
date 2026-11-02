# Trước khi mở công khai

Rủi ro còn lại và việc nên làm. Đánh dấu khi xong.

## Bắt buộc

- [ ] **Rà soát pháp lý** bản nháp `docs/legal/dieu-khoan.md` và `docs/legal/quyen-rieng-tu.md` bởi người có chuyên môn, rồi mới đưa lên trang. Kiểm tra yêu cầu về bảo vệ dữ liệu cá nhân tại Việt Nam (Nghị định 13/2023/NĐ-CP) và độ tuổi người chơi.
- [ ] Đặt `ADMIN_KEY` mạnh, chỉ người kiểm duyệt biết; có người trực xem báo cáo tường than thở hằng ngày.
- [ ] Mở rộng danh sách từ cấm và thương hiệu (`packages/shared/src/filter.ts`) theo phản hồi thật; hiện là danh sách cơ bản.
- [ ] Sao lưu ra **ngoài máy chủ** (`BACKUP_UPLOAD_CMD` hoặc ổ mạng) và thử khôi phục một lần trên máy khác.
- [ ] Chạy CI đủ cả job `docker` (container phát triển không tải được image nên chưa build image thật).
- [ ] Đo trên điện thoại tầm trung thật (máy đo hiện tại không có GPU, xem `docs/PERF.md`).

## Nên làm

- [ ] Nén ở reverse proxy (Caddy `encode`, Nginx `gzip`): server Node không tự nén; JS ban đầu ~847 KB thô, ~240 KB gzip.
- [ ] Giới hạn kết nối/tần suất ở tầng proxy hoặc tường lửa (chống tấn công từ chối dịch vụ lớn, server chỉ có giới hạn theo IP trong ứng dụng).
- [ ] Giám sát `GET /api/health` và `GET /api/capacity` (cảnh báo khi `busy`).
- [ ] Đổi `INTEREST_RADIUS`, `ROOM_CAPACITY` theo số đo thật khi đông người.
- [ ] Xem lại cân bằng XP, xu, công ty sau 1-2 tuần chơi thử (`docs/BALANCE.md`).
- [ ] Phát hiện tài khoản phụ hiện chỉ so IP băm với chủ công ty: cân nhắc thêm tín hiệu khác nếu có lạm dụng.
- [ ] Khoá bí mật băm IP (`server_settings.ip_hash_secret`) nằm trong DB: bản sao lưu cũng chứa nó, giữ bản sao lưu kín.

## Đã làm trong Phase 7

- CSP chặt, `nosniff`, `no-referrer`, `X-Frame-Options: DENY`, CORS theo danh sách, kiểm tra Origin WebSocket.
- Mọi đầu vào qua zod, giới hạn kích thước body (64 KB) và tin WebSocket (2 KB), giới hạn tần suất REST/WS, giới hạn kết nối WS mỗi IP, đóng WS khi gửi sai nhiều lần.
- Mọi văn bản người chơi nhập được gán bằng `textContent` (không có `innerHTML` trong mã client và trang quản trị).
- Token và mã khôi phục chỉ lưu băm SHA-256, không xuất hiện trong log (có test).
- Xoá tài khoản và toàn bộ dữ liệu (tab Tài khoản, `DELETE /api/me`).
- Không có chat tự do; tường chung có lọc, báo cáo, tự ẩn, trang quản trị; ẩn người chơi khác cho riêng mình.
- Thống kê ẩn danh, không cookie, tắt được, tôn trọng Do Not Track.
