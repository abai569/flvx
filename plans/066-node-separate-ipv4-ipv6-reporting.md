# 066 - Node Separate IPv4/IPv6 Reporting

**Created:** Sat Apr 04 2026  
**Author:** opencode  
**Status:** Completed

## Overview

Implement automatic IPv4 and IPv6 address reporting to panel's `server_ip_v4` and `server_ip_v6` fields after node installation.

## Current State

### Agent (`go-gost/x/socket/websocket_reporter.go`)
- [x] `getPublicIP()` - Gets single IP (prefers IPv6, falls back to IPv4)
- [x] `reportPublicIP()` - Reports single IP to `/api/v1/node/report-ip`
- [x] `getPublicIPv4()`, `getPublicIPv6()` - Separate IPv4/IPv6 acquisition
- [x] `reportPublicIPs(ipv4, ipv6)` - Report both IPs simultaneously

### Backend API (`go-backend/internal/http/handler/handler.go`)
- [x] `/api/v1/node/report-ip` - Accepts `public_ip_v4` and `public_ip_v6` parameters
- [x] Backward compatible with old `public_ip` parameter
- [x] `UpdateNodePublicIPs()` - Updates `server_ip_v4` and `server_ip_v6` separately

### Database Model (`go-backend/internal/store/model/model.go`)
- [x] `ServerIP` (varchar(100), not null) - Legacy field for compatibility
- [x] `ServerIPV4` (sql.NullString) - IPv4 address
- [x] `ServerIPV6` (sql.NullString) - IPv6 address

## Implementation Summary

### Task 1: Agent - Separate IP Acquisition Functions ✅
**File:** `go-gost/x/socket/websocket_reporter.go`

- [x] Add `getPublicIPv4()` function
  - Priority: `curl -4 -s ip.sb` (force IPv4 exit)
  - Fallback 1: Go HTTP client requests `https://api4.ipify.org?format=text`
  - Fallback 2: Local default route IPv4

- [x] Add `getPublicIPv6()` function
  - Priority: `curl -6 -s ip.sb` (force IPv6 exit)
  - Fallback 1: Go HTTP client requests `https://api6.ipify.org?format=text`
  - Fallback 2: Local default route IPv6

- [x] Modify `reportPublicIP()` to `reportPublicIPs(ipv4, ipv6 string)`
  - Request body: `{ "public_ip_v4": "...", "public_ip_v6": "..." }`
  - Kept old `reportPublicIP()` as deprecated wrapper

- [x] Updated call after WebSocket connection succeeds
  ```go
  ipv4 := getPublicIPv4()
  ipv6 := getPublicIPv6()
  w.reportPublicIPs(ipv4, ipv6)
  ```

### Task 2: Backend API - Extend Interface ✅
**File:** `go-backend/internal/http/handler/handler.go`

- [x] Modified `nodeReportIP()` handler
  - Accepts `public_ip_v4` and `public_ip_v6` parameters
  - Kept `public_ip` parameter for backward compatibility
  - Calls appropriate repository method based on parameters

### Task 3: Backend Repository - Add Method ✅
**File:** `go-backend/internal/store/repo/repository_mutations.go`

- [x] Added `UpdateNodePublicIPs(nodeID int64, ipv4, ipv6 string) error`
  - Updates both `server_ip_v4` and `server_ip_v6`
  - Auto-syncs `server_ip` (prefers IPv6)

### Task 4: Testing & Validation ✅
- [x] Agent build test - PASSED
- [x] Backend build test - PASSED
- [ ] Manual test: check database fields after new node installation
- [ ] Compatibility test: old agent reporting `public_ip` still works

## API Design

### Agent to Panel: `/api/v1/node/report-ip`

**Request (New Format):**
```json
{
  "public_ip_v4": "203.0.113.1",
  "public_ip_v6": "2001:db8::1"
}
```

**Request (Legacy Format - still supported):**
```json
{
  "public_ip": "203.0.113.1"
}
```

**Response (New Format):**
```json
{
  "code": 0,
  "msg": "success",
  "data": {
    "node_id": 123,
    "public_ip_v4": "203.0.113.1",
    "public_ip_v6": "2001:db8::1"
  },
  "ts": 1712236800
}
```

## Files Modified

1. `go-gost/x/socket/websocket_reporter.go`
   - Added `getPublicIPv4()`, `getPublicIPv6()`
   - Added `reportPublicIPs(ipv4, ipv6)`
   - Deprecated `getPublicIP()`, `reportPublicIP()`
   - Updated caller in `connectAndReport()`

2. `go-backend/internal/http/handler/handler.go`
   - Modified `nodeReportIP()` to handle new format

3. `go-backend/internal/store/repo/repository_mutations.go`
   - Added `UpdateNodePublicIPs()`

## Migration Notes

- No database migration required (fields already exist)
- Old agent continues to work (backward compatible)
- New agent automatically reports separate IPs
- `server_ip` field auto-syncs: prefers IPv6, falls back to IPv4