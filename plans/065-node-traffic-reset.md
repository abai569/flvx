# 065-node-traffic-reset.md

## 概述

为节点添加流量重置功能，支持手动重置和按续费周期自动重置，重置后显示从基线开始的周期流量而非网卡累计流量。

---

## 需求分析

### 业务场景

- 节点安装后需要统计**本周期**的流量使用，而非网卡累计流量
- 支持**手动重置**流量统计（管理员操作）
- 支持**自动重置**，周期跟随节点的 `renewal_cycle` 字段
- 重置后保留历史周期数据供查询

### 关键行为

| 场景 | 行为 |
|------|------|
| 节点首次安装 | 立即记录当前网卡流量为基线 |
| 手动重置 | 归档当前周期，新建基线，保持原周期 |
| 自动重置（到达周期） | 归档当前周期，新建基线，计算下次重置时间 |
| 续费周期变更 | 下次自动重置按新周期计算 |

---

## 技术方案

### 数据模型

**基线文件：** `/etc/flux_agent/traffic_baseline.json`

```json
{
  "version": "2.0",
  "node_id": 123,
  "current_baseline": {
    "id": "auto_20260401_000000",
    "type": "auto_monthly",
    "initial_rx": 1234567890,
    "initial_tx": 9876543210,
    "recorded_at": "2026-04-01T00:00:00Z",
    "renewal_cycle": "monthly",
    "next_reset_at": "2026-05-01T00:00:00Z"
  },
  "history": [
    {
      "id": "manual_20260315_103000",
      "type": "manual",
      "initial_rx": 0,
      "initial_tx": 0,
      "final_rx": 1234567890,
      "final_tx": 9876543210,
      "period_start": "2026-03-15T10:30:00Z",
      "period_end": "2026-04-01T00:00:00Z",
      "duration_days": 16
    }
  ]
}
```

### 周期映射

| renewal_cycle | 重置周期 | next_reset_at 计算 |
|--------------|---------|-------------------|
| `daily` | 每日 | 明天 00:00 |
| `weekly` | 每周 | 下周一 00:00 |
| `monthly` | 每月 | 下月1日 00:00 |
| `quarterly` | 每季度 | 下季度首日 00:00 |
| `yearly` | 每年 | 明年1月1日 00:00 |
| `once` / 空 | 不自动重置 | 无 |

### 架构设计

```
┌─────────────────────────────────────────────────────────┐
│  前端（vite-frontend）                                   │
│  - 节点卡片显示周期流量（current - baseline）             │
│  - 显示周期开始时间、下次重置时间                        │
│  - 批量勾选后显示"重置流量"按钮                          │
│  - 点击查看流量历史弹窗                                  │
├─────────────────────────────────────────────────────────┤
│  后端 API（go-backend）                                  │
│  - POST /api/v1/node/batch-reset-traffic                 │
│  - GET  /api/v1/node/traffic-history                     │
│  - WebSocket 发送 ResetTraffic 命令                      │
├─────────────────────────────────────────────────────────┤
│  代理层（go-gost/x）                                     │
│  - 启动时加载/创建基线文件                               │
│  - 定时检查自动重置（每分钟）                            │
│  - 接收 ResetTraffic 命令执行手动重置                    │
│  - 上报时计算周期流量（current - baseline）              │
│  - 保存历史到基线文件                                    │
└─────────────────────────────────────────────────────────┘
```

---

## 实施步骤

### 阶段 1：代理层基线管理（3-4 小时）

#### 1.1 创建基线管理模块

**文件：** `go-gost/x/traffic/baseline.go`（新建）

```go
package traffic

import (
    "encoding/json"
    "os"
    "time"
)

type Baseline struct {
    ID            string    `json:"id"`
    Type          string    `json:"type"` // manual | auto_daily | auto_weekly | auto_monthly | auto_quarterly | auto_yearly
    InitialRX     uint64    `json:"initial_rx"`
    InitialTX     uint64    `json:"initial_tx"`
    RecordedAt    time.Time `json:"recorded_at"`
    RenewalCycle  string    `json:"renewal_cycle"`
    NextResetAt   time.Time `json:"next_reset_at,omitempty"`
}

type BaselineFile struct {
    Version         string     `json:"version"`
    NodeID          int64      `json:"node_id"`
    CurrentBaseline *Baseline  `json:"current_baseline"`
    History         []Baseline `json:"history"`
}

var baselineManager *BaselineManager

type BaselineManager struct {
    filepath string
    data     *BaselineFile
    mu       sync.RWMutex
}

func InitBaselineManager(nodeID int64, filepath string) error {
    // 加载或创建基线文件
}

func (m *BaselineManager) GetCurrentBaseline() *Baseline {
    // 返回当前基线
}

func (m *BaselineManager) CreateManualBaseline(reason string) (*Baseline, error) {
    // 手动重置：归档当前，创建新基线
}

func (m *BaselineManager) CheckAndAutoReset(renewalCycle string) (*Baseline, bool) {
    // 检查是否需要自动重置
}

func (m *BaselineManager) CalculatePeriodTraffic(currentRX, currentTX uint64) (rx, tx uint64) {
    // 计算周期流量 = 当前 - 基线
}

func (m *BaselineManager) GetHistory() []Baseline {
    // 返回历史周期列表
}
```

#### 1.2 修改 WebSocket Reporter

**文件：** `go-gost/x/socket/websocket_reporter.go`

- 启动时初始化 `InitBaselineManager(nodeID, "/etc/flux_agent/traffic_baseline.json")`
- 修改 `collectSystemInfo`：
  - 读取当前网卡流量
  - 调用 `baselineManager.CalculatePeriodTraffic()` 计算周期流量
  - 上报 `period_bytes_received` / `period_bytes_transmitted`
  - 上报 `baseline_recorded_at` / `next_reset_at`
- 添加定时检查自动重置（每分钟）
- 处理 `ResetTraffic` 命令：
  - 调用 `baselineManager.CreateManualBaseline()`
  - 响应 `ResetTrafficResponse`

#### 1.3 添加周期计算工具

**文件：** `go-gost/x/traffic/cycle.go`（新建）

```go
package traffic

import "time"

func CalculateNextReset(renewalCycle string, from time.Time) time.Time {
    switch renewalCycle {
    case "daily":
        return time.Date(from.Year(), from.Month(), from.Day()+1, 0, 0, 0, 0, from.Location())
    case "weekly":
        // 下周一 00:00
        daysUntilMonday := (8 - int(from.Weekday())) % 7
        if daysUntilMonday == 0 {
            daysUntilMonday = 7
        }
        return time.Date(from.Year(), from.Month(), from.Day()+daysUntilMonday, 0, 0, 0, 0, from.Location())
    case "monthly":
        // 下月1日 00:00
        return time.Date(from.Year(), from.Month()+1, 1, 0, 0, 0, 0, from.Location())
    case "quarterly":
        // 下季度首日
        currentQuarter := (int(from.Month()) - 1) / 3
        nextQuarterMonth := time.Month(currentQuarter*3 + 4)
        return time.Date(from.Year(), nextQuarterMonth, 1, 0, 0, 0, 0, from.Location())
    case "yearly":
        // 明年1月1日
        return time.Date(from.Year()+1, 1, 1, 0, 0, 0, 0, from.Location())
    default:
        return time.Time{} // 零值表示不自动重置
    }
}
```

---

### 阶段 2：后端 API（2-3 小时）

#### 2.1 添加批量重置接口

**文件：** `go-backend/internal/http/handler/node.go`

```go
// POST /api/v1/node/batch-reset-traffic
func (h *Handler) nodeBatchResetTraffic(w http.ResponseWriter, r *http.Request) {
    // 解析 nodeIds 数组
    // 通过 WebSocket 向每个节点发送 ResetTraffic 命令
    // 等待响应或超时
    // 返回重置结果列表
}
```

#### 2.2 添加流量历史查询接口

**文件：** `go-backend/internal/http/handler/node.go`

```go
// GET /api/v1/node/traffic-history?nodeId=123
func (h *Handler) nodeTrafficHistory(w http.ResponseWriter, r *http.Request) {
    // 从节点缓存或数据库获取历史
    // 返回当前周期 + 历史周期列表
}
```

#### 2.3 注册路由

**文件：** `go-backend/internal/http/handler/handler.go`

```go
mux.HandleFunc("/api/v1/node/batch-reset-traffic", h.nodeBatchResetTraffic)
mux.HandleFunc("/api/v1/node/traffic-history", h.nodeTrafficHistory)
```

---

### 阶段 3：前端界面（3-4 小时）

#### 3.1 修改节点数据类型

**文件：** `vite-frontend/src/api/types.ts`

```typescript
export interface NodeApiItem {
  // ... 现有字段 ...
  periodTraffic?: {
    rx: number;
    tx: number;
    since: string;
    nextReset?: string;
    cycle?: string;
  };
}
```

#### 3.2 节点卡片/列表显示周期流量

**文件：** `vite-frontend/src/pages/node.tsx`

- 修改节点卡片信息区：
  - 显示「周期流量」而非「总流量」
  - 显示「周期始于：2026-04-01」
  - 显示「下次重置：2026-05-01（每月）」
- 添加「查看历史」按钮

#### 3.3 批量操作栏添加「重置流量」按钮

**文件：** `vite-frontend/src/pages/node.tsx`

- 勾选节点后显示「重置流量」按钮
- 点击弹出确认弹窗（显示选中节点列表和周期信息）
- 调用 `batchResetTraffic` API
- 刷新节点列表

#### 3.4 流量历史弹窗

**文件：** `vite-frontend/src/pages/node.tsx`（新增组件）

```tsx
function TrafficHistoryModal({ nodeId, onClose }: { nodeId: number; onClose: () => void }) {
  // 调用 GET /api/v1/node/traffic-history
  // 显示当前周期流量
  // 显示历史周期列表（可折叠）
  // 每个周期显示：开始时间、结束时间、上行、下行、类型（自动/手动）
}
```

#### 3.5 API 调用函数

**文件：** `vite-frontend/src/api/index.ts`

```typescript
export const batchResetNodeTraffic = (nodeIds: number[], reason?: string) =>
  request("/api/v1/node/batch-reset-traffic", { method: "POST", data: { nodeIds, reason } });

export const getNodeTrafficHistory = (nodeId: number) =>
  request(`/api/v1/node/traffic-history?nodeId=${nodeId}`);
```

---

## 文件清单

### 新建文件

| 文件 | 说明 |
|------|------|
| `go-gost/x/traffic/baseline.go` | 基线管理模块 |
| `go-gost/x/traffic/cycle.go` | 周期计算工具 |

### 修改文件

| 文件 | 说明 |
|------|------|
| `go-gost/x/socket/websocket_reporter.go` | 集成基线管理、上报周期流量 |
| `go-backend/internal/http/handler/node.go` | 添加批量重置、历史查询接口 |
| `go-backend/internal/http/handler/handler.go` | 注册新路由 |
| `vite-frontend/src/api/types.ts` | 添加 periodTraffic 字段 |
| `vite-frontend/src/api/index.ts` | 添加 API 调用函数 |
| `vite-frontend/src/pages/node.tsx` | 修改显示、添加重置按钮、历史弹窗 |

---

## 验收标准

- [ ] 节点安装后立即记录基线，显示周期流量为 0
- [ ] 手动重置后，当前周期归档到历史，新周期从 0 开始
- [ ] 自动重置按 renewal_cycle 触发，归档旧周期
- [ ] 批量重置支持勾选多节点
- [ ] 流量历史弹窗显示当前周期和历史周期列表
- [ ] 前端显示周期开始时间、下次重置时间
- [ ] 基线文件持久化，节点重启后周期继续

---

**计划创建完成！**
