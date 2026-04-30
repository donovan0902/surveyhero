"use client";

import { MicButton } from "./MicButton";
import { VoiceWaveform } from "./VoiceWaveform";
import { StatusIndicator } from "./StatusIndicator";
import { Separator } from "@/components/ui/separator";
import type { AgentStatus } from "./RespondShell";

interface VoiceControlPanelProps {
  status: AgentStatus;
  onStart: () => void;
  onStop: () => void;
}

export function VoiceControlPanel({
  status,
  onStart,
  onStop,
}: VoiceControlPanelProps) {
  const isActive = status !== "idle";

  return (
    <div className="shrink-0 border-t border-border bg-background/98 backdrop-blur">
      <Separator />
      <div className="mx-auto max-w-2xl px-6 py-6">
        <div className="flex flex-col items-center gap-5">
          <StatusIndicator status={status} />

          <MicButton
            status={status}
            onPress={isActive ? onStop : onStart}
          />

          <VoiceWaveform
            isActive={
              status === "agent-speaking" || status === "user-speaking"
            }
            variant={status === "user-speaking" ? "respondent" : "agent"}
          />

          {status === "idle" && (
            <p className="text-xs text-muted-foreground text-center">
              Tap the microphone to begin — speak naturally when it&apos;s your
              turn.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
