package handler

import (
	"net/http"

	"go-backend/internal/http/response"
	"go-backend/internal/store/repo"
)

// NodeTagHandler handles node tag CRUD requests.
type NodeTagHandler struct {
	repo *repo.Repository
}

func NewNodeTagHandler(repo *repo.Repository) *NodeTagHandler {
	return &NodeTagHandler{repo: repo}
}

// list handles POST /api/v1/node-tag/list
func (h *NodeTagHandler) list(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}

	tags, err := h.repo.ListNodeTags()
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}

	// Add node count to each tag
	type TagWithCount struct {
		ID          int64  `json:"id"`
		Name        string `json:"name"`
		Color       string `json:"color"`
		CreatedTime int64  `json:"createdTime"`
		NodeCount   int64  `json:"nodeCount"`
	}

	result := make([]TagWithCount, 0, len(tags))
	for _, t := range tags {
		count, _ := h.repo.GetNodeTagCount(t.ID)
		result = append(result, TagWithCount{
			ID:          t.ID,
			Name:        t.Name,
			Color:       t.Color,
			CreatedTime: t.CreatedTime,
			NodeCount:   count,
		})
	}

	response.WriteJSON(w, response.OK(result))
}

// create handles POST /api/v1/node-tag/create
func (h *NodeTagHandler) create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}

	var req struct {
		Name  string `json:"name"`
		Color string `json:"color"`
	}

	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}

	if req.Name == "" {
		response.WriteJSON(w, response.ErrDefault("标签名称不能为空"))
		return
	}

	if req.Color == "" {
		req.Color = "#6b7280"
	}

	tag, err := h.repo.CreateNodeTag(req.Name, req.Color)
	if err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}

	response.WriteJSON(w, response.OK(tag))
}

// update handles POST /api/v1/node-tag/update
func (h *NodeTagHandler) update(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}

	var req struct {
		ID    int64  `json:"id"`
		Name  string `json:"name"`
		Color string `json:"color"`
	}

	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}

	if req.ID <= 0 {
		response.WriteJSON(w, response.ErrDefault("标签 ID 无效"))
		return
	}

	if req.Name == "" {
		response.WriteJSON(w, response.ErrDefault("标签名称不能为空"))
		return
	}

	if req.Color == "" {
		req.Color = "#6b7280"
	}

	if err := h.repo.UpdateNodeTag(req.ID, req.Name, req.Color); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}

	response.WriteJSON(w, response.OKEmpty())
}

// delete handles POST /api/v1/node-tag/delete
func (h *NodeTagHandler) delete(w http.ResponseWriter, r *http.Request) {
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
		response.WriteJSON(w, response.ErrDefault("标签 ID 无效"))
		return
	}

	if err := h.repo.DeleteNodeTag(req.ID); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}

	response.WriteJSON(w, response.OKEmpty())
}

// assign handles POST /api/v1/node-tag/assign
func (h *NodeTagHandler) assign(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}

	var req struct {
		NodeID int64   `json:"nodeId"`
		TagIDs []int64 `json:"tagIds"`
	}

	if err := decodeJSON(r.Body, &req); err != nil {
		response.WriteJSON(w, response.ErrDefault("请求参数错误"))
		return
	}

	if req.NodeID <= 0 {
		response.WriteJSON(w, response.ErrDefault("节点 ID 无效"))
		return
	}

	if err := h.repo.AssignTagsToNode(req.NodeID, req.TagIDs); err != nil {
		response.WriteJSON(w, response.Err(-2, err.Error()))
		return
	}

	response.WriteJSON(w, response.OKEmpty())
}
