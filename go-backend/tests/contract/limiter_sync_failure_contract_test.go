package contract_test

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"go-backend/internal/auth"
	"go-backend/internal/http/response"
	"go-backend/internal/security"
)

func TestForwardCreateRollbackWhenLimiterDispatchFailsContract(t *testing.T) {
	secret := "contract-jwt-secret"
	router, r := setupContractRouter(t, secret)
	server := httptest.NewServer(router)
	defer server.Close()

	adminToken, err := auth.GenerateToken(1, "admin_user", 0, secret)
	if err != nil {
		t.Fatalf("generate admin token: %v", err)
	}

	now := time.Now().UnixMilli()
	if err := r.DB().Exec(`
		INSERT INTO tunnel(name, traffic_ratio, type, protocol, flow, created_time, updated_time, status, in_ip, inx)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, "limiter-fail-tunnel", 1.0, 1, "tls", 99999, now, now, 1, nil, 0).Error; err != nil {
		t.Fatalf("insert tunnel: %v", err)
	}
	tunnelID := mustLastInsertID(t, r, "limiter-fail-tunnel")

	if err := r.DB().Exec(`
		INSERT INTO node(name, secret, server_ip, server_ip_v4, server_ip_v6, port, interface_name, version, http, tls, socks, created_time, updated_time, status, tcp_listen_addr, udp_listen_addr, inx)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, "limiter-fail-node", "limiter-fail-secret", "10.20.0.1", "10.20.0.1", "", "32000-32010", "", "v1", 1, 1, 1, now, now, 1, "[::]", "[::]", 0).Error; err != nil {
		t.Fatalf("insert node: %v", err)
	}
	nodeID := mustLastInsertID(t, r, "limiter-fail-node")

	if err := r.DB().Exec(`
		INSERT INTO chain_tunnel(tunnel_id, chain_type, node_id, port, strategy, inx, protocol)
		VALUES(?, 1, ?, 32001, 'round', 1, 'tls')
	`, tunnelID, nodeID).Error; err != nil {
		t.Fatalf("insert chain_tunnel: %v", err)
	}

	if err := r.DB().Exec(`
		INSERT INTO speed_limit(name, speed, tunnel_id, tunnel_name, created_time, updated_time, status)
		VALUES(?, ?, NULL, NULL, ?, NULL, ?)
	`, "limiter-fail-rule", 1024, now, 1).Error; err != nil {
		t.Fatalf("insert speed limit: %v", err)
	}
	speedID := mustLastInsertID(t, r, "limiter-fail-rule")

	stopNode := startMockNodeSessionWithCommandFailures(t, server.URL, "limiter-fail-secret", map[string]string{
		"addlimiters": "mock add limiters failed",
	})
	defer stopNode()

	payload := map[string]interface{}{
		"name":       "limiter-fail-forward",
		"tunnelId":   tunnelID,
		"remoteAddr": "1.1.1.1:443",
		"strategy":   "fifo",
		"speedId":    speedID,
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/forward/create", bytes.NewReader(body))
	req.Header.Set("Authorization", adminToken)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	var out response.R
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.Code == 0 {
		t.Fatalf("expected create failure on limiter dispatch, got code=0")
	}

	forwardCount := mustQueryInt(t, r, `SELECT COUNT(1) FROM forward WHERE name = ?`, "limiter-fail-forward")
	if forwardCount != 0 {
		t.Fatalf("expected forward rollback delete on limiter failure, got count=%d", forwardCount)
	}
}

func TestForwardCreateRollbackWhenServiceDispatchReturnsAddressInUseContract(t *testing.T) {
	secret := "contract-jwt-secret"
	router, r := setupContractRouter(t, secret)
	server := httptest.NewServer(router)
	defer server.Close()

	adminToken, err := auth.GenerateToken(1, "admin_user", 0, secret)
	if err != nil {
		t.Fatalf("generate admin token: %v", err)
	}

	now := time.Now().UnixMilli()
	if err := r.DB().Exec(`
		INSERT INTO tunnel(name, traffic_ratio, type, protocol, flow, created_time, updated_time, status, in_ip, inx)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, "addr-in-use-tunnel", 1.0, 1, "tls", 99999, now, now, 1, nil, 0).Error; err != nil {
		t.Fatalf("insert tunnel: %v", err)
	}
	tunnelID := mustLastInsertID(t, r, "addr-in-use-tunnel")

	if err := r.DB().Exec(`
		INSERT INTO node(name, secret, server_ip, server_ip_v4, server_ip_v6, port, interface_name, version, http, tls, socks, created_time, updated_time, status, tcp_listen_addr, udp_listen_addr, inx)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, "addr-in-use-node", "addr-in-use-secret", "10.20.0.11", "10.20.0.11", "", "32100-32110", "", "v1", 1, 1, 1, now, now, 1, "[::]", "[::]", 0).Error; err != nil {
		t.Fatalf("insert node: %v", err)
	}
	nodeID := mustLastInsertID(t, r, "addr-in-use-node")

	if err := r.DB().Exec(`
		INSERT INTO chain_tunnel(tunnel_id, chain_type, node_id, port, strategy, inx, protocol)
		VALUES(?, 1, ?, 32101, 'round', 1, 'tls')
	`, tunnelID, nodeID).Error; err != nil {
		t.Fatalf("insert chain_tunnel: %v", err)
	}

	stopNode := startMockNodeSessionWithCommandFailures(t, server.URL, "addr-in-use-secret", map[string]string{
		"updateservice": "listen tcp [::]:32101: bind: address already in use",
		"addservice":    "listen tcp [::]:32101: bind: address already in use",
	})
	defer stopNode()

	payload := map[string]interface{}{
		"name":       "addr-in-use-forward",
		"tunnelId":   tunnelID,
		"remoteAddr": "1.1.1.1:443",
		"strategy":   "fifo",
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/forward/create", bytes.NewReader(body))
	req.Header.Set("Authorization", adminToken)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	var out response.R
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.Code == 0 {
		t.Fatalf("expected create failure on address-in-use service dispatch, got code=0")
	}

	forwardCount := mustQueryInt(t, r, `SELECT COUNT(1) FROM forward WHERE name = ?`, "addr-in-use-forward")
	if forwardCount != 0 {
		t.Fatalf("expected forward rollback delete on address-in-use failure, got count=%d", forwardCount)
	}
}

func TestBatchAssignRollbackWhenLimiterDispatchFailsContract(t *testing.T) {
	secret := "contract-jwt-secret"
	router, r := setupContractRouter(t, secret)
	server := httptest.NewServer(router)
	defer server.Close()

	adminToken, err := auth.GenerateToken(1, "admin_user", 0, secret)
	if err != nil {
		t.Fatalf("generate admin token: %v", err)
	}

	now := time.Now().UnixMilli()
	if err := r.DB().Exec(`
		INSERT INTO user(id, user, pwd, role_id, exp_time, flow, in_flow, out_flow, flow_reset_time, num, created_time, updated_time, status)
		VALUES(2, 'assign_user', '3c85cdebade1c51cf64ca9f3c09d182d', 1, 2727251700000, 99999, 0, 0, 1, 99999, ?, ?, 1)
	`, now, now).Error; err != nil {
		t.Fatalf("insert user: %v", err)
	}

	if err := r.DB().Exec(`
		INSERT INTO tunnel(name, traffic_ratio, type, protocol, flow, created_time, updated_time, status, in_ip, inx)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, "assign-limiter-fail-tunnel", 1.0, 1, "tls", 99999, now, now, 1, nil, 0).Error; err != nil {
		t.Fatalf("insert tunnel: %v", err)
	}
	tunnelID := mustLastInsertID(t, r, "assign-limiter-fail-tunnel")

	if err := r.DB().Exec(`
		INSERT INTO node(name, secret, server_ip, server_ip_v4, server_ip_v6, port, interface_name, version, http, tls, socks, created_time, updated_time, status, tcp_listen_addr, udp_listen_addr, inx)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, "assign-limiter-fail-node", "assign-limiter-fail-secret", "10.21.0.1", "10.21.0.1", "", "33000-33010", "", "v1", 1, 1, 1, now, now, 1, "[::]", "[::]", 0).Error; err != nil {
		t.Fatalf("insert node: %v", err)
	}
	nodeID := mustLastInsertID(t, r, "assign-limiter-fail-node")

	if err := r.DB().Exec(`
		INSERT INTO chain_tunnel(tunnel_id, chain_type, node_id, port, strategy, inx, protocol)
		VALUES(?, 1, ?, 33001, 'round', 1, 'tls')
	`, tunnelID, nodeID).Error; err != nil {
		t.Fatalf("insert chain_tunnel: %v", err)
	}

	if err := r.DB().Exec(`
		INSERT INTO speed_limit(name, speed, tunnel_id, tunnel_name, created_time, updated_time, status)
		VALUES(?, ?, NULL, NULL, ?, NULL, ?)
	`, "assign-limiter-fail-rule", 2048, now, 1).Error; err != nil {
		t.Fatalf("insert speed limit: %v", err)
	}
	speedID := mustLastInsertID(t, r, "assign-limiter-fail-rule")

	if err := r.DB().Exec(`
		INSERT INTO user_tunnel(id, user_id, tunnel_id, speed_id, num, flow, in_flow, out_flow, flow_reset_time, exp_time, status)
		VALUES(21, 2, ?, NULL, 999, 99999, 0, 0, 1, 2727251700000, 1)
	`, tunnelID).Error; err != nil {
		t.Fatalf("insert user_tunnel: %v", err)
	}

	if err := r.DB().Exec(`
		INSERT INTO forward(user_id, user_name, name, tunnel_id, remote_addr, strategy, in_flow, out_flow, created_time, updated_time, status, inx)
		VALUES(2, 'assign_user', 'assign-limiter-fail-forward', ?, '9.9.9.9:53', 'fifo', 0, 0, ?, ?, 1, 0)
	`, tunnelID, now, now).Error; err != nil {
		t.Fatalf("insert forward: %v", err)
	}
	forwardID := mustLastInsertID(t, r, "assign-limiter-fail-forward")

	if err := r.DB().Exec(`INSERT INTO forward_port(forward_id, node_id, port) VALUES(?, ?, ?)`, forwardID, nodeID, 33001).Error; err != nil {
		t.Fatalf("insert forward_port: %v", err)
	}

	stopNode := startMockNodeSessionWithCommandFailures(t, server.URL, "assign-limiter-fail-secret", map[string]string{
		"addlimiters": "mock add limiters failed",
	})
	defer stopNode()

	assignPayload := map[string]interface{}{
		"userId": 2,
		"tunnels": []map[string]interface{}{{
			"tunnelId": tunnelID,
			"speedId":  speedID,
		}},
	}
	body, err := json.Marshal(assignPayload)
	if err != nil {
		t.Fatalf("marshal assign payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/tunnel/user/batch-assign", bytes.NewReader(body))
	req.Header.Set("Authorization", adminToken)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	var out response.R
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.Code == 0 {
		t.Fatalf("expected assign failure on limiter dispatch, got code=0")
	}

	var persistedSpeedID sql.NullInt64
	if err := r.DB().Raw(`SELECT speed_id FROM user_tunnel WHERE user_id = 2 AND tunnel_id = ?`, tunnelID).Row().Scan(&persistedSpeedID); err != nil {
		t.Fatalf("query user_tunnel speed_id: %v", err)
	}
	if persistedSpeedID.Valid {
		t.Fatalf("expected speed_id rollback to NULL, got %d", persistedSpeedID.Int64)
	}
}

func TestBatchAssignInsertRollbackWhenLimiterDispatchFailsContract(t *testing.T) {
	secret := "contract-jwt-secret"
	router, r := setupContractRouter(t, secret)
	server := httptest.NewServer(router)
	defer server.Close()

	adminToken, err := auth.GenerateToken(1, "admin_user", 0, secret)
	if err != nil {
		t.Fatalf("generate admin token: %v", err)
	}

	now := time.Now().UnixMilli()
	if err := r.DB().Exec(`
		INSERT INTO user(id, user, pwd, role_id, exp_time, flow, in_flow, out_flow, flow_reset_time, num, created_time, updated_time, status)
		VALUES(3, 'assign_insert_user', '3c85cdebade1c51cf64ca9f3c09d182d', 1, 2727251700000, 99999, 0, 0, 1, 99999, ?, ?, 1)
	`, now, now).Error; err != nil {
		t.Fatalf("insert user: %v", err)
	}

	if err := r.DB().Exec(`
		INSERT INTO tunnel(name, traffic_ratio, type, protocol, flow, created_time, updated_time, status, in_ip, inx)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, "assign-insert-limiter-fail-tunnel", 1.0, 1, "tls", 99999, now, now, 1, nil, 0).Error; err != nil {
		t.Fatalf("insert tunnel: %v", err)
	}
	tunnelID := mustLastInsertID(t, r, "assign-insert-limiter-fail-tunnel")

	if err := r.DB().Exec(`
		INSERT INTO node(name, secret, server_ip, server_ip_v4, server_ip_v6, port, interface_name, version, http, tls, socks, created_time, updated_time, status, tcp_listen_addr, udp_listen_addr, inx)
		VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, "assign-insert-limiter-fail-node", "assign-insert-limiter-fail-secret", "10.22.0.1", "10.22.0.1", "", "34000-34010", "", "v1", 1, 1, 1, now, now, 1, "[::]", "[::]", 0).Error; err != nil {
		t.Fatalf("insert node: %v", err)
	}
	nodeID := mustLastInsertID(t, r, "assign-insert-limiter-fail-node")

	if err := r.DB().Exec(`
		INSERT INTO chain_tunnel(tunnel_id, chain_type, node_id, port, strategy, inx, protocol)
		VALUES(?, 1, ?, 34001, 'round', 1, 'tls')
	`, tunnelID, nodeID).Error; err != nil {
		t.Fatalf("insert chain_tunnel: %v", err)
	}

	if err := r.DB().Exec(`
		INSERT INTO speed_limit(name, speed, tunnel_id, tunnel_name, created_time, updated_time, status)
		VALUES(?, ?, NULL, NULL, ?, NULL, ?)
	`, "assign-insert-limiter-fail-rule", 3072, now, 1).Error; err != nil {
		t.Fatalf("insert speed limit: %v", err)
	}
	speedID := mustLastInsertID(t, r, "assign-insert-limiter-fail-rule")

	if err := r.DB().Exec(`
		INSERT INTO forward(user_id, user_name, name, tunnel_id, remote_addr, strategy, in_flow, out_flow, created_time, updated_time, status, inx)
		VALUES(3, 'assign_insert_user', 'assign-insert-limiter-fail-forward', ?, '8.8.4.4:53', 'fifo', 0, 0, ?, ?, 1, 0)
	`, tunnelID, now, now).Error; err != nil {
		t.Fatalf("insert forward: %v", err)
	}
	forwardID := mustLastInsertID(t, r, "assign-insert-limiter-fail-forward")

	if err := r.DB().Exec(`INSERT INTO forward_port(forward_id, node_id, port) VALUES(?, ?, ?)`, forwardID, nodeID, 34001).Error; err != nil {
		t.Fatalf("insert forward_port: %v", err)
	}

	stopNode := startMockNodeSessionWithCommandFailures(t, server.URL, "assign-insert-limiter-fail-secret", map[string]string{
		"addlimiters": "mock add limiters failed",
	})
	defer stopNode()

	assignPayload := map[string]interface{}{
		"userId": 3,
		"tunnels": []map[string]interface{}{{
			"tunnelId": tunnelID,
			"speedId":  speedID,
		}},
	}
	body, err := json.Marshal(assignPayload)
	if err != nil {
		t.Fatalf("marshal assign payload: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/tunnel/user/batch-assign", bytes.NewReader(body))
	req.Header.Set("Authorization", adminToken)
	req.Header.Set("Content-Type", "application/json")
	res := httptest.NewRecorder()
	router.ServeHTTP(res, req)

	var out response.R
	if err := json.NewDecoder(res.Body).Decode(&out); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if out.Code == 0 {
		t.Fatalf("expected assign(insert) failure on limiter dispatch, got code=0")
	}

	insertedCount := mustQueryInt(t, r, `SELECT COUNT(1) FROM user_tunnel WHERE user_id = 3 AND tunnel_id = ?`, tunnelID)
	if insertedCount != 0 {
		t.Fatalf("expected inserted user_tunnel rollback delete, got count=%d", insertedCount)
	}
}

func startMockNodeSessionWithCommandFailures(t *testing.T, baseURL string, nodeSecret string, failCommands map[string]string) func() {
	t.Helper()

	u, err := url.Parse(baseURL)
	if err != nil {
		t.Fatalf("parse provider url: %v", err)
	}
	if strings.EqualFold(u.Scheme, "https") {
		u.Scheme = "wss"
	} else {
		u.Scheme = "ws"
	}
	u.Path = "/system-info"
	q := u.Query()
	q.Set("type", "1")
	q.Set("secret", nodeSecret)
	q.Set("version", "v1")
	q.Set("http", "1")
	q.Set("tls", "1")
	q.Set("socks", "1")
	u.RawQuery = q.Encode()

	conn, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		t.Fatalf("dial mock node websocket: %v", err)
	}

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			_, raw, readErr := conn.ReadMessage()
			if readErr != nil {
				return
			}

			plain := raw
			var wrap struct {
				Encrypted bool   `json:"encrypted"`
				Data      string `json:"data"`
			}
			if err := json.Unmarshal(raw, &wrap); err == nil && wrap.Encrypted && strings.TrimSpace(wrap.Data) != "" {
				crypto, cryptoErr := security.NewAESCrypto(nodeSecret)
				if cryptoErr == nil {
					if dec, decErr := crypto.Decrypt(wrap.Data); decErr == nil {
						plain = []byte(dec)
					}
				}
			}

			var cmd struct {
				Type      string `json:"type"`
				RequestID string `json:"requestId"`
			}
			if err := json.Unmarshal(plain, &cmd); err != nil {
				continue
			}
			if strings.TrimSpace(cmd.RequestID) == "" {
				continue
			}

			cmdType := strings.TrimSpace(cmd.Type)
			failMsg, shouldFail := failCommands[strings.ToLower(cmdType)]

			respType := fmt.Sprintf("%sResponse", cmdType)
			respPayload := map[string]interface{}{
				"type":      respType,
				"success":   !shouldFail,
				"message":   "OK",
				"requestId": cmd.RequestID,
			}
			if shouldFail {
				if strings.TrimSpace(failMsg) == "" {
					failMsg = "mock command failed"
				}
				respPayload["message"] = failMsg
			}

			respBytes, err := json.Marshal(respPayload)
			if err != nil {
				continue
			}
			_ = conn.WriteMessage(websocket.TextMessage, respBytes)
		}
	}()

	var stopOnce sync.Once
	return func() {
		stopOnce.Do(func() {
			_ = conn.Close()
			wg.Wait()
		})
	}
}
