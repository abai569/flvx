package handler

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"sync"
	"time"

	"go-backend/internal/http/response"
	"go-backend/internal/license"
	"go-backend/internal/store/model"
	"gorm.io/gorm"
)

var (
	licenseCache   *license.ValidateResult
	licenseCacheMu sync.RWMutex
)

func (h *Handler) activateLicense(w http.ResponseWriter, r *http.Request) {
	var req struct {
		LicenseKey string `json:"license_key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.WriteJSON(w, response.ErrDefault("无效的请求格式"))
		return
	}

	if req.LicenseKey == "" {
		response.WriteJSON(w, response.ErrDefault("License Key 不能为空"))
		return
	}

	licenseData, err := license.ParseLicense(req.LicenseKey)
	if err != nil {
		response.WriteJSON(w, response.ErrDefault("License Key 格式无效"))
		return
	}

	currentDomain := license.ExtractDomain(r)
	if currentDomain == "" {
		response.WriteJSON(w, response.ErrDefault("无法获取当前域名"))
		return
	}

	if !license.ValidateDomain(licenseData.Domain, currentDomain) {
		response.WriteJSON(w, response.ErrDefault("域名不匹配"))
		return
	}

	now := time.Now().Unix()
	if now > licenseData.ExpiredAt {
		response.WriteJSON(w, response.ErrDefault("License 已过期"))
		return
	}

	tx := h.repo.DB().Begin()
	defer tx.Rollback()

	var existing model.License
	if err := tx.Where("domain = ?", licenseData.Domain).First(&existing).Error; err == nil {
		existing.LicenseKey = req.LicenseKey
		existing.ExpiredAt = licenseData.ExpiredAt
		existing.Months = licenseData.Months
		existing.Status = 1
		existing.ActivatedAt = sql.NullInt64{Int64: now, Valid: true}
		existing.UpdatedTime = sql.NullInt64{Int64: time.Now().Unix(), Valid: true}
		if err := tx.Save(&existing).Error; err != nil {
			response.WriteJSON(w, response.ErrDefault("保存失败"))
			return
		}
		_ = license.LogAction(tx, existing.ID, "renew", "续期", 0)
	} else if errors.Is(err, gorm.ErrRecordNotFound) {
		newLicense := model.License{
			Domain:      licenseData.Domain,
			LicenseKey:  req.LicenseKey,
			IssuedAt:    licenseData.IssuedAt,
			ExpiredAt:   licenseData.ExpiredAt,
			Months:      licenseData.Months,
			Status:      1,
			ActivatedAt: sql.NullInt64{Int64: now, Valid: true},
			CreatedTime: now,
		}
		if err := tx.Create(&newLicense).Error; err != nil {
			response.WriteJSON(w, response.ErrDefault("保存失败"))
			return
		}
		_ = license.LogAction(tx, newLicense.ID, "activate", "激活", 0)
	} else {
		response.WriteJSON(w, response.ErrDefault("查询失败"))
		return
	}

	tx.Commit()

	daysRemaining := (licenseData.ExpiredAt - now) / 86400
	licenseCacheMu.Lock()
	licenseCache = &license.ValidateResult{
		Valid:         true,
		Domain:        licenseData.Domain,
		ExpiredAt:     licenseData.ExpiredAt,
		DaysRemaining: daysRemaining,
		Status:        1,
	}
	licenseCacheMu.Unlock()

	response.WriteJSON(w, response.OK(map[string]interface{}{
		"expired_at":     licenseData.ExpiredAt,
		"days_remaining": daysRemaining,
		"domain":         licenseData.Domain,
	}))
}

func (h *Handler) getLicenseStatus(w http.ResponseWriter, r *http.Request) {
	var lic model.License
	if err := h.repo.DB().Order("created_time DESC").First(&lic).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.WriteJSON(w, response.OK(map[string]interface{}{
				"activated": false,
				"status":    0,
			}))
			return
		}
		response.WriteJSON(w, response.ErrDefault("查询失败"))
		return
	}

	now := time.Now().Unix()
	daysRemaining := (lic.ExpiredAt - now) / 86400
	status := lic.Status
	if now > lic.ExpiredAt {
		status = 2
	}

	response.WriteJSON(w, response.OK(map[string]interface{}{
		"activated":      lic.Status == 1,
		"domain":         lic.Domain,
		"expired_at":     lic.ExpiredAt,
		"days_remaining": max(0, daysRemaining),
		"status":         status,
	}))
}

func (h *Handler) verifyLicense(w http.ResponseWriter, r *http.Request) {
	var lic model.License
	if err := h.repo.DB().Order("created_time DESC").First(&lic).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.WriteJSON(w, response.ErrDefault("未找到 License"))
			return
		}
		response.WriteJSON(w, response.ErrDefault("查询失败"))
		return
	}

	h.repo.DB().Model(&lic).Updates(map[string]interface{}{
		"last_verify_at": time.Now().Unix(),
	})

	response.WriteJSON(w, response.OK(map[string]string{
		"message": "验证通过",
	}))
}

func (h *Handler) deactivateLicense(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Reason string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.WriteJSON(w, response.ErrDefault("无效请求"))
		return
	}

	var lic model.License
	if err := h.repo.DB().Order("created_time DESC").First(&lic).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			response.WriteJSON(w, response.ErrDefault("未找到 License"))
			return
		}
		response.WriteJSON(w, response.ErrDefault("查询失败"))
		return
	}

	h.repo.DB().Model(&lic).Updates(map[string]interface{}{
		"status":       0,
		"updated_time": time.Now().Unix(),
	})

	// Log action
	history := model.LicenseHistory{
		LicenseID:   lic.ID,
		Domain:      lic.Domain,
		Action:      "deactivate",
		Reason:      req.Reason,
		OperatorID:  0,
		CreatedTime: time.Now().Unix(),
	}
	_ = h.repo.DB().Create(&history).Error

	licenseCacheMu.Lock()
	licenseCache = nil
	licenseCacheMu.Unlock()

	response.WriteJSON(w, response.OK(map[string]string{
		"message": "已停用",
	}))
}

func (h *Handler) getLicenseHistory(w http.ResponseWriter, r *http.Request) {
	licenseID := r.URL.Query().Get("license_id")

	var history []model.LicenseHistory
	query := h.repo.DB().Order("created_time DESC")

	if licenseID != "" {
		query = query.Where("license_id = ?", licenseID)
	}

	if err := query.Find(&history).Error; err != nil {
		response.WriteJSON(w, response.ErrDefault("查询失败"))
		return
	}

	response.WriteJSON(w, response.OK(history))
}

func max(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
