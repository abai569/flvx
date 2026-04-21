package middleware

import (
	"net/http"
	"os"
	"sync"
	"time"

	"go-backend/internal/http/response"
	"go-backend/internal/license"
	"go-backend/internal/store/model"
	"gorm.io/gorm"
)

var (
	licenseCache     *license.ValidateResult
	licenseCacheMu   sync.RWMutex
	licenseCheckSkip = map[string]bool{
		// 认证相关
		"/api/v1/login":   true,
		"/api/v1/captcha": true,
		// License 相关
		"/api/v1/license/activate": true,
		"/api/v1/license/status":   true,
		"/api/v1/license/verify":   true,
		"/api/v1/license/history":  true,
		// 系统信息
		"/api/v1/system":       true,
		"/api/v1/announcement": true,
	}
)

// LicenseCheck checks if the panel has a valid license
func LicenseCheck(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip license check for public paths (always allow)
		if licenseCheckSkip[r.URL.Path] {
			next.ServeHTTP(w, r)
			return
		}

		// Skip license check in test environment
		if os.Getenv("FLVX_SKIP_LICENSE_CHECK") == "true" {
			next.ServeHTTP(w, r)
			return
		}

		// Skip license check if not activated yet (allow user to login and activate)
		licenseCacheMu.RLock()
		cached := licenseCache
		licenseCacheMu.RUnlock()

		if cached == nil {
			// No license activated yet, allow all operations
			// User can login and activate license
			next.ServeHTTP(w, r)
			return
		}

		// License exists, check if valid
		if !cached.Valid {
			response.WriteJSON(w, response.Err(403, "面板未授权或授权已过期"))
			return
		}

		if cached.Status == 2 {
			response.WriteJSON(w, response.Err(403, "面板授权已过期"))
			return
		}

		next.ServeHTTP(w, r)
	})
}

// RefreshLicenseCache refreshes the license status from database
func RefreshLicenseCache(db *gorm.DB) {
	var lic model.License
	if err := db.Order("created_time DESC").First(&lic).Error; err != nil {
		return
	}

	now := time.Now().Unix()
	daysRemaining := (lic.ExpiredAt - now) / 86400

	status := lic.Status
	if now > lic.ExpiredAt {
		status = 2
	}

	licenseCacheMu.Lock()
	licenseCache = &license.ValidateResult{
		Valid:         status == 1,
		Domain:        lic.Domain,
		ExpiredAt:     lic.ExpiredAt,
		DaysRemaining: max(0, daysRemaining),
		Status:        status,
	}
	licenseCacheMu.Unlock()
}

func max(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
