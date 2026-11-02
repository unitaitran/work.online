# Quyết định và giả định

Ghi lại các lựa chọn mặc định khi prompt không nói rõ. Mỗi mục ghi phase, quyết định và lý do. Muốn đổi thì sửa ở đây trước rồi mới sửa code.

## Phase 0: khởi tạo dự án (2026-11-02)

### Công cụ và phiên bản

- **Node ≥ 22.12** (ghi trong `engines` và `.nvmrc`). AGENTS.md ghi "Node 20+", nhưng Node 20 đã hết hỗ trợ (EOL 30/04/2026) và Vitest 5 cần Node ≥ 22.12. Máy dev hiện dùng Node 22.18.
- **TypeScript 6.0.3, chưa lên TypeScript 7.** typescript-eslint 8.72 (bản mới nhất) chỉ hỗ trợ TypeScript < 6.1. Lên TS 7 khi typescript-eslint hỗ trợ.
- **Ghim chính xác mọi phiên bản** (`.npmrc`: `save-exact=true`), không chỉ Three.js (`three@0.187.0`, `@types/three@0.187.0`). Lý do: rủi ro chính của Phase 0 là phiên bản công cụ lệch nhau.
- Các bản chính: Vite 8.3.5, Vitest 5.0.5, Fastify 5.12.7, ws 8.22.1, zod 4.6.7, ESLint 10.14.0 + typescript-eslint 8.72.1, Prettier 3.9.10.

### Cấu trúc monorepo

- Tên gói: `@dilam/shared`, `@dilam/server`, `@dilam/client`; gốc là `dilam-online`.
- **`@dilam/shared` là gói chỉ có mã nguồn**: `exports` trỏ thẳng vào `src/index.ts`, không có bước build riêng. Vite (client), tsx (server dev), Vitest và esbuild (server build) đều tự biên dịch TypeScript. Nhờ vậy sửa luật chơi trong shared là client và server thấy ngay, không phải chạy watch riêng.
- **Server build bằng esbuild** (`apps/server/scripts/build.ts`): gộp `@dilam/*` vào một file `dist/index.js`, các gói npm khác (fastify, ws, zod) để ngoài và lấy từ `node_modules` lúc chạy. Không dùng tsup/tsdown vì hai công cụ này yêu cầu Node ≥ 22.18; esbuild đã có sẵn qua tsx.
- `moduleResolution: "Bundler"` cho cả ba gói (mọi đường chạy đều qua bundler hoặc tsx), nên import tương đối không cần đuôi `.js`.
- `typecheck` chạy `tsc --noEmit` trong từng workspace; `test` chạy `vitest run` trong từng workspace.
- Client có test cho logic thuần (`buildWsUrl`, `describeConnectionResult`), không test WebGL.

### Lint và định dạng

- `npm run lint` = ESLint (`strictTypeChecked` + `stylisticTypeChecked` của typescript-eslint, có thông tin kiểu) **và** `prettier --check`. `npm run format` để tự sửa định dạng.
- `AGENTS.md` và file lộ trình ở gốc repo không qua Prettier để giữ nguyên định dạng người viết.
- `.gitattributes` ép xuống dòng LF để Prettier không báo lỗi trên Windows.

### Chạy dev và mạng

- `npm run dev` chạy song song server (`tsx watch`) và client (Vite) bằng `concurrently`.
- Server mặc định nghe `127.0.0.1:3000`, Vite ở `5173` (`strictPort`). Vite chuyển tiếp `/api` và `/ws` sang server, nên client luôn gọi **cùng origin**: không cần CORS ở dev, và khi deploy sau một reverse proxy cũng không phải đổi code client.
- Muốn thử trên điện thoại cùng mạng LAN: chạy `npm run dev:client -- --host` (Vite mở ra mạng LAN, server vẫn chỉ nghe localhost vì đi qua proxy).
- **Một file `.env` ở gốc repo** dùng chung: server nạp bằng `process.loadEnvFile`, Vite đọc qua `envDir`. Chỉ biến có tiền tố `VITE_` mới lộ ra code client. Không có `.env` thì dùng mặc định trong `.env.example`.

### WebSocket

- Dùng thư viện **`ws` trực tiếp** ở chế độ `noServer`, gắn vào sự kiện `upgrade` của HTTP server Fastify (không dùng `@fastify/websocket`), đúng stack trong AGENTS.md. Đường dẫn khác `/ws` bị từ chối nâng cấp.
- Giới hạn kích thước: `maxPayload = 2048` byte (`MAX_CLIENT_MESSAGE_BYTES` trong shared). Vượt thì ws đóng kết nối với mã 1009.
- Giới hạn tần suất: xô token mỗi kết nối, gửi dồn tối đa 10 tin, hồi 5 tin/giây. Vượt thì server báo `rate_limited` một lần cho mỗi đợt và bỏ qua các tin thừa.
- Tin nhị phân bị từ chối (`bad_message`). Tắt `perMessageDeflate`.
- Chưa có kiểm tra `Origin`, heartbeat ping/pong và xác thực: để tới phase server nhiều người chơi (Phase 4).

### Tin thử kết nối (tạm thời, chỉ cho Phase 0)

`docs/PROTOCOL.md` để trống theo yêu cầu prompt; định dạng tin echo ghi tạm ở đây, schema zod nằm ở `packages/shared/src/protocol.ts`.

- Client → server: `{ "type": "echo", "text": string }`, `text` sau khi cắt khoảng trắng dài 1–200 ký tự, không được có trường thừa.
- Server → client: `{ "type": "echo", "text": string, "serverTime": number }`, `serverTime` là mili giây từ epoch (UTC); client tự đổi ra giờ địa phương.
- Lỗi: `{ "type": "error", "code": "bad_message" | "rate_limited" }`. Server chỉ gửi **mã lỗi**, câu tiếng Việt do client tra trong file chuỗi.

### Chuỗi hiển thị, log và ngôn ngữ

- Chuỗi hiển thị cho người chơi ở `apps/client/src/strings.ts`. `GAME_NAME` ở `packages/shared` vì server cũng dùng.
- Log server và thông báo lỗi nội bộ (không hiện cho người chơi) viết bằng tiếng Anh; comment trong code viết tiếng Việt.
- Log Fastify chỉ ghi method và đường dẫn (bỏ query string), không ghi IP, hostname, header hay nội dung tin WebSocket.

### Chưa làm trong Phase 0 (cố ý)

- **Chưa cài `better-sqlite3`**: Phase 0 chưa lưu dữ liệu. Sẽ thêm cùng lớp repository khi tới phần tài khoản và lưu trữ.
- **Chưa dùng font riêng**: dùng font hệ thống (`system-ui`…), hiển thị tốt tiếng Việt.
- Chưa có Origin check, heartbeat, xác thực WebSocket (xem trên).
- Server chưa phục vụ file tĩnh của client khi chạy bản build; sẽ làm ở phase deploy (Phase 7).
