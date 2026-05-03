'use client';

import { useState, useEffect } from 'react';
import {
  ConversationProvider,
  useConversationControls,
  useConversationMode,
  useConversationStatus,
} from '@elevenlabs/react';
import type { Callbacks } from '@elevenlabs/client';
import { useAction } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { RespondHeader } from '@/components/respond/RespondHeader';
import { VoiceControlPanel } from '@/components/respond/VoiceControlPanel';
import { type AgentStatus, type TranscriptEntry, getAgentStatus } from '@/components/respond/RespondShell';

type PreviewSession = {
  signedUrl: string;
  agentId: string;
  totalQuestions: number;
};

type ConversationMessage = Parameters<NonNullable<Callbacks['onMessage']>>[0];

export function SurveyPreviewDrawer({
  surveyId,
  surveyTitle,
  open,
  onOpenChange,
}: {
  surveyId: Id<'surveys'>;
  surveyTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="flex flex-col">
        <DrawerHeader className="shrink-0 border-b pb-3">
          <div className="flex items-center justify-center gap-2 md:justify-start">
            <DrawerTitle className="text-base">Preview Survey</DrawerTitle>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              Responses not saved
            </span>
          </div>
          <DrawerDescription className="sr-only">
            Voice preview of this survey. No responses will be recorded.
          </DrawerDescription>
        </DrawerHeader>
        <ConversationProvider>
          <PreviewConversation surveyId={surveyId} surveyTitle={surveyTitle} />
        </ConversationProvider>
      </DrawerContent>
    </Drawer>
  );
}

function PreviewConversation({ surveyId, surveyTitle }: { surveyId: Id<'surveys'>; surveyTitle: string }) {
  const { startSession, endSession } = useConversationControls();
  const { status: conversationStatus, message: statusMessage } = useConversationStatus();
  const mode = useConversationMode();
  const startVoicePreview = useAction(api.elevenlabs.startVoicePreview);

  const [status, setStatus] = useState<AgentStatus>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [session, setSession] = useState<PreviewSession | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentStatus = getAgentStatus(status, conversationStatus, mode);
  const isSessionActive = currentStatus !== 'idle' && currentStatus !== 'error';
  const currentQuestion = Math.max(1, transcript.filter((e) => e.role === 'agent').length);
  const totalQuestions = session?.totalQuestions ?? 1;

  async function handleStart() {
    setStatus('connecting');
    setErrorMessage(null);
    setTranscript([]);
    try {
      const s = await startVoicePreview({ surveyId });
      setSession(s);
      startSession({
        signedUrl: s.signedUrl,
        dynamicVariables: { survey_response_id: 'preview', survey_id: surveyId },
        onConnect: () => setStatus('processing'),
        onDisconnect: () => setStatus('idle'),
        onMessage: appendConversationMessage,
        onError: (message) => {
          setErrorMessage(String(message));
          setStatus('error');
        },
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to start preview');
      setStatus('error');
    }
  }

  async function handleStop() {
    if (conversationStatus === 'connected') endSession();
    setStatus('idle');
  }

  useEffect(() => {
    return () => {
      if (conversationStatus === 'connected') void endSession();
    };
  }, [conversationStatus, endSession]);

  function appendConversationMessage(message: ConversationMessage) {
    if (!message.message) return;
    setTranscript((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: message.role === 'agent' ? 'agent' : 'respondent',
        text: message.message,
        timestamp: new Date(),
      },
    ]);
  }

  return (
    <>
      <RespondHeader
        title={surveyTitle}
        currentQuestion={Math.min(currentQuestion, totalQuestions)}
        totalQuestions={totalQuestions}
        isActive={isSessionActive}
        className="border-b-0"
      />
      {(errorMessage || statusMessage) && (
        <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-center text-xs text-destructive">
          {errorMessage ?? statusMessage}
        </div>
      )}
      <VoiceControlPanel status={currentStatus} onStart={handleStart} onStop={handleStop} />
    </>
  );
}
