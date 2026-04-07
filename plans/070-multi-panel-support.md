# 070-multi-panel-support.md

**Created:** 2026-04-05
**Updated:** 2026-04-05
**Feature:** 多面板对接支持 - 自定义服务名实现单机器多实例
**升级方案:** 通过 serviceName 精确控制指定实例

---

## 背景

当前 FLVX 节点只能一对一连接面板，无法在同一台机器上安装多个节点连接不同面板。需要支持：

1. **单机器多实例** - 同一台 VPS 可以安装多个 FLVX agent，分别连接不同面板
2. **自定义服务名** - 用户可以自定义 systemd 服务名以便区分
3. **升级精确控制** - 面板升级时只升级对应的实例，不影响其他面板的实例

参考设计：Nyanpass 的交互式服务名输入

---

## 用户需求

### 场景 1：多面板对接

**用户需求：**
- 在同一台机器上安装多个节点
- 分别连接不同的面板（如面板 A、面板 B、面板 C）
- 每个实例独立运行，互不影响

**当前限制：**
- 只能安装一个 `flux_agent.service`
- 第二次安装会覆盖第一次的配置

### 场景 2：服务名区分

**用户需求：**
- 自定义服务名便于管理（如 `panel_a`, `beijing-node`, `test-instance`）
- systemd 状态清晰显示（`systemctl status panel_a`）

**当前限制：**
- 固定服务名 `flux_agent`
- 无法区分不同用途的实例

### 场景 3：精确升级（重要）

**用户需求：**
- 面板 A 点击升级 → 只升级 `panel_a` 实例
- 面板 B 点击升级 → 只升级 `panel_b` 实例
- 不影响其他面板的实例

**当前限制：**
- 升级逻辑无法区分实例
- 可能升级错误实例或全部实例

---

## 决策确认

### 用户确认的实施细节

1. **服务名验证规则**：`^[a-zA-Z0-9_-]+$` ✅
2. **默认值**：`flux_agent`（用户直接回车使用默认值）✅
3. **服务名重复**：提示已存在，要求重新输入 ✅
4. **升级逻辑**：通过 `serviceName` 精确控制指定实例 ✅
5. **serviceName 存储**：
   - 安装时写入 `config.json`
   - agent 启动时上报给面板
   - 面板存储到 `node` 表
   - 升级时传递给 agent

---

## 实施方案

### 核心设计

**交互式服务名输入：**
```bash
# 安装时提示
请输入服务名 [默认 flux_agent]: 
# 用户输入：panel_a（或直接回车使用默认值）

# 创建服务
systemctl start panel_a.service
配置文件：/etc/flux_agent_panel_a/config.json
```

**目录结构：**
```
/etc/
├── flux_agent/                    # 默认实例
│   ├── config.json                # 包含 serviceName 字段
│   ├── gost.json
│   └── flux_agent (二进制)
├── flux_agent_panel_a/            # 自定义实例
│   ├── config.json                # { "addr": "...", "secret": "...", "serviceName": "panel_a" }
│   ├── gost.json
│   └── flux_agent (二进制)
└── flux_agent_panel_b/            # 另一个实例
    ├── config.json
    ├── gost.json
    └── flux_agent (二进制)

/etc/systemd/system/
├── flux_agent.service             # 默认服务
├── panel_a.service                # 自定义服务
└── panel_b.service                # 另一个自定义服务
```

---

## 升级方案（重要）

### 问题定义

**场景：**
```
机器 A 安装了 3 个实例：
- panel_a (连接面板 A，serviceName="panel_a")
- panel_b (连接面板 B，serviceName="panel_b")
- panel_c (连接面板 C，serviceName="panel_c")

需求：
- 面板 A 点击升级 → 只升级 panel_a
- 面板 B 点击升级 → 只升级 panel_b
- 面板 C 点击升级 → 只升级 panel_c
```

### 解决方案：serviceName 精确控制

**数据流：**
```
1. 安装时
   install.sh → /etc/panel_a/config.json
   {
     "addr": "https://panel-a.com",
     "secret": "SECRET_A",
     "serviceName": "panel_a"
   }

2. agent 启动时
   agent → 面板 WebSocket
   {
     "type": "register",
     "data": {
       "secret": "SECRET_A",
       "serviceName": "panel_a"
     }
   }

3. 面板存储
   node 表：
   | id | secret   | serviceName |
   |----|----------|-------------|
   | 1  | SECRET_A | panel_a     |

4. 升级时
   面板 → agent WebSocket
   {
     "type": "UpgradeAgent",
     "data": {
       "secret": "SECRET_A",
       "serviceName": "panel_a"  // 精确指定
     }
   }

5. agent 执行
   - 验证 secret 匹配
   - 验证 serviceName 匹配
   - 执行升级
```

### 优势对比

| 方案 | 优点 | 缺点 |
|------|------|------|
| **serviceName 精确控制** | ✅ 精确到实例<br>✅ 不影响其他面板<br>✅ 数据流清晰 | ⚠️ 需要修改 agent<br>⚠️ 需要数据库字段 |
| 自动检测所有实例 | ✅ 无需改动 agent | ❌ 无法精确控制<br>❌ 可能误升级 |
| SECRET 关联 | ✅ 无需用户输入 | ⚠️ 需要额外映射文件<br>⚠️ 维护成本高 |

---

## 实施计划

### 阶段 1：install.sh 改动

#### 1.1 参数解析

**新增支持：**
```bash
# 现有参数
-a PANEL_ADDR  # 面板地址
-s SECRET      # 节点密钥

# 新增参数（可选）
-n SERVICE_NAME  # 服务名（不指定则交互式输入）
```

**实现逻辑：**
```bash
SERVICE_NAME=""

while getopts "a:s:n:" opt; do
  case $opt in
    a) PANEL_ADDR="$OPTARG" ;;
    s) SECRET="$OPTARG" ;;
    n) SERVICE_NAME="$OPTARG" ;;
  esac
done

# 如果未指定服务名，交互式输入
if [[ -z "$SERVICE_NAME" ]]; then
  read -p "请输入服务名 [默认 flux_agent]: " SERVICE_NAME
  SERVICE_NAME=${SERVICE_NAME:-flux_agent}
fi

# 验证服务名格式
if [[ ! "$SERVICE_NAME" =~ ^[a-zA-Z0-9_-]+$ ]]; then
  echo "❌ 错误：服务名只能包含字母、数字、下划线和短横线"
  exit 1
fi

# 检查服务名是否已存在
if systemctl list-units --full -all | grep -Fq "${SERVICE_NAME}.service"; then
  echo "❌ 错误：服务名 '${SERVICE_NAME}' 已存在，请选择其他名称"
  exit 1
fi
```

#### 1.2 目录结构

```bash
# 默认服务名
if [[ "$SERVICE_NAME" == "flux_agent" ]]; then
  INSTALL_DIR="/etc/flux_agent"
else
  # 自定义服务名：/etc/flux_agent_<SERVICE_NAME>/
  INSTALL_DIR="/etc/flux_agent_${SERVICE_NAME}"
fi

mkdir -p "$INSTALL_DIR"
```

#### 1.3 systemd 服务

```ini
# /etc/systemd/system/${SERVICE_NAME}.service
[Unit]
Description=FLVX Agent - ${SERVICE_NAME}
After=network.target

[Service]
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/flux_agent
Restart=on-failure
StandardOutput=null
StandardError=null

[Install]
WantedBy=multi-user.target
```

**启动命令：**
```bash
systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl start ${SERVICE_NAME}
```

#### 1.4 写入 serviceName 到 config.json

**安装时写入：**
```bash
CONFIG_FILE="$INSTALL_DIR/config.json"
cat > "$CONFIG_FILE" <<EOF
{
  "addr": "$SERVER_ADDR",
  "secret": "$SECRET",
  "serviceName": "$SERVICE_NAME"
}
EOF
```

#### 1.5 systemd 服务

**目录调整（简化）：**
```bash
# 统一使用 /etc/${SERVICE_NAME}/
INSTALL_DIR="/etc/${SERVICE_NAME}"

# Gemini 方案更简洁，采纳
```

**systemd 服务：**
```ini
# /etc/systemd/system/${SERVICE_NAME}.service
[Unit]
Description=${SERVICE_NAME} Proxy Service
After=network.target

[Service]
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/${SERVICE_NAME} -C ${INSTALL_DIR}/config.json
Restart=on-failure
StandardOutput=null
StandardError=null

[Install]
WantedBy=multi-user.target
```

**启动命令：**
```bash
systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl start ${SERVICE_NAME}
```

#### 1.6 升级逻辑（精确控制）

**通过 serviceName 精确升级：**
```bash
upgrade_by_service_name() {
  TARGET_SERVICE_NAME="$1"
  CONF_FILE="/etc/${TARGET_SERVICE_NAME}/config.json"
  
  if [[ ! -f "$CONF_FILE" ]]; then
    echo "❌ 实例 '${TARGET_SERVICE_NAME}' 不存在"
    return 1
  fi
  
  # 验证 serviceName 匹配
  CONFIG_SERVICE_NAME=$(jq -r '.serviceName' "$CONF_FILE")
  if [[ "$CONFIG_SERVICE_NAME" != "$TARGET_SERVICE_NAME" ]]; then
    echo "❌ serviceName 不匹配"
    return 1
  fi
  
  INSTALL_DIR="/etc/${TARGET_SERVICE_NAME}"
  
  # 下载新版本
  curl -L "$DOWNLOAD_URL" -o "${INSTALL_DIR}/${TARGET_SERVICE_NAME}.new"
  if [[ ! -f "${INSTALL_DIR}/${TARGET_SERVICE_NAME}.new" || ! -s "${INSTALL_DIR}/${TARGET_SERVICE_NAME}.new" ]]; then
    echo "❌ 下载失败"
    return 1
  fi
  
  # 停止服务
  systemctl stop ${TARGET_SERVICE_NAME}
  
  # 替换文件
  mv "${INSTALL_DIR}/${TARGET_SERVICE_NAME}.new" "${INSTALL_DIR}/${TARGET_SERVICE_NAME}"
  chmod +x "${INSTALL_DIR}/${TARGET_SERVICE_NAME}"
  
  # 启动服务
  systemctl start ${TARGET_SERVICE_NAME}
  
  echo "✅ ${TARGET_SERVICE_NAME} 升级完成"
}
```
### 阶段 2：后端改动

#### 2.1 Node model 新增 ServiceName 字段

**文件：** `go-backend/internal/store/model/model.go`

```go
type Node struct {
    ID          int64  `gorm:"primaryKey;autoIncrement"`
    Name        string `gorm:"type:varchar(100);not null"`
    // ... 现有字段
    ServiceName string `gorm:"column:service_name;type:varchar(100);not null;default:'flux_agent'"`
}
```

**数据库迁移：**
```sql
ALTER TABLE node ADD COLUMN service_name VARCHAR(100) NOT NULL DEFAULT 'flux_agent';
```

#### 2.2 升级 API 传递 serviceName

**文件：** `go-backend/internal/http/handler/upgrade.go`

```go
func (h *Handler) nodeUpgrade(w http.ResponseWriter, r *http.Request) {
    // ... 现有逻辑
    
    // 获取 serviceName
    serviceName, _ := h.repo.GetNodeServiceName(req.ID)
    
    result, err := h.wsServer.SendCommand(req.ID, "UpgradeAgent", map[string]interface{}{
        "serviceName": serviceName,  // 新增字段
    }, upgradeTimeout)
    
    // ...
}
```

#### 2.3 agent 注册时接收并存储 serviceName

**文件：** `go-backend/internal/ws/handler.go`

```go
func (h *Handler) handleRegister(conn *websocket.Conn, msg RegisterMessage) {
    // ... 现有逻辑
    
    // 接收 serviceName
    serviceName := msg.Data.ServiceName
    if serviceName == "" {
        serviceName = "flux_agent"  // 默认值
    }
    
    // 存储到 node 表
    h.repo.UpdateNodeServiceNameBySecret(msg.Data.Secret, serviceName)
}
```

---

### 阶段 3：go-gost 改动

#### 3.1 读取 config.json 中的 serviceName

**文件：** `go-gost/config.go`

```go
type Config struct {
    Addr        string `json:"addr"`
    Secret      string `json:"secret"`
    ServiceName string `json:"serviceName"`
}

func LoadConfig(path string) (*Config, error) {
    // ... 现有逻辑
    
    config := &Config{}
    if err := json.Unmarshal(data, config); err != nil {
        return nil, err
    }
    
    // 默认值
    if config.ServiceName == "" {
        config.ServiceName = "flux_agent"
    }
    
    return config, nil
}
```

#### 3.2 注册时上报 serviceName

**文件：** `go-gost/main.go`

```go
func register(conn *websocket.Conn, config *Config) error {
    msg := RegisterMessage{
        Type: "register",
        Data: RegisterData{
            Secret:      config.Secret,
            ServiceName: config.ServiceName,  // 新增字段
        },
    }
    
    return websocket.JSON.Send(conn, msg)
}
```

#### 3.3 升级时使用 serviceName

**文件：** `go-gost/upgrade.go`

```go
func UpgradeAgent(params map[string]interface{}) error {
    serviceName, ok := params["serviceName"].(string)
    if !ok {
        return errors.New("serviceName required")
    }
    
    // 验证 serviceName 匹配
    config := GetConfig()
    if config.ServiceName != serviceName {
        return errors.New("serviceName mismatch")
    }
    
    // 执行升级逻辑
    // ...
}
```

---

### 阶段 4：前端改动（可选）

#### 4.1 节点列表显示服务名

**文件：** `vite-frontend/src/pages/node.tsx`

```typescript
interface Node {
    id: number;
    name: string;
    serviceName?: string;  // 新增字段
    // ... 其他字段
}

// 显示逻辑
{node.serviceName && node.serviceName !== 'flux_agent' && (
    <Badge color="primary">{node.serviceName}</Badge>
)}
```

#### 4.2 对接命令（无需改动）

**现有命令保持不变：**
```bash
# 国内机对接
curl -L https://chfs.646321.xyz:8/flvx/install.sh -o ./install.sh && \
chmod +x ./install.sh && \
./install.sh -a https://ny.041224.xyz -s 880cf0ba-d439-4f70-b40c-4534bc08a4ff

# 安装时提示
请输入服务名 [默认 flux_agent]:
```

---

### 阶段 5：测试计划

#### 5.1 单实例测试

```bash
# 测试 1：默认服务名
./install.sh -a https://panel.com -s SECRET
# 输入：（直接回车）
# 预期：创建 flux_agent.service，config.json 包含 "serviceName": "flux_agent"

# 测试 2：自定义服务名
./install.sh -a https://panel.com -s SECRET
# 输入：panel_a
# 预期：创建 panel_a.service，config.json 包含 "serviceName": "panel_a"

# 测试 3：服务名格式验证
./install.sh -a https://panel.com -s SECRET
# 输入：面板 A（包含中文和空格）
# 预期：提示错误，要求重新输入

# 测试 4：通过参数指定服务名
./install.sh -a https://panel.com -s SECRET -n my_panel
# 预期：不提示，直接创建 my_panel.service

# 测试 5：服务名冲突
./install.sh -a https://panel.com -s SECRET -n panel_a
# panel_a 已存在
# 预期：提示"❌ 错误：服务名 'panel_a' 已存在，请选择其他名称"
```

#### 5.2 多实例测试

```bash
# 安装第一个实例
./install.sh -a https://panel1.com -s SECRET1
# 输入：panel_a

# 安装第二个实例
./install.sh -a https://panel2.com -s SECRET2
# 输入：panel_b

# 测试 6：查看状态
systemctl status panel_a
systemctl status panel_b

# 测试 7：独立控制
systemctl stop panel_a
systemctl restart panel_b

# 测试 8：config.json 内容验证
cat /etc/panel_a/config.json
# 预期：{ "addr": "https://panel1.com", "secret": "SECRET1", "serviceName": "panel_a" }

cat /etc/panel_b/config.json
# 预期：{ "addr": "https://panel2.com", "secret": "SECRET2", "serviceName": "panel_b" }
```

#### 5.3 升级测试（精确控制）

```bash
# 测试 9：面板 A 升级
# 面板 A 点击升级按钮
# 预期：只升级 panel_a，不影响 panel_b

# 测试 10：面板 B 升级
# 面板 B 点击升级按钮
# 预期：只升级 panel_b，不影响 panel_a

# 测试 11：serviceName 不匹配
# 手动修改 config.json，将 panel_a 的 serviceName 改为 panel_b
# 面板 A 点击升级
# 预期：提示"❌ serviceName 不匹配"，拒绝升级
```

#### 5.4 注册上报测试

```bash
# 测试 12：agent 注册上报
# 启动 panel_a 实例
# 面板查看节点列表
# 预期：node.serviceName = "panel_a"

# 测试 13：默认值处理
# 安装时不指定服务名（直接回车）
# agent 启动注册
# 预期：node.serviceName = "flux_agent"
```

#### 5.5 卸载测试

```bash
# 测试 14：卸载单个实例
./install.sh uninstall
# 选择：panel_a
# 预期：卸载 panel_a，保留 panel_b

# 测试 15：清理映射
# 检查 /etc/panel_a/ 是否删除
# 预期：目录不存在
```

---

### 阶段 6：文档更新

#### 6.1 安装文档

**新增章节：**
```markdown
## 多面板对接

### 同一台机器安装多个面板

1. 安装第一个面板
   ```bash
   curl -L https://chfs.646321.xyz:8/flvx/install.sh -o ./install.sh
   chmod +x ./install.sh
   ./install.sh -a https://panel1.com -s SECRET1
   # 输入服务名：panel_a
   ```

2. 安装第二个面板
   ```bash
   ./install.sh -a https://panel2.com -s SECRET2
   # 输入服务名：panel_b
   ```

3. 查看服务状态
   ```bash
   systemctl status panel_a
   systemctl status panel_b
   
   # 查看所有 FLVX 实例
   systemctl list-units --full --all | grep "Proxy Service"
   ```

4. 独立控制
   ```bash
   systemctl stop panel_a
   systemctl restart panel_b
   ```

### 服务名命名规则

- ✅ 允许：字母 `a-zA-Z`、数字 `0-9`、下划线 `_`、短横线 `-`
- ❌ 不允许：中文、空格、特殊字符（如 `@`, `#`, `$`）
- 默认值：`flux_agent`（直接回车）
- 不能重复：同一台机器不能有相同的服务名

### 升级说明

面板升级时会自动传递 `serviceName`，只升级对应的实例，不影响其他面板的实例。

无需手动操作，点击面板的"升级"按钮即可。

### 常见问题

#### Q: 服务名冲突怎么办？
A: 安装时会检测服务名是否已存在，如果冲突会提示选择其他名称。

#### Q: 如何查看某个实例的配置文件？
A: 配置文件位于 `/etc/<SERVICE_NAME>/config.json`

#### Q: 升级失败会影响其他实例吗？
A: 不会，每个实例独立升级，互不影响。

#### Q: 如何卸载指定实例？
A: 运行 `./install.sh uninstall`，选择要卸载的实例名称。
```

---

## 实施时间估算

| 阶段 | 工作量 | 依赖 |
|------|--------|------|
| install.sh 改动 | 2-3 小时 | 无 |
| 后端改动（Model/API/WebSocket） | 3-4 小时 | install.sh 完成 |
| go-gost 改动 | 2-3 小时 | 后端完成 |
| 前端改动（可选） | 1-2 小时 | 后端完成 |
| 测试 | 2-3 小时 | 全部完成 |
| 文档更新 | 1-2 小时 | 测试完成 |
| **总计** | **11-17 小时** | - |

---

## 风险点

1. **go-gost 兼容性**：需要确保新老版本 agent 都能正常工作
2. **数据库迁移**：现有 node 表需要添加 service_name 字段
3. **向后兼容**：老节点没有 serviceName，需要默认值处理
4. **升级原子性**：升级失败需要回滚机制

---

## 验收标准

1. ✅ 单实例安装（默认服务名）正常工作
2. ✅ 自定义服务名安装正常工作
3. ✅ 服务名格式验证正常工作
4. ✅ 服务名冲突检测正常工作
5. ✅ 多实例安装正常工作
6. ✅ agent 注册时上报 serviceName
7. ✅ 面板存储并显示 serviceName
8. ✅ 升级时精确控制指定实例
9. ✅ 所有实例独立运行互不影响
10. ✅ 卸载支持指定实例

---

## 后续优化（可选）

1. **批量操作** - 按服务名批量重启/升级/删除节点
2. **实例标签** - 支持给实例添加标签便于管理
3. **资源限制** - 限制单台机器最大实例数量
4. **健康检查** - 定期检查所有实例状态

---

## 相关文件

- `install.sh` - 安装脚本（主要改动文件）
- `go-backend/internal/store/model/model.go` - Node model（新增 service_name 字段）
- `go-backend/internal/http/handler/upgrade.go` - 升级 API（传递 serviceName）
- `go-backend/internal/ws/handler.go` - WebSocket 注册（接收 serviceName）
- `go-gost/config.go` - 配置读取（读取 serviceName）
- `go-gost/main.go` - 注册上报（上报 serviceName）
- `go-gost/upgrade.go` - 升级逻辑（验证 serviceName）
- `plans/069-node-install-domestic-overseas-offline.md` - 三种对接方式计划（已完成）
- `plans/070-multi-panel-support.md` - 本文档（待实施）

---

## 变更记录

### 2026-04-05 - 更新升级方案

**变更内容：**
- 原方案：自动检测所有实例升级
- 新方案：通过 `serviceName` 精确控制指定实例

**变更原因：**
- 不同面板的节点升级应该是独立的
- 面板 A 升级不应影响面板 B 的实例
- 需要精确控制到具体实例

**实施方案：**
1. 安装时写入 `serviceName` 到 `config.json`
2. agent 启动时上报 `serviceName` 给面板
3. 面板存储到 `node` 表
4. 升级时传递 `serviceName` 给 agent
5. agent 验证 `serviceName` 匹配后执行升级
  # 如果只有一个实例，直接卸载
  if [[ ${#INSTALLED_SERVICES[@]} -eq 1 ]]; then
    SERVICE=$INSTALLED_SERVICES
    read -p "确认卸载 ${SERVICE}？(y/N): " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
      echo "❌ 取消卸载"
      return 0
    fi
  else
    # 多个实例，要求指定
    read -p "请输入要卸载的服务名：" SERVICE_NAME
    if [[ ! " ${INSTALLED_SERVICES[@]} " =~ " ${SERVICE_NAME} " ]]; then
      echo "❌ 服务名 '${SERVICE_NAME}' 不存在"
      return 1
    fi
    SERVICE=${SERVICE_NAME}
  fi
  
  # 执行卸载
  INSTALL_DIR=$(systemctl show ${SERVICE} -p WorkingDirectory --value)
  systemctl stop ${SERVICE}
  systemctl disable ${SERVICE}
  rm -f /etc/systemd/system/${SERVICE}.service
  rm -rf "$INSTALL_DIR"
  systemctl daemon-reload
  
  echo "✅ ${SERVICE} 卸载完成"
}
```

---

### 阶段 2：测试计划

#### 2.1 单实例测试

```bash
# 测试 1：默认服务名
./install.sh -a https://panel.com -s SECRET
# 输入：（直接回车）
# 预期：创建 flux_agent.service

# 测试 2：自定义服务名
./install.sh -a https://panel.com -s SECRET
# 输入：panel_a
# 预期：创建 panel_a.service

# 测试 3：服务名格式验证
./install.sh -a https://panel.com -s SECRET
# 输入：面板 A（包含中文和空格）
# 预期：提示错误，要求重新输入

# 测试 4：通过参数指定服务名
./install.sh -a https://panel.com -s SECRET -n my_panel
# 预期：不提示，直接创建 my_panel.service
```

#### 2.2 多实例测试

```bash
# 安装第一个实例
./install.sh -a https://panel1.com -s SECRET1
# 输入：panel_a

# 安装第二个实例
./install.sh -a https://panel2.com -s SECRET2
# 输入：panel_b

# 测试 5：服务名冲突
./install.sh -a https://panel3.com -s SECRET3
# 输入：panel_a
# 预期：提示"❌ 错误：服务名 'panel_a' 已存在，请选择其他名称"

# 测试 6：查看状态
systemctl status panel_a
systemctl status panel_b
systemctl list-units --full --all | grep "FLVX Agent"

# 测试 7：独立控制
systemctl stop panel_a
systemctl start panel_b
systemctl restart panel_a
```

#### 2.3 升级测试

```bash
# 测试 8：升级单个实例
./install.sh update
# 预期：自动检测并升级 flux_agent.service

# 测试 9：升级多个实例
./install.sh update
# 预期：逐个升级 panel_a.service 和 panel_b.service
# 输出：
# 🔍 检测到 2 个实例，开始升级...
# 🔧 正在升级 panel_a.service...
# ✅ panel_a.service 升级完成
# 🔧 正在升级 panel_b.service...
# ✅ panel_b.service 升级完成
# 🎉 所有实例升级完成

# 测试 10：升级失败回滚
# 模拟下载失败
# 预期：跳过失败实例，继续升级其他实例
```

#### 2.4 卸载测试

```bash
# 测试 11：卸载单个实例（无确认）
./install.sh uninstall
# 预期：提示选择要卸载的实例

# 测试 12：卸载指定实例
./install.sh uninstall panel_a
# 预期：卸载 panel_a.service，保留其他实例
```

---

### 阶段 3：前端改动（可选优化）

#### 3.1 节点列表显示服务名

**新增字段：**
```typescript
interface Node {
  id: number;
  name: string;
  serviceName?: string;  // 新增：服务名
  // ... 其他字段
}
```

**显示逻辑：**
- 默认服务名（`flux_agent`）不显示
- 自定义服务名在节点卡片显示徽章：`panel_a`

#### 3.2 对接命令（无需改动）

**现有命令保持不变：**
```bash
# 国内机对接
curl -L https://chfs.646321.xyz:8/flvx/install.sh -o ./install.sh && \
chmod +x ./install.sh && \
./install.sh -a https://ny.041224.xyz -s 880cf0ba-d439-4f70-b40c-4534bc08a4ff

# 安装时提示
请输入服务名 [默认 flux_agent]:
```

---

### 阶段 4：文档更新

#### 4.1 安装文档

**新增章节：**
```markdown
## 多面板对接

### 同一台机器安装多个面板

1. 安装第一个面板
   ```bash
   curl -L https://chfs.646321.xyz:8/flvx/install.sh -o ./install.sh
   chmod +x ./install.sh
   ./install.sh -a https://panel1.com -s SECRET1
   # 输入服务名：panel_a
   ```

2. 安装第二个面板
   ```bash
   ./install.sh -a https://panel2.com -s SECRET2
   # 输入服务名：panel_b
   ```

3. 查看服务状态
   ```bash
   systemctl status panel_a
   systemctl status panel_b
   
   # 查看所有 FLVX 实例
   systemctl list-units --full --all | grep "FLVX Agent"
   ```

4. 独立控制
   ```bash
   systemctl stop panel_a
   systemctl restart panel_b
   ```

### 服务名命名规则

- ✅ 允许：字母 `a-zA-Z`、数字 `0-9`、下划线 `_`、短横线 `-`
- ❌ 不允许：中文、空格、特殊字符（如 `@`, `#`, `$`）
- 默认值：`flux_agent`（直接回车）
- 不能重复：同一台机器不能有相同的服务名

### 升级所有实例

```bash
# 自动检测并升级所有已安装的实例
./install.sh update
```

### 卸载实例

```bash
# 卸载指定实例
./install.sh uninstall panel_a

# 或交互式选择
./install.sh uninstall
```

### 常见问题

#### Q: 服务名冲突怎么办？
A: 安装时会检测服务名是否已存在，如果冲突会提示选择其他名称。

#### Q: 如何查看某个实例的配置文件？
A: 配置文件位于 `/etc/flux_agent_<SERVICE_NAME>/config.json`

#### Q: 升级失败会影响其他实例吗？
A: 不会，升级是逐个进行的，失败的实例会被跳过。
```

---

## 实施时间估算

| 阶段 | 工作量 | 依赖 |
|------|--------|------|
| install.sh 改动 | 3-4 小时 | 无 |
| 测试 | 2-3 小时 | install.sh 完成 |
| 文档更新 | 1-2 小时 | 测试完成 |
| **总计** | **6-9 小时** | - |

---

## 风险点

1. **systemd 兼容性**：不同 Linux 发行版的 systemd 可能有细微差异
2. **权限问题**：创建 `/etc/systemd/system/` 需要 root 权限
3. **服务名冲突**：用户可能输入已存在的系统服务名（如 `nginx`）
4. **升级回滚**：升级失败后如何回滚到旧版本
5. **资源竞争**：多个实例同时运行可能占用过多资源

---

## 验收标准

1. ✅ 单实例安装（默认服务名）正常工作
2. ✅ 自定义服务名安装正常工作
3. ✅ 服务名格式验证正常工作
4. ✅ 服务名冲突检测正常工作
5. ✅ 多实例安装正常工作
6. ✅ 升级自动检测已安装服务
7. ✅ 所有实例独立运行互不影响
8. ✅ 卸载支持指定实例

---

## 后续优化（可选）

1. **前端显示服务名** - 节点列表显示实例所属服务
2. **批量操作** - 按服务名批量重启/升级/删除节点
3. **资源限制** - 限制单台机器最大实例数量
4. **实例标签** - 支持给实例添加标签便于管理

---

## 相关文件

- `install.sh` - 安装脚本（主要改动文件）
- `plans/069-node-install-domestic-overseas-offline.md` - 三种对接方式计划（已完成）
- `plans/070-multi-panel-support.md` - 本文档（待实施）

---

## 变更记录

### 2026-04-07 - 更新服务名输入逻辑

**问题发现：**
- 使用 `-a` 和 `-s` 参数安装时，不会提示输入服务名
- 原因：`get_config_params()` 只在参数为空时才询问

**修复方案：**
- 修改 `get_config_params()` 始终询问服务名（除非使用 `-n` 参数指定）
- 即使提供了 `-a` 和 `-s`，也会提示"服务名 (默认：flux_agent):"
- 用户可以直接回车使用默认值，或输入自定义服务名

**修改位置：**
- `install.sh` 第 256-280 行

**修改逻辑：**
```bash
get_config_params() {
  # 始终询问服务名（除非使用 -n 参数指定）
  if [[ -z "$SPECIFIED_SERVICE_NAME" ]]; then
    read -p "服务名 (默认：${SERVICE_NAME}): " input_name
    if [[ -n "$input_name" ]]; then
      SERVICE_NAME="$input_name"
      INSTALL_DIR="/etc/${SERVICE_NAME}"
    fi
  fi
  
  # 如果 SERVER_ADDR 或 SECRET 为空，询问
  if [[ -z "$SERVER_ADDR" ]]; then
    read -p "服务器地址：" SERVER_ADDR
  fi
  
  if [[ -z "$SECRET" ]]; then
    read -p "密钥：" SECRET
  fi
}
```

**实施状态：** ⏳ 待实施
