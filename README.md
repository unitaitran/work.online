# Đi làm Online

Game văn phòng 3D nhiều người chơi chạy trên trình duyệt. Quy tắc cho agent ở [AGENTS.md](AGENTS.md), thiết kế ở [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md), các quyết định kỹ thuật ở [docs/DECISIONS.md](docs/DECISIONS.md).

## Yêu cầu

Node 22.12 trở lên (xem `.nvmrc`), npm 10.

## Chạy thử

```sh
npm install
npm run dev
```

- Client: <http://localhost:5173> (thêm `?debug` để xem fps và số draw call)
- Nhật ký sự kiện hoạt động (trang debug): <http://localhost:5173/events.html>
- Server: <http://127.0.0.1:3000/api/health>, WebSocket ở `/ws` (client đi qua proxy của Vite).
- Khi chạy dev, server bật công cụ dev (`--dev`): bảng "Công cụ dev" góc trái để tua ngày, cộng XP/xu.
- Lần đầu vào, server tạo tài khoản ẩn danh và hiện **mã khôi phục** (dùng để vào lại trên máy khác).
- Trang kiểm duyệt tường than thở: đặt `ADMIN_KEY` trong `.env` rồi mở `/admin`.

Muốn đổi cổng thì chép `.env.example` thành `.env` rồi sửa.

Triển khai thật (Docker, Caddy/Nginx, sao lưu, khôi phục, đổi phiên bản): [docs/RUNBOOK.md](docs/RUNBOOK.md). Trước khi mở công khai: [docs/LAUNCH_CHECKLIST.md](docs/LAUNCH_CHECKLIST.md).

## Lệnh

| Lệnh                                          | Việc                                                             |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `npm run dev`                                 | Chạy server (tsx watch) và client (Vite) cùng lúc                |
| `npm run build`                               | Build client (`apps/client/dist`) và server (`apps/server/dist`) |
| `npm test`                                    | Chạy vitest cho shared, server, client                           |
| `npm run lint`                                | ESLint và kiểm tra Prettier                                      |
| `npm run format`                              | Tự định dạng code bằng Prettier                                  |
| `npm run typecheck`                           | Kiểm tra kiểu TypeScript cho cả ba gói                           |
| `npm run loadtest -w @dilam/server -- 100 30` | Tải thử: 100 bot WebSocket trong 30 giây                         |
| `node scripts/perf-client.cjs <url> 3`        | Đo tải trang và rò rỉ bộ nhớ ở client (cần Playwright)           |

Sau khi build, chạy server bản build bằng `npm run start -w @dilam/server`.

## Cấu trúc

```text
packages/shared   luật chơi, cân bằng, giao thức, bộ lọc nội dung, công ty (dùng chung)
apps/server       Fastify (REST) + ws (WebSocket) + SQLite; tính XP, xu, công ty
deploy/           mẫu cấu hình Caddy, Nginx; Dockerfile và docker-compose ở gốc
apps/client       Vite + Three.js, HUD bằng HTML/CSS thuần
docs/             thiết kế, giao thức, quyết định, hiệu năng
```
