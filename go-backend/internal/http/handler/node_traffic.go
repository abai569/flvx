package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"go-backend/internal/http/response"
	"go-backend/internal/store/repo"
)

type nodeBatchResetTrafficRequest struct {
	NodeIDs []int64 `json:"nodeIds"`
	Reason  string  `json:"reason"`
}

type nodeBatchResetTrafficResult struct {
	NodeID   int64  `json:"nodeId"`
	NodeName string `json:"nodeName,omitempty"`
	Success  bool   `json:"success"`
	Error    string `json:"error,omitempty"`
}

func (h *Handler) nodeBatchResetTraffic(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}

	var req nodeBatchResetTrafficRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.WriteJSON(w, response.Err(-1, "无效的请求数据"))
		return
	}

	if len(req.NodeIDs) == 0 {
		response.WriteJSON(w, response.Err(-1, "请选择至少一个节点"))
		return
	}

	actorUserID, _, err := userRoleFromRequest(r)
	if err != nil {
		response.WriteJSON(w, response.Err(401, "无效的 token 或 token 已过期"))
		return
	}

	actorUserName := h.repo.GetUsernameByID(actorUserID)

	results := make([]nodeBatchResetTrafficResult, 0, len(req.NodeIDs))

	for _, nodeID := range req.NodeIDs {
		result := nodeBatchResetTrafficResult{
			NodeID:  nodeID,
			Success: false,
		}

		node, err := h.repo.GetNodeByID(nodeID)
		if err != nil {
			result.Error = "节点不存在"
			results = append(results, result)
			continue
		}

		cmdResult, err := h.sendNodeCommandWithTimeout(
			nodeID,
			"ResetTraffic",
			map[string]interface{}{
				"reason": req.Reason,
				"nodeId": nodeID,
			},
			10*time.Second,
			false,
			false,
		)

		if err != nil {
			result.Error = err.Error()
			results = append(results, result)
			continue
		}

		if !cmdResult.Success {
			result.Error = cmdResult.Message
			results = append(results, result)
			continue
		}

		if err := h.repo.CreateNodeTrafficResetLog(&repo.NodeTrafficResetLogCreateParams{
			NodeID:       nodeID,
			NodeName:     node.Name,
			ResetTime:    time.Now().UnixMilli(),
			OperatorID:   actorUserID,
			OperatorName: actorUserName,
			Reason:       req.Reason,
		}); err != nil {
			result.Error = "重置成功但记录日志失败：" + err.Error()
			results = append(results, result)
			continue
		}

		result.Success = true
		result.NodeName = node.Name
		results = append(results, result)
	}

	response.WriteJSON(w, response.OK(results))
}
