# 072-upgrade-modal-ui-improvements.md

**Created:** 2026-04-07
**Feature:** 升级弹窗 UI 改进 - 动态显示升级/回退 + ghfast_url 加速提示

---

## 背景

当前升级弹窗的文案固定显示"升级"，但实际可能是升级或回退。需要：
1. 根据版本对比动态显示"升级"或"回退"
2. 显示 ghfast_url 代理加速信息
3. 获取并显示最新版本号

---

## 需求分析

### 修改位置

| 位置 | 当前文案 | 修改后文案 | 说明 |
|------|----------|------------|------|
| 列表按钮 | "升级" | "更新" | 中性词，涵盖升级/回退 |
| 弹窗标题（单个） | "升级节点" | "更新节点" / "升级节点" / "回退节点" | 根据版本对比动态显示 |
| 弹窗标题（批量） | "批量升级 (X 个节点)" | "批量更新 (X 个节点)" | 批量时显示中性词 |
| 底部提示（未选版本） | "未选择版本，将自动使用最新测试版" | "未选择版本，将自动使用 {ghfastURL} 代理加速最新测试版 {版本号}" | 添加加速地址和版本号 |
| 底部提示（已选版本） | "将升级到版本 X.X.X" | "将使用 {ghfastURL} 代理加速{升级/回退}到版本 X.X.X" | 动态显示升级/回退 |
| 确认按钮 | "确认升级" | "确认更新" / "确认升级" / "确认回退" | 根据状态动态显示 |

---

## 实施计划

### 阶段 1：准备工作

#### 1.1 导入必要函数和 API
**文件：** `vite-frontend/src/pages/node.tsx`

**新增导入：**
```typescript
import { compareVersions } from '@/utils/version-update';
import { getConfigByName } from '@/api';
```

#### 1.2 新增 state 变量
**位置：** 第 469 行附近

**新增：**
```typescript
const [ghfastURL, setGhfastURL] = useState<string>('https://ghfast.top');
const [latestVersion, setLatestVersion] = useState<string>('');
```

---

### 阶段 2：修改 openUpgradeModal 函数

#### 2.1 获取 ghfast_url 配置
**位置：** 第 1306 行附近

**修改逻辑：**
```typescript
const openUpgradeModal = async (
  target: "single" | "batch",
  nodeId?: number,
) => {
  // 获取 ghfast_url 配置
  const configRes = await getConfigByName('ghfast_url');
  if (configRes.code === 0 && configRes.data?.value) {
    setGhfastURL(configRes.data.value);
  } else {
    setGhfastURL('https://ghfast.top');
  }
  
  // 获取最新版本号（从 releases 数组中获取第一个）
  // （在 loadReleasesByChannel 后自动更新）
  
  const defaultChannel: ReleaseChannel = "dev";
  setUpgradeTarget(target);
  setUpgradeTargetNodeId(nodeId || null);
  setReleaseChannel(defaultChannel);
  setSelectedVersion("");
  setUpgradeModalOpen(true);
  await loadReleasesByChannel(defaultChannel);
};
```

---

### 阶段 3：新增辅助函数

#### 3.1 获取当前操作类型文本
**位置：** 第 1306 行附近（openUpgradeModal 之前）

**新增函数：**
```typescript
const getCurrentActionText = (): string => {
  // 未选择版本时，显示"更新"
  if (!selectedVersion) return '更新';
  
  // 单个节点升级时，对比版本
  if (upgradeTarget === "single" && upgradeTargetNodeId) {
    const node = nodeList.find(n => n.id === upgradeTargetNodeId);
    if (node?.version) {
      const currentVersion = node.version.split(' ')[0]; // 提取版本号部分
      return compareVersions(selectedVersion, currentVersion) > 0 ? '升级' : '回退';
    }
  }
  
  // 批量升级时默认显示"更新"（中性词）
  return '更新';
};
```

---

### 阶段 4：修改弹窗 UI

#### 4.1 修改弹窗标题
**位置：** 第 3586-3591 行

**修改：**
```typescript
const actionText = getCurrentActionText();

<ModalHeader className="flex flex-col gap-1">
  <h2 className="text-xl font-bold">
    {upgradeTarget === "batch"
      ? `批量${actionText} (${selectedIds.size} 个节点)`
      : `${actionText}节点`}
  </h2>
</ModalHeader>
```

#### 4.2 修改底部提示文案
**位置：** 第 3643-3647 行

**修改：**
```typescript
{!selectedVersion ? (
  <p className="text-sm text-default-500">
    未选择版本，将自动使用 {ghfastURL} 代理加速最新
    {releaseChannel === "stable" ? "正式版" : "测试版"}
    {latestVersion && ` ${latestVersion}`}
  </p>
) : (
  <p className="text-sm text-default-500">
    将使用 {ghfastURL} 代理加速
    {upgradeTarget === "batch" 
      ? `${actionText} ${selectedVersion} 版本`
      : `${actionText}到版本 ${selectedVersion}`}
  </p>
)}
```

#### 4.3 修改确认按钮文案
**位置：** 第 3660 行

**修改：**
```typescript
<Button
  color="primary"
  isDisabled={releasesLoading}
  onPress={handleConfirmUpgrade}
>
  {!selectedVersion ? '确认更新' : `确认${actionText}`}
</Button>
```

---

### 阶段 5：列表按钮修改

#### 5.1 修改单个节点升级按钮
**位置：** 第 2449 行

**修改：**
```typescript
<Button ...>
  更新
</Button>
```

#### 5.2 修改批量升级按钮
**位置：** 第 2592 行

**修改：**
```typescript
<Button ...>
  批量更新
</Button>
```

---

### 阶段 6：获取最新版本号

#### 6.1 在 loadReleasesByChannel 后更新 latestVersion
**位置：** loadReleasesByChannel 函数内

**修改：**
```typescript
const loadReleasesByChannel = async (channel: ReleaseChannel) => {
  setReleasesLoading(true);
  try {
    const res = await getNodeReleases(channel);
    if (res.code === 0 && res.data) {
      setReleases(res.data);
      // 获取最新版本号（第一个）
      if (res.data.length > 0) {
        setLatestVersion(res.data[0].version);
      }
    }
  } catch {
    toast.error("加载版本列表失败");
  } finally {
    setReleasesLoading(false);
  }
};
```

---

## 测试验证

### 测试场景

#### 场景 1：单个节点 - 未选择版本
- **预期：**
  - 弹窗标题："更新节点"
  - 底部提示："未选择版本，将自动使用 https://ghfast.top 代理加速最新测试版 beta37"
  - 确认按钮："确认更新"

#### 场景 2：单个节点 - 已选择更高版本
- **预期：**
  - 弹窗标题："升级节点"
  - 底部提示："将使用 https://ghfast.top 代理加速升级到版本 2.2.5-beta37"
  - 确认按钮："确认升级"

#### 场景 3：单个节点 - 已选择更低版本
- **预期：**
  - 弹窗标题："回退节点"
  - 底部提示："将使用 https://ghfast.top 代理加速回退到版本 2.2.5-beta35"
  - 确认按钮："确认回退"

#### 场景 4：批量节点 - 未选择版本
- **预期：**
  - 弹窗标题："批量更新 (X 个节点)"
  - 底部提示："未选择版本，将自动使用 https://ghfast.top 代理加速最新测试版 beta37"
  - 确认按钮："确认更新"

#### 场景 5：批量节点 - 已选择版本
- **预期：**
  - 弹窗标题："批量更新 (X 个节点)"
  - 底部提示："将使用 https://ghfast.top 代理加速更新 2.2.5-beta37 版本"
  - 确认按钮："确认更新"

#### 场景 6：自定义 ghfast_url
- **预期：**
  - 所有提示中的 `https://ghfast.top` 替换为自定义地址

---

## 任务清单

- [ ] 导入 `compareVersions` 和 `getConfigByName`
- [ ] 新增 `ghfastURL` 和 `latestVersion` state 变量
- [ ] 修改 `openUpgradeModal` 获取配置
- [ ] 新增 `getCurrentActionText` 辅助函数
- [ ] 修改弹窗标题逻辑
- [ ] 修改底部提示文案
- [ ] 修改确认按钮文案
- [ ] 修改列表按钮文案（"升级" → "更新"）
- [ ] 修改 `loadReleasesByChannel` 更新 latestVersion
- [ ] 前端编译验证
- [ ] 测试验证（6 个场景）

---

## 相关文件

- `vite-frontend/src/pages/node.tsx` - 主要修改文件
- `vite-frontend/src/utils/version-update.ts` - 版本比较函数
- `vite-frontend/src/api/index.ts` - 配置获取 API

---

## 注意事项

1. **版本比较函数** - 使用 `utils/version-update.ts` 中的 `compareVersions`，已支持 beta/rc/alpha 等预发布版本
2. **版本号提取** - `node.version` 格式如 `"gost 2.2.5-beta37 (go1.23.12 linux/amd64)"`，需要提取版本号部分
3. **批量升级** - 不对比每个节点的版本，统一显示"更新"
4. **配置获取失败** - 使用默认值 `https://ghfast.top`
5. **latestVersion 获取** - 从 releases 数组第一个元素获取

---

**等待实施。**
