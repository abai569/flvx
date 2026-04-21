import type { NodeTagApiItem } from "@/api/types";

import { useState } from "react";

import { Chip } from "@/shadcn-bridge/heroui/chip";

interface NodeTagSelectorProps {
  availableTags: NodeTagApiItem[];
  selectedTagIds: number[];
  onChange: (tagIds: number[]) => void;
}

export function NodeTagSelector({
  availableTags,
  selectedTagIds,
  onChange,
}: NodeTagSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedTags = availableTags.filter((tag) =>
    selectedTagIds.includes(tag.id),
  );

  const availableTagsForSelection = availableTags.filter(
    (tag) => !selectedTagIds.includes(tag.id),
  );

  const handleAddTag = (tagId: number) => {
    onChange([...selectedTagIds, tagId]);
  };

  const handleRemoveTag = (tagId: number) => {
    onChange(selectedTagIds.filter((id) => id !== tagId));
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-2">
        {selectedTags.map((tag) => (
          <Chip
            key={tag.id}
            size="sm"
            style={{
              backgroundColor: `${tag.color}20`,
              color: tag.color,
            }}
            variant="flat"
          >
            {tag.name}
            <button
              className="ml-1 hover:opacity-70"
              type="button"
              onClick={() => handleRemoveTag(tag.id)}
            >
              ×
            </button>
          </Chip>
        ))}

        <button
          className="px-2 py-1 text-sm border border-dashed border-gray-300 rounded hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:hover:border-gray-600 dark:hover:bg-gray-800 transition-colors"
          type="button"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? "取消" : "+ 添加标签"}
        </button>
      </div>

      {isOpen && availableTagsForSelection.length > 0 && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
          <div className="flex flex-wrap gap-2">
            {availableTagsForSelection.map((tag) => (
              <Chip
                key={tag.id}
                className="cursor-pointer hover:opacity-80"
                size="sm"
                style={{
                  backgroundColor: `${tag.color}20`,
                  color: tag.color,
                }}
                variant="flat"
                onClick={() => {
                  handleAddTag(tag.id);
                }}
              >
                {tag.name}
              </Chip>
            ))}
          </div>
        </div>
      )}

      {isOpen && availableTagsForSelection.length === 0 && (
        <div className="absolute top-full left-0 mt-1 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50">
          <div className="text-sm text-gray-500 px-2 py-1">
            没有更多标签可用
          </div>
        </div>
      )}
    </div>
  );
}
