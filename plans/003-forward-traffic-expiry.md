# 转发规则流量控制和到期时间功能实现计划

## 概述
为转发规则添加流量控制和到期时间功能，允许管理员为每个规则设置：
- 流量上限（GB）
- 到期时间（时间戳）

## 任务清单

### 后端修改 (go-backend)

- [x] **1.1 修改 Forward 模型** (`internal/store/model/model.go`)
  - 添加 `TrafficLimit int64` 字段（流量限制，单位 GB，0 表示不限制）
  - 添加 `ExpiryTime sql.NullInt64` 字段（过期时间戳，毫秒）

- [x] **1.2 数据库迁移** (`internal/store/repo/repository.go`)
  - GORM AutoMigrate 会自动处理新字段

- [x] **1.3 修改 Forward API 类型** (`internal/http/handler/handler.go` 或相关类型文件)
  - 更新 Forward 创建/更新请求结构，支持新字段

- [x] **1.4 修改 Forward 列表响应** (`internal/http/handler/handler.go`)
  - 在 Forward 列表 API 响应中包含 `trafficLimit` 和 `expiryTime` 字段

- [ ] **1.5 流量检查逻辑** (`internal/http/handler/flow_policy.go`)
  - 在流量统计时检查规则流量限制
  - 超过限制时暂停规则或拒绝新流量

- [ ] **1.6 到期检查逻辑** (`internal/http/handler/jobs.go` 或新建定时任务)
  - 定期检查过期的规则
  - 自动暂停过期规则

- [x] **1.7 修改 Repository 层** (`internal/store/repo/repository_mutations.go`)
  - 更新 createForward 和 updateForward 方法

### 前端修改 (vite-frontend)

- [x] **2.1 更新 TypeScript 类型** (`src/api/types.ts`)
  - 更新 `ForwardApiItem` 接口
  - 添加 `trafficLimit?: number` 字段
  - 添加 `expiryTime?: number` 字段

- [x] **2.2 创建流量限制表单组件** (`src/pages/forward.tsx`)
  - 新建 `TrafficLimitField` 组件（参考 `ConnectionLimitField`）
  - 支持输入 GB 数值
  - 显示说明：0 或留空表示不限制

- [x] **2.3 创建到期时间表单组件** (`src/pages/forward.tsx`)
  - 新建 `ExpiryTimeField` 组件
  - 使用日期时间选择器
  - 支持设置留空（永不过期）

- [x] **2.4 修改 Forward 表单** (`src/pages/forward.tsx`)
  - 在 `ForwardForm` 接口添加字段
  - 在 `handleAdd` 和 `handleEdit` 中初始化新字段
  - 在 `handleSubmit` 中提交新字段
  - 在表单中添加新组件（放在连接数限制后面）

- [x] **2.5 修改提交逻辑** (`src/pages/forward.tsx`)
  - 更新 `createForward` 和 `updateForward` API 调用

- [ ] **2.6 显示流量使用情况** (`src/pages/forward.tsx`)
  - 在规则卡片/表格中显示流量使用进度条
  - 显示格式：`已用/限制 GB`

- [ ] **2.7 显示到期状态** (`src/pages/forward.tsx`)
  - 在规则卡片/表格中显示到期时间
  - 过期规则显示特殊状态标识

### API 调用 (vite-frontend/src/api)

- [x] **3.1 确认 API 参数传递**
  - 检查 `createForward` 和 `updateForward` 函数是否支持新字段

## 技术细节

### 后端模型变更
```go
type Forward struct {
    ID             int64         `gorm:"primaryKey;autoIncrement"`
    UserID         int64         `gorm:"column:user_id;not null"`
    UserName       string        `gorm:"column:user_name;type:varchar(100);not null"`
    Name           string        `gorm:"type:varchar(100);not null"`
    TunnelID       int64         `gorm:"column:tunnel_id;not null"`
    RemoteAddr     string        `gorm:"column:remote_addr;type:text;not null"`
    Strategy       string        `gorm:"type:varchar(100);not null;default:'fifo'"`
    InFlow         int64         `gorm:"not null;default:0"`
    OutFlow        int64         `gorm:"column:out_flow;not null;default:0"`
    CreatedTime    int64         `gorm:"column:created_time;not null"`
    UpdatedTime    int64         `gorm:"column:updated_time;not null"`
    Status         int           `gorm:"not null"`
    Inx            int           `gorm:"not null;default:0"`
    SpeedID        sql.NullInt64 `gorm:"column:speed_id"`
    MaxConnections int           `gorm:"column:max_connections;not null;default:0"`
    
    // 新增字段
    TrafficLimit   int64         `gorm:"column:traffic_limit;not null;default:0"`  // GB, 0=不限制
    ExpiryTime     sql.NullInt64 `gorm:"column:expiry_time"`  // 毫秒时间戳
}
```

### 前端表单字段
```typescript
interface ForwardForm {
    id?: number;
    userId?: number;
    name: string;
    tunnelId: number | null;
    inPort: number | null;
    inIp: string;
    remoteAddr: string;
    interfaceName?: string;
    strategy: string;
    speedId: number | null;
    maxConnections: number;
    
    // 新增字段
    trafficLimit: number;  // GB, 0=不限制
    expiryTime: number | null;  // 毫秒时间戳，null=永不过期
}
```

### UI 设计
参照截图中的样式：
- 流量控制：Switch 开关 + 数值输入框（GB）
- 到期时间：Switch 开关 + 日期时间选择器

## 测试计划

- [ ] 后端单元测试
- [ ] 前端表单验证测试
- [ ] 流量限制生效测试
- [ ] 到期时间自动暂停测试
- [ ] API 集成测试

## 注意事项

1. **数据库迁移**: 确保 GORM AutoMigrate 在生产环境正确执行
2. **向后兼容**: 旧规则默认 `trafficLimit=0`（不限制）和 `expiryTime=null`（永不过期）
3. **流量统计**: 复用现有的 `InFlow` 和 `OutFlow` 字段，不需要额外存储
4. **定时任务**: 到期检查可复用现有的定时任务机制
