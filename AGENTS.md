## Prompt 0: quy tắc nền (AGENTS.md)

Dán nội dung dưới đây vào file AGENTS.md ở gốc repo. Nếu Antigravity có mục quy tắc (rules) cho workspace, dán thêm vào đó để agent nào cũng đọc được. Làm bước này trước mọi prompt khác.

```text
# Dự án: Đi làm Online (game văn phòng 3D nhiều người chơi, chạy trên trình duyệt)

## Mô tả
Người chơi tạo nhân vật nhân viên, làm các hoạt động trong văn phòng 3D (chấm công, gõ phím tập trung, xin quẻ KPI, lật task...), thăng chức từ Thực tập sinh đến Tổng giám đốc, rồi mở công ty riêng. Phong cách: dễ thương, hài nhẹ về đời công sở, thân thiện, không bạo lực.

## Stack bắt buộc
- Ngôn ngữ: TypeScript strict ở mọi nơi.
- Monorepo npm workspaces: packages/shared, apps/client, apps/server.
- Client: Vite + Three.js (bản cố định trong package.json), không dùng framework UI nặng. UI HUD bằng HTML/CSS thuần hoặc lit nhỏ.
- Server: Node 20+, Fastify (REST) + thư viện ws (WebSocket). Lưu dữ liệu bằng SQLite (better-sqlite3), tách lớp truy cập DB để sau này đổi sang Postgres.
- Test: vitest cho shared và server. Với client, test logic thuần (không test WebGL).

## Nguyên tắc thiết kế
1. KHÔNG dùng file mô hình 3D (glb, fbx, obj), ảnh, hay file âm thanh. Hình khối dựng bằng code (hình học Three.js, LatheGeometry, ExtrudeGeometry, gộp mesh), họa tiết vẽ bằng canvas, âm thanh và nhạc nền sinh bằng Web Audio. Ngoại lệ duy nhất: font chữ.
2. Gộp hình học và dùng chung vật liệu để máy yếu vẫn chạy. Mục tiêu 30fps trên điện thoại tầm trung, giới hạn draw call (ghi số đo vào docs khi tối ưu).
3. Server là nguồn sự thật cho XP, xu, cấp bậc, chuỗi ngày. Client chỉ gửi hành động, server kiểm tra và tính điểm. Không bao giờ tin số liệu từ client.
4. Luật chơi (cấp bậc, công thức XP, giới hạn mỗi ngày) nằm trong packages/shared và dùng chung cho client và server.
5. Mọi chuỗi hiển thị cho người chơi bằng tiếng Việt, đặt trong một file chuỗi riêng, không viết cứng rải rác trong code.
6. Không có tiền thật, không mua bán, không cá cược. Xu chỉ là điểm trong game.
7. Không dùng tên công ty hay thương hiệu có thật. Tên công ty người chơi đặt phải qua bộ lọc từ cấm.
8. Không sao chép code, văn bản hay thiết kế từ các dự án khác. Viết lại từ đầu.

## Cách làm việc
- Làm đúng phạm vi của prompt hiện tại. Không làm trước tính năng của phase sau.
- Trước khi viết code, đọc docs/GAME_DESIGN.md và docs/PROTOCOL.md nếu có.
- Sau mỗi thay đổi lớn: chạy typecheck, lint, test và cho phép khởi động dự án được (npm run dev).
- Mỗi prompt kết thúc bằng: danh sách file đã tạo hoặc sửa, cách chạy thử, các tiêu chí nghiệm thu đã đạt hay chưa, và việc còn dở.
- Nếu thiếu thông tin, chọn mặc định hợp lý, ghi giả định vào docs/DECISIONS.md rồi làm tiếp, đừng dừng lại hỏi trừ khi thật sự bế tắc.
- Commit nhỏ, thông điệp rõ ràng.

## Chất lượng và bảo mật
- Kiểm tra mọi dữ liệu nhận từ WebSocket bằng schema (zod), giới hạn kích thước và tần suất gửi.
- Không ghi log dữ liệu cá nhân. Token chỉ lưu dạng băm ở server.
- Dọn dẹp tài nguyên Three.js (dispose) khi bỏ đối tượng.
```