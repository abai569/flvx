package handler

import (
	"net/http"

	"go-backend/internal/http/response"
	"go-backend/internal/middleware"
)

// licenseInfo returns the current license state
// This endpoint is called on page load/refresh
// It always triggers a background check to ensure status is up-to-date
func (h *Handler) licenseInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}

	valid, expireTime, reason := middleware.GetLicenseState()

	// Always trigger background check on page refresh to get latest status
	// This runs asynchronously and does not block the current response
	middleware.TriggerAsyncCheck()

	// Check if license is configured via environment variables
	configured := h.repo.GetConfigByName("license_server_url") != nil || h.repo.GetConfigByName("license_key") != nil

	response.WriteJSON(w, response.OK(map[string]interface{}{
		"valid":       valid,
		"expire_time": expireTime,
		"reason":      reason,
		"configured":  configured,
	}))
}
