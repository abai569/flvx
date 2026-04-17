# FLVX 授权系统部署指南

## 概述

FLVX 授权系统由两部分组成：
1. **License Server** - 独立授权生成服务器（部署在安全环境）
2. **FLVX Panel** - 用户面板（集成 License 验证）

## 架构

```
┌─────────────────────────────────────┐
│   License Server (授权服务器)        │
│   部署：新加坡/海外安全环境           │
│   端口：8080                        │
│                                     │
│   - License 生成                    │
│   - RSA-2048 签名                   │
│   - 管理后台                        │
└─────────────────────────────────────┘
              │
              │ License Key
              │
              ▼
┌─────────────────────────────────────┐
│   FLVX Panel (用户面板)              │
│   部署：用户环境                     │
│   端口：6365                        │
│                                     │
│   - License 激活                    │
│   - 域名验证                        │
│   - 签名验证                        │
└─────────────────────────────────────┘
```

---

## 第一部分：部署 License Server

### 方式 A: Docker 部署（推荐）

1. **准备服务器**
   ```bash
   # 建议配置
   - CPU: 1 核
   - 内存：512MB
   - 存储：1GB
   - 系统：Ubuntu 22.04 / Debian 12
   ```

2. **安装 Docker**
   ```bash
   curl -fsSL https://get.docker.com | sh
   systemctl enable docker
   systemctl start docker
   ```

3. **部署**
   ```bash
   # 克隆项目
   git clone https://github.com/abai569/flvx.git
   cd flvx/license-server
   
   # 修改配置
   vim docker-compose.yml
   # 修改 ADMIN_TOKEN 为强密码
   
   # 启动
   docker-compose up -d
   ```

4. **配置 HTTPS（生产环境必需）**
   ```bash
   # 使用 Nginx 反向代理
   apt install nginx certbot python3-certbot-nginx
   
   # 配置 Nginx
   cat > /etc/nginx/sites-available/license <<EOF
   server {
       listen 80;
       server_name license.yourdomain.com;
       
       location / {
           proxy_pass http://localhost:8080;
           proxy_set_header Host \$host;
           proxy_set_header X-Real-IP \$remote_addr;
       }
   }
   EOF
   
   ln -s /etc/nginx/sites-available/license /etc/nginx/sites-enabled/
   nginx -t
   systemctl reload nginx
   
   # 申请证书
   certbot --nginx -d license.yourdomain.com
   ```

5. **验证部署**
   ```bash
   curl https://license.yourdomain.com/api/v1/stats
   # 应返回统计数据
   ```

### 方式 B: 直接运行

1. **安装 Go**
   ```bash
   wget https://go.dev/dl/go1.24.0.linux-amd64.tar.gz
   tar -C /usr/local -xzf go1.24.0.linux-amd64.tar.gz
   export PATH=$PATH:/usr/local/go/bin
   ```

2. **编译运行**
   ```bash
   cd license-server
   go build -o license-server ./cmd/server
   ./license-server -addr :8080
   ```

3. **Systemd 服务**
   ```bash
   cat > /etc/systemd/system/license-server.service <<EOF
   [Unit]
   Description=FLVX License Server
   After=network.target
   
   [Service]
   Type=simple
   User=root
   WorkingDirectory=/opt/license-server
   ExecStart=/opt/license-server/license-server -addr :8080
   Restart=always
   
   [Install]
   WantedBy=multi-user.target
   EOF
   
   systemctl daemon-reload
   systemctl enable license-server
   systemctl start license-server
   ```

---

## 第二部分：配置 FLVX 面板

### 更新面板代码

1. **确保面板已更新到最新版本**
   ```bash
   cd /opt/flvx/go-backend
   git pull
   make build
   systemctl restart paneld
   ```

2. **验证 License 功能**
   - 访问面板 Dashboard
   - 查看"授权状态"卡片（公告下方）
   - 点击"管理授权"进入 `/license` 页面

### 导入 RSA 公钥

License Server 生成后会提供公钥，需要配置到面板中：

1. **获取公钥**
   ```bash
   curl https://license.yourdomain.com/api/v1/public-key
   # 返回 PEM 格式的公钥
   ```

2. **配置到面板**
   ```bash
   # 编辑面板代码
   vim /opt/flvx/go-backend/internal/http/handler/license_handler.go
   
   # 替换 DefaultPublicKeyPEM 常量
   ```

3. **重启面板**
   ```bash
   systemctl restart paneld
   ```

---

## 第三部分：生成和分发 License

### 生成 License

1. **访问 Web 界面**
   ```
   https://license.yourdomain.com
   ```

2. **填写信息**
   - 绑定域名：`panel.customer.com`
   - 授权时长：3 个月（可选 1-12）

3. **生成并下载**
   - 点击"生成 License"
   - 复制 License Key 或下载 `license.json`

### 分发给客户

通过邮件或聊天工具发送：
```
感谢您的购买！

License 信息:
- 绑定域名：panel.customer.com
- 授权时长：3 个月
- 过期时间：2026-07-16

License Key:
eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...

激活步骤:
1. 访问面板 /license 页面
2. 粘贴 License Key
3. 点击"激活授权"
```

---

## 第四部分：日常管理

### 查看统计

```bash
curl -H "X-Admin-Token: your-token" \
     https://license.yourdomain.com/api/v1/stats
```

返回：
```json
{
  "stats": {
    "total": 100,
    "active": 85,
    "revoked": 15
  }
}
```

### 吊销 License

对于违规用户：

1. **Web 界面操作**
   - 访问管理后台（开发中）
   - 找到对应 License
   - 点击"吊销"

2. **API 操作**
   ```bash
   curl -X POST -H "X-Admin-Token: your-token" \
        "https://license.yourdomain.com/api/v1/revoke?id=1"
   ```

### 轮换密钥

建议每 6-12 个月轮换 RSA 密钥：

1. **备份旧密钥**
   ```bash
   cp config/private_key.pem config/private_key.pem.bak.$(date +%Y%m%d)
   ```

2. **删除旧密钥（重启时会自动生成）**
   ```bash
   rm config/private_key.pem
   docker-compose restart
   ```

3. **更新面板公钥**
   - 获取新公钥
   - 更新面板代码
   - 重启面板

---

## 故障排查

### License Server 无法启动

```bash
# 查看日志
docker-compose logs license-server

# 检查端口
netstat -tlnp | grep 8080

# 检查权限
ls -la config/ data/
```

### License 验证失败

1. **检查域名匹配**
   - License 绑定的域名必须与面板访问域名一致
   - 支持通配符：`*.example.com` 匹配 `panel.example.com`

2. **检查时间同步**
   ```bash
   date
   # 确保服务器时间准确
   ```

3. **检查公钥配置**
   - 确保面板中的公钥与 License Server 匹配

### 数据库损坏

```bash
# 备份数据
cp data/licenses.db data/licenses.db.bak

# 重启服务（会自动创建新数据库）
docker-compose restart

# 注意：License 记录会丢失，需重新生成
```

---

## 安全建议

1. **HTTPS 必需**
   - 生产环境必须使用 HTTPS
   - 使用 Let's Encrypt 免费证书

2. **强 Admin Token**
   ```bash
   # 生成随机 token
   openssl rand -hex 32
   ```

3. **限制访问 IP**
   ```nginx
   # Nginx 配置
   allow 1.2.3.4;  # 只允许特定 IP
   deny all;
   ```

4. **定期备份**
   ```bash
   # 备份脚本
   tar -czf license-server-backup-$(date +%Y%m%d).tar.gz \
       config/ data/
   ```

5. **监控告警**
   - 监控服务可用性
   - 监控 License 生成频率
   - 异常访问告警

---

## 技术支持

遇到问题请提交 Issue 或联系技术支持团队。
