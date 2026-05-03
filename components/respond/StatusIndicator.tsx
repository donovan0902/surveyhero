import { cn } from '@/lib/utils';
import type { AgentStatus } from './RespondShell';

const statusConfig: Record<AgentStatus, { label: string; dotClass: string }> = {
  'idle': {
    label: 'Ready to start',
    dotClass: 'bg-muted-foreground/40',
  },
  'connecting': {
    label: 'Connecting...',
    dotClass: 'bg-amber-400 animate-pulse',
  },
  'agent-speaking': {
    label: 'Agent is speaking...',
    dotClass: 'bg-primary animate-pulse',
  },
  'user-speaking': {
    label: 'listening...',
    dotClass: 'bg-green-500 animate-pulse',
  },
  'processing': {
    label: 'Processing...',
    dotClass: 'bg-amber-400 animate-pulse',
  },
  'error': {
    label: 'Connection error',
    dotClass: 'bg-destructive',
  },
};

interface StatusIndicatorProps {
  status: AgentStatus;
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const config = statusConfig[status];

  return (
    <div className="flex items-center gap-2 h-5">
      <span className={cn('size-2 rounded-full', config.dotClass)} />
      <span className="text-xs font-medium text-muted-foreground">{config.label}</span>
    </div>
  );
}
