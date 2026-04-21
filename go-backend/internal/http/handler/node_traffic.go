package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"go-backend/internal/http/response"
)

// nodeBatchResetTraffic 批量重置节点流量
func (h *Handler) nodeBatchResetTraffic(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		response.WriteJSON(w, response.ErrDefault("请求失败"))
		return
	}

	var req struct {
		NodeIDs []int64 `json:"nodeIds"`
		Reason  string  `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.WriteJSON(w, response.Err(-1, "无效的请求数据"))
		return
	}

	if len(req.NodeIDs) == 0 {
		response.WriteJSON(w, response.Err(-1, "请选择至少一个节点"))
		return
	}

	results := make([]map[string]interface{}, 0, len(req.NodeIDs))

	for _, nodeID := range req.NodeIDs {
		result := map[string]interface{}{
			"nodeId":  nodeID,
			"success": false,
		}

		// 获取节点信息
		node, err := h.repo.GetNodeByID(nodeID)
		if err != nil {
			result["error"] = "节点不存在"
			results = append(results, result)
			continue
		}

		// 发送重置命令
		cmdResult, err := h.sendNodeCommandWithTimeout(
			nodeID,
			"ResetTraffic",
			map[string]interface{}{
				"reason": req.Reason,
				"nodeId": nodeID, // 传入节点 ID，用于首次初始化
			},
			10*time.Second,
			false,
			false,
		)

		if err != nil {
			result["error"] = err.Error()
			results = append(results, result)
			continue
		}

		if !cmdResult.Success {
			result["error"] = cmdResult.Message
			results = append(results, result)
			continue
		}

		result["success"] = true
		result["nodeName"] = node.Name
		results = append(results, result)
	}

	response.WriteJSON(w, response.OK(results))
}
