# Plan 062: 隧道页面分组功能

**Created:** 2026-03-24  
**Status:** Pending  
**Priority:** High  
**Estimated Time:** 8-12 hours

---

## 一、需求概述

### 1.1 核心需求

为隧道页面（`/tunnel`）添加分组功能，方便管理员管理和查看大量隧道。

### 1.2 功能特性

- ✅ **文件夹式分组**：一个隧道只能属于一个分组
- ✅ **后端存储**：新建 `tunnel_list` 表存储分组数据
- ✅ **拖拽排序**：支持拖拽分组排序和隧道排序
- ✅ **权限控制**：仅管理员可见可用
- ✅ **独立于权限分组**：与现有的 `tunnel_group`（权限管理）完全独立

### 1.3 用户场景

**场景 1：按环境分组**
```
▼ 生产环境 (12 条隧道)
  - 隧道 1
  - 隧道 2
▼ 测试环境 (5 条隧道)
  - 隧道 3
▼ 未分组 (3 条隧道)
  - 隧道 20
```

**场景 2：按业务线分组**
```
▼ 视频业务 (8 条)
▼ 游戏业务 (6 条)
▼ 网页业务 (4 条)
```

**场景 3：按地区分组**
```
▼ 国内隧道 (15 条)
▼ 海外隧道 (10 条)
```

---

## 二、技术方案

### 2.1 架构设计

```
┌─────────────────┐
│  前端隧道页面    │
│ (tunnel.tsx)    │
└────────┬────────┘
         │ REST API
         ▼
┌─────────────────┐
│  后端 Handler    │
│ (handler.go)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Repository 层   │
│ (repo/*.go)     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  tunnel_list 表 │
│ (MySQL/SQLite)  │
└─────────────────┘
```

### 2.2 数据模型

#### 表 1：`tunnel_list`（隧道分组表）

| 字段名 | 类型 | 说明 | 约束 |
|--------|------|------|------|
| `id` | bigint | 分组 ID | PRIMARY KEY, AUTO_INCREMENT |
| `name` | varchar(100) | 分组名称 | NOT NULL, UNIQUE |
| `inx` | int | 分组排序 | DEFAULT 0 |
| `status` | int | 状态 (1=启用，0=禁用) | NOT NULL, DEFAULT 1 |
| `created_time` | bigint | 创建时间（毫秒） | NOT NULL |
| `updated_time` | bigint | 更新时间（毫秒） | NOT NULL |

**索引：**
- `PRIMARY KEY (id)`
- `UNIQUE KEY idx_tunnel_list_name (name)`

#### 表 2：`tunnel_list_tunnel`（隧道分组关联表）

| 字段名 | 类型 | 说明 | 约束 |
|--------|------|------|------|
| `id` | bigint | 记录 ID | PRIMARY KEY, AUTO_INCREMENT |
| `tunnel_list_id` | bigint | 分组 ID | NOT NULL, FOREIGN KEY |
| `tunnel_id` | bigint | 隧道 ID | NOT NULL, FOREIGN KEY |
| `inx` | int | 隧道在分组内的排序 | DEFAULT 0 |
| `created_time` | bigint | 创建时间（毫秒） | NOT NULL |

**索引：**
- `PRIMARY KEY (id)`
- `UNIQUE KEY idx_tunnel_list_tunnel_unique (tunnel_list_id, tunnel_id)`

**外键约束：**
- `FOREIGN KEY (tunnel_list_id) REFERENCES tunnel_list(id) ON DELETE CASCADE`
- `FOREIGN KEY (tunnel_id) REFERENCES tunnel(id) ON DELETE CASCADE`

---

### 2.3 API 设计

#### 1. 获取分组列表
```
POST /api/v1/tunnel-list/list
Response: {
  "code": 0,
  "data": [
    {
      "id": 1,
      "name": "生产环境",
      "inx": 1,
      "status": 1,
      "tunnelIds": [1, 2, 3],
      "tunnelNames": ["隧道 1", "隧道 2", "隧道 3"],
      "createdTime": 1234567890
    }
  ]
}
```

#### 2. 创建分组
```
POST /api/v1/tunnel-list/create
Request: {
  "name": "测试环境",
  "status": 1,
  "inx": 2
}
Response: {
  "code": 0,
  "data": {
    "id": 2
  }
}
```

#### 3. 更新分组
```
POST /api/v1/tunnel-list/update
Request: {
  "id": 1,
  "name": "生产环境",
  "status": 1,
  "inx": 1
}
```

#### 4. 删除分组
```
POST /api/v1/tunnel-list/delete
Request: {
  "id": 1
}
Behavior: 级联删除关联表，组内隧道自动变为"未分组"
```

#### 5. 分配隧道到分组
```
POST /api/v1/tunnel-list/assign
Request: {
  "listId": 1,
  "tunnelIds": [1, 2, 3]
}
Behavior: 替换式分配（先删除原关联，再创建新关联）
```

#### 6. 分组排序
```
POST /api/v1/tunnel-list/order
Request: {
  "orders": [
    {"id": 1, "inx": 1},
    {"id": 2, "inx": 2},
    {"id": 3, "inx": 3}
  ]
}
```

#### 7. 隧道排序（分组内）
```
POST /api/v1/tunnel-list/tunnel-order
Request: {
  "listId": 1,
  "orders": [
    {"tunnelId": 1, "inx": 1},
    {"tunnelId": 2, "inx": 2},
    {"tunnelId": 3, "inx": 3}
  ]
}
```

---

## 三、实施步骤

### 阶段 1：后端实现（3-4 小时）

#### 步骤 1.1：添加数据模型
**文件：** `go-backend/internal/store/model/model.go`  
**时间：** 15 分钟  
**内容：**
- 添加 `TunnelList` struct
- 添加 `TunnelListTunnel` struct
- 添加 `TableName()` 方法

**代码示例：**
```go
type TunnelList struct {
    ID          int64  `gorm:"primaryKey;autoIncrement"`
    Name        string `gorm:"type:varchar(100);not null;uniqueIndex:idx_tunnel_list_name"`
    Inx         int    `gorm:"column:inx;default:0"`
    CreatedTime int64  `gorm:"column:created_time;not null"`
    UpdatedTime int64  `gorm:"column:updated_time;not null"`
    Status      int    `gorm:"not null"`
}

func (TunnelList) TableName() string { return "tunnel_list" }

type TunnelListTunnel struct {
    ID           int64 `gorm:"primaryKey;autoIncrement"`
    TunnelListID int64 `gorm:"column:tunnel_list_id;not null;uniqueIndex:idx_tunnel_list_tunnel_unique"`
    TunnelID     int64 `gorm:"column:tunnel_id;not null;uniqueIndex:idx_tunnel_list_tunnel_unique"`
    Inx          int   `gorm:"column:inx;default:0"`
    CreatedTime  int64 `gorm:"column:created_time;not null"`
}

func (TunnelListTunnel) TableName() string { return "tunnel_list_tunnel" }
```

---

#### 步骤 1.2：数据库迁移脚本
**文件：** `go-backend/migrations/add_tunnel_list_table.sql`  
**时间：** 10 分钟  
**内容：**
```sql
CREATE TABLE IF NOT EXISTS `tunnel_list` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `inx` int DEFAULT 0,
  `status` int NOT NULL DEFAULT 1,
  `created_time` bigint NOT NULL,
  `updated_time` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_tunnel_list_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tunnel_list_tunnel` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tunnel_list_id` bigint NOT NULL,
  `tunnel_id` bigint NOT NULL,
  `inx` int DEFAULT 0,
  `created_time` bigint NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `idx_tunnel_list_tunnel_unique` (`tunnel_list_id`, `tunnel_id`),
  KEY `idx_tunnel_id` (`tunnel_id`),
  CONSTRAINT `fk_tunnel_list` FOREIGN KEY (`tunnel_list_id`) REFERENCES `tunnel_list` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_tunnel` FOREIGN KEY (`tunnel_id`) REFERENCES `tunnel` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

#### 步骤 1.3：添加 Repository 函数
**文件：** `go-backend/internal/store/repo/repository_mutations.go`  
**时间：** 60 分钟  
**内容：**

**1.3.1 CRUD 函数**
```go
func (r *Repository) CreateTunnelList(name string, status int, inx int) (int64, error)
func (r *Repository) UpdateTunnelList(id int64, name string, status int, inx int) error
func (r *Repository) DeleteTunnelList(id int64) error
func (r *Repository) ListTunnelLists() ([]model.TunnelList, error)
```

**1.3.2 成员管理**
```go
func (r *Repository) ReplaceTunnelListMembersTx(tx *gorm.DB, listID int64, tunnelIDs []int64, now int64) error
```

**1.3.3 排序函数**
```go
func (r *Repository) UpdateTunnelListOrderTx(tx *gorm.DB, orders []struct{ID int64; Inx int}) error
func (r *Repository) UpdateTunnelListTunnelOrderTx(tx *gorm.DB, listID int64, orders []struct{TunnelID int64; Inx int}) error
```

---

#### 步骤 1.4：添加 Handler
**文件：** `go-backend/internal/http/handler/mutations.go`  
**时间：** 60 分钟  
**内容：**

**1.4.1 Handler 函数**
```go
func (h *Handler) tunnelListHandler(w http.ResponseWriter, r *http.Request)
func (h *Handler) tunnelListCreate(w http.ResponseWriter, r *http.Request)
func (h *Handler) tunnelListUpdate(w http.ResponseWriter, r *http.Request)
func (h *Handler) tunnelListDelete(w http.ResponseWriter, r *http.Request)
func (h *Handler) tunnelListAssign(w http.ResponseWriter, r *http.Request)
func (h *Handler) tunnelListOrder(w http.ResponseWriter, r *http.Request)
func (h *Handler) tunnelListTunnelOrder(w http.ResponseWriter, r *http.Request)
```

**1.4.2 权限检查**
- 所有写操作（create/update/delete/assign/order）需要管理员权限
- 读操作（list）所有用户可用

---

#### 步骤 1.5：注册路由
**文件：** `go-backend/internal/http/handler/handler.go`  
**时间：** 10 分钟  
**内容：**
```go
mux.HandleFunc("/api/v1/tunnel-list/list", h.tunnelListHandler)
mux.HandleFunc("/api/v1/tunnel-list/create", h.tunnelListCreate)
mux.HandleFunc("/api/v1/tunnel-list/update", h.tunnelListUpdate)
mux.HandleFunc("/api/v1/tunnel-list/delete", h.tunnelListDelete)
mux.HandleFunc("/api/v1/tunnel-list/assign", h.tunnelListAssign)
mux.HandleFunc("/api/v1/tunnel-list/order", h.tunnelListOrder)
mux.HandleFunc("/api/v1/tunnel-list/tunnel-order", h.tunnelListTunnelOrder)
```

---

#### 步骤 1.6：后端测试
**时间：** 30 分钟  
**测试用例：**
- [ ] 创建分组成功
- [ ] 更新分组成功
- [ ] 删除分组成功（验证级联删除）
- [ ] 分配隧道成功（验证替换式分配）
- [ ] 分组排序成功
- [ ] 隧道排序成功
- [ ] 权限检查（非管理员写操作失败）

---

### 阶段 2：前端基础功能（2-3 小时）

#### 步骤 2.1：添加类型定义
**文件：** `vite-frontend/src/api/types.ts`  
**时间：** 10 分钟  
**内容：**
```typescript
export interface TunnelListApiItem {
  id: number;
  name: string;
  inx: number;
  status: number;
  tunnelIds: number[];
  tunnelNames: string[];
  createdTime: number;
}

export interface TunnelListOrderPayload {
  id: number;
  inx: number;
}

export interface TunnelListTunnelOrderPayload {
  tunnelId: number;
  inx: number;
}
```

---

#### 步骤 2.2：添加 API 函数
**文件：** `vite-frontend/src/api/index.ts`  
**时间：** 15 分钟  
**内容：**
```typescript
export const getTunnelListList = () =>
  Network.post<TunnelListApiItem[]>("/tunnel-list/list");

export const createTunnelList = (data: { name: string; status?: number; inx?: number }) =>
  Network.post("/tunnel-list/create", data);

export const updateTunnelList = (data: { id: number; name: string; status?: number; inx?: number }) =>
  Network.post("/tunnel-list/update", data);

export const deleteTunnelList = (id: number) =>
  Network.post("/tunnel-list/delete", { id });

export const assignTunnelsToList = (data: { listId: number; tunnelIds: number[] }) =>
  Network.post("/tunnel-list/assign", data);

export const updateTunnelListOrder = (data: { orders: TunnelListOrderPayload[] }) =>
  Network.post("/tunnel-list/order", data);

export const updateTunnelListTunnelOrder = (data: { listId: number; orders: TunnelListTunnelOrderPayload[] }) =>
  Network.post("/tunnel-list/tunnel-order", data);
```

---

#### 步骤 2.3：添加 State 和加载逻辑
**文件：** `vite-frontend/src/pages/tunnel.tsx`  
**时间：** 30 分钟  
**内容：**

**State 定义：**
```typescript
const [tunnelLists, setTunnelLists] = useState<TunnelListApiItem[]>([]);
const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
const [listModalOpen, setListModalOpen] = useState(false);
const [editingList, setEditingList] = useState<TunnelListApiItem | null>(null);
```

**加载函数：**
```typescript
const loadTunnelLists = useCallback(async () => {
  const res = await getTunnelListList();
  if (res.code === 0) {
    setTunnelLists(res.data);
  }
}, []);

useEffect(() => {
  loadTunnelLists();
}, [loadTunnelLists]);
```

---

#### 步骤 2.4：添加分组计算逻辑
**文件：** `vite-frontend/src/pages/tunnel.tsx`  
**时间：** 30 分钟  
**内容：**
```typescript
const groupedTunnels = useMemo(() => {
  const result: Array<{
    listId: number | null;
    listName: string;
    tunnels: TunnelApiItem[];
    inx: number;
  }> = [];
  
  // 已分组的隧道
  tunnelLists.forEach(list => {
    const tunnelsInList = allTunnels.filter(t => 
      list.tunnelIds.includes(t.id)
    );
    result.push({
      listId: list.id,
      listName: list.name,
      tunnels: tunnelsInList,
      inx: list.inx,
    });
  });
  
  // 未分组的隧道
  const ungroupedTunnels = allTunnels.filter(t =>
    !tunnelLists.some(l => l.tunnelIds.includes(t.id))
  );
  result.push({
    listId: null,
    listName: '未分组',
    tunnels: ungroupedTunnels,
    inx: 9999,
  });
  
  // 按 inx 排序
  return result.sort((a, b) => a.inx - b.inx);
}, [allTunnels, tunnelLists]);
```

---

### 阶段 3：前端 UI 实现（3-4 小时）

#### 步骤 3.1：添加分组头部组件
**文件：** `vite-frontend/src/pages/tunnel.tsx`  
**时间：** 30 分钟  
**内容：**
```typescript
const GroupHeader = ({ 
  group, 
  tunnelCount,
  isCollapsed,
  onToggleCollapse,
  onEdit,
  onDelete,
}: {
  group: { id: number | null; name: string };
  tunnelCount: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  return (
    <div className="flex items-center justify-between p-3 bg-default-100/50 rounded-lg mb-2">
      <div 
        className="flex items-center gap-2 cursor-pointer flex-1"
        onClick={onToggleCollapse}
      >
        <span className="text-lg">
          {isCollapsed ? '▶' : '▼'}
        </span>
        <span className="font-semibold">
          {group.name}
        </span>
        <span className="text-sm text-default-500">
          ({tunnelCount}条隧道)
        </span>
      </div>
      
      {group.id !== null && (
        <div className="flex items-center gap-2">
          <Button size="sm" onPress={onEdit}>
            编辑
          </Button>
          <Button size="sm" color="danger" onPress={onDelete}>
            删除
          </Button>
        </div>
      )}
    </div>
  );
};
```

---

#### 步骤 3.2：添加拖拽容器
**文件：** `vite-frontend/src/pages/tunnel.tsx`  
**时间：** 60 分钟  
**内容：**

**导入依赖：**
```typescript
import {
  DndContext,
  DragEndEvent,
  pointerWithin,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
```

**拖拽上下文：**
```typescript
const handleDragEnd = async (event: DragEndEvent) => {
  const { active, over } = event;
  
  if (!over) return;
  
  // 判断是分组拖拽还是隧道拖拽
  if (String(active.id).startsWith('group-')) {
    // 分组拖拽排序
    // ...
  } else if (String(active.id).startsWith('tunnel-')) {
    // 隧道拖拽排序
    // ...
  }
};
```

---

#### 步骤 3.3：修改主渲染逻辑
**文件：** `vite-frontend/src/pages/tunnel.tsx`  
**时间：** 60 分钟  
**内容：**

**渲染结构：**
```typescript
<DndContext onDragEnd={handleDragEnd}>
  <SortableContext items={groupIds} strategy={verticalListSortingStrategy}>
    {groupedTunnels.map(group => (
      <SortableGroup key={group.listId || 'ungrouped'} group={group}>
        <GroupHeader
          group={{ id: group.listId, name: group.listName }}
          tunnelCount={group.tunnels.length}
          isCollapsed={collapsedGroups.has(group.listId ?? -1)}
          onToggleCollapse={() => { /* ... */ }}
          onEdit={() => { /* ... */ }}
          onDelete={() => { /* ... */ }}
        />
        
        {!collapsedGroups.has(group.listId ?? -1) && (
          <div className="ml-6">
            <SortableContext items={tunnelIds} strategy={verticalListSortingStrategy}>
              {group.tunnels.map(tunnel => (
                <SortableTunnelCard key={tunnel.id} tunnel={tunnel} />
              ))}
            </SortableContext>
          </div>
        )}
      </SortableGroup>
    ))}
  </SortableContext>
</DndContext>
```

---

#### 步骤 3.4：添加分组管理弹窗
**文件：** `vite-frontend/src/pages/tunnel.tsx`  
**时间：** 30 分钟  
**内容：**
```typescript
<Modal
  isOpen={listModalOpen}
  onOpenChange={setListModalOpen}
  size="md"
>
  <ModalContent>
    {(onClose) => (
      <>
        <ModalHeader>
          {editingList ? '编辑分组' : '创建分组'}
        </ModalHeader>
        <ModalBody>
          <Input
            label="分组名称"
            value={editingList?.name || ''}
            placeholder="输入分组名称"
            onChange={(e) => { /* ... */ }}
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="light" onPress={onClose}>取消</Button>
          <Button color="primary" onPress={handleSaveList}>保存</Button>
        </ModalFooter>
      </>
    )}
  </ModalContent>
</Modal>
```

---

### 阶段 4：拖拽功能实现（2-3 小时）

#### 步骤 4.1：分组拖拽排序
**文件：** `vite-frontend/src/pages/tunnel.tsx`  
**时间：** 45 分钟  
**内容：**

**拖拽处理：**
```typescript
const handleGroupDragEnd = async (activeId: string, overId: string) => {
  const activeIndex = groupedTunnels.findIndex(g => `group-${g.listId}` === activeId);
  const overIndex = groupedTunnels.findIndex(g => `group-${g.listId}` === overId);
  
  if (activeIndex === overIndex) return;
  
  // 计算新排序
  const orders = groupedTunnels
    .map((group, index) => ({
      id: group.listId!,
      inx: index,
    }))
    .filter(order => order.id > 0);  // 排除"未分组"
  
  // 调用 API
  const res = await updateTunnelListOrder({ orders });
  if (res.code === 0) {
    toast.success('排序已更新');
    loadTunnelLists();
  }
};
```

---

#### 步骤 4.2：隧道拖拽排序
**文件：** `vite-frontend/src/pages/tunnel.tsx`  
**时间：** 45 分钟  
**内容：**
```typescript
const handleTunnelDragEnd = async (activeId: string, overId: string, listId: number) => {
  const group = groupedTunnels.find(g => g.listId === listId);
  if (!group) return;
  
  const activeIndex = group.tunnels.findIndex(t => `tunnel-${t.id}` === activeId);
  const overIndex = group.tunnels.findIndex(t => `tunnel-${t.id}` === overId);
  
  if (activeIndex === overIndex) return;
  
  // 计算新排序
  const orders = group.tunnels.map((tunnel, index) => ({
    tunnelId: tunnel.id,
    inx: index,
  }));
  
  // 调用 API
  const res = await updateTunnelListTunnelOrder({ listId, orders });
  if (res.code === 0) {
    toast.success('排序已更新');
  }
};
```

---

#### 步骤 4.3：视觉反馈
**文件：** `vite-frontend/src/pages/tunnel.tsx`  
**时间：** 30 分钟  
**内容：**

**拖拽样式：**
```typescript
const SortableTunnelCard = ({ tunnel, attributes, listeners, setNodeRef, transform, transition, isDragging }: any) => {
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {/* 隧道卡片内容 */}
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 cursor-grab">
          {/* 拖拽手柄图标 */}
        </svg>
        {/* 隧道信息 */}
      </div>
    </div>
  );
};
```

---

### 阶段 5：权限控制和优化（1 小时）

#### 步骤 5.1：管理员权限检查
**文件：** `vite-frontend/src/pages/tunnel.tsx`  
**时间：** 15 分钟  
**内容：**
```typescript
const isAdmin = JwtUtil.getRoleIdFromToken() === 0;

// 仅管理员显示操作按钮
{isAdmin && (
  <Button onPress={() => setListModalOpen(true)}>
    新增分组
  </Button>
)}

// 仅管理员可拖拽
{isAdmin ? (
  <div {...listeners}>{tunnel.name}</div>
) : (
  <div>{tunnel.name}</div>
)}
```

---

#### 步骤 5.2：性能优化
**时间：** 30 分钟  
**内容：**
- 添加防抖处理（拖拽排序 API 调用）
- 添加虚拟滚动（如果隧道数量 > 100）
- 添加 optimistic update（先更新 UI，再调用 API）

---

#### 步骤 5.3：错误处理
**时间：** 15 分钟  
**内容：**
- API 错误处理
- 拖拽失败回滚
- Toast 提示优化

---

## 四、测试计划

### 4.1 后端测试

- [ ] 创建分组 API 测试
- [ ] 更新分组 API 测试
- [ ] 删除分组 API 测试（验证级联删除）
- [ ] 分配隧道 API 测试（验证替换式分配）
- [ ] 分组排序 API 测试
- [ ] 隧道排序 API 测试
- [ ] 权限测试（非管理员写操作失败）

### 4.2 前端测试

- [ ] 分组列表显示正常
- [ ] 分组折叠/展开正常
- [ ] 创建分组功能正常
- [ ] 编辑分组功能正常
- [ ] 删除分组功能正常
- [ ] 拖拽分组排序正常
- [ ] 拖拽隧道排序正常
- [ ] 分配隧道到分组正常
- [ ] 权限控制正常（仅管理员）
- [ ] 未分组隧道显示正常

### 4.3 集成测试

- [ ] 后端数据库迁移成功
- [ ] 前后端 API 联调成功
- [ ] 拖拽功能在主流浏览器正常（Chrome/Firefox/Edge）
- [ ] 大量隧道（100+）性能测试

---

## 五、风险与缓解

### 5.1 技术风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 数据库迁移失败 | 高 | 低 | 提前备份数据库，准备回滚脚本 |
| 拖拽性能问题 | 中 | 中 | 添加虚拟滚动，限制拖拽频率 |
| 浏览器兼容性 | 中 | 低 | 测试主流浏览器，提供降级方案 |

### 5.2 用户体验风险

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 学习成本高 | 中 | 中 | 添加操作提示/引导 |
| 误操作 | 中 | 中 | 添加确认对话框（删除分组） |
| 拖拽灵敏度 | 低 | 中 | 调整拖拽阈值（默认 8px） |

---

## 六、验收标准

### 6.1 功能验收

- [ ] 管理员可以创建/编辑/删除分组
- [ ] 管理员可以拖拽分组排序
- [ ] 管理员可以拖拽隧道排序
- [ ] 管理员可以分配隧道到分组
- [ ] 删除分组后隧道自动移入"未分组"
- [ ] 普通用户看不到分组管理功能
- [ ] "未分组"分组不可编辑/删除

### 6.2 性能验收

- [ ] 分组列表加载时间 < 500ms
- [ ] 拖拽排序响应时间 < 200ms
- [ ] 支持 100+ 隧道流畅拖拽

### 6.3 兼容性验收

- [ ] Chrome 最新版正常
- [ ] Firefox 最新版正常
- [ ] Edge 最新版正常
- [ ] Safari 最新版正常（如适用）

---

## 七、文件清单

### 7.1 需要修改的文件

**后端文件：**
```
go-backend/internal/store/model/model.go                    # 新增数据模型
go-backend/internal/http/handler/handler.go                 # 新增路由
go-backend/internal/http/handler/mutations.go               # 新增 Handler
go-backend/internal/store/repo/repository_mutations.go      # 新增 Repository 函数
go-backend/migrations/add_tunnel_list_table.sql             # 数据库迁移脚本
```

**前端文件：**
```
vite-frontend/src/api/types.ts                              # 新增类型定义
vite-frontend/src/api/index.ts                              # 新增 API 函数
vite-frontend/src/pages/tunnel.tsx                          # 主要修改文件
```

### 7.2 需要备份的文件

**修改前请手动备份：**
```bash
cd C:\Users\57064\flvx

# 后端备份
cp go-backend/internal/store/model/model.go go-backend/internal/store/model/model.go.bak.tunnel-list
cp go-backend/internal/http/handler/handler.go go-backend/internal/http/handler/handler.go.bak.tunnel-list
cp go-backend/internal/http/handler/mutations.go go-backend/internal/http/handler/mutations.go.bak.tunnel-list
cp go-backend/internal/store/repo/repository_mutations.go go-backend/internal/store/repo/repository_mutations.go.bak.tunnel-list

# 前端备份
cp vite-frontend/src/api/types.ts vite-frontend/src/api/types.ts.bak.tunnel-list
cp vite-frontend/src/api/index.ts vite-frontend/src/api/index.ts.bak.tunnel-list
cp vite-frontend/src/pages/tunnel.tsx vite-frontend/src/pages/tunnel.tsx.bak.tunnel-list
```

---

## 八、时间估算

| 阶段 | 任务 | 预估时间 |
|------|------|----------|
| **阶段 1** | 后端实现 | 3-4 小时 |
| **阶段 2** | 前端基础功能 | 2-3 小时 |
| **阶段 3** | 前端 UI 实现 | 3-4 小时 |
| **阶段 4** | 拖拽功能 | 2-3 小时 |
| **阶段 5** | 权限和优化 | 1 小时 |
| **总计** | | **11-15 小时** |

---

## 九、待确认问题

- [ ] 数据库迁移方式（手动 SQL vs 自动迁移）
- [ ] 现有隧道数据处理（全部放入"未分组"）
- [ ] 分组名称长度限制（建议 100 字符）
- [ ] 拖拽灵敏度阈值（默认 8px）
- [ ] 是否添加分组描述字段（可选）

---

## 十、后续优化

### 10.1 短期优化（Phase 2）

- [ ] 分组颜色自定义
- [ ] 分组图标自定义
- [ ] 搜索过滤（按分组筛选）
- [ ] 批量操作增强

### 10.2 长期优化（Phase 3）

- [ ] 分组统计信息（隧道数量/流量统计）
- [ ] 分组导出/导入
- [ ] 分组模板（快速创建常用分组）
- [ ] 分组权限细化（用户组可见性控制）

---

**计划创建完成！请确认后开始实施。**
