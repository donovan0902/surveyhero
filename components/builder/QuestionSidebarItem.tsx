'use client';

import type { DragEvent } from 'react';
import { GripVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { Question, QuestionType } from './BuilderShell';

const typeLabels: Record<QuestionType, string> = {
  'open-ended': 'Open',
  'closed': 'Closed',
  'rating': 'Rating',
  'yes-no': 'Yes/No',
};

interface QuestionSidebarItemProps {
  question: Question;
  index: number;
  isSelected: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragOver: (e: DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}

export function QuestionSidebarItem({
  question,
  index,
  isSelected,
  isDragging,
  isDragOver,
  onSelect,
  onDelete,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: QuestionSidebarItemProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onClick={onSelect}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(index));
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        onDragOver(e);
      }}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-2.5 text-sm transition-colors',
        isSelected ? 'bg-accent text-accent-foreground' : 'text-foreground hover:bg-accent/60',
        isDragging && 'opacity-50',
        isDragOver && 'ring-1 ring-primary/50',
      )}
    >
      <GripVertical className="size-3.5 shrink-0 cursor-grab text-muted-foreground/50" />

      <span className="w-4 shrink-0 text-xs font-mono font-medium text-muted-foreground">
        {index + 1}
      </span>

      <p className="flex-1 truncate text-xs font-medium leading-none">
        {question.prompt ? question.prompt : <span className="italic text-muted-foreground">No prompt yet</span>}
      </p>

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
