import type { NodeApiItem } from "@/api/types";
import type { NodeGroupApiItem } from "@/api/types";
import { NodeGroupCollapsible } from "./node-group-collapsible";
import { NodeListView } from "./node-list-view";

interface NodeGroupedViewProps {
  nodeGroups: NodeGroupApiItem[];
  displayNodes: NodeApiItem[];
  collapsedGroups: Record<string, boolean>;
  onToggleCollapsed: (groupId: number | null) => void;
  onNodeClick: (nodeId: number) => void;
  // NodeListView props
  copyToClipboard: (text: string, label: string) => void;
  formatTraffic: (bytes: number) => string;
  handleDelete: (node: NodeApiItem) => void;
  handleEdit: (node: NodeApiItem) => void;
  handleRollbackNode: (node: NodeApiItem) => void;
  openInstallSelector: (node: NodeApiItem) => void;
  openUpgradeModal: (type: "single" | "batch", nodeId?: number) => void;
  realtimeNodeMetrics: Record<number, { uploadTraffic: number; downloadTraffic: number }>;
  selectedIds: Set<number>;
  toggleSelect: (nodeId: number) => void;
  toggleSelectAll: (isSelected: boolean) => void;
  upgradeProgress: Record<number, { stage: string; percent: number; message: string }>;
}

export function NodeGroupedView({
  nodeGroups,
  displayNodes,
  collapsedGroups,
  onToggleCollapsed,
  onNodeClick,
  copyToClipboard,
  formatTraffic,
  handleDelete,
  handleEdit,
  handleRollbackNode,
  openInstallSelector,
  openUpgradeModal,
  realtimeNodeMetrics,
  selectedIds,
  toggleSelect,
  toggleSelectAll,
  upgradeProgress,
}: NodeGroupedViewProps) {
  // 按分组组织节点
  const groupedNodes = (() => {
    const groupMap = new Map<number | null, NodeApiItem[]>();
    
    // 初始化未分组的组
    groupMap.set(null, []);
    
    // 初始化所有分组的空数组
    nodeGroups.forEach((group) => {
      groupMap.set(group.id, []);
    });
    
    // 将节点分配到对应分组
    displayNodes.forEach((node) => {
      const groupId: number | null = (node as any).groupId ?? null;
      const group = groupMap.get(groupId) || [];
      group.push(node);
      groupMap.set(groupId, group);
    });
    
    // 转换为数组格式，过滤空分组
    return Array.from(groupMap.entries())
      .map(([groupId, nodes]) => ({
        groupId,
        group: nodeGroups.find((g) => g.id === groupId) || null,
        nodes,
        nodeCount: nodes.length,
      }))
      .filter((group) => group.nodeCount > 0);
  })();

  return (
    <div className="space-y-4">
      {groupedNodes.map((groupData) => (
        <NodeGroupCollapsible
          key={groupData.groupId ?? 'ungrouped'}
          group={groupData.group}
          nodes={groupData.nodes}
          nodeCount={groupData.nodeCount}
          defaultExpanded={
            !collapsedGroups[groupData.groupId === null ? 'ungrouped' : String(groupData.groupId)]
          }
          onToggleCollapsed={() => onToggleCollapsed(groupData.groupId)}
          onNodeClick={onNodeClick}
        >
          <NodeListView
            copyToClipboard={copyToClipboard}
            displayNodes={groupData.nodes as any}
            formatTraffic={formatTraffic}
            handleDelete={handleDelete as any}
            handleEdit={handleEdit as any}
            handleRollbackNode={handleRollbackNode as any}
            nodeGroups={nodeGroups}
            openInstallSelector={openInstallSelector as any}
            openUpgradeModal={openUpgradeModal as any}
            realtimeNodeMetrics={realtimeNodeMetrics}
            selectedIds={selectedIds}
            toggleSelect={toggleSelect}
            toggleSelectAll={toggleSelectAll as any}
            upgradeProgress={upgradeProgress}
          />
        </NodeGroupCollapsible>
      ))}
    </div>
  );
}
