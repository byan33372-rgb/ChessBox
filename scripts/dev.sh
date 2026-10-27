#!/usr/bin/env bash
# 开发/生产/停止（macOS & Linux）
# 用法：
#   bash scripts/dev.sh         开发模式
#   bash scripts/prod.sh        生产模式（自动构建+启动）
#   bash scripts/prod.sh tunnel 生产 + 隧道
#   bash scripts/stop.sh        停止 3001 端口服务
set -e
cd "$(dirname "$0")/.."

case "${1:-dev}" in
  dev)
    [ -d node_modules ] || npm install
    echo "[dev] 后端 http://127.0.0.1:3001 + 前端 http://localhost:5173"
    npm run dev
    ;;
  prod)
    [ -d node_modules ] || npm install
    [ -d dist-client ] && [ -d dist-server ] || npm run build
    echo "[prod] http://127.0.0.1:3001（Ctrl+C 停止）"
    npm start
    ;;
  tunnel)
    [ -d node_modules ] || npm install
    [ -d dist-client ] && [ -d dist-server ] || npm run build
    node dist-server/server/index.js &
    SERVER_PID=$!
    sleep 2
    trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
    node scripts/tunnel.mjs
    ;;
  stop)
    PID=$(lsof -ti tcp:3001 || true)
    if [ -n "$PID" ]; then
      echo "[stop] 停止 PID $PID"
      kill $PID
    else
      echo "[stop] 端口 3001 上没有服务"
    fi
    ;;
  *)
    echo "用法: bash scripts/dev.sh | prod | tunnel | stop"
    ;;
esac
