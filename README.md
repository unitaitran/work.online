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
- Server: <http://127.0.0.1:3000/api/health>, WebSocket ở `/ws` (client đi qua proxy của Vite).

Muốn đổi cổng thì chép `.env.example` thành `.env` rồi sửa.

## Lệnh

| Lệnh                | Việc                                                             |
| ------------------- | ---------------------------------------------------------------- |
| `npm run dev`       | Chạy server (tsx watch) và client (Vite) cùng lúc                |
| `npm run build`     | Build client (`apps/client/dist`) và server (`apps/server/dist`) |
| `npm test`          | Chạy vitest cho shared, server, client                           |
| `npm run lint`      | ESLint và kiểm tra Prettier                                      |
| `npm run format`    | Tự định dạng code bằng Prettier                                  |
| `npm run typecheck` | Kiểm tra kiểu TypeScript cho cả ba gói                           |

Sau khi build, chạy server bản build bằng `npm run start -w @dilam/server`.

## Cấu trúc

```text
packages/shared   luật chơi và giao thức dùng chung (GAME_NAME, schema zod)
apps/server       Fastify (REST) + ws (WebSocket)
apps/client       Vite + Three.js, HUD bằng HTML/CSS thuần
docs/             thiết kế, giao thức, quyết định, hiệu năng
```
