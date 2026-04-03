# 064-forward-connection-limit.md

## 概述

为转发规则添加连接数限制功能，适用于 TikTok 直播等场景，防止单条转发规则占用过多节点资源。

---

## 需求分析

### 业务场景

用户使用 FLVX 代理进行 TikTok 直播推流/拉流，需要限制每条转发规则的最大并发连接数，避免：
- 单条规则耗尽节点资源
- 影响其他转发规则的稳定性
- 无法直观看到当前连接使用情况

### 连接数概念

```
连接数 = 转发规则同时建立的 TCP/UDP 连接数

示例：
手机直播 ──→ 代理节点 ──→ TikTok 服务器    (1 个连接)
电脑拉流 ──→ 代理节点 ──→ TikTok 直播流    (1 个连接)

转发连接数：2 个
注意：浏览器访问 FLVX 面板不算转发连接
```

### 预设模板

| 模板 | 连接数 | 适用场景 |
|------|--------|---------|
| 单直播间 | 2 | 1 个手机直播，留 1 个备用 |
| 直播+拉流 | 5 | 手机直播 + 电脑拉流 + 录屏 |
| 自定义 | 手动输入 | 特殊需求 |

---

## 技术方案

### 架构设计

```
┌─────────────────────────────────────────────────────────┐
│  前端（vite-frontend）                                   │
│  - 转发新建/编辑弹窗添加连接数配置                         │
│  - 列表页显示当前连接数/上限（实时刷新）                   │
│  - 连接数满时显示警告标签                                 │
├─────────────────────────────────────────────────────────┤
│  后端 API（go-backend）                                  │
│  - forward 表新增 max_connections 字段                    │
│  - 创建/更新转发时保存连接数配置                           │
│  - 提供连接数查询接口                                     │
├─────────────────────────────────────────────────────────┤
│  代理层（go-gost/x）                                     │
│  - service 层包装 listener，追踪每转发连接数               │
│  - 面板通过 WebSocket 下发 max_connections 配置            │
│  - 超限后拒绝新连接                                       │
│  - 节点定期上报各转发的当前连接数                           │
└─────────────────────────────────────────────────────────┘
```

### 限制层级

**仅转发规则级别**（不限制用户级别）

- 每条转发规则独立设置最大连接数
- 不限制用户所有规则的总连接数
- 简单明确，符合实际使用场景

### 调研结论

| 项目 | 结论 |
|------|------|
| GOST 原生 max_connections | ❌ 不支持。现有 `limiter/conn/` 是按 IP 限制，不是按 service |
| WebSocket 逐转发上报 | ❌ 不上报。现有 SystemInfo 只有全局 TCP/UDP 连接数 |
| 需要新增 | ✅ service 层连接数追踪 + 连接数限制 + 逐转发上报 |

---

## 数据模型

### forward 表新增字段

```go
type Forward struct {
    // ... 现有字段 ...
    MaxConnections int `gorm:"column:max_connections;not null;default:0"` // 最大连接数，0=不限制
}
```

### 数据库迁移

GORM AutoMigrate 会自动处理。

---

## API 设计

### 1. 创建/更新转发

创建/更新转发时传递 `maxConnections` 字段：

```json
{
  "name": "直播推流",
  "tunnelId": 1,
  "remoteAddr": "live.tiktok.com:1935",
  "maxConnections": 2,
  ...
}
```

### 2. 转发列表返回连接数

```json
{
  "id": 1,
  "name": "直播推流",
  "maxConnections": 2,
  "currentConnections": 1,
  ...
}
```

### 3. 连接数查询接口

```
POST /api/v1/forward/connections
Request: { "forwardIds": [1, 2, 3] }
Response: {
  "code": 0,
  "data": [
    { "forwardId": 1, "currentConnections": 1 },
    { "forwardId": 2, "currentConnections": 3 },
    { "forwardId": 3, "currentConnections": 10 }
  ]
}
```

---

## UI 设计

### 1. 转发新建/编辑弹窗

```
┌─ 新建转发规则 ──────────────────────────────────────────┐
│                                                          │
│  规则名称 [________________]                              │
│  所属隧道 [直播隧道 ▼]                                    │
│                                                          │
│  ── 入口配置 ──                                           │
│  入口节点 [节点 A ▼]                                      │
│  监听端口 [自动分配 / 自定义____]                          │
│                                                          │
│  ── 出口配置 ──                                           │
│  目标地址 [live.tiktok.com:1935]                          │
│                                                          │
│  ── 限速配置 ──                                           │
│  限速规则 [不限速 ▼]                                      │
│                                                          │
│  ── 连接数限制 ──  ← 新增区域                              │
│                                                          │
│  最大连接数 [2 ▼]  [?]                                    │
│                                                          │
│  选项：                                                   │
│  ○ 单直播间 (2)                                          │
│  ○ 直播+拉流 (5)                                         │
│  ○ 自定义                                                │
│                                                          │
│  自定义输入：[____]  ← 选"自定义"时显示                     │
│                                                          │
│  [?] 连接数限制说明：                                     │
│  限制该转发规则同时建立的最大连接数。                       │
│  超过限制后，新连接将被拒绝。                               │
│  - 单直播间：1 个手机直播，留 1 个备用                     │
│  - 直播+拉流：手机直播 + 电脑拉流 + 录屏                   │
│                                                          │
│  ───────────────────────────────────────────              │
│  [取消]  [保存]                                           │
└──────────────────────────────────────────────────────────┘
```

### 2. 转发列表

```
┌─ 转发列表 ──────────────────────────────────────────────┐
│  规则名    │ 隧道    │ 入口地址        │ 连接数    │ 状态  │
│  ──────────┼─────────┼─────────────────┼───────────┼───────│
│  直播推流  │ 直播隧道 │ 1.2.3.4:8080   │ 1/2       │ ✅    │
│  直播拉流  │ 直播隧道 │ 1.2.3.4:8081   │ 3/5       │ ✅    │
│  多开测试  │ 测试隧道 │ 1.2.3.4:8082   │ 10/10 满  │ ⚠️    │
│  推流2     │ 直播隧道 │ 1.2.3.4:8083   │ 0/2       │ ✅    │
└──────────────────────────────────────────────────────────┘

连接数列视觉状态：
- 正常（<80%）：默认色，如 "1/2"
- 警告（≥80%）：橙色，如 "4/5"
- 已满（100%）：红色 + "满"标签，如 "10/10 满"
```

### 3. 交互逻辑

```
选择不同选项时的行为：

选择"单直播间 (2)"
  └─ maxConnections 自动设为 2
  └─ 自定义输入框隐藏

选择"直播+拉流 (5)"
  └─ maxConnections 自动设为 5
  └─ 自定义输入框隐藏

选择"自定义"
  └─ 显示自定义输入框
  └─ 输入范围：1-9999
  └─ 输入时实时更新"最大连接数"显示

编辑已有规则时：
  └─ 如果 maxConnections = 0，默认选中"自定义"，输入框显示"不限制"
  └─ 如果 maxConnections = 2，默认选中"单直播间 (2)"
  └─ 如果 maxConnections = 5，默认选中"直播+拉流 (5)"
  └─ 其他值，默认选中"自定义"，输入框显示具体数值
```

---

## 实施步骤

### 阶段 1：前端实现（2-3 小时）

#### 步骤 1.1：添加类型定义

**文件：** `vite-frontend/src/api/types.ts`

```typescript
export interface ForwardApiItem {
  // ... 现有字段 ...
  maxConnections: number;
  currentConnections?: number;
}
```

#### 步骤 1.2：转发新建/编辑弹窗

**文件：** `vite-frontend/src/pages/forward.tsx`

- 在限速配置下方添加"连接数限制"区域
- 实现三个选项的单选逻辑
- 自定义输入框的显示/隐藏逻辑
- 输入验证（1-9999）
- 编辑时自动选中对应选项

#### 步骤 1.3：转发列表显示连接数

**文件：** `vite-frontend/src/pages/forward.tsx`

- 在列表中新增"连接数"列
- 显示格式：`当前/上限`
- 视觉状态：
  - 正常（<80%）：默认色
  - 警告（≥80%）：橙色
  - 已满（100%）：红色 + "满"标签
- 实时刷新（WebSocket 推送或轮询）

#### 步骤 1.4：连接数说明提示

**文件：** `vite-frontend/src/pages/forward.tsx`

- 添加 [?] 按钮，点击显示说明

---

### 阶段 2：后端实现（1-2 小时）

#### 步骤 2.1：添加数据模型字段

**文件：** `go-backend/internal/store/model/model.go`

- Forward 结构体新增 `MaxConnections int` 字段
- GORM tag: `gorm:"column:max_connections;not null;default:0"`

#### 步骤 2.2：更新转发创建/更新逻辑

**文件：** `go-backend/internal/http/handler/mutations.go`

- 创建转发时读取 `maxConnections` 字段
- 更新转发时同步更新 `maxConnections`
- 默认值为 0（不限制）

#### 步骤 2.3：连接数查询接口

**文件：** `go-backend/internal/http/handler/handler.go` + `mutations.go`

- 新增 `/api/v1/forward/connections` 接口
- 返回指定转发规则的当前连接数
- 数据来自节点 WebSocket 上报的缓存

#### 步骤 2.4：注册路由

**文件：** `go-backend/internal/http/handler/handler.go`

```go
mux.HandleFunc("/api/v1/forward/connections", h.forwardConnections)
```

#### 步骤 2.5：面板侧连接数缓存

**文件：** `go-backend/internal/http/handler/handler.go` 或新建文件

- 接收节点 WebSocket 上报的逐转发连接数
- 内存缓存（map[forwardID]currentConnections）
- 提供查询接口读取缓存数据

---

### 阶段 3：代理层集成（2-3 小时）

#### 步骤 3.1：service 层连接数追踪

**文件：** `go-gost/x/service/service.go`

- 每个 service 创建时包装 listener
- 使用原子计数器追踪当前活跃连接数
- 提供 `GetCurrentConnections() int` 方法

#### 步骤 3.2：面板下发连接数配置

**文件：** `go-gost/x/socket/websocket_reporter.go`

- 新增命令类型：`SetServiceMaxConnections`
- 处理逻辑：更新对应 service 的 maxConns 值
- 保存到 gost.json 持久化

#### 步骤 3.3：逐转发连接数上报

**文件：** `go-gost/x/socket/websocket_reporter.go`

- 在 SystemInfo 中新增字段：`ServiceConnections map[string]int`
- key 为 service 名称（对应 forward ID），value 为当前连接数
- 每 1 秒上报一次（复用现有 metricTicker）

---

### 阶段 4：测试（用户自行测试）

---

## 文件清单

### 需要修改的文件

**后端文件：**
```
go-backend/internal/store/model/model.go              # Forward 新增 MaxConnections 字段
go-backend/internal/http/handler/mutations.go         # 创建/更新转发时处理连接数
go-backend/internal/http/handler/handler.go           # 连接数查询接口 + 缓存
```

**代理层文件：**
```
go-gost/x/service/service.go                          # service 层连接数追踪 + 限制
go-gost/x/socket/websocket_reporter.go               # 连接数配置下发 + 逐转发上报
```

**前端文件：**
```
vite-frontend/src/api/types.ts                        # ForwardApiItem 新增字段
vite-frontend/src/pages/forward.tsx                   # 主要修改：弹窗 + 列表
```

---

## 风险与缓解

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| service 包装 listener 复杂度高 | 高 | 中 | 先调研 service.go 现有结构，复用已有 wrapper 模式 |
| 连接数上报延迟 | 中 | 中 | 复用现有 1 秒 metricTicker，延迟 < 2 秒 |
| 前端状态不同步 | 中 | 低 | WebSocket 断线时降级为轮询 |
| 代理层重启后连接数配置丢失 | 低 | 低 | 保存到 gost.json，重启时恢复 |

---

## 验收标准

### 功能验收

- [ ] 创建转发时可选择预设模板或自定义连接数
- [ ] 编辑转发时正确回显当前连接数设置
- [ ] 列表页实时显示当前连接数/上限
- [ ] 连接数满时显示"满"标签（红色警告）
- [ ] 连接数 ≥80% 时显示橙色警告
- [ ] 代理层正确限制每转发连接数
- [ ] 超限后新连接被拒绝
- [ ] 节点正确上报逐转发连接数

### 性能验收

- [ ] 连接数上报延迟 < 2 秒
- [ ] 列表页连接数刷新不影响其他操作
- [ ] service 层连接数追踪无明显性能损耗

---

## 后续优化

### 短期优化

- [ ] 连接数历史图表（查看连接数变化趋势）
- [ ] 连接数超限告警（邮件/Webhook 通知）

### 长期优化

- [ ] 用户级别总连接数限制（可选）
- [ ] 节点级别总连接数限制（可选）
- [ ] 动态连接数调整（根据负载自动调整）

---

## 任务清单

### 阶段 1：前端
- [x] 1.1 类型定义（ForwardApiItem + ForwardMutationPayload + Forward 接口）
- [x] 1.2 转发新建/编辑弹窗（ConnectionLimitField 组件 + 预设选项）
- [x] 1.3 转发列表显示连接数（ConnectionCountCell 组件 + 表格列）
- [x] 1.4 连接数说明提示（点击 ? 按钮显示说明）

### 阶段 2：后端
- [x] 2.1 Forward 模型新增 MaxConnections 字段（model.go + ForwardRecord）
- [x] 2.2 创建/更新转发时处理 maxConnections（mutations.go + repository_mutations.go）
- [x] 2.3 构建转发服务配置时注入 maxConnections（control_plane.go buildForwardServiceConfigs）
- [ ] 2.4 连接数查询接口（依赖代理层上报，后续补充）
- [ ] 2.5 面板侧连接数缓存（依赖代理层上报，后续补充）

### 阶段 3：代理层
- [x] 3.1 service 层连接数追踪（service.go 添加 maxConns + conns 原子计数器 + Serve 循环限制）
- [x] 3.2 面板下发连接数配置（websocket_reporter.go handleSetServiceMaxConnections + 配置解析 parse.go）
- [x] 3.3 逐转发连接数上报（websocket_reporter.go SystemInfo 新增 ServiceConnections + collectServiceConnections）

### 阶段 4：测试
- [ ] 用户自行测试

---

**计划创建完成！确认后开始实施。**
