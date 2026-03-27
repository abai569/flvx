import type { NodeRenewalCycle } from "./renewal";
import type { NodeSystemInfo } from "./system-info";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { getConnectionStatusMeta } from "./display";

import { Checkbox } from "@/shadcn-bridge/heroui/checkbox";
import { Button } from "@/shadcn-bridge/heroui/button";
import { Chip } from "@/shadcn-bridge/heroui/chip";
import { Progress } from "@/shadcn-bridge/heroui/progress";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@/shadcn-bridge/heroui/table";
import {
  DistroIcon,
  parseDistroFromVersion,
  getDistroColor,
} from "@/components/distro-icon";
interface Node {
  id: number;
  inx?: number;
  name: string;
  remark?: string;
  expiryTime?: number;
  renewalCycle?: NodeRenewalCycle;
  expiryReminderDismissed?: number;
  expiryReminderDismissedUntil: number | null;
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
  groupId?: number | null;
}

interface NodeListViewProps {
  displayNodes: Node[];
  realtimeNodeMetrics: Record<
    number,
    {
      uploadTraffic: number;
      downloadTraffic: number;
    }
  >;
  upgradeProgress: Record<
    number,
    {
      stage: string;
      percent: number;
      message: string;
    }
  >;
  selectedIds: Set<number>;
  toggleSelect: (nodeId: number) => void;
  toggleSelectAll: (isSelected: boolean) => void;
  copyToClipboard: (text: string, label: string) => void;
  openInstallSelector: (node: Node) => void;
  openUpgradeModal: (type: "single" | "batch", nodeId?: number) => void;
  handleRollbackNode: (node: Node) => void;
  handleEdit: (node: Node) => void;
  handleDelete: (node: Node) => void;
  formatTraffic: (bytes: number) => string;
  nodeGroups: any[];
}

function SortableTableRow({
  node,
  realtimeNodeMetrics,
  upgradeProgress,
  selectedIds,
  toggleSelect,
  copyToClipboard,
  openInstallSelector,
  openUpgradeModal,
  handleRollbackNode,
  handleEdit,
  handleDelete,
  formatTraffic,
  nodeGroups,
}: {
  node: Node;
  realtimeNodeMetrics: Record<
    number,
    {
      uploadTraffic: number;
      downloadTraffic: number;
    }
  >;
  upgradeProgress: Record<
    number,
    {
      stage: string;
      percent: number;
      message: string;
    }
  >;
  selectedIds: Set<number>;
  toggleSelect: (nodeId: number) => void;
  copyToClipboard: (text: string, label: string) => void;
  openInstallSelector: (node: Node) => void;
  openUpgradeModal: (type: "single" | "batch", nodeId?: number) => void;
  handleRollbackNode: (node: Node) => void;
  handleEdit: (node: Node) => void;
  handleDelete: (node: Node) => void;
  formatTraffic: (bytes: number) => string;
  nodeGroups: any[];
}) {
  const {
    setNodeRef,
    transform,
    transition,
    isDragging,
    attributes,
    listeners,
  } = useSortable({
    id: node.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  const rowBg = selectedIds.has(node.id)
    ? "bg-primary-50/70 dark:bg-primary-900/40"
    : "";
  const isRemoteNode = node.isRemote === 1;
  const connectionStatusMeta = getConnectionStatusMeta(node.connectionStatus);

  return (
    <TableRow
      key={node.id}
      ref={setNodeRef}
      className="cursor-default"
      style={style}
    >
      <TableCell className={rowBg}>
        <div className="flex items-center justify-center h-full">
          <Checkbox
            isSelected={selectedIds.has(node.id)}
            onValueChange={() => toggleSelect(node.id)}
          />
        </div>
      </TableCell>
      <TableCell className={rowBg}>
        <div
          className="cursor-grab active:cursor-grabbing p-1 text-default-400 flex-shrink-0 hover:text-default-600 transition-colors"
          {...attributes}
          {...listeners}
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
      </TableCell>
      <TableCell className={`whitespace-nowrap ${rowBg}`}>
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${connectionStatusMeta.color === "success" ? "bg-emerald-500" : "bg-rose-500"}`}
            title={connectionStatusMeta.text}
          />
          <span
            className="text-sm font-bold text-foreground truncate"
            title={node.name}
          >
            {node.name}
          </span>
        </div>
      </TableCell>
      {/* 👇 分组单元格 👇 */}
      <TableCell className={`whitespace-nowrap ${rowBg}`}>
        {node.groupId && node.groupId > 0 ? (
          (() => {
            const group = nodeGroups.find((g: any) => g.id == node.groupId);

            return group ? (
              <Chip
                size="sm"
                style={{
                  backgroundColor: `${group.color}20`,
                  color: group.color,
                }}
                variant="flat"
              >
                {group.name}
              </Chip>
            ) : (
              <Chip
                className="bg-default-100 text-default-500"
                size="sm"
                variant="flat"
              >
                未分组
              </Chip>
            );
          })()
        ) : (
          <Chip
            className="bg-default-100 text-default-500"
            size="sm"
            variant="flat"
          >
            未分组
          </Chip>
        )}
      </TableCell>
      <TableCell className={`whitespace-nowrap ${rowBg}`}>
        {node.remark?.trim() ? (
          <span
            className="text-sm truncate block max-w-[120px]"
            title={node.remark.trim()}
          >
            {node.remark.trim()}
          </span>
        ) : (
          <span className="text-sm text-default-400">-</span>
        )}
      </TableCell>
      <TableCell className={`whitespace-nowrap ${rowBg} align-middle`}>
        <div className="text-left text-xs min-w-0 flex-1 min-h-[2.125rem]">
          {node.serverIpV4?.trim() || node.serverIpV6?.trim() ? (
            <div className="space-y-0.5">
              {node.serverIpV4?.trim() && (
                <span
                  className="text-sm cursor-pointer hover:bg-default-200/50 rounded px-1 transition-colors w-fit block"
                  title={node.serverIpV4.trim()}
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(node.serverIpV4!.trim(), "IPv4 地址");
                  }}
                >
                  {node.serverIpV4.trim()}
                </span>
              )}
              {node.serverIpV6?.trim() && (
                <span
                  className="text-sm cursor-pointer hover:bg-default-200/50 rounded px-1 transition-colors block max-w-[150px] truncate w-fit"
                  title={node.serverIpV6.trim()}
                  onClick={(e) => {
                    e.stopPropagation();
                    copyToClipboard(node.serverIpV6!.trim(), "IPv6 地址");
                  }}
                >
                  {node.serverIpV6.trim()}
                </span>
              )}
            </div>
          ) : (
            <span
              className="text-sm cursor-pointer hover:bg-default-200/50 rounded px-1 transition-colors w-fit block"
              title={node.serverIp.trim()}
              onClick={(e) => {
                e.stopPropagation();
                copyToClipboard(node.serverIp.trim(), "IP 地址");
              }}
            >
              {node.serverIp.trim()}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className={`whitespace-nowrap ${rowBg} align-middle`}>
        {!isRemoteNode ? (
          <div className="flex flex-col gap-1 min-w-[100px] justify-center">
            {upgradeProgress?.[node.id]?.percent !== undefined &&
            upgradeProgress[node.id].percent < 100 ? (
              <>
                <Progress
                  aria-label="升级进度"
                  className="w-full"
                  color="warning"
                  size="sm"
                  value={upgradeProgress[node.id].percent}
                />
                <span className="text-[10px] text-warning-600 truncate">
                  {upgradeProgress[node.id].message}
                </span>
              </>
            ) : (
              /* 👇 这里就是修改后的带图标版本号展示 👇 */
              <div className="flex items-center gap-1.5">
                {node.version && (
                  <DistroIcon
                    distro={parseDistroFromVersion(node.version)}
                    className="w-4 h-4 shrink-0"
                    // 👇 关键改动：利用 getDistroColor 获取专属品牌色，并强行覆盖 currentColor
                    style={{ color: getDistroColor(parseDistroFromVersion(node.version)) }}
                  />
                )}
                <span className="text-sm font-mono text-default-600">
                  {node.version ? node.version.split(" ")[0] : "未知"}
                </span>
              </div>
            )}
          </div>
        ) : (
          <Chip className="h-5 text-[10px] px-1" size="sm" variant="flat">
            远程
          </Chip>
        )}
      </TableCell>
      <TableCell className={`whitespace-nowrap ${rowBg}`}>
        <div className="flex justify-end">
          <span className="text-sm text-danger-600 dark:text-danger-400">
            {node.connectionStatus === "online" &&
            realtimeNodeMetrics &&
            realtimeNodeMetrics[node.id]
              ? formatTraffic(
                  (realtimeNodeMetrics?.[node.id]?.uploadTraffic || 0) +
                    (realtimeNodeMetrics?.[node.id]?.downloadTraffic || 0),
                )
              : "-"}
          </span>
        </div>
      </TableCell>
      <TableCell className={`whitespace-nowrap ${rowBg}`}>
        <div className="flex justify-end">
          <span className="text-sm text-success-700 dark:text-success-300">
            {node.connectionStatus === "online" &&
            realtimeNodeMetrics &&
            realtimeNodeMetrics[node.id]
              ? formatTraffic(
                  realtimeNodeMetrics?.[node.id]?.uploadTraffic || 0,
                )
              : "-"}
          </span>
        </div>
      </TableCell>
      <TableCell className={`whitespace-nowrap ${rowBg}`}>
        <div className="flex justify-end">
          <span className="text-sm text-primary-700 dark:text-primary-300">
            {node.connectionStatus === "online" &&
            realtimeNodeMetrics &&
            realtimeNodeMetrics[node.id]
              ? formatTraffic(
                  realtimeNodeMetrics?.[node.id]?.downloadTraffic || 0,
                )
              : "-"}
          </span>
        </div>
      </TableCell>
      <TableCell className={`whitespace-nowrap ${rowBg}`}>
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
  realtimeNodeMetrics,
  upgradeProgress,
  selectedIds,
  toggleSelect,
  toggleSelectAll,
  copyToClipboard,
  openInstallSelector,
  openUpgradeModal,
  handleRollbackNode,
  handleEdit,
  handleDelete,
  formatTraffic,
  nodeGroups,
}: NodeListViewProps) {
  const isAllSelected =
    displayNodes.length > 0 && selectedIds.size === displayNodes.length;

  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-content1 shadow-md">
      <Table
        aria-label="节点列表"
        classNames={{
          th: "bg-default-100/50 text-default-600 font-semibold text-sm border-b border-divider py-3 uppercase tracking-wider text-left align-middle",
          td: "py-3 border-b border-divider/50 group-data-[last=true]:border-b-0",
          tr: "hover:bg-default-50/50 transition-colors",
        }}
      >
        <TableHeader>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[50px] text-center">
            <div className="flex items-center justify-center h-full">
              <Checkbox
                aria-label="全选"
                isSelected={isAllSelected}
                onValueChange={toggleSelectAll}
              />
            </div>
          </TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[40px] text-center">
            排序
          </TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[160px] text-left">
            节点名称
          </TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[110px] text-left">
            分组名
          </TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[140px] text-left">
            备注
          </TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[200px] text-left">
            地址
          </TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[90px] text-left">
            版本
          </TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[110px] text-right">
            总流量
          </TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[110px] text-right">
            上行流量
          </TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[110px] text-right">
            下行流量
          </TableColumn>
          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[120px] text-right">
            操作
          </TableColumn>
        </TableHeader>
        <TableBody>
          {displayNodes.map((node) => (
            <SortableTableRow
              key={node.id}
              copyToClipboard={copyToClipboard}
              formatTraffic={formatTraffic}
              handleDelete={handleDelete}
              handleEdit={handleEdit}
              handleRollbackNode={handleRollbackNode}
              node={node}
              nodeGroups={nodeGroups}
              openInstallSelector={openInstallSelector}
              openUpgradeModal={openUpgradeModal}
              realtimeNodeMetrics={realtimeNodeMetrics}
              selectedIds={selectedIds}
              toggleSelect={toggleSelect}
              upgradeProgress={upgradeProgress}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
