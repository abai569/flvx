package middleware

import (
	"net/http"

	"go-backend/internal/http/response"
	"go-backend/internal/middleware"
)

// LicenseGuard middleware restricts write operations if license is invalid
func LicenseGuard(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1. Allow GET requests (Read-only access)
		if r.Method == http.MethodGet {
			next.ServeHTTP(w, r)
			return
		}

		// 2. Whitelist the license check endpoint itself.
		// Without this, if the license is invalid, the panel cannot refresh status.
		if r.URL.Path == "/api/v1/license/info" {
			next.ServeHTTP(w, r)
			return
		}

		// 3. Check license state
		valid, _, reason := middleware.GetLicenseState()
		if !valid {
			// 如果未配置授权服务，则放行（兼容测试环境）
			if reason == "未配置授权服务" {
				next.ServeHTTP(w, r)
				return
			}
			
			// 明确的拒绝原因
			response.WriteJSON(w, response.Err(403, "操作失败：授权无效 ("+reason+")"))
			return
		}

		next.ServeHTTP(w, r)
	})
}
