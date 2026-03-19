import { Checkbox } from "@/shadcn-bridge/heroui/checkbox";
import { Button } from "@/shadcn-bridge/heroui/button";
import { Chip } from "@/shadcn-bridge/heroui/chip";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@/shadcn-bridge/heroui/table";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getConnectionStatusMeta } from "./display";
import type { NodeRenewalCycle } from "./renewal";
import type { NodeSystemInfo } from "./system-info";

interface Node {
  id: number;
  inx?: number;
  name: string;
  remark?: string;
  expiryTime?: number;
  renewalCycle?: NodeRenewalCycle;
  expiryReminderDismissed?: number;
  ip: string;
  serverIp: string;
  serverIpV4?: string;
  serverIpV6?: string;
  port: string;
  tcpListenAddr?: string;
  udpListenAddr?: string;
  extraIPs?: string;
  version?: string;
  http?: number;
  tls?: number;
  socks?: number;
  status: number;
  isRemote?: number;
  remoteUrl?: string;
  syncError?: string;
  connectionStatus: "online" | "offline";
  systemInfo?: NodeSystemInfo | null;
  copyLoading?: boolean;
  upgradeLoading?: boolean;
  rollbackLoading?: boolean;
}

interface NodeListViewProps {
  displayNodes: Node[];
  selectedIds: Set<number>;
  toggleSelect: (nodeId: number) => void;
  toggleSelectAll: (isSelected: boolean) => void;
  openInstallSelector: (node: Node) => void;
  openUpgradeModal: (type: "single" | "batch", nodeId?: number) => void;
  handleRollbackNode: (node: Node) => void;
  handleEdit: (node: Node) => void;
  handleDelete: (node: Node) => void;
  formatTraffic: (bytes: number) => string;
}

function SortableDragHandle({ nodeId }: { nodeId: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: nodeId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing p-1 text-default-400 hover:text-default-600 transition-colors inline-block"
      title="拖拽排序"
    >
      <svg
        aria-hidden="true"
        className="w-4 h-4"
        fill="currentColor"
        viewBox="0 0 20 20"
      >
        <path d="M7 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 2zm0 6a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 8zm0 6a2 2 0 1 1 .001 4.001A2 2 0 0 1 7 14zm6-8a2 2 0 1 1-.001-4.001A2 2 0 0 1 13 6zm0 2a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 8zm0 6a2 2 0 1 1 .001 4.001A2 2 0 0 1 13 14z" />
      </svg>
    </div>
  );
}

function SortableTableRow({
  node,
  selectedIds,
  toggleSelect,
  openInstallSelector,
  openUpgradeModal,
  handleRollbackNode,
  handleEdit,
  handleDelete,
  formatTraffic,
}: {
  node: Node;
  selectedIds: Set<number>;
  toggleSelect: (nodeId: number) => void;
  openInstallSelector: (node: Node) => void;
  openUpgradeModal: (type: "single" | "batch", nodeId?: number) => void;
  handleRollbackNode: (node: Node) => void;
  handleEdit: (node: Node) => void;
  handleDelete: (node: Node) => void;
  formatTraffic: (bytes: number) => string;
}) {
  const { setNodeRef, transform, transition, isDragging } = useSortable({
    id: node.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isRemoteNode = node.isRemote === 1;
  const connectionStatusMeta = getConnectionStatusMeta(node.connectionStatus);

  return (
    <TableRow ref={setNodeRef} key={node.id} className="cursor-default" style={style}>
      <TableCell className="text-center">
        <Checkbox
          isSelected={selectedIds.has(node.id)}
          onValueChange={() => toggleSelect(node.id)}
        />
      </TableCell>
      <TableCell className="text-center">
        <SortableDragHandle nodeId={node.id} />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${connectionStatusMeta.color === "success" ? "bg-emerald-500" : "bg-rose-500"}`}
            title={connectionStatusMeta.text}
          />
          <span className="text-xs text-default-500">
            {connectionStatusMeta.text}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <span className="font-medium text-foreground truncate block" title={node.name}>
          {node.name}
        </span>
      </TableCell>
      <TableCell>
        <div className="space-y-0.5 text-xs font-mono">
          {node.serverIpV4?.trim() && (
            <div className="text-default-600" title={node.serverIpV4.trim()}>
              V4: {node.serverIpV4.trim()}
            </div>
          )}
          {node.serverIpV6?.trim() && (
            <div className="text-default-600" title={node.serverIpV6.trim()}>
              V6: {node.serverIpV6.trim()}
            </div>
          )}
          {(!node.serverIpV4?.trim() && !node.serverIpV6?.trim()) && (
            <div className="text-default-600" title={node.serverIp.trim()}>
              {node.serverIp.trim()}
            </div>
          )}
        </div>
      </TableCell>
      <TableCell>
        {!isRemoteNode ? (
          <span className="text-xs text-default-600">
            {node.version || "未知"}
          </span>
        ) : (
          <Chip
            className="h-5 text-[10px] px-1"
            color="default"
            size="sm"
            variant="flat"
          >
            远程
          </Chip>
        )}
      </TableCell>
      <TableCell>
        <span className="text-xs text-danger-600 dark:text-danger-400 font-medium">
          {node.connectionStatus === "online" && node.systemInfo
            ? formatTraffic(
                node.systemInfo.uploadTraffic +
                  node.systemInfo.downloadTraffic,
              )
            : "-"}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-xs text-primary-700 dark:text-primary-300 font-mono">
          {node.connectionStatus === "online" && node.systemInfo
            ? formatTraffic(node.systemInfo.uploadTraffic)
            : "-"}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-xs text-success-700 dark:text-success-300 font-mono">
          {node.connectionStatus === "online" && node.systemInfo
            ? formatTraffic(node.systemInfo.downloadTraffic)
            : "-"}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {!isRemoteNode && (
            <>
              <Button
                className="min-h-7 px-2"
                color="success"
                isLoading={node.copyLoading}
                size="sm"
                variant="flat"
                onPress={() => openInstallSelector(node)}
              >
                安装
              </Button>
              <Button
                className="min-h-7 px-2"
                color="warning"
                isDisabled={node.connectionStatus !== "online"}
                isLoading={node.upgradeLoading}
                size="sm"
                variant="flat"
                onPress={() => openUpgradeModal("single", node.id)}
              >
                升级
              </Button>
              <Button
                className="min-h-7 px-2"
                color="secondary"
                isDisabled={node.connectionStatus !== "online"}
                isLoading={node.rollbackLoading}
                size="sm"
                variant="flat"
                onPress={() => handleRollbackNode(node)}
              >
                回退
              </Button>
              <Button
                className="min-h-7 px-2"
                color="primary"
                size="sm"
                variant="flat"
                onPress={() => handleEdit(node)}
              >
                编辑
              </Button>
            </>
          )}
          <Button
            className="min-h-7 px-2"
            color="danger"
            size="sm"
            variant="flat"
            onPress={() => handleDelete(node)}
          >
            删除
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function NodeListView({
  displayNodes,
  selectedIds,
  toggleSelect,
  toggleSelectAll,
  openInstallSelector,
  openUpgradeModal,
  handleRollbackNode,
  handleEdit,
  handleDelete,
  formatTraffic,
}: NodeListViewProps) {
  const isAllSelected = displayNodes.length > 0 && selectedIds.size === displayNodes.length;

  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-content1 shadow-md">
      <Table
        aria-label="节点列表"
        classNames={{
          th: "bg-default-50/80 text-default-500 font-semibold text-sm border-b border-divider py-3 uppercase tracking-wider text-left align-middle",
          td: "py-3 border-b border-divider/30 group-data-[last=true]:border-b-0",
          tr: "hover:bg-default-50/80 transition-colors",
        }}
      >
        <TableHeader>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[50px] text-center">
            <div className="flex items-center justify-center h-full">
              <Checkbox isSelected={isAllSelected} onValueChange={toggleSelectAll} aria-label="全选" />
            </div>
          </TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[40px] text-center">排序</TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[100px] text-left">状态</TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[150px] text-left">名称</TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[180px] text-left">IP 地址</TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[90px] text-left">版本</TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[100px] text-left">总流量</TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[110px] text-left">上行流量</TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[110px] text-left">下行流量</TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[80px] text-right">操作</TableColumn>
        </TableHeader>
        <TableBody>
          {displayNodes.map((node) => (
            <SortableTableRow
              key={node.id}
              node={node}
              selectedIds={selectedIds}
              toggleSelect={toggleSelect}
              openInstallSelector={openInstallSelector}
              openUpgradeModal={openUpgradeModal}
              handleRollbackNode={handleRollbackNode}
              handleEdit={handleEdit}
              handleDelete={handleDelete}
              formatTraffic={formatTraffic}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
