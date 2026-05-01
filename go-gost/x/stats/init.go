package stats

import (
	"time"
)

var (
	// GlobalForwardStatsManager 全局转发规则流量统计管理器
	GlobalForwardStatsManager *ForwardStatsManager

	// GlobalBandwidthCalculator 全局带宽计算器
	GlobalBandwidthCalculator *BandwidthCalculator
)

// Init 初始化流量统计系统
func Init() {
	GlobalForwardStatsManager = NewForwardStatsManager()
	GlobalBandwidthCalculator = NewBandwidthCalculator(time.Second)
	GlobalBandwidthCalculator.Start(GlobalForwardStatsManager)

	// 启动清理协程（每 5 分钟清理一次过期统计）
	go cleanupStaleStats(5 * time.Minute)
}

// cleanupStaleStats 定期清理过期统计
func cleanupStaleStats(interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for range ticker.C {
		if GlobalForwardStatsManager != nil {
			GlobalForwardStatsManager.CleanupStale(5 * time.Minute)
		}
	}
}

// GetForwardStatsManager 获取全局流量统计管理器
func GetForwardStatsManager() *ForwardStatsManager {
	return GlobalForwardStatsManager
}

// AddForwardTraffic 添加转发流量（便捷函数）
func AddForwardTraffic(forwardID, userID, tunnelID int64, serviceName string, nodeID int64, port int, isInbound bool, bytes uint64) {
	if GlobalForwardStatsManager != nil {
		GlobalForwardStatsManager.AddTraffic(forwardID, userID, tunnelID, serviceName, nodeID, port, isInbound, bytes)
	}
}

// AddForwardTrafficByService 通过服务名称添加转发流量（便捷函数）
func AddForwardTrafficByService(serviceName string, forwardID, userID, tunnelID int64, nodeID int64, port int, isInbound bool, bytes uint64) {
	AddForwardTraffic(forwardID, userID, tunnelID, serviceName, nodeID, port, isInbound, bytes)
}

// AddForwardConnection 添加转发连接数（便捷函数）
func AddForwardConnection(forwardID, userID, tunnelID int64, serviceName string, nodeID int64, port int, delta int) {
	if GlobalForwardStatsManager != nil {
		GlobalForwardStatsManager.AddConnection(forwardID, userID, tunnelID, serviceName, nodeID, port, delta)
	}
}

// AddForwardConnectionByService 通过服务名称添加转发连接数（便捷函数）
func AddForwardConnectionByService(serviceName string, forwardID, userID, tunnelID int64, nodeID int64, port int, delta int) {
	AddForwardConnection(forwardID, userID, tunnelID, serviceName, nodeID, port, delta)
}

// GetForwardMetrics 获取所有转发规则指标（便捷函数）
func GetForwardMetrics() []ForwardMetric {
	if GlobalForwardStatsManager == nil {
		return nil
	}
	return GlobalForwardStatsManager.GetForwardMetrics()
}
