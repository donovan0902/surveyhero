"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Eye, Save, Send, Mic } from "lucide-react";
import Link from "next/link";
import { AuthStatus } from "@/components/AuthStatus";

interface BuilderTopBarProps {
  title: string;
  onTitleChange: (title: string) => void;
  surveyId: string;
}

export function BuilderTopBar({
  title,
  onTitleChange,
  surveyId,
}: BuilderTopBarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur z-20">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Mic className="size-4 text-primary" />
        <span className="text-sm font-semibold tracking-tight text-foreground">
          SurveyHero
        </span>
      </div>

      <Separator orientation="vertical" className="h-5" />

      <Input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        className="h-8 w-64 border-transparent bg-transparent text-sm font-medium shadow-none hover:border-border focus:border-border focus-visible:ring-0"
        placeholder="Survey title..."
      />

      <Badge variant="secondary" className="ml-1 text-xs">
        Draft
      </Badge>

      <div className="flex-1" />

      <Link href={`/surveys/${surveyId}/respond`} target="_blank">
        <Button variant="outline" size="sm" className="gap-1.5">
          <Eye className="size-3.5" />
          Preview
        </Button>
      </Link>
      <Button variant="outline" size="sm" className="gap-1.5">
        <Save className="size-3.5" />
        Save
      </Button>
      <Button size="sm" className="gap-1.5">
        <Send className="size-3.5" />
        Publish
      </Button>

      <Separator orientation="vertical" className="h-5" />
      <AuthStatus />
    </header>
  );
}
