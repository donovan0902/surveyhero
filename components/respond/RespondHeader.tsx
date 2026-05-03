import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface RespondHeaderProps {
  title: string;
  currentQuestion: number;
  totalQuestions: number;
  isActive: boolean;
  className?: string;
}

export function RespondHeader({
  title,
  currentQuestion,
  totalQuestions,
  isActive,
  className,
}: RespondHeaderProps) {
  const progressPct = ((currentQuestion - 1) / totalQuestions) * 100;

  return (
    <header className={cn("shrink-0 border-b border-border bg-background/95 px-6 py-4 backdrop-blur", className)}>
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Mic className="size-4 text-primary" />
            <h1 className="text-sm font-semibold text-foreground">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
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
