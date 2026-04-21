package repo

import (
	"errors"
	"time"

	"go-backend/internal/store/model"
	"gorm.io/gorm"
)

// CreateNodeTag creates a new node tag.
func (r *Repository) CreateNodeTag(name, color string) (*model.NodeTag, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}

	now := time.Now().Unix()
	tag := &model.NodeTag{
		Name:        name,
		Color:       color,
		CreatedTime: now,
	}

	if err := r.db.Create(tag).Error; err != nil {
		return nil, err
	}

	return tag, nil
}

// UpdateNodeTag updates an existing node tag.
func (r *Repository) UpdateNodeTag(id int64, name, color string) error {
	if r == nil || r.db == nil {
		return errors.New("repository not initialized")
	}

	updates := map[string]interface{}{
		"name":  name,
		"color": color,
	}

	return r.db.Model(&model.NodeTag{}).Where("id = ?", id).Updates(updates).Error
}

// DeleteNodeTag deletes a node tag by ID.
func (r *Repository) DeleteNodeTag(id int64) error {
	if r == nil || r.db == nil {
		return errors.New("repository not initialized")
	}

	return r.db.Transaction(func(tx *gorm.DB) error {
		// Delete junction records first (cascade)
		if err := tx.Where("tag_id = ?", id).Delete(&model.NodeTagNode{}).Error; err != nil {
			return err
		}

		// Delete the tag
		return tx.Delete(&model.NodeTag{}, id).Error
	})
}

// ListNodeTags returns all node tags ordered by id.
func (r *Repository) ListNodeTags() ([]model.NodeTag, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}

	var tags []model.NodeTag
	err := r.db.Order("id ASC").Find(&tags).Error
	return tags, err
}

// GetNodeTagByID returns a node tag by ID.
func (r *Repository) GetNodeTagByID(id int64) (*model.NodeTag, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}

	var tag model.NodeTag
	err := r.db.First(&tag, id).Error
	if err != nil {
		return nil, err
	}

	return &tag, nil
}

// GetNodeTagByName returns a node tag by name.
func (r *Repository) GetNodeTagByName(name string) (*model.NodeTag, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}

	var tag model.NodeTag
	err := r.db.Where("name = ?", name).First(&tag).Error
	if err != nil {
		return nil, err
	}

	return &tag, nil
}

// AssignTagsToNode assigns tags to a node (replaces existing tags).
func (r *Repository) AssignTagsToNode(nodeID int64, tagIDs []int64) error {
	if r == nil || r.db == nil {
		return errors.New("repository not initialized")
	}

	return r.db.Transaction(func(tx *gorm.DB) error {
		// Delete existing tags for this node
		if err := tx.Where("node_id = ?", nodeID).Delete(&model.NodeTagNode{}).Error; err != nil {
			return err
		}

		// Insert new tags
		if len(tagIDs) > 0 {
			now := time.Now().Unix()
			relations := make([]model.NodeTagNode, len(tagIDs))
			for i, tagID := range tagIDs {
				relations[i] = model.NodeTagNode{
					NodeID:    nodeID,
					TagID:     tagID,
					CreatedAt: now,
				}
			}
			if err := tx.Create(&relations).Error; err != nil {
				return err
			}
		}

		return nil
	})
}

// GetTagsByNodeID returns all tags assigned to a node.
func (r *Repository) GetTagsByNodeID(nodeID int64) ([]model.NodeTag, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}

	var tags []model.NodeTag
	err := r.db.Table("node_tag").
		Joins("JOIN node_tag_node ON node_tag.id = node_tag_node.tag_id").
		Where("node_tag_node.node_id = ?", nodeID).
		Order("node_tag.id ASC").
		Find(&tags).Error

	return tags, err
}

// GetNodesByTagID returns all nodes with a specific tag.
func (r *Repository) GetNodesByTagID(tagID int64) ([]model.Node, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}

	var nodes []model.Node
	err := r.db.Table("node").
		Joins("JOIN node_tag_node ON node.id = node_tag_node.node_id").
		Where("node_tag_node.tag_id = ?", tagID).
		Order("node.inx ASC, node.id ASC").
		Find(&nodes).Error

	return nodes, err
}

// GetNodeTagCount returns the number of nodes with a specific tag.
func (r *Repository) GetNodeTagCount(tagID int64) (int64, error) {
	if r == nil || r.db == nil {
		return 0, errors.New("repository not initialized")
	}

	var count int64
	err := r.db.Model(&model.NodeTagNode{}).Where("tag_id = ?", tagID).Count(&count).Error
	return count, err
}

// GetNodeTagNode returns the junction record for a node-tag pair.
func (r *Repository) GetNodeTagNode(nodeID, tagID int64) (*model.NodeTagNode, error) {
	if r == nil || r.db == nil {
		return nil, errors.New("repository not initialized")
	}

	var relation model.NodeTagNode
	err := r.db.Where("node_id = ? AND tag_id = ?", nodeID, tagID).First(&relation).Error
	if err != nil {
		return nil, err
	}

	return &relation, nil
}
