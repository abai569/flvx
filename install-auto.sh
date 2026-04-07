#!/bin/bash

# FLVX 自动探测安装脚本
# 根据网络环境自动选择最优下载源

set -e

# 接收所有参数（包括 -a, -s, -n 等）
AUTO_ARGS="$@"

echo "🔍 正在检测网络环境..."

# 网络环境探测（参考 nyanpass 逻辑）
CN=0
OS=0
NW_FAIL=0

# 尝试 1：检测 Apple 判断是否国内网络
do_apple_detect() {
  echo "🍎 检测 Apple 网络..."
  local out=$(curl --retry 3 --retry-delay 1 --max-time 3 -sI http://www.apple.com/ 2>/dev/null || echo "")
  if [ $? -ne 0 ] || [ -z "$out" ]; then
    NW_FAIL=1
  else
    out=$(echo "$out" | grep -i "geo=cn" || echo "")
    if [ -n "$out" ]; then
      CN=1
      echo "✅ 检测到国内网络 (Apple geo=cn)"
    else
      OS=1
      echo "✅ 检测到海外网络 (Apple 无 geo=cn)"
    fi
  fi
}

# 尝试 2：检测 Cloudflare 判断位置
do_cloudflare_detect() {
  echo "☁️  检测 Cloudflare 网络..."
  local out=$(curl --retry 3 --retry-delay 1 --max-time 3 -s https://www.cloudflare.com/cdn-cgi/trace 2>/dev/null || echo "")
  if [ $? -ne 0 ] || [ -z "$out" ]; then
    NW_FAIL=1
  else
    out=$(echo "$out" | grep -i "loc=CN" || echo "")
    if [ -n "$out" ]; then
      CN=1
      echo "✅ 检测到国内网络 (Cloudflare loc=CN)"
    else
      OS=1
      echo "✅ 检测到海外网络 (Cloudflare 非 CN)"
    fi
  fi
}

# 版本通道（stable/beta）
CHANNEL="${CHANNEL:-stable}"

# 主检测逻辑
do_apple_detect
if [ "$CN" != "1" ]; then
  do_cloudflare_detect
fi

# 根据检测结果设置下载源
if [ "$CN" == "1" ]; then
  # 国内网络：使用国内 CDN
  download_host="https://chfs.646321.xyz:8/chfs/shared/flvx/${CHANNEL}"
  echo "🌏 使用国内 CDN (${CHANNEL})"
elif [ "$OS" == "1" ]; then
  # 海外网络：使用 ghfast.top 加速
  download_host="${GHFAST_URL:-https://ghfast.top}/https://github.com/abai569/flvx/releases/latest/download"
  echo "🌍 使用 GitHub 加速 (${download_host})"
else
  # 检测失败：默认使用 GitHub
  download_host="${GHFAST_URL:-https://ghfast.top}/https://github.com/abai569/flvx/releases/latest/download"
  echo "⚠️  网络检测失败，使用 GitHub 加速"
fi

# 下载安装脚本（带重试）
max_retries=3
retry=0

while [ $retry -lt $max_retries ]; do
  echo "⬇️  下载安装脚本 (尝试 $((retry + 1))/$max_retries)..."
  if curl -L --max-time 30 "${download_host}/install.sh" -o "./install_temp.sh" 2>/dev/null; then
    if [ -s "./install_temp.sh" ]; then
      # 验证下载的是否是有效脚本（检查是否包含 shebang）
      if head -1 "./install_temp.sh" | grep -q "^#!"; then
        echo "✅ 下载完成，开始安装..."
        echo ""
        chmod +x ./install_temp.sh
        # 执行安装脚本（传递 DOWNLOAD_HOST 环境变量和所有参数）
        DOWNLOAD_HOST="${download_host}" ./install_temp.sh $AUTO_ARGS
        exit 0
      else
        echo "⚠️  下载的文件无效，不是有效的脚本"
        rm -f ./install_temp.sh
      fi
    fi
  fi
  
  retry=$((retry + 1))
  
  # 切换备用源
  if [ $retry -lt $max_retries ]; then
    case "$download_host" in
      *"github.com"*|*"ghfast.top"*)
        download_host="https://chfs.646321.xyz:8/chfs/shared/flvx/${CHANNEL}"
        echo "⚠️  GitHub 下载失败，切换到国内 CDN..."
        ;;
      *"chfs.646321.xyz"*)
        download_host="${GHFAST_URL:-https://ghfast.top}/https://github.com/abai569/flvx/releases/latest/download"
        echo "⚠️  国内 CDN 下载失败，切换到 GitHub 加速..."
        ;;
    esac
  fi
done

echo "❌ 所有下载源都失败，请检查网络连接"
echo "💡 提示：可以尝试手动指定下载源"
echo "   国内用户：curl -L https://chfs.646321.xyz:8/chfs/shared/flvx/install.sh -o ./install.sh"
echo "   海外用户：curl -L https://github.com/abai569/flvx/releases/latest/download/install.sh -o ./install.sh"
exit 1
