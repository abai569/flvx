# 069-node-install-domestic-overseas-offline.md

**Created:** 2026-04-05
**Feature:** 节点安装 - 国内/海外/离线三种对接方式 + 删除回退功能

---

## 背景

当前 FLVX 节点安装只有单一方式（通过 `install.sh` + GitHub 代理），需要：

1. **提供多种安装方式**以适应不同网络环境
2. **优化离线部署体验**
3. **删除使用率低的回退功能**

参考设计：Nyanpass 的对接功能（自动探测/海外主线/离线部署）

---

## 决策确认

### 用户确认的实施细节

1. **离线包架构**：简化 2 个 (`amd64` / `arm64`)
2. **安装按钮改造**：改为"对接"按钮，四个选项：
   - 国内机对接
   - 国外机对接
   - 备选线路
   - 离线部署
3. **删除功能**：
   - 删除回退按钮及相关逻辑
   - 删除节点回退功能
   - 删除"启用 GitHub 加速"设置
4. **升级逻辑**：
   - 节点升级也使用三种对接方式（国内/海外/备选）
   - 自动检测可用下载源
5. **国内服务器同步**：手动同步到 `chfs.646321.xyz`

---

## 资源准备

| 资源 | 地址 | 用途 | 优先级 |
|------|------|------|--------|
| 国内 HTTP 服务器 | `https://chfs.646321.xyz:8/flvx` | 国内线路下载源（双栈） | 国内首选 |
| GitHub 源站 | `https://github.com/abai569/flvx` | 海外线路下载源（IPv4+IPv6） | 海外首选 |
| Cloudflare CDN | `https://git-proxy.abai.eu.org` | 备选下载源（纯 IPv6 友好） | 备选方案 |

---

## 对接方式说明

### 四种对接方式

| 选项 | 下载源 | 适用场景 | 推荐度 |
|------|--------|----------|--------|
| 🇨🇳 **国内机对接** | `chfs.646321.xyz` | 中国大陆网络（双栈） | ⭐⭐⭐⭐⭐ 国内首选 |
| 🌏 **国外机对接** | `github.com` | 海外网络（IPv4+IPv6） | ⭐⭐⭐⭐⭐ 海外首选 |
| 🌐 **备选线路** | `git-proxy.abai.eu.org` | 纯 IPv6/GitHub 故障 | ⭐⭐⭐ 备选方案 |
| 📦 **离线部署** | 本地解压 | 网络受限/批量部署 | ⭐⭐⭐⭐ 特殊场景 |

### 备选线路使用场景

1. **纯 IPv6 服务器** - GitHub IPv6 链路质量差时使用
2. **GitHub 故障** - GitHub Status 显示异常时使用
3. **下载超时** - 默认源站下载失败时自动提示

---

## 自动检测逻辑

### 安装命令 - 自动检测实现

**方案：前端生成命令时嵌入检测逻辑**

```bash
# 国内机对接命令（带检测）
curl -L https://chfs.646321.xyz:8/flvx/install.sh -o ./install.sh && \
if [ $? -ne 0 ]; then
  echo "国内线路失败，尝试备用线路..."
  curl -L https://git-proxy.abai.eu.org/abai569/flvx/releases/latest/download/install.sh -o ./install.sh
fi && \
chmod +x ./install.sh && ./install.sh -a <PANEL> -s <SECRET>
```

**或者简化版（用户手动选择）：**
- 前端直接生成对应线路的命令
- 下载失败时提示切换其他线路

### 升级命令 - 自动检测实现

**方案：后端提供统一接口，自动 fallback**

```go
func (h *Handler) nodeUpgrade(w http.ResponseWriter, r *http.Request) {
    // 1. 尝试 GitHub
    // 2. 失败时尝试 git-proxy
    // 3. 失败时尝试 chfs
    // 4. 返回最终可用的下载源
}
```

**或者简化版（与安装一致）：**
- 前端调用三个 API：`/node/upgrade-domestic`, `/node/upgrade-overseas`, `/node/upgrade-alternative`
- 用户手动选择或前端自动检测

---

## 实施状态

### ✅ 已完成

1. **CI 离线包构建** - 已修改 `.github/workflows/docker-build.yml`
   - `create-release` job 中构建 `offline-amd64.zip` 和 `offline-arm64.zip`
   - `update-release-gost` job 中也构建离线包
   - 上传到 GitHub Release

2. **后端升级支持三种下载源** - 已修改 `go-backend/internal/http/handler/upgrade.go`
   - `nodeUpgrade` API 传递 `downloadUrls` 和 `checksumUrls` 数组
   - `nodeBatchUpgrade` API 同样支持多下载源
   - agent 自动尝试多个下载源，哪个成功用哪个

3. **国内服务器同步脚本** - 已创建 `scripts/sync-to-chfs.sh`
   - 从 GitHub Release 下载文件
   - 同步到国内 HTTP 服务器
   - 支持本地复制和 SCP/rsync 上传

### ❌ 未完成

1. **前端改动** - 未实施（可选）
   - 节点列表显示服务名
   - 对接按钮四种选项

2. **国内服务器手动同步** - 需要人工操作
   - 每次 Release 后运行 `scripts/sync-to-chfs.sh`
   - 上传到 `chfs.646321.xyz:/flvx/`

---

## 原实施计划（保留参考）

### 阶段 1：后端改动（已完成）

### 阶段 1：后端改动（Go）

#### 1.1 新增 API 接口

**文件：** `go-backend/internal/http/handler/mutations.go`

**新增三个接口：**

1. **`/node/install-domestic`** - 国内机对接
   - 使用 `chfs.646321.xyz` 下载
   - 适用于国内网络环境

2. **`/node/install-overseas`** - 国外机对接
   - 使用 `git-proxy.abai.eu.org`（Cloudflare CDN）
   - 适用于海外网络环境

3. **`/node/install-offline`** - 离线部署
   - 生成离线安装命令
   - 适用于网络受限场景

**实现逻辑：**
```go
// nodeInstallDomestic
func (h *Handler) nodeInstallDomestic(w http.ResponseWriter, r *http.Request) {
    // 使用国内 HTTP 服务器
    cmd := fmt.Sprintf(
        "curl -L https://chfs.646321.xyz:8/flvx/install.sh -o ./install.sh && "+
        "chmod +x ./install.sh && VERSION=%s ./install.sh -a %s -s %s",
        version, processServerAddress(panelAddr), secret,
    )
}

// nodeInstallOverseas
func (h *Handler) nodeInstallOverseas(w http.ResponseWriter, r *http.Request) {
    // 使用 Cloudflare CDN
    cmd := fmt.Sprintf(
        "curl -L https://git-proxy.abai.eu.org/abai569/flvx/releases/download/%s/install.sh -o ./install.sh && "+
        "chmod +x ./install.sh && VERSION=%s ./install.sh -a %s -s %s",
        version, version, processServerAddress(panelAddr), secret,
    )
}

// nodeInstallOffline
func (h *Handler) nodeInstallOffline(w http.ResponseWriter, r *http.Request) {
    // 离线部署命令
    cmd := fmt.Sprintf(
        "unzip -d /tmp/flux_agent -o offline.zip && "+
        "bash /tmp/flux_agent/offline.sh -a %s -s %s",
        processServerAddress(panelAddr), secret,
    )
}
```

#### 1.2 路由注册

**文件：** `go-backend/internal/http/router.go`

```go
mux.HandleFunc("/node/install-domestic", h.nodeInstallDomestic)
mux.HandleFunc("/node/install-overseas", h.nodeInstallOverseas)
mux.HandleFunc("/node/install-offline", h.nodeInstallOffline)
```

#### 1.3 删除回退相关代码

**搜索关键词：**
- `nodeRollback`
- `/node/rollback`
- `rollbackLoading`
- `nodeToRollback`

**删除位置：**
1. `mutations.go` - `nodeRollback` 函数
2. `router.go` - `/node/rollback` 路由
3. `node.tsx` - 回退相关 UI 和状态
4. `upgrade.go` - 回退相关逻辑

---

### 阶段 2：CI 改动（GitHub Actions）

#### 2.1 新增离线包构建

**文件：** `.github/workflows/ci-build.yml`

**修改 Build Job：**

```yaml
build:
  runs-on: ubuntu-latest
  steps:
    # 构建多架构二进制
    - name: Build amd64
      run: cd go-gost && GOOS=linux GOARCH=amd64 go build -o flux_agent_amd64
    
    - name: Build arm64
      run: cd go-gost && GOOS=linux GOARCH=arm64 go build -o flux_agent_arm64
    
    # 打包离线包（简化为 2 个架构）
    - name: Package offline amd64
      run: |
        mkdir offline-package-amd64
        cp go-gost/flux_agent_amd64 offline-package-amd64/flux_agent
        cp install.sh offline-package-amd64/offline.sh
        cd offline-package-amd64 && zip -r ../offline-amd64.zip .
    
    - name: Package offline arm64
      run: |
        mkdir offline-package-arm64
        cp go-gost/flux_agent_arm64 offline-package-arm64/flux_agent
        cp install.sh offline-package-arm64/offline.sh
        cd offline-package-arm64 && zip -r ../offline-arm64.zip .
    
    # 上传到 Release
    - name: Upload offline amd64
      uses: svenstaro/upload-release-action@v2
      with:
        repo_token: ${{ secrets.GITHUB_TOKEN }}
        file: offline-amd64.zip
        asset_name: offline-amd64-${{ github.ref_name }}.zip
        tag: ${{ github.ref }}
    
    - name: Upload offline arm64
      uses: svenstaro/upload-release-action@v2
      with:
        repo_token: ${{ secrets.GITHUB_TOKEN }}
        file: offline-arm64.zip
        asset_name: offline-arm64-${{ github.ref_name }}.zip
        tag: ${{ github.ref }}
```

---

### 阶段 3：前端改动（Vite）

#### 3.1 新增 API 调用

**文件：** `vite-frontend/src/api/index.ts`

**新增函数：**
```typescript
export const getNodeInstallCommandDomestic = (
  id: number,
  channel: ReleaseChannel = "stable",
) => Network.post<string>("/node/install-domestic", { id, channel });

export const getNodeInstallCommandOverseas = (
  id: number,
  channel: ReleaseChannel = "stable",
) => Network.post<string>("/node/install-overseas", { id, channel });

export const getNodeInstallCommandOffline = (id: number) =>
  Network.post<string>("/node/install-offline", { id });
```

**删除函数：**
```typescript
// 删除
export const getNodeRollbackCommand = ...
```

#### 3.2 改造节点操作按钮

**文件：** `vite-frontend/src/pages/node.tsx`

**改动点：**

1. **删除回退相关状态和函数**
   - `nodeToRollback`
   - `rollbackLoading`
   - `batchRollbackModalOpen`
   - `handleRollback()`
   - `confirmRollback()`
   - `handleCopyRollbackCommand()`

2. **改造操作按钮为"对接"下拉菜单**

```typescript
<Dropdown>
  <DropdownTrigger>
    <Button color="primary" variant="flat" size="sm">
      对接
    </Button>
  </DropdownTrigger>
  <DropdownMenu>
    <DropdownItem 
      key="domestic"
      startContent={<svg>🇨🇳</svg>}
      onPress={() => handleCopyInstallCommand(node.id, "domestic")}
    >
      国内机对接
    </DropdownItem>
    <DropdownItem 
      key="overseas"
      startContent={<svg>🌏</svg>}
      onPress={() => handleCopyInstallCommand(node.id, "overseas")}
    >
      国外机对接
    </DropdownItem>
    <DropdownDivider />
    <DropdownItem 
      key="offline"
      startContent={<svg>📦</svg>}
      onPress={() => handleOfflineInstall(node.id)}
    >
      离线部署
    </DropdownItem>
  </DropdownMenu>
</Dropdown>
```

3. **新增离线部署弹窗**

```typescript
<Modal
  isOpen={offlineModalOpen}
  title="离线部署"
  size="lg"
>
  <ModalBody>
    <Alert title="温馨提示" variant="info">
      请按机器的架构下载合适的包：
    </Alert>
    
    <div className="space-y-2 mt-4">
      <a 
        href="https://chfs.646321.xyz:8/flvx/offline-amd64.zip"
        className="block p-3 bg-default-50 rounded hover:bg-default-100"
        target="_blank"
      >
        📦 offline-amd64.zip (x86_64)
      </a>
      <a 
        href="https://chfs.646321.xyz:8/flvx/offline-arm64.zip"
        className="block p-3 bg-default-50 rounded hover:bg-default-100"
        target="_blank"
      >
        📦 offline-arm64.zip (ARM64)
      </a>
    </div>
    
    <Divider className="my-4" />
    
    <p className="text-sm font-medium">离线对接命令：</p>
    <CodeBlock code={offlineCommand} onCopy={handleCopy} />
    
    <Alert title="使用方法" variant="warning" className="mt-4">
      <ol className="list-decimal list-inside space-y-1 text-sm">
        <li>上传离线包到【无法在线对接的机器】并重命名为 offline.zip</li>
        <li>cd 切换到【离线包所在目录】</li>
        <li>运行以上命令</li>
      </ol>
    </Alert>
    
    <Alert title="提示" variant="info" className="mt-2">
      离线安装依赖 unzip 命令，请自行安装。
    </Alert>
  </ModalBody>
  <ModalFooter>
    <Button onPress={() => setOfflineModalOpen(false)}>
      知道了
    </Button>
  </ModalFooter>
</Modal>
```

#### 3.3 删除升级回退逻辑

**删除内容：**
- 回退按钮及相关 UI
- 回退确认弹窗
- 回退命令复制功能
- 批量回退功能

---

### 阶段 4：国内 HTTP 服务器配置

#### 4.1 文件结构

**服务器目录：** `/flvx/`
```
/flvx/
├── offline-amd64.zip
├── offline-arm64.zip
├── install.sh
└── index.html (可选，文件列表页)
```

#### 4.2 手动同步脚本

**文件：** `sync-to-chfs.sh`
```bash
#!/bin/bash
# 从 GitHub Release 下载离线包并同步到国内服务器
VERSION=$(curl -s https://api.github.com/repos/abai569/flvx/releases/latest | grep tag_name | cut -d'"' -f4)

echo "同步版本：${VERSION}"

curl -L "https://github.com/abai569/flvx/releases/download/${VERSION}/offline-amd64-${VERSION}.zip" \
  -o /path/to/chfs/flvx/offline-amd64.zip

curl -L "https://github.com/abai569/flvx/releases/download/${VERSION}/offline-arm64-${VERSION}.zip" \
  -o /path/to/chfs/flvx/offline-arm64.zip

curl -L "https://github.com/abai569/flvx/releases/download/${VERSION}/install.sh" \
  -o /path/to/chfs/flvx/install.sh

echo "同步完成"
```

---

## 测试计划

### 测试场景

| 场景 | 安装方式 | 预期结果 |
|------|----------|----------|
| 国内机器 | 国内机对接 | 使用 `chfs.646321.xyz`，速度快 |
| 海外机器 | 国外机对接 | 使用 `git-proxy.abai.eu.org`，速度快 |
| 网络受限 | 离线部署 | 本地解压安装成功 |
| AMD64 架构 | 离线包 | `offline-amd64.zip` 正常工作 |
| ARM64 架构 | 离线包 | `offline-arm64.zip` 正常工作 |

### 测试命令

```bash
# 1. 国内机对接
curl -L https://chfs.646321.xyz:8/flvx/install.sh -o ./install.sh && \
chmod +x ./install.sh && VERSION=<ver> ./install.sh -a <PANEL> -s <SECRET>

# 2. 国外机对接
bash <(curl -fLSs https://git-proxy.abai.eu.org/abai569/flvx/releases/download/<ver>/install.sh) \
  <TOKEN> <PANEL>

# 3. 离线部署
unzip offline-amd64.zip && bash offline.sh -a <PANEL> -s <SECRET>
```

---

## 实施时间估算

| 阶段 | 工作量 | 依赖 |
|------|--------|------|
| 后端 API | 2-3 小时 | 无 |
| 删除回退逻辑 | 1-2 小时 | 无 |
| CI 构建 | 2-3 小时 | 无 |
| 前端 UI | 4-6 小时 | 后端 API |
| 服务器配置 | 0.5-1 小时 | 无 |
| 测试 | 2-3 小时 | 全部完成 |
| **总计** | **11.5-18 小时** | - |

---

## 任务清单

### 后端
- [ ] `mutations.go`: 新增 `nodeInstallDomestic` 函数
- [ ] `mutations.go`: 新增 `nodeInstallOverseas` 函数
- [ ] `mutations.go`: 新增 `nodeInstallOffline` 函数
- [ ] `router.go`: 注册三个新路由
- [ ] `mutations.go`: 删除 `nodeRollback` 函数
- [ ] `router.go`: 删除 `/node/rollback` 路由
- [ ] `upgrade.go`: 删除回退相关逻辑
- [ ] 后端编译通过

### CI
- [ ] `ci-build.yml`: 新增 amd64 离线包构建
- [ ] `ci-build.yml`: 新增 arm64 离线包构建
- [ ] `ci-build.yml`: 上传离线包到 Release
- [ ] 测试 CI 构建流程

### 前端
- [ ] `api/index.ts`: 新增 `getNodeInstallCommandDomestic`
- [ ] `api/index.ts`: 新增 `getNodeInstallCommandOverseas`
- [ ] `api/index.ts`: 新增 `getNodeInstallCommandOffline`
- [ ] `api/index.ts`: 删除 `getNodeRollbackCommand`
- [ ] `node.tsx`: 删除回退相关状态和函数
- [ ] `node.tsx`: 改造操作按钮为"对接"下拉菜单
- [ ] `node.tsx`: 新增离线部署弹窗
- [ ] `node.tsx`: 删除回退相关 UI
- [ ] 前端编译通过

### 服务器
- [ ] 配置 `chfs.646321.xyz:8/flvx` 目录
- [ ] 上传 `install.sh`
- [ ] 编写同步脚本 `sync-to-chfs.sh`
- [ ] 手动同步第一次

### 测试
- [ ] 测试国内机对接
- [ ] 测试国外机对接
- [ ] 测试离线部署（amd64）
- [ ] 测试离线部署（arm64）
- [ ] 测试回退功能已删除

---

## 注意事项

1. **向后兼容**：现有 `install.sh` 逻辑保持不变，新增三个 API 作为补充
2. **版本同步**：每次 Release 后需手动同步到国内服务器
3. **离线包更新**：离线包需随版本更新，包含最新二进制和脚本
4. **用户体验**：前端需清晰提示三种方式的适用场景

---

## 验收标准

1. ✅ 后端三个新 API 正常工作
2. ✅ 前端"对接"按钮显示正确，三个选项可用
3. ✅ 离线部署弹窗显示架构下载链接和命令
4. ✅ 回退功能完全删除（按钮/API/逻辑）
5. ✅ CI 成功构建并上传离线包
6. ✅ 国内/海外安装速度明显提升
7. ✅ 离线部署流程顺畅
