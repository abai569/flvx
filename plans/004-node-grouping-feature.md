# 004 - 节点分组功能实现计划

**Created:** 2026-03-26  
**Status:** Pending  

## 概述

为 FLVX 节点管理系统添加分组和标签功能，支持：
- **分组 (Group)**：每个节点只能属于一个分组，用于组织管理
- **标签 (Tag)**：每个节点可以有多个标签，用于多维度筛选
- **前端展示**：可折叠分组卡片布局
- **无权限控制**：分组标签仅用于组织展示

---

## 任务清单

### Phase 1: 数据库模型设计

- [ ] **1.1** 创建 `node_group` 表模型
  - 字段：`id`, `name`, `description`, `color`, `inx`, `created_time`
  - 文件：`go-backend/internal/store/model/model.go`

- [ ] **1.2** 创建 `node_tag` 标签表模型
  - 字段：`id`, `name`, `color`, `created_time`
  - 文件：`go-backend/internal/store/model/model.go`

- [ ] **1.3** 创建 `node_tag_node` 关联表模型
  - 字段：`tag_id`, `node_id`
  - 文件：`go-backend/internal/store/model/model.go`

- [ ] **1.4** 修改 `Node` 模型，添加 `GroupID` 外键
  - 字段：`group_id` (nullable)
  - 文件：`go-backend/internal/store/model/model.go`

- [ ] **1.5** 创建数据库迁移脚本
  - 文件：`go-backend/internal/store/migrate/migrate.go`

---

### Phase 2: 后端 Repository 层

- [ ] **2.1** 创建 `repository_node_groups.go`
  - `CreateNodeGroup`, `UpdateNodeGroup`, `DeleteNodeGroup`
  - `ListNodeGroups`, `GetNodeGroupByID`
  - `AssignNodeToGroup`

- [ ] **2.2** 创建 `repository_node_tags.go`
  - `CreateNodeTag`, `UpdateNodeTag`, `DeleteNodeTag`
  - `ListNodeTags`, `GetNodeTagByID`
  - `AssignTagsToNode`, `GetTagsByNodeID`

- [ ] **2.3** 扩展 `ListNodes()` 支持按分组/标签筛选

---

### Phase 3: 后端 API Handler 层

- [ ] **3.1** 创建分组 API (`node_group.go`)
  - `/api/v1/node-group/create|update|delete|list|assign`

- [ ] **3.2** 创建标签 API (`node_tag.go`)
  - `/api/v1/node-tag/create|update|delete|list|assign`

- [ ] **3.3** 注册路由 (`handler.go`)

- [ ] **3.4** 扩展 `/api/v1/node/list` 响应，包含分组和标签信息

---

### Phase 4: 前端类型定义

- [ ] **4.1** 添加类型定义 (`api/types.ts`)
  - `NodeGroupApiItem`, `NodeTagApiItem`

- [ ] **4.2** 添加 API 调用函数 (`api/index.ts`)

---

### Phase 5: 前端 UI 组件

- [ ] **5.1** 分组管理对话框组件

- [ ] **5.2** 标签管理对话框组件

- [ ] **5.3** 可折叠分组卡片组件

- [ ] **5.4** 修改节点页面，添加分组视图模式

- [ ] **5.5** 节点卡片显示分组/标签徽章

---

### Phase 6: 测试与验证

- [ ] **6.1** 后端集成测试

- [ ] **6.2** 前端手动测试

---

## 数据库 Schema

```sql
CREATE TABLE node_group (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    color VARCHAR(20) DEFAULT '#3b82f6',
    inx INTEGER DEFAULT 0,
    created_time INTEGER NOT NULL
);

CREATE TABLE node_tag (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name VARCHAR(50) NOT NULL UNIQUE,
    color VARCHAR(20) DEFAULT '#6b7280',
    created_time INTEGER NOT NULL
);

CREATE TABLE node_tag_node (
    tag_id INTEGER NOT NULL,
    node_id INTEGER NOT NULL,
    PRIMARY KEY (tag_id, node_id)
);

ALTER TABLE node ADD COLUMN group_id INTEGER;
```

---

## API 设计

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/node-group/create` | POST | 创建分组 |
| `/api/v1/node-group/update` | POST | 更新分组 |
| `/api/v1/node-group/delete` | POST | 删除分组 |
| `/api/v1/node-group/list` | POST | 分组列表 |
| `/api/v1/node-group/assign` | POST | 分配节点到分组 |
| `/api/v1/node-tag/create` | POST | 创建标签 |
| `/api/v1/node-tag/update` | POST | 更新标签 |
| `/api/v1/node-tag/delete` | POST | 删除标签 |
| `/api/v1/node-tag/list` | POST | 标签列表 |
| `/api/v1/node-tag/assign` | POST | 分配标签到节点 |

---

## 前端视图设计

```
[Local] [Remote]
  [网格] [列表] [分组]

分组视图:
┌─────────────────────────────────────┐
│ ▼ 生产环境 (3)           [编辑] [×] │
│ ┌─────┐ ┌─────┐ ┌─────┐            │
│ │Node1│ │Node2│ │Node3│            │
│ └─────┘ └─────┘ └─────┘            │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ ▶ 测试环境 (2)           [编辑] [×] │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│ ▼ 未分组 (1)                        │
│ ┌─────┐                            │
│ │Node5│                            │
│ └─────┘                            │
└─────────────────────────────────────┘
```

---

## 验收标准

- [ ] 创建/编辑/删除分组（带颜色）
- [ ] 创建/编辑/删除标签（带颜色）
- [ ] 节点分配到分组
- [ ] 节点添加多个标签
- [ ] 分组卡片可折叠
- [ ] 分组/标签筛选
- [ ] 拖拽跨组移动
- [ ] 现有功能不受影响

---

## 参考文件

- `go-backend/internal/store/repo/repository_groups.go` - 分组参考
- `vite-frontend/src/pages/node.tsx` - 节点页面
- `vite-frontend/src/api/index.ts` - API 层
