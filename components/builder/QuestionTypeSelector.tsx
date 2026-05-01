"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { ChevronDown } from "lucide-react";
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
  const selectedOption = options.find((option) => option.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 w-36 justify-between px-2 text-xs font-normal"
        >
          <span className="truncate">{selectedOption?.label ?? "Select type"}</span>
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(nextValue) => onChange(nextValue as QuestionType)}
        >
          {options.map((opt) => (
            <DropdownMenuRadioItem
              key={opt.value}
              value={opt.value}
              className="items-start gap-2 py-2 text-xs"
            >
              <div className="pr-4">
                <div className="font-medium">{opt.label}</div>
                <div className="text-[10px] text-muted-foreground">
                  {opt.description}
                </div>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
