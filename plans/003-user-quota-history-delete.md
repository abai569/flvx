# 003-user-quota-history-delete

## 需求
在用户流量历史弹窗中添加删除按钮，管理员可以单独删除某条历史记录

## 任务清单
- [x] 后端：添加 `DeleteUserQuotaHistory()` Repo 方法
- [x] 后端：添加 `userQuotaHistoryDelete()` Handler
- [x] 后端：注册路由 `/api/v1/user/quota/history/delete`
- [x] 前端：添加 `deleteUserQuotaHistory()` API 函数
- [x] 前端：导入 `isAdmin()` 权限检查函数
- [x] 前端：添加删除确认对话框状态
- [x] 前端：添加删除处理函数
- [x] 前端：在历史记录列表添加删除按钮（仅管理员可见）
- [x] 前端：添加删除确认对话框 UI
- [x] 编译测试通过

## 技术细节

### 后端修改
- `go-backend/internal/store/repo/repository_user_quota.go` - 添加删除方法
- `go-backend/internal/http/handler/user_quota.go` - 添加删除 Handler
- `go-backend/internal/http/handler/handler.go` - 注册路由

### 前端修改
- `vite-frontend/src/api/index.ts` - 添加删除 API
- `vite-frontend/src/pages/user.tsx` - 添加删除按钮和确认对话框

### 权限控制
- 前端：`isAdmin()` 检查，非管理员不显示删除按钮
- 后端：依赖 JWT 中间件验证登录状态

### 删除流程
1. 管理员点击删除按钮（×图标）
2. 弹出确认对话框
3. 确认后调用删除 API
4. 删除成功后从列表移除该项
5. 不影响其他记录和 cleanup 逻辑

## 验收标准
- [x] 管理员可见删除按钮
- [x] 非管理员不可见删除按钮
- [x] 点击删除按钮弹出确认对话框
- [x] 确认后删除成功并更新列表
- [x] 取消操作不执行删除
- [x] 代码编译通过
