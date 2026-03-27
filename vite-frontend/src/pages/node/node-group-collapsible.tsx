import type { NodeGroupApiItem, NodeTagApiItem } from "@/api/types";

import { useState } from "react";
import { ChevronDown, ChevronRight, Settings, Trash2 } from "lucide-react";

import { Card, CardBody, CardHeader } from "@/shadcn-bridge/heroui/card";
import { Button } from "@/shadcn-bridge/heroui/button";
import { Chip } from "@/shadcn-bridge/heroui/chip";

interface NodeGroupCollapsibleProps {
  group: NodeGroupApiItem | null;
  nodes: any[];
  tags?: NodeTagApiItem[];
  defaultExpanded?: boolean;
  onEditGroup?: () => void;
  onDeleteGroup?: () => void;
  onNodeClick?: (nodeId: number) => void;
  children: (node: any) => React.ReactNode;
}

export function NodeGroupCollapsible({
  group,
  nodes,
  tags,
  defaultExpanded = true,
  onEditGroup,
  onDeleteGroup,
  onNodeClick,
  children,
}: NodeGroupCollapsibleProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const groupColor = group?.color || "#6b7280";
  const groupName = group?.name || "未分组";
  const nodeCount = nodes.length;

  return (
    <Card className="mb-4 overflow-hidden">
      <CardHeader
        className="flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        style={{
          borderLeft: `4px solid ${groupColor}`,
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-500" />
          )}

          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: groupColor }}
          />

          <div className="font-semibold text-lg">{groupName}</div>

          <Chip
            className="bg-gray-100 dark:bg-gray-800"
            size="sm"
            variant="flat"
          >
            {nodeCount}
          </Chip>

          {tags && tags.length > 0 && (
            <div className="flex gap-1 ml-2">
              {tags.slice(0, 3).map((tag) => (
                <Chip
                  key={tag.id}
                  className="border"
                  size="sm"
                  style={{
                    backgroundColor: `${tag.color}20`,
                    color: tag.color,
                    borderColor: tag.color,
                  }}
                  variant="flat"
                >
                  {tag.name}
                </Chip>
              ))}
              {tags.length > 3 && (
                <Chip
                  className="bg-gray-100 dark:bg-gray-800"
                  size="sm"
                  variant="flat"
                >
                  +{tags.length - 3}
                </Chip>
              )}
            </div>
          )}
        </div>

        {group && (
          <div
            className="flex items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              isIconOnly
              size="sm"
              title="编辑分组"
              variant="flat"
              onClick={onEditGroup}
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              isIconOnly
              color="danger"
              size="sm"
              title="删除分组"
              variant="flat"
              onClick={onDeleteGroup}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        )}
      </CardHeader>

      {isExpanded && (
        <CardBody className="p-4">
          {nodes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              此分组下暂无节点
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {nodes.map((node) => (
                <div
                  key={node.id}
                  className="cursor-pointer"
                  onClick={() => onNodeClick?.(node.id)}
                >
                  {children(node)}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      )}
    </Card>
  );
}
