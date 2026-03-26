# 005 - 隧道分组功能实现计划

**Created:** 2026-03-26  
**Status:** Pending  
**参考实现:** 节点分组功能 (plans/004-node-grouping-feature.md)

---

## 概述

为 FLVX 隧道管理系统添加完整的分组功能，参考节点分组的实现模式：
- **分组管理** - 创建/编辑/删除分组
- **分组分配** - 将隧道分配到分组（支持多分组）
- **分组显示** - 隧道卡片/列表显示分组徽章
- **分组筛选** - 筛选 Modal 中集成组筛选
- **分组视图** - 可选的分组视图模式（按分组组织隧道）

---

## 核心差异：节点分组 vs 隧道分组

| 特性 | 节点分组 | 隧道分组 |
|------|---------|---------|
| **数据模型** | 单分组 (`node.group_id`) | 多分组 (`tunnel_group_tunnel` 关联表) |
| **分配方式** | 单选 | 多选 |
| **UI 交互** | 分组徽章（单个） | 分组徽章（多个，可展开） |
| **筛选逻辑** | `WHERE group_id = ?` | `WHERE tunnel_id IN (SELECT tunnel_id FROM tunnel_group_tunnel WHERE group_id = ?)` |

---

## 任务清单

### Phase 1: 后端 API 增强

#### 1.1 扩展隧道列表 API 返回分组信息
- [ ] 修改 `getTunnelList()` 响应，添加 `groupIds` 字段
- [ ] 可选：添加 `groups` 数组（包含分组详细信息）
- **文件:** `go-backend/internal/http/handler/tunnel.go`
- **工作量:** 30 分钟

#### 1.2 添加隧道分组分配 API
- [ ] `POST /api/v1/tunnel-group/assign` - 分配隧道到分组
- [ ] `POST /api/v1/tunnel-group/remove` - 从分组移除隧道
- **文件:** `go-backend/internal/http/handler/tunnel_group.go` (新建)
- **工作量:** 40 分钟

---

### Phase 2: 前端类型和 API

#### 2.1 添加类型定义
- [ ] `TunnelGroupApiItem` - 分组 API 类型
- [ ] `TunnelGroupMutationPayload` - 分组操作载荷
- **文件:** `vite-frontend/src/api/types.ts`
- **工作量:** 5 分钟

#### 2.2 添加 API 调用函数
- [ ] `getTunnelGroupList()` - 获取分组列表
- [ ] `createTunnelGroup()` - 创建分组
- [ ] `updateTunnelGroup()` - 更新分组
- [ ] `deleteTunnelGroup()` - 删除分组
- [ ] `assignTunnelToGroup()` - 分配隧道到分组
- [ ] `removeTunnelFromGroup()` - 移除隧道
- **文件:** `vite-frontend/src/api/index.ts`
- **工作量:** 10 分钟

---

### Phase 3: 前端 UI 组件

#### 3.1 创建隧道分组管理组件
- [ ] 分组列表表格（优化样式）
- [ ] 创建/编辑分组对话框
- [ ] 删除分组确认
- [ ] 显示分组下的隧道数
- **文件:** `vite-frontend/src/pages/tunnel/tunnel-group-manager.tsx` (新建)
- **参考:** `node-group-manager.tsx`
- **工作量:** 40 分钟

#### 3.2 创建隧道分组选择器组件
- [ ] 显示所有分组（带颜色标识）
- [ ] 支持多选分组
- [ ] 显示已选分组
- [ ] 快速添加/移除分组
- **文件:** `vite-frontend/src/pages/tunnel/tunnel-group-selector.tsx` (新建)
- **参考:** `node-tag-selector.tsx` (但改为多选)
- **工作量:** 30 分钟

#### 3.3 修改隧道卡片显示分组徽章
- [ ] 卡片视图显示分组徽章（最多 3 个 + 更多）
- [ ] 点击徽章可快速移除分组
- **文件:** `vite-frontend/src/pages/tunnel.tsx`
- **工作量:** 20 分钟

#### 3.4 修改隧道列表视图显示分组列
- [ ] 列表视图添加"分组"列
- [ ] 显示所有分组徽章
- **文件:** `vite-frontend/src/pages/tunnel.tsx`
- **工作量:** 20 分钟

#### 3.5 修改隧道编辑对话框添加分组选择
- [ ] 添加分组选择下拉框（多选）
- [ ] 保存时传递 `groupIds` 数组
- **文件:** `vite-frontend/src/pages/tunnel.tsx`
- **工作量:** 20 分钟

---

### Phase 4: 筛选功能集成

#### 4.1 添加分组筛选状态
- [ ] `filterGroupId` 状态变量
- **文件:** `vite-frontend/src/pages/tunnel.tsx`
- **工作量:** 2 分钟

#### 4.2 修改筛选 Modal
- [ ] 添加"按分组筛选"下拉框
- [ ] 显示所有分组（带颜色圆点和隧道数）
- [ ] "全部分组"选项
- **文件:** `vite-frontend/src/pages/tunnel.tsx`
- **工作量:** 15 分钟

#### 4.3 修改过滤逻辑
- [ ] 先按分组过滤
- [ ] 再按其他条件过滤
- **文件:** `vite-frontend/src/pages/tunnel.tsx`
- **工作量:** 10 分钟

#### 4.4 更新筛选按钮标记
- [ ] 显示 `(1)` 表示有筛选
- **文件:** `vite-frontend/src/pages/tunnel.tsx`
- **工作量:** 3 分钟

---

### Phase 5: 分组管理 UI 优化

#### 5.1 优化分组管理表格样式
- [ ] 圆角边框容器
- [ ] 表头样式化
- [ ] 行悬停效果
- [ ] 图标按钮（编辑/删除）
- [ ] 分组颜色圆点标识
- [ ] 隧道数徽章
- **文件:** `vite-frontend/src/pages/tunnel/tunnel-group-manager.tsx`
- **参考:** `node-group-manager.tsx` 优化后的样式
- **工作量:** 30 分钟

---

### Phase 6: 分组视图模式（可选增强）

#### 6.1 添加分组视图模式状态
- [ ] `viewMode: "card" | "list" | "grouped"`
- **文件:** `vite-frontend/src/pages/tunnel.tsx`
- **工作量:** 5 分钟

#### 6.2 创建隧道分组视图组件
- [ ] 按分组组织隧道
- [ ] 可折叠的分组容器
- [ ] 分组内显示隧道列表
- **文件:** `vite-frontend/src/pages/tunnel/tunnel-grouped-view.tsx` (新建)
- **参考:** `forward.tsx` 的分组视图
- **工作量:** 60 分钟

#### 6.3 修改视图切换按钮
- [ ] 添加"分组"视图切换按钮
- **文件:** `vite-frontend/src/pages/tunnel.tsx`
- **工作量:** 5 分钟

---

### Phase 7: 测试与验证

#### 7.1 后端编译测试
- [ ] `cd go-backend && go build ./...`
- **工作量:** 5 分钟

#### 7.2 前端编译测试
- [ ] `cd vite-frontend && npm run build`
- **工作量:** 5 分钟

#### 7.3 功能测试清单
- [ ] 创建/编辑/删除分组
- [ ] 隧道分配到分组（多选）
- [ ] 隧道卡片显示分组徽章
- [ ] 隧道列表显示分组列
- [ ] 编辑隧道时选择分组
- [ ] 筛选 Modal 中的分组筛选
- [ ] 分组管理 UI 正常工作
- [ ] 分组视图模式（如实现）
- **工作量:** 20 分钟

---

## 总工作量估算

| Phase | 任务数 | 预估时间 |
|-------|--------|----------|
| Phase 1: 后端 API | 2 | 70 分钟 |
| Phase 2: 前端类型和 API | 2 | 15 分钟 |
| Phase 3: 前端 UI 组件 | 5 | 130 分钟 |
| Phase 4: 筛选功能集成 | 4 | 30 分钟 |
| Phase 5: 分组管理 UI 优化 | 1 | 30 分钟 |
| Phase 6: 分组视图模式 | 3 | 70 分钟（可选） |
| Phase 7: 测试与验证 | 3 | 30 分钟 |
| **总计** | **20** | **375 分钟（约 6.25 小时）** |

---

## 验收标准

### 后端
- [ ] 隧道列表 API 返回 `groupIds` 字段
- [ ] 分组分配 API 正常工作
- [ ] 后端编译通过

### 前端
- [ ] 隧道卡片显示分组徽章
- [ ] 隧道列表显示分组列
- [ ] 编辑隧道时可选择分组（多选）
- [ ] 筛选 Modal 支持分组筛选
- [ ] 分组管理 UI 优化完成
- [ ] 前端编译通过

### 用户体验
- [ ] 分组徽章颜色与分组颜色一致
- [ ] 分组筛选与现有筛选条件可组合使用
- [ ] 分组管理表格样式与节点分组一致
- [ ] 响应式布局正常

---

## 关键技术点

### 1. 数据模型差异
**节点分组:** 单分组（`node.group_id`）  
**隧道分组:** 多分组（`tunnel_group_tunnel` 关联表）

**影响:**
- 前端需要支持多选分组
- API 设计需要处理数组
- 过滤逻辑使用 `IN` 查询

### 2. 分组颜色
**问题:** 当前 `TunnelGroup` 模型没有颜色字段

**解决方案:**
- **方案 A:** 后端添加 `color` 字段并迁移数据库（推荐）
- **方案 B:** 前端根据分组 ID 生成固定颜色

### 3. 分组视图模式
**参考:** 规则页面（forward）的分组视图

**结构:**
```
┌─────────────────────────────────────┐
│ ▼ 出口节点分组          12 条隧道    │
├─────────────────────────────────────┤
│ [表格] 隧道名 | 流量 | 状态 | 操作  │
└─────────────────────────────────────┘
```

---

## 风险提示

1. **数据库迁移风险**
   - 添加 `color` 字段需要迁移
   - 现有分组数据需要回填颜色值
   - 建议提供默认颜色

2. **向后兼容性**
   - API 响应结构变化可能影响现有功能
   - 需要确保旧版前端仍能正常工作

3. **性能影响**
   - 多对多关联查询可能影响性能
   - 需要监控大数据量场景
   - 建议添加索引

---

## 参考文件

- 节点分组实现：`plans/004-node-grouping-feature.md`
- 节点分组管理：`vite-frontend/src/pages/node/node-group-manager.tsx`
- 规则页面分组视图：`vite-frontend/src/pages/forward.tsx` (第 3920-4064 行)
- 隧道分组模型：`go-backend/internal/store/model/model.go` (TunnelGroup, TunnelGroupTunnel)

---

## 下一步

1. **确认计划** - 确认以上计划是否符合需求
2. **开始实施** - 按 Phase 顺序逐步实现
3. **测试验证** - 完成一个 Phase 立即测试


---

## 颜色选择器实现细节

### 节点分组参考实现
**文件:** `vite-frontend/src/pages/node/node-group-manager.tsx`

**功能:**
- 8 个预设颜色方块（可点击选择）
- 颜色选择器（可自定义颜色）
- 默认颜色 `#3b82f6`（蓝色）

**预设颜色:**
```typescript
const presetColors = [
  "#3b82f6", // 蓝
  "#ef4444", // 红
  "#22c55e", // 绿
  "#f59e0b", // 橙
  "#8b5cf6", // 紫
  "#ec4899", // 粉
  "#06b6d4", // 青
  "#84cc16", // 黄绿
];
```

### 隧道分组实现
**完全复制节点分组的颜色选择器**
- 相同的预设颜色
- 相同的颜色选择器
- 相同的默认颜色

---
