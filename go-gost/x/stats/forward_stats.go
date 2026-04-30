package stats

import (
	"sync"
	"time"
)

// ForwardStats 单个转发规则的流量统计
type ForwardStats struct {
	ForwardID   int64     `json:"forward_id"`
	UserID      int64     `json:"user_id"`
	TunnelID    int64     `json:"tunnel_id"`
	ServiceName string    `json:"service_name"` // 服务名称
	InBytes     uint64    `json:"in_bytes"`     // 累计上行字节
	OutBytes    uint64    `json:"out_bytes"`    // 累计下行字节
	InSpeed     uint64    `json:"in_speed"`     // 实时上行速度 (bytes/s)
	OutSpeed    uint64    `json:"out_speed"`    // 实时下行速度 (bytes/s)
	Connections int       `json:"connections"`  // 当前连接数
	LastUpdate  time.Time `json:"last_update"`  // 最后更新时间
	mu          sync.RWMutex
}

// ForwardMetric WebSocket 推送的指标格式
type ForwardMetric struct {
	ForwardID   int64  `json:"forward_id"`
	UserID      int64  `json:"user_id"`
	TunnelID    int64  `json:"tunnel_id"`
	ServiceName string `json:"service_name"` // 服务名称
	InSpeed     uint64 `json:"in_speed"`
	OutSpeed    uint64 `json:"out_speed"`
	Connections int    `json:"connections"`
}

// ForwardStatsManager 管理所有转发规则的统计
type ForwardStatsManager struct {
	stats map[int64]*ForwardStats // forwardID -> stats
	mu    sync.RWMutex
}

// NewForwardStatsManager 创建流量统计管理器
func NewForwardStatsManager() *ForwardStatsManager {
	return &ForwardStatsManager{
		stats: make(map[int64]*ForwardStats),
	}
}

// GetOrCreate 获取或创建转发规则统计
func (m *ForwardStatsManager) GetOrCreate(forwardID, userID, tunnelID int64, serviceName string) *ForwardStats {
	m.mu.RLock()
	stats, ok := m.stats[forwardID]
	m.mu.RUnlock()

	if !ok {
		stats = &ForwardStats{
			ForwardID:   forwardID,
			UserID:      userID,
			TunnelID:    tunnelID,
			ServiceName: serviceName,
			LastUpdate:  time.Now(),
		}
		m.mu.Lock()
		m.stats[forwardID] = stats
		m.mu.Unlock()
	}

	return stats
}

// GetOrCreateByServiceName 通过服务名称获取或创建统计
func (m *ForwardStatsManager) GetOrCreateByServiceName(serviceName string, forwardID, userID, tunnelID int64) *ForwardStats {
	return m.GetOrCreate(forwardID, userID, tunnelID, serviceName)
}

// AddTraffic 添加流量统计
func (m *ForwardStatsManager) AddTraffic(forwardID, userID, tunnelID int64, serviceName string, isInbound bool, bytes uint64) {
	stats := m.GetOrCreate(forwardID, userID, tunnelID, serviceName)

	stats.mu.Lock()
	if isInbound {
		stats.InBytes += bytes
	} else {
		stats.OutBytes += bytes
	}
	stats.LastUpdate = time.Now()
	stats.mu.Unlock()
}

// AddTrafficByServiceName 通过服务名称添加流量统计
func (m *ForwardStatsManager) AddTrafficByServiceName(serviceName string, forwardID, userID, tunnelID int64, isInbound bool, bytes uint64) {
	m.AddTraffic(forwardID, userID, tunnelID, serviceName, isInbound, bytes)
}

// AddConnection 添加连接数
func (m *ForwardStatsManager) AddConnection(forwardID, userID, tunnelID int64, serviceName string, delta int) {
	stats := m.GetOrCreate(forwardID, userID, tunnelID, serviceName)

	stats.mu.Lock()
	stats.Connections += delta
	if stats.Connections < 0 {
		stats.Connections = 0
	}
	stats.LastUpdate = time.Now()
	stats.mu.Unlock()
}

// AddConnectionByServiceName 通过服务名称添加连接数
func (m *ForwardStatsManager) AddConnectionByServiceName(serviceName string, forwardID, userID, tunnelID int64, delta int) {
	m.AddConnection(forwardID, userID, tunnelID, serviceName, delta)
}

// GetForwardMetrics 获取所有转发规则的指标（用于 WebSocket 推送）
func (m *ForwardStatsManager) GetForwardMetrics() []ForwardMetric {
	m.mu.RLock()
	defer m.mu.RUnlock()

	metrics := make([]ForwardMetric, 0, len(m.stats))
	for _, stats := range m.stats {
		stats.mu.RLock()
		metrics = append(metrics, ForwardMetric{
			ForwardID:   stats.ForwardID,
			UserID:      stats.UserID,
			TunnelID:    stats.TunnelID,
			ServiceName: stats.ServiceName,
			InSpeed:     stats.InSpeed,
			OutSpeed:    stats.OutSpeed,
			Connections: stats.Connections,
		})
		stats.mu.RUnlock()
	}

	return metrics
}

// GetMetric 获取指定转发规则的指标
func (m *ForwardStatsManager) GetMetric(forwardID int64) *ForwardMetric {
	m.mu.RLock()
	defer m.mu.RUnlock()

	stats, ok := m.stats[forwardID]
	if !ok {
		return nil
	}

	stats.mu.RLock()
	defer stats.mu.RUnlock()

	return &ForwardMetric{
		ForwardID:   stats.ForwardID,
		UserID:      stats.UserID,
		TunnelID:    stats.TunnelID,
		ServiceName: stats.ServiceName,
		InSpeed:     stats.InSpeed,
		OutSpeed:    stats.OutSpeed,
		Connections: stats.Connections,
	}
}

// CleanupStale 清理过期的统计（超过 timeout 时间无更新）
func (m *ForwardStatsManager) CleanupStale(timeout time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()

	now := time.Now()
	for id, stats := range m.stats {
		stats.mu.RLock()
		stale := now.Sub(stats.LastUpdate) > timeout
		stats.mu.RUnlock()

		if stale {
			delete(m.stats, id)
		}
	}
}

// Count 返回统计的转发规则数量
func (m *ForwardStatsManager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.stats)
}
