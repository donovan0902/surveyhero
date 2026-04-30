'use client';

import { Mic, MicOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AgentStatus } from './RespondShell';

interface MicButtonProps {
  status: AgentStatus;
  onPress: () => void;
}

export function MicButton({ status, onPress }: MicButtonProps) {
  const isListening = status === 'user-speaking';
  const isProcessing = status === 'processing' || status === 'connecting';
  const isAgentSpeaking = status === 'agent-speaking';
  const isDisabled = isProcessing;
  const isActiveSession =
    status === 'agent-speaking' || status === 'user-speaking' || status === 'processing' || status === 'connecting';

  return (
    <div className="relative flex items-center justify-center">
      {isListening && (
        <>
          <span className="absolute inline-flex size-28 animate-ping rounded-full bg-primary/15 duration-1000" />
          <span className="absolute inline-flex size-20 animate-ping rounded-full bg-primary/20 animation-duration-[700ms]" />
        </>
      )}

      {isAgentSpeaking && (
        <span className="absolute inline-flex size-24 animate-pulse rounded-full bg-muted-foreground/10" />
      )}

      <button
        onClick={isDisabled ? undefined : onPress}
        aria-label={isActiveSession ? 'End conversation' : 'Start conversation'}
        disabled={isDisabled}
        className={cn(
          'relative z-10 flex size-16 items-center justify-center rounded-full shadow-lg transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring',
          isListening && 'bg-primary text-primary-foreground scale-110 shadow-primary/30',
          isProcessing && 'bg-muted text-muted-foreground cursor-wait',
          isAgentSpeaking && 'bg-muted text-muted-foreground hover:bg-muted/80',
          !isListening &&
            !isProcessing &&
            !isAgentSpeaking &&
            'bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 active:scale-95',
        )}
      >
        {isProcessing ? (
          <Loader2 className="size-6 animate-spin" />
        ) : isActiveSession ? (
          <MicOff className="size-6" />
        ) : (
          <Mic className="size-6" />
        )}
      </button>
    </div>
  );
}
