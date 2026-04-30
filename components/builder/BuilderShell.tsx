"use client";

import { useState, useCallback } from "react";
import { BuilderTopBar } from "./BuilderTopBar";
import { QuestionSidebar } from "./QuestionSidebar";
import { QuestionCanvas } from "./QuestionCanvas";
import { QuestionSettingsPanel } from "./QuestionSettingsPanel";

export type QuestionType = "open-ended" | "closed" | "rating" | "yes-no";

export interface Question {
  id: string;
  order: number;
  prompt: string;
  description?: string;
  type: QuestionType;
  options?: string[];
  required: boolean;
  followUpBehavior: "none" | "probe-once" | "probe-until-answered";
}

interface BuilderShellProps {
  surveyId: string;
}

export function BuilderShell({ surveyId }: BuilderShellProps) {
  const [title, setTitle] = useState("Untitled Survey");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedQuestion = questions.find((q) => q.id === selectedId) ?? null;

  const addQuestion = useCallback(() => {
    const newQuestion: Question = {
      id: crypto.randomUUID(),
      order: questions.length + 1,
      prompt: "",
      type: "open-ended",
      required: false,
      followUpBehavior: "none",
    };
    setQuestions((prev) => [...prev, newQuestion]);
    setSelectedId(newQuestion.id);
  }, [questions.length]);

  const updateQuestion = useCallback((id: string, patch: Partial<Question>) => {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, ...patch } : q))
    );
  }, []);

  const deleteQuestion = useCallback(
    (id: string) => {
      setQuestions((prev) => {
        const next = prev
          .filter((q) => q.id !== id)
          .map((q, i) => ({ ...q, order: i + 1 }));
        return next;
      });
      setSelectedId((prev) => {
        if (prev !== id) return prev;
        const remaining = questions.filter((q) => q.id !== id);
        return remaining.length > 0 ? remaining[0].id : null;
      });
    },
    [questions]
  );

  const reorderQuestions = useCallback((fromIndex: number, toIndex: number) => {
    setQuestions((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next.map((q, i) => ({ ...q, order: i + 1 }));
    });
  }, []);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <BuilderTopBar
        title={title}
        onTitleChange={setTitle}
        surveyId={surveyId}
      />
      <div className="flex flex-1 overflow-hidden">
        <QuestionSidebar
          questions={questions}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onAdd={addQuestion}
          onDelete={deleteQuestion}
          onReorder={reorderQuestions}
        />
        <QuestionCanvas question={selectedQuestion} onUpdate={updateQuestion} />
        <QuestionSettingsPanel
          question={selectedQuestion}
          onUpdate={updateQuestion}
        />
      </div>
    </div>
  );
}
