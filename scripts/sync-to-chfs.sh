#!/bin/bash
# 同步 FLVX Release 文件到国内 HTTP 服务器 (chfs.646321.xyz)
# 使用方法：./sync-to-chfs.sh <VERSION> <CHFS_DIRECTORY>

set -e

VERSION="${1:-}"
CHFS_DIR="${2:-/path/to/chfs/flvx}"

if [[ -z "$VERSION" ]]; then
    echo "❌ 请指定版本号"
    echo "用法：$0 <VERSION> [CHFS_DIRECTORY]"
    echo "示例：$0 2.2.6-beta1 /var/www/chfs/flvx"
    exit 1
fi

echo "🔄 开始同步版本 ${VERSION} 到国内服务器..."
echo "📁 目标目录：${CHFS_DIR}"

# 创建临时目录
TEMP_DIR=$(mktemp -d)
trap "rm -rf ${TEMP_DIR}" EXIT

echo "📥 下载 Release 文件..."

# 下载离线包
echo "⬇️  下载 offline-amd64.zip..."
curl -L "https://github.com/abai569/flvx/releases/download/${VERSION}/offline-amd64.zip" -o "${TEMP_DIR}/offline-amd64.zip"

echo "⬇️  下载 offline-arm64.zip..."
curl -L "https://github.com/abai569/flvx/releases/download/${VERSION}/offline-arm64.zip" -o "${TEMP_DIR}/offline-arm64.zip"

# 下载 install.sh
echo "⬇️  下载 install.sh..."
curl -L "https://github.com/abai569/flvx/releases/download/${VERSION}/install.sh" -o "${TEMP_DIR}/install.sh"

# 下载 gost 二进制
echo "⬇️  下载 gost-amd64..."
curl -L "https://github.com/abai569/flvx/releases/download/${VERSION}/gost-amd64" -o "${TEMP_DIR}/gost-amd64"

echo "⬇️  下载 gost-arm64..."
curl -L "https://github.com/abai569/flvx/releases/download/${VERSION}/gost-arm64" -o "${TEMP_DIR}/gost-arm64"

# 下载校验文件
echo "⬇️  下载 gost-amd64.sha256..."
curl -L "https://github.com/abai569/flvx/releases/download/${VERSION}/gost-amd64.sha256" -o "${TEMP_DIR}/gost-amd64.sha256"

echo "⬇️  下载 gost-arm64.sha256..."
curl -L "https://github.com/abai569/flvx/releases/download/${VERSION}/gost-arm64.sha256" -o "${TEMP_DIR}/gost-arm64.sha256"

# 同步到国内服务器
echo "📤 上传到国内服务器..."

# 检查是否是本地路径
if [[ -d "$CHFS_DIR" ]]; then
    echo "📁 复制到本地目录..."
    cp "${TEMP_DIR}/offline-amd64.zip" "${CHFS_DIR}/"
    cp "${TEMP_DIR}/offline-arm64.zip" "${CHFS_DIR}/"
    cp "${TEMP_DIR}/install.sh" "${CHFS_DIR}/"
    cp "${TEMP_DIR}/gost-amd64" "${CHFS_DIR}/"
    cp "${TEMP_DIR}/gost-arm64" "${CHFS_DIR}/"
    cp "${TEMP_DIR}/gost-amd64.sha256" "${CHFS_DIR}/"
    cp "${TEMP_DIR}/gost-arm64.sha256" "${CHFS_DIR}/"
    
    echo "✅ 同步完成！"
    echo ""
    echo "📋 文件列表："
    ls -lh "${CHFS_DIR}" | grep -E "(offline|install|gost)"
else
    echo "⚠️  目标目录不存在，请手动上传或使用 SCP/SFTP"
    echo ""
    echo "📤 可以使用以下命令上传："
    echo "scp ${TEMP_DIR}/* root@chfs.646321.xyz:${CHFS_DIR}/"
    echo ""
    echo "或使用 rsync："
    echo "rsync -avz ${TEMP_DIR}/ root@chfs.646321.xyz:${CHFS_DIR}/"
fi

echo ""
echo "🎉 同步完成！"
echo ""
echo "💡 验证下载链接："
echo "  - https://chfs.646321.xyz:8/flvx/offline-amd64.zip"
echo "  - https://chfs.646321.xyz:8/flvx/offline-arm64.zip"
echo "  - https://chfs.646321.xyz:8/flvx/install.sh"
