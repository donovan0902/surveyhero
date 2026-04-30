"use client";

import { useState } from "react";
import { RespondHeader } from "./RespondHeader";
import { ConversationTranscript } from "./ConversationTranscript";
import { VoiceControlPanel } from "./VoiceControlPanel";

export type AgentStatus =
  | "idle"
  | "agent-speaking"
  | "user-speaking"
  | "processing";

export interface TranscriptEntry {
  id: string;
  role: "agent" | "respondent";
  text: string;
  timestamp: Date;
}

interface RespondShellProps {
  surveyId: string;
}

export function RespondShell({ surveyId: _surveyId }: RespondShellProps) {
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const totalQuestions = 7;

  const isSessionActive = status !== "idle";

  function handleStart() {
    setStatus("agent-speaking");
    // Simulate agent greeting after a moment
    setTimeout(() => {
      setTranscript((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "agent",
          text: "Hi there! Thanks for taking the time to speak with me today. I have a few questions for you — just speak naturally and I'll guide you through. Ready to begin?",
          timestamp: new Date(),
        },
      ]);
      setStatus("user-speaking");
    }, 1500);
  }

  function handleStop() {
    if (status === "user-speaking") {
      setStatus("processing");
      setTimeout(() => {
        setTranscript((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "respondent",
            text: "Yes, I'm ready.",
            timestamp: new Date(),
          },
        ]);
        setCurrentQuestion((q) => Math.min(q + 1, totalQuestions));
        setStatus("agent-speaking");
        setTimeout(() => {
          setTranscript((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: "agent",
              text: "On a scale of 1 to 10, how would you rate your overall satisfaction with the product?",
              timestamp: new Date(),
            },
          ]);
          setStatus("user-speaking");
        }, 1200);
      }, 800);
    } else {
      setStatus("idle");
    }
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <RespondHeader
        title="Customer Experience Survey"
        currentQuestion={currentQuestion}
        totalQuestions={totalQuestions}
        isActive={isSessionActive}
      />
      <ConversationTranscript
        transcript={transcript}
        status={status}
        className="flex-1"
      />
      <VoiceControlPanel
        status={status}
        onStart={handleStart}
        onStop={handleStop}
      />
    </div>
  );
}
