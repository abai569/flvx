#!/bin/bash

# GitHub repo used for release downloads
REPO="abai569/flvx"

# 固定版本号（Release 构建时自动填充，留空则获取最新版）
PINNED_VERSION=""

# 默认服务名
SERVICE_NAME="flux_agent"
SERVER_ADDR=""
SECRET=""

# 解析命令行参数
while getopts "a:s:n:" opt; do
  case $opt in
    a) SERVER_ADDR="$OPTARG" ;;
    s) SECRET="$OPTARG" ;;
    n) SERVICE_NAME="$OPTARG" ;;
    *) echo "❌ 无效参数"; exit 1 ;;
  esac
done

# 安装目录 (根据 SERVICE_NAME 动态生成)
INSTALL_DIR="/etc/${SERVICE_NAME}"

# 获取系统架构
get_architecture() {
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)
            echo "amd64"
            ;;
        aarch64|arm64)
            echo "arm64"
            ;;
        *)
            echo "amd64"  # 默认使用 amd64
            ;;
    esac
}

# 自动检测下载源
# 根据脚本下载 URL 判断使用哪个下载源
detect_download_host() {
    local script_url="$1"
    if [[ "$script_url" == *"chfs.646321.xyz"* ]]; then
        echo "https://chfs.646321.xyz:8/chfs/shared/flvx"
    elif [[ "$script_url" == *"ghfast.top"* ]]; then
        echo "https://ghfast.top/https://github.com/abai569/flvx/releases/download"
    elif [[ "$script_url" == *"github.com"* ]]; then
        echo "https://github.com/abai569/flvx/releases/download"
    else
        # 默认使用 GitHub
        echo "https://github.com/abai569/flvx/releases/download"
    fi
}

# 获取下载脚本的 URL
SCRIPT_URL="${SCRIPT_URL:-}"
if [ -z "$SCRIPT_URL" ]; then
    # 尝试从 $0 获取
    SCRIPT_URL="$0"
fi

# 检测下载源
DOWNLOAD_HOST=$(detect_download_host "$SCRIPT_URL")

# 获取系统架构
get_architecture() {
    ARCH=$(uname -m)
    case $ARCH in
        x86_64)
            echo "amd64"
            ;;
        aarch64|arm64)
            echo "arm64"
            ;;
        *)
            echo "amd64"  # 默认使用 amd64
            ;;
    esac
}

# 获取最新版本号
resolve_latest_release_tag() {
  local tag
  tag=$(curl -fsSL "${DOWNLOAD_HOST}/VERSION" 2>/dev/null || echo "")
  if [[ -n "$tag" ]]; then
    echo "$tag"
    return 0
  fi
  echo "2.2.5"  # 默认版本
  return 0
}

resolve_version() {
  if [[ -n "${VERSION:-}" ]]; then
    echo "$VERSION"
    return 0
  fi
  if [[ -n "${FLUX_VERSION:-}" ]]; then
    echo "$FLUX_VERSION"
    return 0
  fi
  if [[ -n "${PINNED_VERSION:-}" ]]; then
    echo "$PINNED_VERSION"
    return 0
  fi

  if resolve_latest_release_tag; then
    return 0
  fi

  echo "❌ 无法获取最新版本号。你可以手动指定版本，例如：VERSION=<版本号> ./install.sh" >&2
  return 1
}

# 构建下载地址
# 国内 CDN：硬编码完整路径
# GitHub：需要带版本号
build_download_url() {
    local ARCH=$(get_architecture)
    
    # 国内 CDN 直接硬编码完整路径
    if [[ "$DOWNLOAD_HOST" == *"chfs.646321.xyz"* ]]; then
        echo "https://chfs.646321.xyz:8/chfs/shared/flvx/gost-${ARCH}"
        return
    fi
    
    # GitHub 或其他源需要版本号
    local actual_version="$RESOLVED_VERSION"
    if [[ "$DOWNLOAD_HOST" == *"/latest"* ]]; then
        # 从 GitHub API 获取最新版本号
        actual_version=$(curl -fsSL --max-time 10 "https://api.github.com/repos/abai569/flvx/releases/latest" 2>/dev/null | grep -m1 '"tag_name"' | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/' || echo "")
        if [ -n "$actual_version" ]; then
            RESOLVED_VERSION="$actual_version"
        fi
    fi
    
    echo "${DOWNLOAD_HOST}/${RESOLVED_VERSION}/gost-${ARCH}"
}

# 显示下载源信息
show_download_source() {
    local url="$1"
    if [[ "$url" == *"chfs.646321.xyz"* ]]; then
        echo "🌏 正在通过国内镜像源下载 flux_agent 中..."
    elif [[ "$url" == *"github.com"* ]]; then
        echo "🌍 正在通过 GitHub 镜像源下载 flux_agent 中..."
    else
        echo "🌐 正在通过自定义镜像源下载 flux_agent 中..."
    fi
}

# 解析版本并构建下载地址
RESOLVED_VERSION=$(resolve_version) || exit 1
DOWNLOAD_URL="$(build_download_url)"

# 显示菜单
show_menu() {
  echo "==============================================="
  echo "              管理脚本"
  echo "==============================================="
  echo "请选择操作："
  echo "1. 安装"
  echo "2. 更新"  
  echo "3. 卸载"
  echo "4. 退出"
  echo "==============================================="
}

# 检查并安装 tcpkill
check_and_install_tcpkill() {
  if command -v tcpkill &> /dev/null; then
    return 0
  fi
  
  OS_TYPE=$(uname -s)
  if [[ "$OS_TYPE" == "Darwin" ]]; then
    if command -v brew &> /dev/null; then
      brew install dsniff &> /dev/null
    fi
    return 0
  fi
  
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    DISTRO=$ID
  elif [ -f /etc/redhat-release ]; then
    DISTRO="rhel"
  elif [ -f /etc/debian_version ]; then
    DISTRO="debian"
  else
    return 0
  fi
  
  case $DISTRO in
    ubuntu|debian)
      apt update &> /dev/null
      apt install -y dsniff &> /dev/null
      ;;
    centos|rhel|fedora)
      if command -v dnf &> /dev/null; then
        dnf install -y dsniff &> /dev/null
      elif command -v yum &> /dev/null; then
        yum install -y dsniff &> /dev/null
      fi
      ;;
    alpine)
      apk add --no-cache dsniff &> /dev/null
      ;;
    arch|manjaro)
      pacman -S --noconfirm dsniff &> /dev/null
      ;;
    opensuse*|sles)
      zypper install -y dsniff &> /dev/null
      ;;
    gentoo)
      emerge --ask=n net-analyzer/dsniff &> /dev/null
      ;;
    void)
      xbps-install -Sy dsniff &> /dev/null
      ;;
  esac
  
  return 0
}

# 自动检测系统中已安装的实例
detect_installed_instances() {
  INSTALLED_INSTANCES=()
  # 扫描 systemd 中带有 Proxy Service 描述的服务
  for svc_file in /etc/systemd/system/*.service; do
    if [[ -f "$svc_file" ]] && grep -q "Proxy Service" "$svc_file" 2>/dev/null; then
      svc_name=$(basename "$svc_file" .service)
      INSTALLED_INSTANCES+=("$svc_name")
    fi
  done
}

# 智能选择实例 (用于更新和卸载)
select_instance() {
  detect_installed_instances
  
  if [[ ${#INSTALLED_INSTANCES[@]} -eq 0 ]]; then
    echo "❌ 未检测到任何已安装的服务实例。"
    return 1
  elif [[ ${#INSTALLED_INSTANCES[@]} -eq 1 ]]; then
    SERVICE_NAME="${INSTALLED_INSTANCES[0]}"
    INSTALL_DIR="/etc/${SERVICE_NAME}"
    echo "🔍 自动选中唯一实例: ${SERVICE_NAME}"
    return 0
  else
    echo "🔍 检测到多个实例，请选择要操作的实例："
    local i=1
    for svc in "${INSTALLED_INSTANCES[@]}"; do
      echo "  $i. $svc"
      ((i++))
    done
    
    while true; do
      read -p "请输入数字选项 (1-${#INSTALLED_INSTANCES[@]}): " choice
      if [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 1 ] && [ "$choice" -le ${#INSTALLED_INSTANCES[@]} ]; then
        SERVICE_NAME="${INSTALLED_INSTANCES[$((choice-1))]}"
        INSTALL_DIR="/etc/${SERVICE_NAME}"
        echo "✅ 已选择实例: ${SERVICE_NAME}"
        return 0
      else
        echo "❌ 无效选项，请重新输入"
      fi
    done
  fi
}

# 获取用户输入的配置参数 (安装时用)
get_config_params() {
  if [[ -z "$SERVER_ADDR" || -z "$SECRET" ]]; then
    echo "请输入配置参数："
    
    read -p "服务名 (默认: ${SERVICE_NAME}): " input_name
    if [[ -n "$input_name" ]]; then
      SERVICE_NAME="$input_name"
      INSTALL_DIR="/etc/${SERVICE_NAME}"
    fi
    
    if [[ -z "$SERVER_ADDR" ]]; then
      read -p "服务器地址: " SERVER_ADDR
    fi
    
    if [[ -z "$SECRET" ]]; then
      read -p "密钥: " SECRET
    fi
    
    if [[ -z "$SERVER_ADDR" || -z "$SECRET" ]]; then
      echo "❌ 参数不完整，操作取消。"
      exit 1
    fi
  fi
}

# 安装功能
install_service() {
  get_config_params
  echo "🚀 开始安装 ${SERVICE_NAME}..."

  check_and_install_tcpkill
  
  mkdir -p "$INSTALL_DIR"

  if systemctl list-units --full -all | grep -Fq "${SERVICE_NAME}.service"; then
    echo "🔍 检测到已存在的 ${SERVICE_NAME} 服务"
    systemctl stop ${SERVICE_NAME} 2>/dev/null && echo "🛑 停止服务"
    systemctl disable ${SERVICE_NAME} 2>/dev/null && echo "🚫 禁用自启"
  fi

  [[ -f "$INSTALL_DIR/${SERVICE_NAME}" ]] && echo "🧹 删除旧文件 ${SERVICE_NAME}" && rm -f "$INSTALL_DIR/${SERVICE_NAME}"

  # 显示下载源并下载
  show_download_source "$DOWNLOAD_URL"
  curl -L "$DOWNLOAD_URL" -o "$INSTALL_DIR/${SERVICE_NAME}"
  if [[ ! -f "$INSTALL_DIR/${SERVICE_NAME}" || ! -s "$INSTALL_DIR/${SERVICE_NAME}" ]]; then
    echo "❌ 下载失败，请检查网络或下载链接。"
    exit 1
  fi
  chmod +x "$INSTALL_DIR/${SERVICE_NAME}"
  echo "✅ 下载完成"

  echo "🔎 ${SERVICE_NAME} 版本：$($INSTALL_DIR/${SERVICE_NAME} -V)"

  CONFIG_FILE="$INSTALL_DIR/config.json"
  echo "📄 创建新配置：config.json"
  cat > "$CONFIG_FILE" <<EOF
{
  "addr": "$SERVER_ADDR",
  "secret": "$SECRET",
  "service_name": "$SERVICE_NAME"
}
EOF

  GOST_CONFIG="$INSTALL_DIR/gost.json"
  if [[ -f "$GOST_CONFIG" ]]; then
    echo "⏭️ 跳过配置文件: gost.json (已存在)"
  else
    echo "📄 创建新配置: gost.json"
    cat > "$GOST_CONFIG" <<EOF
{}
EOF
  fi

  chmod 600 "$INSTALL_DIR"/*.json

  SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
  cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=${SERVICE_NAME} Proxy Service
After=network.target

[Service]
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/${SERVICE_NAME} -C $INSTALL_DIR/config.json
Restart=on-failure
StandardOutput=null
StandardError=null

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable ${SERVICE_NAME}
  systemctl start ${SERVICE_NAME}

  echo "🔄 检查服务状态..."
  if systemctl is-active --quiet ${SERVICE_NAME}; then
    echo "✅ 安装完成，${SERVICE_NAME} 服务已启动并设置为开机启动。"
    echo "📁 配置目录: $INSTALL_DIR"
    echo "🔧 服务状态: $(systemctl is-active ${SERVICE_NAME})"
  else
    echo "❌ ${SERVICE_NAME} 服务启动失败，请执行以下命令查看状态："
    echo "systemctl status ${SERVICE_NAME} --no-pager"
  fi
}

# 更新功能
update_service() {
  # 智能选择实例
  if ! select_instance; then
    return 1
  fi

  echo "🔄 开始更新 ${SERVICE_NAME}..."
  
  SCRIPT_PATH="$(readlink -f "$0" 2>/dev/null || realpath "$0" 2>/dev/null || echo "$0")"
  SCRIPT_DOWNLOAD_URL="${DOWNLOAD_HOST}/install.sh"
  
  echo "⬇️ 正在检查并更新安装脚本自身..."
  curl -L "$SCRIPT_DOWNLOAD_URL" -o "${SCRIPT_PATH}.new"
  if [[ -f "${SCRIPT_PATH}.new" && -s "${SCRIPT_PATH}.new" ]]; then
    mv "${SCRIPT_PATH}.new" "$SCRIPT_PATH"
    chmod +x "$SCRIPT_PATH"
    echo "✅ 安装脚本已更新覆盖"
  else
    echo "⚠️ 安装脚本下载失败，但不影响服务更新"
    rm -f "${SCRIPT_PATH}.new" 2>/dev/null
  fi

  echo "📥 使用服务下载地址：$DOWNLOAD_URL"
  
  check_and_install_tcpkill
  
  # 显示下载源并下载
  show_download_source "$DOWNLOAD_URL"
  curl -L "$DOWNLOAD_URL" -o "$INSTALL_DIR/${SERVICE_NAME}.new"
  if [[ ! -f "$INSTALL_DIR/${SERVICE_NAME}.new" || ! -s "$INSTALL_DIR/${SERVICE_NAME}.new" ]]; then
    echo "❌ 下载失败。"
    return 1
  fi

  if systemctl list-units --full -all | grep -Fq "${SERVICE_NAME}.service"; then
    echo "🛑 停止 ${SERVICE_NAME} 服务..."
    systemctl stop ${SERVICE_NAME}
  fi

  mv "$INSTALL_DIR/${SERVICE_NAME}.new" "$INSTALL_DIR/${SERVICE_NAME}"
  chmod +x "$INSTALL_DIR/${SERVICE_NAME}"
  
  echo "🔎 新版本：$($INSTALL_DIR/${SERVICE_NAME} -V)"

  echo "🔄 重启服务..."
  systemctl start ${SERVICE_NAME}
  
  echo "✅ 更新完成，服务已重新启动。"
}

# 卸载功能
uninstall_service() {
  # 智能选择实例
  if ! select_instance; then
    return 1
  fi

  echo "🗑️ 开始卸载 ${SERVICE_NAME}..."
  
  read -p "确认卸载 ${SERVICE_NAME} 吗？此操作将删除所有相关文件 (y/N): " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "❌ 取消卸载"
    return 0
  fi

  if systemctl list-units --full -all | grep -Fq "${SERVICE_NAME}.service"; then
    echo "🛑 停止并禁用服务..."
    systemctl stop ${SERVICE_NAME} 2>/dev/null
    systemctl disable ${SERVICE_NAME} 2>/dev/null
  fi

  if [[ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]]; then
    rm -f "/etc/systemd/system/${SERVICE_NAME}.service"
    echo "🧹 删除服务文件"
  fi

  if [[ -d "$INSTALL_DIR" ]]; then
    rm -rf "$INSTALL_DIR"
    echo "🧹 删除安装目录: $INSTALL_DIR"
  fi

  systemctl daemon-reload

  echo "✅ 卸载完成"
}

# 主逻辑
main() {
  if [[ -n "$SERVER_ADDR" && -n "$SECRET" ]]; then
    install_service
    exit 0
  fi

  while true; do
    show_menu
    read -p "请输入选项 (1-4): " choice
    
    case $choice in
      1)
        install_service
        exit 0
        ;;
      2)
        update_service
        exit 0
        ;;
      3)
        uninstall_service
        exit 0
        ;;
      4)
        echo "👋 退出脚本"
        exit 0
        ;;
      *)
        echo "❌ 无效选项，请输入 1-4"
        echo ""
        ;;
    esac
  done
}

# 执行主函数
main