import type {
  TunnelGroupNewApiItem,
  TunnelGroupNewMutationPayload,
} from "@/api/types";

import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Edit, Trash2 } from "lucide-react";

import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/shadcn-bridge/heroui/modal";
import { Button } from "@/shadcn-bridge/heroui/button";
import { Input } from "@/shadcn-bridge/heroui/input";
import { Textarea } from "@/shadcn-bridge/heroui/input";
import { Chip } from "@/shadcn-bridge/heroui/chip";
import { Spinner } from "@/shadcn-bridge/heroui/spinner";
import { Select, SelectItem } from "@/shadcn-bridge/heroui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/shadcn-bridge/heroui/table";
import {
  getTunnelGroupNewList,
  createTunnelGroupNew,
  updateTunnelGroupNew,
  deleteTunnelGroupNew,
  getTunnelList,
  assignTunnelsToGroup,
} from "@/api";

interface TunnelGroupManagerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupChange?: () => void;
}

export function TunnelGroupManager({
  isOpen,
  onOpenChange,
  onGroupChange,
}: TunnelGroupManagerProps) {
  const [groups, setGroups] = useState<TunnelGroupNewApiItem[]>([]);
  const [allTunnels, setAllTunnels] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingGroup, setEditingGroup] =
    useState<TunnelGroupNewApiItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 🎯 修复：统一加载函数，确保分组和隧道数据同步
  const loadAllData = async () => {
    setLoading(true);
    try {
      const [res, tunnelRes] = await Promise.all([
        getTunnelGroupNewList(),
        getTunnelList(),
      ]);
      setGroups(res.data || []);
      setAllTunnels(tunnelRes.data || []);
    } catch (error) {
      toast.error("加载数据失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadAllData();
    }
  }, [isOpen]);

  const handleOpenModal = (group?: TunnelGroupNewApiItem) => {
    setEditingGroup(group || null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingGroup(null);
  };

  const handleSave = async (data: TunnelGroupNewMutationPayload, selectedTunnelIds: number[]) => {
    try {
      let groupId: number | undefined;
      if (editingGroup) {
        // 编辑分组
        await updateTunnelGroupNew({ ...data, id: editingGroup.id });
        groupId = editingGroup.id;
        console.log('编辑分组，groupId:', groupId);
      } else {
        // 创建分组
        const res: any = await createTunnelGroupNew(data);
        groupId = res.data?.id;
        console.log('创建分组，res.data:', res.data);
        console.log('创建分组，groupId:', groupId);
      }

      console.log('最终 groupId:', groupId);
      console.log('selectedTunnelIds:', selectedTunnelIds);

      // 🎯 修复：差量更新逻辑
      const originalTunnels = editingGroup && editingGroup.id
        ? allTunnels.filter(t => t.tunnelGroupId === editingGroup.id).map(t => t.id)
        : [];

      console.log('originalTunnels:', originalTunnels);
      console.log('toAdd:', selectedTunnelIds.filter(id => !originalTunnels.includes(id)));
      console.log('toRemove:', originalTunnels.filter(id => !selectedTunnelIds.includes(id)));

      const toAdd = selectedTunnelIds.filter(id => !originalTunnels.includes(id));
      const toRemove = originalTunnels.filter(id => !selectedTunnelIds.includes(id));

      // 只有当 groupId 有效时才调用 API
      if (groupId && groupId > 0) {
        await Promise.all([
          toAdd.length > 0 ? assignTunnelsToGroup({ groupId, tunnelIds: toAdd }) : Promise.resolve(),
          toRemove.length > 0 ? assignTunnelsToGroup({ groupId, tunnelIds: toRemove }) : Promise.resolve()
        ]);
      }

      toast.success("保存成功");
      handleCloseModal();
      // 🎯 修复：保存后强制刷新本地所有数据，确保数量和状态即时改变
      await loadAllData();
      onGroupChange?.();
    } catch (error) {
      console.error('保存失败:', error);
      toast.error("保存失败");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除此分组吗？分组下的隧道将被设为未分组。")) return;
    try {
      await deleteTunnelGroupNew(id);
      toast.success("删除成功");
      await loadAllData();
      onGroupChange?.();
    } catch (error) {
      toast.error("删除失败");
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} size="2xl" onOpenChange={onOpenChange}>
        <ModalContent>
          <ModalHeader>隧道分组管理</ModalHeader>
          <ModalBody>
            <div className="mb-4">
              <Button color="primary" onClick={() => handleOpenModal()}>
                创建分组
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-8 text-gray-500">暂无分组</div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-divider bg-content1 shadow-md">
                <Table
                  aria-label="隧道分组列表"
                  classNames={{
                    th: "bg-default-100/50 text-default-600 font-semibold text-sm border-b border-divider py-3 uppercase tracking-wider text-left align-middle",
                    td: "py-3 border-b border-divider/50 group-data-[last=true]:border-b-0",
                    tr: "hover:bg-default-50/50 transition-colors",
                    wrapper: "shadow-none p-0",
                  }}
                >
                  <TableHeader>
                    <TableColumn className="whitespace-nowrap flex-shrink-0 w-[220px] text-left">分组名</TableColumn>
                    <TableColumn className="whitespace-nowrap flex-shrink-0 w-[100px] text-center">排序</TableColumn>                    
                    <TableColumn className="whitespace-nowrap flex-shrink-0 w-[180px] text-center"> 隧道数</TableColumn>
					          <TableColumn className="whitespace-nowrap flex-shrink-0 w-[120px] text-left">颜色</TableColumn>
                    <TableColumn className="whitespace-nowrap flex-shrink-0 w-[120px] text-left"> 操作</TableColumn>
                  </TableHeader>
                  <TableBody emptyContent="暂无分组" items={groups}>
                    {(group) => (
                      <TableRow
                        key={group.id}
                        className="hover:bg-default-50/50 transition-colors"
                      >
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: group.color }}
                            />
                            <span className="font-bold text-default-700">
                              {group.name}
                            </span>
                          </div>
                          {group.description && (
                            <div className="text-xs text-default-500 mt-1 truncate max-w-[180px]">
                              {group.description}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            <Chip
                              className="bg-blue-500 text-white font-mono font-semibold"
                              size="sm"
                              variant="flat"
                            >
							  {group.inx || 0}
							</Chip>
                          </div>
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2">
                            <Chip
                              className="bg-purple-500 text-white font-mono font-semibold"
                              size="sm"
                              variant="flat"
                            >
                              {allTunnels.filter((t) => t.tunnelGroupId === group.id).length}
                            </Chip>
                          </div>
                        </TableCell>
						
						 <TableCell className="whitespace-nowrap">
                          <div className="flex items-center justify-start items-center gap-2">
                            <div
                              className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                              style={{ backgroundColor: group.color }}
                            />
                            <span className="text-sm text-default-600 font-mono">
                              {group.color}
                            </span>
                          </div>
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center justify-start gap-2">
                            <Button
                              isIconOnly
                              className="bg-blue-50 text-blue-600 hover:bg-blue-100 w-8 h-8 min-w-8"
                              size="sm"
                              variant="flat"
                              onPress={() => handleOpenModal(group)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              isIconOnly
                              className="bg-danger-50 text-danger hover:bg-danger-100 w-8 h-8 min-w-8"
                              size="sm"
                              variant="flat"
                              onPress={() => handleDelete(group.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onClick={() => onOpenChange(false)}>
              关闭
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal >

      <GroupEditModal
        allTunnels={allTunnels}
        group={editingGroup}
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        onSave={handleSave}
      />
    </>
  );
}

interface GroupEditModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  group: TunnelGroupNewApiItem | null;
  allTunnels: any[];
  onSave: (data: TunnelGroupNewMutationPayload, selectedTunnelIds: number[]) => void;
}

function GroupEditModal({
  isOpen,
  onOpenChange,
  group,
  allTunnels,
  onSave,
}: GroupEditModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [inx, setInx] = useState(0);
  const [selectedTunnelIds, setSelectedTunnelIds] = useState<number[]>([]);

  useEffect(() => {
    if (group && isOpen) {
      setName(group.name);
      setDescription(group.description || "");
      setColor(group.color || "#3b82f6");
      setInx(group.inx || 0);
      const currentTunnels = allTunnels.filter(t => t.tunnelGroupId === group.id).map(t => t.id);
      setSelectedTunnelIds(currentTunnels);
    } else if (isOpen) {
      setName("");
      setDescription("");
      setColor("#3b82f6");
      setInx(0);
      setSelectedTunnelIds([]);
    }
  }, [group, isOpen, allTunnels]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("分组名称不能为空");
      return;
    }
    onSave({ name, description, color, inx }, selectedTunnelIds);
  };

  const presetColors = [
    "#3b82f6",
    "#ef4444",
    "#22c55e",
    "#f59e0b",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#84cc16",
  ];

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange} scrollBehavior="inside" backdrop="blur">
      <ModalContent>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 w-full min-h-0">
          <ModalHeader>{group ? "编辑分组" : "创建分组"}</ModalHeader>
          <ModalBody className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                分组名称 *
              </label>
              <Input
                required
                placeholder="输入分组名称"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">描述</label>
              <Textarea
                classNames={{
                  inputWrapper: "!min-h-[20px] py-1.5",
                  input: "!min-h-[20px]",
                }}
                placeholder="分组描述（可选）"
                rows={1}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">分配隧道</label>
              <Select
                placeholder="选择要加入此分组的隧道"
                selectionMode="multiple"
                variant="bordered"
                selectedKeys={new Set(selectedTunnelIds.map(String))}
                onSelectionChange={(keys: any) => setSelectedTunnelIds(Array.from(keys).map(Number))}
              >
                {allTunnels.map((tunnel: any) => (
                  <SelectItem key={tunnel.id.toString()} textValue={tunnel.name}>
                    <div className="flex flex-col">
                      <span className="text-sm">{tunnel.name}</span>
                      <span className="text-xs text-default-400">{tunnel.inIp || "未知入口 IP"}</span>
                    </div>
                  </SelectItem>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">颜色</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {presetColors.map((c) => (
                  <button
                    key={c}
                    className={`w-8 h-8 rounded border-2 ${color === c ? "border-gray-900" : "border-transparent"
                      }`}
                    style={{ backgroundColor: c }}
                    type="button"
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  className="w-10 h-10 border rounded cursor-pointer"
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
                <Input
                  className="flex-1"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">排序</label>
              <Input
                placeholder="数字越小越靠前"
                type="number"
                value={inx}
                onChange={(e) => setInx(parseInt(e.target.value) || 0)}
              />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button
              type="button"
              variant="flat"
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button color="primary" type="submit">
              保存
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
