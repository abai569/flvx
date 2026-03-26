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
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/shadcn-bridge/heroui/table";
import {
  getNodeTagList,
  createNodeTag,
  updateNodeTag,
  deleteNodeTag,
} from "@/api";
import type { NodeTagApiItem, NodeTagMutationPayload } from "@/api/types";

interface NodeTagManagerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onTagChange?: () => void;
}

export function NodeTagManager({
  isOpen,
  onOpenChange,
  onTagChange,
}: NodeTagManagerProps) {
  const [tags, setTags] = useState<NodeTagApiItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingTag, setEditingTag] = useState<NodeTagApiItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadTags = async () => {
    setLoading(true);
    try {
      const res = await getNodeTagList();
      setTags(res.data || []);
    } catch (error) {
      toast.error("加载标签列表失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadTags();
    }
  }, [isOpen]);

  const handleOpenModal = (tag?: NodeTagApiItem) => {
    setEditingTag(tag || null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingTag(null);
  };

  const handleSave = async (data: NodeTagMutationPayload) => {
    try {
      if (editingTag) {
        await updateNodeTag({ ...data, id: editingTag.id });
        toast.success("标签更新成功");
      } else {
        await createNodeTag(data);
        toast.success("标签创建成功");
      }
      handleCloseModal();
      await loadTags();
      onTagChange?.();
    } catch (error) {
      toast.error(editingTag ? "更新标签失败" : "创建标签失败");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定要删除此标签吗？相关节点的标签关联将被移除。")) {
      return;
    }
    try {
      await deleteNodeTag(id);
      toast.success("标签删除成功");
      await loadTags();
      onTagChange?.();
    } catch (error) {
      toast.error("删除标签失败");
    }
  };

  return (
    <>
      <Modal isOpen={isOpen} onOpenChange={onOpenChange} size="2xl">
        <ModalContent>
          <ModalHeader>节点标签管理</ModalHeader>
          <ModalBody>
            <div className="mb-4">
              <Button color="primary" onClick={() => handleOpenModal()}>
                创建标签
              </Button>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : tags.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                暂无标签
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
                  {tags.map((tag) => (
                    <TableRow key={tag.id}>
                      <TableCell>
                        <div className="font-medium">{tag.name}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-4 h-4 rounded"
                            style={{ backgroundColor: tag.color }}
                          />
                          <span className="text-sm text-gray-600">
                            {tag.color}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{tag.nodeCount}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="flat"
                            onClick={() => handleOpenModal(tag)}
                          >
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="flat"
                            color="danger"
                            onClick={() => handleDelete(tag.id)}
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

      <TagEditModal
        isOpen={isModalOpen}
        onOpenChange={setIsModalOpen}
        tag={editingTag}
        onSave={handleSave}
      />
    </>
  );
}

interface TagEditModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tag: NodeTagApiItem | null;
  onSave: (data: NodeTagMutationPayload) => void;
}

function TagEditModal({
  isOpen,
  onOpenChange,
  tag,
  onSave,
}: TagEditModalProps) {
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6b7280");

  useEffect(() => {
    if (tag) {
      setName(tag.name);
      setColor(tag.color);
    } else {
      setName("");
      setColor("#6b7280");
    }
  }, [tag, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("标签名称不能为空");
      return;
    }
    onSave({ name, color });
  };

  const presetColors = [
    "#6b7280", "#ef4444", "#22c55e", "#f59e0b",
    "#3b82f6", "#8b5cf6", "#ec4899", "#06b6d4",
  ];

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <ModalContent>
        <form onSubmit={handleSubmit}>
          <ModalHeader>
            {tag ? "编辑标签" : "创建标签"}
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  标签名称 *
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="输入标签名称"
                  required
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
