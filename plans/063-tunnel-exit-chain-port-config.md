# 063-tunnel-exit-chain-port-config.md

## Summary
隧道页面新增/编辑隧道时，出口配置和转发链配置支持手动指定连接端口。当前端口完全由后端自动分配，用户无法自定义。

## Problem
- 出口配置区域只有：节点选择、协议、负载策略、连接IP — **没有端口输入**
- 转发链配置区域同样没有端口输入
- 端口由后端 `PickNodePortTx` 从节点端口范围内自动分配
- 用户无法指定特定端口（如防火墙规则需要、端口映射需要等场景）

## Why Specify Port When Node Has Port Range?
节点端口范围定义的是**可用范围**，自动分配从中随机选一个。手动指定端口的场景：
- 防火墙/安全组需要开放特定端口
- 端口映射/端口转发需要固定端口
- 监控/日志需要可预测的端口
- 多隧道需要特定端口规划

---

## Design Decision: Single Port (Global per Exit/Chain Hop)

**采用单端口方案**（同一组内所有节点共用同一端口）

理由：
1. 当前协议和负载策略已经是**全局共享**的（所有出口节点用同一协议/策略）
2. 端口保持一致性，UI 简单
3. 后端 `prepareTunnelCreateState` 对每个节点遍历时，如果 `item["port"]` > 0 就直接使用
4. 如果后续需要每节点独立端口，可以在此基础上扩展

---

## Tasks

### 1. Frontend: ChainTunnel 接口添加 port 字段
- [x] `vite-frontend/src/pages/tunnel.tsx:88-93` — `ChainTunnel` 接口加 `port?: number` ✅

### 2. Frontend: 出口配置添加端口输入
- [ ] `vite-frontend/src/pages/tunnel.tsx:3216-3300` — 在连接 IP 旁边添加端口输入框
- [ ] 端口值绑定到 `form.outNodeId[0]?.port`
- [ ] onChange 时更新所有出口节点的 port 字段

### 3. Frontend: 转发链每跳添加端口输入
- [ ] `vite-frontend/src/pages/tunnel.tsx:2540-2930` — 每跳配置区域添加端口输入
- [ ] 端口值绑定到 `groupNodes[0]?.port`
- [ ] onChange 时更新该跳所有节点的 port 字段

### 4. Frontend: mergeOrderedNodes 保留 port 字段
- [ ] `vite-frontend/src/pages/tunnel.tsx` — `mergeOrderedNodes` 函数确保不丢失已有节点的 port 值

### 5. Frontend: 端口验证
- [ ] 端口范围 1-65535
- [ ] 如果输入了端口，验证是否在出口节点的端口范围内
- [ ] 多出口节点时，验证端口是否在所有节点的端口范围内

### 6. Frontend: 提交时确保 port 字段被传递
- [ ] `vite-frontend/src/pages/tunnel.tsx:780-820` — 检查 `cleanedOutNodeId` 和 `chainNodes` 过滤逻辑

---

## UI Design

### 出口配置
```
┌─ 出口配置 ──────────────────────────────────┐
│ 出口节点 [多选下拉框________________]       │
│                                              │
│ 协议 [TCP ▼]  负载策略 [轮询 ▼]              │
│                                              │
│ 连接IP [默认 ▼]  连接端口 [____]             │
│                          ↑ 留空自动分配       │
└──────────────────────────────────────────────┘
```

### 转发链配置（每跳）
```
┌─ 第 1 跳 ───────────────────────────────────┐
│ 节点 [多选下拉框________________]    [×]    │
│                                              │
│ 协议 [TLS ▼]  负载策略 [轮询 ▼]              │
│                                              │
│ 连接IP [默认 ▼]  连接端口 [____]             │
└──────────────────────────────────────────────┘
```

## Files to Modify

| File | Change |
|------|--------|
| `vite-frontend/src/pages/tunnel.tsx` | ChainTunnel 接口 + 出口配置 UI + 转发链 UI + 端口同步逻辑 + 验证 |

## No Backend Changes Needed
- 后端 `prepareTunnelCreateState` 已用 `asInt(item["port"], 0)` 读取端口
- port > 0 时使用指定值，port = 0 时自动分配
- 端口范围验证已有 `validateRemoteNodePort` 函数
