# Plan 060: Node Rollback Progress Bar

**Created:** 2026-03-21  
**Status:** Pending  
**Priority:** Medium  
**Related:** Upgrade progress bar implementation

---

## Overview

Add progress bar display for node rollback operations, reusing the existing upgrade progress bar infrastructure.

---

## Problem

Currently:
- ✅ **Upgrade**: Shows progress bar with stage, percent, and message
- ❌ **Rollback**: Only shows loading spinner on button, no progress feedback

User experience inconsistency - both operations involve downloading/replacing binary and restarting, should have similar progress feedback.

---

## Solution

Reuse the existing `upgradeProgress` state and WebSocket message type for rollback operations.

### Architecture

```
┌─────────────┐              ┌──────────────┐              ┌─────────────┐
│   Frontend  │              │   Backend    │              │    Agent    │
│             │              │              │              │             │
│ upgradeProgress state ◄─── upgrade_progress ──── handleRollbackAgent()
│             │              │              │              │             │
│  Card View  │              │              │              │  Rollback   │
│  List View  │              │              │              │  Script     │
└─────────────┘              └──────────────┘              └─────────────┘
```

---

## Tasks

### Backend (go-gost/x/socket/websocket_reporter.go)

- [ ] **Task 1:** Add progress reporting to `handleRollbackAgent()`
  - Send `upgrade_progress` message at start (0%, "准备回退...")
  - Send `upgrade_progress` message during operation (50%, "回退中...")
  - Send `upgrade_progress` message on completion (100%, "回退完成")
  
- [ ] **Task 2:** Reuse existing `sendUpgradeProgress()` helper function

### Frontend (vite-frontend/src/pages/node.tsx)

- [ ] **Task 3:** Update `confirmRollback()` to initialize progress state
  - Set `upgradeProgress[node.id]` before calling `rollbackNode()`
  - Clear progress on error

- [x] **Task 4:** `upgradeProgress` state already exists
- [x] **Task 5:** Card view already renders progress bar
- [x] **Task 6:** List view already renders progress bar (version column)
- [x] **Task 7:** WebSocket message handler already processes `upgrade_progress`
- [ ] **Task 8:** Add version refresh logic on rollback completion (reuse upgrade logic)
  - Call `loadNodes({ silent: true })` when progress reaches 100%
  - Clear progress state after 3 seconds

### Testing

- [ ] **Task 9:** Test rollback progress display in card view
- [ ] **Task 10:** Test rollback progress display in list view
- [ ] **Task 11:** Verify version number updates after rollback
- [ ] **Task 12:** Verify progress bar clears after completion
- [ ] **Task 13:** Test error handling (rollback failure)

---

## Implementation Details

### Backend Changes

**File:** `go-gost/x/socket/websocket_reporter.go`

**Current Code:**
```go
func (w *WebSocketReporter) handleRollbackAgent(data interface{}) error {
    const binaryPath = "/etc/flux_agent/flux_agent"
    backupPath := binaryPath + ".old"

    if _, err := os.Stat(backupPath); os.IsNotExist(err) {
        return fmt.Errorf("没有可用的备份文件，无法回退")
    }

    fmt.Println("🔄 开始回退到旧版本...")

    script := fmt.Sprintf("sleep 1 && systemctl stop flux_agent && cp %s %s && systemctl start flux_agent", backupPath, binaryPath)
    cmd := exec.Command("systemd-run", "--quiet", "/bin/sh", "-c", script)
    if err := cmd.Start(); err != nil {
        return fmt.Errorf("启动回退脚本失败：%v", err)
    }

    fmt.Println("🔄 回退脚本已启动，Agent 将在 1 秒后重启...")
    return nil
}
```

**Modified Code:**
```go
func (w *WebSocketReporter) handleRollbackAgent(data interface{}) error {
    const binaryPath = "/etc/flux_agent/flux_agent"
    backupPath := binaryPath + ".old"

    if _, err := os.Stat(backupPath); os.IsNotExist(err) {
        return fmt.Errorf("没有可用的备份文件，无法回退")
    }

    fmt.Println("🔄 开始回退到旧版本...")
    
    // Report progress: preparing
    w.sendUpgradeProgress(0, "准备回退...")

    script := fmt.Sprintf("sleep 1 && systemctl stop flux_agent && cp %s %s && systemctl start flux_agent", backupPath, binaryPath)
    cmd := exec.Command("systemd-run", "--quiet", "/bin/sh", "-c", script)
    if err := cmd.Start(); err != nil {
        w.sendUpgradeProgress(0, "回退失败：" + err.Error())
        return fmt.Errorf("启动回退脚本失败：%v", err)
    }

    // Report progress: in progress
    w.sendUpgradeProgress(50, "回退中...")
    
    fmt.Println("🔄 回退脚本已启动，Agent 将在 1 秒后重启...")
    
    // Report progress: completed
    w.sendUpgradeProgress(100, "回退完成")
    
    return nil
}
```

### Frontend Changes Required

#### 1. Update `confirmRollback()` function

**File:** `vite-frontend/src/pages/node.tsx`

**Current Code:**
```tsx
const confirmRollback = async () => {
  if (!nodeToRollback) return;
  const node = nodeToRollback;

  setRollbackModalOpen(false);
  setNodeList((prev) =>
    prev.map((n) => (n.id === node.id ? { ...n, rollbackLoading: true } : n)),
  );
  try {
    const res = await rollbackNode(node.id);

    if (res.code === 0) {
      toast.success(`节点 ${node.name} 回退命令已发送，节点将自动重启`);
    } else {
      toast.error(res.msg || "回退失败");
    }
  } catch {
    toast.error("网络错误，请重试");
  } finally {
    setNodeList((prev) =>
      prev.map((n) =>
        n.id === node.id ? { ...n, rollbackLoading: false } : n,
      ),
    );
    setNodeToRollback(null);
  }
};
```

**Modified Code:**
```tsx
const confirmRollback = async () => {
  if (!nodeToRollback) return;
  const node = nodeToRollback;

  setRollbackModalOpen(false);
  
  // Initialize rollback progress
  setUpgradeProgress((prev) => ({
    ...prev,
    [node.id]: { stage: "rollback", percent: 0, message: "准备回退..." },
  }));
  
  setNodeList((prev) =>
    prev.map((n) => (n.id === node.id ? { ...n, rollbackLoading: true } : n)),
  );
  
  try {
    const res = await rollbackNode(node.id);

    if (res.code === 0) {
      toast.success(`节点 ${node.name} 回退命令已发送，节点将自动重启`);
      // Progress will be updated via WebSocket messages
    } else {
      toast.error(res.msg || "回退失败");
      // Clear progress on error
      setUpgradeProgress((prev) => {
        const next = { ...prev };
        delete next[node.id];
        return next;
      });
    }
  } catch {
    toast.error("网络错误，请重试");
    // Clear progress on error
    setUpgradeProgress((prev) => {
      const next = { ...prev };
      delete next[node.id];
      return next;
    });
  }
};
```

#### 2. Existing Components (No Changes Required ✅)

**Card View** (`vite-frontend/src/pages/node.tsx`):
```tsx
{upgradeProgress[node.id] &&
  upgradeProgress[node.id].percent < 100 && (
    <Progress
      showValueLabel
      aria-label="升级进度"
      color="warning"
      label={upgradeProgress[node.id].message}
      size="sm"
      value={upgradeProgress[node.id].percent}
    />
  )}
```

**List View** (`vite-frontend/src/pages/node/node-list-view.tsx`):
```tsx
{upgradeProgress?.[node.id]?.percent !== undefined && 
 upgradeProgress[node.id].percent < 100 ? (
  <Progress
    showValueLabel
    aria-label="升级进度"
    color="warning"
    label={upgradeProgress[node.id].message}
    size="sm"
    value={upgradeProgress[node.id].percent}
    className="w-full"
  />
) : null}
```

**WebSocket Handler** (already handles 100% completion):
```tsx
} else if (type === "upgrade_progress") {
  try {
    const progressData =
      typeof messageData === "string"
        ? JSON.parse(messageData)
        : messageData;

    if (progressData?.data) {
      setUpgradeProgress((prev) => ({
        ...prev,
        [nodeId]: {
          stage: progressData.data.stage || "",
          percent: progressData.data.percent || 0,
          message: progressData.message || "",
        },
      }));

      // Auto-refresh version when progress reaches 100%
      if (progressData.data.percent >= 100) {
        setTimeout(() => {
          loadNodes({ silent: true });
          // Clear progress after 3 seconds
          setUpgradeProgress(prev => {
            const next = { ...prev };
            delete next[nodeId];
            return next;
          });
        }, 1000);
      }
    }
  } catch {
    // ignore errors
  }
}
```

---

## Success Criteria

1. ✅ Rollback shows progress bar (0% → 50% → 100%)
2. ✅ Progress messages are clear ("准备回退...", "回退中...", "回退完成")
3. ✅ Progress bar displays in both card and list views
4. ✅ Version number automatically refreshes after rollback completion
5. ✅ Progress bar clears after completion or page refresh
6. ✅ Error states are handled gracefully (progress cleared on failure)
7. ✅ Desktop and mobile use the same logic (both use `NodePage` component)

---

## Notes

- Reuses existing `upgrade_progress` WebSocket message type
- Frontend changes: Update `confirmRollback()` to initialize progress state
- Version refresh logic already exists in WebSocket handler (triggers at 100%)
- Backend changes are minimal (3 lines to add)
- Consistent UX between upgrade and rollback operations
- Desktop and mobile both use `NodePage` component (different layouts only)

---

## Related Files

| File | Changes |
|------|---------|
| `go-gost/x/socket/websocket_reporter.go` | Add progress reporting to `handleRollbackAgent()` |
| `vite-frontend/src/pages/node.tsx` | Update `confirmRollback()` to initialize progress state |
| `vite-frontend/src/pages/node/node-list-view.tsx` | No changes (already supported) |

---

## Checklist

- [x] Plan document created
- [ ] Backend implementation complete
- [ ] Frontend implementation complete (confirmRollback update)
- [ ] Version refresh verified (reuse existing WebSocket handler logic)
- [ ] Testing completed
- [ ] Code review completed
- [ ] Merged to main
