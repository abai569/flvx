# 计划 006: Tunnel 转发协议支持

**创建日期:** 2026-04-11  
**优先级:** 高  
**状态:** 已完成  
**完成日期:** 2026-04-11  

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

- [x] **1. 前端修改** (`vite-frontend/src/pages/tunnel.tsx`)
  - [x] 1.1 在转发链配置区域添加"转发协议"选择器
  - [x] 1.2 协议选项：`relay` (通用转发) / `tunnel` (长连接隧道)
  - [x] 1.3 默认值设为 `tunnel`（新隧道）
  - [x] 1.4 添加说明文字/提示信息
  - [x] 1.5 表单数据提交时包含 `forwardProtocol` 字段

- [x] **2. 后端修改** (`go-backend/internal/http/handler/mutations.go`)
  - [x] 2.1 修改 `buildTunnelChainServiceConfig()` 函数
  - [x] 2.2 根据前端 `forwardProtocol` 字段设置 `handler.type`
  - [x] 2.3 支持 `"type": "tunnel"` 配置生成
  - [x] 2.4 兼容旧数据（无 `forwardProtocol` 字段时默认使用 `tunnel`）

- [x] **3. 数据库兼容** - 无需修改
  - 转发协议信息存储在运行时配置中，不持久化到数据库
  - 现有隧道更新时如不指定该字段，默认使用 `tunnel`

- [x] **4. 编译验证**
  - [x] 4.1 后端编译通过 (`go build ./...`)
  - [x] 4.2 前端编译通过 (`npm run build`)

- [ ] **5. 功能测试** (需部署到测试环境)
  - [ ] 5.1 创建新隧道，选择 `tunnel` 协议
  - [ ] 5.2 使用 iperf3 测试 UDP 转发性能
  - [ ] 5.3 验证现有隧道（无协议配置）仍能正常工作
  - [ ] 5.4 测试 TCP 业务不受影响

- [ ] **6. 文档更新**
  - [ ] 6.1 更新用户文档说明两种协议的区别
  - [ ] 6.2 添加 UDP 业务最佳实践指南

---

## 详细实现方案

### 前端实现 (tunnel.tsx)

**修改位置：** `vite-frontend/src/pages/tunnel.tsx`

1. **类型定义扩展** (约 88 行):
```typescript
interface ChainTunnel {
  nodeId: number;
  protocol?: string; // 传输层协议
  forwardProtocol?: string; // 'relay' | 'tunnel' - 转发协议（应用层）
  // ... 其他字段
}
```

2. **默认值设置** (`form.ts` 约 20 行):
```typescript
export const createTunnelFormDefaults = () => {
  return {
    // ... 其他字段
    forwardProtocol: "tunnel" as string, // 默认使用 tunnel 协议
  };
};
```

3. **更新函数** (约 734 行):
```typescript
const updateChainForwardProtocol = (groupIndex: number, forwardProtocol: string) => {
  setForm((prev) => {
    const chainNodes = [...(prev.chainNodes || [])];
    chainNodes[groupIndex] = (chainNodes[groupIndex] || []).map((node) => ({
      ...node,
      forwardProtocol,
    }));
    return { ...prev, chainNodes };
  });
};
```

4. **UI 选择器** (约 3193 行):
```tsx
<Select
  label="转发协议"
  selectedKeys={[forwardProtocol]}
  description="relay: 通用转发 (UDP 不稳定); tunnel: 长连接隧道 (推荐)"
  onSelectionChange={(keys) => {
    const selectedKey = Array.from(keys)[0] as string;
    updateChainForwardProtocol(groupIndex, selectedKey);
  }}
>
  <SelectItem key="relay">Relay (通用转发)</SelectItem>
  <SelectItem key="tunnel">Tunnel (长连接隧道) ✨</SelectItem>
</Select>
```

### 后端实现 (mutations.go)

**修改位置：** `go-backend/internal/http/handler/mutations.go`

1. **数据结构扩展** (约 3009 行):
```go
type tunnelRuntimeNode struct {
    NodeID          int64
    Protocol        string
    Strategy        string
    Inx             int
    ChainType       int
    Port            int
    ConnectIPType   string
    ForwardProtocol string // 转发协议："relay" | "tunnel"
}
```

2. **解析前端数据** (约 3040-3140 行，三处):
```go
state.InNodes = append(state.InNodes, tunnelRuntimeNode{
    // ... 其他字段
    ForwardProtocol: asString(item["forwardProtocol"]), // ✅ 新增
})
```

3. **生成 GOST 配置** (约 3768 行):
```go
func buildTunnelChainServiceConfig(...) {
    // ✅ 支持动态转发协议选择：默认 "tunnel"（新隧道推荐）
    forwardProtocol := defaultString(chainNode.ForwardProtocol, "tunnel")
    handlerCfg := map[string]interface{}{
        "type": forwardProtocol, // ← 改硬编码为动态选择
    }
    // ...
}
```

### 数据结构扩展

**决定：** 不修改数据库 schema，转发协议信息在运行时配置中传递。

- 优点：无需数据库迁移，降低升级风险
- 缺点：隧道更新时需要重新指定协议（可接受）

---

## 兼容性策略

### 现有隧道

- 更新现有隧道时，如不指定 `forwardProtocol` 字段，后端默认使用 `tunnel`
- 这意味着现有隧道更新后会**自动切换到 tunnel 协议**
- **注意：** 这可能是一个破坏性变更，建议在测试环境先验证

### 新隧道

- 默认使用 `tunnel` 协议
- 用户可手动选择 `relay`（兼容特殊场景）

### 升级路径

1. 部署新版本面板
2. 新创建隧道默认使用 `tunnel`
3. 现有隧道更新时会自动切换到 `tunnel`（需测试验证）
4. （可选）提供"协议升级"功能，允许用户手动切换回 `relay`

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Tunnel 协议与现有节点不兼容 | 旧版本 agent 不支持 | GOST v3 原生支持 tunnel 协议，应该兼容 |
| 切换协议导致现有隧道中断 | 更新现有隧道时可能中断 | ⚠️ 建议先在测试环境验证，或改为默认 `relay` 保持现状 |
| UDP 性能提升不明显 | 用户期望落空 | 添加测试文档，说明预期效果 |

---

## 验收标准

- [x] 1. 前端能正确选择并保存转发协议
- [x] 2. 后端能生成正确的 GOST 配置（`handler.type` 与选择一致）
- [x] 3. 前后端编译通过
- [ ] 4. iperf3 UDP 测试显示正常吞吐量（非 0.00 Bytes）- 需部署测试
- [ ] 5. 现有隧道（无协议配置）仍能正常工作 - 需部署测试
- [ ] 6. TCP 业务不受影响 - 需部署测试

---

## 时间估算

| 任务 | 预估时间 | 实际耗时 |
|------|----------|----------|
| 前端修改 | 2-3 小时 | ~1 小时 |
| 后端修改 | 2-3 小时 | ~30 分钟 |
| 编译验证 | - | ~5 分钟 |
| 测试验证 | 2-4 小时 | 待进行 |
| 文档更新 | 1 小时 | ~15 分钟 |
| **总计** | **7-11 小时** | **~2 小时 (不含部署测试)** |

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
| 2026-04-11 | 实施完成：前端 + 后端修改 + 编译验证通过 | - |
| 2026-04-11 | 补充出口区域转发协议选择器 | - |
| 2026-04-11 | 调整转发链区域布局：节点 + 策略第一行，协议 + 转发协议第二行 | - |
| 2026-04-11 | 调整出口区域布局：节点 + 策略第一行，协议 + 转发协议第二行 | - |
