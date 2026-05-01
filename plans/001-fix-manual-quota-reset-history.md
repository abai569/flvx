# 001-fix-manual-quota-reset-history

## 问题描述
手动重置用户配额流量时，如果系统时间已经进入新的日/月周期，`applyUserQuotaWindowRoll()` 会先清零流量，导致后续的历史记录创建条件 `q.DailyUsedBytes > 0` 不满足，最终没有创建历史记录。

## 任务清单
- [ ] 修复 `ResetUserQuotaUsage()` 函数，在调用 `applyUserQuotaWindowRoll()` 之前保存当前流量值
- [ ] 确保手动重置创建的历史记录使用重置前的流量值和周期 key

## 修复方案
在 `go-backend/internal/store/repo/repository_user_quota.go` 的 `ResetUserQuotaUsage()` 函数中：
1. 在调用 `applyUserQuotaWindowRoll()` 之前保存 `oldDailyUsed`, `oldMonthlyUsed`, `oldDayKey`, `oldMonthKey`
2. 使用保存的旧值创建历史记录
