import { cn } from "@/lib/utils";
import { Mic, Bot } from "lucide-react";
import type { TranscriptEntry } from "./RespondShell";

interface TranscriptMessageProps {
  entry: TranscriptEntry;
}

export function TranscriptMessage({ entry }: TranscriptMessageProps) {
  const isAgent = entry.role === "agent";

  return (
    <div
      className={cn(
        "flex items-end gap-2",
        isAgent ? "justify-start" : "justify-end"
      )}
    >
      {isAgent && (
        <div className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Bot className="size-3.5 text-primary" />
        </div>
      )}

      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isAgent
            ? "rounded-tl-sm bg-muted text-foreground"
            : "rounded-tr-sm bg-primary text-primary-foreground"
        )}
      >
        <p>{entry.text}</p>
        <time
          className={cn(
            "mt-1 block text-[10px]",
            isAgent
              ? "text-muted-foreground"
              : "text-primary-foreground/60"
          )}
        >
          {entry.timestamp.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </time>
      </div>

      {!isAgent && (
        <div className="mb-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
          <Mic className="size-3.5 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
