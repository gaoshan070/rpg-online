#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAMPLE_DIR="$ROOT_DIR/samples/cloudflare-mmorpg"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "错误：未找到 pnpm，请先安装 pnpm@11.6.0。" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "错误：未找到 Node.js，请先安装 Node.js 22 或更高版本。" >&2
  exit 1
fi

if [[ ! -f "$SAMPLE_DIR/.env.publisher" ]]; then
  echo "错误：缺少 $SAMPLE_DIR/.env.publisher" >&2
  echo "请配置 RPGJS_PUBLISH_TARGET、RPGJS_MAP_UPDATE_TOKEN 和 RPGJS_MAP_IDS。" >&2
  exit 1
fi

cd "$ROOT_DIR"

echo "==> 安装依赖"
pnpm install --frozen-lockfile

echo "==> 运行 Cloudflare Worker 测试"
pnpm --dir "$SAMPLE_DIR" test

echo "==> 构建游戏"
pnpm --dir "$SAMPLE_DIR" build

echo "==> 部署到 Cloudflare production"
pnpm --dir "$SAMPLE_DIR" exec wrangler deploy --env production

echo "==> 发布地图"
cd "$SAMPLE_DIR"
node --env-file=.env.publisher --import tsx src/publish-maps.ts

echo "==> 部署完成"
