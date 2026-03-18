import type {
  MonitorTunnelApiItem,
  NodeMetricApiItem,
  TunnelMetricApiItem,
  ServiceMonitorApiItem,
  ServiceMonitorResultApiItem,
  ServiceMonitorMutationPayload,
  ServiceMonitorLimitsApiData,
} from "@/api/types";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  MoreVertical,
  Plus,
  RefreshCw,
  Trash2,
  Edit,
  Activity,
  Play,
  Server,
  Zap,
  HardDrive,
  Cpu,
  Clock,
  Globe,
} from "lucide-react";
import toast from "react-hot-toast";

import {
  getMonitorTunnels,
  getNodeMetrics,
  getTunnelMetrics,
  getServiceMonitorList,
  getServiceMonitorLimits,
  getServiceMonitorResults,
  getServiceMonitorLatestResults,
  createServiceMonitor,
  updateServiceMonitor,
  deleteServiceMonitor,
  runServiceMonitor,
} from "@/api";
import { Button } from "@/shadcn-bridge/heroui/button";
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/shadcn-bridge/heroui/modal";
import { Input } from "@/shadcn-bridge/heroui/input";
import { Switch } from "@/shadcn-bridge/heroui/switch";
import { Select, SelectItem } from "@/shadcn-bridge/heroui/select";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
} from "@/shadcn-bridge/heroui/table";
import { Chip } from "@/shadcn-bridge/heroui/chip";
import {
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@/shadcn-bridge/heroui/dropdown";
import { Card, CardBody, CardHeader } from "@/shadcn-bridge/heroui/card";
import { Progress } from "@/shadcn-bridge/heroui/progress";
import { useNodeRealtime } from "@/pages/node/use-node-realtime";

interface MonitorViewProps {
  nodeMap: Map<number, { id: number; name: string; connectionStatus: string }>;
}

type RealtimeNodeMetric = {
  receivedAt: number;
  cpuUsage: number;
  memoryUsage: number;
  diskUsage: number;
  netInBytes: number;
  netOutBytes: number;
  netInSpeed: number;
  netOutSpeed: number;
  load1: number;
  load5: number;
  load15: number;
  tcpConns: number;
  udpConns: number;
  uptime: number;
};

const isSupportedMonitorType = (t: string): t is "tcp" | "icmp" =>
  t === "tcp" || t === "icmp";

const formatTimestamp = (ts: number, rangeMs?: number): string => {
  const date = new Date(ts);
  const includeDate = (rangeMs ?? 0) >= 24 * 60 * 60 * 1000;

  if (includeDate) {
    return date.toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDateTime = (ts: number): string => {
  return new Date(ts).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const formatBytesPerSecond = (bytesPerSecond: number): string => {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 B/s";

  const k = 1024;
  const sizes = ["B/s", "KB/s", "MB/s", "GB/s", "TB/s"];
  const i = Math.floor(Math.log(bytesPerSecond) / Math.log(k));

  return `${parseFloat((bytesPerSecond / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const formatUptime = (seconds: number) => {
  if (!seconds) return "-";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  if (days > 0) return `${days} 天 ${hours} 小时`;
  return `${hours} 小时`;
};

const getColorByUsage = (usage?: number) => {
  if (usage === undefined || usage === null) return "default";
  if (usage >= 90) return "danger";
  if (usage >= 75) return "warning";
  if (usage >= 50) return "primary";
  return "success";
};

function ServerCard({ node, metric }: { node: any; metric: RealtimeNodeMetric | null }) {
  const isOnline = node.connectionStatus === "online";
  
  return (
    <Card className={`border-t-4 ${isOnline ? "border-t-success" : "border-t-danger"}`}>
      <CardHeader className="pb-2 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Server className={`w-5 h-5 ${isOnline ? "text-success" : "text-default-400"}`} />
          <div className="font-semibold text-base truncate max-w-[150px]" title={node.name}>{node.name}</div>
        </div>
        <Chip size="sm" color={isOnline ? "success" : "danger"} variant="flat">
          {isOnline ? "在线" : "离线"}
        </Chip>
      </CardHeader>
      
      <CardBody className="pt-0 space-y-4">
        <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-xs mt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-default-500">
              <Clock className="w-3 h-3" /> 运行
            </div>
            <span className="font-mono text-[11px]">{metric ? formatUptime(metric.uptime) : "-"}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-default-500">
              <Activity className="w-3 h-3" /> 负载
            </div>
            <span className="font-mono text-[11px]">{metric ? metric.load1.toFixed(2) : "-"}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-default-500">
              <Globe className="w-3 h-3" /> 连接
            </div>
            <span className="font-mono text-[11px]">{metric ? metric.tcpConns : "-"}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-default-500">
              <Zap className="w-3 h-3" /> UDP
            </div>
            <span className="font-mono text-[11px]">{metric ? metric.udpConns : "-"}</span>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <div className="flex items-center gap-1 text-default-600"><Cpu className="w-3.5 h-3.5" /> CPU</div>
              <span className="font-mono text-[11px]">{metric ? metric.cpuUsage.toFixed(1) : "0.0"}%</span>
            </div>
            <Progress value={metric ? metric.cpuUsage : 0} color={getColorByUsage(metric?.cpuUsage)} className="h-1.5" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <div className="flex items-center gap-1 text-default-600"><HardDrive className="w-3.5 h-3.5" /> RAM</div>
              <span className="font-mono text-[11px]">{metric ? metric.memoryUsage.toFixed(1) : "0.0"}%</span>
            </div>
            <Progress value={metric ? metric.memoryUsage : 0} color={getColorByUsage(metric?.memoryUsage)} className="h-1.5" />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <div className="flex items-center gap-1 text-default-600"><HardDrive className="w-3.5 h-3.5" /> Disk</div>
              <span className="font-mono text-[11px]">{metric ? metric.diskUsage.toFixed(1) : "0.0"}%</span>
            </div>
            <Progress value={metric ? metric.diskUsage : 0} color={getColorByUsage(metric?.diskUsage)} className="h-1.5" />
          </div>
        </div>

        <div className="flex justify-between items-center pt-3 border-t border-default-200/50 text-xs">
           <div className="flex flex-col gap-0.5 w-[50%] border-r border-default-200/50 pr-2">
             <div className="text-default-500 flex justify-between">
               <span>网络 ↓</span>
               <span className="font-mono text-success">{metric ? formatBytesPerSecond(metric.netInSpeed) : "0 B/s"}</span>
             </div>
             <div className="text-default-400 font-mono flex justify-between">
               <span>总计</span>
               <span className="text-[11px]">{metric ? formatBytes(metric.netInBytes) : "0 B"}</span>
             </div>
           </div>
           
           <div className="flex flex-col gap-0.5 w-[50%] pl-2">
             <div className="text-default-500 flex justify-between">
               <span>网络 ↑</span>
               <span className="font-mono text-primary">{metric ? formatBytesPerSecond(metric.netOutSpeed) : "0 B/s"}</span>
             </div>
             <div className="text-default-400 font-mono flex justify-between">
               <span>总计</span>
               <span className="text-[11px]">{metric ? formatBytes(metric.netOutBytes) : "0 B"}</span>
             </div>
           </div>
        </div>
      </CardBody>
    </Card>
  );
}

type MetricType =
  | "cpu"
  | "memory"
  | "disk"
  | "network"
  | "load"
  | "connections";
type TunnelMetricType = "traffic";

const METRICS_MAX_ROWS = 5000;

const DEFAULT_SERVICE_MONITOR_LIMITS: ServiceMonitorLimitsApiData = {
  checkerScanIntervalSec: 30,
  minIntervalSec: 30,
  defaultIntervalSec: 60,
  minTimeoutSec: 1,
  defaultTimeoutSec: 5,
  maxTimeoutSec: 60,
};

export function MonitorView({ nodeMap }: MonitorViewProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<NodeMetricApiItem[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [metricsTruncated, setMetricsTruncated] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [activeMetricType, setActiveMetricType] = useState<MetricType>("cpu");

  const [metricsRangeMs, setMetricsRangeMs] = useState(60 * 60 * 1000);

  const [tunnels, setTunnels] = useState<MonitorTunnelApiItem[]>([]);
  const [tunnelsLoading, setTunnelsLoading] = useState(false);
  const [tunnelsError, setTunnelsError] = useState<string | null>(null);
  const [selectedTunnelId, setSelectedTunnelId] = useState<number | null>(null);
  const [tunnelMetrics, setTunnelMetrics] = useState<TunnelMetricApiItem[]>([]);
  const [tunnelMetricsLoading, setTunnelMetricsLoading] = useState(false);
  const [tunnelMetricsTruncated, setTunnelMetricsTruncated] = useState(false);
  const [tunnelMetricsError, setTunnelMetricsError] = useState<string | null>(
    null,
  );
  const [tunnelRangeMs, setTunnelRangeMs] = useState(60 * 60 * 1000);
  const [activeTunnelMetricType, setActiveTunnelMetricType] =
    useState<TunnelMetricType>("traffic");

  const [serviceMonitors, setServiceMonitors] = useState<
    ServiceMonitorApiItem[]
  >([]);
  const [monitorsLoading, setMonitorsLoading] = useState(false);
  const [monitorsError, setMonitorsError] = useState<string | null>(null);
  const [latestResultsError, setLatestResultsError] = useState<string | null>(
    null,
  );
  const [monitorResults, setMonitorResults] = useState<
    Record<number, ServiceMonitorResultApiItem[]>
  >({});

  const [serviceMonitorLimits, setServiceMonitorLimits] =
    useState<ServiceMonitorLimitsApiData | null>(null);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingMonitor, setEditingMonitor] =
    useState<ServiceMonitorApiItem | null>(null);
  const [monitorForm, setMonitorForm] = useState({
    name: "",
    type: "tcp" as "tcp" | "icmp",
    target: "",
    intervalSec: DEFAULT_SERVICE_MONITOR_LIMITS.defaultIntervalSec,
    timeoutSec: DEFAULT_SERVICE_MONITOR_LIMITS.defaultTimeoutSec,
    nodeId: 0,
    enabled: true,
  });
  const [submitLoading, setSubmitLoading] = useState(false);

  const [accessDenied, setAccessDenied] = useState<string | null>(null);
  const [resultsModalOpen, setResultsModalOpen] = useState(false);
  const [resultsMonitorId, setResultsMonitorId] = useState<number | null>(null);
  const [resultsLimit, setResultsLimit] = useState(50);
  const [resultsLoading, setResultsLoading] = useState(false);

  const [realtimeNodeStatus, setRealtimeNodeStatus] = useState<
    Record<number, "online" | "offline">
  >({});
  const [realtimeNodeMetrics, setRealtimeNodeMetrics] = useState<
    Record<number, RealtimeNodeMetric>
  >({});

  const nodes = useMemo(() => {
    return Array.from(nodeMap.values()).map((n) => {
      const status = realtimeNodeStatus[n.id];

      if (!status) {
        return n;
      }

      return {
        ...n,
        connectionStatus: status,
      };
    });
  }, [nodeMap, realtimeNodeStatus]);

  const onlineNodes = nodes.filter((n) => n.connectionStatus === "online");
  const preferredNodeId = onlineNodes[0]?.id ?? nodes[0]?.id ?? 0;

  const resolvedServiceMonitorLimits =
    serviceMonitorLimits ?? DEFAULT_SERVICE_MONITOR_LIMITS;

  const handleRealtimeMessage = useCallback((message: any) => {
    const nodeId = Number(message?.id ?? 0);

    if (!nodeId || Number.isNaN(nodeId)) {
      return;
    }

    const type = String(message?.type ?? "");
    const payload = message?.data;

    if (type === "status") {
      const status = Number(payload);

      setRealtimeNodeStatus((prev) => ({
        ...prev,
        [nodeId]: status === 1 ? "online" : "offline",
      }));

      return;
    }

    if (type === "metric") {
      let raw = payload;
      if (typeof raw === "string") {
        try {
          raw = JSON.parse(raw);
        } catch {
          return;
        }
      }
      if (!raw || typeof raw !== "object") {
        return;
      }

      const metric = raw as Record<string, unknown>;
      const receivedAt = Date.now();
      const normalized: RealtimeNodeMetric = {
        receivedAt,
        cpuUsage: Number(metric.cpuUsage ?? metric.cpu_usage ?? 0),
        memoryUsage: Number(metric.memoryUsage ?? metric.memory_usage ?? 0),
        diskUsage: Number(metric.diskUsage ?? metric.disk_usage ?? 0),
        netInBytes: Number(metric.netInBytes ?? metric.bytes_received ?? 0),
        netOutBytes: Number(metric.netOutBytes ?? metric.bytes_transmitted ?? 0),
        netInSpeed: Number(metric.netInSpeed ?? metric.net_in_speed ?? 0),
        netOutSpeed: Number(metric.netOutSpeed ?? metric.net_out_speed ?? 0),
        load1: Number(metric.load1 ?? 0),
        load5: Number(metric.load5 ?? 0),
        load15: Number(metric.load15 ?? 0),
        tcpConns: Number(metric.tcpConns ?? metric.tcp_conns ?? 0),
        udpConns: Number(metric.udpConns ?? metric.udp_conns ?? 0),
        uptime: Number(metric.uptime ?? 0),
      };

      setRealtimeNodeMetrics((prev) => ({
        ...prev,
        [nodeId]: normalized,
      }));
      setRealtimeNodeStatus((prev) => ({
        ...prev,
        [nodeId]: "online",
      }));

      return;
    }

    if (type === "info") {
      setRealtimeNodeStatus((prev) => ({
        ...prev,
        [nodeId]: "online",
      }));
    }
  }, []);

  const { wsConnected, wsConnecting } = useNodeRealtime({
    onMessage: handleRealtimeMessage,
    enabled: !accessDenied,
  });

  useEffect(() => {
    if (!selectedNodeId && preferredNodeId > 0) {
      setSelectedNodeId(preferredNodeId);
    }
  }, [preferredNodeId, selectedNodeId]);

  const loadTunnels = useCallback(async () => {
    setTunnelsLoading(true);
    try {
      const response = await getMonitorTunnels();

      if (response.code === 0 && response.data) {
        setAccessDenied(null);
        setTunnelsError(null);
        setTunnels(response.data);

        return;
      }
      if (response.code === 403) {
        setAccessDenied(response.msg || "暂无监控权限，请联系管理员授权");
        setTunnelsError(null);
        setTunnels([]);

        return;
      }
      setTunnelsError(response.msg || "加载隧道列表失败");
      toast.error(response.msg || "加载隧道列表失败");
    } catch {
      setTunnelsError("加载隧道列表失败");
      toast.error("加载隧道列表失败");
    } finally {
      setTunnelsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTunnels();
  }, [loadTunnels]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadTunnels();
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [loadTunnels]);

  useEffect(() => {
    if (!selectedTunnelId && tunnels.length > 0) {
      setSelectedTunnelId(tunnels[0].id);
    }
  }, [selectedTunnelId, tunnels]);

  const loadTunnelMetrics = useCallback(
    async (tunnelId: number) => {
      setTunnelMetricsLoading(true);
      try {
        const end = Date.now();
        const start = end - tunnelRangeMs;
        const response = await getTunnelMetrics(tunnelId, start, end);

        if (response.code === 0 && Array.isArray(response.data)) {
          setAccessDenied(null);
          setTunnelMetricsError(null);
          setTunnelMetricsTruncated(response.data.length >= METRICS_MAX_ROWS);
          const ordered = [...response.data].sort(
            (a, b) => a.timestamp - b.timestamp,
          );

          setTunnelMetrics(ordered);

          return;
        }
        if (response.code === 403) {
          setAccessDenied(response.msg || "暂无监控权限，请联系管理员授权");
          setTunnelMetricsTruncated(false);
          setTunnelMetricsError(null);

          return;
        }
        setTunnelMetricsTruncated(false);
        setTunnelMetricsError(response.msg || "加载隧道指标失败");
        toast.error(response.msg || "加载隧道指标失败");
      } catch {
        setTunnelMetricsTruncated(false);
        setTunnelMetricsError("加载隧道指标失败");
      } finally {
        setTunnelMetricsLoading(false);
      }
    },
    [tunnelRangeMs],
  );

  useEffect(() => {
    if (selectedTunnelId) {
      void loadTunnelMetrics(selectedTunnelId);
    }
  }, [selectedTunnelId, loadTunnelMetrics]);

  useEffect(() => {
    if (!selectedTunnelId) return;
    const timer = window.setInterval(() => {
      void loadTunnelMetrics(selectedTunnelId);
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [selectedTunnelId, loadTunnelMetrics]);

  const loadMetrics = useCallback(
    async (nodeId: number) => {
      setMetricsLoading(true);
      try {
        const end = Date.now();
        const start = end - metricsRangeMs;
        const response = await getNodeMetrics(nodeId, start, end);

        if (response.code === 0 && Array.isArray(response.data)) {
          setAccessDenied(null);
          setMetricsError(null);
          setMetricsTruncated(response.data.length >= METRICS_MAX_ROWS);
          const ordered = [...response.data].sort(
            (a, b) => a.timestamp - b.timestamp,
          );

          setMetrics(ordered);

          return;
        }
        if (response.code === 403) {
          setAccessDenied(response.msg || "暂无监控权限，请联系管理员授权");
          setMetricsTruncated(false);
          setMetricsError(null);

          return;
        }
        setMetricsTruncated(false);
        setMetricsError(response.msg || "加载指标失败");
        toast.error(response.msg || "加载指标失败");
      } catch {
        setMetricsTruncated(false);
        setMetricsError("加载指标失败");
      } finally {
        setMetricsLoading(false);
      }
    },
    [metricsRangeMs],
  );

  const loadServiceMonitors = useCallback(async () => {
    setMonitorsLoading(true);
    try {
      const response = await getServiceMonitorList();

      if (response.code === 0 && response.data) {
        setAccessDenied(null);
        setMonitorsError(null);
        setServiceMonitors(response.data);

        return;
      }
      if (response.code === 403) {
        setAccessDenied(response.msg || "暂无监控权限，请联系管理员授权");
        setMonitorsError(null);

        return;
      }
      setMonitorsError(response.msg || "加载服务监控失败");
      toast.error(response.msg || "加载服务监控失败");
    } catch {
      setMonitorsError("加载服务监控失败");
    } finally {
      setMonitorsLoading(false);
    }
  }, []);

  const loadServiceMonitorLimits = useCallback(async () => {
    try {
      const response = await getServiceMonitorLimits();

      if (response.code === 0 && response.data) {
        setAccessDenied(null);
        setServiceMonitorLimits(response.data);

        return;
      }
      if (response.code === 403) {
        setAccessDenied(response.msg || "暂无监控权限，请联系管理员授权");

        return;
      }
    } catch {
      toast.error("加载服务监控限制失败，已使用默认值");
    }
  }, []);

  const loadMonitorResults = useCallback(
    async (monitorId: number, limit = 20) => {
      try {
        const response = await getServiceMonitorResults(monitorId, limit);

        if (response.code === 0 && response.data) {
          setMonitorResults((prev) => ({
            ...prev,
            [monitorId]: response.data,
          }));

          return;
        }
        if (response.code === 403) {
          setAccessDenied(response.msg || "暂无监控权限，请联系管理员授权");
        }
      } catch {
        toast.error("加载监控记录失败");
      }
    },
    [],
  );

  const loadLatestMonitorResults = useCallback(async () => {
    try {
      const response = await getServiceMonitorLatestResults();

      if (response.code === 0 && Array.isArray(response.data)) {
        setAccessDenied(null);
        setLatestResultsError(null);
        setMonitorResults((prev) => {
          const next: Record<number, ServiceMonitorResultApiItem[]> = {
            ...prev,
          };

          response.data.forEach((r) => {
            const monitorId = Number(r?.monitorId ?? 0);

            if (monitorId <= 0) return;

            const existing = next[monitorId];

            if (existing && existing.length > 1) {
              const rest = existing.filter((x) => x.id !== r.id);

              next[monitorId] = [r, ...rest];

              return;
            }

            next[monitorId] = [r];
          });

          return next;
        });

        return;
      }
      if (response.code === 403) {
        setAccessDenied(response.msg || "暂无监控权限，请联系管理员授权");
        setLatestResultsError(null);

        return;
      }

      setLatestResultsError(response.msg || "加载最新监控结果失败");
    } catch {
      setLatestResultsError("加载最新监控结果失败");
    }
  }, []);

  const loadResultsForModal = useCallback(async () => {
    if (!resultsMonitorId) return;
    setResultsLoading(true);
    try {
      await loadMonitorResults(resultsMonitorId, resultsLimit);
    } finally {
      setResultsLoading(false);
    }
  }, [loadMonitorResults, resultsLimit, resultsMonitorId]);

  useEffect(() => {
    void loadServiceMonitors();
    void loadServiceMonitorLimits();
    void loadLatestMonitorResults();
  }, [loadLatestMonitorResults, loadServiceMonitorLimits, loadServiceMonitors]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadServiceMonitors();
      void loadLatestMonitorResults();
    }, 30_000);

    return () => window.clearInterval(timer);
  }, [loadLatestMonitorResults, loadServiceMonitors]);

  useEffect(() => {
    if (selectedNodeId) {
      loadMetrics(selectedNodeId);
    }
  }, [selectedNodeId, loadMetrics]);

  useEffect(() => {
    if (!selectedNodeId) return;
    const timer = window.setInterval(() => {
      void loadMetrics(selectedNodeId);
    }, 15_000);

    return () => window.clearInterval(timer);
  }, [selectedNodeId, loadMetrics]);

  useEffect(() => {
    if (!resultsModalOpen || !resultsMonitorId) return;
    void loadResultsForModal();
  }, [resultsModalOpen, resultsMonitorId, resultsLimit, loadResultsForModal]);

  const chartData = metrics.map((m) => ({
    time: formatTimestamp(m.timestamp, metricsRangeMs),
    cpu: m.cpuUsage,
    memory: m.memoryUsage,
    disk: m.diskUsage,
    netIn: m.netInSpeed,
    netOut: m.netOutSpeed,
    load1: m.load1,
    load5: m.load5,
    load15: m.load15,
    tcp: m.tcpConns,
    udp: m.udpConns,
  }));

  const getChartConfig = () => {
    switch (activeMetricType) {
      case "cpu":
        return {
          lines: [{ dataKey: "cpu", color: "#3b82f6", name: "CPU %" }],
          yAxisLabel: "使用率 (%)",
        };
      case "memory":
        return {
          lines: [{ dataKey: "memory", color: "#8b5cf6", name: "内存 %" }],
          yAxisLabel: "使用率 (%)",
        };
      case "disk":
        return {
          lines: [{ dataKey: "disk", color: "#f59e0b", name: "磁盘 %" }],
          yAxisLabel: "使用率 (%)",
        };
      case "network":
        return {
          lines: [
            { dataKey: "netIn", color: "#10b981", name: "入站速度" },
            { dataKey: "netOut", color: "#ef4444", name: "出站速度" },
          ],
          yAxisLabel: "速度 (bytes/s)",
        };
      case "load":
        return {
          lines: [
            { dataKey: "load1", color: "#3b82f6", name: "负载 1m" },
            { dataKey: "load5", color: "#8b5cf6", name: "负载 5m" },
            { dataKey: "load15", color: "#f59e0b", name: "负载 15m" },
          ],
          yAxisLabel: "负载值",
        };
      case "connections":
        return {
          lines: [
            { dataKey: "tcp", color: "#3b82f6", name: "TCP 连接" },
            { dataKey: "udp", color: "#10b981", name: "UDP 连接" },
          ],
          yAxisLabel: "连接数",
        };
    }
  };

  const tunnelChartData = tunnelMetrics.map((m) => ({
    time: formatTimestamp(m.timestamp, tunnelRangeMs),
    bytesIn: m.bytesIn,
    bytesOut: m.bytesOut,
  }));

  const getTunnelChartConfig = () => {
    return {
      lines: [
        { dataKey: "bytesIn", color: "#10b981", name: "入站流量" },
        { dataKey: "bytesOut", color: "#ef4444", name: "出站流量" },
      ],
      yAxisLabel: "流量",
    };
  };

  const handleOpenEditModal = (monitor?: ServiceMonitorApiItem) => {
    if (monitor) {
      if (!isSupportedMonitorType(monitor.type)) {
        toast.error("该监控类型已不支持，仅支持删除");

        return;
      }
      setEditingMonitor(monitor);
      setMonitorForm({
        name: monitor.name,
        type: monitor.type as "tcp" | "icmp",
        target: monitor.target,
        intervalSec: monitor.intervalSec,
        timeoutSec: monitor.timeoutSec,
        nodeId: monitor.nodeId,
        enabled: monitor.enabled === 1,
      });
    } else {
      setEditingMonitor(null);
      setMonitorForm({
        name: "",
        type: "tcp",
        target: "",
        intervalSec: resolvedServiceMonitorLimits.defaultIntervalSec,
        timeoutSec: resolvedServiceMonitorLimits.defaultTimeoutSec,
        nodeId: 0,
        enabled: true,
      });
    }
    setEditModalOpen(true);
  };

  const handleSubmitMonitor = async () => {
    if (!monitorForm.name || !monitorForm.target) {
      toast.error("请填写完整信息");

      return;
    }

    if (
      monitorForm.type === "icmp" &&
      (!monitorForm.nodeId || monitorForm.nodeId <= 0)
    ) {
      toast.error("ICMP 监控必须选择执行节点");

      return;
    }

    if (monitorForm.intervalSec < resolvedServiceMonitorLimits.minIntervalSec) {
      toast.error(
        `检查间隔不能小于 ${resolvedServiceMonitorLimits.minIntervalSec}s`,
      );

      return;
    }

    if (
      monitorForm.timeoutSec < resolvedServiceMonitorLimits.minTimeoutSec ||
      monitorForm.timeoutSec > resolvedServiceMonitorLimits.maxTimeoutSec
    ) {
      toast.error(
        `超时时间需在 ${resolvedServiceMonitorLimits.minTimeoutSec}-${resolvedServiceMonitorLimits.maxTimeoutSec}s 范围内`,
      );

      return;
    }

    setSubmitLoading(true);
    try {
      const payload: ServiceMonitorMutationPayload = {
        name: monitorForm.name,
        type: monitorForm.type,
        target: monitorForm.target,
        intervalSec: monitorForm.intervalSec,
        timeoutSec: monitorForm.timeoutSec,
        nodeId: monitorForm.nodeId,
        enabled: monitorForm.enabled ? 1 : 0,
      };

      if (editingMonitor) {
        const response = await updateServiceMonitor({
          ...payload,
          id: editingMonitor.id,
        });

        if (response.code === 0) {
          toast.success("更新成功");
        } else {
          toast.error(response.msg || "更新失败");
        }
      } else {
        const response = await createServiceMonitor(payload);

        if (response.code === 0) {
          toast.success("创建成功");
        } else {
          toast.error(response.msg || "创建失败");
        }
      }

      setEditModalOpen(false);
      void loadServiceMonitors();
      void loadLatestMonitorResults();
    } catch {
      toast.error("操作失败");
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDeleteMonitor = async (id: number) => {
    if (!confirm("确定删除该监控项?")) return;
    try {
      const response = await deleteServiceMonitor(id);

      if (response.code === 0) {
        toast.success("删除成功");
        void loadServiceMonitors();
        void loadLatestMonitorResults();
      } else {
        toast.error(response.msg || "删除失败");
      }
    } catch {
      toast.error("删除失败");
    }
  };

  const handleRunMonitor = async (id: number) => {
    try {
      const response = await runServiceMonitor(id);

      if (response.code === 0) {
        const ok = response.data?.success === 1;

        if (ok) {
          toast.success("检查成功");
        } else {
          toast.error(response.data?.errorMessage || "检查失败");
        }

        if (response.data) {
          const latest = response.data;

          setMonitorResults((prev) => {
            const next = { ...prev };
            const existing = next[id];

            if (existing && existing.length > 1) {
              next[id] = [
                latest,
                ...existing.filter((x) => x.id !== latest.id),
              ];
            } else {
              next[id] = [latest];
            }

            return next;
          });
        }

        void loadLatestMonitorResults();
        if (resultsMonitorId === id && resultsModalOpen) {
          void loadResultsForModal();
        }
      } else if (response.code === 403) {
        setAccessDenied(response.msg || "暂无监控权限，请联系管理员授权");
      } else {
        toast.error(response.msg || "执行失败");
      }
    } catch {
      toast.error("执行失败");
    }
  };

  const openResultsModal = (monitorId: number) => {
    setResultsMonitorId(monitorId);
    setResultsModalOpen(true);
  };

  const getLatestResult = (
    monitorId: number,
  ): ServiceMonitorResultApiItem | null => {
    const results = monitorResults[monitorId];

    return results && results.length > 0 ? results[0] : null;
  };

  const resultsMonitor =
    resultsMonitorId != null
      ? serviceMonitors.find((m) => m.id === resultsMonitorId) || null
      : null;
  const modalResults =
    resultsMonitorId != null ? monitorResults[resultsMonitorId] || [] : [];

  const selectedRealtimeMetric =
    selectedNodeId != null ? realtimeNodeMetrics[selectedNodeId] || null : null;
  const latestPersistedNodeTs =
    metrics.length > 0 ? metrics[metrics.length - 1]?.timestamp : null;
  const latestPersistedTunnelTs =
    tunnelMetrics.length > 0
      ? tunnelMetrics[tunnelMetrics.length - 1]?.timestamp
      : null;

  const resolveMonitorIntervalSec = useCallback(
    (monitor: ServiceMonitorApiItem) => {
      let interval = Number(monitor.intervalSec ?? 0);

      if (!interval || interval <= 0) {
        interval = resolvedServiceMonitorLimits.defaultIntervalSec;
      }

      return Math.max(interval, resolvedServiceMonitorLimits.minIntervalSec);
    },
    [resolvedServiceMonitorLimits.defaultIntervalSec, resolvedServiceMonitorLimits.minIntervalSec],
  );

  const isResultStale = useCallback(
    (monitor: ServiceMonitorApiItem, latestResult: ServiceMonitorResultApiItem | null) => {
      if (monitor.enabled !== 1) {
        return false;
      }
	  if (!latestResult || !latestResult.timestamp) {
		  return false;
	  }

      const intervalMs = resolveMonitorIntervalSec(monitor) * 1000;
      const budgetMs =
        intervalMs + resolvedServiceMonitorLimits.checkerScanIntervalSec * 1000 + 5000;

      return Date.now() - latestResult.timestamp > budgetMs;
    },
    [resolveMonitorIntervalSec, resolvedServiceMonitorLimits.checkerScanIntervalSec],
  );

  const monitorSummary = useMemo(() => {
    let disabled = 0;
    let ok = 0;
    let fail = 0;
    let unknown = 0;
    let stale = 0;

    serviceMonitors.forEach((m) => {
      if (m.enabled !== 1) {
        disabled += 1;

        return;
      }

      const latest = getLatestResult(m.id);
	  if (!latest) {
		  unknown += 1;
		  return;
	  }

      if (isResultStale(m, latest)) {
        stale += 1;
      }
      if (latest.success === 1) {
        ok += 1;
      } else {
        fail += 1;
      }
    });

    return { disabled, ok, fail, unknown, stale };
  }, [getLatestResult, isResultStale, serviceMonitors]);

  const chartConfig = getChartConfig();
  const tunnelChartConfig = getTunnelChartConfig();

  const nodeYAxisTickFormatter = (value: unknown) => {
    const n = Number(value);

    if (!Number.isFinite(n)) return "";

    switch (activeMetricType) {
      case "network":
        return formatBytesPerSecond(n);
      case "cpu":
      case "memory":
      case "disk":
        return `${n.toFixed(0)}%`;
      case "load":
        return n.toFixed(1);
      case "connections":
        return String(Math.round(n));
    }
  };

  const nodeTooltipFormatter = (value: unknown) => {
    const n = Number(value);

    if (!Number.isFinite(n)) return "-";

    switch (activeMetricType) {
      case "network":
        return formatBytesPerSecond(n);
      case "cpu":
      case "memory":
      case "disk":
        return `${n.toFixed(1)}%`;
      case "load":
        return n.toFixed(2);
      case "connections":
        return String(Math.round(n));
    }
  };

  const tunnelYAxisTickFormatter = (value: unknown) => {
    const n = Number(value);

    if (!Number.isFinite(n)) return "";

    return formatBytes(n);
  };

  const tunnelTooltipFormatter = (value: unknown) => {
    const n = Number(value);

    if (!Number.isFinite(n)) return "-";

    return formatBytes(n);
  };

  return (
    <div className="space-y-6">
      {accessDenied && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2">
            <Activity className="w-5 h-5 text-warning" />
            <h3 className="text-lg font-semibold">监控权限</h3>
          </CardHeader>
          <CardBody>
            <div className="text-sm text-default-600">{accessDenied}</div>
            <div className="text-xs text-default-500 mt-2">
              如需使用监控功能，请联系管理员在用户页面授予监控权限。
            </div>
          </CardBody>
        </Card>
      )}

      {!accessDenied && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {nodes.map((node) => {
               const metric = realtimeNodeMetrics[node.id] || null;
               return <ServerCard key={node.id} node={node} metric={metric} />;
            })}
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="text-lg font-semibold">监控概览</h3>
              <div className="flex items-center gap-2 text-xs text-default-500">
                <div
                  className={`w-2 h-2 rounded-full ${
                    wsConnected
                      ? "bg-success"
                      : wsConnecting
                        ? "bg-warning"
                        : "bg-default-300"
                  }`}
                />
                <span>
                  {wsConnected
                    ? "实时已连接"
                    : wsConnecting
                      ? "实时连接中"
                      : "实时未连接"}
                </span>
              </div>
            </CardHeader>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Chip color="primary" size="sm" variant="flat">
                  节点在线 {onlineNodes.length}/{nodes.length}
                </Chip>
                <Chip color="success" size="sm" variant="flat">
                  服务监控 成功 {monitorSummary.ok} / 失败 {monitorSummary.fail}
                </Chip>
                <Chip color="default" size="sm" variant="flat">
                  禁用 {monitorSummary.disabled}
                </Chip>
                {monitorSummary.unknown > 0 ? (
                  <Chip color="default" size="sm" variant="flat">
                    未检查 {monitorSummary.unknown}
                  </Chip>
                ) : null}
                {monitorSummary.stale > 0 ? (
                  <Chip color="warning" size="sm" variant="flat">
                    陈旧 {monitorSummary.stale}
                  </Chip>
                ) : null}
              </div>

              <div className="text-xs text-default-500 space-y-1">
                <div>
                  历史图表来自数据库，入库批量刷新约 30s（可能存在 0-30s 延迟）
                </div>
                <div>
                  节点最近入库：
                  {latestPersistedNodeTs ? (
                    <span className="font-mono">
                      {formatDateTime(latestPersistedNodeTs)}（约{
                      Math.max(
                        0,
                        Math.round((Date.now() - latestPersistedNodeTs) / 1000),
                      )}
                      s前）
                    </span>
                  ) : (
                    "-"
                  )}
                </div>
                <div>
                  实时数据更新时间：
                  {selectedRealtimeMetric ? (
                    <span className="font-mono">
                      {formatDateTime(selectedRealtimeMetric.receivedAt)}
                    </span>
                  ) : (
                    "-"
                  )}
                </div>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="text-lg font-semibold">节点指标图表</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Select
                  className="w-48"
                  placeholder="选择节点"
                  selectedKeys={selectedNodeId ? [String(selectedNodeId)] : []}
                  onSelectionChange={(keys) => {
                    const nodeId = Number(Array.from(keys)[0]);

                    setSelectedNodeId(nodeId || null);
                  }}
                >
                  {nodes.map((node) => (
                    <SelectItem key={String(node.id)}>
                      {node.name}
                      {node.connectionStatus === "online" ? "" : " (离线)"}
                    </SelectItem>
                  ))}
                </Select>

                <Select
                  className="w-36"
                  selectedKeys={[String(metricsRangeMs)]}
                  onSelectionChange={(keys) => {
                    const v = Number(Array.from(keys)[0]);

                    if (v > 0) setMetricsRangeMs(v);
                  }}
                >
                  <SelectItem key={String(15 * 60 * 1000)}>15分钟</SelectItem>
                  <SelectItem key={String(60 * 60 * 1000)}>1小时</SelectItem>
                  <SelectItem key={String(6 * 60 * 60 * 1000)}>
                    6小时
                  </SelectItem>
                  <SelectItem key={String(24 * 60 * 60 * 1000)}>
                    24小时
                  </SelectItem>
                </Select>

                {selectedNodeId && (
                  <Button
                    isLoading={metricsLoading}
                    size="sm"
                    variant="flat"
                    onPress={() => loadMetrics(selectedNodeId)}
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    刷新
                  </Button>
                )}
              </div>

              {selectedNodeId && (
                <>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-default-500">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          wsConnected
                            ? "bg-success"
                            : wsConnecting
                              ? "bg-warning"
                              : "bg-default-300"
                        }`}
                      />
                      <span>实时</span>
                    </div>
                    {selectedRealtimeMetric ? (
                      <span className="font-mono">
                        CPU {selectedRealtimeMetric.cpuUsage.toFixed(1)}% · 内存{" "}
                        {selectedRealtimeMetric.memoryUsage.toFixed(1)}% · ↓{" "}
                        {formatBytesPerSecond(selectedRealtimeMetric.netInSpeed)} · ↑{" "}
                        {formatBytesPerSecond(selectedRealtimeMetric.netOutSpeed)} · 更新{" "}
                        {formatDateTime(selectedRealtimeMetric.receivedAt)}
                      </span>
                    ) : (
                      <span>暂无实时数据</span>
                    )}
                  </div>

                  <div className="text-xs text-default-500">
                    最近入库：
                    {latestPersistedNodeTs ? (
                      <span className="font-mono">
                        {formatDateTime(latestPersistedNodeTs)}（约
                        {Math.max(
                          0,
                          Math.round((Date.now() - latestPersistedNodeTs) / 1000),
                        )}
                        s前）
                      </span>
                    ) : (
                      "-"
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        { key: "cpu", label: "CPU" },
                        { key: "memory", label: "内存" },
                        { key: "disk", label: "磁盘" },
                        { key: "network", label: "网络" },
                        { key: "load", label: "负载" },
                        { key: "connections", label: "连接" },
                      ] as { key: MetricType; label: string }[]
                    ).map((item) => (
                      <Button
                        key={item.key}
                        color={
                          activeMetricType === item.key ? "primary" : "default"
                        }
                        size="sm"
                        variant={
                          activeMetricType === item.key ? "solid" : "flat"
                        }
                        onPress={() => setActiveMetricType(item.key)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>

                  {metricsLoading ? (
                    <div className="flex justify-center py-8">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                    </div>
                  ) : metricsError ? (
                    <div className="text-center py-8 text-danger text-sm">
                      {metricsError}
                    </div>
                  ) : metrics.length > 0 ? (
                    <>
                      <div className="h-64">
                        <ResponsiveContainer height="100%" width="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                             <XAxis dataKey="time" fontSize={12} />
                             <YAxis
                               fontSize={12}
                               tickFormatter={nodeYAxisTickFormatter}
                             />
                             <Tooltip
                               contentStyle={{
                                 backgroundColor: "rgba(0,0,0,0.8)",
                                 border: "none",
                                 borderRadius: "8px",
                               }}
                               labelStyle={{ color: "#fff" }}
                               formatter={nodeTooltipFormatter}
                             />
                            {chartConfig.lines.map((line) => (
                              <Line
                                key={line.dataKey}
                                dataKey={line.dataKey}
                                dot={false}
                                name={line.name}
                                stroke={line.color}
                                strokeWidth={2}
                                type="monotone"
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      {metricsTruncated && (
                        <div className="text-xs text-default-500">
                          数据点过多，已截断为最近 {METRICS_MAX_ROWS}{" "}
                          条，建议缩小时间范围。
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-default-500">
                      暂无指标数据
                    </div>
                  )}
                </>
              )}

              {!selectedNodeId && (
                <div className="text-center py-8 text-default-500">
                  请选择一个在线节点查看指标
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="text-lg font-semibold">隧道流量趋势</h3>
            </CardHeader>
            <CardBody className="space-y-4">
              {tunnelsError ? (
                <div className="text-sm text-danger">{tunnelsError}</div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Select
                  className="w-56"
                  placeholder={tunnelsLoading ? "加载中..." : "选择隧道"}
                  selectedKeys={
                    selectedTunnelId ? [String(selectedTunnelId)] : []
                  }
                  onSelectionChange={(keys) => {
                    const tunnelId = Number(Array.from(keys)[0]);

                    setSelectedTunnelId(tunnelId || null);
                  }}
                >
                  {tunnels.map((t) => (
                    <SelectItem key={String(t.id)}>
                      {t.name}
                      {t.status === 1 ? "" : " (禁用)"}
                    </SelectItem>
                  ))}
                </Select>

                <Select
                  className="w-36"
                  selectedKeys={[String(tunnelRangeMs)]}
                  onSelectionChange={(keys) => {
                    const v = Number(Array.from(keys)[0]);

                    if (v > 0) setTunnelRangeMs(v);
                  }}
                >
                  <SelectItem key={String(15 * 60 * 1000)}>15分钟</SelectItem>
                  <SelectItem key={String(60 * 60 * 1000)}>1小时</SelectItem>
                  <SelectItem key={String(6 * 60 * 60 * 1000)}>
                    6小时
                  </SelectItem>
                  <SelectItem key={String(24 * 60 * 60 * 1000)}>
                    24小时
                  </SelectItem>
                </Select>

                {selectedTunnelId && (
                  <Button
                    isLoading={tunnelMetricsLoading}
                    size="sm"
                    variant="flat"
                    onPress={() => void loadTunnelMetrics(selectedTunnelId)}
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    刷新
                  </Button>
                )}
              </div>

              {selectedTunnelId && (
                <>
                  <div className="text-xs text-default-500">
                    最近入库：
                    {latestPersistedTunnelTs ? (
                      <span className="font-mono">
                        {formatDateTime(latestPersistedTunnelTs)}（约
                        {Math.max(
                          0,
                          Math.round((Date.now() - latestPersistedTunnelTs) / 1000),
                        )}
                        s前）
                      </span>
                    ) : (
                      "-"
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(
                      [{ key: "traffic", label: "流量" }] as {
                        key: TunnelMetricType;
                        label: string;
                      }[]
                    ).map((item) => (
                      <Button
                        key={item.key}
                        color={
                          activeTunnelMetricType === item.key
                            ? "primary"
                            : "default"
                        }
                        size="sm"
                        variant={
                          activeTunnelMetricType === item.key ? "solid" : "flat"
                        }
                        onPress={() => setActiveTunnelMetricType(item.key)}
                      >
                        {item.label}
                      </Button>
                    ))}
                  </div>

                  {tunnelMetricsLoading ? (
                    <div className="flex justify-center py-8">
                      <RefreshCw className="w-6 h-6 animate-spin" />
                    </div>
                  ) : tunnelMetricsError ? (
                    <div className="text-center py-8 text-danger text-sm">
                      {tunnelMetricsError}
                    </div>
                  ) : tunnelMetrics.length > 0 ? (
                    <>
                      <div className="h-64">
                        <ResponsiveContainer height="100%" width="100%">
                          <LineChart data={tunnelChartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                             <XAxis dataKey="time" fontSize={12} />
                             <YAxis
                               fontSize={12}
                               tickFormatter={tunnelYAxisTickFormatter}
                             />
                             <Tooltip
                               contentStyle={{
                                 backgroundColor: "rgba(0,0,0,0.8)",
                                 border: "none",
                                 borderRadius: "8px",
                               }}
                               labelStyle={{ color: "#fff" }}
                               formatter={tunnelTooltipFormatter}
                             />
                            {tunnelChartConfig.lines.map((line) => (
                              <Line
                                key={line.dataKey}
                                dataKey={line.dataKey}
                                dot={false}
                                name={line.name}
                                stroke={line.color}
                                strokeWidth={2}
                                type="monotone"
                              />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      {tunnelMetricsTruncated && (
                        <div className="text-xs text-default-500">
                          数据点过多，已截断为最近 {METRICS_MAX_ROWS}{" "}
                          条，建议缩小时间范围。
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-default-500">
                      暂无指标数据
                    </div>
                  )}
                </>
              )}

              {!selectedTunnelId && (
                <div className="text-center py-8 text-default-500">
                  请选择一个隧道查看指标
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="text-lg font-semibold">服务监控</h3>
              <Button
                color="primary"
                size="sm"
                variant="flat"
                onPress={() => handleOpenEditModal()}
              >
                <Plus className="w-4 h-4 mr-1" />
                添加监控
              </Button>
            </CardHeader>
            <CardBody>
              {monitorsError ? (
                <div className="text-sm text-danger mb-3">{monitorsError}</div>
              ) : null}
              {latestResultsError ? (
                <div className="text-xs text-default-500 mb-3">
                  {latestResultsError}
                </div>
              ) : null}

              {monitorsLoading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="w-6 h-6 animate-spin" />
                </div>
              ) : serviceMonitors.length > 0 ? (
                <Table aria-label="服务监控列表">
                  <TableHeader>
                    <TableColumn>名称</TableColumn>
                    <TableColumn>类型</TableColumn>
                    <TableColumn>目标</TableColumn>
                    <TableColumn>间隔</TableColumn>
                    <TableColumn>启用</TableColumn>
                    <TableColumn>最新结果</TableColumn>
                    <TableColumn>操作</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {serviceMonitors.map((monitor) => {
                      const latestResult = getLatestResult(monitor.id);
                      const stale = isResultStale(monitor, latestResult);

                      return (
                        <TableRow key={monitor.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{monitor.name}</div>
                              {monitor.nodeId > 0 && (
                                <div className="text-xs text-default-500">
                                  节点:{" "}
                                  {nodeMap.get(monitor.nodeId)?.name ||
                                    monitor.nodeId}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Chip color="primary" size="sm" variant="flat">
                              {monitor.type.toUpperCase()}
                            </Chip>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono text-sm">
                              {monitor.target}
                            </span>
                          </TableCell>
                          <TableCell>{monitor.intervalSec}s</TableCell>
                          <TableCell>
                            {monitor.enabled === 1 ? (
                              <Chip color="success" size="sm" variant="flat">
                                启用
                              </Chip>
                            ) : (
                              <Chip color="default" size="sm" variant="flat">
                                禁用
                              </Chip>
                            )}
                          </TableCell>
                          <TableCell>
                            {latestResult ? (
                              <div className="space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  {latestResult.success === 1 ? (
                                    <Chip color="success" size="sm" variant="flat">
                                      成功
                                    </Chip>
                                  ) : (
                                    <Chip color="danger" size="sm" variant="flat">
                                      失败
                                    </Chip>
                                  )}
                                  {stale ? (
                                    <Chip color="warning" size="sm" variant="flat">
                                      陈旧
                                    </Chip>
                                  ) : null}

                                  <span className="font-mono text-xs text-default-500">
                                    {Number.isFinite(latestResult.latencyMs)
                                      ? `${latestResult.latencyMs.toFixed(0)}ms`
                                      : "-"}
                                  </span>

                                  <span className="font-mono text-xs text-default-500">
                                    {formatDateTime(latestResult.timestamp)}
                                  </span>
                                </div>

                                {latestResult.errorMessage ? (
                                  <div className="text-xs text-danger">
                                    {latestResult.errorMessage}
                                  </div>
                                ) : null}
                              </div>
                            ) : monitor.enabled === 1 ? (
                              <span className="text-default-400 text-sm">
                                未检查
                              </span>
                            ) : (
                              <span className="text-default-400">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Dropdown>
                              <DropdownTrigger>
                                <Button isIconOnly size="sm" variant="light">
                                  <MoreVertical className="w-4 h-4" />
                                </Button>
                              </DropdownTrigger>
                              <DropdownMenu>
                                <DropdownItem
                                  startContent={<Play className="w-4 h-4" />}
                                  onPress={() => handleRunMonitor(monitor.id)}
                                >
                                  立即检查
                                </DropdownItem>
                                <DropdownItem
                                  startContent={
                                    <Activity className="w-4 h-4" />
                                  }
                                  onPress={() => openResultsModal(monitor.id)}
                                >
                                  查看记录
                                </DropdownItem>
                                <DropdownItem
                                  startContent={<Edit className="w-4 h-4" />}
                                  onPress={() => handleOpenEditModal(monitor)}
                                >
                                  编辑
                                </DropdownItem>
                                <DropdownItem
                                  className="text-danger"
                                  color="danger"
                                  startContent={<Trash2 className="w-4 h-4" />}
                                  onPress={() =>
                                    handleDeleteMonitor(monitor.id)
                                  }
                                >
                                  删除
                                </DropdownItem>
                              </DropdownMenu>
                            </Dropdown>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 text-default-500">
                  暂无服务监控，点击&quot;添加监控&quot;创建
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}

      <Modal
        isOpen={resultsModalOpen}
        onClose={() => {
          setResultsModalOpen(false);
          setResultsMonitorId(null);
        }}
      >
        <ModalContent>
          <ModalHeader className="flex flex-row items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-semibold truncate">
                监控记录
                {resultsMonitor?.name ? ` - ${resultsMonitor.name}` : ""}
              </div>
              {resultsMonitor?.nodeId && resultsMonitor.nodeId > 0 ? (
                <div className="text-xs text-default-500 truncate">
                  节点:{" "}
                  {nodeMap.get(resultsMonitor.nodeId)?.name ||
                    resultsMonitor.nodeId}
                </div>
              ) : (
                <div className="text-xs text-default-500 truncate">
                  面板执行
                </div>
              )}

              {modalResults.length > 0 ? (
                <div className="text-xs text-default-500 truncate">
                  最新检查:{" "}
                  <span className="font-mono">
                    {formatDateTime(modalResults[0].timestamp)}
                  </span>
                </div>
              ) : null}
            </div>
            {resultsMonitorId != null ? (
              <div className="flex items-center gap-2 shrink-0">
                <Select
                  className="w-28"
                  selectedKeys={[String(resultsLimit)]}
                  onSelectionChange={(keys) => {
                    const v = Number(Array.from(keys)[0]);

                    if (v > 0) setResultsLimit(v);
                  }}
                >
                  <SelectItem key="20">20条</SelectItem>
                  <SelectItem key="50">50条</SelectItem>
                  <SelectItem key="100">100条</SelectItem>
                  <SelectItem key="200">200条</SelectItem>
                </Select>
                <Button
                  size="sm"
                  variant="flat"
                  onPress={() =>
                    resultsMonitorId != null &&
                    handleRunMonitor(resultsMonitorId)
                  }
                >
                  <Play className="w-4 h-4 mr-1" />
                  检查
                </Button>
                <Button
                  isLoading={resultsLoading}
                  size="sm"
                  variant="flat"
                  onPress={() => void loadResultsForModal()}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  刷新
                </Button>
              </div>
            ) : null}
          </ModalHeader>
          <ModalBody>
            {resultsLoading ? (
              <div className="flex justify-center py-10">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
            ) : modalResults.length > 0 ? (
              <Table aria-label="监控记录" className="w-full">
                <TableHeader>
                  <TableColumn>时间</TableColumn>
                  <TableColumn>结果</TableColumn>
                  <TableColumn>延迟</TableColumn>
                  <TableColumn>错误</TableColumn>
                </TableHeader>
                <TableBody>
                  {modalResults.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">
                        <span className="font-mono">
                          {formatDateTime(r.timestamp)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {r.success === 1 ? (
                          <Chip color="success" size="sm" variant="flat">
                            成功
                          </Chip>
                        ) : (
                          <Chip color="danger" size="sm" variant="flat">
                            失败
                          </Chip>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-sm">
                          {Number.isFinite(r.latencyMs)
                            ? `${r.latencyMs.toFixed(0)}ms`
                            : "-"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            r.errorMessage
                              ? "text-danger text-xs"
                              : "text-default-400 text-xs"
                          }
                        >
                          {r.errorMessage || "-"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-10 text-default-500">
                暂无监控记录
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button
              variant="flat"
              onPress={() => {
                setResultsModalOpen(false);
                setResultsMonitorId(null);
              }}
            >
              关闭
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Modal isOpen={editModalOpen} onClose={() => setEditModalOpen(false)}>
        <ModalContent>
          <ModalHeader>{editingMonitor ? "编辑监控" : "添加监控"}</ModalHeader>
          <ModalBody className="space-y-4">
            <Input
              label="名称"
              placeholder="例如: Google DNS"
              value={monitorForm.name}
              onChange={(e) =>
                setMonitorForm((f) => ({ ...f, name: e.target.value }))
              }
            />
            <Select
              label="类型"
              selectedKeys={[monitorForm.type]}
              onSelectionChange={(keys) => {
                const nextType = Array.from(keys)[0] as "tcp" | "icmp";

                setMonitorForm((f) => {
                  let nextNodeId = f.nodeId;

                  if (nextType === "icmp" && (!nextNodeId || nextNodeId <= 0)) {
                    nextNodeId = onlineNodes.length > 0 ? onlineNodes[0].id : 0;
                  }

                  return {
                    ...f,
                    type: nextType,
                    nodeId: nextNodeId,
                  };
                });
              }}
            >
              <SelectItem key="tcp">TCP</SelectItem>
              <SelectItem key="icmp">ICMP Ping</SelectItem>
            </Select>
            <Input
              label="目标"
              placeholder={
                monitorForm.type === "icmp"
                  ? "例如: 8.8.8.8 或 1.1.1.1"
                  : "例如: 8.8.8.8:53"
              }
              value={monitorForm.target}
              onChange={(e) =>
                setMonitorForm((f) => ({ ...f, target: e.target.value }))
              }
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                description={`最小 ${resolvedServiceMonitorLimits.minIntervalSec}s（扫描周期 ${resolvedServiceMonitorLimits.checkerScanIntervalSec}s）`}
                errorMessage={
                  monitorForm.intervalSec <
                  resolvedServiceMonitorLimits.minIntervalSec
                    ? `不能小于 ${resolvedServiceMonitorLimits.minIntervalSec}s`
                    : undefined
                }
                isInvalid={
                  monitorForm.intervalSec <
                  resolvedServiceMonitorLimits.minIntervalSec
                }
                label="检查间隔(秒)"
                type="number"
                value={String(monitorForm.intervalSec)}
                onChange={(e) =>
                  setMonitorForm((f) => ({
                    ...f,
                    intervalSec:
                      Number(e.target.value) ||
                      resolvedServiceMonitorLimits.defaultIntervalSec,
                  }))
                }
              />
              <Input
                description={`范围 ${resolvedServiceMonitorLimits.minTimeoutSec}-${resolvedServiceMonitorLimits.maxTimeoutSec}s`}
                errorMessage={
                  monitorForm.timeoutSec <
                    resolvedServiceMonitorLimits.minTimeoutSec ||
                  monitorForm.timeoutSec >
                    resolvedServiceMonitorLimits.maxTimeoutSec
                    ? `需在 ${resolvedServiceMonitorLimits.minTimeoutSec}-${resolvedServiceMonitorLimits.maxTimeoutSec}s 范围内`
                    : undefined
                }
                isInvalid={
                  monitorForm.timeoutSec <
                    resolvedServiceMonitorLimits.minTimeoutSec ||
                  monitorForm.timeoutSec >
                    resolvedServiceMonitorLimits.maxTimeoutSec
                }
                label="超时时间(秒)"
                type="number"
                value={String(monitorForm.timeoutSec)}
                onChange={(e) =>
                  setMonitorForm((f) => ({
                    ...f,
                    timeoutSec:
                      Number(e.target.value) ||
                      resolvedServiceMonitorLimits.defaultTimeoutSec,
                  }))
                }
              />
            </div>
            <Select
              label="执行节点"
              selectedKeys={
                monitorForm.type === "icmp"
                  ? monitorForm.nodeId
                    ? [String(monitorForm.nodeId)]
                    : []
                  : monitorForm.nodeId
                    ? [String(monitorForm.nodeId)]
                    : ["0"]
              }
              onSelectionChange={(keys) =>
                setMonitorForm((f) => ({
                  ...f,
                  nodeId: Number(Array.from(keys)[0]),
                }))
              }
            >
              {monitorForm.type !== "icmp" && (
                <SelectItem key="0">面板执行</SelectItem>
              )}
              {onlineNodes.map((node) => (
                <SelectItem key={String(node.id)}>{node.name}</SelectItem>
              ))}
            </Select>
            <div className="flex items-center gap-2">
              <Switch
                isSelected={monitorForm.enabled}
                onValueChange={(v) =>
                  setMonitorForm((f) => ({ ...f, enabled: v }))
                }
              />
              <span className="text-sm">启用</span>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setEditModalOpen(false)}>
              取消
            </Button>
            <Button
              color="primary"
              isLoading={submitLoading}
              onPress={handleSubmitMonitor}
            >
              {editingMonitor ? "更新" : "创建"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
