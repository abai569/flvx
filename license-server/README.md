# License Server

FLVX 面板的独立 License 生成和管理服务器。

## 功能特性

- ✅ **License 生成** - 在线生成 RSA 签名的 License
- ✅ **域名绑定** - 每个 License 绑定到特定域名
- ✅ **时长控制** - 支持 1-12 个月灵活授权
- ✅ **管理后台** - 查看统计、吊销/激活 License
- ✅ **安全隔离** - 独立部署，私钥安全存储
- ✅ **Web 界面** - 简洁易用的生成器界面

## 快速开始

### 方式一：直接运行

```bash
cd license-server
go run ./cmd/server -addr :8080
```

访问 http://localhost:8080

### 方式二：Docker 部署

```bash
docker-compose up -d
```

访问 http://localhost:8080

## API 文档

### 生成 License

```bash
POST /api/v1/generate
Headers:
  X-Admin-Token: your-token
Body:
{
  "domain": "panel.example.com",
  "months": 3
}

Response:
{
  "success": true,
  "data": {
    "license_key": "eyJhbGc...",
    "domain": "panel.example.com",
    "months": 3,
    "expired_at": 1719849600,
    "expired_date": "2026-07-01"
  }
}
```

### 查看统计

```bash
GET /api/v1/stats
Headers:
  X-Admin-Token: your-token

Response:
{
  "success": true,
  "stats": {
    "total": 100,
    "active": 85,
    "revoked": 15
  }
}
```

### 吊销 License

```bash
POST /api/v1/revoke?id=1
Headers:
  X-Admin-Token: your-token
```

## 配置选项

```
-addr         服务器监听地址 (默认：:8080)
-data         数据目录 (默认：./data)
-config       配置目录 (默认：./config)
-admin-token  管理员认证 token (可选，空则不验证)
```

## 使用流程

1. **部署服务器**
   - 在安全环境部署（建议海外/新加坡）
   - 配置 HTTPS（生产环境必需）

2. **生成 License**
   - 访问 Web 界面
   - 输入域名和时长
   - 点击生成
   - 下载 license.json

3. **分发给客户**
   - 发送 license.json 文件
   - 客户在面板导入

4. **管理 License**
   - 查看统计数据
   - 吊销违规 License
   - 轮换 RSA 密钥

## 安全建议

1. **HTTPS** - 生产环境必须使用 HTTPS
2. **Admin Token** - 设置强 token 并保密
3. **密钥备份** - 定期备份 config/private_key.pem
4. **访问控制** - 限制服务器访问 IP
5. **日志审计** - 定期检查访问日志

## 文件结构

```
license-server/
├── cmd/server/main.go          # 服务入口
├── internal/
│   ├── handler/                # HTTP 处理器
│   ├── license/                # License 核心逻辑
│   └── middleware/             # 中间件
├── static/
│   └── index.html              # Web 界面
├── data/
│   └── licenses.db             # SQLite 数据库
├── config/
│   └── private_key.pem         # RSA 私钥
├── Dockerfile
└── docker-compose.yml
```

## 与 FLVX 面板集成

在 FLVX 面板中激活 License：

1. 访问面板 `/license` 页面
2. 粘贴 license_key
3. 点击"激活授权"

面板会验证：
- RSA 签名有效性
- 域名匹配（当前访问域名）
- 是否过期

## 技术栈

- **后端**: Go 1.24, Gorilla Mux, GORM, SQLite
- **前端**: 原生 HTML/CSS/JS (无框架依赖)
- **加密**: RSA-2048, SHA-256
- **部署**: Docker, Docker Compose

## License

本软件为 FLVX 项目的一部分，仅供内部使用。
