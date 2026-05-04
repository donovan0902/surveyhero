import { action, internalMutation, internalQuery } from './_generated/server';
import { ConvexError, v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server';

type SurveyAgentContext = {
  survey: Doc<'surveys'>;
  questions: Doc<'questions'>[];
};

const DEFAULT_LLM = 'gemini-2.5-flash';
const DEFAULT_VOICE_ID = 'XcXEQzuLXRU9RcfWzEJt';
const MAX_DATA_COLLECTION_ITEMS = 25;

async function requireUser(ctx: MutationCtx | QueryCtx): Promise<Doc<'users'>> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error('Unauthenticated');

  const user = await ctx.db
    .query('users')
    .withIndex('by_authId', (q) => q.eq('authId', identity.subject))
    .unique();
  if (!user) throw new Error('User not found');
  return user;
}

async function getOptionalUser(ctx: MutationCtx | QueryCtx): Promise<Doc<'users'> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await ctx.db
    .query('users')
    .withIndex('by_authId', (q) => q.eq('authId', identity.subject))
    .unique();
  if (!user) throw new Error('User not found');
  return user;
}

async function listQuestions(ctx: QueryCtx, surveyId: Id<'surveys'>): Promise<Doc<'questions'>[]> {
  return ctx.db
    .query('questions')
    .withIndex('by_surveyId_and_order', (q) => q.eq('surveyId', surveyId))
    .order('asc')
    .collect();
}

export const getOwnedSurveyAgentContext = internalQuery({
  args: { surveyId: v.id('surveys') },
  handler: async (ctx, args): Promise<SurveyAgentContext> => {
    const user = await requireUser(ctx);
    const survey = await ctx.db.get(args.surveyId);
    if (!survey || survey.creatorId !== user._id) {
      throw new Error('Survey not found or access denied');
    }

    return {
      survey,
      questions: await listQuestions(ctx, args.surveyId),
    };
  },
});

export const getPublishedSurveyAgentContext = internalQuery({
  args: { surveyId: v.id('surveys') },
  handler: async (ctx, args): Promise<SurveyAgentContext> => {
    const survey = await ctx.db.get(args.surveyId);
    if (!survey || survey.status !== 'published') {
      throw new Error('Survey is not available for responses');
    }

    return {
      survey,
      questions: await listQuestions(ctx, args.surveyId),
    };
  },
});

export const saveAgentSync = internalMutation({
  args: {
    surveyId: v.id('surveys'),
    agentId: v.string(),
    configHash: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    await ctx.db.patch(args.surveyId, {
      elevenLabsAgentId: args.agentId,
      elevenLabsAgentConfigHash: args.configHash,
      elevenLabsAgentSyncedAtMs: Date.now(),
    });
  },
});

export const attachVoiceConversation = internalMutation({
  args: {
    responseId: v.id('surveyResponses'),
    conversationId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const response = await ctx.db.get(args.responseId);
    if (!response) {
      throw new Error('Survey response not found');
    }
    if (response.elevenLabsConversationId && response.elevenLabsConversationId !== args.conversationId) {
      throw new Error('Survey response already has a different ElevenLabs conversation');
    }
    if (response.elevenLabsConversationId === args.conversationId) return;

    await ctx.db.patch(args.responseId, {
      elevenLabsConversationId: args.conversationId,
    });
  },
});

export const getOrCreateVoiceResponse = internalMutation({
  args: { surveyId: v.id('surveys') },
  handler: async (
    ctx,
    args,
  ): Promise<{
    responseId: Id<'surveyResponses'>;
    respondentId?: Id<'users'>;
  }> => {
    const user = await getOptionalUser(ctx);
    const survey = await ctx.db.get(args.surveyId);
    if (!survey || survey.status !== 'published') {
      throw new Error('Survey is not available for responses');
    }

    const firstQuestion = await ctx.db
      .query('questions')
      .withIndex('by_surveyId_and_order', (q) => q.eq('surveyId', args.surveyId))
      .order('asc')
      .first();

    if (user) {
      const existing = await ctx.db
        .query('surveyResponses')
        .withIndex('by_surveyId_and_respondentId', (q) => q.eq('surveyId', args.surveyId).eq('respondentId', user._id))
        .unique();

      if (existing) {
        if (existing.status === 'completed') {
          throw new ConvexError('Survey response already completed');
        }
        // Restart an abandoned response from question 1. Existing questionResponses
        // rows from the prior attempt are NOT deleted — they will be overwritten as
        // the agent progresses. If the respondent abandons again mid-way, answers
        // beyond their stopping point will reflect the previous attempt until
        // overwritten. A future clean-restart path would delete those stale rows here.
        if (existing.status === 'abandoned') {
          await ctx.db.patch(existing._id, {
            status: 'in-progress',
            startedAtMs: Date.now(),
            ...(firstQuestion ? { currentQuestionId: firstQuestion._id } : {}),
          });
        }
        return { responseId: existing._id, respondentId: user._id };
      }
    }

    const responseId = await ctx.db.insert('surveyResponses', {
      surveyId: args.surveyId,
      ...(user ? { respondentId: user._id } : {}),
      status: 'in-progress',
      startedAtMs: Date.now(),
      ...(firstQuestion ? { currentQuestionId: firstQuestion._id } : {}),
    });

    return user ? { responseId, respondentId: user._id } : { responseId };
  },
});

// Server-tool entrypoint. The ElevenLabs agent calls this for every question
// it asks: it carries a data_collection_id (one per question) plus a raw
// string value. We validate against the question type — for closed questions
// the value must exactly match one of question.options — and persist before
// advancing currentQuestionId.
export const recordToolAnswer = internalMutation({
  args: {
    responseId: v.optional(v.string()),
    conversationId: v.optional(v.string()),
    dataCollectionId: v.string(),
    value: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    ok: boolean;
    error?: string;
    nextQuestion?: { id: Id<'questions'>; prompt: string; order: number } | null;
  }> => {
    const normalizedResponseId = args.responseId ? ctx.db.normalizeId('surveyResponses', args.responseId) : null;
    const surveyResponse = await resolveSurveyResponse(ctx, {
      responseId: normalizedResponseId ?? undefined,
      conversationId: args.conversationId,
    });
    if (!surveyResponse) {
      return { ok: false, error: 'Survey response not found' };
    }

    const questions = await ctx.db
      .query('questions')
      .withIndex('by_surveyId_and_order', (q) => q.eq('surveyId', surveyResponse.surveyId))
      .order('asc')
      .collect();

    const question = questions.find((q) => getDataCollectionId(q) === args.dataCollectionId);
    if (!question) {
      return { ok: false, error: `Unknown data_collection_id: ${args.dataCollectionId}` };
    }

    const validation = validateAndCoerceValue(question, args.value);
    if (!validation.ok) {
      return { ok: false, error: validation.error };
    }

    await upsertQuestionAnswer(ctx, {
      surveyResponse,
      question,
      dataCollectionId: args.dataCollectionId,
      response: validation.normalized,
    });

    const nextQuestion = questions.find((q) => q.order > question.order) ?? null;
    await ctx.db.patch(surveyResponse._id, {
      currentQuestionId: nextQuestion ? nextQuestion._id : question._id,
      ...(args.conversationId && !surveyResponse.elevenLabsConversationId
        ? { elevenLabsConversationId: args.conversationId }
        : {}),
    });

    return {
      ok: true,
      nextQuestion: nextQuestion
        ? { id: nextQuestion._id, prompt: nextQuestion.prompt, order: nextQuestion.order }
        : null,
    };
  },
});

async function resolveSurveyResponse(
  ctx: MutationCtx,
  args: { responseId?: Id<'surveyResponses'>; conversationId?: string },
): Promise<Doc<'surveyResponses'> | null> {
  if (args.conversationId) {
    const byConversation = await ctx.db
      .query('surveyResponses')
      .withIndex('by_elevenLabsConversationId', (q) => q.eq('elevenLabsConversationId', args.conversationId))
      .unique();
    if (byConversation) return byConversation;
  }
  if (args.responseId) {
    return ctx.db.get(args.responseId);
  }
  return null;
}

type Validation = { ok: true; normalized: string } | { ok: false; error: string };

function validateAndCoerceValue(question: Doc<'questions'>, raw: string): Validation {
  const trimmed = raw.trim();
  if (trimmed === '') {
    if (question.required) {
      return { ok: false, error: 'Empty answer not allowed for required question' };
    }
    return { ok: true, normalized: '' };
  }

  if (question.type === 'closed') {
    const options = question.options ?? [];
    const exact = options.find((option) => option === trimmed);
    if (exact) return { ok: true, normalized: exact };
    const lower = trimmed.toLowerCase();
    const caseInsensitive = options.find((option) => option.toLowerCase() === lower);
    if (caseInsensitive) return { ok: true, normalized: caseInsensitive };
    return {
      ok: false,
      error: `Value "${trimmed}" is not one of the configured options: ${options.join(', ')}`,
    };
  }

  if (question.type === 'yes-no') {
    const lower = trimmed.toLowerCase();
    if (['yes', 'true', 'y', '1'].includes(lower)) return { ok: true, normalized: 'true' };
    if (['no', 'false', 'n', '0'].includes(lower)) return { ok: true, normalized: 'false' };
    return { ok: false, error: `Value "${trimmed}" is not a yes/no answer` };
  }

  if (question.type === 'rating') {
    const parsed = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(parsed)) {
      return { ok: false, error: `Value "${trimmed}" is not an integer rating` };
    }
    return { ok: true, normalized: String(parsed) };
  }

  return { ok: true, normalized: trimmed };
}

export const handlePostCallWebhook = internalMutation({
  args: {
    agentId: v.string(),
    conversationId: v.string(),
    responseIdFromElevenLabsUserId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    await ingestPostCallWebhook(ctx, args);
  },
});

// Two paths write to questionResponses:
//
//   1. recordToolAnswer (mid-call, server tool) — source of truth for all
//      question answers. Validates per type, advances currentQuestionId.
//
//   2. ingestPostCallWebhook (post-call) — session lifecycle only.
//      Decides completed vs abandoned based on required-question coverage,
//      then sets status / completedAtMs / analysisReceivedAtMs.
//      Does NOT write any answers.
async function ingestPostCallWebhook(
  ctx: MutationCtx,
  args: {
    agentId: string;
    conversationId: string;
    responseIdFromElevenLabsUserId?: string;
  },
): Promise<void> {
  const surveyResponse = await resolveSurveyResponseForWebhook(ctx, args);
  if (!surveyResponse) {
    console.log('No survey response found for webhook (likely a preview call) — skipping.');
    return;
  }

  const survey = await ctx.db.get(surveyResponse.surveyId);
  if (!survey || survey.elevenLabsAgentId !== args.agentId) {
    throw new Error('Webhook agent does not match survey agent');
  }

  const questions = await listQuestions(ctx, surveyResponse.surveyId);

  await finalizeSurveyResponse(ctx, {
    surveyResponse,
    questions,
    conversationId: args.conversationId,
  });
}

async function resolveSurveyResponseForWebhook(
  ctx: MutationCtx,
  args: { conversationId: string; responseIdFromElevenLabsUserId?: string },
): Promise<Doc<'surveyResponses'> | null> {
  const byConversationId = await ctx.db
    .query('surveyResponses')
    .withIndex('by_elevenLabsConversationId', (q) => q.eq('elevenLabsConversationId', args.conversationId))
    .unique();
  if (byConversationId) return byConversationId;

  const normalizedId = args.responseIdFromElevenLabsUserId
    ? ctx.db.normalizeId('surveyResponses', args.responseIdFromElevenLabsUserId)
    : null;
  return normalizedId ? ctx.db.get(normalizedId) : null;
}

async function finalizeSurveyResponse(
  ctx: MutationCtx,
  args: {
    surveyResponse: Doc<'surveyResponses'>;
    questions: Doc<'questions'>[];
    conversationId: string;
  },
): Promise<void> {
  const answers = await ctx.db
    .query('questionResponses')
    .withIndex('by_surveyResponseId', (q) => q.eq('surveyResponseId', args.surveyResponse._id))
    .collect();

  const answersByQuestionId = new Map(answers.map((a) => [a.questionId, a]));
  const allRequired = hasAllRequiredAnswers(args.questions, answersByQuestionId);

  await ctx.db.patch(args.surveyResponse._id, {
    status: allRequired ? 'completed' : 'abandoned',
    ...(allRequired ? { completedAtMs: Date.now() } : {}),
    analysisReceivedAtMs: Date.now(),
    elevenLabsConversationId: args.conversationId,
    currentQuestionId: undefined,
  });
}

function hasAllRequiredAnswers(
  questions: Doc<'questions'>[],
  answersByQuestionId: Map<Id<'questions'>, Doc<'questionResponses'>>,
): boolean {
  return questions
    .filter((q) => q.required)
    .every((q) => {
      const a = answersByQuestionId.get(q._id);
      return a !== undefined && a.response.trim() !== '';
    });
}

async function upsertQuestionAnswer(
  ctx: MutationCtx,
  args: {
    surveyResponse: Doc<'surveyResponses'>;
    question: Doc<'questions'>;
    dataCollectionId: string;
    response: string;
  },
): Promise<Id<'questionResponses'> | null> {
  const { surveyResponse, question, dataCollectionId, response } = args;

  const existing = await ctx.db
    .query('questionResponses')
    .withIndex('by_surveyResponseId_and_questionId', (q) =>
      q.eq('surveyResponseId', surveyResponse._id).eq('questionId', question._id),
    )
    .unique();

  const fields = {
    surveyResponseId: surveyResponse._id,
    questionId: question._id,
    surveyId: surveyResponse.surveyId,
    ...(surveyResponse.respondentId ? { respondentId: surveyResponse.respondentId } : {}),
    response,
    dataCollectionId,
  };

  let questionResponseId: Id<'questionResponses'>;
  if (existing) {
    await ctx.db.patch(existing._id, fields);
    questionResponseId = existing._id;
  } else {
    questionResponseId = await ctx.db.insert('questionResponses', fields);
  }

  if (question.type === 'open-ended') {
    await ctx.scheduler.runAfter(0, internal.aggregations.extractThemesForResponse, {
      questionResponseId,
    });
  }

  return questionResponseId;
}

export const syncAgentForSurvey = action({
  args: { surveyId: v.id('surveys') },
  handler: async (ctx, args): Promise<{ agentId: string; configHash: string; synced: boolean }> => {
    const context = await ctx.runQuery(internal.elevenlabs.getOwnedSurveyAgentContext, { surveyId: args.surveyId });

    return syncSurveyAgent(ctx, context);
  },
});

export const startVoicePreview = action({
  args: { surveyId: v.id('surveys') },
  handler: async (
    ctx,
    args,
  ): Promise<{
    signedUrl: string;
    agentId: string;
    surveyTitle: string;
    totalQuestions: number;
  }> => {
    const context = await ctx.runQuery(internal.elevenlabs.getOwnedSurveyAgentContext, { surveyId: args.surveyId });
    const { agentId } = await syncSurveyAgent(ctx, context);
    const { signedUrl } = await getSignedUrl(agentId);
    return {
      signedUrl,
      agentId,
      surveyTitle: context.survey.title,
      totalQuestions: context.questions.length,
    };
  },
});

export const startVoiceResponse = action({
  args: { surveyId: v.id('surveys') },
  handler: async (
    ctx,
    args,
  ): Promise<{
    responseId: Id<'surveyResponses'>;
    signedUrl: string;
    agentId: string;
    surveyTitle: string;
    totalQuestions: number;
  }> => {
    const context = await ctx.runQuery(internal.elevenlabs.getPublishedSurveyAgentContext, { surveyId: args.surveyId });
    const { agentId } = await syncSurveyAgent(ctx, context);
    const response = await ctx.runMutation(internal.elevenlabs.getOrCreateVoiceResponse, { surveyId: args.surveyId });
    const { signedUrl, conversationId } = await getSignedUrl(agentId, { includeConversationId: true });
    if (conversationId) {
      await ctx.runMutation(internal.elevenlabs.attachVoiceConversation, {
        responseId: response.responseId,
        conversationId,
      });
    }

    return {
      responseId: response.responseId,
      signedUrl,
      agentId,
      surveyTitle: context.survey.title,
      totalQuestions: context.questions.length,
    };
  },
});

async function syncSurveyAgent(
  ctx: ActionCtx,
  context: SurveyAgentContext,
): Promise<{ agentId: string; configHash: string; synced: boolean }> {
  const body = buildAgentCreateRequest(context);
  const configHash = stableHash(body);

  if (context.survey.elevenLabsAgentId && context.survey.elevenLabsAgentConfigHash === configHash) {
    return {
      agentId: context.survey.elevenLabsAgentId,
      configHash,
      synced: false,
    };
  }

  const agentId = await upsertElevenLabsAgent(context.survey.elevenLabsAgentId, body);

  await ctx.runMutation(internal.elevenlabs.saveAgentSync, {
    surveyId: context.survey._id,
    agentId,
    configHash,
  });

  return { agentId, configHash, synced: true };
}

function buildAgentCreateRequest(context: SurveyAgentContext): Record<string, unknown> {
  const { survey, questions } = context;
  if (questions.length === 0) {
    throw new Error('Cannot create a voice agent for a survey with no questions');
  }
  if (questions.length > MAX_DATA_COLLECTION_ITEMS) {
    throw new Error(
      `ElevenLabs data collection supports up to ${MAX_DATA_COLLECTION_ITEMS} questions in this v1 integration`,
    );
  }

  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!siteUrl) {
    throw new Error('CONVEX_SITE_URL is not configured');
  }
  const toolSecret = process.env.ELEVENLABS_TOOL_SECRET;
  if (!toolSecret) {
    throw new Error('ELEVENLABS_TOOL_SECRET is not configured');
  }

  return {
    name: `SurveyHero - ${survey.title}`,
    tags: ['surveyhero', `survey_${survey._id}`],
    conversation_config: {
      agent: {
        first_message: `Thanks for taking the survey. I'll ask a few questions and keep track of your answers. First question: ${questions[0].prompt}`,
        language: 'en',
        prompt: {
          prompt: buildSurveyPrompt(survey, questions),
          llm: process.env.ELEVENLABS_AGENT_LLM ?? DEFAULT_LLM,
          temperature: 0.5,
          tools: [buildRecordAnswerTool(siteUrl, toolSecret, questions)],
          built_in_tools: {
            end_call: {
              name: 'end_call',
              description: '',
              response_timeout_secs: 20,
              type: 'system',
              params: {
                system_tool_type: 'end_call',
              },
            },
          },
        },
      },
      tts: {
        voice_id: process.env.ELEVENLABS_VOICE_ID ?? DEFAULT_VOICE_ID,
        model_id: 'eleven_v3_conversational',
      },
    },
    platform_settings: {
      auth: {
        enable_auth: true,
      },
    },
  };
}

function buildRecordAnswerTool(
  siteUrl: string,
  toolSecret: string,
  questions: Doc<'questions'>[],
): Record<string, unknown> {
  const dataCollectionIds = questions.map((question) => getDataCollectionId(question));
  const valueGuidance = questions
    .map((question) => {
      const id = getDataCollectionId(question);
      if (question.type === 'closed' && question.options?.length) {
        return `- ${id} (closed): pass exactly one of: ${question.options.join(' | ')}`;
      }
      if (question.type === 'yes-no') {
        return `- ${id} (yes-no): pass "yes" or "no"`;
      }
      if (question.type === 'rating') {
        return `- ${id} (rating): pass an integer like "4"`;
      }
      return `- ${id} (open-ended): pass the respondent's answer in their own words, concise`;
    })
    .join('\n');

  return {
    type: 'webhook',
    name: 'record_answer',
    description: [
      "Record the respondent's answer to the current survey question and advance progress.",
      'Call this exactly once after the respondent has given their answer to a question, before moving on.',
      'For closed questions you MUST pass one of the configured options verbatim — pick the option whose meaning best matches what the respondent said.',
      'If the respondent declines or skips, pass an empty string for value.',
      'Per-question value guidance:',
      valueGuidance,
    ].join('\n'),
    response_timeout_secs: 10,
    api_schema: {
      url: `${siteUrl}/elevenlabs/tools/record-answer`,
      method: 'POST',
      request_headers: {
        'X-SurveyHero-Secret': toolSecret,
      },
      content_type: 'application/json',
      request_body_schema: {
        type: 'object',
        required: ['data_collection_id', 'value'],
        properties: {
          data_collection_id: {
            type: 'string',
            description: 'The data_collection_id of the question being answered.',
            enum: dataCollectionIds,
          },
          value: {
            type: 'string',
            description:
              "The respondent's answer. For closed questions this must be one of the configured options verbatim. For yes-no use 'yes' or 'no'. For rating use the integer as a string. Use an empty string if the respondent declined.",
          },
        },
      },
    },
  };
}

function buildSurveyPrompt(survey: Doc<'surveys'>, questions: Doc<'questions'>[]): string {
  return [
    '# Role',
    'You are a voice survey interviewer for SurveyHero. Your job is to collect the respondent\'s answers accurately, one question at a time.',

    '# Interview Style',
    '- Ask questions in the exact order listed under Survey Questions.',
    '- Keep the conversation natural, concise, and neutral.',
    '- Do not answer questions on behalf of the respondent.',
    '- Do not invent or infer survey answers when the respondent has not provided one.',
    '- If the respondent asks for clarification, briefly explain the current question without changing its meaning.',

    '# Recording Answers',
    '- After the respondent answers a question, call record_answer exactly once before moving to the next question.',
    '- Use the question\'s data_collection_id exactly as shown.',
    '- For closed questions, pass exactly one configured option verbatim. Pick the option whose meaning best matches the respondent\'s answer.',
    '- For yes-no questions, pass exactly "yes" or "no".',
    '- For rating questions, pass the rating as an integer string, for example "4".',
    '- For open-ended questions, pass a concise answer in the respondent\'s own words.',
    '- If the respondent explicitly declines or skips a question, pass an empty string.',
    '- If record_answer returns ok=false, briefly re-ask the current question for a clearer answer, then call record_answer again.',
    '- After the final question is recorded successfully, thank the respondent and end the conversation.',

    '# Survey',
    `Title: ${survey.title}`,
    survey.description ? `Description: ${survey.description}` : null,

    '# Survey Questions',
    questions.map((question) => buildQuestionPromptBlock(question)).join('\n\n'),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildQuestionPromptBlock(question: Doc<'questions'>): string {
  const lines = [
    `Question ${question.order}`,
    `data_collection_id: ${getDataCollectionId(question)}`,
    `prompt: ${question.prompt}`,
    question.description ? `context: ${question.description}` : null,
    `type: ${question.type}`,
    `required: ${question.required ? 'yes' : 'no'}`,
    getOptionsInstruction(question),
    `answer_format: ${getAnswerFormatInstruction(question)}`,
    `follow_up: ${getFollowUpInstruction(question.followUpBehavior)}`,
  ];

  return lines.filter(Boolean).join('\n');
}

function getOptionsInstruction(question: Doc<'questions'>): string | null {
  if (question.type !== 'closed' || !question.options?.length) {
    return null;
  }

  return `options: ${question.options.map((option) => `"${option}"`).join(' | ')}`;
}

function getAnswerFormatInstruction(question: Doc<'questions'>): string {
  if (question.type === 'closed') {
    return 'Record exactly one configured option verbatim.';
  }
  if (question.type === 'yes-no') {
    return 'Record exactly "yes" or "no".';
  }
  if (question.type === 'rating') {
    return 'Record an integer string.';
  }
  return 'Record a concise answer in the respondent\'s own words.';
}

function getFollowUpInstruction(behavior: Doc<'questions'>['followUpBehavior']): string {
  if (behavior === 'probe-once') {
    return 'Ask at most one clarifying follow-up if the answer is incomplete.';
  }
  if (behavior === 'probe-until-answered') {
    return 'Continue with brief clarifying follow-ups until the respondent gives an answer or explicitly declines.';
  }
  return 'Do not ask a follow-up unless the respondent asks for clarification.';
}

function getDataCollectionId(question: Doc<'questions'>): string {
  const idSuffix = question._id.replace(/[^a-zA-Z0-9_]/g, '_').slice(-12);
  return `q${question.order}_${idSuffix}`;
}

async function upsertElevenLabsAgent(
  existingAgentId: string | undefined,
  body: Record<string, unknown>,
): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured');

  const url = existingAgentId
    ? `https://api.elevenlabs.io/v1/convai/agents/${existingAgentId}?enable_versioning_if_not_enabled=true`
    : 'https://api.elevenlabs.io/v1/convai/agents/create?enable_versioning=true';

  const response = await fetch(url, {
    method: existingAgentId ? 'PATCH' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs agent sync failed (${response.status}): ${await response.text()}`);
  }

  const json = (await response.json()) as { agent_id?: string };
  if (!json.agent_id) throw new Error('ElevenLabs did not return an agent_id');
  return json.agent_id;
}

async function getSignedUrl(
  agentId: string,
  options: { includeConversationId?: boolean } = {},
): Promise<{ signedUrl: string; conversationId?: string }> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured');

  const url = new URL('https://api.elevenlabs.io/v1/convai/conversation/get-signed-url');
  url.searchParams.set('agent_id', agentId);
  if (options.includeConversationId) {
    url.searchParams.set('include_conversation_id', 'true');
  }

  const response = await fetch(url, {
    headers: { 'xi-api-key': apiKey },
  });

  if (!response.ok) {
    throw new Error(`ElevenLabs signed URL request failed (${response.status}): ${await response.text()}`);
  }

  const json = (await response.json()) as { signed_url?: string };
  if (!json.signed_url) {
    throw new Error('ElevenLabs did not return a signed_url');
  }
  return {
    signedUrl: json.signed_url,
    conversationId: getConversationIdFromSignedUrl(json.signed_url),
  };
}

function getConversationIdFromSignedUrl(signedUrl: string): string | undefined {
  try {
    const url = new URL(signedUrl);
    return url.searchParams.get('conversation_id') ?? undefined;
  } catch {
    return undefined;
  }
}

function stableHash(value: unknown): string {
  const input = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
}
