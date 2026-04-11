# 计划 006: Tunnel 转发协议支持

**创建日期:** 2026-04-11  
**优先级:** 高  
**状态:** 待开始  

---

## 背景与问题

### 问题描述

当前 FLVX 面板使用 GOST v3 作为转发内核，所有隧道统一使用 `relay` 协议进行数据转发。该协议在 UDP 转发场景下存在严重问题：

- UDP 包被封装到 TCP 连接中传输（UDP-over-TCP）
- 多路复用场景下容易乱序/丢包
- iperf3 等工具的 UDP 响应包无法正常返回（receiver 侧显示 0.00 Bytes）

### 根本原因

查看后端代码 `go-backend/internal/http/handler/mutations.go:3771`：

```go
handlerCfg := map[string]interface{}{
    "type": "relay",  // ← 硬编码，永远是 relay
}
```

无论前端选择什么传输层协议（TCP/TLS/WSS 等），应用层转发协议（Handler）始终是 `relay`。

### GOST 配置结构

```yaml
service:
  handler:
    type: relay    # 应用层转发协议 ← 问题所在
    metadata:
      nodelay: true
  listener:
    type: tls      # 传输层协议（前端可选）
```

---

## 解决方案

### 方案概述

在前端添加**"转发协议"**选项，让用户选择 Handler 类型：

| 转发协议 (Handler) | 适用场景 | UDP 支持 | 稳定性 |
|-------------------|---------|---------|--------|
| **Relay** (当前默认) | 通用 TCP 转发 | ❌ UDP-over-TCP | 中 |
| **Tunnel** (新增) | 长连接隧道/UDP 业务 | ✅ 原生 UDP 通道 | 高 |

### 技术可行性

GOST v3 已支持 `tunnel` 协议，代码位于：
- `go-gost/x/handler/tunnel/handler.go` - Tunnel 处理器
- `go-gost/x/handler/tunnel/tunnel.go` - 隧道连接器池管理

Tunnel 协议特点：
- 长连接隧道池 (`ConnectorPool`)
- 支持 UDP 独立通道 (`c.id.IsUDP()`)
- 更稳定的转发机制

---

## 实施任务

### 任务列表

- [ ] **1. 前端修改** (`vite-frontend/src/pages/tunnel.tsx`)
  - [ ] 1.1 在转发链配置区域添加"转发协议"选择器
  - [ ] 1.2 协议选项：`relay` (通用转发) / `tunnel` (长连接隧道)
  - [ ] 1.3 默认值设为 `tunnel`（新隧道）
  - [ ] 1.4 添加说明文字/提示信息
  - [ ] 1.5 表单数据提交时包含 `forwardProtocol` 字段

- [ ] **2. 后端修改** (`go-backend/internal/http/handler/mutations.go`)
  - [ ] 2.1 修改 `buildTunnelChainServiceConfig()` 函数
  - [ ] 2.2 根据前端 `forwardProtocol` 字段设置 `handler.type`
  - [ ] 2.3 支持 `"type": "tunnel"` 配置生成
  - [ ] 2.4 兼容旧数据（无 `forwardProtocol` 字段时使用 `relay`）

- [ ] **3. 数据库兼容** (`go-backend/internal/store/model/model.go`)
  - [ ] 3.1 检查是否需要新增字段存储转发协议偏好
  - [ ] 3.2 如需新增，添加迁移逻辑

- [ ] **4. 测试验证**
  - [ ] 4.1 创建新隧道，选择 `tunnel` 协议
  - [ ] 4.2 使用 iperf3 测试 UDP 转发性能
  - [ ] 4.3 验证现有隧道（无协议配置）仍能正常工作
  - [ ] 4.4 测试 TCP 业务不受影响

- [ ] **5. 文档更新**
  - [ ] 5.1 更新用户文档说明两种协议的区别
  - [ ] 5.2 添加 UDP 业务最佳实践指南

---

## 详细实现方案

### 前端实现 (tunnel.tsx)

在转发链配置区域（约 3150 行附近）添加选择器：

```tsx
{/* 转发协议 - 新增 */}
<Select
  label="转发协议"
  placeholder="选择转发协议"
  selectedKeys={[forwardProtocol || "tunnel"]}
  description="relay: 通用转发协议 (UDP 可能不稳定); tunnel: 长连接隧道协议 (推荐用于 UDP)"
  onSelectionChange={(keys) => {
    const selectedKey = Array.from(keys)[0] as string;
    setForwardProtocol(selectedKey);
  }}
>
  <SelectItem key="relay">Relay (通用转发)</SelectItem>
  <SelectItem key="tunnel">Tunnel (长连接隧道) ✨</SelectItem>
</Select>
```

### 后端实现 (mutations.go)

修改 `buildTunnelChainServiceConfig()` 函数：

```go
func buildTunnelChainServiceConfig(tunnelID int64, chainNode tunnelRuntimeNode, node *nodeRecord, nextHopCandidateCount int) []map[string]interface{} {
    if node == nil {
        return nil
    }
    protocol := defaultString(chainNode.Protocol, "tls")
    
    // ← 新增：支持转发协议选择
    forwardProtocol := defaultString(chainNode.ForwardProtocol, "tunnel") // 默认 tunnel
    handlerCfg := map[string]interface{}{
        "type": forwardProtocol, // ← 改硬编码为动态选择
    }
    
    if isTLSTunnelProtocol(protocol) {
        handlerCfg["metadata"] = map[string]interface{}{"nodelay": true}
    }
    // ... 其余代码保持不变
}
```

### 数据结构扩展

`Tunnel` 模型或 `ChainTunnel` 模型可能需要新增字段：

```go
type ChainTunnel struct {
    // ... 现有字段
    ForwardProtocol sql.NullString `gorm:"column:forward_protocol;type:varchar(20);default:'tunnel'"`
}
```

**或者** 在运行时配置中传递，不存储到数据库（更简单，推荐）。

---

## 兼容性策略

### 现有隧道

- 无 `forwardProtocol` 配置的隧道，后端默认使用 `relay`（保持现状）
- 或默认使用 `tunnel`（推荐，但需要评估风险）

### 新隧道

- 默认使用 `tunnel` 协议
- 用户可手动选择 `relay`（兼容特殊场景）

### 升级路径

1. 部署新版本面板
2. 新创建隧道默认使用 `tunnel`
3. 现有隧道保持不变
4. （可选）提供"协议升级"功能，允许用户手动切换

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Tunnel 协议与现有节点不兼容 | 旧版本 agent 不支持 | 检查最低版本要求，添加版本检测 |
| 切换协议导致现有隧道中断 | 用户业务受影响 | 仅新隧道使用新协议，现有隧道保持 `relay` |
| UDP 性能提升不明显 | 用户期望落空 | 添加测试文档，说明预期效果 |

---

## 验收标准

1. ✅ 前端能正确选择并保存转发协议
2. ✅ 后端能生成正确的 GOST 配置（`handler.type` 与选择一致）
3. ✅ iperf3 UDP 测试显示正常吞吐量（非 0.00 Bytes）
4. ✅ 现有隧道（无协议配置）仍能正常工作
5. ✅ TCP 业务不受影响

---

## 时间估算

| 任务 | 预估时间 |
|------|----------|
| 前端修改 | 2-3 小时 |
| 后端修改 | 2-3 小时 |
| 测试验证 | 2-4 小时 |
| 文档更新 | 1 小时 |
| **总计** | **7-11 小时** |

---

## 参考链接

- GOST Tunnel Handler: `go-gost/x/handler/tunnel/handler.go`
- GOST Relay Handler: `go-gost/x/handler/relay/handler.go`
- 问题图片：对比结论 (UDP) - GOST v3 隧道 UDP 转发故障

---

## 变更记录

| 日期 | 变更内容 | 作者 |
|------|----------|------|
| 2026-04-11 | 初始版本 | - |
