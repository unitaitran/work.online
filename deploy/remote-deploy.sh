#!/usr/bin/env bash
# Chạy trên máy chủ (gọi từ workflow Deploy): kéo image mới, khởi động lại, kiểm tra health,
# lỗi thì quay về image cũ. Token đăng nhập ghcr.io đọc từ stdin (không nằm trong tham số lệnh).
#   bash /opt/dilam/remote-deploy.sh <image:tag> <github-user>  < token
set -euo pipefail
NEW_IMAGE="$1"
GH_USER="$2"
cd /opt/dilam

docker login ghcr.io -u "$GH_USER" --password-stdin >/dev/null
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT

set_image() {
  if grep -q '^IMAGE=' .env; then
    sed -i "s#^IMAGE=.*#IMAGE=$1#" .env
  else
    printf 'IMAGE=%s\n' "$1" >> .env
  fi
}

healthy() {
  for _ in $(seq 1 40); do
    if docker compose exec -T app node -e \
      "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

PREVIOUS="$(grep '^IMAGE=' .env | cut -d= -f2- || true)"
docker pull "$NEW_IMAGE"
set_image "$NEW_IMAGE"
# Đồng bộ BUILD_ID để client báo "có phiên bản mới".
if grep -q '^BUILD_ID=' .env; then
  sed -i "s#^BUILD_ID=.*#BUILD_ID=${NEW_IMAGE##*:}#" .env
fi
docker compose up -d --remove-orphans

if healthy; then
  echo "Deploy xong: $NEW_IMAGE"
  docker image prune -af --filter "until=168h" >/dev/null || true
  exit 0
fi

echo "Health lỗi, quay về bản cũ: ${PREVIOUS:-không có}" >&2
docker compose logs --tail 80 app >&2 || true
if [ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$NEW_IMAGE" ]; then
  set_image "$PREVIOUS"
  docker compose up -d --remove-orphans
fi
exit 1
