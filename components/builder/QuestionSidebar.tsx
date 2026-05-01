"use client";

import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Plus } from "lucide-react";
import { QuestionSidebarItem } from "./QuestionSidebarItem";
import type { Question } from "./BuilderShell";
import type { Id } from "@/convex/_generated/dataModel";

interface QuestionSidebarProps {
  questions: Question[];
  selectedId: Id<"questions"> | null;
  onSelect: (id: Id<"questions">) => void;
  onAdd: () => void;
  onDelete: (id: Id<"questions">) => void;
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
    <Sidebar
      collapsible="none"
      className="w-72 shrink-0 border-r border-border"
    >
      <SidebarHeader className="flex-row items-center justify-between px-4 py-3">
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
      </SidebarHeader>
      <SidebarSeparator />
      <SidebarContent>
        {questions.length === 0 ? (
          <SidebarGroup className="flex flex-1 items-center justify-center px-2 py-12">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="rounded-full bg-muted p-3">
                <Plus className="size-5 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                No questions yet.
                <br />
                Click + to add one.
              </p>
            </div>
          </SidebarGroup>
        ) : (
          <SidebarGroup className="gap-1 px-2 py-2">
            {questions.map((q, index) => (
              <QuestionSidebarItem
                key={q._id}
                question={q}
                index={index}
                isSelected={q._id === selectedId}
                onSelect={() => onSelect(q._id)}
                onDelete={() => onDelete(q._id)}
              />
            ))}
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarSeparator />
      <SidebarFooter className="p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 text-muted-foreground"
          onClick={onAdd}
        >
          <Plus className="size-3.5" />
          Add question
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
