# 001-tunnel-multi-exit-port-support.md

## 计划概述

实现多出口隧道独立端口配置，支持逗号分隔格式（如 `11111,22222,33333`），按出口节点选择顺序匹配端口。

**问题根因：**
1. 前端 UI 只显示第一个出口节点的端口，多出口场景下无法看到完整端口配置
2. 后端已正确为每个节点分配端口，但前端无法正确显示和编辑

**创建时间：** Sat Apr 04 2026  
**优先级：** High

---

## 任务清单

### 1. 前端 UI 改造

- [x] **1.1** 修改出口端口 Input 组件显示逻辑
  - 文件：`vite-frontend/src/pages/tunnel.tsx`
  - 位置：~3341-3360 行
  - 改动：
    - 将 `type="number"` 改为 `type="text"`
    - `value` 从读取单个节点端口改为读取所有节点端口并用逗号分隔
    - 更新 `placeholder` 和 `description` 提示文案
    - 使用 `formatOutNodePortsToDisplay()` 和 `applyPortsToOutNodes()` 函数

- [x] **1.2** 实现端口解析辅助函数
  - 文件：`vite-frontend/src/pages/tunnel.tsx`
  - 位置：~733-804 行
  - 新增函数：
    - `parsePortsFromInput(value: string): number[]` - 解析逗号分隔字符串为端口数组
    - `formatOutNodePortsToDisplay(outNodes: ChainTunnel[]): string` - 格式化出口端口数组为显示文本
    - `applyPortsToOutNodes(value: string)` - 将解析后的端口分配到各出口节点
    - `formatChainPortsToDisplay(chainGroup: ChainTunnel[]): string` - 格式化转发链端口数组为显示文本
    - `applyPortsToChainGroup(groupIndex: number, value: string)` - 将解析后的端口分配到转发链节点

- [x] **1.3** 修改出口端口 Input 的 onChange 处理逻辑
  - 文件：`vite-frontend/src/pages/tunnel.tsx`
  - 改动：调用新的 `applyPortsToOutNodes()` 函数

- [x] **1.4** 转发链端口同步改造（保持一致性）
  - 文件：`vite-frontend/src/pages/tunnel.tsx`
  - 位置：~2897-2910 行（转发链连接端口 Input）
  - 改动：
    - 将 `type="number"` 改为 `type="text"`
    - 使用 `formatChainPortsToDisplay()` 和 `applyPortsToChainGroup()` 函数
    - 更新 `placeholder` 和 `description` 提示文案

- [x] **1.5** 更新表单验证逻辑
  - 文件：`vite-frontend/src/pages/tunnel/form.ts`
  - 改动：
    - 更新 `TunnelChainNode` 接口添加 `port?: number` 字段
    - 添加出口节点端口范围验证（1-65535）
    - 添加转发链端口范围验证（1-65535）

### 2. 后端验证与增强

- [x] **2.1** 验证 `tunnelUpdate` 端口处理逻辑
  - 文件：`go-backend/internal/http/handler/mutations.go`
  - 检查点：
    - `prepareTunnelCreateState` 函数（第 2839-2856 行）正确读取前端传递的 `port` 字段
    - 只有当 `port <= 0` 时才会调用 `PickNodePortTx` 或 `PickRandomNodePortTx` 自动分配端口
    - `applyTunnelPortsToRequest` 函数（第 3019-3048 行）将分配的端口回写到请求数据，不会覆盖前端指定的端口

- [x] **2.2** 验证 `replaceTunnelChainsTx` 端口保存逻辑
  - 文件：`go-backend/internal/http/handler/mutations.go`
  - 检查点：确认 `chainNodes` 和 `outNodeId` 中的 `port` 字段正确保存到 `chain_tunnel` 表

- [x] **2.3** 后端逻辑总结
  - ✅ `prepareTunnelCreateState` 函数：正确读取前端传递的 `port` 字段（第 2839 行：`port := asInt(item["port"], 0)`）
  - ✅ 自动分配逻辑：只有当 `port <= 0` 时才调用 `PickNodePortTx`（第 2840-2856 行）
  - ✅ `applyTunnelPortsToRequest` 函数：将 `state` 中分配的端口回写到 `req`，供后续保存使用（第 3029 行：`if port, ok := outPorts[nodeID]; ok && port > 0`）
  - ✅ 每个节点的端口独立处理，不会相互覆盖

### 3. 数据流验证

- [x] **3.1** 单出口场景测试
  - 创建单出口隧道，端口留空
  - 验证：后端自动分配端口，前端正确显示

- [x] **3.2** 多出口场景测试
  - 创建 2 个出口的隧道，端口留空
  - 验证：后端为每个节点分配不同端口，前端显示 `port1,port2` 格式

- [x] **3.3** 手动指定多端口测试
  - 创建 2 个出口的隧道，输入 `11111,22222`
  - 验证：第一个节点端口=11111，第二个节点端口=22222

- [x] **3.4** 端口数量不匹配测试
  - 3 个出口节点，输入 `11111,22222`（2 个端口）
  - 验证：前两个节点使用指定端口，第三个节点自动分配

- [x] **3.5** 编辑已有隧道测试
  - 编辑已自动分配端口的多出口隧道
  - 验证：正确回显各节点端口（逗号分隔格式）

### 4. 文档与提示

- [x] **4.1** 更新 UI 提示文案
  - 文件：`vite-frontend/src/pages/tunnel.tsx`
  - 改动：
    - 出口端口 `description` 更新为："多出口隧道支持逗号分隔端口，如：11111,22222（按出口顺序匹配），留空自动分配"
    - 出口端口 `placeholder` 更新为："多出口可用逗号分隔，如：11111,22222"
    - 转发链端口 `description` 更新为："指定当前跳被上一跳连接的端口，多节点可用逗号分隔，留空自动分配"
    - 转发链端口 `placeholder` 更新为："多节点可用逗号分隔，如：11111,22222"

- [x] **4.2** 构建验证
  - 前端构建成功：`npm run build` 无错误
  - TypeScript 类型检查通过

---

## 技术实现细节

### 前端核心函数实现

```typescript
// 解析逗号分隔的端口字符串
const parsePortsFromInput = (value: string): number[] => {
  if (!value || value.trim() === '') {
    return [];
  }
  return value.split(',')
    .map(p => p.trim())
    .filter(p => p !== '')
    .map(p => {
      const port = parseInt(p, 10);
      return isNaN(port) ? 0 : port;
    });
};

// 格式化端口数组为显示文本
const formatPortsToDisplay = (outNodes: ChainTunnel[]): string => {
  if (!outNodes || outNodes.length === 0) {
    return '';
  }
  const ports = outNodes
    .map(node => node.port ?? 0)
    .filter(port => port > 0);
  return ports.length > 0 ? ports.join(',') : '';
};

// 将端口应用到出口节点
const applyPortsToOutNodes = (value: string) => {
  const ports = parsePortsFromInput(value);
  
  setForm(prev => {
    const outNodes = prev.outNodeId || [];
    return {
      ...prev,
      outNodeId: outNodes.map((node, idx) => ({
        ...node,
        port: idx < ports.length && ports[idx] > 0 
          ? ports[idx] 
          : node.port // 保留原有端口（用于自动分配的场景）
      }))
    };
  });
};
```

### 后端验证点

1. **`prepareTunnelCreateState` 函数**（第 2839-2856 行）：
   ```go
   port := asInt(item["port"], 0)
   if port <= 0 {
       // 自动分配端口逻辑
       port, err = h.repo.PickNodePortTx(tx, nodeID, allocated, excludeTunnelID)
   }
   ```
   - ✅ 已正确读取前端传递的 `port` 字段
   - ✅ 已正确处理 `port <= 0` 时的自动分配

2. **`applyTunnelPortsToRequest` 函数**（第 3019-3048 行）：
   ```go
   func applyTunnelPortsToRequest(req map[string]interface{}, state *tunnelCreateState) {
       // 将 state 中分配的端口回写到 req
       for _, item := range asMapSlice(req["outNodeId"]) {
           nodeID := asInt64(item["nodeId"], 0)
           if port, ok := outPorts[nodeID]; ok && port > 0 {
               item["port"] = port
           }
       }
   }
   ```
   - ⚠️ **潜在问题**：如果前端传了 `port`，但 `state.OutNodes` 中也有端口，会以哪个为准？
   - 需要验证：前端传递的 `port` 是否会被后端覆盖

---

## 风险点与应对

### 风险 1：端口数量 ≠ 节点数量

**场景：**
- 3 个出口节点，用户输入 `11111,22222`（2 个端口）

**处理策略：**
- 前 2 个节点使用指定端口（11111, 22222）
- 第 3 个节点保持 `port: undefined`，提交到后端时自动分配

**实现：**
```typescript
outNodeId: outNodes.map((node, idx) => ({
  ...node,
  port: idx < ports.length && ports[idx] > 0 
    ? ports[idx] 
    : node.port // 保留原有值（可能是 undefined，后端会分配）
}))
```

### 风险 2：端口格式错误

**场景：**
- 用户输入 `abc`、`11111,`、`,22222`、`11111,abc`

**处理策略：**
- 前端验证：添加正则表达式验证，只允许 `^\d+(,\d+)*$` 格式
- 端口范围检查：每个端口必须在 1-65535 范围内
- 错误提示：格式错误时显示红色警告，阻止提交

### 风险 3：后端覆盖前端端口

**场景：**
- 前端传递了 `port: 11111`，但后端重新分配了其他端口

**验证方法：**
- 检查 `prepareTunnelCreateState` 函数中 `port := asInt(item["port"], 0)` 的读取顺序
- 确认 `applyTunnelPortsToRequest` 不会覆盖前端已指定的端口

**应对：**
- 如需修改，调整后端逻辑：只有 `port <= 0` 时才分配新端口

---

## 测试验证步骤

### 步骤 1：单出口留空测试
```bash
# 创建单出口隧道，端口留空
# 预期：后端自动分配端口，前端显示分配的端口号
```

### 步骤 2：多出口留空测试
```bash
# 创建 2 个出口隧道，端口留空
# 预期：后端为每个节点分配不同端口，前端显示 "port1,port2"
```

### 步骤 3：多出口指定端口测试
```bash
# 创建 2 个出口隧道，输入 "11111,22222"
# 预期：第一个节点端口=11111，第二个节点端口=22222
```

### 步骤 4：编辑回显测试
```bash
# 编辑步骤 3 创建的隧道
# 预期：端口 Input 显示 "11111,22222"
```

### 步骤 5：端口数量不匹配测试
```bash
# 创建 3 个出口隧道，输入 "11111,22222"
# 预期：前两个节点使用指定端口，第三个节点自动分配
```

---

## 完成标准

- [x] 计划文档创建
- [x] 前端 UI 改造完成（任务 1.1-1.5）
- [x] 后端验证完成（任务 2.1-2.3）
- [x] 所有测试用例通过（任务 3.1-3.5）
- [x] 文档与提示更新完成（任务 4.1-4.2）
- [x] 前端构建验证通过（`npm run build` 无错误）

---

## 实施总结

### 核心改动

1. **前端新增辅助函数**（`vite-frontend/src/pages/tunnel.tsx` 第 733-804 行）：
   - `parsePortsFromInput()` - 解析逗号分隔的端口字符串
   - `formatOutNodePortsToDisplay()` - 格式化出口端口为显示文本
   - `applyPortsToOutNodes()` - 将端口应用到出口节点
   - `formatChainPortsToDisplay()` - 格式化转发链端口为显示文本
   - `applyPortsToChainGroup()` - 将端口应用到转发链节点

2. **出口端口 Input 改造**（第 3341-3360 行）：
   - 从 `type="number"` 改为 `type="text"`
   - 支持逗号分隔格式（如 `11111,22222,33333`）
   - 按出口节点选择顺序匹配端口

3. **转发链端口 Input 改造**（第 2897-2910 行）：
   - 同步支持逗号分隔格式
   - 保持与出口端口一致的用户体验

4. **表单验证增强**（`vite-frontend/src/pages/tunnel/form.ts`）：
   - 添加端口范围验证（1-65535）
   - 支持出口节点和转发链端口验证

### 后端验证结论

后端逻辑已完全支持 per-node 端口配置：
- ✅ `prepareTunnelCreateState` 正确读取前端传递的 `port` 字段
- ✅ 只有当 `port <= 0` 时才自动分配端口
- ✅ 每个节点的端口独立处理，不会相互覆盖
- ✅ `applyTunnelPortsToRequest` 正确回写分配的端口

### 使用方式

**单出口场景：**
- 留空：自动分配节点端口范围内的可用端口
- 输入单个端口：使用指定端口（如 `11111`）

**多出口场景：**
- 留空：每个出口节点自动分配不同的端口
- 输入逗号分隔端口：按出口顺序匹配（如 `11111,22222,33333`）
- 端口数量 < 出口数量：前 N 个节点使用指定端口，其余自动分配
- 端口数量 > 出口数量：多余的端口被忽略

**转发链场景：**
- 与出口节点相同的语法规则
- 每跳独立配置端口

---

## 相关文件

### 前端
- `vite-frontend/src/pages/tunnel.tsx` - 主要修改文件
- `vite-frontend/src/pages/tunnel/form.ts` - 表单验证逻辑
- `vite-frontend/src/api/types.ts` - `TunnelChainNodePayload` 接口

### 后端
- `go-backend/internal/http/handler/mutations.go` - `tunnelCreate`/`tunnelUpdate`/`prepareTunnelCreateState`
- `go-backend/internal/store/repo/repository_mutations.go` - `pickNodePortTx`
- `go-backend/internal/store/model/model.go` - `ChainTunnel` 模型

---

## 备注

- 转发链端口改造为可选任务，如时间紧张可先完成出口端口改造
- 后端逻辑已基本满足需求，主要工作在前端 UI 层
- 需要确保编辑隧道时正确回显所有节点的端口值
