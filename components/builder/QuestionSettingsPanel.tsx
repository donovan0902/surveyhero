"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, Settings2 } from "lucide-react";
import type { Question } from "./BuilderShell";

const followUpOptions: {
  value: Question["followUpBehavior"];
  label: string;
  description: string;
}[] = [
  {
    value: "none",
    label: "No follow-up",
    description: "Move on without asking again",
  },
  {
    value: "probe-once",
    label: "Probe once",
    description: "Ask one clarifying follow-up",
  },
  {
    value: "probe-until-answered",
    label: "Keep probing",
    description: "Continue until the question is answered",
  },
];

interface QuestionSettingsPanelProps {
  question: Question | null;
  onUpdate: (id: Question["_id"], patch: Partial<Question>) => void;
}

export function QuestionSettingsPanel({
  question,
  onUpdate,
}: QuestionSettingsPanelProps) {
  const selectedFollowUp = question
    ? followUpOptions.find((option) => option.value === question.followUpBehavior)
    : null;

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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-8 w-full justify-between px-2.5 text-xs font-normal"
                  >
                    <span className="truncate">
                      {selectedFollowUp?.label ?? "Select behavior"}
                    </span>
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuRadioGroup
                    value={question.followUpBehavior}
                    onValueChange={(nextValue) =>
                      onUpdate(question._id, {
                        followUpBehavior: nextValue as Question["followUpBehavior"],
                      })
                    }
                  >
                    {followUpOptions.map((option) => (
                      <DropdownMenuRadioItem
                        key={option.value}
                        value={option.value}
                        className="items-start gap-2 py-2 text-xs"
                      >
                        <div className="pr-4">
                          <div className="font-medium">{option.label}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {option.description}
                          </div>
                        </div>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
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
