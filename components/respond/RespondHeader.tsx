import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface RespondHeaderProps {
  title: string;
  currentQuestion: number;
  totalQuestions: number;
  isActive: boolean;
  badgeLabel?: string;
  badgeTooltip?: string;
  className?: string;
}

export function RespondHeader({
  title,
  currentQuestion,
  totalQuestions,
  isActive,
  badgeLabel,
  badgeTooltip,
  className,
}: RespondHeaderProps) {
  const progressPct = ((currentQuestion - 1) / totalQuestions) * 100;

  return (
    <header className={cn("shrink-0 border-b border-border bg-background/95 px-6 py-4 backdrop-blur", className)}>
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex min-w-0 items-center gap-2">
            <Mic className="size-4 shrink-0 text-primary" />
            <div className="flex min-w-0 items-center gap-2">
              <h1 className="truncate text-sm font-semibold text-foreground">{title}</h1>
              {badgeLabel && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="shrink-0 cursor-help border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/30 dark:text-amber-400"
                      >
                        {badgeLabel}
                      </Badge>
                    </TooltipTrigger>
                    {badgeTooltip ? (
                      <TooltipContent side="bottom" sideOffset={6}>
                        <p>{badgeTooltip}</p>
                      </TooltipContent>
                    ) : null}
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
          <div className="ml-4 flex shrink-0 items-center gap-2">
            {isActive && (
              <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                Live session
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {currentQuestion} of {totalQuestions}
            </span>
          </div>
        </div>
        <Progress value={progressPct} className="h-1.5 bg-muted" />
      </div>
    </header>
  );
}
