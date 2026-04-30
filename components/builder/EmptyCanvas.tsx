import { Mic, MousePointerClick } from "lucide-react";

export function EmptyCanvas() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 bg-muted/30 text-center">
      <div className="rounded-full border-2 border-dashed border-border p-6">
        <Mic className="size-10 text-muted-foreground/40" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-foreground">
          No question selected
        </p>
        <p className="text-xs text-muted-foreground flex items-center gap-1 justify-center">
          <MousePointerClick className="size-3.5" />
          Click a question in the sidebar, or add a new one.
        </p>
      </div>
    </main>
  );
}
