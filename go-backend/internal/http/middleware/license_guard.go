package middleware

import (
	"net/http"

	"go-backend/internal/http/response"
	"go-backend/internal/middleware"
)

// LicenseGuard middleware restricts write operations if license is invalid
func LicenseGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Allow GET requests (Read-only access)
		if r.Method == http.MethodGet {
			next.ServeHTTP(w, r)
			return
		}

		// Check license state
		valid, _, reason := middleware.GetLicenseState()
		if !valid {
			// 如果未配置授权服务或状态未初始化，则放行（兼容测试环境和未配置环境）
			if reason != "" && reason != "未配置授权服务" {
				response.WriteJSON(w, response.Err(403, "操作失败：授权无效 ("+reason+")"))
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}
