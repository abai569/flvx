# 004 - 用户页面批量模式功能

**创建日期:** 2026-04-14  
**需求:** 用户页面列表视图添加批量操作功能（监控、重置、删除）

## 需求规格

| 需求点 | 决策 |
|--------|------|
| 批量模式启用范围 | 仅列表视图 |
| 批量重置流量范围 | 仅用户流量（不涉及隧道流量） |
| 进度条 | 不需要 |
| 确认对话框 | 需要显示详细信息（列出用户名） |

## 任务清单

- [x] **后端实现**
  - [x] 在 `mutations.go` 添加 4 个批量 Handler 函数
    - [x] `userBatchDelete` - 批量删除用户
    - [x] `userBatchResetFlow` - 批量重置用户流量
    - [x] `monitorPermissionBatchAssign` - 批量分配监控权限
    - [x] `monitorPermissionBatchRemove` - 批量移除监控权限
  - [x] 在 `handler.go` 注册 4 个新路由
  - [x] 测试后端接口（编译通过）

- [x] **前端实现**
  - [x] 在 `api/index.ts` 添加 4 个 API 函数
  - [x] 在 `user.tsx` 添加批量模式状态
    - [x] `batchMode` - 批量模式开关
    - [x] `selectedUserIds` - 已选用户 ID 集合
    - [x] `batchOperationLoading` - 批量操作加载状态
  - [x] 在 `user.tsx` 添加选择/全选逻辑
  - [x] 在 `user.tsx` 添加批量操作工具栏（仅列表视图）
  - [x] 在 `user.tsx` 添加批量操作处理函数
    - [x] `handleBatchToggleMonitor` - 批量切换监控
    - [x] `handleBatchResetFlow` - 批量重置流量
    - [x] `handleBatchDelete` - 批量删除
  - [x] 在 `user.tsx` 添加批量删除确认对话框
  - [x] 在 `user.tsx` 添加行 checkbox 列（列表视图）
  - [x] 在 `user.tsx` 添加卡片复选框（卡片视图）
  - [x] 前端编译通过

- [ ] **测试验证**
  - [ ] 测试批量选择/全选功能
  - [ ] 测试批量监控权限切换
  - [ ] 测试批量重置流量
  - [ ] 测试批量删除（含权限检查）
  - [ ] 测试卡片模式下不显示批量功能

## 技术细节

### 后端 API

| 接口 | 方法 | 请求体 | 响应 |
|------|------|--------|------|
| `/user/batch-delete` | POST | `{ ids: number[] }` | `{ successCount, failCount }` |
| `/user/batch-reset` | POST | `{ ids: number[] }` | `{ successCount, failCount }` |
| `/monitor/permission/batch-assign` | POST | `{ userIds: number[] }` | `{ successCount, failCount }` |
| `/monitor/permission/batch-remove` | POST | `{ userIds: number[] }` | `{ successCount, failCount }` |

### 前端状态

```typescript
const [batchMode, setBatchMode] = useState(false);
const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
const [batchOperationLoading, setBatchOperationLoading] = useState({
  delete: false,
  reset: false,
  monitor: false,
});
```

### 注意事项

1. **Admin 保护**：批量删除时必须检查 `roleID === 0`，跳过 admin 用户
2. **级联删除**：`DeleteUserCascade` 会自动删除用户的隧道权限等关联数据
3. **监控权限状态**：批量监控操作需要智能判断开启/关闭
4. **视图模式**：批量模式按钮只在列表视图显示和启用

## 完成时间

- 开始时间：2026-04-14
- 完成时间：待定
