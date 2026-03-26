import { useState, useEffect, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import {
  DndContext,
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
import { DistroIcon, parseDistroFromVersion, getDistroColor } from "@/components/distro-icon";
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
import { Progress } from "@/shadcn-bridge/heroui/progress";
import { Accordion, AccordionItem } from "@/shadcn-bridge/heroui/accordion";
import { Select, SelectItem } from "@/shadcn-bridge/heroui/select";
import { Checkbox } from "@/shadcn-bridge/heroui/checkbox";
import { NodeListView } from "@/pages/node/node-list-view";
import { NodeGroupManager } from "./node/node-group-manager";
import {
  createNode,
  getNodeList,
  updateNode,
  deleteNode,
  getNodeInstallCommand,
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
  type ReleaseChannel,
} from "@/api";
import type { NodeGroupApiItem } from "@/api/types";
import { PageEmptyState, PageLoadingState } from "@/components/page-state";
import {
  getConnectionStatusMeta,
  getRemoteSyncErrorMessage,
} from "@/pages/node/display";
import { tryCopyInstallCommand } from "@/pages/node/install-command";
import {
  getNodeRenewalSnapshot,
  formatNodeRenewalTime,
  // getNodeRenewalCycleLabel,
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
  serverHost: string;
  serverIpV4: string;
  serverIpV6: string;
  port: string;
  tcpListenAddr: string;
  udpListenAddr: string;
  interfaceName: string;
  extraIPs: string;
  http: number; // 0 关 1 开
  tls: number; // 0 关 1 开
  socks: number; // 0 关 1 开
}

type NodeTab = "local" | "remote";
type NodeViewMode = "grid" | "list";

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
    expiryReminderDismissed: existingNode?.expiryReminderDismissed ?? incomingNode.expiryReminderDismissed ?? 0,
    expiryReminderDismissedUntil: existingNode?.expiryReminderDismissedUntil ?? incomingNode.expiryReminderDismissedUntil ?? null,
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
    <div ref={setNodeRef} className="overflow-hidden h-full" style={style}>
      {children(listeners, attributes)}
    </div>
  );
};

export default function NodePage() {
  const [nodeList, setNodeList] = useState<Node[]>([]);
  const [nodeOrder, setNodeOrder] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  // 独立存储实时指标数据，避免与 systemInfo 合并导致流量数据闪烁
  const [realtimeNodeMetrics, setRealtimeNodeMetrics] = useState<
    Record<number, {
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
    }>
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

  // Backward-compat: older versions stored extra tab values.
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
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [filterGroupId, setFilterGroupId] = useState<number | null>(null);
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
    serverHost: "",
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

  const [infoPopoverOpenId, setInfoPopoverOpenId] = useState<number | null>(null);

  // 点击外部关闭信息弹窗
  useEffect(() => {
    const handleClickOutside = () => {
      if (infoPopoverOpenId !== null) {
        setInfoPopoverOpenId(null);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [infoPopoverOpenId]);

  // 安装命令相关状态
  const [installCommandModal, setInstallCommandModal] = useState(false);
  const [installCommand, setInstallCommand] = useState("");
  const [currentNodeName, setCurrentNodeName] = useState("");
  const [installSelectorOpen, setInstallSelectorOpen] = useState(false);
  const [installTargetNode, setInstallTargetNode] = useState<Node | null>(null);
  const [installChannel, setInstallChannel] =
    useState<ReleaseChannel>("dev");

  // 升级相关状态
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeTarget, setUpgradeTarget] = useState<"single" | "batch">(
    "single",
  );
  const [upgradeTargetNodeId, setUpgradeTargetNodeId] = useState<number | null>(
    null,
  );
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
  const [releaseChannel, setReleaseChannel] =
    useState<ReleaseChannel>("dev");
  const [selectedVersion, setSelectedVersion] = useState("");
  const [batchUpgradeLoading, setBatchUpgradeLoading] = useState(false);
  const [upgradeProgress, setUpgradeProgress] = useState<
    Record<number, { stage: string; percent: number; message: string }>
  >({});

  const [infoPopoverPlacement, setInfoPopoverPlacement] = useState<
    Record<number, "left" | "bottom">
  >({});

  // Node group and tag management
  const [nodeGroups, setNodeGroups] = useState<NodeGroupApiItem[]>([]);
  const [groupManagerOpen, setGroupManagerOpen] = useState(false);
  const [groupSelectorNode, setGroupSelectorNode] = useState<number | null>(null);

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
          expiryReminderDismissedUntil: node.expiryReminderDismissedUntil ?? null,
        } as Node;
      }),
    );

    // 清除实时指标数据
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
      const res = await getNodeGroupList();
      if (res.code === 0 && Array.isArray(res.data)) {
        setNodeGroups(res.data);
      }
    } catch (error) {
      // Silent fail for now
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
      // ignore remote usage errors in node page
    }
  }, []);

  // 加载节点列表
  const loadNodes = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;

    if (!silent) {
      setLoading(true);
    }

    try {
      const res = await getNodeList();

      if (res.code === 0) {
        const nodesData: Node[] = (res.data || []).map((node: any) => ({
          ...node,
          inx: node.inx ?? 0,
          expiryReminderDismissed: node.expiryReminderDismissed ?? 0,
          expiryReminderDismissedUntil: node.expiryReminderDismissedUntil ?? null,
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

        // 优先使用数据库中的 inx 字段进行排序，否则回退到本地排序
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

  // 处理WebSocket消息
  const handleWebSocketMessage = (data: any) => {
    const { id, type, data: messageData } = data;
    const nodeId = Number(id);

    if (Number.isNaN(nodeId)) return;

    if (type === "status") {
      if (messageData === 1) {
        if (window.__pendingNodeRefresh?.has(nodeId)) {
          window.__pendingNodeRefresh.delete(nodeId);
          setNodeList((prev) => prev.map((n) => n.id === nodeId ? { ...n, rollbackLoading: false, upgradeLoading: false } : n));
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
              expiryReminderDismissedUntil: node.expiryReminderDismissedUntil ?? null,
            } as Node;
          }),
        );
      } else {
        // 离线事件做延迟处理，避免短抖动导致频繁闪烁
        scheduleNodeOffline(nodeId);
      }
    } else if (type === "info") {
      if (window.__pendingNodeRefresh?.has(nodeId)) {
        window.__pendingNodeRefresh.delete(nodeId);
        setNodeList((prev) => prev.map((n) => n.id === nodeId ? { ...n, rollbackLoading: false, upgradeLoading: false } : n));
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
              expiryReminderDismissedUntil: node.expiryReminderDismissedUntil ?? null,
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

          // 核心修复：如果进度达到 100%，触发静默刷新以获取最新版本号
          if (progressData.data.percent >= 100) {
            // 1. 顺手兜个底：强行清理 Loading 状态
            setNodeList((prev) => prev.map((n) => n.id === nodeId ? { ...n, upgradeLoading: false, rollbackLoading: false } : n));

            // 2. 1.5秒后关闭进度条 UI
            setTimeout(() => {
              setUpgradeProgress(prev => {
                const next = { ...prev };
                delete next[nodeId];
                return next;
              });
            }, 1500);

            // 3. 终极修复：跨越节点重启的“真空期”
            // 分别在进度条跑完后的 2秒、5秒、10秒 各静默拉取一次列表。
            // 这样不管节点重启有多慢，最终一发必定能抓到它上线后的最新版本号！
            [2000, 5000, 10000].forEach(delay => {
              setTimeout(() => {
                loadNodes({ silent: true });
              }, delay);
            });
          }
        }
      } catch {
        // ignore parse errors
      }
    } else if (type === "metric") {
      clearOfflineTimer(nodeId);
      const metric = typeof messageData === "string" ? JSON.parse(messageData) : messageData;

      console.log(`📊 收到节点 ${nodeId} 流量推送:`, metric); // 调试日志

      setRealtimeNodeMetrics((prev) => {
        // 强制创建一个新对象，确保 React 监听到变化
        return {
          ...prev,
          [nodeId]: {
            ...prev[nodeId],
            uploadTraffic: Number(metric.netOutBytes ?? metric.bytes_transmitted ?? prev[nodeId]?.uploadTraffic ?? 0),
            downloadTraffic: Number(metric.netInBytes ?? metric.bytes_received ?? prev[nodeId]?.downloadTraffic ?? 0),
          }
        };
      });

      // 同时更新节点在线状态
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

  // 格式化速度
  const formatSpeed = (bytesPerSecond: number): string => {
    if (bytesPerSecond === 0) return "0 B/s";

    const k = 1024;
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
    const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));

    return (
      parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
    );
  };

  // 格式化流量
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
    if (chainType === 1) {
      return "入口节点";
    }
    if (chainType === 2) {
      return `中继跳点 #${hopInx}`;
    }
    if (chainType === 3) {
      return "出口节点";
    }

    return "未知链路";
  };

  // IPv4/IPv6 格式验证（仅用于判定地址族）
  const ipv4Regex =
    /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex =
    /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

  const validateIpv4Literal = (ip: string): boolean =>
    ipv4Regex.test(ip.trim());
  const validateIpv6Literal = (ip: string): boolean =>
    ipv6Regex.test(ip.trim());

  // Hostname/domain validation (no scheme/port)
  const hostnameRegex =
    /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)(?:\.(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?))*$/;
  const validateHostname = (host: string): boolean => {
    const v = host.trim();

    if (!v) return false;
    if (v === "localhost") return true;

    return hostnameRegex.test(v);
  };

  // 验证端口格式：支持 80,443,100-600
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
      // 检查是否是端口范围 (如 100-600)
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
        // 单个端口
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

  // 表单验证
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
    const host = form.serverHost.trim();

    if (!v4 && !v6 && !host) {
      const msg = "请至少填写一个 IPv4/IPv6 地址或域名";

      newErrors.serverIpV4 = msg;
      newErrors.serverIpV6 = msg;
      newErrors.serverHost = msg;
    } else {
      if (v4 && !validateIpv4Literal(v4)) {
        newErrors.serverIpV4 = "请输入有效的IPv4地址";
      }
      if (v6 && !validateIpv6Literal(v6)) {
        newErrors.serverIpV6 = "请输入有效的IPv6地址";
      }
      if (host && !validateHostname(host)) {
        newErrors.serverHost = "请输入有效的域名/主机名";
      }
    }

    const portValidation = validatePort(form.port);

    if (!portValidation.valid) {
      newErrors.port = portValidation.error || "端口格式错误";
    }

    setErrors(newErrors);

    return Object.keys(newErrors).length === 0;
  };

  // 新增节点
  const handleAdd = () => {
    setDialogTitle("新增节点");
    setIsEdit(false);
    setDialogVisible(true);
    resetForm();
    setProtocolDisabled(true);
    setProtocolDisabledReason("节点未在线，等待节点上线后再设置");
  };

  // 编辑节点
  const handleEdit = (node: Node) => {
    setDialogTitle("编辑节点");
    setIsEdit(true);

    const legacy = (node.serverIp || "").trim();
    const normalizedV4 =
      node.serverIpV4?.trim() || (validateIpv4Literal(legacy) ? legacy : "");
    const normalizedV6 =
      node.serverIpV6?.trim() || (validateIpv6Literal(legacy) ? legacy : "");
    const normalizedHost =
      !normalizedV4 && !normalizedV6 && legacy ? legacy : "";

    setForm({
      id: node.id,
      name: node.name,
      remark: node.remark || "",
      expiryTime: node.expiryTime || 0,
      renewalCycle: node.renewalCycle || "",
      groupId: node.groupId || null,
      serverHost: normalizedHost,
      serverIpV4: normalizedV4,
      serverIpV6: normalizedV6,
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

  // 删除节点
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
        // 更新节点列表状态
        setNodeList((prev) =>
          prev.map((n) =>
            n.id === nodeId ? { ...n, expiryReminderDismissed: 1 } : n,
          ),
        );
        // 关闭弹窗
        setInfoPopoverOpenId(null);
        toast.success("提醒已关闭");
      } else {
        toast.error(res.msg || "操作失败");
      }
    } catch (err) {
      toast.error("网络错误，请重试");
    }
  };

  // Node group and tag handlers
  const handleOpenGroupSelector = (nodeId: number) => {
    setGroupSelectorNode(nodeId);
  };

  const handleAssignNodeToGroup = async (nodeId: number, groupId: number | null) => {
    try {
      await assignNodeToGroup(nodeId, groupId);
      setNodeList((prev) =>
        prev.map((n) =>
          n.id === nodeId ? { ...n, groupId } : n,
        ),
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

  // 复制安装命令
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
        document.execCommand('copy');
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

  // 手动复制安装命令


  const loadReleasesByChannel = useCallback(async (channel: ReleaseChannel) => {
    setReleasesLoading(true);
    try {
      const res = await getNodeReleases(channel);

      if (res.code === 0 && Array.isArray(res.data)) {
        setReleases(res.data);
      } else {
        toast.error(res.msg || "获取版本列表失败");
      }
    } catch {
      toast.error("获取版本列表失败");
    } finally {
      setReleasesLoading(false);
    }
  }, []);

  // 打开版本选择弹窗
  const openUpgradeModal = async (
    target: "single" | "batch",
    nodeId?: number,
  ) => {
    const defaultChannel: ReleaseChannel = "dev";

    setUpgradeTarget(target);
    setUpgradeTargetNodeId(nodeId || null);
    setReleaseChannel(defaultChannel);
    setSelectedVersion("");
    setUpgradeModalOpen(true);
    await loadReleasesByChannel(defaultChannel);
  };

  // 确认升级（从版本弹窗）
  const handleConfirmUpgrade = async () => {
    const version = selectedVersion || undefined;

    if (upgradeTarget === "single" && upgradeTargetNodeId) {
      setUpgradeModalOpen(false);
      // Find the node
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

  // 回退节点
  const handleRollbackNode = (node: Node) => {
    setNodeToRollback(node);
    setRollbackModalOpen(true);
  };

  const confirmRollback = async () => {
    if (!nodeToRollback) return;
    const node = nodeToRollback;

    setRollbackModalOpen(false);

    // 初始化回退进度
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
        // 清除进度
        setUpgradeProgress((prev) => {
          const next = { ...prev };
          delete next[node.id];
          return next;
        });
      }
    } catch {
      toast.error("网络错误，请重试");
      // 清除进度
      setUpgradeProgress((prev) => {
        const next = { ...prev };
        delete next[node.id];
        return next;
      });
    } finally {
      if (window.__pendingNodeRefresh?.has(node.id)) {
        setTimeout(() => setNodeList((prev) => prev.map((n) => n.id === node.id ? { ...n, rollbackLoading: false } : n)), 15000);
      } else {
        setNodeList((prev) => prev.map((n) => n.id === node.id ? { ...n, rollbackLoading: false } : n));
      }
      setNodeToRollback(null);
    }
  };

  // 提交表单
  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitLoading(true);

    try {
      const apiCall = isEdit ? updateNode : createNode;
      const { serverHost, ...rest } = form;
      const data = {
        ...rest,
        remark: form.remark.trim(),
        expiryTime: form.expiryTime,
        renewalCycle: form.renewalCycle,
        groupId: form.groupId,
        extraIPs: form.extraIPs,
        serverIp:
          form.serverIpV4?.trim() ||
          form.serverIpV6?.trim() ||
          serverHost?.trim() ||
          "",
      };

      const res = await apiCall(data);

      if (res.code === 0) {
        toast.success(isEdit ? "更新成功" : "创建成功");
        setDialogVisible(false);

        if (isEdit) {
          setNodeList((prev) =>
            prev.map((n) =>
              n.id === form.id
                ? {
                  ...n,
                  name: form.name,
                  remark: form.remark.trim(),
                  expiryTime: form.expiryTime,
                  renewalCycle: form.renewalCycle,
                  groupId: form.groupId,
                  serverIp:
                    form.serverIpV4?.trim() ||
                    form.serverIpV6?.trim() ||
                    form.serverHost?.trim() ||
                    "",
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
                  expiryReminderDismissedUntil: n.expiryReminderDismissedUntil ?? null,
                } as Node
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

  // 重置表单
  const resetForm = () => {
    setForm({
      id: null,
      name: "",
      remark: "",
      expiryTime: 0,
      renewalCycle: "",
      groupId: null,
      serverHost: "",
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

  // 处理拖拽结束
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

    // 持久化到数据库
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

      // 当有选中项时，自动进入批量模式
      if (next.size > 0 && !selectMode) {
        setSelectMode(true);
      }

      // 当没有选中项时，自动退出批量模式
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

    // 开启批量 Loading
    setNodeList((prev) =>
      prev.map((n) => (selectedLocalIds.includes(n.id) ? { ...n, rollbackLoading: true } : n))
    );

    let successCount = 0;
    let failCount = 0;

    // 并发发送回退指令
    await Promise.all(
      selectedLocalIds.map(async (id) => {
        try {
          const res = await rollbackNode(id);
          if (res.code === 0) {
            successCount++;
            window.__pendingNodeRefresh = window.__pendingNodeRefresh || new Set();
            window.__pendingNodeRefresh.add(id);
          } else {
            failCount++;
            setNodeList((prev) => prev.map((n) => (n.id === id ? { ...n, rollbackLoading: false } : n)));
          }
        } catch {
          failCount++;
          setNodeList((prev) => prev.map((n) => (n.id === id ? { ...n, rollbackLoading: false } : n)));
        }
      })
    );

    if (successCount > 0) {
      toast.success(`成功发送 ${successCount} 个节点的回退指令，节点将自动重启`);
    }
    if (failCount > 0) {
      toast.error(`${failCount} 个节点回退指令发送失败`);
    }

    // 15秒兜底取消 Loading (成功发送的由 WS 拦截器负责精确清理，这里仅作硬兜底)
    setTimeout(() => {
      setNodeList((prev) =>
        prev.map((n) => {
          if (selectedLocalIds.includes(n.id) && window.__pendingNodeRefresh?.has(n.id)) {
            return { ...n, rollbackLoading: false };
          }
          return n;
        })
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

  // 传感器配置
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

  // 根据排序顺序获取节点列表
  const sortedNodes = useMemo((): Node[] => {
    if (!nodeList || nodeList.length === 0) return [];

    const sortedByDb = [...nodeList].sort((a, b) => {
      const aInx = a.inx ?? 0;
      const bInx = b.inx ?? 0;

      return aInx - bInx;
    });

    // 如果数据库中没有排序信息，则使用本地存储的顺序
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

    // 1. 先按分组过滤
    const groupFiltered = filterGroupId
      ? keywordFiltered.filter((node) => {
          if (filterGroupId === -1) {
            // -1 表示"未分组"
            return !node.groupId || node.groupId === 0;
          }
          return node.groupId === filterGroupId;
        })
      : keywordFiltered;

    // 2. 再按到期状态过滤
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
  }, [filterNodesByKeyword, localNodes, localSearchKeyword, nodeFilterMode, filterGroupId]);

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
            <Chip
              className="ml-1 shrink-0 whitespace-nowrap"
              size="sm"
              variant="flat"
            >
              {localNodes.length}
            </Chip>
          </Button>
          <Button
            className={`shrink-0 text-white font-medium ${activeTab === "remote" ? "" : "bg-default-400 hover:bg-default-500"}`}
            color={activeTab === "remote" ? "primary" : "default"}
            size="sm"
            variant={activeTab === "remote" ? "solid" : "flat"}
            onPress={() => setActiveTab("remote")}
          >
            远程节点
            <Chip
              className="ml-1 shrink-0 whitespace-nowrap"
              size="sm"
              variant="flat"
            >
              {remoteNodes.length}
            </Chip>
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
                  // 精准抓取带有“搜索”字样的输入框并强制聚焦
                  const searchInput = document.querySelector(
                    'input[placeholder*="搜索"]',
                  );

                  if (searchInput) (searchInput as HTMLElement).focus();
                }, 150); // 150ms 刚好是 CSS 展开动画的时间
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
                  升级
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
                <Button
                  color={viewMode === "grid" ? "primary" : "warning"}
                  size="sm"
                  variant="flat"
                  onPress={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
                >
                  {viewMode === "grid" ? "列表" : "卡片"}
                </Button>
                <Button
                  className="h-8 px-3 text-xs min-w-0 shrink-0"
                  color={
                    (canUseExpiryFilter && nodeFilterMode !== "all") || filterGroupId
                      ? "secondary"
                      : "danger"
                  }
                  isDisabled={!canUseExpiryFilter && !filterGroupId}
                  size="sm"
                  title={
                    canUseExpiryFilter || filterGroupId
                      ? "筛选条件"
                      : "远程节点不支持到期筛选"
                  }
                  variant="flat"
                  onPress={() => setIsFilterModalOpen(true)}
                >
                  筛选 {((canUseExpiryFilter && nodeFilterMode !== "all") || filterGroupId) && "(1)"}
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

      {/* Node Group Manager */}
      <NodeGroupManager
        isOpen={groupManagerOpen}
        onOpenChange={setGroupManagerOpen}
        onGroupChange={loadNodeGroups}
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

      {/* 节点列表 */}
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
                  {displayNodes.map((node) => {
                    const isRemoteNode = node.isRemote === 1;
                    const remoteUsage = isRemoteNode
                      ? remoteUsageMap[node.id]
                      : null;
                    const expiryMeta = getNodeExpiryMeta(
                      node.expiryTime,
                      node.renewalCycle,
                    );
                    const connectionStatusMeta = getConnectionStatusMeta(
                      node.connectionStatus,
                    );
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
                      <SortableItem key={node.id} id={node.id}>
                        {(listeners) => (
                          <Card
                            key={node.id}
                            className={`group relative overflow-hidden shadow-sm border border-divider hover:shadow-md transition-shadow duration-200 h-full flex flex-col ${node.expiryReminderDismissed ? '' : expiryMeta.accentClassName}`}
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
                                  {node.groupId && node.groupId > 0 && (() => {
                                    const group = nodeGroups.find(g => g.id === node.groupId);
                                    return group ? (
                                      <Chip
                                        size="sm"
                                        variant="flat"
                                        style={{
                                          backgroundColor: `${group.color}20`,
                                          color: group.color,
                                        }}
                                        className="cursor-pointer hover:opacity-80"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenGroupSelector(node.id);
                                        }}
                                        title={`分组：${group.name}（点击切换）`}
                                      >
                                        {group.name}
                                      </Chip>
                                    ) : null;
                                  })()}
                                  <div className="flex-shrink-0">
                                    {hasInfoTrigger && (
                                      <div className="relative">
                                        <button
                                          aria-label={`查看节点信息，共 ${infoCount} 项`}
                                          className={`relative flex h-7 w-7 items-center justify-center rounded-full border border-divider/80 bg-background/95 text-default-500 shadow-sm transition hover:border-default-300 hover:text-foreground focus-visible:border-default-300 focus-visible:text-foreground focus-visible:outline-none ${infoPopoverOpenId === node.id ? 'border-default-300 text-foreground' : ''}`}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            updateInfoPopoverPlacement(node.id, null);
                                            setInfoPopoverOpenId(infoPopoverOpenId === node.id ? null : node.id);
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
                                            ? 'visible opacity-100 pointer-events-auto'
                                            : 'invisible opacity-0 pointer-events-none'
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
                                                  )}
                                                  {' '}
                                                  <Chip
                                                    className="text-[10px] h-5 px-1 ml-1 inline-flex"
                                                    color={expiryMeta.tone}
                                                    size="sm"
                                                    variant="flat"
                                                  >
                                                    {expiryMeta.label}
                                                  </Chip>
                                                </div>
                                              </div>
                                            )}

                                            {hasRemark && (
                                              <div className="space-y-2">
                                                <div className="text-[11px] font-medium text-default-500">
                                                  备注
                                                </div>
                                                <div
                                                  className="max-h-32 overflow-y-auto rounded-lg border border-divider/80 bg-default-50/80 px-3 py-2 text-xs leading-5 text-default-700 break-all [scrollbar-width:thin]"
                                                  title={node.remark?.trim()}
                                                >
                                                  {node.remark?.trim()}
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
                                    className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${connectionStatusMeta.color === "success" ? "bg-emerald-500" : "bg-rose-500"}`}
                                    title={connectionStatusMeta.text}
                                  />
                                  <h3 className="font-semibold text-foreground truncate text-sm flex-1">
                                    {node.name}
                                  </h3>
                                </div>
                              </div>
                            </CardHeader>

                            <CardBody className="pt-0 pb-3 md:pt-0 md:pb-3 flex-1 flex flex-col">
                              {isRemoteNode && node.syncError && (
                                <div className="mb-3 px-2 py-1.5 rounded-md bg-warning-50 dark:bg-warning-100/10 text-warning-700 dark:text-warning-400 text-xs">
                                  {getRemoteSyncErrorMessage(node.syncError)}
                                </div>
                              )}
                              {/* 基础信息 */}
                              <div className="space-y-2 mb-4">
                                {node.expiryTime &&
                                  node.expiryTime > 0 &&
                                  node.renewalCycle && <div className="hidden" />}
                                <div className="flex justify-between items-center text-sm min-w-0">
                                  <span className="text-default-600 flex-shrink-0">
                                    地址
                                  </span>
                                  <div className="text-right text-xs min-w-0 flex-1 ml-2 min-h-[2.125rem] flex flex-col items-end gap-1 overflow-hidden">
                                    {node.serverIpV4?.trim() ||
                                      node.serverIpV6?.trim() ? (
                                      <>
                                        {node.serverIpV4?.trim() && (
                                          <span
                                            className="font-mono text-sm cursor-pointer hover:bg-default-200/50 rounded px-1 transition-colors truncate w-fit"
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
                                            className="font-mono text-sm cursor-pointer hover:bg-default-200/50 rounded px-1 transition-colors truncate block max-w-[150px] text-right"
                                            title={node.serverIpV6.trim()}
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              copyToClipboard(node.serverIpV6!.trim(), "IPv6 地址");
                                            }}
                                          >
                                            {node.serverIpV6.trim()}
                                          </span>
                                        )}
                                      </>
                                    ) : (
                                      <span
                                        className="font-mono text-sm cursor-pointer hover:bg-default-200/50 rounded px-1 transition-colors truncate w-fit"
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

                                      {/* 👇 右侧改为带图标的 Flex 容器 👇 */}
                                      <div className="flex items-center gap-1.5">
                                        {node.version && (
                                          <DistroIcon
                                            distro={parseDistroFromVersion(node.version)}
                                            className="w-4 h-4 shrink-0"
                                            style={{ color: getDistroColor(parseDistroFromVersion(node.version)) }}
                                          />
                                        )}
                                        <span className="font-mono text-sm text-default-600">
                                          {node.version ? node.version.split(' ')[0] : "未知"}
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                      <span className="text-default-600">总流量</span>
                                      <span className="font-mono text-sm text-danger-600 dark:text-danger-400">
                                        {node.connectionStatus === "online" &&
                                          realtimeNodeMetrics[node.id]
                                          ? formatTraffic(
                                            (realtimeNodeMetrics[node.id]?.uploadTraffic ?? 0) +
                                            (realtimeNodeMetrics[node.id]?.downloadTraffic ?? 0),
                                          )
                                          : "-"}
                                      </span>
                                    </div>
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
                                          <span className="text-default-500">
                                            远程地址
                                          </span>
                                          <span
                                            className="font-mono text-right truncate"
                                            title={
                                              remoteUsage.remoteUrl ||
                                              node.remoteUrl ||
                                              "-"
                                            }
                                          >
                                            {remoteUsage.remoteUrl ||
                                              node.remoteUrl ||
                                              "-"}
                                          </span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                          <span className="text-default-500">
                                            共享ID
                                          </span>
                                          <span className="font-mono">
                                            #{remoteUsage.shareId}
                                          </span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                          <span className="text-default-500">
                                            流量
                                          </span>
                                          <span className="font-mono">
                                            {formatFlow(remoteUsage.currentFlow)}
                                          </span>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                          <span className="text-default-500">
                                            带宽上限
                                          </span>
                                          <span className="font-mono">
                                            {remoteUsage.maxBandwidth > 0
                                              ? formatSpeed(
                                                remoteUsage.maxBandwidth,
                                              )
                                              : "不限"}
                                          </span>
                                        </div>
                                      </div>

                                      <div className="text-xs rounded-md border border-default-200 dark:border-default-100/30 bg-default-50 dark:bg-default-100/20 p-2.5">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-default-500">
                                            占用端口
                                          </span>
                                          <span className="font-mono text-default-700 dark:text-default-300">
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
                                                <Chip
                                                  key={`${node.id}-port-${port}`}
                                                  className="font-mono shrink-0 whitespace-nowrap"
                                                  size="sm"
                                                  variant="flat"
                                                >
                                                  {port}
                                                </Chip>
                                              ))}
                                            </div>
                                          ) : (
                                            <div className="text-default-400">
                                              暂无占用端口
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      <div className="text-xs rounded-md border border-default-200 dark:border-default-100/30 bg-default-50 dark:bg-default-100/20 p-2.5">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-default-500">
                                            绑定明细
                                          </span>
                                          <span className="font-mono text-default-700 dark:text-default-300">
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
                                                  <span className="font-mono text-[11px]">
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
                                                  <span className="font-mono">
                                                    端口 {binding.allocatedPort}
                                                  </span>
                                                </div>
                                              </div>
                                            ))
                                          ) : (
                                            <div className="text-default-400">
                                              暂无绑定明细
                                            </div>
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
                                  {/* 流量统计 */}
                                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                                    <div className="text-center p-2 bg-primary-50 dark:bg-primary-100/20 rounded border border-primary-200 dark:border-primary-300/20">
                                      <div className="text-primary-600 dark:text-primary-400 mb-0.5">
                                        ↑ 上行流量
                                      </div>
                                      <div className="font-mono text-sm text-primary-700 dark:text-primary-300">
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
                                      <div className="font-mono text-sm text-success-700 dark:text-success-300">
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

                              <div className="mt-auto space-y-3">
                                {/* 操作按钮 */}
                                <div className="space-y-1.5">
                                  {!isRemoteNode && (
                                    <div className="grid grid-cols-3 gap-1.5">
                                      <Button
                                        className="min-h-8"
                                        color="success"
                                        isLoading={node.copyLoading}
                                        size="sm"
                                        variant="flat"
                                        onPress={() => openInstallSelector(node)}
                                      >
                                        安装
                                      </Button>
                                      <Button
                                        className="min-h-8"
                                        color="warning"
                                        isDisabled={
                                          node.connectionStatus !== "online"
                                        }
                                        isLoading={node.upgradeLoading}
                                        size="sm"
                                        variant="flat"
                                        onPress={() =>
                                          openUpgradeModal("single", node.id)
                                        }
                                      >
                                        升级
                                      </Button>
                                      <Button
                                        className="min-h-8"
                                        color="secondary"
                                        isDisabled={
                                          node.connectionStatus !== "online"
                                        }
                                        isLoading={node.rollbackLoading}
                                        size="sm"
                                        variant="flat"
                                        onPress={() => handleRollbackNode(node)}
                                      >
                                        回退
                                      </Button>
                                    </div>
                                  )}
                                  <div
                                    className={`grid gap-1.5 ${isRemoteNode ? "grid-cols-1" : "grid-cols-2"}`}
                                  >
                                    {!isRemoteNode && (
                                      <Button
                                        className="min-h-8"
                                        color="primary"
                                        size="sm"
                                        variant="flat"
                                        onPress={() => handleEdit(node)}
                                      >
                                        编辑
                                      </Button>
                                    )}
                                    <Button
                                      className="min-h-8"
                                      color="danger"
                                      size="sm"
                                      variant="flat"
                                      onPress={() => handleDelete(node)}
                                    >
                                      删除
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </CardBody>
                          </Card>
                        )}
                      </SortableItem>
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}

          {viewMode === "list" && (
            <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
              <SortableContext
                items={sortableNodeIds}
                strategy={rectSortingStrategy}
              >
                <NodeListView
                  nodeGroups={nodeGroups}
                  displayNodes={displayNodes}
                  realtimeNodeMetrics={realtimeNodeMetrics}
                  upgradeProgress={upgradeProgress}
                  selectedIds={selectedIds}
                  toggleSelect={toggleSelect}
                  toggleSelectAll={handleSelectAllToggle}
                  copyToClipboard={copyToClipboard}
                  openInstallSelector={openInstallSelector}
                  openUpgradeModal={openUpgradeModal}
                  handleRollbackNode={handleRollbackNode}
                  handleEdit={handleEdit}
                  handleDelete={handleDelete}
                  formatTraffic={formatTraffic}
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
                  errorMessage={errors.name}
                  isInvalid={!!errors.name}
                  description=""
                  label="节点名称"
                  placeholder="请输入节点名称"
                  value={form.name}
                  variant="bordered"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                />

                <Textarea
                  classNames={{ inputWrapper: "!min-h-[20px] py-1.5", input: "!min-h-[20px]" }}
                  description=""
                  label="备注"
                  rows={1}
                  placeholder="例如: 搬瓦工年付，2026-12 续费，日本中转"
                  value={form.remark}
                  variant="bordered"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, remark: e.target.value }))
                  }
                />
              </div>
              {/* Node Group Selector */}
              <Select
                description="将节点分配到指定分组（可选）"
                label="分组"
                placeholder="选择分组"
                selectedKeys={form.groupId && form.groupId > 0 ? [String(form.groupId)] : []}
                variant="bordered"
                onSelectionChange={(keys) => {
                  const selected = Array.from(keys)[0] as string | undefined;
                  setForm((prev) => ({
                    ...prev,
                    groupId: selected ? parseInt(selected) : null,
                  }));
                }}
              >
                <SelectItem key="none" textValue="未分组">
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

                {/* <Alert
                color="primary"
                description="例如选择月并填写 2026-03-22 系统会自动按每月同日推算下次续费时间"
                variant="flat"
              /> */}

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  description="可选：不带协议、不带端口。建议在 IPv4 和 IPv6 都未填写时使用。至少填写一个 IPv4/IPv6 域名"
                  errorMessage={errors.serverHost}
                  isInvalid={!!errors.serverHost}
                  label="域名/地址"
                  placeholder="例如：test.example.com"
                  value={form.serverHost}
                  variant="bordered"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, serverHost: e.target.value }))
                  }
                />

                <Input
                  classNames={{
                    input: "font-mono",
                  }}
                  description="支持单个端口(80)、多个端口(80,443)或端口范围(10000-65535)，多个可用逗号分隔"
                  errorMessage={errors.port}
                  isInvalid={!!errors.port}
                  label="可用端口"
                  placeholder="例如: 80,443,10000-65535"
                  value={form.port}
                  variant="bordered"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, port: e.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  description="填写一个 IPv4 地址"
                  errorMessage={errors.serverIpV4}
                  isInvalid={!!errors.serverIpV4}
                  label="IPv4 地址"
                  placeholder="例如: 192.168.1.100"
                  value={form.serverIpV4}
                  variant="bordered"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, serverIpV4: e.target.value }))
                  }
                />

                <Input
                  description="填写一个 IPv6 地址"
                  errorMessage={errors.serverIpV6}
                  isInvalid={!!errors.serverIpV6}
                  label="IPv6 地址"
                  placeholder="例如: 2001:db8::10"
                  value={form.serverIpV6}
                  variant="bordered"
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, serverIpV6: e.target.value }))
                  }
                />
              </div>

              {/* 高级配置 */}
              <Accordion variant="bordered">
                <AccordionItem
                  key="advanced"
                  aria-label="高级配置"
                  title="高级配置"
                >
                  <div className="space-y-4 pb-2">
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
                    {/* 屏蔽协议 */}
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
                        className={`grid grid-cols-1 sm:grid-cols-3 gap-3 bg-default-50 dark:bg-default-100 p-3 rounded-md border border-default-200 dark:border-default-100/30 ${protocolDisabled ? "opacity-70" : ""}`}
                      >
                        {/* HTTP tile */}
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

                        {/* TLS tile */}
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

                        {/* SOCKS tile */}
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
                    <SelectItem key="dev" textValue="测试版">测试版</SelectItem>
                    <SelectItem key="stable" textValue="稳定版">稳定版</SelectItem>
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
                  className="font-mono text-sm"
                  classNames={{
                    input: "font-mono text-sm",
                  }}
                  maxRows={10}
                  minRows={6}
                  value={installCommand}
                  variant="bordered"
                />

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
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">
                  {upgradeTarget === "batch"
                    ? `批量升级 (${selectedIds.size} 个节点)`
                    : "升级节点"}
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
                      <SelectItem key="dev" textValue="测试版">测试版</SelectItem>
                      <SelectItem key="stable" textValue="稳定版">稳定版</SelectItem>
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
                                <Chip
                                  className="ml-1 shrink-0 whitespace-nowrap"
                                  color="warning"
                                  size="sm"
                                  variant="flat"
                                >
                                  测试
                                </Chip>
                              )}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </Select>
                    <p className="text-sm text-default-500">
                      {selectedVersion
                        ? `将升级到版本 ${selectedVersion}`
                        : `未选择版本，将自动使用最新${releaseChannel === "stable" ? "正式" : "测试"}版`}
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
                  确认升级
                </Button>
              </ModalFooter>
            </>
          )}
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
                  确定要将选中的 <strong>{Array.from(selectedIds).filter((id) => nodeList.find((n) => n.id === id)?.isRemote !== 1).length}</strong> 个本地节点回退到上一个版本吗？
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
                  {/* 按分组筛选 */}
                  <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium">按分组筛选</p>
                    <Select
                      aria-label="按分组筛选"
                      className="w-full"
                      selectedKeys={filterGroupId ? [String(filterGroupId)] : ["all"]}
                      variant="bordered"
                      onSelectionChange={(keys) => {
                        const selected = Array.from(keys)[0] as string;
                        setFilterGroupId(selected === "all" ? null : parseInt(selected));
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
                        <SelectItem key={group.id} textValue={group.name}>
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

                  {/* 按到期状态筛选 */}
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

      {/* Group Selector Modal */}
      <Modal
        isOpen={groupSelectorNode !== null}
        onOpenChange={() => setGroupSelectorNode(null)}
        size="sm"
      >
        <ModalContent>
          <ModalHeader>选择分组</ModalHeader>
          <ModalBody>
            <div className="flex flex-wrap gap-2">
              <Chip
                key="none"
                size="sm"
                variant="flat"
                className="cursor-pointer hover:opacity-80"
                onClick={() => handleAssignNodeToGroup(groupSelectorNode!, null)}
              >
                未分组
              </Chip>
              {nodeGroups.map((group) => (
                <Chip
                  key={group.id}
                  size="sm"
                  variant="flat"
                  style={{
                    backgroundColor: `${group.color}20`,
                    color: group.color,
                  }}
                  className="cursor-pointer hover:opacity-80"
                  onClick={() => handleAssignNodeToGroup(groupSelectorNode!, group.id)}
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
