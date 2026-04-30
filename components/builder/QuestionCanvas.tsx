"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, Info } from "lucide-react";
import { QuestionTypeSelector } from "./QuestionTypeSelector";
import { EmptyCanvas } from "./EmptyCanvas";
import type { Question } from "./BuilderShell";

interface QuestionCanvasProps {
  question: Question | null;
  onUpdate: (id: string, patch: Partial<Question>) => void;
}

export function QuestionCanvas({ question, onUpdate }: QuestionCanvasProps) {
  if (!question) return <EmptyCanvas />;

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-muted/30">
      <ScrollArea className="flex-1">
        <div className="mx-auto max-w-2xl px-8 py-10">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                Q{question.order}
              </Badge>
              <span className="text-xs text-muted-foreground">Voice prompt</span>
            </div>
            <QuestionTypeSelector
              value={question.type}
              onChange={(type) => onUpdate(question.id, { type })}
            />
          </div>

          <Card className="mb-4 border-border shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center gap-2">
                <Mic className="size-4 text-primary" />
                <CardTitle className="text-sm font-semibold">
                  Agent prompt
                </CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                This is the exact script the voice agent will speak aloud to the
                respondent.
              </p>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <Textarea
                value={question.prompt}
                onChange={(e) =>
                  onUpdate(question.id, { prompt: e.target.value })
                }
                placeholder='e.g. "On a scale of 1 to 10, how satisfied were you with your experience today?"'
                className="min-h-[120px] resize-y text-sm leading-relaxed"
              />
            </CardContent>
          </Card>

          <Card className="mb-4 border-border shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center gap-2">
                <Info className="size-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">
                  Agent guidance
                </CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  Optional
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Private notes for the agent — context, edge cases, what counts
                as a complete answer.
              </p>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <Textarea
                value={question.description ?? ""}
                onChange={(e) =>
                  onUpdate(question.id, { description: e.target.value })
                }
                placeholder='e.g. "Accept any number. If they hesitate, remind them there are no wrong answers."'
                className="min-h-[80px] resize-y text-sm text-muted-foreground"
              />
            </CardContent>
          </Card>

          {question.type === "closed" && (
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold">
                  Answer options
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  List the specific answers the agent should accept.
                </p>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="flex flex-col gap-2">
                  {(question.options ?? [""]).map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground w-4">
                        {i + 1}.
                      </span>
                      <Input
                        value={opt}
                        onChange={(e) => {
                          const next = [...(question.options ?? [""])];
                          next[i] = e.target.value;
                          onUpdate(question.id, { options: next });
                        }}
                        className="h-8 text-sm"
                        placeholder={`Option ${i + 1}`}
                      />
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...(question.options ?? [""]), ""];
                      onUpdate(question.id, { options: next });
                    }}
                    className="mt-1 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    + Add option
                  </button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </main>
  );
}
