# syntax=docker/dockerfile:1
# Đi làm Online: một image chạy server (Fastify + ws) và phục vụ luôn bản build client cùng nguồn.

# Base image đổi được (ví dụ bản sao public.ecr.aws/docker/library/node:22-bookworm-slim khi Docker Hub giới hạn).
ARG NODE_IMAGE=node:22-bookworm-slim

# ---------- Tầng build: cài đủ phụ thuộc (kể cả dev), build client + server ----------
FROM ${NODE_IMAGE} AS build
WORKDIR /app
# better-sqlite3 cần công cụ biên dịch nếu không tải được bản dựng sẵn.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
RUN npm ci
COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
ARG BUILD_ID=local
ENV BUILD_ID=${BUILD_ID}
RUN npm run build -w @dilam/client && npm run build -w @dilam/server
# Chỉ giữ phụ thuộc chạy thật.
RUN npm prune --omit=dev

# ---------- Tầng chạy: nhỏ gọn, không có công cụ build, chạy bằng người dùng thường ----------
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DB_PATH=/data/dilam.sqlite \
    BACKUP_DIR=/backups \
    CLIENT_DIST=/app/client \
    TRUST_PROXY=1
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./server
COPY --from=build /app/apps/client/dist ./client
ARG BUILD_ID=local
ENV BUILD_ID=${BUILD_ID}
RUN mkdir -p /data /backups && chown -R node:node /data /backups
USER node
VOLUME ["/data", "/backups"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# SIGTERM được server xử lý: báo người chơi "bảo trì", đóng WebSocket êm rồi thoát.
STOPSIGNAL SIGTERM
CMD ["node", "server/index.js"]
