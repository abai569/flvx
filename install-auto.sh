#!/bin/bash

# FLVX 自动探测安装脚本
# 根据网络环境自动选择最优下载源

set -e

# 接收所有参数（包括 -a, -s, -n 等）
AUTO_ARGS="$@"

echo "🔍 正在检测网络环境..."

# 网络环境探测（3 秒超时）
detect_network() {
  # 检测是否是国内网络（访问 Apple 看是否返回 geo=cn）
  if curl -fsSL --max-time 3 http://www.apple.com/ 2>/dev/null | grep -qi "geo=cn"; then
    return 0  # 国内
  fi
  return 1  # 海外
}

# 下载文件（带重试和 fallback）
download_file() {
  local url="$1"
  local output="$2"
  local max_retries=2
  local retry=0
  
  while [ $retry -lt $max_retries ]; do
    if curl -L --max-time 10 "$url" -o "$output" 2>/dev/null; then
      if [ -s "$output" ]; then
        return 0
      fi
    fi
    retry=$((retry + 1))
    echo "⚠️  下载失败，尝试备用源... ($retry/$max_retries)"
    
    # 切换备用源
    if [[ "$url" == *"chfs.646321.xyz"* ]]; then
      url="${url/chfs.646321.xyz:8\/chfs\/shared\/flvx/github.com/abai569/flvx/releases/latest/download}"
    elif [[ "$url" == *"github.com"* ]]; then
      url="${url/github.com\/abai569\/flvx\/releases\/latest\/download/chfs.646321.xyz:8/chfs/shared/flvx}"
    fi
  done
  
  return 1
}

# 主逻辑
main() {
  if detect_network; then
    # 国内网络：使用国内 CDN
    DOWNLOAD_HOST="https://chfs.646321.xyz:8/chfs/shared/flvx"
    echo "🌏 检测到国内网络，使用国内 CDN"
  else
    # 海外网络：使用 GitHub
    DOWNLOAD_HOST="https://github.com/abai569/flvx/releases/latest/download"
    echo "🌍 检测到海外网络，使用 GitHub"
  fi
  
  # 下载安装脚本
  echo "⬇️  下载安装脚本..."
  if ! download_file "${DOWNLOAD_HOST}/install.sh" "./install_temp.sh"; then
    echo "❌ 下载失败，请检查网络连接"
    echo "💡 提示：可以尝试手动指定下载源"
    echo "   国内用户：curl -L https://chfs.646321.xyz:8/chfs/shared/flvx/install.sh -o ./install.sh"
    echo "   海外用户：curl -L https://github.com/abai569/flvx/releases/latest/download/install.sh -o ./install.sh"
    exit 1
  fi
  
  chmod +x ./install_temp.sh
  
  echo "✅ 下载完成，开始安装..."
  echo ""
  
  # 执行安装脚本（传递所有参数）
  ./install_temp.sh $AUTO_ARGS
}

# 执行主函数
main
