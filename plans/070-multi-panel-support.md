# 070-multi-panel-support.md

**Created:** 2026-04-05
**Feature:** 多面板对接支持 - 自定义服务名实现单机器多实例

---

## 背景

当前 FLVX 节点只能一对一连接面板，无法在同一台机器上安装多个节点连接不同面板。需要支持：

1. **单机器多实例** - 同一台 VPS 可以安装多个 FLVX agent，分别连接不同面板
2. **自定义服务名** - 用户可以自定义 systemd 服务名以便区分
3. **升级自动化** - 升级时自动检测并升级所有已安装实例

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

### 场景 3：批量升级

**用户需求：**
- 一键升级所有实例
- 无需记住每个实例的服务名

**当前限制：**
- 升级逻辑未考虑多实例场景

---

## 决策确认

### 用户确认的实施细节

1. **服务名验证规则**：`^[a-zA-Z0-9_-]+$` ✅
2. **默认值**：`flux_agent`（用户直接回车使用默认值）✅
3. **服务名重复**：提示已存在，要求重新输入 ✅
4. **升级逻辑**：自动检测已安装的服务，无需指定服务名 ✅

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
│   ├── config.json
│   ├── gost.json
│   └── flux_agent (二进制)
├── flux_agent_panel_a/            # 自定义实例
│   ├── config.json
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

#### 1.4 升级逻辑

**自动检测已安装的服务：**
```bash
update_flux_agent() {
  # 检测已安装的服务（通过 Description 匹配）
  INSTALLED_SERVICES=$(systemctl list-units --full --all | grep "FLVX Agent" | awk '{print $1}')
  
  if [[ -z "$INSTALLED_SERVICES" ]]; then
    echo "❌ 未检测到已安装的 FLVX Agent"
    return 1
  fi
  
  echo "🔍 检测到 ${#INSTALLED_SERVICES[@]} 个实例，开始升级..."
  
  # 逐个升级
  for SERVICE in $INSTALLED_SERVICES; do
    echo "🔧 正在升级 ${SERVICE}..."
    
    # 获取安装目录
    INSTALL_DIR=$(systemctl show ${SERVICE} -p WorkingDirectory --value)
    
    # 下载新版本
    curl -L "$DOWNLOAD_URL" -o "${INSTALL_DIR}/flux_agent.new"
    if [[ ! -f "${INSTALL_DIR}/flux_agent.new" || ! -s "${INSTALL_DIR}/flux_agent.new" ]]; then
      echo "❌ 下载失败，跳过 ${SERVICE}"
      continue
    fi
    
    # 停止服务
    systemctl stop ${SERVICE}
    
    # 替换文件
    mv "${INSTALL_DIR}/flux_agent.new" "${INSTALL_DIR}/flux_agent"
    chmod +x "${INSTALL_DIR}/flux_agent"
    
    # 启动服务
    systemctl start ${SERVICE}
    
    echo "✅ ${SERVICE} 升级完成"
  done
  
  echo "🎉 所有实例升级完成"
}
```

#### 1.5 卸载逻辑

**支持卸载指定实例：**
```bash
uninstall_flux_agent() {
  # 检测已安装的服务
  INSTALLED_SERVICES=$(systemctl list-units --full --all | grep "FLVX Agent" | awk '{print $1}')
  
  if [[ -z "$INSTALLED_SERVICES" ]]; then
    echo "❌ 未检测到已安装的 FLVX Agent"
    return 1
  fi
  
  # 显示已安装的实例
  echo "📋 已安装的实例："
  for SERVICE in $INSTALLED_SERVICES; do
    INSTALL_DIR=$(systemctl show ${SERVICE} -p WorkingDirectory --value)
    echo "  - ${SERVICE} (${INSTALL_DIR})"
  done
  
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
