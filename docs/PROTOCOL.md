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

Kết nối `GET /ws?token=<token>` (wss khi chạy https). Token sai hoặc hết hạn: server trả `401` ngay lúc nâng cấp. Mọi tin là JSON, tối đa 2048 byte (vượt thì đóng mã `1009`). Server kiểm tra mọi tin bằng zod; tin sai bị bỏ, trả `{type:"error", code:"bad_message"}`; sai quá 20 lần thì bị đóng (`kicked: abuse`). Giới hạn tần suất: dồn 40 tin, hồi 20 tin/giây (vượt thì `error: rate_limited` một lần và bỏ tin thừa).

### Vào phòng

- Server đưa người chơi vào phòng văn phòng còn chỗ (đông nhất trước). Mỗi phòng tối đa `ROOM_CAPACITY` (mặc định 40); hết chỗ thì mở phòng mới cùng loại (`office-1`, `office-2`...).
- Toàn server quá `SERVER_CAPACITY` người: `kicked: full`, đóng `1013`.
- Mở tab thứ hai cùng tài khoản: tab cũ nhận `kicked: replaced`.
- Mất kết nối: người khác thấy `player_leave`, nhưng chỗ được giữ **30 giây**; kết nối lại trong thời gian đó thì về đúng phòng, đúng vị trí, cùng `sid`.
- Heartbeat: server gửi ping khung WebSocket mỗi 15 giây, không có pong thì ngắt.
- Đứng yên 5 phút (không đi, không biểu cảm): `idle_check`; không trả `active` trong 60 giây thì `kicked: idle` và giải phóng chỗ.

### Client → server

| type              | Trường               | Ghi chú                                                                                      |
| ----------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| `state`           | `x, z, facing, pose` | ~10 lần/giây, chỉ khi đổi (đứng yên gửi lại mỗi 3 giây). `pose`: `stand / walk / sit / type` |
| `emote`           | `emote`              | `wave, clap, laugh, heart, think, sleepy, coffee, cheer`                                     |
| `quick_chat`      | `index`              | Chỉ số trong `QUICK_CHATS` (12 câu có sẵn). **Không có chat tự do**                          |
| `ping`            | `t`                  | Server trả `pong { t, serverTime }`                                                          |
| `active`          |                      | Trả lời `idle_check`                                                                         |
| `leave`           |                      | Rời hẳn (giải phóng chỗ ngay)                                                                |
| `profile_changed` |                      | Vừa đổi nhân vật/trang bị: server đọc lại từ DB và báo cả phòng                              |
| `action`          | `id, action`         | Hành động tính điểm (Phase 4C), xem dưới                                                     |

### Server → client

| type                                             | Trường                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `welcome`                                        | `protocol, room, you, players[], serverTime` (hồ sơ + vị trí mọi người đang online trong phòng)     |
| `player_join` / `player_update` / `player_leave` | hồ sơ đầy đủ khi vừa vào hoặc khi đổi; `sid` khi rời                                                |
| `states`                                         | `s: [sid, x, z, facing, poseIndex][]`, 5 lần/giây, **chỉ người trong bán kính 14 m và chỉ khi đổi** |
| `emote` / `quick_chat`                           | `sid` + nội dung, gửi tới người trong bán kính                                                      |
| `correct`                                        | `x, z`: vị trí gửi lên không hợp lệ, kéo về đây                                                     |
| `idle_check`                                     | `deadline`                                                                                          |
| `kicked`                                         | `reason`: `idle / replaced / full / unauthorized / abuse / shutdown`                                |
| `progress`                                       | `state, today, id?, outcome?` (Phase 4C)                                                            |
| `action_rejected`                                | `id, reason`                                                                                        |
| `mission_assigned`                               | `mission`                                                                                           |

**Kiểm tra vị trí**: server dùng cùng hàm `moveWithCollisions` ở `packages/shared` với client. Quãng đi tối đa giữa hai tin = 2,6 m/s × thời gian × 1,35 + 0,35 m; đi xuyên bàn, tường kính, vật cản thì bị kéo về điểm hợp lệ. Ngồi vào ghế/đứng dậy được "nhảy" ngắn (≤ 1,5 m) vào đúng chỗ ngồi/chỗ đứng của vật.

### Hành động tính điểm (Phase 4C)

Client gửi `{ type: "action", id, action }`. `id` là khoá chống gửi trùng (8–40 ký tự, mỗi hành động một khoá mới); gửi lại cùng khoá thì `action_rejected: duplicate`. Client **không gửi XP, thời lượng hay chuỗi**: server tự đo giờ và tính bằng `applyEvent` trong `packages/shared/rules.ts`.

| action.kind                                                                   | Server kiểm tra                                                                                                           |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `checkin`                                                                     | đứng gần máy quẹt thẻ; ngày theo múi giờ đã lưu, đổi ngày lúc 4 giờ sáng                                                  |
| `fortune`                                                                     | gần kệ quẻ; quẻ chọn theo (ngày, mã nhân viên); lần đầu trong ngày mới có XP                                              |
| `task_flip { taskId, completed }`                                             | gần bảng việc                                                                                                             |
| `coffee_brew` → `coffee_gift { npcId }` / `coffee_drink`                      | gần máy pha; tặng/uống chỉ khi đã pha xong ≥ 3,2 giây, mỗi lần pha một ly                                                 |
| `chore { target }`                                                            | gần đúng chậu cây đó                                                                                                      |
| `print`                                                                       | gần máy in                                                                                                                |
| `meeting_start { seatId }` → `meeting_end`                                    | gần ghế họp; server đo thời gian ngồi                                                                                     |
| `focus_start { minutes: 1/3/5 }` → `focus_end { presses, scoredKeys, lines }` | gần bàn làm việc; server đo giờ (kết thúc sớm chỉ tính phần đã ngồi); số phím/dòng bị chặn ≤ 8,5 phím/giây × thời gian đo |
| `vent { length, anonymous }`                                                  | không có XP                                                                                                               |
| `choose_department` / `choose_branch`                                         | chỉ khi đủ chức danh và chưa chọn                                                                                         |

Lý do từ chối: `too_fast` (cùng loại quá dày), `too_far`, `not_started` (sai thứ tự), `duplicate`, `not_allowed`, `invalid`. Mỗi hành động được tính ghi vào `activity_log` (loại, XP, xu).

### Sự kiện phòng, chuyển phòng (Phase 5B)

| Hướng | type                                            | Trường                                                                                             |
| ----- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| C → S | `event_respond`                                 | `id`: tham gia sự kiện (giả vờ bận, gõ router, đổ hạt)                                             |
| C → S | `switch_room`                                   | `roomId`: chuyển sang phòng/tầng khác                                                              |
| S → C | `room_event`                                    | `event: { id, kind, endsAt, goal?, progress? }` (gửi cả khi vừa vào phòng mà sự kiện đang diễn ra) |
| S → C | `room_event_progress`                           | `id, progress` (mất wifi)                                                                          |
| S → C | `room_event_end`                                | `id, kind, success, rewarded`                                                                      |
| S → C | `switch_failed`                                 | `reason: full / not_found / forbidden`                                                             |
| S → C | `room_plants` / `plant_added` / `plant_removed` | hoa đã tưới trong phòng (Phase 5A)                                                                 |

## REST bổ sung (Phase 5)

| Phương thức | Đường dẫn                                                                                     | Ghi chú                                                                                      |
| ----------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| GET         | `/api/shop/inventory`                                                                         | `{ coins, owned, equipped }`                                                                 |
| POST        | `/api/shop/buy`                                                                               | `{ itemId }` → `422 rejected` với `reason: not_enough_coins / owned / locked / unknown_item` |
| POST        | `/api/shop/equip`                                                                             | `{ itemId, equip }`; cả phòng nhận `player_update`                                           |
| GET         | `/api/shop/ledger`                                                                            | 50 dòng sổ cái gần nhất                                                                      |
| GET         | `/api/leaderboard?period=week\|month&department=all\|dev\|...`                                | `{ rows, mine, since, hidden }`                                                              |
| PUT         | `/api/me/privacy`                                                                             | `{ hideFromLeaderboard }`                                                                    |
| GET         | `/api/wall`                                                                                   | 50 bài gần nhất đang hiện (không có người đăng)                                              |
| POST        | `/api/wall`                                                                                   | `{ text }` → `201`; `422 rejected` (lý do lọc), `409 one_per_day`                            |
| POST        | `/api/wall/:id/report`                                                                        | `409 already_reported`, `403` nếu bài của mình                                               |
| GET         | `/api/building`                                                                               | các phòng chung (tầng, số người) và phòng hiện tại                                           |
| GET         | `/admin`, `/api/admin/wall`, `DELETE /api/admin/wall/:id`, `POST /api/admin/wall/:id/restore` | chỉ khi có `ADMIN_KEY`, header `x-admin-key`                                                 |

## REST công ty (Phase 6)

Mọi endpoint ghi là `POST`, có giới hạn tần suất; lỗi nghiệp vụ trả `422 rejected` với `reason` (ví dụ `level`, `employed`, `capital`, `brand`, `profanity`, `name_taken`, `limit`, `banned`, `bad_code`, `too_senior`, `not_ready`), không phải chủ thì `403`.

| Đường dẫn                                               | Body                              | Ghi chú                                                                 |
| ------------------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `GET /api/company/me`                                   |                                   | công ty đang thuộc (chi tiết), điều kiện mở, lời mời làm việc, huy hiệu |
| `GET /api/company/directory`                            |                                   | danh bạ công ty                                                         |
| `GET /api/company/info/:id`                             |                                   | thông tin công khai (biển hiệu)                                         |
| `/api/company/found`                                    | `{ name, industry, color, icon }` | mở công ty                                                              |
| `/api/company/project`                                  | `{ offerId }`                     | nhận dự án mời thầu hôm nay                                             |
| `/api/company/hire`, `/api/company/staff/promote`       | `{ staffId }`                     | NPC                                                                     |
| `/api/company/event`                                    | `{ choice: 0 \| 1 }`              | sự kiện công ty hôm nay                                                 |
| `/api/company/upgrade`, `/api/company/ipo`              | `{ industry }` (IPO)              |                                                                         |
| `/api/company/apply`                                    | `{ companyId }`                   | nộp đơn                                                                 |
| `/api/company/applications`                             | `{ applicationId, approve }`      | chủ duyệt                                                               |
| `/api/company/invite` → `{ code }`, `/api/company/join` | `{ code }`                        | mã mời                                                                  |
| `/api/company/leave`, `/api/company/rejoin-default`     |                                   | rời công ty / về Mây Hồng                                               |
| `/api/company/kick`                                     | `{ code, ban? }`                  | cho nghỉ (và chặn)                                                      |
| `/api/company/promote`                                  | `{ code }`                        | thăng chức trong công ty                                                |
| `/api/company/assign`                                   | `{ code, templateId }`            | giao việc                                                               |
| `/api/company/offer`                                    | `{ offerId, accept }`             | lời mời từ công ty NPC                                                  |

Vào phòng công ty qua WebSocket: `switch_room { roomId: "company:<id>" }` (không phải thành viên thì `switch_failed: forbidden`); về văn phòng chung: `switch_room { roomId: "office" }`.

### Phát triển

Server chạy với cờ `--dev` (`npm run dev`) có thêm `POST /api/dev/shift-day { days }` (tua ngày riêng cho tài khoản) và `POST /api/dev/grant { xp?, coins? }`. Thêm `POST /api/dev/room-event { kind }` để gọi ngay một sự kiện phòng. Bản chạy thật không có các API này.
