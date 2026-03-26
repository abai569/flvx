package handler

import (
	"net/http"

	"go-backend/internal/http/response"
	"go-backend/internal/store/repo"
)

// NodeGroupHandler handles node group CRUD requests.
type NodeGroupHandler struct {
	repo *repo.Repository
}

func NewNodeGroupHandler(repo *repo.Repository) *NodeGroupHandler {
	return &NodeGroupHandler{repo: repo}
}

// list handles POST /api/v1/node-group/list
func (h *NodeGroupHandler) list(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}

	groups, err := h.repo.ListNodeGroups()
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}

	// Add node count to each group
	type GroupWithCount struct {
		ID          int64  `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description"`
		Color       string `json:"color"`
		Inx         int    `json:"inx"`
		CreatedTime int64  `json:"createdTime"`
		UpdatedTime *int64 `json:"updatedTime"`
		NodeCount   int64  `json:"nodeCount"`
	}

	result := make([]GroupWithCount, 0, len(groups))
	for _, g := range groups {
		count, _ := h.repo.GetNodeGroupCount(g.ID)
		desc := ""
		if g.Description.Valid {
			desc = g.Description.String
		}
		var updatedTime *int64
		if g.UpdatedTime.Valid {
			updatedTime = &g.UpdatedTime.Int64
		}
		result = append(result, GroupWithCount{
			ID:          g.ID,
			Name:        g.Name,
			Description: desc,
			Color:       g.Color,
			Inx:         g.Inx,
			CreatedTime: g.CreatedTime,
			UpdatedTime: updatedTime,
			NodeCount:   count,
		})
	}

	response.WriteJSON(w, response.OK(result))
}

// create handles POST /api/v1/node-group/create
func (h *NodeGroupHandler) create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}

	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Color       string `json:"color"`
		Inx         int    `json:"inx"`
	}

	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}

	if req.Name == "" {
		response.WriteJSON(w, response.ErrDefault("分组名称不能为空"))
		return
	}

	if req.Color == "" {
		req.Color = "#3b82f6"
	}

	group, err := h.repo.CreateNodeGroup(req.Name, req.Description, req.Color, req.Inx)
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}

	response.WriteJSON(w, response.OK(group))
}

// update handles POST /api/v1/node-group/update
func (h *NodeGroupHandler) update(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}

	var req struct {
		ID          int64  `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description"`
		Color       string `json:"color"`
		Inx         int    `json:"inx"`
	}

	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}

	if req.ID <= 0 {
		response.WriteJSON(w, response.ErrDefault("分组 ID 无效"))
		return
	}

	if req.Name == "" {
		response.WriteJSON(w, response.ErrDefault("分组名称不能为空"))
		return
	}

	if req.Color == "" {
		req.Color = "#3b82f6"
	}

	if err := h.repo.UpdateNodeGroup(req.ID, req.Name, req.Description, req.Color, req.Inx); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}

	response.WriteJSON(w, response.OKEmpty())
}

// delete handles POST /api/v1/node-group/delete
func (h *NodeGroupHandler) delete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}

	var req struct {
		ID int64 `json:"id"`
	}

	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}

	if req.ID <= 0 {
		response.WriteJSON(w, response.ErrDefault("分组 ID 无效"))
		return
	}

	if err := h.repo.DeleteNodeGroup(req.ID); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}

	response.WriteJSON(w, response.OKEmpty())
}

// assign handles POST /api/v1/node-group/assign
func (h *NodeGroupHandler) assign(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}

	var req struct {
		NodeID  int64  `json:"nodeId"`
		GroupID *int64 `json:"groupId"`
	}

	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}

	if req.NodeID <= 0 {
		response.WriteJSON(w, response.ErrDefault("节点 ID 无效"))
		return
	}

	if err := h.repo.AssignNodeToGroup(&req.NodeID, req.GroupID); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}

	response.WriteJSON(w, response.OKEmpty())
}
