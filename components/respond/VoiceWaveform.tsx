"use client";

import { cn } from "@/lib/utils";

interface VoiceWaveformProps {
  isActive: boolean;
  variant: "agent" | "respondent";
}

const bars = [
  { delay: "0ms", restHeight: "h-1.5" },
  { delay: "100ms", restHeight: "h-3" },
  { delay: "200ms", restHeight: "h-5" },
  { delay: "100ms", restHeight: "h-3" },
  { delay: "0ms", restHeight: "h-1.5" },
];

export function VoiceWaveform({ isActive, variant }: VoiceWaveformProps) {
  return (
    <div
      className="flex items-center justify-center gap-1 h-8"
      aria-hidden="true"
    >
      {bars.map((bar, i) => (
        <span
          key={i}
          className={cn(
            "w-1 rounded-full transition-all duration-300",
            variant === "respondent"
              ? "bg-primary/70"
              : "bg-muted-foreground/40",
            isActive ? "h-5" : bar.restHeight,
            isActive && "animate-pulse"
          )}
          style={
            isActive
              ? { animationDelay: bar.delay, animationDuration: "600ms" }
              : undefined
          }
        />
      ))}
    </div>
  );
}
