#!/bin/bash
set -e

# chfs 配置
CHFS_BASE="${CHFS_URL:-https://chfs.646321.xyz:8/webdav/flvx}"
CHFS_USER="${CHFS_USER}"
CHFS_PASS="${CHFS_PASS}"
ARTIFACTS_DIR="${ARTIFACTS_DIR:-./artifacts}"
IS_PRERELEASE="${IS_PRERELEASE:-false}"

# 根据版本类型选择目录
if [ "$IS_PRERELEASE" = "true" ]; then
    TARGET_DIR="beta"
    echo "📦 同步测试版到 $TARGET_DIR/"
else
    TARGET_DIR="stable"
    echo "📦 同步稳定版到 $TARGET_DIR/"
fi

# 文件列表
FILES=(
    "gost-amd64"
    "gost-arm64"
    "install.sh"
    "install-auto.sh"
)

# 上传文件
for file in "${FILES[@]}"; do
    if [ -f "$ARTIFACTS_DIR/$file" ]; then
        echo "⬆️  上传 $file..."
        curl -s -u "$CHFS_USER:$CHFS_PASS" \
             -T "$ARTIFACTS_DIR/$file" \
             "$CHFS_BASE/$TARGET_DIR/$file"
    else
        echo "⚠️  文件不存在：$file"
    fi
done

echo "✅ 同步完成"
