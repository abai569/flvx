package license

import (
	"time"

	"go-backend/internal/store/model"
	"gorm.io/gorm"
)

// LogAction logs a license action to the history table
func LogAction(db *gorm.DB, licenseID int64, action string, reason string, operatorID int64) error {
	history := model.LicenseHistory{
		LicenseID:   licenseID,
		Domain:      "",
		Action:      action,
		Reason:      reason,
		OperatorID:  operatorID,
		CreatedTime: time.Now().Unix(),
	}

	return db.Create(&history).Error
}

// GetHistory retrieves license history for a given license ID
func GetHistory(db *gorm.DB, licenseID int64) ([]model.LicenseHistory, error) {
	var history []model.LicenseHistory
	err := db.Where("license_id = ?", licenseID).
		Order("created_time DESC").
		Find(&history).Error
	return history, err
}
