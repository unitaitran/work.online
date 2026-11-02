# RUNBOOK: triển khai, cập nhật, khôi phục

Tài liệu vận hành cho một máy chủ nhỏ (VPS). Mọi lệnh chạy ở thư mục gốc repo.

## 1. Dựng mới bằng Docker (khuyến nghị)

Yêu cầu: Docker + Docker Compose, tên miền trỏ về máy chủ (cho HTTPS).

```bash
git clone <repo> dilam-online && cd dilam-online
cp .env.example .env
```

Sửa `.env` tối thiểu: `DOMAIN` (tên miền), `ADMIN_KEY` (chuỗi ngẫu nhiên ≥ 24 ký tự, ví dụ `openssl rand -hex 24`), `BUILD_ID` (ví dụ `git rev-parse --short HEAD`). Không bật `DEV_TOOLS` (server từ chối khởi động nếu `NODE_ENV=production` mà bật). Muốn riêng tài khoản của mình có "Công cụ dev" (tua ngày, cộng XP/xu) thì đặt `DEV_USERS=<tên đăng nhập>` (nhiều tên cách nhau dấu phẩy); người khác không thấy bảng này và gọi API dev nhận 404.

```bash
docker compose up -d --build
docker compose ps
curl -s https://$DOMAIN/api/health
```

- `app`: server + client (cùng nguồn). Dữ liệu ở volume `data` (`/data/dilam.sqlite`).
- `caddy`: HTTPS tự động, chuyển WebSocket qua `wss`, nén gzip/zstd. Log không ghi query (token).
- `backup`: sao lưu mỗi 24 giờ vào `./backups` (giữ `BACKUP_KEEP` bản).

Nếu Docker Hub giới hạn lượt tải, đổi base image: `docker build --build-arg NODE_IMAGE=public.ecr.aws/docker/library/node:22-bookworm-slim .`

Dùng Nginx thay Caddy: xem `deploy/nginx.conf` (có `Upgrade/Connection` cho WebSocket, gzip, log không có query).

## 2. Dựng mới không dùng Docker

Yêu cầu: Node 22, công cụ build C++ (cho `better-sqlite3` nếu không có bản dựng sẵn).

```bash
npm ci
BUILD_ID=$(git rev-parse --short HEAD) npm run build
cd apps/server
NODE_ENV=production HOST=127.0.0.1 PORT=3000 DB_PATH=/var/lib/dilam/dilam.sqlite \
  CLIENT_DIST=$PWD/../client/dist TRUST_PROXY=1 ADMIN_KEY=... node dist/index.js
```

Đặt reverse proxy (Caddy hoặc `deploy/nginx.conf`) phía trước, chạy server bằng systemd hoặc tương đương với `KillSignal=SIGTERM`.

Đã kiểm chứng (Phase 7): clone sạch → `npm ci` → build → chạy → tạo tài khoản → sao lưu → dừng → khôi phục sang đường dẫn mới → chạy lại → dữ liệu còn nguyên, client chạy qua CSP không lỗi.

## 3. Kiểm tra sức khoẻ và giám sát

- `GET /api/health` → `{ ok: true }` (Docker HEALTHCHECK dùng endpoint này).
- `GET /api/capacity` → `{ online, limit, busy }`.
- `GET /api/admin/analytics` (header `x-admin-key`) → số lượt mở từng màn theo ngày (ẩn danh).
- Trang `/admin`: kiểm duyệt tường than thở.

## 4. Cập nhật phiên bản và rollback

```bash
git pull
docker compose build app && docker compose up -d app
```

- Server nhận `SIGTERM`: gửi `kicked: shutdown` cho mọi người, đóng WebSocket mã 1001, chờ tối đa 1 giây rồi thoát. Client tự kết nối lại khi server lên.
- Image được gắn thẻ theo `BUILD_ID`. **Rollback**: đặt lại `BUILD_ID` cũ trong `.env` rồi `docker compose up -d app` (image cũ còn trong máy), hoặc `git checkout <tag>` rồi build lại.
- Migration chỉ thêm (không sửa migration cũ). Rollback mã nguồn qua một migration mới thì **khôi phục bản sao lưu trước khi cập nhật** (mục 5), vì mã cũ không biết bảng mới nhưng vẫn chạy được với bảng thừa.

## 5. Sao lưu và khôi phục

Sao lưu thủ công (server vẫn chạy, dùng API backup của SQLite):

```bash
docker compose run --rm backup node server/backup.js
# hoặc không Docker:
DB_PATH=... BACKUP_DIR=... node apps/server/dist/backup.js
```

Bản sao là một tệp `.sqlite` đã kiểm tra `integrity_check`. Đưa ra ngoài máy chủ: gắn `./backups` vào ổ mạng, hoặc đặt `BACKUP_UPLOAD_CMD` (ví dụ `rclone copy {file} remote:dilam-backups`).

Khôi phục:

```bash
docker compose stop app
docker compose run --rm app node server/restore.js /backups/dilam-YYYYMMDD-HHMMSS.sqlite --force
docker compose start app
```

`restore.js` kiểm tra toàn vẹn bản sao, giữ DB hiện tại thành `dilam.sqlite.before-restore-<thời gian>`, chép bản sao vào `DB_PATH` rồi chạy migration còn thiếu. Có test tự động (`apps/server/src/ops/ops.test.ts`).

## 6. Đổi phiên bản giao thức

Khi đổi gói tin không tương thích (REST hoặc WebSocket):

1. Tăng `PROTOCOL_VERSION` trong `packages/shared/src/api.ts`.
2. Build và triển khai client + server cùng lúc (cùng image).
3. Client cũ đang mở thấy `welcome.protocol` hoặc `/api/meta.protocolVersion` khác → màn "Trò chơi vừa được cập nhật, tải lại". Chỉ đổi bản build (cùng giao thức) thì client hiện gợi ý tải lại không bắt buộc.
4. Service worker chỉ cache `/assets/*` (tên đã băm) nên tải lại là có bản mới.

## 7. Sự cố thường gặp

| Triệu chứng                   | Kiểm tra                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| Không vào được WebSocket      | Proxy có chuyển `Upgrade`? `CORS_ORIGINS`/tên miền đúng (server chặn Origin lạ, trả 403)? |
| Mọi người cùng IP (sau proxy) | Đặt `TRUST_PROXY=1`                                                                       |
| Nhiều người báo "kín chỗ"     | Tăng `SERVER_CAPACITY` (xem số đo trong `docs/PERF.md`)                                   |
| `429` khi tạo tài khoản       | Giới hạn 5 tài khoản/IP, hồi 1 mỗi 10 phút (đúng thiết kế)                                |

## Máy chủ thật congso.online và tự deploy (CI/CD)

- VPS Ubuntu 22.04 (1 nhân, 1 GB RAM + 2 GB swap), thư mục `/opt/dilam`: `docker-compose.yml` (chép từ `deploy/docker-compose.prod.yml`), `Caddyfile` (từ `deploy/Caddyfile.prod`), `.env` (chỉ nằm trên VPS, quyền 600), `backups/` (sao lưu SQLite hằng ngày, giữ 14 bản). Tường lửa chỉ mở SSH, 80, 443.
- Không build trên VPS. Push lên `main` → workflow **CI** đạt → workflow **Deploy** build image, đẩy lên `ghcr.io/unitaitran/work.online:<sha>`, chép cấu hình lên VPS, chạy `deploy/remote-deploy.sh`: kéo image, khởi động lại, đợi `/api/health`; lỗi thì tự quay về image cũ. Bấm tay: tab Actions → Deploy → Run workflow.
- Secrets của repo: `DEPLOY_HOST`, `DEPLOY_SSH_KEY` (khoá riêng chỉ dùng cho Actions), `DEPLOY_KNOWN_HOSTS`. Thu hồi quyền: xoá dòng `dilam-github-actions` trong `/root/.ssh/authorized_keys`.
- Đổi cấu hình (ví dụ `DEV_USERS`, `SERVER_CAPACITY`): sửa `/opt/dilam/.env` rồi `cd /opt/dilam && docker compose up -d`.
- Xem log: `cd /opt/dilam && docker compose logs -f --tail 100 app`. Vào thử bằng IP khi tên miền chưa trỏ: `http://45.117.178.60`.
