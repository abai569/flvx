with open(
    "C:/Users/57064/flvx/go-backend/internal/http/handler/upgrade.go",
    "r",
    encoding="utf-8",
) as f:
    content = f.read()

old_code = """func (h *Handler) onNodeOnline(nodeID int64) {
	// 节点上线时重置流量
	h.sendNodeCommandWithTimeout(
		nodeID,
		"ResetTraffic",
		map[string]interface{}{
			"reason": "节点上线",
			"nodeId": nodeID,
		},
		10*time.Second,
		false,
		false,
	)

	if !h.consumeNodePendingUpgradeRedeploy(nodeID) {
		return
	}
	h.redeployNodeRuntimeAfterUpgrade(nodeID)
}"""

new_code = """func (h *Handler) onNodeOnline(nodeID int64) {
	// 只在 install.sh 中安装时重置流量
	// 节点重启上线不重置流量
	
	if !h.consumeNodePendingUpgradeRedeploy(nodeID) {
		return
	}
	h.redeployNodeRuntimeAfterUpgrade(nodeID)
}"""

content = content.replace(old_code, new_code)

with open(
    "C:/Users/57064/flvx/go-backend/internal/http/handler/upgrade.go",
    "w",
    encoding="utf-8",
) as f:
    f.write(content)

print("Done")
