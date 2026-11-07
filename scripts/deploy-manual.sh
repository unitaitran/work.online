#!/usr/bin/env bash
# Deploy tay từ máy cá nhân, làm đúng các bước của .github/workflows/deploy.yml
# (dùng khi GitHub Actions không chạy được). Chạy từ gốc repo, bằng Git Bash:
#
#   DEPLOY_HOST=<ip-hoặc-tên-máy> bash scripts/deploy-manual.sh
#
# Cần: Docker đang chạy, SSH vào root@DEPLOY_HOST bằng khoá đã cài sẵn,
# và token ghcr.io có quyền write:packages: đặt GHCR_TOKEN, hoặc để trống để dùng `gh auth token`
# (khi đó cần: gh auth refresh -s write:packages).
set -euo pipefail

: "${DEPLOY_HOST:?Thiếu DEPLOY_HOST (địa chỉ VPS)}"
IMAGE_REPO="ghcr.io/unitaitran/work.online"
GH_USER="${GH_USER:-$(gh api user -q .login)}"
TOKEN="${GHCR_TOKEN:-$(gh auth token)}"

if [ -n "$(git status --porcelain)" ]; then
  echo "Còn thay đổi chưa commit. Commit hoặc stash trước khi deploy." >&2
  exit 1
fi
SHA="$(git rev-parse HEAD)"
echo "Deploy commit $SHA (nhánh $(git rev-parse --abbrev-ref HEAD)) lên $DEPLOY_HOST"

echo "== Build image"
docker build --build-arg "BUILD_ID=$SHA" -t "$IMAGE_REPO:$SHA" -t "$IMAGE_REPO:latest" .

echo "== Đẩy image lên ghcr.io"
printf '%s\n' "$TOKEN" | docker login ghcr.io -u "$GH_USER" --password-stdin >/dev/null
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT
docker push "$IMAGE_REPO:$SHA"
docker push "$IMAGE_REPO:latest"

echo "== Chép cấu hình lên máy chủ"
scp deploy/docker-compose.prod.yml "root@$DEPLOY_HOST:/opt/dilam/docker-compose.yml"
scp deploy/Caddyfile.prod "root@$DEPLOY_HOST:/opt/dilam/Caddyfile"
scp deploy/remote-deploy.sh "root@$DEPLOY_HOST:/opt/dilam/remote-deploy.sh"

echo "== Khởi động bản mới (lỗi health thì tự quay về bản cũ)"
printf '%s\n' "$TOKEN" | ssh "root@$DEPLOY_HOST" \
  "bash /opt/dilam/remote-deploy.sh '$IMAGE_REPO:$SHA' '$GH_USER'"
