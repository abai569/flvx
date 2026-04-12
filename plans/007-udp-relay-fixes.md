# 计划 007: UDP Relay 转发修复

**创建日期:** 2026-04-12  
**优先级:** 高  
**状态:** 已完成  
**完成日期:** 2026-04-12  

---

## 背景与问题

### 问题描述

GOST v3 的 Relay 协议在 UDP 转发场景下存在以下问题：

1. **故障转移失效** - 连接错误延迟到第一次读写才暴露，failover 机制无法触发
2. **UDP 资源泄漏** - 没有 TTL 超时配置，UDP 连接长时间占用资源
3. **连接状态管理不准确** - 活跃连接可能被 TTL 机制误清理

### 根本原因

1. **noDelay 模式仅限 TLS** - 只有 TLS/MTLS 协议启用 `nodelay=true`，TCP/MTCP 协议未启用
2. **UDP TTL 配置缺失** - 没有为 UDP 连接设置超时清理
3. **SetIdle 调用缺失** - 数据写入时未标记连接为非空闲状态

---

## 解决方案

### 修复 1: 为所有协议启用 noDelay 模式

**问题：** 仅 TLS 协议启用 noDelay，其他协议故障转移失效

**修复位置：**
- `go-backend/internal/http/handler/mutations.go:3801-3808` (隧道转发 Handler)
- `go-backend/internal/http/handler/mutations.go:3760-3765` (隧道转发 Connector)
- `go-backend/internal/http/handler/federation.go:148-153` (联邦转发 Handler)
- `go-backend/internal/http/handler/federation.go:1086-1091` (联邦转发 Connector)

**修改内容：**
```go
// 修复前（仅限 TLS）
handlerCfg := map[string]interface{}{
    "type": "relay",
}
if isTLSTunnelProtocol(protocol) {
    handlerCfg["metadata"] = map[string]interface{}{"nodelay": true}
}

// 修复后（所有协议）
handlerCfg := map[string]interface{}{
    "type": "relay",
    "metadata": map[string]interface{}{
        "nodelay": true,  // 所有 Relay Handler 启用 noDelay
        "udpTTL":  "5s",  // 添加 UDP TTL 默认配置
    },
}
```

**预期效果：**
- ✅ 连接错误立即暴露，不延迟到第一次读写
- ✅ 故障转移（failover）机制正常工作
- ✅ UDP 连接稳定性提升

---

### 修复 2: 添加 UDP TTL 默认配置

**问题：** UDP 连接没有超时清理，可能长时间占用资源

**修复位置：** 同上（与修复 1 合并实施）

**修改内容：**
```go
handlerCfg["metadata"] = map[string]interface{}{
    "nodelay": true,
    "udpTTL":  "5s",  // UDP 连接 5 秒无活动自动清理
}
```

**预期效果：**
- ✅ UDP 连接 5 秒无活动自动清理
- ✅ 释放资源，防止连接泄漏
- ✅ 提高连接池效率

---

### 修复 3: 验证 UDP 检测修复已应用

**问题：** 需要确认 UDP 连接检测逻辑使用正确方法

**验证文件：**
- ✅ `go-gost/x/chain/router.go:63`
- ✅ `go-gost/x/handler/forward/local/handler.go:104`
- ✅ `go-gost/x/handler/forward/remote/handler.go:115`
- ✅ `go-gost/x/service/service.go:495`

**验证内容：**
```go
// 已确认使用正确的 UDP 检测方法
if conn.RemoteAddr().Network() == "udp" {
    network = "udp"
}
```

**状态：** ✅ 已应用，无需修改

---

### 修复 4: 应用 UDP Listener SetIdle 修复

**问题：** 数据写入时未标记连接为非空闲，可能被 TTL 机制误清理

**修复位置：** `go-gost/x/internal/net/udp/listener.go:230`

**修改内容：**
```go
func (c *conn) WriteQueue(b []byte) error {
    select {
    case c.rc <- b:
        c.SetIdle(false) // ✅ 标记连接为非空闲
        return nil
        // ...
    }
}
```

**预期效果：**
- ✅ 活跃 UDP 连接不会被 TTL 机制误清理
- ✅ 连接状态追踪更准确
- ✅ 提高连接稳定性

---

## 影响范围

| 组件 | 影响 | 说明 |
|------|------|------|
| 隧道转发（所有协议） | ✅ noDelay + UDP TTL | Handler + Connector |
| 联邦转发（所有协议） | ✅ noDelay + UDP TTL | Handler + Connector |
| UDP Listener | ✅ SetIdle 修复 | 连接状态管理 |
| UDP 检测逻辑 | ✅ 已验证 | 无需修改 |

---

## 编译验证

- ✅ `go-backend` 编译通过
- ✅ `go-gost` 编译通过
- ✅ `vite-frontend` 编译通过

---

## 预期效果

实施所有修复后：

1. ✅ **故障转移正常工作** - noDelay 确保错误立即暴露
2. ✅ **UDP 资源自动清理** - TTL 机制防止连接泄漏
3. ✅ **连接状态准确** - SetIdle 防止误清理
4. ✅ **iperf3 UDP 测试** - 应该能收到响应包（不再显示 0.00 Bytes）

---

## 测试建议

### 1. UDP 转发测试

```bash
# 服务端
iperf3 -s -u

# 客户端（通过隧道）
iperf3 -c <隧道入口 IP> -p <隧道端口> -u -b 100M
```

**预期结果：**
- receiver 侧应该显示正常吞吐量（非 0.00 Bytes）
- 丢包率应该在可接受范围内

### 2. 故障转移测试

```bash
# 配置多节点隧道，然后手动停止主节点
# 观察是否自动切换到备用节点
```

**预期结果：**
- 故障转移应该立即触发（不再等待第一次读写）

### 3. 长时间运行测试

```bash
# 持续 UDP 流量运行 24 小时
# 观察连接池状态和资源使用
```

**预期结果：**
- 连接池大小稳定
- 无资源泄漏

---

## 回滚方案

如需回滚，恢复以下文件到修改前版本：

1. `go-backend/internal/http/handler/mutations.go`
2. `go-backend/internal/http/handler/federation.go`
3. `go-gost/x/internal/net/udp/listener.go`

---

## 相关文档

- 计划 006: ~~Tunnel 转发协议支持~~ (已废弃)
- GOST v3 UDP 架构：`go-gost/x/internal/net/udp/`
- Relay Handler 实现：`go-gost/x/handler/relay/`

---

## 变更记录

| 日期 | 变更内容 | 作者 |
|------|----------|------|
| 2026-04-12 | 初始版本 + 实施完成 | - |
| 2026-04-12 | 编译验证通过 | - |
