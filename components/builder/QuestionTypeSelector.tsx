"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { QuestionType } from "./BuilderShell";

const options: {
  value: QuestionType;
  label: string;
  description: string;
}[] = [
  {
    value: "open-ended",
    label: "Open-ended",
    description: "Agent accepts any spoken answer",
  },
  {
    value: "closed",
    label: "Closed",
    description: "Agent expects one of specific options",
  },
  {
    value: "rating",
    label: "Rating",
    description: "Agent expects a numeric scale response",
  },
  {
    value: "yes-no",
    label: "Yes / No",
    description: "Binary answer only",
  },
];

interface QuestionTypeSelectorProps {
  value: QuestionType;
  onChange: (value: QuestionType) => void;
}

export function QuestionTypeSelector({
  value,
  onChange,
}: QuestionTypeSelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as QuestionType)}>
      <SelectTrigger className="h-7 w-36 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value} className="text-xs">
            <div>
              <div className="font-medium">{opt.label}</div>
              <div className="text-muted-foreground text-[10px]">
                {opt.description}
              </div>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
