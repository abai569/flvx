# 047 Group Page Expand UI

## Goal
将 group 页面的 "+N" 标签改为向下箭头，点击后展开显示完整列表。

## Changes

### 隧道分组 (Tunnel Groups)
- [x] 将 `+{item.tunnelNames.length - 2}` Chip 改为向下箭头按钮
- [x] 添加展开状态管理 `expandedTunnelGroups` (Set<number>)
- [x] 点击箭头展开/收起完整隧道列表
- [x] 展开时显示所有隧道 Chip，支持横向滚动

### 用户分组 (User Groups)
- [x] 将 `+{item.userNames.length - 2}` Chip 改为向下箭头按钮
- [x] 添加展开状态管理 `expandedUserGroups` (Set<number>)
- [x] 点击箭头展开/收起完整用户列表
- [x] 展开时显示所有用户 Chip，支持横向滚动

## Implementation Notes
- 使用 `ChevronDown` 图标 (从 lucide-react)
- 展开时 Chip 列表使用 `overflow-x-auto` 支持横向滚动
- 保持现有 title 属性显示完整列表 tooltip
- 收起：显示前 2 个 + 向下箭头
- 展开：显示全部 + 向上箭头 (rotate-180)

## Build Status
- [x] Frontend build passes
