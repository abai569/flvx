package stats

import (
	"time"
)

// BandwidthCalculator 带宽计算器
type BandwidthCalculator struct {
	interval time.Duration
	stopChan chan struct{}
}

// NewBandwidthCalculator 创建带宽计算器
func NewBandwidthCalculator(interval time.Duration) *BandwidthCalculator {
	return &BandwidthCalculator{
		interval: interval,
		stopChan: make(chan struct{}),
	}
}

// Start 启动带宽计算协程
func (c *BandwidthCalculator) Start(manager *ForwardStatsManager) {
	go func() {
		ticker := time.NewTicker(c.interval)
		defer ticker.Stop()

		// 保存上一次的流量值用于计算速度
		prevStats := make(map[int64]struct {
			inBytes  uint64
			outBytes uint64
			time     time.Time
		})

		for {
			select {
			case <-ticker.C:
				c.calculate(manager, prevStats)
			case <-c.stopChan:
				return
			}
		}
	}()
}

// Stop 停止带宽计算器
func (c *BandwidthCalculator) Stop() {
	close(c.stopChan)
}

// calculate 计算所有转发规则的实时带宽
func (c *BandwidthCalculator) calculate(manager *ForwardStatsManager, prev map[int64]struct {
	inBytes  uint64
	outBytes uint64
	time     time.Time
}) {
	manager.mu.RLock()
	defer manager.mu.RUnlock()

	now := time.Now()

	for id, stats := range manager.stats {
		stats.mu.Lock()

		if _, exists := prev[id]; !exists {
			// 第一次计算，保存基准值
			prev[id] = struct {
				inBytes  uint64
				outBytes uint64
				time     time.Time
			}{
				inBytes:  stats.InBytes,
				outBytes: stats.OutBytes,
				time:     now,
			}
			stats.mu.Unlock()
			continue
		}

		// 计算带宽速度 (bytes/s)
		delta := now.Sub(prev[id].time).Seconds()
		if delta > 0 {
			// 计算增量
			inDelta := int64(stats.InBytes - prev[id].inBytes)
			outDelta := int64(stats.OutBytes - prev[id].outBytes)

			// 防止负数（计数器回滚等情况）
			if inDelta < 0 {
				inDelta = 0
			}
			if outDelta < 0 {
				outDelta = 0
			}

			stats.InSpeed = uint64(float64(inDelta) / delta)
			stats.OutSpeed = uint64(float64(outDelta) / delta)
		}

		// 更新前值
		prev[id] = struct {
			inBytes  uint64
			outBytes uint64
			time     time.Time
		}{
			inBytes:  stats.InBytes,
			outBytes: stats.OutBytes,
			time:     now,
		}

		stats.mu.Unlock()
	}

	// 清理 prev 中不存在的转发规则
	for id := range prev {
		if _, exists := manager.stats[id]; !exists {
			delete(prev, id)
		}
	}
}
