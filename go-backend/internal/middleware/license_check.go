package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"sync"
	"time"
)

// LicenseVerifier handles license verification with remote server
type LicenseVerifier struct {
	serverURL  string
	licenseKey string
	domain     string
	httpClient *http.Client
}

// VerifyRequest is the request body for license verification
type VerifyRequest struct {
	LicenseKey string `json:"license_key"`
	Domain     string `json:"domain"`
}

// VerifyResponse is the response body for license verification
type VerifyResponse struct {
	Valid      bool   `json:"valid"`
	ExpireTime int64  `json:"expire_time,omitempty"`
	Username   string `json:"username,omitempty"`
	Reason     string `json:"reason,omitempty"`
}

// licenseState stores the current license state
type licenseState struct {
	valid      bool
	expireTime int64
	reason     string
	LastCheck  time.Time
	mu         sync.RWMutex
}

var globalLicenseState = &licenseState{}

// NewLicenseVerifier creates a new LicenseVerifier instance
func NewLicenseVerifier(serverURL, licenseKey, domain string) *LicenseVerifier {
	return &LicenseVerifier{
		serverURL:  serverURL,
		licenseKey: licenseKey,
		domain:     domain,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// Verify performs license verification
func (v *LicenseVerifier) Verify(ctx context.Context) (*VerifyResponse, error) {
	if v.serverURL == "" || v.licenseKey == "" {
		return &VerifyResponse{Valid: false, Reason: "未配置授权服务"}, nil
	}

	reqBody := VerifyRequest{
		LicenseKey: v.licenseKey,
		Domain:     v.domain,
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, v.serverURL+"/api/verify", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := v.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("verify request: %w", err)
	}
	defer resp.Body.Close()

	var result VerifyResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &result, nil
}

// GetServerDomain extracts domain from environment or hostname
func GetServerDomain() string {
	domain := os.Getenv("SERVER_DOMAIN")
	if domain != "" {
		return domain
	}

	hostname, err := os.Hostname()
	if err != nil {
		return ""
	}
	return hostname
}

var checkParams struct {
	serverURL  string
	licenseKey string
	domain     string
	mu         sync.Mutex
}

// StartLicenseVerification starts license verification and stores the result
func StartLicenseVerification(serverURL, licenseKey, domain string) error {
	if serverURL == "" || licenseKey == "" {
		globalLicenseState.mu.Lock()
		globalLicenseState.valid = false
		globalLicenseState.reason = "未配置授权服务"
		globalLicenseState.LastCheck = time.Now() // 标记为已检查（无配置）
		globalLicenseState.mu.Unlock()
		return nil
	}

	// 保存参数以便后续手动触发
	checkParams.mu.Lock()
	checkParams.serverURL = serverURL
	checkParams.licenseKey = licenseKey
	checkParams.domain = domain
	checkParams.mu.Unlock()

	// 立即执行一次验证
	if err := doVerify(); err != nil {
		return err
	}

	// 启动后台定时验证任务
	go func() {
		ticker := time.NewTicker(10 * time.Minute)
		defer ticker.Stop()

		for range ticker.C {
			lockedReason := getLockedReason()
			// 如果当前是锁定状态，提高验证频率（3 分钟）
			if lockedReason != "" {
				ticker.Reset(3 * time.Minute)
			} else {
				ticker.Reset(10 * time.Minute)
			}
			
			if err := doVerify(); err != nil {
				// log.Printf("⚠️ 后台验证失败：%v", err)
			}
		}
	}()

	return nil
}

// TriggerAsyncCheck triggers a background verification immediately
func TriggerAsyncCheck() {
	// 异步执行，避免阻塞当前请求
	go func() {
		doVerify()
	}()
}

func getLockedReason() string {
	globalLicenseState.mu.RLock()
	defer globalLicenseState.mu.RUnlock()
	return globalLicenseState.reason
}

func doVerify() error {
	checkParams.mu.Lock()
	serverURL := checkParams.serverURL
	licenseKey := checkParams.licenseKey
	domain := checkParams.domain
	checkParams.mu.Unlock()

	if serverURL == "" || licenseKey == "" {
		globalLicenseState.mu.Lock()
		globalLicenseState.valid = false
		globalLicenseState.reason = "未配置授权服务"
		globalLicenseState.LastCheck = time.Now()
		globalLicenseState.mu.Unlock()
		return nil
	}

	verifier := NewLicenseVerifier(serverURL, licenseKey, domain)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	resp, err := verifier.Verify(ctx)
	if err != nil {
		globalLicenseState.mu.Lock()
		globalLicenseState.valid = false
		globalLicenseState.reason = fmt.Sprintf("验证服务不可达：%v", err)
		globalLicenseState.LastCheck = time.Now()
		globalLicenseState.mu.Unlock()
		return err
	}

	globalLicenseState.mu.Lock()
	globalLicenseState.valid = resp.Valid
	globalLicenseState.expireTime = resp.ExpireTime
	globalLicenseState.reason = resp.Reason
	globalLicenseState.LastCheck = time.Now()
	globalLicenseState.mu.Unlock()

	return nil
}

// GetLicenseState returns the current license state
func GetLicenseState() (valid bool, expireTime int64, reason string) {
	globalLicenseState.mu.RLock()
	defer globalLicenseState.mu.RUnlock()
	return globalLicenseState.valid, globalLicenseState.expireTime, globalLicenseState.reason
}

// SetLicenseState sets the license state (for testing)
func SetLicenseState(valid bool, expireTime int64, reason string) {
	globalLicenseState.mu.Lock()
	defer globalLicenseState.mu.Unlock()
	globalLicenseState.valid = valid
	globalLicenseState.expireTime = expireTime
	globalLicenseState.reason = reason
}
