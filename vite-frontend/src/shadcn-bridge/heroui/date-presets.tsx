import { Button } from "@/shadcn-bridge/heroui/button";
import type { DatePreset } from "@/utils/date";
import { calculateDateFromPreset } from "@/utils/date";

export interface DatePresetsProps {
  presets?: DatePreset[];
  onChange: (timestamp: number) => void;
  className?: string;
}

export function DatePresets({
  presets,
  onChange,
  className,
}: DatePresetsProps) {
  const presetList = presets || [
    { label: "1 周后", offsetDays: 7 },
    { label: "1 月后", offsetDays: 30 },
    { label: "半年后", offsetDays: 180 },
    { label: "1 年后", offsetDays: 365 },
    { label: "3 年后", offsetDays: 1095 },
    { label: "永久", value: 0 },
  ];

  return (
    <div className={`flex flex-wrap gap-2 ${className || ""}`}>
      {presetList.map((preset) => (
        <Button
          key={preset.label}
          className="text-xs"
          color="primary"
          size="sm"
          variant="bordered"
          onPress={() => {
            const timestamp = calculateDateFromPreset(preset);
            onChange(timestamp);
          }}
        >
          {preset.label}
        </Button>
      ))}
    </div>
  );
}
