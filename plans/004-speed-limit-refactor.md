# 限速功能重构 - 集成到转发规则

## 概述
将限速功能从独立页面集成到转发规则编辑表单中，支持上下行速率单独控制，舍弃限速配置页面。

## 任务清单

### 后端修改 (go-backend)

- [x] **1.1 修改 Forward 模型** (`internal/store/model/model.go`)
  - 添加 `SpeedLimitEnabled bool` 字段（是否启用限速）
  - 添加 `UploadSpeed int` 字段（上行速率，Mbps）
  - 添加 `DownloadSpeed int` 字段（下行速率，Mbps）
  - 更新 `ForwardRecord` 结构

- [x] **1.2 数据库迁移** 
  - GORM AutoMigrate 会自动处理新字段

- [x] **1.3 修改 Repository 层** (`internal/store/repo/repository_mutations.go`)
  - 更新 `CreateForwardTx` 函数添加新参数
  - 更新 `UpdateForward` 函数添加新参数

- [x] **1.4 修改 API Handler** (`internal/http/handler/mutations.go`)
  - 更新 `forwardCreate` 处理新字段
  - 更新 `forwardUpdate` 处理新字段
  - 更新 `forwardList` 返回新字段

- [ ] **1.5 限速逻辑应用** (`go-gost/`)
  - 在转发服务中应用上下行速率限制
  - 需要修改 gost 的限速实现

- [ ] **1.6 清理限速页面 API** (可选)
  - 保留向后兼容或移除 speed_limit 相关 API

### 前端修改 (vite-frontend)

- [x] **2.1 更新 TypeScript 类型** (`src/api/types.ts`, `src/pages/forward.tsx`)
  - 在 `ForwardApiItem` 和 `Forward` 接口添加新字段
  - 在 `ForwardForm` 接口添加新字段

- [x] **2.2 创建限速配置组件** (`src/pages/forward.tsx`)
  - 支持开关控制
  - 上行速率输入
  - 下行速率输入
  - 快速同步按钮（上下行相同值）

- [x] **2.3 修改 Forward 表单**
  - 将限速配置集成到高级功能折叠面板中
  - 移除原有的"规则限速"下拉选择

- [x] **2.4 修改提交逻辑**
  - 更新创建/更新 API 调用

- [ ] **2.5 移除限速页面** (`src/pages/limit.tsx`)
  - 删除或隐藏限速页面路由
  - 清理相关导航菜单

### 数据迁移

- [ ] **3.1 迁移现有数据**
  - 将 speed_limit 表的限速规则迁移到 forward 表
  - 或保留向后兼容

## 技术细节

### 后端模型变更
```go
type Forward struct {
    // ... 现有字段
    SpeedLimitEnabled bool `gorm:"column:speed_limit_enabled;not null;default:false"`
    UploadSpeed       int  `gorm:"column:upload_speed;not null;default:0"`      // Mbps
    DownloadSpeed     int  `gorm:"column:download_speed;not null;default:0"`    // Mbps
}
```

### 前端表单字段
```typescript
interface ForwardForm {
    // ... 现有字段
    speedLimitEnabled: boolean;
    uploadSpeed: number;
    downloadSpeed: number;
}
```

### UI 设计
参照用户提供的截图：
- 顶部开关控制是否启用
- 两个输入框分别控制上下行
- 中间同步按钮快速设置相同值

## 注意事项

1. **向后兼容**: 考虑现有 speed_limit 数据如何处理
2. **gost 集成**: 需要确认 gost 是否支持上下行单独限速
3. **数据库迁移**: 如需迁移数据，需要编写迁移脚本
4. **API 兼容**: 考虑是否保留 speed_limit API 供旧版本使用
