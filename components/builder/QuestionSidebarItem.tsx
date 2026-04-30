"use client";

import { GripVertical, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Question, QuestionType } from "./BuilderShell";

const typeLabels: Record<QuestionType, string> = {
  "open-ended": "Open",
  closed: "Closed",
  rating: "Rating",
  "yes-no": "Yes/No",
};

interface QuestionSidebarItemProps {
  question: Question;
  index: number;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export function QuestionSidebarItem({
  question,
  index,
  isSelected,
  onSelect,
  onDelete,
}: QuestionSidebarItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className={cn(
        "group flex cursor-pointer items-start gap-2 rounded-md px-2 py-2.5 text-sm transition-colors",
        isSelected
          ? "bg-accent text-accent-foreground"
          : "text-foreground hover:bg-accent/60"
      )}
    >
      <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/50 cursor-grab" />

      <span className="mt-0.5 text-xs font-mono font-medium text-muted-foreground w-4 shrink-0">
        {index + 1}
      </span>

      <div className="flex-1 min-w-0">
        <p className="truncate text-xs font-medium leading-snug">
          {question.prompt ? (
            question.prompt
          ) : (
            <span className="italic text-muted-foreground">No prompt yet</span>
          )}
        </p>
        <div className="mt-1 flex items-center gap-1">
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
            {typeLabels[question.type]}
          </Badge>
          {question.required && (
            <span className="text-[10px] text-muted-foreground">Required</span>
          )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="icon-xs"
        className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        aria-label="Delete question"
      >
        <Trash2 className="size-3" />
      </Button>
    </div>
  );
}
