# FLVX 授权系统实施计划与修复记录

## 问题记录

1.  **CI Build Check Failure**: `TestPostgresNodeCreateRepairsMissingIDDefaultContract` expected code 0, got 403.
    *   **原因**: 新增的 `LicenseGuard` 拦截器在测试环境下拦截了请求，因为测试环境未配置授权服务，且拦截逻辑过于严格。
    *   **修复**: 在 `license_guard.go` 中增加放行逻辑：如果 `reason` 为空 或 `reason == "未配置授权服务"`，则不拦截测试请求。

2.  **Frontend Display Issue**: 更新版本后，旧版本升级的面板不显示授权状态。
    *   **原因**: 后端 `license_info.go` 检查配置时优先只看环境变量，忽略了数据库中旧版的配置记录。
    *   **修复**: 修改 `license_info.go`，优先检查环境变量，若无则降级检查数据库配置表。

3.  **License State Update "Enable" Failed on Refresh**: 用户在授权后台点击“启用”，面板刷新多次仍显示“禁用”，需要等待后台定时任务（10分钟）才能生效。
    *   **原因**: 之前的实现中，刷新时的验证是**异步**的。面板返回的是刷新时的旧缓存状态。虽然刷新后发起了新的验证请求，但如果用户手速快（如刷新后立即点击新建），拦截器（LicenseGuard）依然读取的是内存中尚未更新的旧状态（Disable）。
    *   **修复**: 
        *   在 `license_info.go` 中调用 `ForceSyncCheck()` 替换了原来的异步触发。该函数是**同步阻塞**的。
        *   现在面板刷新时，会先**等待**授权服务器的最新返回结果，更新完内存状态后再将页面展示给用户。
        *   在 `license_guard.go` 中将 `/api/v1/license/info` 加入白名单，防止“禁用”状态下导致面板无法获取更新状态从而形成永久死锁。

## 实施步骤

### Phase 1: 后端代码修复

**文件**: `go-backend/internal/http/handler/license_info.go`
*   逻辑：调用 `middleware.ForceSyncCheck()` 确保每次页面加载/刷新时，状态是实时同步的。
*   逻辑：检查配置状态时兼容环境变量（新安装）和数据库配置（老版本升级）。

**文件**: `go-backend/internal/middleware/license_check.go`
*   新增 `ForceSyncCheck()` 函数：执行同步网络请求并阻塞等待结果，超时时间设为 5 秒。
*   逻辑：在 `StartLicenseVerification` 中继续保留异步的后台定时任务。

**文件**: `go-backend/internal/http/middleware/license_guard.go`
*   逻辑：拦截写操作时，如果未配置授权服务（测试模式），直接放行。
*   逻辑：将 `/api/v1/license/info` 加入白名单，防止状态卡死。

### Phase 2: 测试验证

1.  **编译测试**: `go build -v ./...`
2.  **合同测试**: `go test ./tests/contract -run TestPostgresNodeCreateRepairsMissingIDDefaultContract -count=1`
    *   预期：Pass (403 问题已修复)。
3.  **部署验证**:
    *   在授权后台执行“禁用”，刷新面板 -> 应该立即显示“授权已被禁用”。
    *   在授权后台执行“启用”，刷新面板 -> 应该立即显示“授权剩余 XX 天”，且可以新建资源。

## 代码修改清单

*   [x] `license_info.go`: 同步验证逻辑 & 兼容旧库配置。
*   [x] `license_check.go`: 新增 `ForceSyncCheck` 同步方法。
*   [x] `license_guard.go`: 修复拦截死锁 & 兼容未配置环境。
