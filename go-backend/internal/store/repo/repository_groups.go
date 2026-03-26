package repo

import (
	"errors"
	"time"

	"go-backend/internal/store/model"
	"gorm.io/gorm"
)

// ─── Semantic Group Queries (replacing QueryInt64List/QueryPairs passthrough) ─

// ListUserIDsByUserGroup returns all user IDs belonging to a user group.
func (r *Repository) ListUserIDsByUserGroup(userGroupID int64) ([]int64, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var ids []int64
	err := r.db.Model(&model.UserGroupUser{}).
		Where("user_group_id = ?", userGroupID).
		Pluck("user_id", &ids).Error
	return ids, err
}

// ListTunnelIDsByTunnelGroup returns all tunnel IDs belonging to a tunnel group.
func (r *Repository) ListTunnelIDsByTunnelGroup(tunnelGroupID int64) ([]int64, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var ids []int64
	err := r.db.Model(&model.TunnelGroupTunnel{}).
		Where("tunnel_group_id = ?", tunnelGroupID).
		Pluck("tunnel_id", &ids).Error
	return ids, err
}

// ListGroupPermissionPairsByUserGroup returns [userGroupID, tunnelGroupID] pairs
// for all group permissions associated with a user group.
func (r *Repository) ListGroupPermissionPairsByUserGroup(userGroupID int64) ([][2]int64, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var perms []model.GroupPermission
	err := r.db.Where("user_group_id = ?", userGroupID).Find(&perms).Error
	if err != nil {
		return nil, err
	}
	result := make([][2]int64, len(perms))
	for i, p := range perms {
		result[i] = [2]int64{p.UserGroupID, p.TunnelGroupID}
	}
	return result, err
}

func (r *Repository) GetUserGroupIDsByUserID(userID int64) ([]int64, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var ids []int64
	err := r.db.Model(&model.UserGroupUser{}).
		Where("user_id = ?", userID).
		Pluck("user_group_id", &ids).Error
	return ids, err
}

func (r *Repository) ListGroupPermissionPairsByTunnelGroup(tunnelGroupID int64) ([][2]int64, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var perms []model.GroupPermission
	err := r.db.Where("tunnel_group_id = ?", tunnelGroupID).Find(&perms).Error
	if err != nil {
		return nil, err
	}
	result := make([][2]int64, len(perms))
	for i, p := range perms {
		result[i] = [2]int64{p.UserGroupID, p.TunnelGroupID}
	}
	return result, err
}

// ─── Tunnel Group Management for Tunnel Page ─────────────────────────────

// ListTunnelGroupsComplete returns all tunnel groups with complete information.
func (r *Repository) ListTunnelGroupsComplete() ([]model.TunnelGroup, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	var groups []model.TunnelGroup
	err := r.db.Order("inx ASC, id ASC").Find(&groups).Error
	return groups, err
}

// CreateTunnelGroup creates a new tunnel group.
func (r *Repository) CreateTunnelGroup(name, color, description string, inx, status int, now int64) (*model.TunnelGroup, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}
	group := &model.TunnelGroup{
		Name:        name,
		Color:       color,
		Description: description,
		Inx:         inx,
		Status:      status,
		CreatedTime: now,
		UpdatedTime: now,
	}
	if err := r.db.Create(group).Error; err != nil {
		return nil, err
	}
	return group, nil
}

// UpdateTunnelGroup updates an existing tunnel group.
func (r *Repository) UpdateTunnelGroup(id int64, name, color, description string, inx, status int, now int64) error {
	if r == nil || r.db == nil {
		return errors.New("repository not initialized")
	}
	return r.db.Model(&model.TunnelGroup{}).Where("id = ?", id).Updates(map[string]interface{}{
		"name":         name,
		"color":        color,
		"description":  description,
		"inx":          inx,
		"status":       status,
		"updated_time": now,
	}).Error
}

// DeleteTunnelGroup deletes a tunnel group by ID.
func (r *Repository) DeleteTunnelGroup(id int64) error {
	if r == nil || r.db == nil {
		return errors.New("repository not initialized")
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		// Delete junction records first
		if err := tx.Where("tunnel_group_id = ?", id).Delete(&model.TunnelGroupTunnel{}).Error; err != nil {
			return err
		}
		// Delete the group
		return tx.Delete(&model.TunnelGroup{}, id).Error
	})
}

// AssignTunnelToGroup assigns a tunnel to groups (replaces existing assignments).
func (r *Repository) AssignTunnelToGroup(tunnelId int64, groupIds []int64) error {
	if r == nil || r.db == nil {
		return errors.New("repository not initialized")
	}
	return r.db.Transaction(func(tx *gorm.DB) error {
		// Delete existing assignments
		if err := tx.Where("tunnel_id = ?", tunnelId).Delete(&model.TunnelGroupTunnel{}).Error; err != nil {
			return err
		}
		// Insert new assignments
		if len(groupIds) > 0 {
			now := time.Now().UnixMilli()
			relations := make([]model.TunnelGroupTunnel, len(groupIds))
			for i, groupId := range groupIds {
				relations[i] = model.TunnelGroupTunnel{
					TunnelGroupID: groupId,
					TunnelID:      tunnelId,
					CreatedTime:   now,
				}
			}
			if err := tx.Create(&relations).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
