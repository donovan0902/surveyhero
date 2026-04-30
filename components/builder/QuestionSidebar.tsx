"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Plus } from "lucide-react";
import { QuestionSidebarItem } from "./QuestionSidebarItem";
import type { Question } from "./BuilderShell";

interface QuestionSidebarProps {
  questions: Question[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onDelete: (id: string) => void;
  onReorder: (from: number, to: number) => void;
}

export function QuestionSidebar({
  questions,
  selectedId,
  onSelect,
  onAdd,
  onDelete,
}: QuestionSidebarProps) {
  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Questions
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onAdd}
          aria-label="Add question"
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      <Separator />
      <ScrollArea className="flex-1 px-2 py-2">
        {questions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="rounded-full bg-muted p-3">
              <Plus className="size-5 text-muted-foreground" />
            </div>
            <p className="text-xs text-muted-foreground">
              No questions yet.
              <br />
              Click + to add one.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {questions.map((q, index) => (
              <QuestionSidebarItem
                key={q.id}
                question={q}
                index={index}
                isSelected={q.id === selectedId}
                onSelect={() => onSelect(q.id)}
                onDelete={() => onDelete(q.id)}
              />
            ))}
          </div>
        )}
      </ScrollArea>
      <Separator />
      <div className="p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-muted-foreground"
          onClick={onAdd}
        >
          <Plus className="size-3.5" />
          Add question
        </Button>
      </div>
    </aside>
  );
}
