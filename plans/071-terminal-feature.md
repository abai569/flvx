# 071-terminal-feature.md

**Created:** 2026-04-09
**Feature:** Web SSH 终端功能 - 通过 Agent 实现远程终端

---

## 需求概述

在监控页面的节点列表中添加"操作"列，包含"终端"功能，点击后在新标签页打开 SSH 终端。

### 核心需求

1. **通过 Agent 实现** - 复用现有的 WebSocket 连接
2. **危险命令过滤** - 禁止 `rm -rf /` 等危险命令
3. **命令日志记录** - 记录所有终端操作
4. **会话超时** - 5 分钟不活动自动断开
5. **日志存储** - 文件存储，保留 30 天

---

## 技术方案

### 架构设计

```
┌─────────────────┐
│   浏览器        │
│  (新标签页)     │
│   xterm.js      │
└────────────────┘
         │ WebSocket
         │ (终端数据)
         ↓
┌─────────────────┐
│   面板          │
│  (WebSocket     │
│   服务器)       │
│  (会话管理)     │
│  (日志记录)     │
└────────┬────────┘
         │ WebSocket (现有连接)
         ↓
┌─────────────────┐
│   Agent         │
│  (PTY 会话)     │
│  (Shell 执行)   │
│  (命令过滤)     │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│   节点 Shell     │
│   (/bin/bash)   │
└─────────────────┘
```

### 数据流

1. **连接建立**
   - 用户点击"终端"按钮
   - 打开新标签页 `/terminal/:nodeId`
   - 前端 → WebSocket → 面板 → WebSocket → Agent
   - Agent 创建 PTY 会话
   - 认证成功后显示终端界面

2. **终端操作**
   - 用户在终端输入命令
   - 前端 → WebSocket → 面板 → WebSocket → Agent
   - Agent 过滤危险命令
   - Agent → Shell 执行命令
   - 输出沿原路返回到前端

3. **会话管理**
   - 5 分钟不活动自动断开
   - 关闭标签页自动断开
   - 记录所有操作到日志文件

---

## 实施计划

### 阶段 1：Agent 开发（4-6 小时）

#### 1.1 PTY 支持（2-3 小时）

**文件：** `go-gost/x/terminal/pty.go`

**功能：**
- PTY 创建和管理
- Shell 进程管理
- 输入/输出转发

**实现代码：**
```go
package terminal

import (
    "io"
    "os"
    "os/exec"
    
    "github.com/creack/pty"
)

type Session struct {
    PTY *os.File
    Cmd *exec.Cmd
}

// 创建终端会话
func NewSession(shell string) (*Session, error) {
    cmd := exec.Command(shell)
    ptm, err := pty.Start(cmd)
    if err != nil {
        return nil, err
    }
    
    return &Session{
        PTY: ptm,
        Cmd: cmd,
    }, nil
}

// 读取输出
func (s *Session) ReadOutput() ([]byte, error) {
    buf := make([]byte, 1024)
    n, err := s.PTY.Read(buf)
    if err != nil {
        return nil, err
    }
    return buf[:n], nil
}

// 写入输入
func (s *Session) WriteInput(data []byte) error {
    _, err := s.PTY.Write(data)
    return err
}

// 关闭会话
func (s *Session) Close() error {
    if s.PTY != nil {
        s.PTY.Close()
    }
    if s.Cmd != nil && s.Cmd.Process != nil {
        s.Cmd.Process.Kill()
    }
    return nil
}

// 调整窗口大小
func (s *Session) Resize(width, height int) error {
    return pty.Setsize(s.PTY, &pty.Winsize{
        Rows: uint16(height),
        Cols: uint16(width),
    })
}
```

**依赖：**
```bash
go get github.com/creack/pty
```

---

#### 1.2 命令过滤（1 小时）

**文件：** `go-gost/x/terminal/filter.go`

**功能：**
- 危险命令过滤
- 命令白名单/黑名单

**实现代码：**
```go
package terminal

import (
    "regexp"
    "strings"
)

var dangerousCommands = []string{
    "rm -rf /",
    "rm -rf /*",
    "mkfs",
    "dd if=/dev/zero",
    ":(){:|:&};:",  // fork bomb
    "shutdown",
    "reboot",
    "halt",
    "poweroff",
    "init 0",
    "init 6",
}

var dangerousPatterns = []*regexp.Regexp{
    regexp.MustCompile(`rm\s+-rf\s+/`),
    regexp.MustCompile(`mkfs\..+`),
    regexp.MustCompile(`dd\s+if=/dev/zero`),
}

// 检查命令是否危险
func IsDangerousCommand(cmd string) bool {
    // 检查黑名单
    for _, dangerous := range dangerousCommands {
        if strings.Contains(cmd, dangerous) {
            return true
        }
    }
    
    // 检查正则匹配
    for _, pattern := range dangerousPatterns {
        if pattern.MatchString(cmd) {
            return true
        }
    }
    
    return false
}
```

---

#### 1.3 WebSocket 协议（1-2 小时）

**文件：** `go-gost/x/terminal/handler.go`

**功能：**
- WebSocket 消息处理
- PTY 会话管理
- 心跳和超时

**消息格式：**
```json
// 前端 → Agent
{
    "type": "input",
    "data": "ls -la\n"
}

// 前端 → Agent
{
    "type": "resize",
    "width": 80,
    "height": 24
}

// Agent → 前端
{
    "type": "output",
    "data": "total 0\n..."
}

// Agent → 前端
{
    "type": "error",
    "message": "Dangerous command blocked"
}
```

**实现代码：**
```go
package terminal

import (
    "encoding/json"
    "time"
    
    "github.com/gorilla/websocket"
)

type Message struct {
    Type   string      `json:"type"`
    Data   string      `json:"data,omitempty"`
    Width  int         `json:"width,omitempty"`
    Height int         `json:"height,omitempty"`
    Message string     `json:"message,omitempty"`
}

type Handler struct {
    Session *Session
    Conn    *websocket.Conn
    Timeout time.Duration
}

// 处理消息
func (h *Handler) HandleMessage() error {
    for {
        h.Conn.SetReadDeadline(time.Now().Add(h.Timeout))
        
        _, message, err := h.Conn.ReadMessage()
        if err != nil {
            return err
        }
        
        var msg Message
        if err := json.Unmarshal(message, &msg); err != nil {
            return err
        }
        
        switch msg.Type {
        case "input":
            // 检查危险命令
            if IsDangerousCommand(msg.Data) {
                h.Conn.WriteJSON(Message{
                    Type:    "error",
                    Message: "Dangerous command blocked",
                })
                continue
            }
            
            // 写入 PTY
            h.Session.WriteInput([]byte(msg.Data))
            
        case "resize":
            // 调整窗口大小
            h.Session.Resize(msg.Width, msg.Height)
        }
    }
}

// 读取输出
func (h *Handler) ReadOutput() error {
    for {
        buf, err := h.Session.ReadOutput()
        if err != nil {
            return err
        }
        
        h.Conn.WriteJSON(Message{
            Type: "output",
            Data: string(buf),
        })
    }
}
```

---

### 阶段 2：后端开发（4-6 小时）

#### 2.1 WebSocket 端点（2-3 小时）

**文件：** `go-backend/internal/http/handler/terminal.go`

**功能：**
- WebSocket 端点
- 消息转发
- 会话管理

**实现代码：**
```go
package handler

import (
    "net/http"
    
    "github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
    CheckOrigin: func(r *http.Request) bool {
        return true  // TODO: 添加 CORS 检查
    },
}

// TerminalWebSocket 处理终端 WebSocket 连接
func (h *Handler) TerminalWebSocket(w http.ResponseWriter, r *http.Request) {
    nodeId := parseNodeId(r)
    
    // 升级 WebSocket
    conn, err := upgrader.Upgrade(w, r, nil)
    if err != nil {
        return
    }
    defer conn.Close()
    
    // 获取节点
    node, err := h.repo.GetNode(nodeId)
    if err != nil {
        return
    }
    
    // 连接到 Agent
    agentConn, err := h.getAgentConnection(nodeId)
    if err != nil {
        return
    }
    defer agentConn.Close()
    
    // 转发消息
    go h.forwardToAgent(conn, agentConn)
    h.forwardToFrontend(conn, agentConn)
}

// 转发到 Agent
func (h *Handler) forwardToAgent(clientConn, agentConn *websocket.Conn) {
    for {
        _, message, err := clientConn.ReadMessage()
        if err != nil {
            return
        }
        
        agentConn.WriteMessage(websocket.TextMessage, message)
    }
}

// 转发到前端
func (h *Handler) forwardToFrontend(clientConn, agentConn *websocket.Conn) {
    for {
        _, message, err := agentConn.ReadMessage()
        if err != nil {
            return
        }
        
        clientConn.WriteMessage(websocket.TextMessage, message)
    }
}
```

---

#### 2.2 会话管理（1-2 小时）

**文件：** `go-backend/internal/service/terminal_service.go`

**功能：**
- 会话创建/销毁
- 超时自动断开
- 并发连接数限制

**实现代码：**
```go
package service

import (
    "sync"
    "time"
)

type TerminalSession struct {
    ID        string
    NodeID    int64
    UserID    int64
    Conn      *websocket.Conn
    CreatedAt time.Time
    LastActive time.Time
}

type TerminalService struct {
    sessions map[string]*TerminalSession
    mu       sync.RWMutex
    Timeout  time.Duration
}

func NewTerminalService() *TerminalService {
    return &TerminalService{
        sessions: make(map[string]*TerminalSession),
        Timeout:  5 * time.Minute,  // 5 分钟超时
    }
}

// 创建会话
func (s *TerminalService) CreateSession(id string, nodeId, userId int64, conn *websocket.Conn) {
    s.mu.Lock()
    defer s.mu.Unlock()
    
    s.sessions[id] = &TerminalSession{
        ID:         id,
        NodeID:     nodeId,
        UserID:     userId,
        Conn:       conn,
        CreatedAt:  time.Now(),
        LastActive: time.Now(),
    }
}

// 销毁会话
func (s *TerminalService) DestroySession(id string) {
    s.mu.Lock()
    defer s.mu.Unlock()
    
    if session, ok := s.sessions[id]; ok {
        session.Conn.Close()
        delete(s.sessions, id)
    }
}

// 检查超时
func (s *TerminalService) CheckTimeout() {
    s.mu.Lock()
    defer s.mu.Unlock()
    
    now := time.Now()
    for id, session := range s.sessions {
        if now.Sub(session.LastActive) > s.Timeout {
            session.Conn.Close()
            delete(s.sessions, id)
        }
    }
}
```

---

#### 2.3 日志记录（1 小时）

**文件：** `go-backend/internal/service/terminal_logger.go`

**功能：**
- 命令日志
- 输出日志
- 文件存储

**实现代码：**
```go
package service

import (
    "fmt"
    "os"
    "path/filepath"
    "time"
)

type TerminalLogger struct {
    LogDir string
}

func NewTerminalLogger(logDir string) *TerminalLogger {
    return &TerminalLogger{
        LogDir: logDir,
    }
}

// 记录命令
func (l *TerminalLogger) LogCommand(sessionId string, userId, nodeId int64, command string) {
    filename := filepath.Join(l.LogDir, time.Now().Format("2006-01-02")+".log")
    
    f, err := os.OpenFile(filename, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
    if err != nil {
        return
    }
    defer f.Close()
    
    line := fmt.Sprintf("[%s] session=%s user=%d node=%d command=%s\n",
        time.Now().Format(time.RFC3339),
        sessionId,
        userId,
        nodeId,
        command,
    )
    
    f.WriteString(line)
}

// 清理旧日志（超过 30 天）
func (l *TerminalLogger) CleanupOldLogs() {
    filepath.Walk(l.LogDir, func(path string, info os.FileInfo, err error) error {
        if err != nil {
            return err
        }
        
        if info.IsDir() {
            return nil
        }
        
        if time.Since(info.ModTime()) > 30*24*time.Hour {
            os.Remove(path)
        }
        
        return nil
    })
}
```

---

### 阶段 3：前端开发（6-8 小时）

#### 3.1 安装依赖（0.5 小时）

```bash
cd vite-frontend
npm install xterm xterm-addon-fit xterm-addon-web-links
```

---

#### 3.2 终端组件（2-3 小时）

**文件：** `vite-frontend/src/components/terminal/Terminal.tsx`

**功能：**
- xterm.js 集成
- 自动调整大小
- 复制粘贴支持

**实现代码：**
```typescript
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { useEffect, useRef } from 'react';
import 'xterm/css/xterm.css';

interface TerminalProps {
  wsUrl: string;
  onDisconnect?: () => void;
}

export function Terminal({ wsUrl, onDisconnect }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // 初始化终端
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalRef.current);
    fitAddon.fit();

    // 连接 WebSocket
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Terminal connected');
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'output') {
        term.write(msg.data);
      } else if (msg.type === 'error') {
        term.write(`\r\n\x1b[31m${msg.message}\x1b[0m\r\n`);
      }
    };

    ws.onclose = () => {
      console.log('Terminal disconnected');
      onDisconnect?.();
    };

    // 终端输入 → WebSocket
    term.onData((data) => {
      ws.send(JSON.stringify({ type: 'input', data }));
    });

    // 窗口大小调整
    const handleResize = () => {
      fitAddon.fit();
      ws.send(JSON.stringify({
        type: 'resize',
        width: term.cols,
        height: term.rows,
      }));
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      ws.close();
      term.dispose();
    };
  }, [wsUrl, onDisconnect]);

  return <div ref={terminalRef} style={{ width: '100%', height: '100%' }} />;
}
```

---

#### 3.3 终端页面（2-3 小时）

**文件：** `vite-frontend/src/pages/terminal.tsx`

**功能：**
- 终端页面路由
- WebSocket 连接
- 断开重连

**实现代码：**
```typescript
import { useParams, useNavigate } from 'react-router-dom';
import { Terminal } from '@/components/terminal/Terminal';
import { Button } from '@/shadcn-bridge/heroui/button';

export default function TerminalPage() {
  const { nodeId } = useParams<{ nodeId: string }>();
  const navigate = useNavigate();

  const handleDisconnect = () => {
    // 显示断开连接提示
  };

  const handleClose = () => {
    navigate(`/nodes`);
  };

  const wsUrl = `ws://${window.location.host}/api/ws/terminal/${nodeId}`;

  return (
    <div className="flex flex-col h-screen">
      <div className="flex items-center justify-between p-4 border-b">
        <h1 className="text-xl font-bold">终端 - 节点 {nodeId}</h1>
        <Button onClick={handleClose}>关闭</Button>
      </div>
      <div className="flex-1 p-4">
        <Terminal wsUrl={wsUrl} onDisconnect={handleDisconnect} />
      </div>
    </div>
  );
}
```

---

#### 3.4 监控页面集成（1-2 小时）

**文件：** `vite-frontend/src/pages/monitor.tsx`

**功能：**
- 在节点列表添加"操作"列
- 添加"终端"按钮
- 点击在新标签页打开

**实现代码：**
```typescript
// 在节点列表中添加操作列
<TableHeaderColumn>操作</TableHeaderColumn>

// 在节点行中添加终端按钮
<TableRowColumn>
  <Button
    size="sm"
    onPress={() => {
      window.open(`/terminal/${node.id}`, '_blank');
    }}
  >
    终端
  </Button>
</TableRowColumn>
```

---

### 阶段 4：测试验证（2-3 小时）

#### 4.1 功能测试（1-2 小时）

**测试用例：**
- [ ] 终端连接成功
- [ ] 命令执行正常
- [ ] 输出显示正常
- [ ] 断开重连正常
- [ ] 窗口大小调整正常
- [ ] 复制粘贴正常

#### 4.2 安全测试（1 小时）

**测试用例：**
- [ ] 危险命令被过滤
- [ ] 会话超时自动断开
- [ ] 日志记录正常
- [ ] 并发连接限制正常

---

## 时间评估

| 阶段 | 时间 | 依赖 |
|------|------|------|
| **阶段 1：Agent** | 4-6 小时 | - |
| **阶段 2：后端** | 4-6 小时 | Agent 完成 |
| **阶段 3：前端** | 6-8 小时 | 后端完成 |
| **阶段 4：测试** | 2-3 小时 | 全部完成 |
| **总计** | **16-23 小时** | - |

---

## 风险因素

### 高风险
- **PTY 兼容性问题** - 不同操作系统的 PTY 实现可能不同
- **性能问题** - 大量并发终端会话可能影响性能

### 中风险
- **中文显示问题** - xterm 中文支持需要配置
- **WebSocket 稳定性** - 需要处理断线重连

### 低风险
- **终端样式调整** - 0.5-1 小时
- **命令过滤完善** - 1-2 小时

---

## 安全考虑

### 1. 危险命令过滤

**禁止的命令：**
```bash
rm -rf /
rm -rf /*
mkfs
dd if=/dev/zero
:(){:|:&};:  # fork bomb
shutdown
reboot
halt
poweroff
init 0
init 6
```

### 2. 会话超时

- **超时时间：** 5 分钟
- **超时前提醒：** 1 分钟前提醒
- **超时后：** 自动断开连接

### 3. 日志记录

- **存储位置：** `/var/log/flvx/terminal/`
- **文件格式：** `YYYY-MM-DD.log`
- **保留时间：** 30 天
- **日志内容：** 时间、会话 ID、用户 ID、节点 ID、命令

### 4. 权限控制

- **权限检查** - 只有管理员可以访问终端
- **会话隔离** - 每个会话独立，不能互相访问
- **审计日志** - 所有操作记录到日志

---

## 验收标准

- [ ] 终端可以正常连接
- [ ] 命令可以正常执行
- [ ] 输出可以正常显示
- [ ] 危险命令被过滤
- [ ] 会话超时自动断开
- [ ] 日志记录正常
- [ ] 日志保留 30 天
- [ ] 关闭标签页自动断开连接
- [ ] 窗口大小调整正常
- [ ] 复制粘贴正常

---

## 相关文件

- `go-gost/x/terminal/pty.go` - PTY 支持
- `go-gost/x/terminal/filter.go` - 命令过滤
- `go-gost/x/terminal/handler.go` - WebSocket 处理
- `go-backend/internal/http/handler/terminal.go` - 后端 WebSocket 端点
- `go-backend/internal/service/terminal_service.go` - 会话管理
- `go-backend/internal/service/terminal_logger.go` - 日志记录
- `vite-frontend/src/components/terminal/Terminal.tsx` - 终端组件
- `vite-frontend/src/pages/terminal.tsx` - 终端页面
- `vite-frontend/src/pages/monitor.tsx` - 监控页面集成

---

**计划完成，等待实施。**
