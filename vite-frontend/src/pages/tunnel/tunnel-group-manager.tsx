import { useState, useEffect } from "react";
import toast from "react-hot-toast";
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
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/shadcn-bridge/heroui/table";
import { Edit, Trash2 } from "lucide-react";
import {
  getTunnelGroupListNew,
  createTunnelGroupNew,
  updateTunnelGroupNew,
  deleteTunnelGroupNew,
} from "@/api";
import type { TunnelGroupApiItem, TunnelGroupMutationPayload } from "@/api/types";

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
  const [groups, setGroups] = useState<TunnelGroupApiItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingGroup, setEditingGroup] = useState<TunnelGroupApiItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await getTunnelGroupListNew();
      setGroups(res.data || []);
    } catch (error) {
      toast.error("加载分组列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadGroups();
    }
  }, [isOpen]);

  const handleOpenModal = (group?: TunnelGroupApiItem) => {
    setEditingGroup(group || null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingGroup(null);
  };

  const handleSave = async (data: TunnelGroupMutationPayload) => {
    try {
      if (editingGroup) {
        await updateTunnelGroupNew({ ...data, id: editingGroup.id });
        toast.success("分组更新成功");
      } else {
        await createTunnelGroupNew(data);
        toast.success("分组创建成功");
      }
      handleCloseModal();
      await loadGroups();
      onGroupChange?.();
    } catch (error) {
      toast.error(editingGroup ? "更新分组失败" : "创建分组失败");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除此分组吗？分组下的隧道将被设为未分组。")) {
      return;
    }
    try {
      await deleteTunnelGroupNew(id);
      toast.success("分组删除成功");
      await loadGroups();
      onGroupChange?.();
    } catch (error) {
      toast.error("删除分组失败");
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="2xl">
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
              <div className="text-center py-8 text-gray-500">
                暂无分组
              </div>
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
                    <TableColumn className="whitespace-nowrap flex-shrink-0 w-[200px] text-left">分组名称</TableColumn>
                    <TableColumn className="whitespace-nowrap flex-shrink-0 w-[120px] text-left">颜色</TableColumn>
                    <TableColumn className="whitespace-nowrap flex-shrink-0 w-[100px] text-left">隧道数</TableColumn>
                    <TableColumn className="whitespace-nowrap flex-shrink-0 w-[150px] text-left">操作</TableColumn>
                  </TableHeader>
                  <TableBody
                    emptyContent="暂无分组"
                    items={groups}
                  >
                    {(group) => (
                      <TableRow key={group.id} className="hover:bg-default-50/50 transition-colors">
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: group.color }}
                            />
                            <span className="font-bold text-default-700">{group.name}</span>
                          </div>
                          {group.description && (
                            <div className="text-xs text-default-500 mt-1 truncate max-w-[180px]">
                              {group.description}
                            </div>
                          )}
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                              style={{ backgroundColor: group.color }}
                            />
                            <span className="text-sm text-default-600 font-mono">{group.color}</span>
                          </div>
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          <Chip
                            size="sm"
                            variant="flat" // 👇 保留扁平风格
                            className="bg-purple-500 text-white font-mono font-semibold" // 👈 改为浅紫色背景，深紫色文字
                          >
                            {group.nodeCount}
                          </Chip>
                        </TableCell>

                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Button
                              isIconOnly
                              size="sm"
                              variant="flat"
                              className="bg-blue-50 text-blue-600 hover:bg-blue-100 w-8 h-8 min-w-8"
                              onPress={() => handleOpenModal(group)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              isIconOnly
                              size="sm"
                              variant="flat"
                              className="bg-danger-50 text-danger hover:bg-danger-100 w-8 h-8 min-w-8"
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
      </Modal>

      <GroupEditModal
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        group={editingGroup}
        onSave={handleSave}
      />
    </>
  );
}

interface GroupEditModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  group: TunnelGroupApiItem | null;
  onSave: (data: TunnelGroupMutationPayload) => void;
}

function GroupEditModal({
  isOpen,
  onOpenChange,
  group,
  onSave,
}: GroupEditModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [inx, setInx] = useState(0);

  useEffect(() => {
    if (group) {
      setName(group.name);
      setDescription(group.description || "");
      setColor(group.color || "#3b82f6");
      setInx(group.inx || 0);
    } else {
      setName("");
      setDescription("");
      setColor("#3b82f6");
      setInx(0);
    }
  }, [group, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("分组名称不能为空");
      return;
    }
    onSave({ name, description, color, inx });
  };

  const presetColors = [
    "#3b82f6", "#ef4444", "#22c55e", "#f59e0b",
    "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
  ];

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent>
        <form onSubmit={handleSubmit}>
          <ModalHeader>
            {group ? "编辑分组" : "创建分组"}
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  分组名称 *
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="输入分组名称"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  描述
                </label>
                <Textarea
                  classNames={{ inputWrapper: "!min-h-[20px] py-1.5", input: "!min-h-[20px]" }}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="分组描述（可选）"
                  rows={1}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  颜色
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {presetColors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`w-8 h-8 rounded border-2 ${color === c ? "border-gray-900" : "border-transparent"
                        }`}
                      style={{ backgroundColor: c }}
                      onClick={() => setColor(c)}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-10 h-10 border rounded cursor-pointer"
                  />
                  <Input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="flex-1"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  排序
                </label>
                <Input
                  type="number"
                  value={inx}
                  onChange={(e) => setInx(parseInt(e.target.value) || 0)}
                  placeholder="数字越小越靠前"
                />
              </div>
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
            <Button type="submit" color="primary">
              保存
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
}
