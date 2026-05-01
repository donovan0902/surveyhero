"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Settings2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Question } from "./BuilderShell";
import type { Id } from "@/convex/_generated/dataModel";

interface QuestionSettingsPanelProps {
  question: Question | null;
  onUpdate: (id: string, patch: Partial<Question>) => void;
}

export function QuestionSettingsPanel({
  question,
  onUpdate,
}: QuestionSettingsPanelProps) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-border bg-sidebar">
      <div className="flex items-center gap-2 px-4 py-3">
        <Settings2 className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Settings
        </span>
      </div>
      <Separator />

      {!question ? (
        <div className="flex flex-1 items-center justify-center p-6 text-center">
          <p className="text-xs text-muted-foreground">
            Select a question to edit its settings.
          </p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-6 p-4">
            <div className="flex flex-col gap-2">
              <Label className="text-xs font-semibold">Response required</Label>
              <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2.5">
                <span className="text-xs text-muted-foreground">
                  Require an answer
                </span>
                <Switch
                  checked={question.required}
                  onCheckedChange={(v) =>
                    onUpdate(question._id, { required: v })
                  }
                />
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-semibold">Follow-up behavior</Label>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                What should the agent do if the respondent gives an incomplete
                or unclear answer?
              </p>
              <Select
                value={question.followUpBehavior}
                onValueChange={(v) =>
                  onUpdate(question._id, {
                    followUpBehavior: v as Question["followUpBehavior"],
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-xs">
                    No follow-up
                  </SelectItem>
                  <SelectItem value="probe-once" className="text-xs">
                    Probe once
                  </SelectItem>
                  <SelectItem value="probe-until-answered" className="text-xs">
                    Keep probing
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Separator />

            <div className="flex flex-col gap-2">
              <Label className="text-xs font-semibold text-muted-foreground">
                Question ID
              </Label>
              <code className="rounded-md bg-muted px-2 py-1 font-mono text-[10px] text-muted-foreground break-all">
                {question._id}
              </code>
            </div>
          </div>
        </ScrollArea>
      )}
    </aside>
  );
}
