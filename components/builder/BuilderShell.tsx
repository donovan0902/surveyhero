'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { SidebarProvider } from '@/components/ui/sidebar';
import type { Doc, Id } from '@/convex/_generated/dataModel';
import { BuilderTopBar } from './BuilderTopBar';
import { QuestionSidebar } from './QuestionSidebar';
import { QuestionCanvas } from './QuestionCanvas';
import { QuestionSettingsPanel } from './QuestionSettingsPanel';

export type QuestionType = Doc<'questions'>['type'];
export type Question = Doc<'questions'>;
export type SaveStatus = 'saving' | 'saved';

interface BuilderShellProps {
  surveyId: string;
}

export function BuilderShell({ surveyId: rawId }: BuilderShellProps) {
  const surveyId = rawId as Id<'surveys'>;

  const survey = useQuery(api.surveys.get, { surveyId });
  const questions = useQuery(api.questions.listForSurvey, { surveyId });

  const updateTitle = useMutation(api.surveys.updateTitle);
  const updateStatus = useMutation(api.surveys.updateStatus);
  const createQuestion = useMutation(api.questions.create);
  const updateQuestionMutation = useMutation(api.questions.update);
  const removeQuestion = useMutation(api.questions.remove);
  const reorderQuestionsMutation = useMutation(api.questions.reorder);

  const [selectedId, setSelectedId] = useState<Id<'questions'> | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const track = useCallback(<T,>(promise: Promise<T>): Promise<T> => {
    setPendingCount((n) => n + 1);
    return promise.finally(() => setPendingCount((n) => n - 1));
  }, []);

  const selectedQuestion = questions?.find((q) => q._id === selectedId) ?? null;

  const handleTitleChange = useCallback(
    (title: string) => {
      void track(updateTitle({ surveyId, title }));
    },
    [surveyId, updateTitle, track],
  );

  const handleStatusChange = useCallback(
    async (status: Doc<'surveys'>['status']) => {
      await track(updateStatus({ surveyId, status }));
    },
    [surveyId, updateStatus, track],
  );

  const addQuestion = useCallback(async () => {
    const newId = await track(
      createQuestion({
        surveyId,
        prompt: '',
        type: 'open-ended',
      }),
    );
    setSelectedId(newId);
  }, [surveyId, createQuestion, track]);

  const updateQuestion = useCallback(
    (id: Id<'questions'>, patch: Partial<Doc<'questions'>>) => {
      void track(
        updateQuestionMutation({
          questionId: id,
          prompt: patch.prompt,
          description: patch.description,
          type: patch.type,
          options: patch.options,
          required: patch.required,
          followUpBehavior: patch.followUpBehavior,
        }),
      );
    },
    [updateQuestionMutation, track],
  );

  const deleteQuestion = useCallback(
    (id: Id<'questions'>) => {
      if (selectedId === id) {
        const idx = questions?.findIndex((q) => q._id === id) ?? -1;
        const fallback = questions?.[idx + 1] ?? questions?.[idx - 1] ?? null;
        setSelectedId(fallback?._id ?? null);
      }
      void track(removeQuestion({ questionId: id }));
    },
    [removeQuestion, selectedId, questions, track],
  );

  const reorderQuestions = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (!questions) return;
      const next = [...questions];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      void track(
        reorderQuestionsMutation({
          surveyId,
          orderedIds: next.map((q) => q._id),
        }),
      );
    },
    [surveyId, questions, reorderQuestionsMutation, track],
  );

  if (survey === undefined || questions === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (survey === null) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-2 bg-background text-center">
        <p className="text-sm font-medium">Survey not found</p>
        <p className="text-xs text-muted-foreground">It may have been deleted, or you may not have access.</p>
        <Link href="/" className="mt-2 text-xs text-primary underline">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <BuilderTopBar
        survey={survey}
        questionCount={questions.length}
        saveStatus={pendingCount > 0 ? 'saving' : 'saved'}
        onTitleChange={handleTitleChange}
        onStatusChange={handleStatusChange}
      />
      <SidebarProvider className="min-h-0 flex-1 overflow-hidden">
        <QuestionSidebar
          questions={questions}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={addQuestion}
          onDelete={deleteQuestion}
          onReorder={reorderQuestions}
        />
        <QuestionCanvas question={selectedQuestion} onUpdate={updateQuestion} />
        <QuestionSettingsPanel question={selectedQuestion} onUpdate={updateQuestion} />
      </SidebarProvider>
    </div>
  );
}
