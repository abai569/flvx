import type { NodeGroupApiItem, OfflineDeployPayload } from "@/api/types";

import { useState, useEffect, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import {
  DndContext,
  pointerWithin,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  type DragEndEvent,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { NodeGroupManager } from "./node/node-group-manager";

import {
  DistroIcon,
  parseDistroFromVersion,
  getDistroColor,
} from "@/components/distro-icon";
import { SearchBar } from "@/components/search-bar";
import { AnimatedPage } from "@/components/animated-page";
import { Card, CardBody, CardHeader } from "@/shadcn-bridge/heroui/card";
import { Button } from "@/shadcn-bridge/heroui/button";
import { Input } from "@/shadcn-bridge/heroui/input";
import { Textarea } from "@/shadcn-bridge/heroui/input";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/shadcn-bridge/heroui/modal";
import { Chip } from "@/shadcn-bridge/heroui/chip";
import { Switch } from "@/shadcn-bridge/heroui/switch";
import { Spinner } from "@/shadcn-bridge/heroui/spinner";
import { Alert } from "@/shadcn-bridge/heroui/alert";
import { Link } from "@/shadcn-bridge/heroui/link";
import { Progress } from "@/shadcn-bridge/heroui/progress";
import { Accordion, AccordionItem } from "@/shadcn-bridge/heroui/accordion";
import { Select, SelectItem } from "@/shadcn-bridge/heroui/select";
import { Checkbox } from "@/shadcn-bridge/heroui/checkbox";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
  DropdownMenuSeparator,
} from "@/shadcn-bridge/heroui/dropdown";
import { NodeListView } from "@/pages/node/node-list-view";
import {
  createNode,
  getNodeList,
  updateNode,
  deleteNode,
  getNodeInstallCommand,
  getNodeInstallCommandDomestic,
  getNodeInstallCommandOverseas,
  getNodeInstallCommandOffline,
  updateNodeOrder,
  batchDeleteNodes,
  upgradeNode,
  batchUpgradeNodes,
  getNodeReleases,
  rollbackNode,
  getPeerRemoteUsageList,
  dismissNodeExpiryReminder,
  getNodeGroupList,
  assignNodeToGroup,
  batchResetNodeTraffic,
  getConfigByName,
  type ReleaseChannel,
} from "@/api";
import { compareVersions } from "@/utils/version-update";
import { PageEmptyState, PageLoadingState } from "@/components/page-state";
import {
  getConnectionStatusMeta,
  getRemoteSyncErrorMessage,
} from "@/pages/node/display";
import { tryCopyInstallCommand } from "@/pages/node/install-command";
import {
  getNodeRenewalSnapshot,
  formatNodeRenewalTime,
  type NodeRenewalCycle,
} from "@/pages/node/renewal";
import {
  buildNodeSystemInfo,
  type NodeSystemInfo,
} from "@/pages/node/system-info";
import { useNodeOfflineTimers } from "@/pages/node/use-node-offline-timers";
import { useNodeRealtime } from "@/pages/node/use-node-realtime";
import { useLocalStorageState } from "@/hooks/use-local-storage-state";
import { loadStoredOrder, saveOrder } from "@/utils/order-storage";

// TypeScript 全局类型扩展
declare global {
  interface Window {
    __pendingNodeRefresh?: Set<number>;
  }
}

const NODE_FALLBACK_REFRESH_INTERVAL_MS = 15000;

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
  intranetIp?: string;
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

interface NodeForm {
  id: number | null;
  name: string;
  remark: string;
  expiryTime: number;
  renewalCycle: NodeRenewalCycle;
  groupId: number | null;
  intranetIp: string;
  serverIpV4: string;
  serverIpV6: string;
  port: string;
  tcpListenAddr: string;
  udpListenAddr: string;
  interfaceName: string;
  extraIPs: string;
  http: number;
  tls: number;
  socks: number;
}

type NodeTab = "local" | "remote";
type NodeViewMode = "grid" | "list" | "grouped";

interface RemoteUsageBinding {
  bindingId: number;
  tunnelId: number;
  tunnelName: string;
  chainType: number;
  hopInx: number;
  allocatedPort: number;
  resourceKey: string;
  remoteBindingId: string;
  updatedTime: number;
}

interface RemoteUsageNode {
  nodeId: number;
  nodeName: string;
  remoteUrl: string;
  shareId: number;
  portRangeStart: number;
  portRangeEnd: number;
  maxBandwidth: number;
  currentFlow: number;
  usedPorts: number[];
  bindings: RemoteUsageBinding[];
  activeBindingNum: number;
  syncError?: string;
}

const EXPIRING_SOON_DAYS = 7;

type NodeExpiryState = "permanent" | "healthy" | "expiringSoon" | "expired";

type NodeFilterMode = "all" | "expiringSoon" | "expired" | "withExpiry";

const getNodeReminderEnabled = (node: Node): boolean => {
  return !!node.expiryTime && node.expiryTime > 0 && !!node.renewalCycle;
};

const getNodeExpiryMeta = (timestamp?: number, cycle?: NodeRenewalCycle) => {
  const renewal = getNodeRenewalSnapshot(timestamp, cycle, EXPIRING_SOON_DAYS);

  if (renewal.state === "unset") {
    return {
      state: "permanent" as NodeExpiryState,
      label: "未设置续费周期",
      tone: "default" as const,
      accentClassName: "",
      bannerClassName: "",
      isHighlighted: false,
      sortWeight: 3,
      nextDueTime: undefined,
    };
  }

  if (renewal.state === "expired") {
    return {
      state: "expired" as NodeExpiryState,
      label: "已过期",
      tone: "danger" as const,
      accentClassName:
        "border-red-300/80 bg-red-50/70 shadow-red-100 dark:border-red-500/40 dark:bg-red-950/20",
      bannerClassName:
        "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300",
      isHighlighted: true,
      sortWeight: 0,
      nextDueTime: renewal.nextDueTime,
    };
  }

  if (renewal.state === "dueSoon") {
    return {
      state: "expiringSoon" as NodeExpiryState,
      label: renewal.label,
      tone: "warning" as const,
      accentClassName:
        "border-amber-300/80 bg-amber-50/80 shadow-amber-100 dark:border-amber-500/40 dark:bg-amber-950/20",
      bannerClassName:
        "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
      isHighlighted: true,
      sortWeight: 1,
      nextDueTime: renewal.nextDueTime,
    };
  }

  return {
    state: "healthy" as NodeExpiryState,
    label: renewal.label,
    tone: "success" as const,
    accentClassName: "",
    bannerClassName: "",
    isHighlighted: false,
    sortWeight: 2,
    nextDueTime: renewal.nextDueTime,
  };
};

const mergeNodeRealtimeState = (
  incomingNode: Node,
  existingNode?: Node,
): Node => {
  return {
    ...incomingNode,
    systemInfo: existingNode?.systemInfo ?? incomingNode.systemInfo ?? null,
    copyLoading: existingNode?.copyLoading ?? incomingNode.copyLoading ?? false,
    upgradeLoading:
      existingNode?.upgradeLoading ?? incomingNode.upgradeLoading ?? false,
    rollbackLoading:
      existingNode?.rollbackLoading ?? incomingNode.rollbackLoading ?? false,
    expiryReminderDismissed:
      existingNode?.expiryReminderDismissed ??
      incomingNode.expiryReminderDismissed ??
      0,
    expiryReminderDismissedUntil:
      existingNode?.expiryReminderDismissedUntil ??
      incomingNode.expiryReminderDismissedUntil ??
      null,
  } as Node;
};

const SortableItem = ({
  id,
  children,
}: {
  id: number;
  children: (listeners: any, attributes?: any) => any;
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: transform
      ? CSS.Transform.toString({
        ...transform,
        x: Math.round(transform.x),
        y: Math.round(transform.y),
      })
      : undefined,
    transition: isDragging ? undefined : transition || undefined,
    opacity: isDragging ? 0.5 : 1,
    willChange: isDragging ? "transform" : undefined,
  };

  return (
    <div ref={setNodeRef} className="h-full z-10 hover:z-50 focus-within:z-50" style={style} {...attributes}>
      {children(listeners)}
    </div>
  );
};

// 格式化日期时间戳
const formatDate = (timestamp: number): string => {
  if (!timestamp) return "-";
  return new Date(timestamp).toLocaleString();
};

export default function NodePage() {
  const [nodeList, setNodeList] = useState<Node[]>([]);
  const [nodeOrder, setNodeOrder] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const [realtimeNodeMetrics, setRealtimeNodeMetrics] = useState<
    Record<
      number,
      {
        uploadTraffic: number;
        downloadTraffic: number;
        uploadSpeed: number;
        downloadSpeed: number;
        cpuUsage: number;
        memoryUsage: number;
        diskUsage: number;
        uptime: number;
        load1: number;
        load5: number;
        load15: number;
        tcpConns: number;
        udpConns: number;
        periodTraffic?: {
          rx: number;
          tx: number;
          since: number;
          nextReset?: number;
          cycle?: string;
        };
      }
    >
  >({});

  const [localSearchKeyword, setLocalSearchKeyword] = useLocalStorageState(
    "node-search-keyword-local",
    "",
  );
  const [remoteSearchKeyword, setRemoteSearchKeyword] = useLocalStorageState(
    "node-search-keyword-remote",
    "",
  );
  const [activeTab, setActiveTab] = useLocalStorageState<NodeTab>(
    "node-active-tab",
    "local",
  );

  useEffect(() => {
    if (activeTab !== "local" && activeTab !== "remote") {
      setActiveTab("local");
    }
  }, [activeTab, setActiveTab]);

  const [remoteUsageMap, setRemoteUsageMap] = useState<
    Record<number, RemoteUsageNode>
  >({});
  const [nodeFilterMode, setNodeFilterMode, resetNodeFilterMode] =
    useLocalStorageState<NodeFilterMode>("node-expiry-filter-mode", "all");
  const [filterGroupId, setFilterGroupId] = useLocalStorageState<number | null>("node-filter-group-id", null);
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [dialogVisible, setDialogVisible] = useState(false);
  const [dialogTitle, setDialogTitle] = useState("");
  const [isEdit, setIsEdit] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [rollbackModalOpen, setRollbackModalOpen] = useState(false);
  const [nodeToRollback, setNodeToRollback] = useState<Node | null>(null);
  const [nodeToDelete, setNodeToDelete] = useState<Node | null>(null);
  const [protocolDisabled, setProtocolDisabled] = useState(false);
  const [protocolDisabledReason, setProtocolDisabledReason] = useState("");
  const [form, setForm] = useState<NodeForm>({
    id: null,
    name: "",
    remark: "",
    expiryTime: 0,
    renewalCycle: "",
    groupId: null,
    intranetIp: "",
    serverIpV4: "",
    serverIpV6: "",
    port: "10000-65535",
    tcpListenAddr: "[::]",
    udpListenAddr: "[::]",
    interfaceName: "",
    extraIPs: "",
    http: 0,
    tls: 0,
    socks: 0,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchDeleteModalOpen, setBatchDeleteModalOpen] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchRollbackModalOpen, setBatchRollbackModalOpen] = useState(false);

  const [viewMode, setViewMode] = useLocalStorageState<NodeViewMode>(
    "node-view-mode",
    "grid",
  );

  const [collapsedGroups, setCollapsedGroups] = useLocalStorageState<Record<string, boolean>>(
    "node-group-collapsed-state",
    {}
  );

  const [infoPopoverOpenId, setInfoPopoverOpenId] = useState<number | null>(
    null,
  );

  useEffect(() => {
    const handleClickOutside = () => {
      if (infoPopoverOpenId !== null) {
        setInfoPopoverOpenId(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [infoPopoverOpenId]);

  const [installCommandModal, setInstallCommandModal] = useState(false);
  const [installCommand, setInstallCommand] = useState("");
  const [currentNodeName, setCurrentNodeName] = useState("");
  const [installSelectorOpen, setInstallSelectorOpen] = useState(false);
  const [installTargetNode, setInstallTargetNode] = useState<Node | null>(null);
  const [installChannel, setInstallChannel] = useState<ReleaseChannel>("dev");

  // 离线部署相关状态
  const [offlineModalOpen, setOfflineModalOpen] = useState(false);
  const [offlineCommand, setOfflineCommand] = useState("");
  const [offlineDeployData, setOfflineDeployData] = useState<OfflineDeployPayload | null>(null);

  // 硬编码下载链接
  const OFFLINE_DOWNLOAD_URLS = {
    amd64: "https://chfs.646321.xyz:8/chfs/shared/flvx/offline-amd64.zip",
    arm64: "https://chfs.646321.xyz:8/chfs/shared/flvx/offline-arm64.zip",
  };

  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState<"single" | "batch">(
    "single",
  );
  const [upgradeTargetNodeId, setUpgradeTargetNodeId] = useState<number | null>(
    null,
  );
  const [ghfastURL, setGhfastURL] = useState<string>('https://ghfast.top');
  const [latestVersion, setLatestVersion] = useState<string>('');
  const [releases, setReleases] = useState<
    Array<{
      version: string;
      name: string;
      publishedAt: string;
      prerelease: boolean;
      channel: ReleaseChannel;
    }>
  >([]);
  const [releasesLoading, setReleasesLoading] = useState(false);
  const [releaseChannel, setReleaseChannel] = useState<ReleaseChannel>("dev");
  const [selectedVersion, setSelectedVersion] = useState("");
  const [batchUpgradeLoading, setBatchUpgradeLoading] = useState(false);
  const [batchResetTrafficLoading, setBatchResetTrafficLoading] = useState(false);
  const [batchResetTrafficModalOpen, setBatchResetTrafficModalOpen] = useState(false);
  const [upgradeProgress, setUpgradeProgress] = useState<
    Record<number, { stage: string; percent: number; message: string }>
  >({});

  const [infoPopoverPlacement, setInfoPopoverPlacement] = useState<
    Record<number, "left" | "bottom">
  >({});

  const [nodeGroups, setNodeGroups] = useState<NodeGroupApiItem[]>([]);
  const [groupManagerOpen, setGroupManagerOpen] = useState(false);
  const [groupSelectorNode, setGroupSelectorNode] = useState<number | null>(
    null,
  );

  const updateInfoPopoverPlacement = useCallback(
    (nodeId: number, triggerElement: HTMLElement | null) => {
      if (!triggerElement) {
        return;
      }
      const rect = triggerElement.getBoundingClientRect();
      const cardElement = triggerElement.closest("[data-node-card='true']");
      const cardRect =
        cardElement instanceof HTMLElement
          ? cardElement.getBoundingClientRect()
          : null;
      const estimatedPanelWidth = 288;
      const containerPadding = 16;
      const availableLeftSpace = cardRect
        ? rect.left - cardRect.left
        : rect.left;
      const nextPlacement: "left" | "bottom" =
        availableLeftSpace >= estimatedPanelWidth + containerPadding
          ? "left"
          : "bottom";

      setInfoPopoverPlacement((prev) =>
        prev[nodeId] === nextPlacement
          ? prev
          : { ...prev, [nodeId]: nextPlacement },
      );
    },
    [],
  );

  const handleNodeOffline = useCallback((nodeId: number) => {
    setNodeList((prev) =>
      prev.map((node) => {
        if (node.id !== nodeId) return node;
        if (node.connectionStatus === "offline" && node.systemInfo === null) {
          return node;
        }
        return {
          ...node,
          connectionStatus: "offline" as const,
          systemInfo: null,
          expiryReminderDismissed: node.expiryReminderDismissed ?? 0,
          expiryReminderDismissedUntil:
            node.expiryReminderDismissedUntil ?? null,
        } as Node;
      }),
    );

    setRealtimeNodeMetrics((prev) => {
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });
  }, []);

  const { clearOfflineTimer, scheduleNodeOffline } = useNodeOfflineTimers({
    delayMs: 3000,
    onNodeOffline: handleNodeOffline,
  });

  const loadNodeGroups = useCallback(async () => {
    try {
      const res: any = await getNodeGroupList();
      const data = res?.data !== undefined ? res.data : res;
      const groups = Array.isArray(data) ? data : (data?.list || data?.items || []);
      setNodeGroups(groups.map((g: any) => ({ ...g, id: Number(g.id) })));
    } catch (error) {
      // Silent fail
    }
  }, []);

  useEffect(() => {
    loadNodeGroups();
  }, [loadNodeGroups]);

  const loadRemoteUsage = useCallback(async () => {
    try {
      const res = await getPeerRemoteUsageList();
      if (res.code === 0 && Array.isArray(res.data)) {
        const nextMap: Record<number, RemoteUsageNode> = {};
        (res.data as unknown as RemoteUsageNode[]).forEach((item) => {
          if (!item || typeof item.nodeId !== "number") return;
          nextMap[item.nodeId] = item;
        });
        setRemoteUsageMap(nextMap);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadNodes = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setLoading(true);
    }
    try {
      const res: any = await getNodeList();
      if (res.code === 0 || res.code === 200 || !res.code) {
        const data = res.data !== undefined ? res.data : res;
        const nodesArray = Array.isArray(data) ? data : (data.list || data.items || []);

        const nodesData: Node[] = nodesArray.map((node: any) => ({
          ...node,
          groupId: node.groupId != null ? Number(node.groupId) : null,
          inx: node.inx ?? 0,
          expiryReminderDismissed: node.expiryReminderDismissed ?? 0,
          expiryReminderDismissedUntil:
            node.expiryReminderDismissedUntil ?? null,
          connectionStatus: node.syncError
            ? "offline"
            : node.status === 1
              ? "online"
              : "offline",
          syncError: node.syncError || undefined,
          systemInfo: null,
          copyLoading: false,
        }));

        setNodeList((prev) => {
          const previousById = new Map(prev.map((node) => [node.id, node]));
          return nodesData.map((node) =>
            mergeNodeRealtimeState(node, previousById.get(node.id)),
          );
        });

        const hasDbOrdering = nodesData.some(
          (n) => n.inx !== undefined && n.inx !== 0,
        );

        if (hasDbOrdering) {
          const dbOrder = [...nodesData]
            .sort((a, b) => (a.inx ?? 0) - (b.inx ?? 0))
            .map((n) => n.id);
          setNodeOrder(dbOrder);
        } else {
          setNodeOrder(
            loadStoredOrder(
              "node-order",
              nodesData.map((n) => n.id),
            ),
          );
        }
      } else {
        if (!silent) {
          toast.error(res.msg || "加载节点列表失败");
        }
      }
    } catch {
      if (!silent) {
        toast.error("网络错误，请重试");
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  const handleWebSocketMessage = (data: any) => {
    const { id, type, data: messageData } = data;
    const nodeId = Number(id);
    if (Number.isNaN(nodeId)) return;

    if (type === "status") {
      if (messageData === 1) {
        if (window.__pendingNodeRefresh?.has(nodeId)) {
          window.__pendingNodeRefresh.delete(nodeId);
          setNodeList((prev) =>
            prev.map((n) =>
              n.id === nodeId
                ? { ...n, rollbackLoading: false, upgradeLoading: false }
                : n,
            ),
          );
          setTimeout(() => loadNodes({ silent: true }), 500);
        }
        clearOfflineTimer(nodeId);
        setNodeList((prev) =>
          prev.map((node) => {
            if (node.id !== nodeId) return node;
            if (node.connectionStatus === "online") return node;
            return {
              ...node,
              connectionStatus: "online" as const,
              expiryReminderDismissed: node.expiryReminderDismissed ?? 0,
              expiryReminderDismissedUntil:
                node.expiryReminderDismissedUntil ?? null,
            } as Node;
          }),
        );
        // 触发一次节点列表刷新，获取最新 version
        setTimeout(() => loadNodes({ silent: true }), 500);
      } else {
        scheduleNodeOffline(nodeId);
      }
    } else if (type === "info") {
      if (window.__pendingNodeRefresh?.has(nodeId)) {
        window.__pendingNodeRefresh.delete(nodeId);
        setNodeList((prev) =>
          prev.map((n) =>
            n.id === nodeId
              ? { ...n, rollbackLoading: false, upgradeLoading: false }
              : n,
          ),
        );
        setTimeout(() => loadNodes({ silent: true }), 500);
      }
      clearOfflineTimer(nodeId);
      setNodeList((prev) =>
        prev.map((node) => {
          if (node.id === nodeId) {
            const systemInfo = buildNodeSystemInfo(
              messageData,
              node.systemInfo,
            );
            if (!systemInfo) {
              return node;
            }
            return {
              ...node,
              connectionStatus: "online" as const,
              systemInfo,
              expiryReminderDismissed: node.expiryReminderDismissed ?? 0,
              expiryReminderDismissedUntil:
                node.expiryReminderDismissedUntil ?? null,
            } as Node;
          }
          return node;
        }),
      );
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

          if (progressData.data.percent >= 100) {
            setNodeList((prev) =>
              prev.map((n) =>
                n.id === nodeId
                  ? { ...n, upgradeLoading: false, rollbackLoading: false }
                  : n,
              ),
            );
            setTimeout(() => {
              setUpgradeProgress((prev) => {
                const next = { ...prev };
                delete next[nodeId];
                return next;
              });
            }, 1500);
            [2000, 5000, 10000].forEach((delay) => {
              setTimeout(() => {
                loadNodes({ silent: true });
              }, delay);
            });
          }
        }
      } catch { }
    } else if (type === "metric") {
      clearOfflineTimer(nodeId);
      const metric =
        typeof messageData === "string" ? JSON.parse(messageData) : messageData;

      setRealtimeNodeMetrics((prev) => {
        return {
          ...prev,
          [nodeId]: {
            ...prev[nodeId],
            uploadTraffic: Number(
              metric.netOutBytes ??
              metric.bytes_transmitted ??
              prev[nodeId]?.uploadTraffic ??
              0,
            ),
            downloadTraffic: Number(
              metric.netInBytes ??
              metric.bytes_received ??
              prev[nodeId]?.downloadTraffic ??
              0,
            ),
            // 周期流量（新字段）
            periodTraffic: metric.period_bytes_received !== undefined || metric.period_bytes_transmitted !== undefined
              ? {
                rx: Number(metric.period_bytes_received ?? 0),
                tx: Number(metric.period_bytes_transmitted ?? 0),
                since: metric.baseline_recorded_at || 0,
                nextReset: metric.next_reset_at || 0,
                cycle: metric.renewal_cycle || "",
              }
              : prev[nodeId]?.periodTraffic,
          },
        };
      });

      setNodeList((prev) =>
        prev.map((node) => {
          if (node.id !== nodeId) return node;
          return {
            ...node,
            connectionStatus: "online",
          };
        }),
      );
    }
  };

  const { wsConnected, wsConnecting, usingPollingFallback } = useNodeRealtime({
    onMessage: handleWebSocketMessage,
  });

  useEffect(() => {
    loadNodes();
    loadRemoteUsage();
  }, [loadNodes, loadRemoteUsage]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeTab]);

  useEffect(() => {
    if (!usingPollingFallback) {
      return;
    }
    void loadNodes({ silent: true });
    const interval = window.setInterval(() => {
      void loadNodes({ silent: true });
    }, NODE_FALLBACK_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(interval);
    };
  }, [loadNodes, usingPollingFallback]);

  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond === 0) return "0 B/s";
    const k = 1024;
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));
    return (
      parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
    );
  };

  const formatTraffic = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const formatFlow = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) {
      return "0 B";
    }
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    if (bytes < 1024 * 1024 * 1024)
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatChainType = (chainType: number, hopInx: number) => {
    if (chainType === 1) return "入口节点";
    if (chainType === 2) return `中继跳点 #${hopInx}`;
    if (chainType === 3) return "出口节点";
    return "未知链路";
  };

  const ipv4Regex =
    /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex =
    /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

  const validateIpv4Literal = (ip: string): boolean =>
    ipv4Regex.test(ip.trim());
  const validateIpv6Literal = (ip: string): boolean =>
    ipv6Regex.test(ip.trim());

  const hostnameRegex =
    /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/;
  const validateHostname = (host: string): boolean => {
    const v = host.trim();
    if (!v) return false;
    if (v === "localhost") return true;
    return hostnameRegex.test(v);
  };

  const validatePort = (
    portStr: string,
  ): { valid: boolean; error?: string } => {
    if (!portStr || !portStr.trim()) {
      return { valid: false, error: "请输入端口" };
    }

    const trimmed = portStr.trim();
    const parts = trimmed
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p);

    if (parts.length === 0) {
      return { valid: false, error: "请输入有效的端口" };
    }

    for (const part of parts) {
      if (part.includes("-")) {
        const range = part.split("-").map((p) => p.trim());
        if (range.length !== 2) {
          return { valid: false, error: `端口范围格式错误: ${part}` };
        }

        const start = parseInt(range[0]);
        const end = parseInt(range[1]);
        if (isNaN(start) || isNaN(end)) {
          return { valid: false, error: `端口必须是数字: ${part}` };
        }

        if (start < 1 || start > 65535 || end < 1 || end > 65535) {
          return {
            valid: false,
            error: `端口范围必须在 1-65535 之间: ${part}`,
          };
        }

        if (start >= end) {
          return { valid: false, error: `起始端口必须小于结束端口: ${part}` };
        }
      } else {
        const port = parseInt(part);
        if (isNaN(port)) {
          return { valid: false, error: `端口必须是数字: ${part}` };
        }

        if (port < 1 || port > 65535) {
          return { valid: false, error: `端口必须在 1-65535 之间: ${part}` };
        }
      }
    }

    return { valid: true };
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!form.name.trim()) {
      newErrors.name = "请输入节点名称";
    } else if (form.name.trim().length < 2) {
      newErrors.name = "节点名称长度至少2位";
    } else if (form.name.trim().length > 50) {
      newErrors.name = "节点名称长度不能超过50位";
    }

    if (
      (form.renewalCycle && !form.expiryTime) ||
      (!form.renewalCycle && form.expiryTime)
    ) {
      newErrors.expiryTime = "请同时设置续费周期和续费基准时间";
    }

    const v4 = form.serverIpV4.trim();
    const v6 = form.serverIpV6.trim();
    const intranet = form.intranetIp.trim();

    if (v4 && !validateIpv4Literal(v4) && !validateHostname(v4)) {
      newErrors.serverIpV4 = "请输入有效的 IPv4 地址或域名";
    }
    if (v6 && !validateIpv6Literal(v6) && !validateHostname(v6)) {
      newErrors.serverIpV6 = "请输入有效的 IPv6 地址或域名";
    }
    if (intranet && !validateIpv4Literal(intranet) && !validateHostname(intranet)) {
      newErrors.intranetIp = "请输入有效的内网 IPv4 地址或域名";
    }

    const portValidation = validatePort(form.port);
    if (!portValidation.valid) {
      newErrors.port = portValidation.error || "端口格式错误";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAdd = () => {
    setDialogTitle("新增节点");
    setIsEdit(false);
    setDialogVisible(true);
    resetForm();
    setProtocolDisabled(true);
    setProtocolDisabledReason("节点未在线，等待节点上线后再设置");
  };

  const handleEdit = (node: Node) => {
    setDialogTitle("编辑节点");
    setIsEdit(true);


    setForm({
      id: node.id,
      name: node.name,
      remark: node.remark || "",
      expiryTime: node.expiryTime || 0,
      renewalCycle: node.renewalCycle || "",
      groupId: node.groupId || null,
      intranetIp: node.intranetIp || "",
      serverIpV4: node.serverIpV4 || "",
      serverIpV6: node.serverIpV6 || "",
      port: node.port || "10000-65535",
      tcpListenAddr: node.tcpListenAddr || "[::]",
      udpListenAddr: node.udpListenAddr || "[::]",
      interfaceName: (node as any).interfaceName || "",
      extraIPs: node.extraIPs || "",
      http: typeof node.http === "number" ? node.http : 1,
      tls: typeof node.tls === "number" ? node.tls : 1,
      socks: typeof node.socks === "number" ? node.socks : 1,
    });

    const offline = node.connectionStatus !== "online";
    setProtocolDisabled(offline);
    setProtocolDisabledReason(
      offline ? "节点未在线，等待节点上线后再设置" : "",
    );
    setDialogVisible(true);
  };

  const handleDelete = (node: Node) => {
    setNodeToDelete(node);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!nodeToDelete) return;
    setDeleteLoading(true);
    try {
      const res = await deleteNode(nodeToDelete.id);
      if (res.code === 0) {
        toast.success("删除成功");
        setNodeList((prev) => prev.filter((n) => n.id !== nodeToDelete.id));
        setDeleteModalOpen(false);
        setNodeToDelete(null);
      } else {
        toast.error(res.msg || "删除失败");
      }
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleDismissExpiryReminder = async (nodeId: number) => {
    try {
      const res = await dismissNodeExpiryReminder(nodeId);
      if (res.code === 0) {
        setNodeList((prev) =>
          prev.map((n) =>
            n.id === nodeId ? { ...n, expiryReminderDismissed: 1 } : n,
          ),
        );
        setInfoPopoverOpenId(null);
        toast.success("提醒已关闭");
      } else {
        toast.error(res.msg || "操作失败");
      }
    } catch (err) {
      toast.error("网络错误，请重试");
    }
  };

  const handleAssignNodeToGroup = async (
    nodeId: number,
    groupId: number | null,
  ) => {
    try {
      await assignNodeToGroup(nodeId, groupId);
      setNodeList((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, groupId } : n)),
      );
      toast.success(groupId ? "分组已更新" : "已移除分组");
      setGroupSelectorNode(null);
    } catch (error) {
      toast.error("操作失败");
    }
  };

  const openInstallSelector = (node: Node) => {
    setInstallTargetNode(node);
    setInstallChannel("dev");
    setInstallSelectorOpen(true);
  };

  const handleCopyInstallCommand = async (
    node: Node,
    channel: ReleaseChannel,
  ) => {
    setNodeList((prev) =>
      prev.map((n) => (n.id === node.id ? { ...n, copyLoading: true } : n)),
    );

    try {
      const res = await getNodeInstallCommand(node.id, channel);
      if (res.code === 0 && res.data) {
        const copied = await tryCopyInstallCommand(res.data);
        if (copied) {
          toast.success(
            `${channel === "stable" ? "正式版" : "测试版"}安装命令已复制到剪贴板`,
          );
        } else {
          setInstallCommand(res.data);
          setCurrentNodeName(node.name);
          setInstallCommandModal(true);
        }
      } else {
        toast.error(res.msg || "获取安装命令失败");
      }
    } catch {
      toast.error("获取安装命令失败");
    } finally {
      setNodeList((prev) =>
        prev.map((n) => (n.id === node.id ? { ...n, copyLoading: false } : n)),
      );
    }
  };

  const handleCopyDomesticInstallCommand = async (node: Node) => {
    setNodeList((prev) =>
      prev.map((n) => (n.id === node.id ? { ...n, copyLoading: true } : n)),
    );

    try {
      const res = await getNodeInstallCommandDomestic(node.id);
      if (res.code === 0 && res.data) {
        const copied = await tryCopyInstallCommand(res.data);
        if (copied) {
          toast.success("国内机对接命令已复制到剪贴板");
        } else {
          setInstallCommand(res.data);
          setCurrentNodeName(node.name);
          setInstallCommandModal(true);
        }
      } else {
        toast.error(res.msg || "获取命令失败");
      }
    } catch {
      toast.error("获取命令失败");
    } finally {
      setNodeList((prev) =>
        prev.map((n) => (n.id === node.id ? { ...n, copyLoading: false } : n)),
      );
    }
  };

  const handleCopyOverseasInstallCommand = async (node: Node) => {
    setNodeList((prev) =>
      prev.map((n) => (n.id === node.id ? { ...n, copyLoading: true } : n)),
    );

    try {
      const res = await getNodeInstallCommandOverseas(node.id);
      if (res.code === 0 && res.data) {
        const copied = await tryCopyInstallCommand(res.data);
        if (copied) {
          toast.success("国外机对接命令已复制到剪贴板");
        } else {
          setInstallCommand(res.data);
          setCurrentNodeName(node.name);
          setInstallCommandModal(true);
        }
      } else {
        toast.error(res.msg || "获取命令失败");
      }
    } catch {
      toast.error("获取命令失败");
    } finally {
      setNodeList((prev) =>
        prev.map((n) => (n.id === node.id ? { ...n, copyLoading: false } : n)),
      );
    }
  };

  const handleCopyAutoInstallCommand = async (node: Node) => {
    setNodeList((prev) =>
      prev.map((n) => (n.id === node.id ? { ...n, copyLoading: true } : n)),
    );

    try {
      // 自动探测线路：从国内下载源下载 install-auto.sh
      const res = await getNodeInstallCommandDomestic(node.id);
      if (res.code === 0 && res.data) {
        // 修改命令，使用 install-auto.sh 而不是 install.sh
        let command = res.data as string;
        command = command.replace('/install.sh', '/install-auto.sh');
        const copied = await tryCopyInstallCommand(command);
        if (copied) {
          toast.success("自动探测线路命令已复制到剪贴板");
        } else {
          setInstallCommand(command);
          setCurrentNodeName(node.name);
          setInstallCommandModal(true);
        }
      } else {
        toast.error(res.msg || "获取命令失败");
      }
    } catch {
      toast.error("获取命令失败");
    } finally {
      setNodeList((prev) =>
        prev.map((n) => (n.id === node.id ? { ...n, copyLoading: false } : n)),
      );
    }
  };

  const handleCopyOfflineInstallCommand = async (node: Node) => {
    setNodeList((prev) =>
      prev.map((n) => (n.id === node.id ? { ...n, copyLoading: true } : n)),
    );

    try {
      const res = await getNodeInstallCommandOffline(node.id);
      if (res.code === 0 && res.data) {
        const data = res.data as OfflineDeployPayload;
        // 前端硬编码命令格式
        const command = `unzip -d /tmp/flux_agent -o offline.zip && bash /tmp/flux_agent/offline.sh -a ${data.panelAddr} -s ${data.secret}`;
        const copied = await tryCopyInstallCommand(command);
        if (copied) {
          toast.success("离线部署命令已复制到剪贴板");
        } else {
          setOfflineCommand(command);
          setOfflineDeployData(data);
          setCurrentNodeName(data.nodeName || node.name);
          setOfflineModalOpen(true);
        }
      } else {
        toast.error(res.msg || "获取命令失败");
      }
    } catch {
      toast.error("获取命令失败");
    } finally {
      setNodeList((prev) =>
        prev.map((n) => (n.id === node.id ? { ...n, copyLoading: false } : n)),
      );
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text);
        toast.success(`${label}已复制到剪贴板`);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-9999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        toast.success(`${label}已复制到剪贴板`);
        document.body.removeChild(textArea);
      }
    } catch {
      toast.error("复制失败，请手动选择文本复制");
    }
  };

  const handleConfirmInstallCommand = async () => {
    if (!installTargetNode) return;
    setInstallSelectorOpen(false);
    await handleCopyInstallCommand(installTargetNode, installChannel);
  };

  const loadReleasesByChannel = useCallback(async (channel: ReleaseChannel) => {
    setReleasesLoading(true);
    try {
      const res = await getNodeReleases(channel);
      if (res.code === 0 && Array.isArray(res.data)) {
        setReleases(res.data);
        // 获取最新版本号（第一个）
        if (res.data.length > 0) {
          setLatestVersion(res.data[0].version);
        }
      } else {
        toast.error(res.msg || "获取版本列表失败");
      }
    } catch {
      toast.error("获取版本列表失败");
    } finally {
      setReleasesLoading(false);
    }
  }, []);

  const openUpgradeModal = async (
    target: "single" | "batch",
    nodeId?: number,
  ) => {
    // 获取 ghfast_url 配置
    const configRes = await getConfigByName('ghfast_url');
    if (configRes.code === 0 && configRes.data?.value) {
      setGhfastURL(configRes.data.value);
    } else {
      setGhfastURL('https://ghfast.top');
    }
    
    const defaultChannel: ReleaseChannel = "dev";
    setUpgradeTarget(target);
    setUpgradeTargetNodeId(nodeId || null);
    setReleaseChannel(defaultChannel);
    setSelectedVersion("");
    setLatestVersion('');
    setUpgradeModalOpen(true);
    await loadReleasesByChannel(defaultChannel);
  };

  // 获取当前操作类型文本（升级/回退/更新）
  const getCurrentActionText = (): string => {
    // 未选择版本时，显示"更新"
    if (!selectedVersion) return '更新';
    
    // 单个节点升级时，对比版本
    if (upgradeTarget === "single" && upgradeTargetNodeId) {
      const node = nodeList.find(n => n.id === upgradeTargetNodeId);
      if (node?.version) {
        const currentVersion = node.version.split(' ')[0]; // 提取版本号部分，如 "gost 2.2.5-beta37" → "gost"
        const versionOnly = currentVersion.replace(/^gost\s*/i, ''); // 提取纯版本号 "2.2.5-beta37"
        return compareVersions(selectedVersion, versionOnly) > 0 ? '升级' : '回退';
      }
    }
    
    // 批量升级时默认显示"更新"（中性词）
    return '更新';
  };

  const handleConfirmUpgrade = async () => {
    const version = selectedVersion || undefined;

    if (upgradeTarget === "single" && upgradeTargetNodeId) {
      setUpgradeModalOpen(false);
      const node = nodeList.find((n) => n.id === upgradeTargetNodeId);
      if (!node) return;
      setNodeList((prev) =>
        prev.map((n) =>
          n.id === upgradeTargetNodeId ? { ...n, upgradeLoading: true } : n,
        ),
      );
      try {
        const res = await upgradeNode(
          upgradeTargetNodeId,
          version,
          releaseChannel,
        );
        if (res.code === 0) {
          toast.success(`节点升级命令已发送，节点将自动重启`);
        } else {
          toast.error(res.msg || "升级失败");
        }
      } catch {
        toast.error("网络错误，请重试");
      } finally {
        setNodeList((prev) =>
          prev.map((n) =>
            n.id === upgradeTargetNodeId ? { ...n, upgradeLoading: false } : n,
          ),
        );
      }
    } else if (upgradeTarget === "batch") {
      const selectedLocalIds = Array.from(selectedIds).filter((id) => {
        const matchedNode = nodeList.find((node) => node.id === id);
        return matchedNode?.isRemote !== 1;
      });

      if (selectedLocalIds.length === 0) {
        toast.error("请选择本地节点进行升级");
        setUpgradeModalOpen(false);
        return;
      }

      setBatchUpgradeLoading(true);
      setUpgradeModalOpen(false);
      try {
        const res = await batchUpgradeNodes(
          selectedLocalIds,
          version,
          releaseChannel,
        );
        if (res.code === 0) {
          toast.success(
            `批量升级命令已发送到 ${selectedLocalIds.length} 个节点`,
          );
        } else {
          toast.error(res.msg || "批量升级失败");
        }
      } catch {
        toast.error("网络错误，请重试");
      } finally {
        setBatchUpgradeLoading(false);
      }
    }
  };

  // 批量重置流量
  const handleBatchResetTraffic = async () => {
    const selectedLocalIds = Array.from(selectedIds).filter((id) =>
      localNodes.some((n) => n.id === id),
    );

    if (selectedLocalIds.length === 0) {
      toast.error("请选择本地节点进行重置");
      setBatchResetTrafficModalOpen(false);
      return;
    }

    setBatchResetTrafficLoading(true);
    try {
      const res = await batchResetNodeTraffic(selectedLocalIds, "管理员手动重置");
      if (res.code === 0) {
        const successCount = (res.data as any)?.filter((r: { success: boolean }) => r.success).length || 0;
        toast.success(`已成功重置 ${successCount}/${selectedLocalIds.length} 个节点的流量统计`);
        setBatchResetTrafficModalOpen(false);
        setSelectMode(false);
        setSelectedIds(new Set());
      } else {
        toast.error(res.msg || "批量重置失败");
      }
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setBatchResetTrafficLoading(false);
    }
  };

  const handleRollbackNode = (node: Node) => {
    setNodeToRollback(node);
    setRollbackModalOpen(true);
  };

  const confirmRollback = async () => {
    if (!nodeToRollback) return;
    const node = nodeToRollback;
    setRollbackModalOpen(false);

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
        window.__pendingNodeRefresh = window.__pendingNodeRefresh || new Set();
        window.__pendingNodeRefresh.add(node.id);
      } else {
        toast.error(res.msg || "回退失败");
        setUpgradeProgress((prev) => {
          const next = { ...prev };
          delete next[node.id];
          return next;
        });
      }
    } catch {
      toast.error("网络错误，请重试");
      setUpgradeProgress((prev) => {
        const next = { ...prev };
        delete next[node.id];
        return next;
      });
    } finally {
      if (window.__pendingNodeRefresh?.has(node.id)) {
        setTimeout(
          () =>
            setNodeList((prev) =>
              prev.map((n) =>
                n.id === node.id ? { ...n, rollbackLoading: false } : n,
              ),
            ),
          15000,
        );
      } else {
        setNodeList((prev) =>
          prev.map((n) =>
            n.id === node.id ? { ...n, rollbackLoading: false } : n,
          ),
        );
      }
      setNodeToRollback(null);
    }
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    setSubmitLoading(true);

    try {
      const apiCall = isEdit ? updateNode : createNode;

      const { intranetIp, serverIpV4, serverIpV6, ...rest } = form;
      const data = {
        ...rest,
        remark: form.remark.trim(),
        expiryTime: form.expiryTime,
        renewalCycle: form.renewalCycle,
        groupId: form.groupId,
        extraIPs: form.extraIPs,
        // 分别传递三个字段给后端
        intranetIp: intranetIp?.trim(),
        serverIpV4: serverIpV4?.trim(),
        serverIpV6: serverIpV6?.trim(),
      };

      const res = await apiCall(data);
      if (res.code === 0) {
        toast.success(isEdit ? "更新成功" : "创建成功");
        setDialogVisible(false);

        if (isEdit) {
          setNodeList((prev) =>
            prev.map((n) =>
              n.id === form.id
                ? ({
                  ...n,
                  name: form.name,
                  remark: form.remark.trim(),
                  expiryTime: form.expiryTime,
                  renewalCycle: form.renewalCycle,
                  groupId: form.groupId,
                  intranetIp: form.intranetIp?.trim(),
                  serverIpV4: form.serverIpV4,
                  serverIpV6: form.serverIpV6,
                  port: form.port,
                  tcpListenAddr: form.tcpListenAddr,
                  udpListenAddr: form.udpListenAddr,
                  interfaceName: form.interfaceName,
                  http: form.http,
                  tls: form.tls,
                  socks: form.socks,
                  expiryReminderDismissed: n.expiryReminderDismissed ?? 0,
                  expiryReminderDismissedUntil:
                    n.expiryReminderDismissedUntil ?? null,
                } as Node)
                : n,
            ),
          );
        } else {
          loadNodes();
        }
      } else {
        toast.error(res.msg || (isEdit ? "更新失败" : "创建失败"));
      }
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setSubmitLoading(false);
    }
  };

  const resetForm = () => {
    setForm({
      id: null,
      name: "",
      remark: "",
      expiryTime: 0,
      renewalCycle: "",
      groupId: null,
      intranetIp: "",
      serverIpV4: "",
      serverIpV6: "",
      port: "10000-65535",
      tcpListenAddr: "[::]",
      udpListenAddr: "[::]",
      interfaceName: "",
      extraIPs: "",
      http: 0,
      tls: 0,
      socks: 0,
    });
    setErrors({});
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!active || !over || active.id === over.id) return;
    if (!nodeOrder || nodeOrder.length === 0) return;

    const activeId = Number(active.id);
    const overId = Number(over.id);
    if (isNaN(activeId) || isNaN(overId)) return;

    const displayNodeIds = displayNodes.map((node) => node.id);
    const oldIndex = displayNodeIds.indexOf(activeId);
    const newIndex = displayNodeIds.indexOf(overId);

    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    const reorderedDisplayIds = arrayMove(displayNodeIds, oldIndex, newIndex);
    const displayIdSet = new Set(displayNodeIds);
    let reorderedDisplayIndex = 0;

    const newOrder = nodeOrder.map((id) => {
      if (!displayIdSet.has(id)) {
        return id;
      }
      const nextId = reorderedDisplayIds[reorderedDisplayIndex];
      reorderedDisplayIndex += 1;
      return nextId;
    });

    setNodeOrder(newOrder);
    saveOrder("node-order", newOrder);

    try {
      const nodesToUpdate = newOrder.map((id, index) => ({ id, inx: index }));
      const response = await updateNodeOrder({ nodes: nodesToUpdate });
      if (response.code === 0) {
        setNodeList((prev) =>
          prev.map((node) => {
            const updated = nodesToUpdate.find((n) => n.id === node.id);
            return updated ? { ...node, inx: updated.inx } : node;
          }),
        );
      } else {
        toast.error("保存排序失败：" + (response.msg || "未知错误"));
      }
    } catch {
      toast.error("保存排序失败，请重试");
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (next.size > 0 && !selectMode) {
        setSelectMode(true);
      }
      if (next.size === 0 && selectMode) {
        setSelectMode(false);
      }
      return next;
    });
  };

  const handleSelectAllToggle = (isSelected: boolean) => {
    if (isSelected) {
      setSelectedIds(new Set(displayNodes.map((n) => n.id)));
      if (!selectMode) {
        setSelectMode(true);
      }
    } else {
      setSelectedIds(new Set());
      setSelectMode(false);
    }
  };

  const selectAll = () => {
    setSelectedIds(new Set(displayNodes.map((n) => n.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleBatchRollback = async () => {
    const selectedLocalIds = Array.from(selectedIds).filter((id) => {
      const matchedNode = nodeList.find((node) => node.id === id);
      return matchedNode?.isRemote !== 1;
    });

    if (selectedLocalIds.length === 0) {
      toast.error("请选择本地节点进行回退");
      setBatchRollbackModalOpen(false);
      return;
    }

    setBatchRollbackModalOpen(false);
    setNodeList((prev) =>
      prev.map((n) =>
        selectedLocalIds.includes(n.id) ? { ...n, rollbackLoading: true } : n,
      ),
    );

    let successCount = 0;
    let failCount = 0;

    await Promise.all(
      selectedLocalIds.map(async (id) => {
        try {
          const res = await rollbackNode(id);
          if (res.code === 0) {
            successCount++;
            window.__pendingNodeRefresh =
              window.__pendingNodeRefresh || new Set();
            window.__pendingNodeRefresh.add(id);
          } else {
            failCount++;
            setNodeList((prev) =>
              prev.map((n) =>
                n.id === id ? { ...n, rollbackLoading: false } : n,
              ),
            );
          }
        } catch {
          failCount++;
          setNodeList((prev) =>
            prev.map((n) =>
              n.id === id ? { ...n, rollbackLoading: false } : n,
            ),
          );
        }
      }),
    );

    if (successCount > 0) {
      toast.success(
        `成功发送 ${successCount} 个节点的回退指令，节点将自动重启`,
      );
    }
    if (failCount > 0) {
      toast.error(`${failCount} 个节点回退指令发送失败`);
    }

    setTimeout(() => {
      setNodeList((prev) =>
        prev.map((n) => {
          if (
            selectedLocalIds.includes(n.id) &&
            window.__pendingNodeRefresh?.has(n.id)
          ) {
            return { ...n, rollbackLoading: false };
          }
          return n;
        }),
      );
    }, 15000);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      const res = await batchDeleteNodes(Array.from(selectedIds));
      if (res.code === 0) {
        toast.success(`成功删除 ${selectedIds.size} 个节点`);
        setNodeList((prev) => prev.filter((n) => !selectedIds.has(n.id)));
        setSelectedIds(new Set());
        setBatchDeleteModalOpen(false);
        setSelectMode(false);
      } else {
        toast.error(res.msg || "删除失败");
      }
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setBatchLoading(false);
    }
  };

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 250,
        tolerance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const nodeExpiryStats = useMemo(() => {
    return nodeList.reduce(
      (acc, node) => {
        if (node.isRemote === 1) {
          return acc;
        }

        const meta = getNodeExpiryMeta(node.expiryTime, node.renewalCycle);
        if (meta.state === "expired") acc.expired += 1;
        if (meta.state === "expiringSoon") acc.expiringSoon += 1;
        if (getNodeReminderEnabled(node)) {
          acc.withExpiry += 1;
        }
        return acc;
      },
      { expired: 0, expiringSoon: 0, withExpiry: 0 },
    );
  }, [nodeList]);

  const sortedNodes = useMemo((): Node[] => {
    if (!nodeList || nodeList.length === 0) return [];
    const sortedByDb = [...nodeList].sort((a, b) => {
      const aInx = a.inx ?? 0;
      const bInx = b.inx ?? 0;
      return aInx - bInx;
    });

    if (
      nodeOrder &&
      nodeOrder.length > 0 &&
      sortedByDb.every((n) => n.inx === undefined || n.inx === 0)
    ) {
      const nodeMap = new Map(nodeList.map((n) => [n.id, n] as const));
      const localSorted: Node[] = [];
      nodeOrder.forEach((id) => {
        const node = nodeMap.get(id);
        if (node) localSorted.push(node);
      });
      nodeList.forEach((node) => {
        if (!nodeOrder.includes(node.id)) {
          localSorted.push(node);
        }
      });
      return localSorted;
    }
    return sortedByDb;
  }, [nodeList, nodeOrder]);

  const filterNodesByKeyword = useCallback((nodes: Node[], keyword: string) => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      return nodes;
    }
    return nodes.filter(
      (node) =>
        (node.name && node.name.toLowerCase().includes(normalizedKeyword)) ||
        (node.remark &&
          node.remark.toLowerCase().includes(normalizedKeyword)) ||
        (node.serverIp &&
          node.serverIp.toLowerCase().includes(normalizedKeyword)) ||
        (node.serverIpV4 &&
          node.serverIpV4.toLowerCase().includes(normalizedKeyword)) ||
        (node.serverIpV6 &&
          node.serverIpV6.toLowerCase().includes(normalizedKeyword)),
    );
  }, []);

  const localNodes = useMemo(
    () => sortedNodes.filter((node) => node.isRemote !== 1),
    [sortedNodes],
  );

  const remoteNodes = useMemo(
    () => sortedNodes.filter((node) => node.isRemote === 1),
    [sortedNodes],
  );

  const filteredLocalNodes = useMemo(() => {
    const keywordFiltered = filterNodesByKeyword(
      localNodes,
      localSearchKeyword,
    );

    const groupFiltered = filterGroupId !== null
      ? keywordFiltered.filter((node) => {
        if (filterGroupId === -1) {
          return !node.groupId || node.groupId === 0;
        }
        return node.groupId === filterGroupId;
      })
      : keywordFiltered;

    if (nodeFilterMode === "all") {
      return groupFiltered;
    }

    return groupFiltered.filter((node) => {
      const expiryMeta = getNodeExpiryMeta(node.expiryTime, node.renewalCycle);
      switch (nodeFilterMode) {
        case "expiringSoon":
          return expiryMeta.state === "expiringSoon";
        case "expired":
          return expiryMeta.state === "expired";
        case "withExpiry":
          return getNodeReminderEnabled(node);
        default:
          return true;
      }
    });
  }, [
    filterNodesByKeyword,
    localNodes,
    localSearchKeyword,
    nodeFilterMode,
    filterGroupId,
  ]);

  const filteredRemoteNodes = useMemo(
    () => filterNodesByKeyword(remoteNodes, remoteSearchKeyword),
    [filterNodesByKeyword, remoteNodes, remoteSearchKeyword],
  );

  const currentSearchKeyword =
    activeTab === "remote" ? remoteSearchKeyword : localSearchKeyword;

  const setCurrentSearchKeyword =
    activeTab === "remote" ? setRemoteSearchKeyword : setLocalSearchKeyword;

  const displayNodes = useMemo(
    () => (activeTab === "remote" ? filteredRemoteNodes : filteredLocalNodes),
    [activeTab, filteredLocalNodes, filteredRemoteNodes],
  );

  const canBatchUpgrade = activeTab === "local";
  const canUseExpiryFilter = activeTab === "local";
  const hasKeywordSearch = currentSearchKeyword.trim().length > 0;
  const hasActiveFilters = nodeFilterMode !== "all" || filterGroupId !== null;
  const isDisplayFiltered =
    hasKeywordSearch || (canUseExpiryFilter && hasActiveFilters);

  const sortableNodeIds = useMemo(
    () => displayNodes.map((n) => n.id),
    [displayNodes],
  );

  const groupedNodes = useMemo(() => {
    const groupsMap = new Map<
      number | string,
      { group: NodeGroupApiItem | null; nodes: Node[] }
    >();

    nodeGroups.forEach((g) => {
      groupsMap.set(Number(g.id), { group: g, nodes: [] });
    });
    groupsMap.set("none", { group: null, nodes: [] });

    displayNodes.forEach((node) => {
      const groupId = node.groupId && node.groupId > 0 ? Number(node.groupId) : "none";
      if (groupsMap.has(groupId)) {
        groupsMap.get(groupId)!.nodes.push(node);
      } else {
        groupsMap.get("none")!.nodes.push(node);
      }
    });

    return Array.from(groupsMap.values()).filter((g) => g.nodes.length > 0);
  }, [displayNodes, nodeGroups]);

  const renderNodeCard = (node: Node, listeners: any) => {
    const isRemoteNode = node.isRemote === 1;
    const remoteUsage = isRemoteNode ? remoteUsageMap[node.id] : null;
    const expiryMeta = getNodeExpiryMeta(node.expiryTime, node.renewalCycle);
    const connectionStatusMeta = getConnectionStatusMeta(node.connectionStatus);
    const hasRemark = Boolean(node.remark?.trim());
    const hasExpiryInfo = Boolean(
      node.expiryTime &&
      node.expiryTime > 0 &&
      node.renewalCycle &&
      (node.expiryReminderDismissed !== 1 ||
        (node.expiryReminderDismissedUntil &&
          node.expiryReminderDismissedUntil * 1000 < Date.now())),
    );
    const hasInfoTrigger = hasRemark || hasExpiryInfo;
    const infoCount = Number(hasExpiryInfo) + Number(hasRemark);
    const infoPlacement = infoPopoverPlacement[node.id] ?? "left";

    return (
      <Card
        key={node.id}
        className={`group relative overflow-visible shadow-sm border border-divider hover:shadow-md transition-shadow duration-200 h-full flex flex-col ${node.expiryReminderDismissed ? "" : expiryMeta.accentClassName
          }`}
        data-node-card="true"
      >
        <CardHeader className="pb-3 md:pb-3">
          <div className="flex flex-col gap-2 w-full">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Checkbox
                  isSelected={selectedIds.has(node.id)}
                  onValueChange={() => toggleSelect(node.id)}
                />
                <div
                  className="cursor-grab active:cursor-grabbing p-1 text-default-400 hover:text-default-600 transition-colors"
                  {...listeners}
                  style={{ touchAction: "none" }}
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
              </div>
              {node.groupId && node.groupId > 0 ? (
                (() => {
                  const group = (nodeGroups || []).find(
                    (g: any) => Number(g.id) === Number(node.groupId),
                  );
                  return group ? (
                    <div className="flex-shrink-0 inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-medium" style={{ backgroundColor: `${group.color}1A`, color: group.color }}>{group.name}</div>
                  ) : (
                    <div className="flex-shrink-0 inline-flex items-center justify-center bg-default-500/10 text-default-500 px-2 py-0.5 rounded text-xs font-medium">未分组</div>
                  );
                })()
              ) : (
                <div className="flex-shrink-0 inline-flex items-center justify-center bg-default-500/10 text-default-500 px-2 py-0.5 rounded text-xs font-medium">未分组</div>
              )}
              <div className="flex-shrink-0">
                {hasInfoTrigger && (
                  <div className="relative">
                    <button
                      aria-label={`查看节点信息，共 ${infoCount} 项`}
                      className={`relative flex h-7 w-7 items-center justify-center rounded-full border border-divider/80 bg-background/95 text-default-500 shadow-sm transition hover:border-default-300 hover:text-foreground focus-visible:border-default-300 focus-visible:text-foreground focus-visible:outline-none ${infoPopoverOpenId === node.id
                        ? "border-default-300 text-foreground"
                        : ""
                        }`}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateInfoPopoverPlacement(node.id, null);
                        setInfoPopoverOpenId(
                          infoPopoverOpenId === node.id ? null : node.id,
                        );
                      }}
                      onFocus={(event) =>
                        updateInfoPopoverPlacement(
                          node.id,
                          event.currentTarget,
                        )
                      }
                      onMouseEnter={(event) =>
                        updateInfoPopoverPlacement(
                          node.id,
                          event.currentTarget,
                        )
                      }
                    >
                      <svg
                        aria-hidden="true"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.8}
                        />
                      </svg>
                      {hasRemark && (
                        <span className="absolute -right-1 -top-1 flex h-2.5 w-2.5 rounded-full border border-background bg-red-300 shadow-sm dark:bg-default-500" />
                      )}
                    </button>
                    <div
                      className={`absolute z-[60] w-72 max-w-[min(18rem,calc(100vw-4rem))] rounded-xl border border-divider/80 bg-background/98 p-3 shadow-xl backdrop-blur transition-all duration-150 ${infoPopoverOpenId === node.id
                        ? "visible opacity-100 pointer-events-auto"
                        : "invisible opacity-0 pointer-events-none"
                        } ${infoPlacement === "bottom"
                          ? "right-0 top-[calc(100%+0.75rem)] translate-y-1"
                          : "right-[calc(100%+0.75rem)] top-1/2 -translate-y-1/2 translate-x-1"
                        }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.nativeEvent.stopImmediatePropagation();
                      }}
                    >
                      <div className="space-y-3">
                        {hasExpiryInfo && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="text-[11px] font-medium text-default-500">
                                到期提醒
                              </div>
                              <button
                                className="text-[10px] text-default-400 hover:text-default-600 transition-colors"
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  e.nativeEvent.stopImmediatePropagation();
                                  handleDismissExpiryReminder(node.id);
                                }}
                              >
                                关闭提醒
                              </button>
                            </div>
                            <div className="rounded-lg border border-divider/80 bg-default-50/80 px-3 py-2 text-xs leading-5 text-default-700">
                              {formatNodeRenewalTime(
                                expiryMeta.nextDueTime,
                              )}{" "}
                              <div className={`text-[10px] h-5 px-1.5 ml-1 inline-flex items-center justify-center rounded font-medium ${expiryMeta.tone === "danger" ? "bg-danger-500/10 text-danger-600 dark:text-danger-400" : expiryMeta.tone === "warning" ? "bg-warning-500/10 text-warning-600 dark:text-warning-400" : expiryMeta.tone === "success" ? "bg-success-500/10 text-success-600 dark:text-success-400" : "bg-default-500/10 text-default-500"}`}>{expiryMeta.label}</div>
                            </div>
                          </div>
                        )}


                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${connectionStatusMeta.color === "success"
                  ? "bg-emerald-500"
                  : "bg-rose-500"
                  }`}
                title={connectionStatusMeta.text}
              />
              {/* 这里加上 title 属性 */}
              <h3 
                className="font-semibold text-foreground truncate text-sm flex-1"
                title={node.name}
              >
                {node.name}
              </h3>
            </div>
          </div>
        </CardHeader>

        <CardBody className="pt-0 pb-3 md:pt-0 md:pb-3">
          {isRemoteNode && node.syncError && (
            <div className="mb-3 px-2 py-1.5 rounded-md bg-warning-50 dark:bg-warning-100/10 text-warning-700 dark:text-warning-400 text-xs">
              {getRemoteSyncErrorMessage(node.syncError)}
            </div>
          )}
          <div className="space-y-2 mb-4">
            {node.expiryTime &&
              node.expiryTime > 0 &&
              node.renewalCycle && <div className="hidden" />}
            <div className="flex justify-between items-center text-sm min-w-0">
              <span className="text-default-600 flex-shrink-0">地址</span>
              <div className="text-right text-xs min-w-0 flex-1 ml-2 min-h-[2.125rem] flex flex-col items-end gap-1 overflow-hidden">
                {node.serverIpV4?.trim() || node.serverIpV6?.trim() ? (
                  <>
                    {node.serverIpV4?.trim() && (
                      <span
                        className="font-medium text-sm cursor-pointer hover:bg-default-200/50 rounded px-1 transition-colors truncate w-fit"
                        title={node.serverIpV4.trim()}
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(
                            node.serverIpV4!.trim(),
                            "IPv4 地址",
                          );
                        }}
                      >
                        {node.serverIpV4.trim()}
                      </span>
                    )}
                    {node.serverIpV6?.trim() && (
                      <span
                        className="font-medium text-sm cursor-pointer hover:bg-default-200/50 rounded px-1 transition-colors truncate block max-w-[150px] text-right"
                        title={node.serverIpV6.trim()}
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(
                            node.serverIpV6!.trim(),
                            "IPv6 地址",
                          );
                        }}
                      >
                        {node.serverIpV6.trim()}
                      </span>
                    )}
                  </>
                ) : (
                  <span
                    className="font-medium text-sm cursor-pointer hover:bg-default-200/50 rounded px-1 transition-colors truncate w-fit"
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
            </div>
            {!isRemoteNode && (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-default-600">版本</span>
                  <div className="flex items-center gap-1.5">
                    {node.version && (
                      <DistroIcon
                        className="w-4 h-4 shrink-0"
                        distro={parseDistroFromVersion(node.version)}
                        style={{
                          color: getDistroColor(
                            parseDistroFromVersion(node.version),
                          ),
                        }}
                      />
                    )}
                    <span className="font-medium text-sm text-default-600">
                      {node.version ? node.version.split(" ")[0] : "未知"}
                    </span>
                  </div>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-default-600">周期流量</span>
                  <span className="font-medium text-sm text-danger-600 dark:text-danger-400">
                    {node.connectionStatus === "online" &&
                      realtimeNodeMetrics[node.id]
                      ? formatTraffic(
                        (realtimeNodeMetrics[node.id]?.periodTraffic?.rx ?? 0) +
                        (realtimeNodeMetrics[node.id]?.periodTraffic?.tx ?? 0),
                      )
                      : "-"}
                  </span>
                </div>
                {node.connectionStatus === "online" &&
                  realtimeNodeMetrics[node.id]?.periodTraffic && (
                    <div className="text-xs text-default-500 space-y-0.5 mt-1">
                      <div className="flex justify-between">
                        <span>↑ 上行</span>
                        <span className="font-medium">
                          {formatTraffic(realtimeNodeMetrics[node.id]?.periodTraffic?.rx ?? 0)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>↓ 下行</span>
                        <span className="font-medium">
                          {formatTraffic(realtimeNodeMetrics[node.id]?.periodTraffic?.tx ?? 0)}
                        </span>
                      </div>
                      {realtimeNodeMetrics[node.id]?.periodTraffic?.since && (
                        <div className="flex justify-between">
                          <span>周期始于</span>
                          <span className="font-medium">
                            {formatDate(realtimeNodeMetrics[node.id]!.periodTraffic!.since)}
                          </span>
                        </div>
                      )}
                      {realtimeNodeMetrics[node.id]?.periodTraffic?.nextReset && (
                        <div className="flex justify-between">
                          <span>下次重置</span>
                          <span className="font-medium text-primary">
                            {formatDate(realtimeNodeMetrics[node.id]!.periodTraffic!.nextReset!)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                {upgradeProgress[node.id] &&
                  upgradeProgress[node.id].percent < 100 && (
                    <div className="mt-1">
                      <Progress
                        showValueLabel
                        aria-label="升级进度"
                        color="warning"
                        label={upgradeProgress[node.id].message}
                        size="sm"
                        value={upgradeProgress[node.id].percent}
                      />
                    </div>
                  )}
              </>
            )}
          </div>

          {isRemoteNode && (
            <div className="space-y-3 mb-4">
              {remoteUsage ? (
                <>
                  <div className="text-xs rounded-md border border-default-200 dark:border-default-100/30 bg-default-50 dark:bg-default-100/20 p-2.5 space-y-2">
                    <div className="flex justify-between gap-2">
                      <span className="text-default-500">远程地址</span>
                      <span
                        className="font-medium text-right truncate"
                        title={remoteUsage.remoteUrl || node.remoteUrl || "-"}
                      >
                        {remoteUsage.remoteUrl || node.remoteUrl || "-"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-default-500">共享ID</span>
                      <span className="font-medium">#{remoteUsage.shareId}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-default-500">流量</span>
                      <span className="font-medium">
                        {formatFlow(remoteUsage.currentFlow)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-default-500">带宽上限</span>
                      <span className="font-medium">
                        {remoteUsage.maxBandwidth > 0
                          ? formatSpeed(remoteUsage.maxBandwidth)
                          : "不限"}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs rounded-md border border-default-200 dark:border-default-100/30 bg-default-50 dark:bg-default-100/20 p-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-default-500">占用端口</span>
                      <span className="font-medium text-default-700 dark:text-default-300">
                        {remoteUsage.usedPorts.length}/
                        {Math.max(
                          remoteUsage.portRangeEnd -
                          remoteUsage.portRangeStart +
                          1,
                          0,
                        )}
                      </span>
                    </div>
                    <div className="max-h-20 overflow-y-auto rounded bg-white/70 dark:bg-black/20 p-1.5 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1">
                      {remoteUsage.usedPorts.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {remoteUsage.usedPorts.map((port) => (
                            <div key={`${node.id}-port-${port}`} className="inline-flex items-center justify-center bg-default-500/10 text-default-500 px-1.5 py-0.5 rounded text-[11px] font-medium shrink-0 whitespace-nowrap">{port}</div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-default-400">暂无占用端口</div>
                      )}
                    </div>
                  </div>
                  <div className="text-xs rounded-md border border-default-200 dark:border-default-100/30 bg-default-50 dark:bg-default-100/20 p-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-default-500">绑定明细</span>
                      <span className="font-medium text-default-700 dark:text-default-300">
                        {remoteUsage.activeBindingNum}
                      </span>
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1.5 pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1">
                      {remoteUsage.bindings.length > 0 ? (
                        remoteUsage.bindings.map((binding) => (
                          <div
                            key={binding.bindingId}
                            className="rounded border border-default-200 dark:border-default-100/30 bg-white/70 dark:bg-black/20 p-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className="font-medium truncate"
                                title={binding.tunnelName}
                              >
                                {binding.tunnelName}
                              </span>
                              <span className="font-medium text-[11px]">
                                #{binding.tunnelId}
                              </span>
                            </div>
                            <div className="mt-1 text-[11px] text-default-500 flex items-center justify-between gap-2">
                              <span>
                                {formatChainType(
                                  binding.chainType,
                                  binding.hopInx,
                                )}
                              </span>
                              <span className="font-medium">
                                端口 {binding.allocatedPort}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-default-400">暂无绑定明细</div>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-xs rounded-md border border-default-200 dark:border-default-100/30 bg-default-50 dark:bg-default-100/20 p-2.5 text-default-500">
                  暂未获取到远程占用数据
                </div>
              )}
            </div>
          )}

          {!isRemoteNode && (
            <>
              <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                <div className="text-center p-2 bg-primary-50 dark:bg-primary-100/20 rounded border border-primary-200 dark:border-primary-300/20">
                  <div className="text-primary-600 dark:text-primary-400 mb-0.5">
                    ↑ 上行流量
                  </div>
                  <div className="font-medium text-sm text-primary-700 dark:text-primary-300">
                    {node.connectionStatus === "online" &&
                      realtimeNodeMetrics[node.id]
                      ? formatTraffic(
                        realtimeNodeMetrics[node.id]?.uploadTraffic ?? 0,
                      )
                      : "-"}
                  </div>
                </div>
                <div className="text-center p-2 bg-success-50 dark:bg-success-100/20 rounded border border-success-200 dark:border-success-300/20">
                  <div className="text-success-600 dark:text-success-400 mb-0.5">
                    ↓ 下行流量
                  </div>
                  <div className="font-medium text-sm text-success-700 dark:text-success-300">
                    {node.connectionStatus === "online" &&
                      realtimeNodeMetrics[node.id]
                      ? formatTraffic(
                        realtimeNodeMetrics[node.id]?.downloadTraffic ?? 0,
                      )
                      : "-"}
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="space-y-3">
            {/* 核心修改：统一使用一个两列的 grid，它会自动把里面的 4 个元素排成 2 行 2 列 */}
            <div className={`grid gap-2 ${isRemoteNode ? "grid-cols-1" : "grid-cols-2"}`}>
              {!isRemoteNode && (
                <>
                  {/* 第 1 个格子：对接 */}
                  <div className="w-full">
                    <Dropdown>
                      <DropdownTrigger>
                        <Button
                          className="min-h-8 w-full"
                          color="success"
                          isLoading={node.copyLoading}
                          size="sm"
                          variant="flat"
                        >
                          对接
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu aria-label="对接方式">
                        <DropdownItem
                          key="auto"
                          onPress={() => handleCopyAutoInstallCommand(node)}
                        >
                          🔘 自动探测线路
                        </DropdownItem>
                        <DropdownItem
                          key="overseas"
                          onPress={() => handleCopyOverseasInstallCommand(node)}
                        >
                          🌏 国外机主线路
                        </DropdownItem>
                        <DropdownMenuSeparator />
                        <DropdownItem
                          key="offline"
                          onPress={() => handleCopyOfflineInstallCommand(node)}
                        >
                          📦 离线部署
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </div>

                  {/* 第 2 个格子：更新 */}
                  <Button
                    className="min-h-8 w-full"
                    color="warning"
                    isDisabled={node.connectionStatus !== "online"}
                    isLoading={node.upgradeLoading}
                    size="sm"
                    variant="flat"
                    onPress={() => openUpgradeModal("single", node.id)}
                  >
                    更新
                  </Button>

                  {/* 第 3 个格子：编辑 */}
                  <Button
                    className="min-h-8 w-full"
                    color="primary"
                    size="sm"
                    variant="flat"
                    onPress={() => handleEdit(node)}
                  >
                    编辑
                  </Button>
                </>
              )}

              {/* 第 4 个格子：删除 (如果是远程节点，它会自动变成占满 1 整行) */}
              <Button
                className="min-h-8 w-full"
                color="danger"
                size="sm"
                variant="flat"
                onPress={() => handleDelete(node)}
              >
                删除
              </Button>
            </div>
          </div>

          {/* 备注 */}
          {node.remark?.trim() && (
            <div className="mt-2 pt-2 border-t border-divider">
              <div className="flex items-center text-xs text-default-500">
                <span className="font-medium text-red-500 flex-shrink-0">备注：</span>
                {/* 加上 title 属性，这样虽然截断了，但鼠标悬浮依然可以查看完整内容 */}
                <span className="truncate ml-1" title={node.remark.trim()}>
                  {node.remark.trim()}
                </span>
              </div>
            </div>
          )}

        </CardBody>
      </Card>
    );
  };

  return (
    <AnimatedPage className="px-3 lg:px-6 py-8">
      <div className="mb-6 space-y-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Button
            className={`shrink-0 text-white font-medium ${activeTab === "local" ? "" : "bg-default-400 hover:bg-default-500"}`}
            color={activeTab === "local" ? "primary" : "default"}
            size="sm"
            variant={activeTab === "local" ? "solid" : "flat"}
            onPress={() => setActiveTab("local")}
          >
            本地节点
            <div className="ml-1 shrink-0 whitespace-nowrap inline-flex items-center justify-center bg-black/10 dark:bg-white/20 px-1.5 py-0.5 rounded text-[11px] font-medium">{localNodes.length}</div>
          </Button>
          <Button
            className={`shrink-0 text-white font-medium ${activeTab === "remote" ? "" : "bg-default-400 hover:bg-default-500"}`}
            color={activeTab === "remote" ? "primary" : "default"}
            size="sm"
            variant={activeTab === "remote" ? "solid" : "flat"}
            onPress={() => setActiveTab("remote")}
          >
            远程节点
            <div className="ml-1 shrink-0 whitespace-nowrap inline-flex items-center justify-center bg-black/10 dark:bg-white/20 px-1.5 py-0.5 rounded text-[11px] font-medium">{remoteNodes.length}</div>
          </Button>
        </div>

        <div className="flex flex-row items-center justify-between gap-3 overflow-x-auto pb-1">
          <div
            className={`flex-1 max-w-sm flex items-center gap-2 shrink-0 ${isSearchVisible ? "min-w-[200px]" : "min-w-0"
              }`}
          >
            <SearchBar
              isVisible={isSearchVisible}
              placeholder={
                activeTab === "remote"
                  ? "搜索远程节点名称或IP"
                  : "搜索本地节点名称或IP"
              }
              value={currentSearchKeyword}
              onChange={setCurrentSearchKeyword}
              onClose={() => setIsSearchVisible(false)}
              onOpen={() => {
                setIsSearchVisible(true);
                setTimeout(() => {
                  const searchInput = document.querySelector(
                    'input[placeholder*="搜索"]',
                  );
                  if (searchInput) (searchInput as HTMLElement).focus();
                }, 150);
              }}
            />
          </div>

          <div className="flex h-8 items-center justify-end gap-2 whitespace-nowrap shrink-0">
            {selectMode ? (
              <>
                <span className="text-sm text-danger-400 shrink-0">
                  已选 {selectedIds.size} 项
                </span>
                <Button
                  color="primary"
                  size="sm"
                  variant="flat"
                  onPress={selectAll}
                >
                  全选
                </Button>
                <Button
                  color="secondary"
                  size="sm"
                  variant="flat"
                  onPress={deselectAll}
                >
                  清空
                </Button>
                <Button
                  color="warning"
                  isDisabled={selectedIds.size === 0 || !canBatchUpgrade}
                  isLoading={batchUpgradeLoading}
                  size="sm"
                  variant="flat"
                  onPress={() => openUpgradeModal("batch")}
                >
                  批量更新
                </Button>
                <Button
                  color="secondary"
                  isDisabled={selectedIds.size === 0 || !canBatchUpgrade}
                  size="sm"
                  variant="flat"
                  onPress={() => setBatchRollbackModalOpen(true)}
                >
                  回退
                </Button>
                <Button
                  color="primary"
                  isDisabled={selectedIds.size === 0}
                  size="sm"
                  variant="flat"
                  onPress={() => setBatchResetTrafficModalOpen(true)}
                >
                  重置流量
                </Button>
                <Button
                  color="danger"
                  isDisabled={selectedIds.size === 0}
                  size="sm"
                  variant="flat"
                  onPress={() => setBatchDeleteModalOpen(true)}
                >
                  删除
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <Button
                    className="whitespace-nowrap bg-red-100"
                    color={
                      (canUseExpiryFilter && nodeFilterMode !== "all") || filterGroupId !== null
                        ? "secondary"
                        : "danger"
                    }
                    isDisabled={!canUseExpiryFilter && filterGroupId === null}
                    size="sm"
                    title={
                      canUseExpiryFilter || filterGroupId !== null
                        ? "筛选条件"
                        : "远程节点不支持到期筛选"
                    }
                    variant="flat"
                    onPress={() => setIsFilterModalOpen(true)}
                  >
                    筛选{" "}
                    {((canUseExpiryFilter && nodeFilterMode !== "all") || filterGroupId !== null) &&
                      `(${[(canUseExpiryFilter && nodeFilterMode !== "all"), filterGroupId !== null].filter(Boolean).length})`}
                  </Button>
                  {((canUseExpiryFilter && nodeFilterMode !== "all") || filterGroupId !== null) && (
                    <Button
                      color="warning"
                      size="sm"
                      variant="flat"
                      onPress={() => {
                        resetNodeFilterMode();
                        setFilterGroupId(null);
                      }}
                    >
                      重置
                    </Button>
                  )}
                </div>

                <Button
                  color={
                    viewMode === "grid"
                      ? "warning"
                      : viewMode === "list"
                        ? "primary"
                        : "secondary"
                  }
                  size="sm"
                  variant="flat"
                  onPress={() => {
                    // 当前是分组(grouped) -> 切换到列表(list)
                    // 当前是列表(list) -> 切换到卡片(grid)
                    // 当前是卡片(grid) -> 切换到分组(grouped)
                    if (viewMode === "grouped") setViewMode("list");
                    else if (viewMode === "list") setViewMode("grid");
                    else setViewMode("grouped");
                  }}
                >
                  {/* 按钮显示的是"下一个要切换到的视图"的名称 */}
                  {viewMode === "grouped"
                    ? "列表"
                    : viewMode === "list"
                      ? "卡片"
                      : "默认"}
                </Button>
                <Button
                  color="primary"
                  size="sm"
                  variant="flat"
                  onPress={handleAdd}
                >
                  新增
                </Button>
                <Button
                  className="bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/45"
                  size="sm"
                  variant="flat"
                  onPress={() => setGroupManagerOpen(true)}
                >
                  分组
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <NodeGroupManager
        isOpen={groupManagerOpen}
        onGroupChange={() => { loadNodeGroups(); loadNodes({ silent: true }); }}
        onOpenChange={setGroupManagerOpen}
      />

      {!wsConnected && (
        <Alert
          className="mb-4"
          color="warning"
          description={
            wsConnecting
              ? "监控连接中..."
              : usingPollingFallback
                ? "监控连接已断开，已切换为列表自动刷新兜底模式。"
                : "监控连接已断开，正在重连..."
          }
          variant="flat"
        />
      )}

      {loading ? (
        <PageLoadingState message="正在加载..." />
      ) : nodeList.length === 0 ? (
        <PageEmptyState
          className="h-64"
          message="暂无节点配置，点击上方按钮开始创建"
        />
      ) : displayNodes.length === 0 ? (
        <PageEmptyState
          className="h-64"
          message={
            isDisplayFiltered
              ? activeTab === "remote"
                ? "未找到匹配的远程节点"
                : "未找到匹配的本地节点"
              : activeTab === "remote"
                ? "暂无远程节点"
                : "暂无本地节点，点击上方按钮开始创建"
          }
        />
      ) : (
        <>
          {viewMode === "grid" && (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext
                items={sortableNodeIds}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                  {displayNodes.map((node) => (
                    <SortableItem key={node.id} id={node.id}>
                      {(listeners) => renderNodeCard(node, listeners)}
                    </SortableItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {viewMode === "grouped" && (
            <div className="space-y-4">
              {groupedNodes.map(({ group, nodes }) => {
                const groupSortableIds = nodes.map((n) => n.id);
                const groupIdStr = String(group ? group.id : "none");
                const isCollapsed = collapsedGroups[groupIdStr];

                return (
                  <div
                    key={groupIdStr}
                    className="overflow-hidden rounded-lg border border-divider bg-content1"
                  >
                    <div
                      className="flex items-center justify-between border-b border-divider bg-default-100 hover:bg-default-200/50 px-4 py-2.5 cursor-pointer select-none transition-colors"
                      onClick={() => {
                        setCollapsedGroups((prev) => ({
                          ...prev,
                          [groupIdStr]: !prev[groupIdStr],
                        }));
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Button
                          isIconOnly
                          className="h-7 w-7 min-w-7 pointer-events-none -ml-1"
                          size="sm"
                          variant="light"
                        >
                          <svg
                            aria-hidden="true"
                            className={`h-4 w-4 transition-transform ${isCollapsed ? "-rotate-90" : "rotate-0"}`}
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                          >
                            <path d="m6 9 6 6 6-6" />
                          </svg>
                        </Button>
                        {group ? (
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: group.color }}
                            />
                            <span className="truncate text-sm font-semibold text-foreground">
                              {group.name}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 ml-1">
                            <div className="w-3 h-3 rounded-full bg-gray-300 flex-shrink-0" />
                            <span className="truncate text-sm font-semibold text-foreground">
                              未分组
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-default-600">
                          {nodes.length} 个节点
                        </span>
                      </div>
                    </div>

                    {!isCollapsed && (
                      <div className="">
                        <DndContext
                          collisionDetection={pointerWithin}
                          sensors={sensors}
                          onDragEnd={handleDragEnd}
                        >
                          <SortableContext
                            items={groupSortableIds}
                            strategy={rectSortingStrategy}
                          >
                            <div className="overflow-x-auto">
                              <NodeListView
                                copyToClipboard={copyToClipboard}
                                displayNodes={nodes}
                                formatTraffic={formatTraffic}
                                handleDelete={handleDelete}
                                handleEdit={handleEdit}
                                handleRollbackNode={handleRollbackNode}
                                handleCopyAutoInstallCommand={handleCopyDomesticInstallCommand}
                                handleCopyOverseasInstallCommand={handleCopyOverseasInstallCommand}
                                handleCopyOfflineInstallCommand={handleCopyOfflineInstallCommand}
                                nodeGroups={nodeGroups}
                                openInstallSelector={openInstallSelector}
                                openUpgradeModal={openUpgradeModal}
                                realtimeNodeMetrics={realtimeNodeMetrics}
                                selectedIds={selectedIds}
                                toggleSelect={toggleSelect}
                                toggleSelectAll={(isSelected: boolean) => {
                                  if (isSelected) {
                                    setSelectedIds(prev => new Set([...prev, ...nodes.map(n => n.id)]));
                                    if (!selectMode) setSelectMode(true);
                                  } else {
                                    setSelectedIds(prev => {
                                      const next = new Set(prev);
                                      nodes.forEach(n => next.delete(n.id));
                                      if (next.size === 0) setSelectMode(false);
                                      return next;
                                    });
                                  }
                                }}
                                upgradeProgress={upgradeProgress}
                                filterGroupId={filterGroupId}
                                setFilterGroupId={setFilterGroupId}
                              />
                            </div>
                          </SortableContext>
                        </DndContext>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {viewMode === "list" && (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext
                items={sortableNodeIds}
                strategy={rectSortingStrategy}
              >
                <NodeListView
                  copyToClipboard={copyToClipboard}
                  displayNodes={displayNodes}
                  formatTraffic={formatTraffic}
                  handleDelete={handleDelete}
                  handleEdit={handleEdit}
                  handleRollbackNode={handleRollbackNode}
                  handleCopyAutoInstallCommand={handleCopyDomesticInstallCommand}
                  handleCopyOverseasInstallCommand={handleCopyOverseasInstallCommand}
                  handleCopyOfflineInstallCommand={handleCopyOfflineInstallCommand}
                  nodeGroups={nodeGroups}
                  openInstallSelector={openInstallSelector}
                  openUpgradeModal={openUpgradeModal}
                  realtimeNodeMetrics={realtimeNodeMetrics}
                  selectedIds={selectedIds}
                  toggleSelect={toggleSelect}
                  toggleSelectAll={handleSelectAllToggle}
                  upgradeProgress={upgradeProgress}
                  filterGroupId={filterGroupId}
                  setFilterGroupId={setFilterGroupId}
                />
              </SortableContext>
            </DndContext>
          )}
        </>
      )}

      {/* 新增/编辑节点对话框 */}
      <Modal
        backdrop="blur"
        classNames={{
          base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
        }}
        isOpen={dialogVisible}
        placement="center"
        scrollBehavior="outside"
        size="xl"
        onClose={() => setDialogVisible(false)}
      >
        <ModalContent>
          <ModalHeader>{dialogTitle}</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  description=""
                  errorMessage={errors.name}
                  isInvalid={!!errors.name}
                  label="节点名称"
                  placeholder="请输入节点名称"
                  value={form.name}
                  variant="bordered"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />

                <Textarea
                  classNames={{
                    inputWrapper: "!min-h-[20px] py-1.5",
                    input: "!min-h-[20px]",
                  }}
                  description=""
                  label="备注"
                  placeholder="例如: 搬瓦工年付，2026-12 续费，日本中转"
                  rows={1}
                  value={form.remark}
                  variant="bordered"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, remark: e.target.value }))
                  }
                />
              </div>
              <Select
                description="将节点分配到指定分组（可选）"
                label="分组"
                placeholder="选择分组"
                selectedKeys={
                  form.groupId && form.groupId > 0 ? [String(form.groupId)] : []
                }
                variant="bordered"
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as string | undefined;
                  setForm((prev) => ({
                    ...prev,
                    groupId: selected && selected !== "" ? parseInt(selected) : null,
                  }));
                }}
              >
                <SelectItem key="" textValue="未分组">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-gray-300" />
                    <span>未分组</span>
                  </div>
                </SelectItem>
                {nodeGroups.map((group) => (
                  <SelectItem key={group.id} textValue={group.name}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: group.color }}
                      />
                      <span>{group.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </Select>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select
                  description="支持月、季、年三种周期"
                  label="续费周期"
                  placeholder="选择续费周期"
                  selectedKeys={form.renewalCycle ? [form.renewalCycle] : []}
                  variant="bordered"
                  onSelectionChange={(keys) => {
                    const selected = Array.from(keys)[0] as
                      | NodeRenewalCycle
                      | undefined;
                    setForm((prev) => ({
                      ...prev,
                      renewalCycle: selected || "",
                    }));
                  }}
                >
                  <SelectItem key="month" textValue="月">
                    月付
                  </SelectItem>
                  <SelectItem key="quarter" textValue="季">
                    季付
                  </SelectItem>
                  <SelectItem key="year" textValue="年">
                    年付
                  </SelectItem>
                </Select>
                <Input
                  description="系统会自动按周期同日推算下次续费时间"
                  errorMessage={errors.expiryTime}
                  isInvalid={!!errors.expiryTime}
                  label="续费基准时间"
                  max="9999-12-31"
                  type="date"
                  value={
                    form.expiryTime > 0
                      ? new Date(form.expiryTime).toISOString().slice(0, 10)
                      : ""
                  }
                  variant="bordered"
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      expiryTime: e.target.value
                        ? new Date(e.target.value).getTime()
                        : 0,
                    }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  description="可选：建议填写公网IPv4或对应解析域名，可留空"
                  errorMessage={errors.serverIpV4}
                  isInvalid={!!errors.serverIpV4}
                  label="域名/公网IPv4地址"
                  placeholder="例如：test.example.com 8.8.8.8"
                  value={form.serverIpV4}
                  variant="bordered"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, serverIpV4: e.target.value }))
                  }
                />

                <Input
                  classNames={{
                    input: "font-medium",
                  }}
                  description="支持单个端口 (80)、多个端口 (80,443) 或端口范围 (10000-65535)，多个可用逗号分隔"
                  errorMessage={errors.port}
                  isInvalid={!!errors.port}
                  label="可用端口"
                  placeholder="例如：80,443,10000-65535"
                  value={form.port}
                  variant="bordered"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, port: e.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  description="可选：建议填写内网IPv4或对应解析域名，可留空"
                  errorMessage={errors.intranetIp}
                  isInvalid={!!errors.intranetIp}
                  label="域名/内网IPv4地址"
                  placeholder="例如：10.0.0.1 192.168.1.1"
                  value={form.intranetIp}
                  variant="bordered"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, intranetIp: e.target.value }))
                  }
                />

                <Input
                  description="可选：建议填写公网IPv6或对应解析域名，可留空"
                  errorMessage={errors.serverIpV6}
                  isInvalid={!!errors.serverIpV6}
                  label="域名/公网IPv6地址"
                  placeholder="例如：2001:db8::10"
                  value={form.serverIpV6}
                  variant="bordered"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, serverIpV6: e.target.value }))
                  }
                />
              </div>

              <Accordion variant="bordered">
                <AccordionItem
                  key="advanced"
                  aria-label="高级配置"
                  title="高级配置"
                >
                  <div className="space-y-4 pb-2 px-[12px]">
                    <Input
                      description="用于多IP服务器指定使用那个IP请求远程地址，不懂的默认为空就行"
                      errorMessage={errors.interfaceName}
                      isInvalid={!!errors.interfaceName}
                      label="出口网卡名或IP"
                      placeholder="请输入出口网卡名或IP"
                      value={form.interfaceName}
                      variant="bordered"
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          interfaceName: e.target.value,
                        }))
                      }
                    />

                    <Input
                      description="多IP服务器可填写额外IP地址，逗号分隔"
                      label="额外IP地址"
                      placeholder="例如: 192.168.1.100, 10.0.0.5"
                      value={form.extraIPs}
                      variant="bordered"
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          extraIPs: e.target.value,
                        }))
                      }
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Input
                        errorMessage={errors.tcpListenAddr}
                        isInvalid={!!errors.tcpListenAddr}
                        label="TCP监听地址"
                        placeholder="请输入TCP监听地址"
                        startContent={
                          <div className="pointer-events-none flex items-center">
                            <span className="text-default-400 text-small">
                              TCP
                            </span>
                          </div>
                        }
                        value={form.tcpListenAddr}
                        variant="bordered"
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            tcpListenAddr: e.target.value,
                          }))
                        }
                      />

                      <Input
                        errorMessage={errors.udpListenAddr}
                        isInvalid={!!errors.udpListenAddr}
                        label="UDP监听地址"
                        placeholder="请输入UDP监听地址"
                        startContent={
                          <div className="pointer-events-none flex items-center">
                            <span className="text-default-400 text-small">
                              UDP
                            </span>
                          </div>
                        }
                        value={form.udpListenAddr}
                        variant="bordered"
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            udpListenAddr: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-default-700 mb-2">
                        屏蔽协议
                      </div>
                      <div className="text-xs text-default-500 mb-2">
                        开启开关以屏蔽对应协议
                      </div>
                      {protocolDisabled && (
                        <Alert
                          className="mb-2"
                          color="warning"
                          description={
                            protocolDisabledReason || "等待节点上线后再设置"
                          }
                          variant="flat"
                        />
                      )}
                      <div
                        className={`grid grid-cols-1 sm:grid-cols-3 gap-3 bg-default-50 dark:bg-default-100 p-3 rounded-md border border-default-200 dark:border-default-100/30 ${protocolDisabled ? "opacity-70" : ""
                          }`}
                      >
                        <div className="px-3 py-3 rounded-lg bg-white dark:bg-default-50 border border-default-200 dark:border-default-100/30 hover:border-primary-200 transition-colors">
                          <div className="flex items-center gap-2 mb-2">
                            <svg
                              aria-hidden="true"
                              className="w-4 h-4 text-default-500"
                              fill="none"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                            >
                              <rect height="16" rx="2" width="20" x="2" y="4" />
                              <path d="M2 10h20" />
                            </svg>
                            <div className="text-sm font-medium text-default-700">
                              HTTP
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-default-500">
                              禁用/启用
                            </div>
                            <Switch
                              isDisabled={protocolDisabled}
                              isSelected={form.http === 1}
                              size="sm"
                              onValueChange={(v) =>
                                setForm((prev) => ({
                                  ...prev,
                                  http: v ? 1 : 0,
                                }))
                              }
                            />
                          </div>
                          <div className="mt-1 text-xs text-default-400">
                            {form.http === 1 ? "已开启" : "已关闭"}
                          </div>
                        </div>

                        <div className="px-3 py-3 rounded-lg bg-white dark:bg-default-50 border border-default-200 dark:border-default-100/30 hover:border-primary-200 transition-colors">
                          <div className="flex items-center gap-2 mb-2">
                            <svg
                              aria-hidden="true"
                              className="w-4 h-4 text-default-500"
                              fill="none"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                            >
                              <path d="M6 10V7a6 6 0 1 1 12 0v3" />
                              <rect
                                height="10"
                                rx="2"
                                width="16"
                                x="4"
                                y="10"
                              />
                            </svg>
                            <div className="text-sm font-medium text-default-700">
                              TLS
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-default-500">
                              禁用/启用
                            </div>
                            <Switch
                              isDisabled={protocolDisabled}
                              isSelected={form.tls === 1}
                              size="sm"
                              onValueChange={(v) =>
                                setForm((prev) => ({ ...prev, tls: v ? 1 : 0 }))
                              }
                            />
                          </div>
                          <div className="mt-1 text-xs text-default-400">
                            {form.tls === 1 ? "已开启" : "已关闭"}
                          </div>
                        </div>

                        <div className="px-3 py-3 rounded-lg bg-white dark:bg-default-50 border border-default-200 dark:border-default-100/30 hover:border-primary-200 transition-colors">
                          <div className="flex items-center gap-2 mb-2">
                            <svg
                              aria-hidden="true"
                              className="w-4 h-4 text-default-500"
                              fill="none"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              viewBox="0 0 24 24"
                            >
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" x2="12" y1="15" y2="3" />
                            </svg>
                            <div className="text-sm font-medium text-default-700">
                              SOCKS
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-default-500">
                              禁用/启用
                            </div>
                            <Switch
                              isDisabled={protocolDisabled}
                              isSelected={form.socks === 1}
                              size="sm"
                              onValueChange={(v) =>
                                setForm((prev) => ({
                                  ...prev,
                                  socks: v ? 1 : 0,
                                }))
                              }
                            />
                          </div>
                          <div className="mt-1 text-xs text-default-400">
                            {form.socks === 1 ? "已开启" : "已关闭"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <Alert
                      color="danger"
                      description="请不要在出口节点执行屏蔽协议，否则可能影响转发；屏蔽协议仅需在入口节点执行。"
                      variant="flat"
                    />
                  </div>
                </AccordionItem>
              </Accordion>

              <Alert
                className="mt-4"
                color="primary"
                description="节点ip地址是你要添加的入口/出口的ip地址，不是面板的ip地址。"
                variant="flat"
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setDialogVisible(false)}>
              取消
            </Button>
            <Button
              color="primary"
              isLoading={submitLoading}
              onPress={handleSubmit}
            >
              {submitLoading ? "提交中..." : "确定"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 回退确认模态框 */}
      <Modal
        backdrop="blur"
        classNames={{
          base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
        }}
        isOpen={rollbackModalOpen}
        placement="center"
        scrollBehavior="outside"
        size="md"
        onOpenChange={setRollbackModalOpen}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">确认回退</h2>
              </ModalHeader>
              <ModalBody>
                <p>
                  确定要将节点{" "}
                  <strong>&quot;{nodeToRollback?.name}&quot;</strong>{" "}
                  回退到上一个版本吗？
                </p>
                <p className="text-small text-default-500">
                  节点将执行版本回退并自动重启，期间会导致节点短暂离线。
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button color="secondary" onPress={confirmRollback}>
                  确认回退
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 删除确认模态框 */}
      <Modal
        backdrop="blur"
        classNames={{
          base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
        }}
        isOpen={deleteModalOpen}
        placement="center"
        scrollBehavior="outside"
        size="md"
        onOpenChange={setDeleteModalOpen}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">确认删除</h2>
              </ModalHeader>
              <ModalBody>
                <p>
                  确定要删除节点{" "}
                  <strong>&quot;{nodeToDelete?.name}&quot;</strong> 吗？
                </p>
                <p className="text-small text-default-500">
                  此操作不可恢复，请谨慎操作。
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="danger"
                  isLoading={deleteLoading}
                  onPress={confirmDelete}
                >
                  {deleteLoading ? "删除中..." : "确认删除"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal
        backdrop="blur"
        classNames={{
          base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
        }}
        isOpen={installSelectorOpen}
        placement="center"
        size="md"
        onOpenChange={setInstallSelectorOpen}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">
                  选择安装通道
                  {installTargetNode ? ` - ${installTargetNode.name}` : ""}
                </h2>
              </ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <Select
                    label="版本通道"
                    selectedKeys={[installChannel]}
                    onSelectionChange={(keys) => {
                      const selected = Array.from(keys)[0] as ReleaseChannel;
                      setInstallChannel(selected || "dev");
                    }}
                  >
                    <SelectItem key="dev" textValue="测试版">
                      测试版
                    </SelectItem>
                    <SelectItem key="stable" textValue="稳定版">
                      稳定版
                    </SelectItem>
                  </Select>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button color="primary" onPress={handleConfirmInstallCommand}>
                  生成命令
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 安装命令模态框 */}
      <Modal
        backdrop="blur"
        classNames={{
          base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
        }}
        isOpen={installCommandModal}
        placement="center"
        scrollBehavior="outside"
        size="2xl"
        onClose={() => setInstallCommandModal(false)}
      >
        <ModalContent>
          <ModalHeader>安装命令 - {currentNodeName}</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <p className="text-sm text-default-600">
                请复制以下安装命令到服务器上执行：
              </p>
              <div className="relative">
                <Textarea
                  readOnly
                  className="font-medium text-sm"
                  classNames={{
                    input: "font-medium text-sm",
                  }}
                  maxRows={10}
                  minRows={6}
                  value={installCommand}
                  variant="bordered"
                />
                <Button
                  size="sm"
                  variant="flat"
                  className="absolute bottom-2 right-2"
                  onPress={() => {
                    // 👇 直接调用你已经封装好的兼容函数，HTTP 下也能完美复制！
                    copyToClipboard(offlineCommand, "命令");
                  }}
                >
                  复制
                </Button>
              </div>
              <div className="text-xs text-default-500">
                💡 提示：请3击或拖拽鼠标选择上方完整文本进行手动复制
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              onPress={() => setInstallCommandModal(false)}
            >
              关闭
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* 版本选择升级模态框 */}
      <Modal
        backdrop="blur"
        classNames={{
          base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
        }}
        isOpen={upgradeModalOpen}
        placement="center"
        scrollBehavior="outside"
        size="md"
        onOpenChange={setUpgradeModalOpen}
      >
        <ModalContent>
          {(onClose) => {
            const actionText = getCurrentActionText();
            
            return (
              <>
                <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">
                  {upgradeTarget === "batch"
                    ? `批量${actionText} (${selectedIds.size} 个节点)`
                    : `${actionText}节点`}
                </h2>
              </ModalHeader>
              <ModalBody>
                {releasesLoading ? (
                  <div className="flex justify-center py-8">
                    <Spinner size="lg" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Select
                      label="版本通道"
                      selectedKeys={[releaseChannel]}
                      onSelectionChange={(keys) => {
                        const selected =
                          (Array.from(keys)[0] as ReleaseChannel) || "stable";
                        setReleaseChannel(selected);
                        setSelectedVersion("");
                        void loadReleasesByChannel(selected);
                      }}
                    >
                      <SelectItem key="dev" textValue="测试版">
                        测试版
                      </SelectItem>
                      <SelectItem key="stable" textValue="稳定版">
                        稳定版
                      </SelectItem>
                    </Select>
                    <Select
                      label="选择版本"
                      placeholder="留空则使用当前通道最新版本"
                      selectedKeys={selectedVersion ? [selectedVersion] : []}
                      onSelectionChange={(keys) => {
                        const selected = Array.from(keys)[0] as string;
                        setSelectedVersion(selected || "");
                      }}
                    >
                      {releases.map((r) => (
                        <SelectItem key={r.version} textValue={r.version}>
                          <div className="flex justify-between items-center">
                            <span>{r.version}</span>
                            <span className="text-xs text-default-400">
                              {r.publishedAt
                                ? new Date(r.publishedAt).toLocaleDateString()
                                : ""}
                              {r.channel === "dev" && (
                                <div className="ml-1 shrink-0 whitespace-nowrap inline-flex items-center justify-center bg-warning-500/10 text-warning-600 dark:text-warning-400 px-1.5 py-0.5 rounded text-[11px] font-medium">测试</div>
                              )}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </Select>
                    <p className="text-sm text-default-500">
                      {selectedVersion ? (
                        <span>
                          将使用 {ghfastURL} 代理加速
                          {upgradeTarget === "batch" 
                            ? `${actionText} ${selectedVersion} 版本`
                            : `${actionText}到版本 ${selectedVersion}`}
                        </span>
                      ) : (
                        <span>
                          未选择版本，将自动使用 {ghfastURL} 代理加速最新
                          {releaseChannel === "stable" ? "正式版" : "测试版"}
                          {latestVersion && ` ${latestVersion}`}
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="primary"
                  isDisabled={releasesLoading}
                  onPress={handleConfirmUpgrade}
                >
                  {!selectedVersion ? '确认更新' : `确认${actionText}`}
                </Button>
              </ModalFooter>
            </>
            );
          }}
        </ModalContent>
      </Modal>

      {/* 批量回退确认模态框 */}
      <Modal
        backdrop="blur"
        classNames={{
          base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
        }}
        isOpen={batchRollbackModalOpen}
        placement="center"
        scrollBehavior="outside"
        size="md"
        onOpenChange={setBatchRollbackModalOpen}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">确认批量回退</h2>
              </ModalHeader>
              <ModalBody>
                <p>
                  确定要将选中的{" "}
                  <strong>
                    {
                      Array.from(selectedIds).filter(
                        (id) =>
                          nodeList.find((n) => n.id === id)?.isRemote !== 1,
                      ).length
                    }
                  </strong>{" "}
                  个本地节点回退到上一个版本吗？
                </p>
                <p className="text-small text-default-500">
                  节点将执行版本回退并自动重启，期间会导致节点短暂离线。
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button color="secondary" onPress={handleBatchRollback}>
                  确认回退
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 批量重置流量确认模态框 */}
      <Modal
        backdrop="blur"
        classNames={{
          base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
        }}
        isOpen={batchResetTrafficModalOpen}
        placement="center"
        scrollBehavior="outside"
        size="md"
        onOpenChange={setBatchResetTrafficModalOpen}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">确认批量重置流量</h2>
              </ModalHeader>
              <ModalBody>
                <p>
                  确定要重置以下{" "}
                  <strong>
                    {
                      Array.from(selectedIds).filter(
                        (id) =>
                          nodeList.find((n) => n.id === id)?.isRemote !== 1,
                      ).length
                    }
                  </strong>{" "}
                  个节点的流量统计吗？
                </p>
                <p className="text-small text-default-500 mt-2">
                  重置后，当前周期流量将归档到历史，新周期从 0 开始统计。
                </p>
                <ul className="text-small text-default-500 mt-2 space-y-1">
                  {Array.from(selectedIds)
                    .filter((id) => nodeList.find((n) => n.id === id)?.isRemote !== 1)
                    .slice(0, 5)
                    .map((id) => {
                      const node = nodeList.find((n) => n.id === id);
                      return node ? (
                        <li key={id} className="truncate">
                          • {node.name}
                        </li>
                      ) : null;
                    })}
                  {selectedIds.size > 5 && (
                    <li>... 还有 {selectedIds.size - 5} 个节点</li>
                  )}
                </ul>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="primary"
                  isLoading={batchResetTrafficLoading}
                  onPress={handleBatchResetTraffic}
                >
                  确认重置
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 批量删除确认模态框 */}
      <Modal
        backdrop="blur"
        classNames={{
          base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
        }}
        isOpen={batchDeleteModalOpen}
        placement="center"
        scrollBehavior="outside"
        size="md"
        onOpenChange={setBatchDeleteModalOpen}
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">确认删除</h2>
              </ModalHeader>
              <ModalBody>
                <p>
                  确定要删除选中的 <strong>{selectedIds.size}</strong>{" "}
                  个节点吗？
                </p>
                <p className="text-small text-default-500">
                  此操作不可恢复，请谨慎操作。
                </p>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onClose}>
                  取消
                </Button>
                <Button
                  color="danger"
                  isLoading={batchLoading}
                  onPress={handleBatchDelete}
                >
                  {batchLoading ? "删除中..." : "确认删除"}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      <Modal
        classNames={{
          base: "!w-[calc(100%-32px)] !mx-auto sm:!w-full rounded-2xl overflow-hidden",
        }}
        isOpen={isFilterModalOpen}
        placement="center"
        size="md"
        onOpenChange={setIsFilterModalOpen}
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                筛选条件
              </ModalHeader>
              <ModalBody>
                <div className="flex flex-col gap-4 py-2">
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">按分组筛选</p>
                    <Select
                      aria-label="按分组筛选"
                      className="w-full"
                      selectedKeys={
                        filterGroupId !== null ? [String(filterGroupId)] : ["all"]
                      }
                      variant="bordered"
                      onSelectionChange={(keys) => {
                        const selected = Array.from(keys)[0] as string;
                        setFilterGroupId(
                          selected === "all" ? null : selected === "ungrouped" ? -1 : parseInt(selected),
                        );
                      }}
                    >
                      <SelectItem key="all">全部分组</SelectItem>
                      <SelectItem key="ungrouped">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-gray-300" />
                          <span>未分组</span>
                        </div>
                      </SelectItem>
                      {nodeGroups.map((group) => (
                        <SelectItem key={group.id.toString()} textValue={group.name}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: group.color }}
                            />
                            <span>{group.name}</span>
                            <span className="text-default-400 text-xs ml-auto">
                              {group.nodeCount}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </Select>
                  </div>

                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">按到期状态筛选</p>
                    <Select
                      aria-label="按到期状态筛选"
                      className="w-full"
                      selectedKeys={[nodeFilterMode]}
                      variant="bordered"
                      onSelectionChange={(keys) => {
                        const selected = Array.from(keys)[0] as
                          | NodeFilterMode
                          | undefined;
                        setNodeFilterMode(selected || "all");
                      }}
                    >
                      <SelectItem key="all">全部节点</SelectItem>
                      <SelectItem key="expiringSoon">
                        7 天内续费 ({nodeExpiryStats.expiringSoon})
                      </SelectItem>
                      <SelectItem key="expired">
                        已逾期 ({nodeExpiryStats.expired})
                      </SelectItem>
                      <SelectItem key="withExpiry">
                        已启用续费提醒 ({nodeExpiryStats.withExpiry})
                      </SelectItem>
                    </Select>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button
                  color="default"
                  variant="flat"
                  onPress={() => {
                    resetNodeFilterMode();
                    setFilterGroupId(null);
                  }}
                >
                  重置
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* 离线部署弹窗 */}
      <Modal
        isOpen={offlineModalOpen}
        size="lg"
        onOpenChange={setOfflineModalOpen}
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">
            ℹ️ 离线部署
          </ModalHeader>
          <ModalBody>
            {/* 1. 下载链接 */}
            <Alert
              title="请按机器的架构下载合适的离线包："
              description={
                // 👇 修改了这里的 className：换成 flex 水平排列，并加了 flex-wrap 防止手机端太挤换行，gap-4 控制左右间距
                <div className="flex flex-wrap items-center gap-4 mt-2">
                  <Link
                    href={OFFLINE_DOWNLOAD_URLS.amd64}
                    className="text-primary hover:underline flex items-center gap-2"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    offline-amd64.zip
                  </Link>
                  <Link
                    href={OFFLINE_DOWNLOAD_URLS.arm64}
                    className="text-primary hover:underline flex items-center gap-2"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    offline-arm64.zip
                  </Link>
                </div>
              }
              color="warning"
            />



            {/* 2. 命令区域 */}
            <p className="text-sm">
              <span className="font-bold">{offlineDeployData?.nodeName || currentNodeName}</span>
              <span className="font-medium"> 的离线对接命令：</span>
            </p>

            <div className="relative mt-2">
              <Textarea
                readOnly
                className="font-mono text-sm"
                value={offlineCommand}
                rows={2}
              />
              <Button
                size="sm"
                variant="flat"
                className="absolute bottom-2 right-2"
                onPress={() => {
                  copyToClipboard(offlineCommand, "命令");
                }}
              >
                复制
              </Button>
            </div>

            {/* 3. 使用说明 */}
            <Alert
              title=""
              description={
                <span className="list-decimal list-inside space-y-1 text-sm mt-2">
                  使用方法：上传离线包到【无法在线对接的机器】并重命名为 offline.zip。然后 cd 切换到【离线包所在目录】运行以上命令。
                </span>
              }
              color="primary"
            />

            {/* 4. 依赖提示 */}
            <Alert
              title=""
              description={
                <span className="mt-2 block">提示：离线安装依赖 unzip 命令，请自行安装。</span>
              }
              color="warning"
            />
          </ModalBody>
          <ModalFooter>
            <Button onPress={() => setOfflineModalOpen(false)}>知道了</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={groupSelectorNode !== null}
        size="sm"
        onOpenChange={() => setGroupSelectorNode(null)}
      >
        <ModalContent>
          <ModalHeader>选择分组</ModalHeader>
          <ModalBody>
            <div className="flex flex-wrap gap-2 pb-4">
              <Chip
                key="none"
                className="cursor-pointer hover:opacity-80"
                size="sm"
                variant="flat"
                onClick={() =>
                  handleAssignNodeToGroup(groupSelectorNode!, null)
                }
              >
                未分组
              </Chip>
              {nodeGroups.map((group) => (
                <Chip
                  key={group.id}
                  className="cursor-pointer hover:opacity-80"
                  size="sm"
                  style={{
                    backgroundColor: `${group.color}20`,
                    color: group.color,
                  }}
                  variant="flat"
                  onClick={() =>
                    handleAssignNodeToGroup(groupSelectorNode!, group.id)
                  }
                >
                  {group.name}
                </Chip>
              ))}
            </div>
          </ModalBody>
        </ModalContent>
      </Modal>
    </AnimatedPage>
  );
}
