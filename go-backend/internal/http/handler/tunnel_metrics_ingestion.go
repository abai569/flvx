package handler

import (
	"log"
	"strings"
	"time"

	"go-backend/internal/store/model"
)

type tunnelTrafficDelta struct {
	bytesIn  int64
	bytesOut int64
}

func unixMilliBucketMinute(nowMs int64) int64 {
	if nowMs <= 0 {
		return 0
	}
	const minuteMs = int64(time.Minute / time.Millisecond)
	return nowMs - (nowMs % minuteMs)
}

func (h *Handler) recordTunnelMetricsFromFlowItems(nodeID int64, items []flowItem, nowMs int64) {
	if h == nil || h.repo == nil {
		return
	}
	if nodeID <= 0 || len(items) == 0 {
		return
	}

	bucketTs := unixMilliBucketMinute(nowMs)
	if bucketTs <= 0 {
		return
	}

	forwardDeltas := make(map[int64]tunnelTrafficDelta)
	for _, item := range items {
		name := strings.TrimSpace(item.N)
		if name == "" || name == "web_api" {
			continue
		}
		forwardID, _, _, ok := parseFlowServiceIDs(name)
		if !ok {
			continue
		}
		if item.D == 0 && item.U == 0 {
			continue
		}
		d := forwardDeltas[forwardID]
		d.bytesIn += item.D
		d.bytesOut += item.U
		forwardDeltas[forwardID] = d
	}
	if len(forwardDeltas) == 0 {
		return
	}

	forwardIDs := make([]int64, 0, len(forwardDeltas))
	for id := range forwardDeltas {
		forwardIDs = append(forwardIDs, id)
	}

	forwardTunnelMap, err := h.repo.MapForwardIDsToTunnelIDs(forwardIDs)
	if err != nil {
		log.Printf("monitoring write skipped op=tunnel_metric.map_forward_to_tunnel node_id=%d err=%v", nodeID, err)
		return
	}
	if len(forwardTunnelMap) == 0 {
		return
	}

	tunnelAgg := make(map[int64]tunnelTrafficDelta)
	for forwardID, delta := range forwardDeltas {
		tunnelID := forwardTunnelMap[forwardID]
		if tunnelID <= 0 {
			continue
		}
		a := tunnelAgg[tunnelID]
		a.bytesIn += delta.bytesIn
		a.bytesOut += delta.bytesOut
		tunnelAgg[tunnelID] = a
	}
	if len(tunnelAgg) == 0 {
		return
	}

	metrics := make([]*model.TunnelMetric, 0, len(tunnelAgg))
	for tunnelID, delta := range tunnelAgg {
		if delta.bytesIn == 0 && delta.bytesOut == 0 {
			continue
		}
		metrics = append(metrics, &model.TunnelMetric{
			TunnelID:     tunnelID,
			NodeID:       nodeID,
			Timestamp:    bucketTs,
			BytesIn:      delta.bytesIn,
			BytesOut:     delta.bytesOut,
			Connections:  0,
			Errors:       0,
			AvgLatencyMs: 0,
		})
	}
	if len(metrics) == 0 {
		return
	}

	if err := h.repo.UpsertTunnelMetricBuckets(metrics); err != nil {
		log.Printf("monitoring write failed op=tunnel_metric.upsert_buckets node_id=%d bucket_ts=%d count=%d err=%v", nodeID, bucketTs, len(metrics), err)
	}
}
