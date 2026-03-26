# 003-user-remark-fix

修复用户备注修改后不生效的问题。

## 问题分析

用户报告：修改用户备注时提示成功，但实际上备注没有被修改。

## 检查清单

- [x] 前端表单正确显示备注输入框
- [x] 前端表单正确绑定 `name` 字段
- [x] 前端提交时正确传递 `name` 字段
- [x] 后端正确解析 `name` 字段
- [x] 后端 Repository 正确更新 `name` 字段
- [x] 数据库迁移正确添加 `name` 列
- [ ] 验证数据库实际更新情况
- [ ] 验证前端实际显示情况

## 代码验证

### 前端
- `vite-frontend/src/pages/user.tsx:1392-1399` - 备注输入框
- `vite-frontend/src/pages/user.tsx:583` - 编辑时加载备注
- `vite-frontend/src/pages/user.tsx:640` - 提交时包含 name 字段

### 后端
- `go-backend/internal/http/handler/mutations.go:160` - 解析 name 字段
- `go-backend/internal/http/handler/mutations.go:165,171` - 调用 Repository 更新
- `go-backend/internal/store/repo/repository_mutations.go:82,101` - Updates map 中包含 name
- `go-backend/internal/store/model/model.go:17` - User 模型定义 name 字段

## 可能的原因

1. **数据库迁移未执行**：如果数据库是旧的，可能没有 `name` 列
2. **GORM 零值处理**：GORM 可能忽略了空字符串的更新
3. **缓存问题**：前端或后端有缓存导致显示旧数据
4. **并发更新**：其他代码覆盖了 `name` 字段

## 解决方案

### 方案 1：添加调试日志

在后端添加日志，验证接收到的 `name` 值和更新的 SQL 语句。

### 方案 2：强制更新 ✅

使用 GORM 的 `Select` 方法强制更新所有字段，包括零值。

**已实施**：在 `UpdateUserWithPassword` 和 `UpdateUserWithoutPassword` 方法中添加了 `Select()` 调用，明确指定要更新的字段列表，确保 `name` 字段即使为空字符串也会被更新。

### 方案 3：检查数据库

手动检查数据库中的 `user` 表是否有 `name` 列，以及更新后是否真的改变了。

## 任务列表

- [x] 在后端添加调试日志（不需要，直接修复）
- [x] 使用 GORM Select 强制更新
- [ ] 测试更新备注功能
- [ ] 检查数据库中的实际值
