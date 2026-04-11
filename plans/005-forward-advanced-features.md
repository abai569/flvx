# 转发规则高级功能实现计划

## 概述
实现转发规则（Forward）的流量控制、到期时间、上下行限速功能的实际执行逻辑。

---

## 功能一：规则流量控制 (Traffic Limit)

### 现状
- ✅ 数据库字段：`Forward.TrafficLimit` (GB, 0=不限制)
- ✅ 前端 UI：已集成到高级功能面板
- ❌ **缺失：** 流量统计检查和超限暂停逻辑

### 实现方案

#### 1.1 流量统计更新 (`flow_policy.go`)
**文件：** `go-backend/internal/http/handler/flow_policy.go`

**修改点：** 在 `processFlowItem` 函数中添加 Forward 流量检查

```go
func (h *Handler) processFlowItem(nodeID int64, item flowItem) {
    // ... 现有代码 ...
    
    forwardID, userID, userTunnelID, ok := parseFlowServiceIDs(serviceName)
    if ok {
        inFlow, outFlow := h.scaleFlowByTunnel(forwardID, item.D, item.U)
        _ = h.repo.AddFlow(forwardID, userID, userTunnelID, inFlow, outFlow)
        
        // ✅ 新增：检查 Forward 流量限制
        h.enforceForwardTrafficLimit(forwardID, inFlow, outFlow)
        
        // ... 后续代码 ...
    }
}
```

#### 1.2 流量限制检查函数
**新增函数：** `enforceForwardTrafficLimit`

```go
func (h *Handler) enforceForwardTrafficLimit(forwardID int64, inFlow, outFlow int64) {
    forward, err := h.getForwardRecord(forwardID)
    if err != nil || forward == nil || forward.TrafficLimit <= 0 {
        return // 未设置限制或不存在
    }
    
    // 获取当前累计流量
    totalFlow := forward.InFlow + forward.OutFlow + inFlow + outFlow
    limitBytes := forward.TrafficLimit * bytesPerGB
    
    if totalFlow >= limitBytes {
        // 流量超限，暂停转发
        h.pauseForward(forwardID, "流量超限")
    }
}
```

#### 1.3 暂停 Forward 函数
**新增函数：** `pauseForward`

```go
func (h *Handler) pauseForward(forwardID int64, reason string) error {
    // 更新数据库状态
    err := h.repo.UpdateForwardStatus(forwardID, 0)
    if err != nil {
        return err
    }
    
    // 通知 gost 删除服务
    forward, _ := h.getForwardRecord(forwardID)
    ports, _ := h.listForwardPorts(forwardID)
    
    for _, fp := range ports {
        node, _ := h.getNodeRecord(fp.NodeID)
        serviceName := buildForwardServiceName(forwardID, forward.UserID, 0)
        h.sendNodeCommand(node.ID, "DeleteService", map[string]interface{}{
            "services": []string{serviceName + "_tcp", serviceName + "_udp"},
        }, false, true)
    }
    
    log.Printf("Forward %d paused: %s", forwardID, reason)
    return nil
}
```

---

## 功能二：规则到期时间 (Expiry Time)

### 现状
- ✅ 数据库字段：`Forward.ExpiryTime` (毫秒时间戳，null=永不过期)
- ✅ 前端 UI：日期选择器
- ❌ **缺失：** 过期检查和自动暂停

### 实现方案

#### 2.1 定时检查任务 (`jobs.go`)
**文件：** `go-backend/internal/http/handler/jobs.go`

**修改点：** 添加 Forward 到期检查定时任务

```go
// 在 initJobs 或 NewHandler 中启动定时任务
func (h *Handler) startForwardExpiryChecker() {
    ticker := time.NewTicker(10 * time.Minute) // 每 10 分钟检查一次
    go func() {
        for range ticker.C {
            h.checkExpiredForwards()
        }
    }()
}
```

#### 2.2 过期检查函数
**新增函数：** `checkExpiredForwards`

```go
func (h *Handler) checkExpiredForwards() {
    now := time.Now().UnixMilli()
    
    // 查询所有已过期的 Forward（状态为启用且有过期时间）
    expiredForwards, err := h.repo.ListExpiredForwards(now)
    if err != nil {
        log.Printf("ERROR: checkExpiredForwards: %v", err)
        return
    }
    
    for _, forward := range expiredForwards {
        h.pauseForward(forward.ID, "已到期")
        log.Printf("Forward %d paused: expired at %v", forward.ID, time.UnixMilli(forward.ExpiryTime.Int64))
    }
}
```

#### 2.3 Repository 查询方法
**文件：** `go-backend/internal/store/repo/repository.go`

**新增方法：** `ListExpiredForwards`

```go
func (r *Repository) ListExpiredForwards(now int64) ([]model.Forward, error) {
    var forwards []model.Forward
    err := r.db.Where("status = 1 AND expiry_time IS NOT NULL AND expiry_time > 0 AND expiry_time <= ?", now).
        Find(&forwards).Error
    return forwards, err
}
```

#### 2.4 创建 Forward 时的预检查
**文件：** `go-backend/internal/http/handler/mutations.go`

在 `forwardCreate` 和 `forwardUpdate` 中添加过期时间验证：

```go
// 检查过期时间是否早于当前时间
if expiryTime != nil && *expiryTime > 0 && *expiryTime <= now {
    response.WriteJSON(w, response.ErrDefault("到期时间不能早于当前时间"))
    return
}
```

---

## 功能三：上下行速率限制 (Upload/Download Speed Limit)

### 现状
- ✅ 数据库字段：`Forward.SpeedLimitEnabled`, `UploadSpeed`, `DownloadSpeed`
- ✅ 前端 UI：开关 + 独立输入框 + 同步按钮
- ❌ **缺失：** gost rate limiter 创建和应用

### 实现方案

#### 3.1 动态创建 Rate Limiter
**文件：** `go-backend/internal/http/handler/control_plane.go`

**修改点：** 在 `syncForwardServicesWithWarnings` 中添加新限速逻辑

```go
func (h *Handler) syncForwardServicesWithWarnings(...) {
    // ... 现有代码：检查旧的 SpeedID 限速 ...
    
    // ✅ 新增：检查新的上下行限速
    var limiterID *int64
    if forward.SpeedLimitEnabled && (forward.UploadSpeed > 0 || forward.DownloadSpeed > 0) {
        // 创建动态限速器
        limiterName := fmt.Sprintf("forward_%d_speed", forward.ID)
        err := h.ensureNodeRateLimiter(fp.NodeID, limiterName, forward.UploadSpeed, forward.DownloadSpeed)
        if err != nil && !isNodeOfflineOrTimeoutError(err) {
            return nil, err
        }
        
        // 使用限速器名称作为 ID（gost 使用名称标识）
        id := int64(-1) // 负数表示动态限速器
        limiterID = &id
    }
    
    // ... 后续代码：将 limiterID 传递给 buildForwardServiceConfigs ...
}
```

#### 3.2 节点限速器管理
**新增函数：** `ensureNodeRateLimiter`

```go
func (h *Handler) ensureNodeRateLimiter(nodeID int64, limiterName string, uploadSpeed, downloadSpeed int) error {
    // 构建限速器配置（gost rate limiter 格式）
    limiterConfig := map[string]interface{}{
        "name": limiterName,
        "type": "rate",
        "limits": []string{
            fmt.Sprintf("%d mbps", uploadSpeed),   // 上行
            fmt.Sprintf("%d mbps", downloadSpeed), // 下行
        },
    }
    
    // 发送到节点
    _, err := h.sendNodeCommand(nodeID, "SetLimiter", limiterConfig, true, false)
    return err
}
```

#### 3.3 修改服务配置构建
**文件：** `go-backend/internal/http/handler/control_plane.go`

**修改：** `buildForwardServiceConfigs` 函数

```go
func buildForwardServiceConfigs(..., limiterID *int64, ...) []map[string]interface{} {
    // ... 现有代码 ...
    
    service := map[string]interface{}{
        // ... 其他配置 ...
    }
    
    // ✅ 修改：支持动态限速器
    if limiterID != nil {
        if *limiterID > 0 {
            // 旧的限速规则 ID
            service["limiter"] = strconv.FormatInt(*limiterID, 10)
        } else {
            // 新的动态限速器（使用名称）
            limiterName := fmt.Sprintf("forward_%d_speed", forward.ID)
            service["limiter"] = limiterName
        }
    }
    
    return services
}
```

#### 3.4 清理旧限速器
**新增函数：** `deleteForwardRateLimiter`

```go
func (h *Handler) deleteForwardRateLimiter(nodeID int64, forwardID int64) error {
    limiterName := fmt.Sprintf("forward_%d_speed", forwardID)
    _, err := h.sendNodeCommand(nodeID, "DeleteLimiter", map[string]interface{}{
        "name": limiterName,
    }, false, true)
    return err
}
```

---

## 任务清单

### 后端实现

- [x] **1.1** 实现 `enforceForwardTrafficLimit` 函数 (`flow_policy.go`)
- [x] **1.2** 实现 `pauseForward` 函数 (`flow_policy.go`)
- [x] **1.3** 在 `processFlowItem` 中调用流量检查
- [x] **1.4** 添加 `GetForwardFlow` Repository 方法 (`repository_flow.go`)
- [x] **1.5** 更新 `ForwardRecord` 结构添加流量字段 (`model.go`)
- [x] **1.6** 更新 `GetForwardRecord` 获取流量数据 (`repository_flow.go`)
- [x] **2.1** 实现 `checkExpiredForwards` 函数 (`jobs.go`) - 使用 `disableExpiredForwards`
- [x] **2.2** 添加 `ListExpiredActiveForwards` Repository 方法 (`repository_flow.go`)
- [x] **2.3** 在 `runResetAndExpiryJob` 中调用到期检查
- [x] **2.4** 在创建/更新时验证到期时间 (`mutations.go`)
- [x] **3.1** 实现 `ensureForwardDynamicLimiter` 函数 (`control_plane.go`)
- [x] **3.2** 实现 `ensureDynamicLimiterOnNode` 函数 (`control_plane.go`)
- [x] **3.3** 修改 `buildForwardServiceConfigs` 支持动态限速器
- [x] **3.4** 实现 `deleteForwardDynamicLimiter` 函数 (`control_plane.go`)
- [x] **3.5** 在删除 Forward 时清理限速器 (`mutations.go`)
- [x] **3.6** 在 `syncForwardServicesWithWarnings` 中集成新限速逻辑

### 前端优化（可选）

- [ ] **4.1** 在规则列表显示流量使用进度条
- [ ] **4.2** 在规则列表显示到期时间/状态
- [ ] **4.3** 过期规则显示特殊标识

### 测试

- [ ] **5.1** 测试流量超限自动暂停
- [ ] **5.2** 测试到期时间自动暂停
- [ ] **5.3** 测试上下行限速生效
- [ ] **5.4** 测试限速开关切换

---

## 技术细节

### 流量单位换算
```go
const bytesPerGB int64 = 1024 * 1024 * 1024

// TrafficLimit (GB) -> bytes
limitBytes := forward.TrafficLimit * bytesPerGB
```

### 时间戳处理
```go
// 毫秒时间戳
now := time.Now().UnixMilli()
expiryTime := time.Date(2025, 12, 31, 23, 59, 59, 0, time.Local).UnixMilli()
```

### Gost Rate Limiter 配置格式
```json
{
  "name": "forward_123_speed",
  "type": "rate",
  "limits": ["100 mbps", "50 mbps"]
}
```

### 数据库迁移
GORM AutoMigrate 会自动添加新字段，无需手动迁移。

---

## 注意事项

1. **性能考虑：**
   - 流量检查在每次流量上报时执行，需确保高效
   - 到期检查定时任务间隔不宜过短（建议 5-10 分钟）

2. **错误处理：**
   - 节点离线时跳过，记录日志
   - 数据库操作失败时记录错误，不影响主流程

3. **向后兼容：**
   - 保留旧的 `SpeedID` 限速逻辑
   - 新旧限速功能可共存（新限速优先）

4. **日志记录：**
   - 所有自动暂停操作需记录详细日志
   - 便于用户排查问题

---

## 实现优先级

1. **高优先级：** 流量控制（用户刚需）
2. **中优先级：** 上下行限速（核心功能）
3. **低优先级：** 到期时间（使用频率较低）
