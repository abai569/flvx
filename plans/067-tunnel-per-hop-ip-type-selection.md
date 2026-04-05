# 067-tunnel-per-hop-ip-type-selection.md

**Created:** 2026-04-05
**Feature:** 隧道新增/编辑弹窗 — 每一级地址独立指定向下连接的 IP 类型

---

## 背景

当前隧道有一个全局的 `ipPreference` 字段（`v4`/`v6`/`自动`），作用于整个隧道。需求改为**每一级链路中的每个节点都能独立指定向下连接时使用的 IP 类型**，覆盖入口节点、转发链每一跳的每个节点、出口节点。

IP 类型值域：`ipv4` / `ipv6` / `lan`（内网）/ `auto`（自动）/ 空（跟随全局）。

**输入方式：参考"连接端口"的逗号分隔逻辑**，每级区域只放一个输入框，逗号分隔按顺序对应各节点。

---

## 涉及层级

| 层级 | chainType | 当前 IP 类型控制 | 改动后 |
|------|-----------|-----------------|--------|
| 入口节点 (inNodeId) | 1 | 无 | 逗号分隔输入，对应每个入口节点 |
| 转发链 (chainNodes) | 2 | 全局 ipPreference | 每跳一个输入框，逗号分隔对应该跳各节点 |
| 出口节点 (outNodeId) | 3 | 全局 ipPreference | 逗号分隔输入，对应每个出口节点 |

> 全局 `ipPreference` 字段保留兼容，UI 上降级为"默认值"，当某节点对应位置为空时使用。
> **粒度：每个 ChainTunnel 记录（即每个节点）独立拥有自己的 `connectIpType`。**

---

## 后端改动

### 1. ChainTunnel Model 新增字段

**文件:** `go-backend/internal/store/model/model.go`

```go
type ChainTunnel struct {
    // ... 现有字段 ...
    ConnectIP       sql.NullString `gorm:"column:connect_ip;type:varchar(45)"`
    ConnectIPType   sql.NullString `gorm:"column:connect_ip_type;type:varchar(10)"` // 新增: ipv4/ipv6/lan/auto
}
```

- 字段名: `connect_ip_type`
- 类型: `varchar(10)`
- 值域: `"ipv4"`, `"ipv6"`, `"lan"`, `"auto"`, `""`（空=使用全局 ipPreference）
- GORM AutoMigrate 自动建列

### 2. Handler 解析新增字段

**文件:** `go-backend/internal/http/handler/mutations.go`

#### `tunnelRuntimeNode` 结构体新增字段

```go
type tunnelRuntimeNode struct {
    NodeID        int64
    Protocol      string
    Strategy      string
    Inx           int
    ChainType     int
    Port          int
    ConnectIP     string
    ConnectIPType string // 新增
}
```

#### `prepareTunnelCreateState` 中解析

在解析 `inNodeId`、`outNodeId`、`chainNodes` 时，从 item 中提取 `connectIpType`：

```go
// inNodeId 解析处 (~line 2809)
state.InNodes = append(state.InNodes, tunnelRuntimeNode{
    // ...
    ConnectIPType: asString(item["connectIpType"]),
})

// outNodeId 解析处 (~line 2827)
state.OutNodes = append(state.OutNodes, tunnelRuntimeNode{
    // ...
    ConnectIPType: asString(item["connectIpType"]),
})

// chainNodes 解析处 (~line 2870)
hop = append(hop, tunnelRuntimeNode{
    // ...
    ConnectIPType: asString(item["connectIpType"]),
})
```

#### `replaceTunnelChainsTx` 中传递字段

调用 `CreateChainTunnelTx` 时传入 `connectIpType`：

```go
// inNodeId 保存处 (~line 3690)
r.CreateChainTunnelTx(tx, tunnelID, "1", nodeID,
    sql.NullInt64{}, strategy, inx, protocol, connectIP, connectIpType)

// outNodeId 保存处 (~line 3710)
r.CreateChainTunnelTx(tx, tunnelID, "3", nodeID,
    portVal, strategy, inx, protocol, connectIP, connectIpType)

// chainNodes 保存处 (~line 3738)
r.CreateChainTunnelTx(tx, tunnelID, "2", nodeID,
    portVal, strategy, inx, protocol, connectIP, connectIpType)
```

### 3. Repository 方法签名变更

**文件:** `go-backend/internal/store/repo/repository_mutations.go`

`CreateChainTunnelTx` 新增 `connectIpType` 参数：

```go
func (r *Repository) CreateChainTunnelTx(tx *gorm.DB, tunnelID int64, chainType string, nodeID int64, port sql.NullInt64, strategy string, inx int, protocol string, connectIp string, connectIpType string) error {
    ct := model.ChainTunnel{
        // ... 现有字段 ...
        ConnectIP:     sql.NullString{String: connectIp, Valid: connectIp != ""},
        ConnectIPType: sql.NullString{String: connectIpType, Valid: connectIpType != ""},
    }
    return tx.Create(&ct).Error
}
```

### 4. API 响应序列化新增字段

**文件:** `go-backend/internal/store/repo/repository.go`

在 `ListTunnels` 序列化 ChainTunnel 对象时（~line 1241-1286），每个 nodeObj 中新增：

```go
if c.ConnectIPType.Valid && c.ConnectIPType.String != "" {
    nodeObj["connectIpType"] = c.ConnectIPType.String
}
```

### 5. 调用方全量搜索

`CreateChainTunnelTx` 的所有调用方需同步更新参数：

```bash
# 搜索所有调用位置
rg "CreateChainTunnelTx" go-backend/
```

预计涉及：
- `mutations.go` 中 `replaceTunnelChainsTx`（3 处：inNodeId/outNodeId/chainNodes）
- 其他可能的手动创建 ChainTunnel 的地方

---

## 前端改动

### 1. TypeScript 类型定义

**文件:** `vite-frontend/src/pages/tunnel.tsx`

```typescript
interface ChainTunnel {
  nodeId: number;
  protocol?: string;
  strategy?: string;
  chainType?: number;
  inx?: number;
  connectIp?: string;
  port?: number;
  connectIpType?: string; // 新增: "ipv4" | "ipv6" | "lan" | "auto" | ""
}
```

**文件:** `vite-frontend/src/api/types.ts`

```typescript
export interface TunnelChainNodePayload {
  nodeId: number;
  protocol?: string;
  strategy?: string;
  connectIp?: string;
  chainType?: number;
  inx?: number;
  connectIpType?: string; // 新增
}
```

### 2. 逗号分隔输入逻辑

参考现有 `formatChainPortsToDisplay` 和 `applyPortsToChainGroup` 的逻辑，新增对应的 IP 类型处理函数：

```typescript
// 将各节点的 connectIpType 拼接为逗号分隔字符串
const formatConnectIpTypesToDisplay = (nodes: ChainTunnel[]): string => {
  return nodes.map((n) => n.connectIpType || "").join(",");
};

// 将逗号分隔字符串解析并应用到各节点
const applyConnectIpTypesToGroup = (groupIndex: number, value: string) => {
  const types = value.split(",").map((s) => s.trim());
  setForm((prev) => {
    const chainNodes = [...(prev.chainNodes || [])];
    const groupNodes = [...(chainNodes[groupIndex] || [])];
    const updated = groupNodes.map((node, i) => ({
      ...node,
      connectIpType: types[i] ?? "",
    }));
    chainNodes[groupIndex] = updated;
    return { ...prev, chainNodes };
  });
};
```

### 3. 入口节点 (inNodeId) 区域

**位置:** `tunnel.tsx` ~line 2443-2519

在入口节点选择区域下方新增一个输入框：

```
┌─ 入口节点 ─────────────────────────────────────────┐
│ [节点多选下拉框]                                    │
│ 已选: Node A, Node B                                │
│                                                    │
│ 向下连接IP类型: [ipv4,lan]                      │
│ 提示: 逗号分隔对应各节点，留空跟随全局                │
└────────────────────────────────────────────────────┘
```

### 4. 转发链 (chainNodes) 区域

**位置:** `tunnel.tsx` ~line 2563-2944

在每跳卡片中，与连接端口并列新增"连接IP类型"输入框：

```
┌─ 转发链第 1 跳 ────────────────────────────────────────┐
│ 协议: [tls ▼]  策略: [round ▼]                         │
│ 连接IP: [自动 ▼]                                       │
│ 连接端口: [11111,22222]  连接IP类型: [ipv4,lan]    │
│ 提示: IP类型逗号分隔对应各节点，留空跟随全局              │
│ 节点: [Node A] [Node B]                                │
│ [+ 添加节点]                                            │
└──────────────────────────────────────────────────────────┘
```

- 逗号顺序对应节点选择顺序
- 单节点时直接填一个值即可
- 留空 = 该节点跟随全局 `ipPreference`

### 5. 出口节点 (outNodeId) 区域

**位置:** `tunnel.tsx` ~line 2966-3320

在出口节点配置区域新增"连接IP类型"输入框，与连接端口并列：

```
┌─ 出口节点 ─────────────────────────────────────────┐
│ [节点多选下拉框]                                    │
│ 已选: Node X, Node Y                                │
│ 协议: [tls ▼]  策略: [round ▼]                      │
│ 连接IP: [自动 ▼]                                    │
│ 连接端口: [33333,44444]  连接IP类型: [ipv6,auto]    │
│ 提示: IP类型逗号分隔对应各节点，留空跟随全局          │
└────────────────────────────────────────────────────┘
```

### 6. 全局 ipPreference 降级为默认值

**位置:** `tunnel.tsx` ~line 3328-3347

保留现有 `ipPreference` 选择器，但文案改为：
- 标签: "默认连接地址偏好（当各级未单独指定时生效）"
- 选项增加 "跟随全局" 的说明

### 7. 表单默认值

**文件:** `vite-frontend/src/pages/tunnel/form.ts`

`createTunnelFormDefaults()` 中，chainNodes 初始化时每个节点默认 `connectIpType: ""`。

### 8. 表单提交数据组装

**位置:** `tunnel.tsx` `handleSubmit()` ~line 849

确保 `connectIpType` 字段包含在提交 payload 中：
- `inNodeId` 数组中每个对象
- `outNodeId` 数组中每个对象
- `chainNodes` 二维数组中每个对象

空字符串 `""` 正常发送（表示使用全局默认）。

---

## 任务清单

### 后端
- [x] `model.go`: ChainTunnel 新增 `ConnectIPType` 字段
- [x] `mutations.go`: `tunnelRuntimeNode` 新增 `ConnectIPType` 字段
- [x] `mutations.go`: `prepareTunnelCreateState` 解析 `connectIpType`（3 处）
- [x] `mutations.go`: `replaceTunnelChainsTx` 传递 `connectIpType`（3 处）
- [x] `repository_mutations.go`: `CreateChainTunnelTx` 新增参数并写入
- [x] `repository.go`: `ListTunnels` 序列化返回 `connectIpType`
- [x] 搜索其他 `CreateChainTunnelTx` 调用方并更新
- [x] 后端编译通过: `cd go-backend && go build ./...`

### 前端
- [x] `tunnel.tsx`: `ChainTunnel` 接口新增 `connectIpType` 字段
- [x] `types.ts`: `TunnelChainNodePayload` 新增 `connectIpType` 字段
- [x] 新增 `formatConnectIpTypesToDisplay` / `applyConnectIpTypesToChainGroup` 等 6 个辅助函数
- [x] 入口节点区域新增 `connectIpType` 逗号输入框
- [x] 转发链每跳区域新增 `connectIpType` 逗号输入框
- [x] 出口节点区域新增 `connectIpType` 逗号输入框
- [x] 全局 `ipPreference` 文案更新为"默认连接地址偏好"
- [x] `handleSubmit()`: 提交数据天然包含 `connectIpType`（直接序列化 form 对象）
- [x] 前端编译通过: `cd vite-frontend && npm run build`

---

## 注意事项

1. **向后兼容**: 现有隧道的 `connectIpType` 为空，行为等同于之前使用全局 `ipPreference`
2. **数据库迁移**: GORM AutoMigrate 自动添加新列，无需手动迁移
3. **go-gost 代理层**: 本次改动仅涉及面板 API 和 UI，代理运行时配置下发逻辑不变（IP 类型选择仅影响面板展示和连接 IP 的推导逻辑，实际连接 IP 仍由 `connectIp` 字段决定）
4. **connectIpType 与 connectIp 的关系**: `connectIpType` 是"偏好类型"，`connectIp` 是"具体地址"。两者可同时存在，`connectIp` 优先级更高（明确指定了就用指定的 IP）
5. **逗号分隔校验**: 输入值个数应与节点数匹配，前端可做提示但不强制拦截（与端口逻辑一致）
