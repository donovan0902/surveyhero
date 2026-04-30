"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TranscriptMessage } from "./TranscriptMessage";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranscriptEntry, AgentStatus } from "./RespondShell";

interface ConversationTranscriptProps {
  transcript: TranscriptEntry[];
  status: AgentStatus;
  className?: string;
}

export function ConversationTranscript({
  transcript,
  status,
  className,
}: ConversationTranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  return (
    <ScrollArea className={cn("px-4", className)}>
      <div className="mx-auto max-w-2xl py-6 flex flex-col gap-4">
        {transcript.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <div className="rounded-full bg-muted p-4">
              <Mic className="size-8 text-muted-foreground/50" />
            </div>
            <p className="text-sm text-muted-foreground">
              Press the microphone to start your conversation.
            </p>
          </div>
        ) : (
          transcript.map((entry) => (
            <TranscriptMessage key={entry.id} entry={entry} />
          ))
        )}

        {status === "processing" && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 items-center gap-1 rounded-2xl rounded-tl-sm bg-muted px-4">
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
              <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
