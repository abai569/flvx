package handler

import (
	"net/http"
	"os"

	"go-backend/internal/http/response"
	"go-backend/internal/middleware"
)

// licenseInfo returns the current license state
func (h *Handler) licenseInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}

	valid, expireTime, reason := middleware.GetLicenseState()

	// Check if license is configured via environment variables
	configured := os.Getenv("LICENSE_SERVER_URL") != "" && os.Getenv("LICENSE_KEY") != ""

	response.WriteJSON(w, response.OK(map[string]interface{}{
		"valid":       valid,
		"expire_time": expireTime,
		"reason":      reason,
		"configured":  configured,
	}))
}
