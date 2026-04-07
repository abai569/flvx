# 071-chfs-auto-sync-channel-ghfast.md

**Created:** 2026-04-07
**Feature:** chfs 自动同步 + CHANNEL 支持 + ghfast.top 加速

---

## 背景

当前 FLVX 节点安装和升级存在以下问题：
1. 国内机器下载 GitHub 慢，需要自动同步到国内 CDN
2. 安装脚本不支持稳定版/测试版通道选择
3. 海外机器没有统一的加速地址配置

---

## 需求分析

### 功能需求

1. **chfs 自动同步**
   - GitHub Release 创建后自动同步到国内 chfs
   - 根据 Release 类型（stable/beta）同步到对应目录
   - 通过 WebDAV 上传 6 个文件

2. **CHANNEL 支持**
   - install-auto.sh 支持 CHANNEL 环境变量
   - 默认使用 stable 通道
   - 支持手动指定 beta 通道

3. **ghfast.top 加速**
   - 海外机器默认使用 ghfast.top 加速
   - 支持自定义加速地址
   - 后端配置 ghfast_url

---

## 实施计划

### 阶段 1：chfs 自动同步

#### 1.1 创建同步脚本
**文件：** `scripts/sync-to-chfs.sh`

**功能：**
- 根据 Release 类型选择目标目录（stable/beta）
- 通过 WebDAV 上传 6 个文件到 chfs
- 文件列表：gost-amd64, gost-arm64, install.sh, install-auto.sh, offline-amd64.zip, offline-arm64.zip

**关键逻辑：**
```bash
if [ "$IS_PRERELEASE" = "true" ]; then
    TARGET_DIR="beta"
else
    TARGET_DIR="stable"
fi

for file in "${FILES[@]}"; do
    curl -u "$CHFS_USER:$CHFS_PASS" \
         -T "$ARTIFACTS_DIR/$file" \
         "$CHFS_BASE/$TARGET_DIR/$file"
done
```

#### 1.2 修改 CI Workflow
**文件：** `.github/workflows/docker-build.yml`

**添加步骤：**
```yaml
- name: Sync to Chinese CDN
  if: github.event_name == 'release'
  run: ./scripts/sync-to-chfs.sh
  env:
    IS_PRERELEASE: ${{ github.event.release.prerelease }}
    CHFS_URL: ${{ secrets.CHSF_URL }}
    CHFS_USER: ${{ secrets.CHSF_USER }}
    CHFS_PASS: ${{ secrets.CHSF_PASS }}
    ARTIFACTS_DIR: ./artifacts
```

---

### 阶段 2：CHANNEL 支持

#### 2.1 修改 install-auto.sh
**修改点：**
1. 新增 CHANNEL 环境变量支持
2. 国内 CDN 路径添加 CHANNEL
3. fallback 逻辑支持 CHANNEL

**关键修改：**
```bash
# 版本通道（stable/beta）
CHANNEL="${CHANNEL:-stable}"

# 国内 CDN 路径
if [ "$CN" == "1" ]; then
    download_host="https://chfs.646321.xyz:8/chfs/shared/flvx/${CHANNEL}"
    echo "🌏 使用国内 CDN (${CHANNEL})"
fi
```

#### 2.2 修改 install.sh
**修改点：**
1. build_download_url 函数支持 CHANNEL
2. show_download_source 显示 CHANNEL 信息

**关键修改：**
```bash
build_download_url() {
    local ARCH=$(get_architecture)
    
    if [[ "$DOWNLOAD_HOST" == *"chfs.646321.xyz"* ]]; then
        CHANNEL="${CHANNEL:-stable}"
        echo "https://chfs.646321.xyz:8/chfs/shared/flvx/${CHANNEL}/gost-${ARCH}"
        return
    fi
    
    # ... GitHub 逻辑
}
```

---

### 阶段 3：ghfast.top 加速

#### 3.1 修改 install-auto.sh
**修改点：**
1. 海外默认使用 ghfast.top
2. 支持 GHFAST_URL 环境变量覆盖
3. fallback 逻辑切换到 ghfast.top

**关键修改：**
```bash
if [ "$OS" == "1" ]; then
    download_host="${GHFAST_URL:-https://ghfast.top}/https://github.com/abai569/flvx/releases/latest/download"
    echo "🌍 使用 GitHub 加速 (${download_host})"
fi
```

#### 3.2 前端配置页面
**文件：** `vite-frontend/src/pages/config.tsx`

**新增配置项：**
```typescript
{
  key: "ghfast_url",
  label: "海外加速地址",
  placeholder: "https://ghfast.top",
  description: "海外机器安装和升级时使用的加速地址，留空使用默认值 https://ghfast.top",
  type: "input",
}
```

#### 3.3 后端升级逻辑
**文件：** `go-backend/internal/http/handler/upgrade.go`

**修改下载源构建：**
```go
// 获取自定义加速地址
ghfastURL, _ := h.repo.GetViteConfigValue("ghfast_url")
if ghfastURL == "" {
    ghfastURL = "https://ghfast.top"
}

downloadURLs := []string{
    fmt.Sprintf("%s/https://github.com/%s/releases/download/%s/gost-{ARCH}", ghfastURL, githubRepo, version),
    "https://chfs.646321.xyz:8/chfs/shared/flvx/stable/gost-{ARCH}",
    "https://chfs.646321.xyz:8/chfs/shared/flvx/beta/gost-{ARCH}",
}
```

---

## 测试验证

### 测试场景

#### 场景 1：国内机器安装（稳定版）
```bash
curl -L https://chfs.646321.xyz:8/chfs/shared/flvx/install-auto.sh | bash -s -- -a xxx -s xxx
```
**预期：**
- 检测到国内网络
- 从 stable 目录下载
- 显示"正在通过国内镜像源下载 flux_agent 中... (stable)"

#### 场景 2：国内机器安装（测试版）
```bash
CHANNEL=beta curl -L https://chfs.646321.xyz:8/chfs/shared/flvx/install-auto.sh | bash -s -- -a xxx -s xxx
```
**预期：**
- 检测到国内网络
- 从 beta 目录下载
- 显示"正在通过国内镜像源下载 flux_agent 中... (beta)"

#### 场景 3：海外机器安装
```bash
curl -L https://chfs.646321.xyz:8/chfs/shared/flvx/install-auto.sh | bash -s -- -a xxx -s xxx
```
**预期：**
- 检测到海外网络
- 使用 ghfast.top 加速下载
- 显示"正在通过 GitHub 镜像源下载 flux_agent 中..."

#### 场景 4：自定义加速地址
```bash
GHFAST_URL=https://your-accel.com curl -L .../install-auto.sh | bash -s -- -a xxx -s xxx
```
**预期：**
- 使用自定义加速地址
- 显示"正在通过自定义镜像源下载 flux_agent 中..."

#### 场景 5：CI 自动同步
**触发：** 创建 GitHub Release
**预期：**
- CI 自动触发 sync-to-chfs.sh
- 文件同步到 chfs stable/或 beta/目录

---

## 任务清单

- [x] ✅ 创建 scripts/sync-to-chfs.sh 同步脚本
- [x] ✅ 修改 .github/workflows/docker-build.yml 添加同步步骤
- [x] ✅ 修改 install-auto.sh 支持 CHANNEL 和 ghfast.top
- [x] ✅ 修改 install.sh 支持 CHANNEL 路径
- [x] ✅ 前端 config.tsx 新增 ghfast_url 配置项
- [x] ✅ 后端 upgrade.go 修改下载源逻辑
- [x] ✅ 删除 installcn.sh（已废弃）
- [x] ✅ 编译验证
- [x] ✅ 推送到远程（2.2.5-beta37）

---

## 相关文件

- `scripts/sync-to-chfs.sh` - chfs 同步脚本
- `.github/workflows/docker-build.yml` - CI 配置
- `install-auto.sh` - 自动探测安装脚本
- `install.sh` - 安装脚本
- `vite-frontend/src/pages/config.tsx` - 配置页面
- `go-backend/internal/http/handler/upgrade.go` - 升级 API

---

## 注意事项

1. **GitHub Secrets 配置**
   - CHSF_URL: `https://chfs.646321.xyz:8/webdav/flvx`
   - CHSF_USER: `admin`
   - CHSF_PASS: `admin123`

2. **chfs 目录结构**
   ```
   /webdav/flvx/
   ├── stable/         # 稳定版
   │   ├── gost-amd64
   │   ├── gost-arm64
   │   ├── install.sh
   │   ├── install-auto.sh
   │   ├── offline-amd64.zip
   │   └── offline-arm64.zip
   └── beta/           # 测试版
       └── (同上 6 个文件)
   ```

3. **环境变量优先级**
   - CHANNEL: 默认为 stable，可通过环境变量指定 beta
   - GHFAST_URL: 默认为 https://ghfast.top，可通过环境变量覆盖

4. **fallback 逻辑**
   - GitHub 失败 → 切换到国内 CDN
   - 国内 CDN 失败 → 切换到 GitHub 加速

---

**实施状态：已完成 ✅**
