"use client";

import { useState } from "react";
import { useMutation, useAction } from "convex/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, FilePlus, Mic, Send, Loader2 } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AuthStatus } from "@/components/AuthStatus";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { useDebouncedCallback } from "@/lib/useDebouncedCallback";
import type { SaveStatus } from "./BuilderShell";

interface BuilderTopBarProps {
  survey: Doc<"surveys">;
  questionCount: number;
  saveStatus: SaveStatus;
  onTitleChange: (title: string) => void;
  onStatusChange: (status: Doc<"surveys">["status"]) => Promise<void>;
}

export function BuilderTopBar({
  survey,
  questionCount,
  saveStatus,
  onTitleChange,
  onStatusChange,
}: BuilderTopBarProps) {
  const router = useRouter();
  const createSurvey = useMutation(api.surveys.create);
  const syncAgent = useAction(api.elevenlabs.syncAgentForSurvey);

  const [titleDraft, setTitleDraft] = useState(survey.title);
  const [publishState, setPublishState] = useState<"idle" | "busy">("idle");
  const [publishError, setPublishError] = useState<string | null>(null);

  const debouncedSaveTitle = useDebouncedCallback((value: string) => {
    onTitleChange(value);
  }, 400);

  const isPublished = survey.status === "published";
  const canPreview = isPublished;
  const canPublish = questionCount > 0;

  async function handlePublish() {
    if (publishState === "busy") return;
    setPublishError(null);
    setPublishState("busy");
    try {
      if (isPublished) {
        await onStatusChange("draft");
      } else {
        await syncAgent({ surveyId: survey._id });
        await onStatusChange("published");
      }
    } catch (err) {
      setPublishError(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishState("idle");
    }
  }

  async function handleNewSurvey() {
    const newId = await createSurvey({ title: "Untitled survey" });
    router.push(`/surveys/${newId}/edit`);
  }

  return (
    <header className="relative flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background/95 px-4 backdrop-blur z-20">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Mic className="size-4 text-primary" />
        <span className="text-sm font-semibold tracking-tight text-foreground">
          SurveyHero
        </span>
      </div>

      <Separator orientation="vertical" className="h-5" />

      <Input
        value={titleDraft}
        onChange={(e) => {
          setTitleDraft(e.target.value);
          debouncedSaveTitle(e.target.value);
        }}
        className="h-8 w-64 border-transparent bg-transparent text-sm font-medium shadow-none hover:border-border focus:border-border focus-visible:ring-0"
        placeholder="Survey title..."
      />

      <Badge
        variant={isPublished ? "default" : "secondary"}
        className="ml-1 text-xs capitalize"
      >
        {survey.status}
      </Badge>

      <span
        className="text-xs text-muted-foreground"
        aria-live="polite"
        aria-atomic="true"
      >
        {saveStatus === "saving" ? "Saving…" : "Saved"}
      </span>

      <Button
        variant="ghost"
        size="sm"
        onClick={handleNewSurvey}
        className="gap-1.5 text-muted-foreground"
      >
        <FilePlus className="size-3.5" />
        New
      </Button>

      <div className="flex-1" />

      {canPreview ? (
        <Link href={`/surveys/${survey._id}/respond`} target="_blank">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Eye className="size-3.5" />
            Preview
          </Button>
        </Link>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled
          title="Publish first to preview"
        >
          <Eye className="size-3.5" />
          Preview
        </Button>
      )}

      <Button
        size="sm"
        variant={isPublished ? "outline" : "default"}
        onClick={handlePublish}
        disabled={publishState === "busy" || (!isPublished && !canPublish)}
        title={
          !isPublished && !canPublish
            ? "Add at least one question before publishing"
            : undefined
        }
        className="gap-1.5"
      >
        {publishState === "busy" ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Send className="size-3.5" />
        )}
        {publishState === "busy"
          ? isPublished
            ? "Unpublishing…"
            : "Publishing…"
          : isPublished
            ? "Unpublish"
            : "Publish"}
      </Button>

      <Separator orientation="vertical" className="h-5" />
      <AuthStatus />

      {publishError && (
        <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2 rounded border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs text-destructive shadow-sm">
          {publishError}
        </div>
      )}
    </header>
  );
}
