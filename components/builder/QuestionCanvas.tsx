'use client';

import { useState } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Mic, Info, X } from 'lucide-react';
import { QuestionTypeSelector } from './QuestionTypeSelector';
import { EmptyCanvas } from './EmptyCanvas';
import type { Question } from './BuilderShell';
import type { Id } from '@/convex/_generated/dataModel';
import { useDebouncedCallback } from '@/lib/useDebouncedCallback';

interface QuestionCanvasProps {
  question: Question | null;
  onUpdate: (id: Id<'questions'>, patch: Partial<Question>) => void;
}

export function QuestionCanvas({ question, onUpdate }: QuestionCanvasProps) {
  if (!question) return <EmptyCanvas />;
  return <QuestionCanvasInner key={question._id} question={question} onUpdate={onUpdate} />;
}

function QuestionCanvasInner({
  question,
  onUpdate,
}: {
  question: Question;
  onUpdate: (id: Id<'questions'>, patch: Partial<Question>) => void;
}) {
  const [prompt, setPrompt] = useState(question.prompt);
  const [description, setDescription] = useState(question.description ?? '');
  const [options, setOptions] = useState<string[]>(question.options ?? ['']);

  const debouncedSavePrompt = useDebouncedCallback((value: string) => {
    onUpdate(question._id, { prompt: value });
  }, 400);
  const debouncedSaveDescription = useDebouncedCallback((value: string) => {
    onUpdate(question._id, { description: value });
  }, 400);
  const debouncedSaveOptions = useDebouncedCallback((value: string[]) => {
    onUpdate(question._id, { options: value });
  }, 400);

  const removeOption = (index: number) => {
    const next = options.filter((_, optionIndex) => optionIndex !== index);
    const safeNext = next.length > 0 ? next : [''];
    setOptions(safeNext);
    onUpdate(question._id, { options: safeNext });
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/30">
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-2xl px-8 py-10">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                Q{question.order}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              {question.required ? (
                <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                  Required
                </Badge>
              ) : null}
              <QuestionTypeSelector
                value={question.type}
                onChange={(type) => onUpdate(question._id, { type })}
              />
            </div>
          </div>

          <Card className="mb-4 border-border shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center gap-2">
                <Mic className="size-4 text-primary" />
                <CardTitle className="text-sm font-semibold">Agent prompt</CardTitle>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                This is the exact script the voice agent will speak aloud to the respondent.
              </p>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <Textarea
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  debouncedSavePrompt(e.target.value);
                }}
                placeholder='e.g. "On a scale of 1 to 10, how satisfied were you with your experience today?"'
                className="min-h-30 resize-y text-sm leading-relaxed"
              />
            </CardContent>
          </Card>

          <Card className="mb-4 border-border shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <div className="flex items-center gap-2">
                <Info className="size-4 text-muted-foreground" />
                <CardTitle className="text-sm font-semibold">Agent guidance</CardTitle>
                <Badge variant="secondary" className="text-[10px]">
                  Optional
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Private notes for the agent — context, edge cases, what counts as a complete answer.
              </p>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <Textarea
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  debouncedSaveDescription(e.target.value);
                }}
                placeholder='e.g. "Accept any number. If they hesitate, remind them there are no wrong answers."'
                className="min-h-20 resize-y text-sm text-muted-foreground"
              />
            </CardContent>
          </Card>

          {question.type === 'closed' && (
            <Card className="border-border shadow-sm">
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold">Answer options</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  List the specific answers the agent should accept.
                </p>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div className="flex flex-col gap-2">
                  {options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground w-4">{i + 1}.</span>
                      <Input
                        value={opt}
                        onChange={(e) => {
                          const next = [...options];
                          next[i] = e.target.value;
                          setOptions(next);
                          debouncedSaveOptions(next);
                        }}
                        className="h-8 text-sm"
                        placeholder={`Option ${i + 1}`}
                      />
                      <button
                        type="button"
                        onClick={() => removeOption(i)}
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        aria-label={`Remove option ${i + 1}`}
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...options, ''];
                      setOptions(next);
                      onUpdate(question._id, { options: next });
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
