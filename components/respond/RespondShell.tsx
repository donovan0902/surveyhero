'use client';

import { useState, useEffect } from 'react';
import {
  ConversationProvider,
  useConversationControls,
  useConversationMode,
  useConversationStatus,
} from '@elevenlabs/react';
import type { Callbacks, Conversation } from '@elevenlabs/client';
import { useAction, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { toast } from 'sonner';
import { RespondHeader } from './RespondHeader';
import { ConversationTranscript } from './ConversationTranscript';
import { VoiceControlPanel } from './VoiceControlPanel';

export type AgentStatus = 'idle' | 'connecting' | 'agent-speaking' | 'user-speaking' | 'processing' | 'error';

export function getAgentStatus(
  optimisticStatus: AgentStatus,
  conversationStatus: 'disconnected' | 'connecting' | 'connected' | 'error',
  mode: { isSpeaking: boolean; isListening: boolean },
): AgentStatus {
  if (optimisticStatus === 'error' || conversationStatus === 'error') return 'error';
  if (conversationStatus === 'connected') {
    if (mode.isSpeaking) return 'agent-speaking';
    if (mode.isListening) return 'user-speaking';
    return 'processing';
  }
  if (optimisticStatus === 'connecting' || conversationStatus === 'connecting') return 'connecting';
  if (conversationStatus === 'disconnected') return 'idle';
  return 'processing';
}

export interface TranscriptEntry {
  id: string;
  role: 'agent' | 'respondent';
  text: string;
  timestamp: Date;
}

interface RespondShellProps {
  surveyId: string;
}

type VoiceSession = {
  responseId: Id<'surveyResponses'>;
  signedUrl: string;
  agentId: string;
  surveyTitle: string;
  totalQuestions: number;
};

type ConversationMessage = Parameters<NonNullable<Callbacks['onMessage']>>[0];

export function RespondShell({ surveyId }: RespondShellProps) {
  return (
    <ConversationProvider>
      <RespondConversation surveyId={surveyId as Id<'surveys'>} />
    </ConversationProvider>
  );
}

function RespondConversation({ surveyId }: { surveyId: Id<'surveys'> }) {
  const { startSession, endSession } = useConversationControls();
  const { status: conversationStatus, message: statusMessage } = useConversationStatus();
  const mode = useConversationMode();
  const startVoiceResponse = useAction(api.elevenlabs.startVoiceResponse);
  const attachConversation = useMutation(api.surveyResponses.attachConversation);
  const survey = useQuery(api.surveys.get, { surveyId });

  const [status, setStatus] = useState<AgentStatus>('idle');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [session, setSession] = useState<VoiceSession | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentStatus = getAgentStatus(status, conversationStatus, mode);
  const isSessionActive = currentStatus !== 'idle' && currentStatus !== 'error';
  const progress = useQuery(
    api.surveyResponses.getRespondProgress,
    session ? { responseId: session.responseId } : 'skip',
  );
  const questions = useQuery(api.questions.listForSurvey, { surveyId });
  const totalQuestions = progress?.totalQuestions ?? session?.totalQuestions ?? questions?.length ?? 1;
  const currentQuestion = progress?.currentQuestionOrder ?? 1;

  async function handleStart() {
    setStatus('connecting');
    setErrorMessage(null);
    setTranscript([]);

    try {
      const voiceSession = await startVoiceResponse({ surveyId });
      setSession(voiceSession);

      startSession({
        signedUrl: voiceSession.signedUrl,
        userId: voiceSession.responseId,
        dynamicVariables: {
          survey_response_id: voiceSession.responseId,
          survey_id: surveyId,
        },
        onConversationCreated: (conversation: Conversation) => {
          const conversationId = conversation.getId();
          void attachConversation({
            responseId: voiceSession.responseId,
            conversationId,
          });
        },
        onConnect: () => {
          setStatus('processing');
        },
        onDisconnect: () => {
          setStatus('idle');
        },
        onMessage: appendConversationMessage,
        onError: (message) => {
          setErrorMessage(String(message));
          setStatus('error');
        },
      });
    } catch (error) {
      if (error instanceof ConvexError && typeof error.data === 'string' && error.data.includes('already completed')) {
        setStatus('idle');
        toast.error("You've already responded to this survey", {
          description: 'Each survey can only be completed once per person.',
        });
      } else {
        setErrorMessage(error instanceof Error ? error.message : 'Failed to start voice survey');
        setStatus('error');
      }
    }
  }

  async function handleStop() {
    if (conversationStatus === 'connected') {
      endSession();
    }
    setStatus('idle');
  }

  useEffect(() => {
    return () => {
      if (conversationStatus === 'connected') {
        void endSession();
      }
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
    <div className="flex h-screen flex-col bg-background">
      <RespondHeader
        title={survey?.title ?? 'Voice survey'}
        currentQuestion={Math.min(currentQuestion, totalQuestions)}
        totalQuestions={totalQuestions}
        isActive={isSessionActive}
      />
      {(errorMessage || statusMessage) && (
        <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-center text-xs text-destructive">
          {errorMessage ?? statusMessage}
        </div>
      )}
      <ConversationTranscript transcript={transcript} status={currentStatus} className="flex-1" />
      <VoiceControlPanel status={currentStatus} onStart={handleStart} onStop={handleStop} />
    </div>
  );
}

