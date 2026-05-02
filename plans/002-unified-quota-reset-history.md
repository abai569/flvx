# 002-unified-quota-reset-history

## 问题描述
1. 手动重置时记录的是 `user.in_flow + user.out_flow`（套餐流量），应该记录 `user_quota.monthly_used_bytes`（月配额使用量）
2. 手动重置的 PeriodKey 是时间戳，应该是 YYYYMM 格式
3. 手动重置的 PeriodType 是 daily，应该是 monthly
4. 手动重置只重置了套餐流量，没有重置配额使用量

## 任务清单

### 后端修复
- [x] 修改 `ResetUserFlowByUser()` 函数
  - [x] 重置前先读取 `user_quota.monthly_used_bytes` 用于历史记录
  - [x] 同时重置 `user_quota.monthly_used_bytes = 0`
  - [x] 历史记录使用 `PeriodType="monthly"`, `PeriodKey=YYYYMM`
  - [x] 历史记录流量值 = `user_quota.monthly_used_bytes`

## 修复内容

### 修改文件
- `go-backend/internal/store/repo/repository_mutations.go` - ResetUserFlowByUser()

### 修改逻辑
```go
// 修改前
func ResetUserFlowByUser(userID, now) {
    // 1. 读取 user 表流量
    // 2. 重置 user 表流量
    // 3. 记录历史（使用 user 表流量，PeriodType="daily"）❌
}

// 修改后
func ResetUserFlowByUser(userID, now) {
    // 1. 读取 user 表流量 + user_quota 表月配额使用量
    // 2. 重置 user 表流量
    // 3. 重置 user_quota.monthly_used_bytes
    // 4. 记录历史（使用 monthly_used_bytes, PeriodType="monthly", PeriodKey=YYYYMM）✅
}
```

## 验收标准
- [x] 手动重置后，流量历史弹窗显示"月流量"而不是"日流量"
- [x] PeriodKey 格式为 YYYYMM（如 202605）
- [x] 重置原因显示"管理员手动重置"
- [x] 套餐流量和配额使用量都被清零
- [x] 代码编译通过
