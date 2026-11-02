# Giao thức client ↔ server

Kiểu dữ liệu nằm trong `packages/shared/src/api.ts` (REST) và `packages/shared/src/protocol.ts` (WebSocket). Mọi dữ liệu vào server đều qua schema zod; sai định dạng trả `400`.

## REST

- Định dạng: JSON, UTF-8. Body tối đa 64 KB.
- Xác thực: header `Authorization: Bearer <token>`. Token sai, thiếu hoặc hết hạn trả `401 { "error": "unauthorized" }`.
- Lỗi: `{ "error": <mã>, "reason"?: <lý do> }`. Mã: `bad_request` (400), `unauthorized` (401), `forbidden` (403), `not_found` (404), `conflict` (409), `rejected` (422, nội dung bị từ chối, xem `reason`), `rate_limited` (429, kèm header `Retry-After`).
- Giới hạn tần suất cho mọi endpoint ghi: 60 yêu cầu/IP (hồi 1/giây), 30 yêu cầu/tài khoản (hồi 1 mỗi 2 giây). Tạo tài khoản: 5/IP, hồi 1 mỗi 10 phút. Khôi phục: 8/IP, hồi 1 mỗi phút.

### Tài khoản ẩn danh

Không thu email hay thông tin cá nhân. Server chỉ lưu bản băm SHA-256 của token và mã khôi phục. Token hết hạn sau `TOKEN_TTL_DAYS` ngày không dùng (mỗi lần dùng được gia hạn).

| Phương thức | Đường dẫn               | Body                                                                           | Trả về                                                                                               |
| ----------- | ----------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| POST        | `/api/accounts`         | `{ timeZone? }` (IANA, mặc định `Asia/Ho_Chi_Minh`)                            | `201 { userId, token, recoveryCode }`. Mã khôi phục dạng `DLO-XXXX-XXXX-XXXX-XXXX`, chỉ hiện một lần |
| POST        | `/api/accounts/recover` | `{ recoveryCode }` (không phân biệt hoa thường, có thể thiếu gạch; O→0, I/L→1) | `{ userId, token }`. Token cũ mất hiệu lực                                                           |
| GET         | `/api/me`               |                                                                                | `MeResponse`: `{ userId, playerCode, timeZone, character, progress, imported }`                      |
| PUT         | `/api/me/character`     | `{ name, appearance }`                                                         | `MeResponse`. Tên qua bộ lọc từ cấm (`422 rejected`, `reason: profanity / phone / link / email`)     |
| PUT         | `/api/me/timezone`      | `{ timeZone }`                                                                 | `MeResponse`. Chấm công, quẻ, giới hạn ngày tính theo múi giờ này                                    |
| POST        | `/api/me/import`        | `{ saveCode }`                                                                 | `MeResponse`. Nhập mã lưu cục bộ (Phase 3) **một lần**, xem dưới                                     |
| DELETE      | `/api/me`               |                                                                                | `204`. Xoá tài khoản và toàn bộ dữ liệu (Phase 7)                                                    |

**Nhập mã lưu**: kiểm tra checksum và phiên bản (`reason: format / checksum / version / data`), rồi giới hạn hợp lý: XP ≤ 400 × số ngày từ lúc tạo tiến độ, cấp ≤ 150, xu ≤ XP, uy tín và chuỗi chấm công ≤ số ngày (`reason: too_high`). Đã nhập rồi hoặc tài khoản đã chơi trên server (> 50 XP) thì `409 conflict` (`already_imported`, `not_fresh`). Phần theo ngày (giới hạn, việc sếp giao) bắt đầu lại.

### Công khai

| GET             | Trả về                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `/api/health`   | `{ ok: true }`                                                                                                    |
| `/api/capacity` | `{ online, limit, busy }`: số người đang kết nối, giới hạn toàn server, `busy` khi ≥ 90%                          |
| `/api/meta`     | phòng ban, nhánh, 13 chức danh (cấp tối thiểu, tên theo hai nhánh), cấp tối đa, cấp mở công ty, `protocolVersion` |

## WebSocket

Xem mục bên dưới (Phase 4B).
