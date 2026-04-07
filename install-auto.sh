#!/bin/bash

# FLVX 自动探测安装脚本
# 根据网络环境自动选择最优下载源

set -e

# 接收所有参数（包括 -a, -s, -n 等）
AUTO_ARGS="$@"

echo "🔍 正在检测网络环境..."

# 网络环境探测（优先级：GitHub > Cloudflare > 国内 CDN）
detect_and_download() {
  local download_host=""
  
  # 尝试 1：直接访问 GitHub（海外机器首选）
  if curl -fsSL --max-time 5 https://github.com/ > /dev/null 2>&1; then
    download_host="https://github.com/abai569/flvx/releases/latest/download"
    echo "🌍 检测到海外网络，使用 GitHub"
  # 尝试 2：访问 Cloudflare 探测（国内机器可能能访问）
  elif curl -fsSL --max-time 5 https://www.cloudflare.com/ > /dev/null 2>&1; then
    download_host="https://git-proxy.abai.eu.org/abai569/flvx/releases/latest/download"
    echo "🌐 检测到国内网络（Cloudflare 可达），使用 Cloudflare 代理"
  # 尝试 3：访问国内 CDN
  elif curl -fsSL --max-time 5 https://chfs.646321.xyz:8/chfs/shared/flvx/ > /dev/null 2>&1; then
    download_host="https://chfs.646321.xyz:8/chfs/shared/flvx"
    echo "🌏 检测到国内网络，使用国内 CDN"
  else
    # 全部失败，默认使用 GitHub
    download_host="https://github.com/abai569/flvx/releases/latest/download"
    echo "⚠️  网络探测失败，默认使用 GitHub"
  fi
  
  # 下载安装脚本（带重试）
  local max_retries=3
  local retry=0
  
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
          return 0
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
        *"github.com"*)
          download_host="https://git-proxy.abai.eu.org/abai569/flvx/releases/latest/download"
          echo "⚠️  GitHub 下载失败，切换到 Cloudflare 代理..."
          ;;
        *"git-proxy.abai.eu.org"*)
          download_host="https://chfs.646321.xyz:8/chfs/shared/flvx"
          echo "⚠️  Cloudflare 代理下载失败，切换到国内 CDN..."
          ;;
        *"chfs.646321.xyz"*)
          download_host="https://github.com/abai569/flvx/releases/latest/download"
          echo "⚠️  国内 CDN 下载失败，切换回 GitHub..."
          ;;
      esac
    fi
  done
  
  echo "❌ 所有下载源都失败，请检查网络连接"
  echo "💡 提示：可以尝试手动指定下载源"
  echo "   国内用户：curl -L https://chfs.646321.xyz:8/chfs/shared/flvx/install.sh -o ./install.sh"
  echo "   海外用户：curl -L https://github.com/abai569/flvx/releases/latest/download/install.sh -o ./install.sh"
  return 1
}

# 执行主逻辑
detect_and_download
