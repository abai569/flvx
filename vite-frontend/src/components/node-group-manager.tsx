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
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/shadcn-bridge/heroui/table";
import {
  getNodeGroupList,
  createNodeGroup,
  updateNodeGroup,
  deleteNodeGroup,
} from "@/api";
import type { NodeGroupApiItem, NodeGroupMutationPayload } from "@/api/types";

interface NodeGroupManagerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupChange?: () => void;
}

export function NodeGroupManager({
  isOpen,
  onOpenChange,
  onGroupChange,
}: NodeGroupManagerProps) {
  const [groups, setGroups] = useState<NodeGroupApiItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingGroup, setEditingGroup] = useState<NodeGroupApiItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadGroups = async () => {
    setLoading(true);
    try {
      const res = await getNodeGroupList();
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

  const handleOpenModal = (group?: NodeGroupApiItem) => {
    setEditingGroup(group || null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingGroup(null);
  };

  const handleSave = async (data: NodeGroupMutationPayload) => {
    try {
      if (editingGroup) {
        await updateNodeGroup({ ...data, id: editingGroup.id });
        toast.success("分组更新成功");
      } else {
        await createNodeGroup(data);
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
    if (!confirm("确定要删除此分组吗？分组下的节点将被设为未分组。")) {
      return;
    }
    try {
      await deleteNodeGroup(id);
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
          <ModalHeader>节点分组管理</ModalHeader>
          <ModalBody>
            <div className="mb-4">
              <Button color="primary" onClick={() => handleOpenModal()}>
                创建分组
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                暂无分组
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableColumn>名称</TableColumn>
                  <TableColumn>颜色</TableColumn>
                  <TableColumn>节点数</TableColumn>
                  <TableColumn>操作</TableColumn>
                </TableHeader>
                <TableBody>
                  {groups.map((group) => (
                    <TableRow key={group.id}>
                      <TableCell>
                        <div className="font-medium">{group.name}</div>
                        {group.description && (
                          <div className="text-sm text-gray-500">
                            {group.description}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: group.color }}
                          />
                          <span className="text-sm text-gray-600">
                            {group.color}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{group.nodeCount}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="flat"
                            onClick={() => handleOpenModal(group)}
                          >
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="flat"
                            color="danger"
                            onClick={() => handleDelete(group.id)}
                          >
                            删除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
  group: NodeGroupApiItem | null;
  onSave: (data: NodeGroupMutationPayload) => void;
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
      setColor(group.color);
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
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="分组描述（可选）"
                  rows={2}
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
                      className={`w-8 h-8 rounded border-2 ${
                        color === c ? "border-gray-900" : "border-transparent"
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
