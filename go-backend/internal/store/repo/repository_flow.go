package repo

import (
	"errors"
	"strings"

	"gorm.io/gorm"

	"go-backend/internal/store/model"
)

func (r *Repository) UpdateForwardStatus(forwardID int64, status int, now int64) error {
	if r == nil || r.db == nil {
		return errors.New("repository not initialized")
	}
	return r.db.Model(&model.Forward{}).Where("id = ?", forwardID).Updates(map[string]interface{}{
		"status": status, "updated_time": now,
	}).Error
}

func (r *Repository) GetForwardFlow(forwardID int64) (int64, error) {
	if r == nil || r.db == nil {
		return 0, errors.New("repository not initialized")
	}
	var forward model.Forward
	err := r.db.Select("in_flow, out_flow").Where("id = ?", forwardID).First(&forward).Error
	if err != nil {
		return 0, err
	}
	return forward.InFlow + forward.OutFlow, nil
}

// ✅ 新增：查询已过期的活跃 Forward 规则
func (r *Repository) ListExpiredActiveForwards(nowMs int64) ([]model.Forward, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var forwards []model.Forward
	err := r.db.Where("status = 1 AND expiry_time IS NOT NULL AND expiry_time > 0 AND expiry_time <= ?", nowMs).
		Find(&forwards).Error
	return forwards, err
}

func (r *Repository) ListActiveForwardsByUser(userID int64) ([]model.ForwardRecord, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var forwards []model.Forward
	err := r.db.Where("user_id = ? AND status = 1", userID).Order("id ASC").Find(&forwards).Error
	if err != nil {
		return nil, err
	}
	rows := make([]model.ForwardRecord, 0, len(forwards))
	for _, f := range forwards {
		rows = append(rows, model.ForwardRecord{
			ID:             f.ID,
			UserID:         f.UserID,
			UserName:       f.UserName,
			Name:           f.Name,
			TunnelID:       f.TunnelID,
			RemoteAddr:     f.RemoteAddr,
			Strategy:       f.Strategy,
			Status:         f.Status,
			SpeedID:        f.SpeedID,
			MaxConnections: f.MaxConnections,
		})
	}
	for i := range rows {
		if strings.TrimSpace(rows[i].Strategy) == "" {
			rows[i].Strategy = "fifo"
		}
	}
	return rows, nil
}

func (r *Repository) ListActiveForwardsByUserTunnel(userID, tunnelID int64) ([]model.ForwardRecord, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var forwards []model.Forward
	err := r.db.Where("user_id = ? AND tunnel_id = ? AND status = 1", userID, tunnelID).Order("id ASC").Find(&forwards).Error
	if err != nil {
		return nil, err
	}
	rows := make([]model.ForwardRecord, 0, len(forwards))
	for _, f := range forwards {
		rows = append(rows, model.ForwardRecord{
			ID:             f.ID,
			UserID:         f.UserID,
			UserName:       f.UserName,
			Name:           f.Name,
			TunnelID:       f.TunnelID,
			RemoteAddr:     f.RemoteAddr,
			Strategy:       f.Strategy,
			Status:         f.Status,
			SpeedID:        f.SpeedID,
			MaxConnections: f.MaxConnections,
		})
	}
	for i := range rows {
		if strings.TrimSpace(rows[i].Strategy) == "" {
			rows[i].Strategy = "fifo"
		}
	}
	return rows, nil
}

func (r *Repository) ListForwardsByUserAndTunnel(userID, tunnelID int64) ([]model.ForwardRecord, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var forwards []model.Forward
	err := r.db.Where("user_id = ? AND tunnel_id = ?", userID, tunnelID).Order("id ASC").Find(&forwards).Error
	if err != nil {
		return nil, err
	}
	rows := make([]model.ForwardRecord, 0, len(forwards))
	for _, f := range forwards {
		rows = append(rows, model.ForwardRecord{
			ID:             f.ID,
			UserID:         f.UserID,
			UserName:       f.UserName,
			Name:           f.Name,
			TunnelID:       f.TunnelID,
			RemoteAddr:     f.RemoteAddr,
			Strategy:       f.Strategy,
			Status:         f.Status,
			SpeedID:        f.SpeedID,
			MaxConnections: f.MaxConnections,
		})
	}
	for i := range rows {
		if strings.TrimSpace(rows[i].Strategy) == "" {
			rows[i].Strategy = "fifo"
		}
	}
	return rows, nil
}

func (r *Repository) GetForwardRecord(forwardID int64) (*model.ForwardRecord, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var f model.Forward
	err := r.db.Where("id = ?", forwardID).First(&f).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	fr := model.ForwardRecord{
		ID:                f.ID,
		UserID:            f.UserID,
		UserName:          f.UserName,
		Name:              f.Name,
		TunnelID:          f.TunnelID,
		RemoteAddr:        f.RemoteAddr,
		Strategy:          f.Strategy,
		Status:            f.Status,
		SpeedID:           f.SpeedID,
		MaxConnections:    f.MaxConnections,
		TrafficLimit:      f.TrafficLimit,
		ExpiryTime:        f.ExpiryTime,
		SpeedLimitEnabled: f.SpeedLimitEnabled,
		UploadSpeed:       f.UploadSpeed,
		DownloadSpeed:     f.DownloadSpeed,
		InFlow:            f.InFlow,
		OutFlow:           f.OutFlow,
	}
	if strings.TrimSpace(fr.Strategy) == "" {
		fr.Strategy = "fifo"
	}
	return &fr, nil
}

func (r *Repository) GetTunnelRecord(tunnelID int64) (*model.TunnelRecord, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var t model.Tunnel
	err := r.db.Where("id = ?", tunnelID).First(&t).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	tr := model.TunnelRecord{
		ID:           t.ID,
		Type:         t.Type,
		Status:       t.Status,
		Flow:         t.Flow,
		TrafficRatio: t.TrafficRatio,
	}
	if tr.Flow <= 0 {
		tr.Flow = 1
	}
	if tr.TrafficRatio <= 0 {
		tr.TrafficRatio = 1
	}
	return &tr, nil
}

func (r *Repository) TunnelExists(tunnelID int64) (bool, error) {
	if r == nil || r.db == nil {
		return false, errors.New("repository not initialized")
	}
	var count int64
	err := r.db.Model(&model.Tunnel{}).Where("id = ?", tunnelID).Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *Repository) ForwardExists(forwardID int64) (bool, error) {
	if r == nil || r.db == nil {
		return false, errors.New("repository not initialized")
	}
	var count int64
	err := r.db.Model(&model.Forward{}).Where("id = ?", forwardID).Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// MapForwardIDsToTunnelIDs returns a mapping from forward.id to forward.tunnel_id.
// Missing forward IDs are omitted from the returned map.
func (r *Repository) MapForwardIDsToTunnelIDs(forwardIDs []int64) (map[int64]int64, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	if len(forwardIDs) == 0 {
		return map[int64]int64{}, nil
	}

	// Deduplicate and filter invalid IDs.
	ids := make([]int64, 0, len(forwardIDs))
	seen := make(map[int64]struct{}, len(forwardIDs))
	for _, id := range forwardIDs {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	if len(ids) == 0 {
		return map[int64]int64{}, nil
	}

	type row struct {
		ID       int64 `gorm:"column:id"`
		TunnelID int64 `gorm:"column:tunnel_id"`
	}

	out := make(map[int64]int64, len(ids))
	const chunkSize = 500
	for start := 0; start < len(ids); start += chunkSize {
		end := start + chunkSize
		if end > len(ids) {
			end = len(ids)
		}

		var rows []row
		if err := r.db.Model(&model.Forward{}).
			Select("id", "tunnel_id").
			Where("id IN ?", ids[start:end]).
			Find(&rows).Error; err != nil {
			return nil, err
		}
		for _, r := range rows {
			if r.ID <= 0 || r.TunnelID <= 0 {
				continue
			}
			out[r.ID] = r.TunnelID
		}
	}

	return out, nil
}

func (r *Repository) SpeedLimitExists(id int64) (bool, error) {
	if r == nil || r.db == nil {
		return false, errors.New("repository not initialized")
	}
	var count int64
	err := r.db.Model(&model.SpeedLimit{}).Where("id = ?", id).Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *Repository) GetSpeedLimitSpeed(id int64) (int, error) {
	if r == nil || r.db == nil {
		return 0, errors.New("repository not initialized")
	}
	var sl model.SpeedLimit
	err := r.db.Select("speed").Where("id = ?", id).First(&sl).Error
	if err != nil {
		return 0, err
	}
	return sl.Speed, nil
}
